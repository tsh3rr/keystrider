-- A username per account, unique regardless of case, shown in the app
-- instead of the e-mail address. Optional: an account without one simply
-- has no row here. Like the other tables it is granted explicitly and each
-- signed-in user only sees and changes their own row.

create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  -- 3 to 20 letters, digits, ".", "_" or "-" (the app checks the same, see src/sync/username.ts).
  username text not null check (char_length(username) between 3 and 20 and username !~ '[[:space:][:cntrl:]@/\\]'),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Username per account, from the Keystrider app.';

create unique index profiles_username_key on public.profiles (lower(username));

alter table public.profiles enable row level security;

create policy "Own profile: read" on public.profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Own profile: add" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Own profile: change" on public.profiles
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Own profile: delete" on public.profiles
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.profiles to authenticated;

create trigger profiles_touch before insert or update on public.profiles
  for each row execute function public.touch_updated_at();
