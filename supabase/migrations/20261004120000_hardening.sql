-- Hardening before the app goes public.
--
-- 1. Storage quota for synced practice rounds. Until now one account could
--    store 50,000 rounds of up to 256 kB each (about 12 GB), far more than
--    the whole free database. Usage is now counted per account in
--    sync_usage, and a write that would go over a limit is refused:
--    100 MB in total (several hundred hours of typing), 25 MB written per
--    day (room for a first upload of months of local history) and, as
--    before, 50,000 rounds.
-- 2. Cheers only for a week near today, so cheer_buddy cannot be used to
--    add rows without end.
-- 3. Usernames may not contain invisible or text-direction characters,
--    which could make one buddy's name look like another's. The app already
--    refuses them; now the database does too.
-- 4. The API's anonymous role is explicitly denied every table, in case
--    a default grant ever reaches the public schema.

-- --- 1. Storage quota ---

create table public.sync_usage (
  user_id uuid primary key references auth.users (id) on delete cascade,
  rounds integer not null default 0,
  -- Stored size of all rounds (pg_column_size of data).
  bytes bigint not null default 0,
  -- Bytes written since day_start; starts over a day later.
  day_start timestamptz not null default now(),
  day_bytes bigint not null default 0
);

comment on table public.sync_usage is 'How much practice data each account stores; used to enforce the sync quota.';

-- Only the trigger below reads or writes it: no API role has access.
alter table public.sync_usage enable row level security;
revoke all on public.sync_usage from public, anon, authenticated;

insert into public.sync_usage (user_id, rounds, bytes)
  select user_id, count(*), coalesce(sum(pg_column_size(data)), 0)
  from public.practice_sessions group by user_id;

create function public.count_practice_usage() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  added bigint;
  u public.sync_usage;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    -- Update only: during account deletion the usage row may already be gone.
    update public.sync_usage
      set rounds = rounds - 1, bytes = greatest(bytes - pg_column_size(old.data), 0)
      where user_id = old.user_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    added := pg_column_size(new.data);
    insert into public.sync_usage as s (user_id, rounds, bytes, day_bytes)
      values (new.user_id, 1, added, added)
      on conflict (user_id) do update set
        rounds = s.rounds + 1,
        bytes = s.bytes + added,
        day_start = case when s.day_start < now() - interval '1 day' then now() else s.day_start end,
        day_bytes = case when s.day_start < now() - interval '1 day' then added else s.day_bytes + added end
      returning * into u;
    if u.rounds > 50000 or u.bytes > 100 * 1024 * 1024 or u.day_bytes > 25 * 1024 * 1024 then
      raise exception 'practice storage limit reached' using errcode = 'check_violation';
    end if;
  end if;
  return null;
end;
$$;

revoke execute on function public.count_practice_usage() from public, anon, authenticated;

-- After the row is written, so an upsert that turns into an update is counted once.
create trigger practice_sessions_usage after insert or update or delete on public.practice_sessions
  for each row execute function public.count_practice_usage();

-- The count is now kept in sync_usage; the old trigger counted all rows on every insert.
drop trigger practice_sessions_limit on public.practice_sessions;
drop function public.limit_practice_sessions();

-- --- 2. Cheers for a week near today ---

create or replace function public.cheer_buddy(buddy uuid, week date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  gid uuid;
begin
  -- The app sends this week's Monday in the learner's time zone.
  if week is null or week < current_date - 14 or week > current_date + 7 then
    raise exception 'invalid_week' using errcode = 'P0001';
  end if;
  select a.group_id into gid from public.buddy_members a
    join public.buddy_members b on b.group_id = a.group_id and b.user_id = buddy
    where a.user_id = me and buddy <> me;
  if gid is null then raise exception 'not_a_buddy' using errcode = 'P0001'; end if;
  insert into public.buddy_cheers (group_id, from_user, to_user, week_start) values (gid, me, buddy, week)
    on conflict do nothing;
end;
$$;

-- --- 3. No invisible characters in usernames ---

alter table public.profiles add constraint profiles_username_visible check (
  username !~ '[­͏؜ᅟᅠ឴឵᠋-᠏​-‏‪-‮⁠-⁯ㅤ︀-️﻿ﾠ]'
);

-- --- 4. Nothing for the anonymous role ---

revoke all on public.practice_sessions, public.user_state, public.profiles,
  public.buddy_groups, public.buddy_members, public.buddy_stats, public.buddy_cheers
  from anon;
