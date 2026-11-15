-- Deck sync schema: one deck document per account, plus the last 30 saved versions.
create table if not exists public.decks (
  user_id    uuid primary key default auth.uid() references auth.users on delete cascade,
  data       jsonb not null,
  version    integer not null default 1,
  device     text,
  updated_at timestamptz not null default now()
);

create table if not exists public.deck_history (
  id       bigint generated always as identity primary key,
  user_id  uuid not null references auth.users on delete cascade,
  version  integer not null,
  device   text,
  data     jsonb not null,
  saved_at timestamptz not null default now()
);
create index if not exists deck_history_user_saved on public.deck_history (user_id, saved_at desc);

alter table public.decks enable row level security;
alter table public.deck_history enable row level security;

drop policy if exists "own deck: read" on public.decks;
drop policy if exists "own deck: create" on public.decks;
drop policy if exists "own deck: update" on public.decks;
drop policy if exists "own history: read" on public.deck_history;
create policy "own deck: read"   on public.decks for select to authenticated using ((select auth.uid()) = user_id);
create policy "own deck: create" on public.decks for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own deck: update" on public.decks for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own history: read" on public.deck_history for select to authenticated using ((select auth.uid()) = user_id);

revoke all on public.decks, public.deck_history from anon;
grant select, insert, update on public.decks to authenticated;
grant select on public.deck_history to authenticated;

-- every save also lands in history; keep the newest 30 per account
create or replace function public.deck_keep_history() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.deck_history (user_id, version, device, data) values (new.user_id, new.version, new.device, new.data);
  delete from public.deck_history h
   where h.user_id = new.user_id
     and h.id not in (select id from public.deck_history where user_id = new.user_id order by saved_at desc, id desc limit 30);
  return new;
end $$;
revoke all on function public.deck_keep_history() from public, anon, authenticated;

drop trigger if exists deck_keep_history on public.decks;
create trigger deck_keep_history after insert or update on public.decks
  for each row execute function public.deck_keep_history();
