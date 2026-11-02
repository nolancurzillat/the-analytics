-- Tableau de bord The Analytics : requêtes en LECTURE SEULE, à coller dans Supabase, SQL Editor (une requête à la fois, puis « Run »).
-- Elles ne modifient rien et ne renvoient que des COMPTEURS : aucune adresse e-mail, aucun contenu d'analyse, aucune clé API.
-- Astuce : après avoir collé une requête, enregistrez-la (nom en haut de l'éditeur) pour la retrouver chaque jour dans vos requêtes sauvegardées.
-- Ne créez jamais de « vue » ou de fonction à partir de ces requêtes : elles lisent le schéma auth, et une vue publique pourrait être exposée par l'API.

-- ============================================================
-- 1. RÉSUMÉ : où en est le site aujourd'hui (une seule ligne)
-- ============================================================
select
  (select count(*) from auth.users)                                                                  as comptes_total,
  (select count(*) from auth.users where email_confirmed_at is not null)                             as comptes_confirmes,
  (select count(*) from auth.users where created_at > now() - interval '7 days')                     as nouveaux_7j,
  (select count(*) from auth.users where created_at > now() - interval '30 days')                    as nouveaux_30j,
  -- « actifs » = comptes dont les analyses ont réellement changé (la synchro n'écrit que s'il y a du nouveau) ; plus fiable que la dernière connexion,
  -- car l'application garde la session ouverte sans se reconnecter.
  (select count(*) from public.user_data where updated_at > now() - interval '7 days')               as actifs_7j,
  (select count(*) from public.user_data where updated_at > now() - interval '30 days')              as actifs_30j,
  (select coalesce(sum(jsonb_array_length(data->'companies')), 0) from public.user_data
     where jsonb_typeof(data->'companies') = 'array')                                                as analyses_total,
  (select round(avg(jsonb_array_length(data->'companies')), 1) from public.user_data
     where jsonb_typeof(data->'companies') = 'array')                                                as analyses_par_compte,
  (select count(*) from public.shared_analyses)                                                      as liens_partage_actifs,
  pg_size_pretty(pg_total_relation_size('public.user_data'))                                         as taille_donnees_utilisateurs,
  pg_size_pretty(pg_database_size(current_database()))                                               as taille_base_totale;

-- ============================================================
-- 2. INSCRIPTIONS PAR JOUR (30 derniers jours)
-- ============================================================
select date_trunc('day', created_at)::date as jour, count(*) as inscriptions
from auth.users
where created_at > now() - interval '30 days'
group by 1
order by 1 desc;

-- ============================================================
-- 3. COMBIEN D'ANALYSES PAR COMPTE (pour voir si les gens s'en servent vraiment)
-- ============================================================
select
  case when n = 0 then '0 analyse'
       when n <= 2 then '1 à 2'
       when n <= 5 then '3 à 5'
       when n <= 10 then '6 à 10'
       else 'plus de 10' end as tranche,
  count(*) as comptes
from (
  select jsonb_array_length(data->'companies') as n
  from public.user_data
  where jsonb_typeof(data->'companies') = 'array'
) t
group by 1
order by min(n);

-- ============================================================
-- 4. ADOPTION DU PRIX AUTOMATIQUE (présence d'une clé seulement, la clé elle-même n'est jamais lue)
-- ============================================================
select
  count(*)                                                                                     as comptes_avec_donnees,
  count(*) filter (where coalesce(data->'settings'->>'twelveDataApiKey', '') <> '')            as avec_cle_twelve_data,
  count(*) filter (where coalesce(data->'settings'->>'alphaVantageApiKey', '') <> '')          as avec_cle_alpha_vantage
from public.user_data;

-- ============================================================
-- 5. DERNIÈRE ACTIVITÉ : combien de comptes ont eu leur dernière modification tel jour (14 derniers jours)
--    (une ligne par compte, donc chaque compte n'est compté qu'une fois, à la date de sa dernière modification)
-- ============================================================
select date_trunc('day', updated_at)::date as jour_derniere_activite, count(*) as comptes
from public.user_data
where updated_at > now() - interval '14 days'
group by 1
order by 1 desc;

-- ============================================================
-- 6. NOMBRE DE VISITES : aujourd'hui, 7 derniers jours, 30 derniers jours, total depuis le début
--    (« aujourd'hui » = depuis minuit, heure de Paris ; une visite = une ouverture du site, une seule par session)
--    (nécessite d'avoir exécuté supabase/visites-setup.sql une fois)
-- ============================================================
select
  count(*) filter (where kind = 'visit' and created_at >= (date_trunc('day', now() at time zone 'Europe/Paris') at time zone 'Europe/Paris')) as aujourdhui,
  count(*) filter (where kind = 'visit' and created_at > now() - interval '7 days')                                                          as sept_derniers_jours,
  count(*) filter (where kind = 'visit' and created_at > now() - interval '30 days')                                                         as trente_derniers_jours,
  count(*) filter (where kind = 'visit')                                                                                                     as total_depuis_le_debut,
  count(*) filter (where kind = 'example')                                                                                                   as exemples_ouverts_total
from public.page_views;


-- ============================================================
-- 7. FRÉQUENTATION : visites et exemples ouverts, par jour (30 derniers jours)
--    (nécessite d'avoir exécuté supabase/visites-setup.sql une fois)
-- ============================================================
select created_at::date as jour,
       count(*) filter (where kind = 'visit')   as visites,
       count(*) filter (where kind = 'example') as exemples_ouverts
from public.page_views
where created_at > now() - interval '30 days'
group by 1 order by 1 desc;

-- ============================================================
-- 8. D'OÙ VIENNENT LES VISITES : par étiquette de lien (?r=nom), sinon par site d'origine
--    Astuce : envoyez à chaque personne un lien différent, par exemple https://the-analytics.fr/?r=julie
-- ============================================================
select coalesce(nullif(src, ''), '(sans étiquette)') as lien,
       coalesce(nullif(ref, ''), '(direct)')         as site_origine,
       count(*) filter (where kind = 'visit')        as visites,
       count(*) filter (where kind = 'example')      as exemples_ouverts,
       max(created_at)                               as derniere_visite
from public.page_views
group by 1, 2 order by visites desc, derniere_visite desc;

-- ============================================================
-- 9. APPAREILS ET LANGUES
-- ============================================================
select device as appareil, lang as langue, standalone as application_installee, count(*) as visites
from public.page_views where kind = 'visit'
group by 1, 2, 3 order by visites desc;