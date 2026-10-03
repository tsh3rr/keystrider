-- Practice data synced between a learner's devices.
--
-- The app keeps working without an account; with one, each finished
-- practice round (one keystroke session) is copied here, and the curriculum
-- (unlocked keys, tier, pace per language and layout) is kept in user_state.
--
-- The project was created with "automatically expose new tables" off, so
-- every table is granted to the API roles explicitly, and row-level security
-- limits each signed-in user to their own rows. Nothing is granted to anon.

create table public.practice_sessions (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- The app's session id (one practice round).
  id text not null check (length(id) between 1 and 64),
  language text not null check (length(language) between 1 and 16),
  -- Every layout the round was typed on, sorted and comma-separated; usually one.
  layouts text not null check (length(layouts) between 1 and 200),
  started_at timestamptz not null,
  keystroke_count integer not null check (keystroke_count between 1 and 20000),
  -- The keystrokes, column by column (see src/sync/codec.ts).
  data jsonb not null check (pg_column_size(data) <= 262144),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

comment on table public.practice_sessions is 'One practice round per row, synced from the Keystrider app.';

create table public.user_state (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  -- Curriculum per "language.layout" key (see CurriculumState in src/drill.ts).
  curricula jsonb not null default '{}'::jsonb check (pg_column_size(curricula) <= 262144),
  updated_at timestamptz not null default now()
);

comment on table public.user_state is 'Per-user learning state synced from the Keystrider app.';

alter table public.practice_sessions enable row level security;
alter table public.user_state enable row level security;

create policy "Own sessions: read" on public.practice_sessions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Own sessions: add" on public.practice_sessions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Own sessions: change" on public.practice_sessions
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own sessions: delete" on public.practice_sessions
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Own state: read" on public.user_state
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Own state: add" on public.user_state
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Own state: change" on public.user_state
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own state: delete" on public.user_state
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.practice_sessions to authenticated;
grant select, insert, update, delete on public.user_state to authenticated;

-- Keeps updated_at honest whatever the client sends.
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger practice_sessions_touch before insert or update on public.practice_sessions
  for each row execute function public.touch_updated_at();
create trigger user_state_touch before insert or update on public.user_state
  for each row execute function public.touch_updated_at();

-- One account cannot fill the free database for everyone: 50,000 rounds is
-- years of daily practice.
create function public.limit_practice_sessions() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.practice_sessions where user_id = new.user_id) >= 50000 then
    raise exception 'practice session limit reached' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

revoke execute on function public.limit_practice_sessions() from public, anon, authenticated;

create trigger practice_sessions_limit before insert on public.practice_sessions
  for each row execute function public.limit_practice_sessions();

-- Lets a signed-in user delete their own account; their rows go with it
-- (on delete cascade).
create function public.delete_my_account() returns void
language sql security definer set search_path = '' as $$
  delete from auth.users where id = (select auth.uid());
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
revoke execute on function public.touch_updated_at() from public, anon, authenticated;
