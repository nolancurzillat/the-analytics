-- Partage d'analyses par lien (The Analytics) : à exécuter UNE SEULE FOIS dans Supabase, SQL Editor, puis « Run ».
-- Aucun secret ici. Sans ce script, le bouton « Créer un lien » affiche « pas encore disponible » (le partage par fichier marche quand même).

create table if not exists public.shared_analyses (
  token         text primary key default replace(gen_random_uuid()::text, '-', ''),
  owner_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  company_id    text not null,
  company_name  text not null default '',
  data          jsonb not null,
  created_at    timestamptz not null default now(),
  constraint shared_analyses_size check (octet_length(data::text) <= 1700000)
);
create index if not exists shared_analyses_owner_idx on public.shared_analyses (owner_id, company_id);

alter table public.shared_analyses enable row level security;

-- L'auteur voit, crée et révoque SES liens. Personne d'autre ne peut LISTER la table.
drop policy if exists "shared_select_own" on public.shared_analyses;
drop policy if exists "shared_insert_own" on public.shared_analyses;
drop policy if exists "shared_delete_own" on public.shared_analyses;
create policy "shared_select_own" on public.shared_analyses for select to authenticated using (auth.uid() = owner_id);
create policy "shared_insert_own" on public.shared_analyses for insert to authenticated with check (auth.uid() = owner_id);
create policy "shared_delete_own" on public.shared_analyses for delete to authenticated using (auth.uid() = owner_id);

-- Limite anti-abus : 200 liens actifs par compte.
create or replace function public.shared_analyses_limit() returns trigger language plpgsql as $$
begin
  if (select count(*) from public.shared_analyses where owner_id = new.owner_id) >= 200 then
    raise exception 'Limite de 200 liens de partage atteinte : révoquez-en avant d''en créer.';
  end if;
  return new;
end; $$;
drop trigger if exists shared_analyses_limit_trg on public.shared_analyses;
create trigger shared_analyses_limit_trg before insert on public.shared_analyses for each row execute function public.shared_analyses_limit();

-- Lecture PAR LE LIEN : le destinataire (même sans compte) appelle cette fonction avec le jeton exact, qui sert de secret.
-- Elle ne permet jamais de lister les analyses des autres : il faut connaître le jeton de 32 caractères.
create or replace function public.get_shared_analysis(p_token text)
returns jsonb language sql security definer set search_path = public stable as $$
  select jsonb_build_object('data', data, 'name', company_name, 'created_at', created_at)
  from public.shared_analyses where token = p_token
$$;
revoke all on function public.get_shared_analysis(text) from public;
grant execute on function public.get_shared_analysis(text) to anon, authenticated;