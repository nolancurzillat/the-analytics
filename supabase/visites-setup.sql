-- Mesure de fréquentation anonyme de The Analytics : À EXÉCUTER UNE SEULE FOIS dans Supabase, SQL Editor (coller tout, puis « Run »).
-- Crée une table où l'application ajoute UNE ligne par visite : date, langue, appareil, site d'origine, étiquette du lien (?r=nom). Aucune adresse IP, aucun cookie, aucun identifiant.
-- Sécurité : tout le monde peut AJOUTER une ligne (c'est le but), PERSONNE ne peut en lire, modifier ou supprimer via l'API publique : vous seul lisez les chiffres, ici, dans le SQL Editor.
create table if not exists public.page_views (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null default 'visit' check (kind in ('visit', 'example')),
  src text not null default '' check (char_length(src) <= 30),
  ref text not null default '' check (char_length(ref) <= 60),
  lang text not null default 'fr' check (lang in ('fr', 'en')),
  device text not null default '' check (device in ('', 'mobile', 'ordinateur')),
  standalone boolean not null default false
);
alter table public.page_views enable row level security;
drop policy if exists "ajout anonyme d'une visite" on public.page_views;
create policy "ajout anonyme d'une visite" on public.page_views for insert to anon, authenticated with check (true);
revoke all on public.page_views from anon, authenticated;
grant insert on public.page_views to anon, authenticated;