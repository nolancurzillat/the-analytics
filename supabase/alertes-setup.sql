-- The Analytics : mise en place des alertes par e-mail (à exécuter UNE fois dans Supabase, SQL Editor).
-- Voir supabase/LISEZ-MOI-alertes.md pour les étapes complètes.

-- 1) Table qui mémorise quelles alertes ont déjà donné lieu à un e-mail (pour ne jamais prévenir deux fois).
--    Aucune politique d'accès : seule la fonction serveur (clé de service) peut y lire et y écrire.
create table if not exists public.alert_notifs (
  user_id uuid not null references auth.users(id) on delete cascade,
  alert_id text not null,
  fired boolean not null default false,
  notified_at timestamptz,
  primary key (user_id, alert_id)
);
alter table public.alert_notifs enable row level security;

-- 2) Extensions pour le déclenchement automatique (si une erreur apparaît, activez-les dans Database, Extensions).
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- 3) Déclenchement toutes les 20 minutes de 13 h à 21 h (heure UTC), du lundi au vendredi : couvre la séance américaine, été comme hiver.
--    REMPLACEZ le texte REMPLACER_PAR_VOTRE_SECRET par le MÊME secret que celui enregistré sous le nom CRON_SECRET dans les secrets de la fonction.
select cron.schedule(
  'check-alerts',
  '*/20 13-21 * * 1-5',
  $$
  select net.http_post(
    url := 'https://coygikeasyfiwuskfbqh.supabase.co/functions/v1/check-alerts',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'REMPLACER_PAR_VOTRE_SECRET'),
    body := '{}'::jsonb
  );
  $$
);

-- Pour arrêter les alertes plus tard :  select cron.unschedule('check-alerts');
