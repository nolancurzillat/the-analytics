// The Analytics : vérification des alertes de cours et envoi des e-mails (fonction Supabase, Deno).
//
// Déclenchée toutes les 20 minutes par pg_cron (voir ../../alertes-setup.sql). Pour chaque compte qui a coché « Alertes par e-mail » :
//  1. lit ses analyses dans la table user_data (même données que l'application) ;
//  2. récupère le cours des tickers qui ont au moins une alerte active, avec la clé Twelve Data DU COMPTE ;
//  3. évalue les alertes liées au cours (cours sous/au-dessus, prix cible, marge de sécurité, gain/recul de position) ;
//  4. envoie UN e-mail par compte avec les alertes nouvellement déclenchées, et mémorise l'état dans alert_notifs
//     pour ne jamais prévenir deux fois (l'alerte se réarme quand sa condition redevient fausse).
//
// L'alerte « score global » n'est pas gérée ici : le score ne change que quand l'utilisateur modifie sa fiche, donc l'application suffit.
// Secrets à définir dans Supabase (Edge Functions, Secrets) : CRON_SECRET, SMTP_USER, SMTP_PASS (et facultatif MAIL_FROM).
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement par Supabase. Aucun secret n'est écrit dans ce fichier.
//
// Appel de test sans envoi : POST .../functions/v1/check-alerts?dry=1 avec l'en-tête x-cron-secret.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';
const SMTP_USER = Deno.env.get('SMTP_USER') ?? '';
const SMTP_PASS = Deno.env.get('SMTP_PASS') ?? '';
const MAIL_FROM = Deno.env.get('MAIL_FROM') ?? `The Analytics <${SMTP_USER}>`;

const MAX_QUOTES_PER_USER = 8; // le compte gratuit de Twelve Data accepte 8 requêtes par minute
const PRICE_TYPES = new Set(['priceBelow', 'priceAbove', 'target', 'safety', 'posGain', 'posLoss']);
const MIC: Record<string, string> = { 'NASDAQ': 'XNGS', 'NYSE': 'XNYS' }; // bourses couvertes par le compte gratuit (dollar)

// deno-lint-ignore no-explicit-any
type Any = any;

function num(v: Any): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/\s/g, '').replace(',', '.').replace(/[^0-9.\-]/g, '');
  if (!s) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}
const esc = (s: Any) => String(s).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m] as string));
const fmt = (n: number, d = 2) => n.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: d });

const LABELS: Record<string, string> = {
  priceBelow: 'Le cours passe sous',
  priceAbove: 'Le cours passe au-dessus de',
  target: "Le cours atteint mon prix d'achat cible",
  safety: 'La marge de sécurité atteint',
  posGain: 'Ma position gagne au moins',
  posLoss: "Ma position recule d'au moins",
};
function alertText(a: Any, cur: string): string {
  const l = LABELS[a.type] ?? a.type;
  if (a.type === 'priceBelow' || a.type === 'priceAbove') return `${l} ${fmt(Number(a.value))} ${cur}`;
  if (a.type === 'target') return l;
  return `${l} ${fmt(Number(a.value), 1)} %`;
}

// Même convention que l'application (computeEcart) : négatif = sous-évaluation ; marge de sécurité = −écart
function ecart(price: number, value: number): number | null {
  if (!(value > 0)) return null;
  return price < value ? ((price - value) / value) * 100 : ((price - value) / price) * 100;
}
function condition(a: Any, c: Any, price: number): boolean {
  const v = Number(a.value);
  switch (a.type) {
    case 'priceBelow': return Number.isFinite(v) && price <= v;
    case 'priceAbove': return Number.isFinite(v) && price >= v;
    case 'target': { const t = num(c.fields?.personnelle?.prixAchatCible); return t !== null && t > 0 && price <= t; }
    case 'safety': { const val = num(c.fields?.valorisation?.valeurIntrinseque); const e = val === null ? null : ecart(price, val); return e !== null && Number.isFinite(v) && -e >= v; }
    case 'posGain': case 'posLoss': {
      const p = c.position;
      const buy = p && p.active ? num(p.prixAchat) : null;
      if (buy === null || buy <= 0) return false;
      const pct = ((price - buy) / buy) * 100;
      return a.type === 'posGain' ? Number.isFinite(v) && pct >= v : Number.isFinite(v) && pct <= -v;
    }
  }
  return false;
}

async function quote(symbol: string, mic: string | undefined, key: string): Promise<{ price: number; currency: string } | null> {
  try {
    let url = `https://api.twelvedata.com/quote?symbol=${encodeURIComponent(symbol)}&apikey=${encodeURIComponent(key)}`;
    if (mic) url += `&mic_code=${encodeURIComponent(mic)}`;
    const r = await fetch(url);
    const d = await r.json();
    if (!d || d.status === 'error') return null;
    const price = num(d.close);
    return price === null ? null : { price, currency: String(d.currency ?? '').toUpperCase() };
  } catch (_e) {
    return null;
  }
}

Deno.serve(async (req) => {
  if (!CRON_SECRET || req.headers.get('x-cron-secret') !== CRON_SECRET) return new Response('forbidden', { status: 403 });
  const dry = new URL(req.url).searchParams.get('dry') === '1';
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: rows, error } = await sb.from('user_data').select('user_id, data').eq('data->settings->>alertEmails', 'true');
  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  const slot = Math.floor(Date.now() / (20 * 60 * 1000)); // fait tourner les tickers si un compte en a plus de 8
  const report: Any[] = [];

  for (const row of rows ?? []) {
    const uid: string = row.user_id;
    const data: Any = row.data ?? {};
    const key = String(data.settings?.twelveDataApiKey ?? '').trim();
    const companies: Any[] = Array.isArray(data.companies) ? data.companies : [];
    if (!key) { report.push({ uid, skipped: 'pas de clé Twelve Data' }); continue; }

    // Analyses en dollars avec un ticker et au moins une alerte active liée au cours
    const todo = companies.filter((c) => {
      const t = String(c.fields?.identite?.ticker ?? '').trim();
      const cot = String(c.fields?.identite?.cotation ?? '');
      const okExchange = !cot || cot.startsWith('NASDAQ') || cot.startsWith('NYSE');
      return t && c.currency === '$' && okExchange && Array.isArray(c.alerts) && c.alerts.some((a: Any) => a && a.on !== false && PRICE_TYPES.has(a.type));
    });
    if (!todo.length) continue;
    const start = todo.length > MAX_QUOTES_PER_USER ? slot % todo.length : 0;
    const batch = Array.from({ length: Math.min(todo.length, MAX_QUOTES_PER_USER) }, (_, i) => todo[(start + i) % todo.length]);

    const { data: stateRows } = await sb.from('alert_notifs').select('alert_id, fired').eq('user_id', uid);
    const firedBefore = new Map<string, boolean>((stateRows ?? []).map((s: Any): [string, boolean] => [s.alert_id, !!s.fired]));
    const fresh: { c: Any; a: Any; price: number }[] = [];
    const rearm: string[] = [];

    for (const c of batch) {
      const ticker = String(c.fields.identite.ticker).trim().toUpperCase();
      const cot = String(c.fields.identite.cotation ?? '');
      const mic = Object.keys(MIC).find((k) => cot.startsWith(k));
      const q = await quote(ticker, mic ? MIC[mic] : undefined, key);
      if (!q || q.currency !== 'USD') continue; // cours introuvable ou autre devise : on ne touche à rien
      for (const a of c.alerts) {
        if (!a || a.on === false || !PRICE_TYPES.has(a.type) || typeof a.id !== 'string') continue;
        const ok = condition(a, c, q.price);
        const was = firedBefore.get(a.id) === true;
        if (ok && !was) fresh.push({ c, a, price: q.price });
        else if (!ok && was) rearm.push(a.id);
      }
    }

    let sent = false;
    if (fresh.length && !dry) {
      const { data: u } = await sb.auth.admin.getUserById(uid);
      const to = u?.user?.email;
      if (to && SMTP_USER && SMTP_PASS) {
        const lines = fresh.map(({ c, a, price }) => `${c.name || 'Analyse'} (${String(c.fields.identite.ticker).toUpperCase()}) : ${alertText(a, '$')} · cours actuel ${fmt(price)} $`);
        const subject = fresh.length === 1 ? `The Analytics : alerte sur ${fresh[0].c.name || 'une analyse'}` : `The Analytics : ${fresh.length} alertes déclenchées`;
        const text = `Bonjour,\n\n${lines.join('\n')}\n\nCes rappels sont calculés avec vos propres chiffres : ce n'est jamais un conseil d'achat ou de vente.\nPour ne plus recevoir ces e-mails : Mon espace, Préférences, Alertes par e-mail.\n\nThe Analytics`;
        const html = `<div style="font-family:Arial,sans-serif;color:#17294e;max-width:520px"><h2 style="margin:0 0 12px">${esc(subject)}</h2><ul style="padding-left:18px;line-height:1.6">${fresh.map(({ c, a, price }) => `<li><strong>${esc(c.name || 'Analyse')}</strong> (${esc(String(c.fields.identite.ticker).toUpperCase())}) : ${esc(alertText(a, '$'))} · cours actuel ${esc(fmt(price))} $</li>`).join('')}</ul><p style="color:#5b6b8c;font-size:13px">Ces rappels sont calculés avec vos propres chiffres : ce n'est jamais un conseil d'achat ou de vente.<br>Pour ne plus recevoir ces e-mails : Mon espace, Préférences, Alertes par e-mail.</p></div>`;
        const client = new SMTPClient({ connection: { hostname: 'smtp.gmail.com', port: 465, tls: true, auth: { username: SMTP_USER, password: SMTP_PASS } } });
        try { await client.send({ from: MAIL_FROM, to, subject, content: text, html }); sent = true; } catch (e) { report.push({ uid, mailError: String(e) }); }
        try { await client.close(); } catch (_e) { /* ignoré */ }
      }
    }
    if (!dry) {
      const now = new Date().toISOString();
      // On ne mémorise « déjà prévenu » qu'après un envoi réussi : un échec d'envoi est retenté au passage suivant
      if (sent) await sb.from('alert_notifs').upsert(fresh.map(({ a }) => ({ user_id: uid, alert_id: a.id, fired: true, notified_at: now })));
      if (rearm.length) await sb.from('alert_notifs').upsert(rearm.map((id) => ({ user_id: uid, alert_id: id, fired: false })));
    }
    report.push({ uid, checked: batch.length, newlyFired: fresh.map(({ c, a, price }) => ({ company: c.name, alert: alertText(a, '$'), price })), rearmed: rearm.length, sent });
  }
  return new Response(JSON.stringify({ dry, users: report }), { headers: { 'Content-Type': 'application/json' } });
});
