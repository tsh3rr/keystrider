-- Training buddies: a small group of friends who see each other's weekly
-- goal and streak, and can cheer each other on. Joining is by invite link
-- only; nobody can search for or browse other users.
--
-- What members see of each other is only what the app publishes in
-- buddy_stats (goal days, days done this week, week streak, and speed only
-- if the member turns that on) plus the username. Like every other table,
-- these are granted explicitly; groups, members and cheers are only reached
-- through the functions below, which check membership.

create table public.buddy_groups (
  id uuid primary key default gen_random_uuid(),
  -- Can remove members and make a new invite link; passes to the longest
  -- member when the owner leaves.
  owner_id uuid references auth.users (id) on delete set null,
  -- 12 hex characters from a random UUID: the secret part of the invite link.
  invite_code text not null unique check (invite_code ~ '^[0-9a-f]{12}$'),
  created_at timestamptz not null default now()
);

create table public.buddy_members (
  group_id uuid not null references public.buddy_groups (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- One group per account keeps it simple: "your buddies".
create unique index buddy_members_one_group on public.buddy_members (user_id);

create table public.buddy_stats (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  -- Monday of the week the numbers are for, in the member's own time zone.
  week_start date not null,
  goal_days smallint not null check (goal_days between 1 and 7),
  days_this_week smallint not null check (days_this_week between 0 and 7),
  week_streak integer not null check (week_streak between 0 and 1000),
  met_this_week boolean not null,
  -- Average speed this week; null unless the member chose to share it.
  wpm real check (wpm is null or wpm between 0 and 400),
  updated_at timestamptz not null default now()
);

create table public.buddy_cheers (
  group_id uuid not null references public.buddy_groups (id) on delete cascade,
  from_user uuid not null references auth.users (id) on delete cascade,
  to_user uuid not null references auth.users (id) on delete cascade,
  week_start date not null,
  created_at timestamptz not null default now(),
  primary key (from_user, to_user, week_start),
  check (from_user <> to_user)
);

comment on table public.buddy_groups is 'Training buddy groups in the Keystrider app.';
comment on table public.buddy_members is 'Who is in which training buddy group.';
comment on table public.buddy_stats is 'Weekly goal and streak each member shares with their buddies.';
comment on table public.buddy_cheers is 'One cheer per buddy per week.';

alter table public.buddy_groups enable row level security;
alter table public.buddy_members enable row level security;
alter table public.buddy_stats enable row level security;
alter table public.buddy_cheers enable row level security;

-- Whether the caller is in a group; the stats policies use it, since the
-- members table itself is not readable to the API roles.
create function public.in_buddy_group() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.buddy_members where user_id = (select auth.uid()));
$$;

revoke execute on function public.in_buddy_group() from public, anon;
grant execute on function public.in_buddy_group() to authenticated;

-- Members write their own numbers, and only while they are in a group.
create policy "Own stats: read" on public.buddy_stats
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Own stats: add" on public.buddy_stats
  for insert to authenticated with check (
    (select auth.uid()) = user_id and (select public.in_buddy_group())
  );
create policy "Own stats: change" on public.buddy_stats
  for update to authenticated using ((select auth.uid()) = user_id) with check (
    (select auth.uid()) = user_id and (select public.in_buddy_group())
  );
create policy "Own stats: delete" on public.buddy_stats
  for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.buddy_stats to authenticated;

create trigger buddy_stats_touch before insert or update on public.buddy_stats
  for each row execute function public.touch_updated_at();

-- When someone leaves (or deletes their account): their cheers in the group
-- and their shared numbers go, ownership passes on, and an empty group is deleted.
create function public.buddy_member_left() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.buddy_cheers
    where group_id = old.group_id and (from_user = old.user_id or to_user = old.user_id);
  delete from public.buddy_stats where user_id = old.user_id;
  if not exists (select 1 from public.buddy_members where group_id = old.group_id) then
    delete from public.buddy_groups where id = old.group_id;
  else
    update public.buddy_groups g
      set owner_id = (select m.user_id from public.buddy_members m where m.group_id = g.id order by m.joined_at limit 1)
      where g.id = old.group_id and (g.owner_id is null or g.owner_id = old.user_id);
  end if;
  return old;
end;
$$;

revoke execute on function public.buddy_member_left() from public, anon, authenticated;

create trigger buddy_member_left after delete on public.buddy_members
  for each row execute function public.buddy_member_left();

-- --- Functions the app calls ---

create function public.buddy_new_code() returns text
language sql volatile set search_path = '' as $$
  select substr(replace(gen_random_uuid()::text, '-', ''), 1, 12);
$$;

revoke execute on function public.buddy_new_code() from public, anon, authenticated;

/** Starts a group with the caller as owner; returns the invite code. */
create function public.create_buddy_group() returns text
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  code text := public.buddy_new_code();
  gid uuid;
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where user_id = me) then
    raise exception 'username_required' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.buddy_members where user_id = me) then
    raise exception 'already_in_group' using errcode = 'P0001';
  end if;
  insert into public.buddy_groups (owner_id, invite_code) values (me, code) returning id into gid;
  insert into public.buddy_members (group_id, user_id) values (gid, me);
  return code;
end;
$$;

/**
 * Who invites, for the "join?" question before signing in. Reveals only the
 * owner's username and the group's size, and only to someone with the code.
 */
create function public.buddy_invite(code text) returns table (owner text, members integer, full_group boolean)
language sql stable security definer set search_path = '' as $$
  select p.username, (select count(*)::integer from public.buddy_members m where m.group_id = g.id),
    (select count(*) from public.buddy_members m where m.group_id = g.id) >= 8
  from public.buddy_groups g left join public.profiles p on p.user_id = g.owner_id
  where g.invite_code = lower(code);
$$;

create function public.join_buddy_group(code text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  gid uuid;
  current_group uuid;
begin
  if me is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if not exists (select 1 from public.profiles where user_id = me) then
    raise exception 'username_required' using errcode = 'P0001';
  end if;
  -- Locked, so two people joining at once cannot both take the last place.
  select id into gid from public.buddy_groups where invite_code = lower(code) for update;
  if gid is null then raise exception 'invalid_invite' using errcode = 'P0001'; end if;
  select group_id into current_group from public.buddy_members where user_id = me;
  if current_group = gid then return; end if;
  if current_group is not null then raise exception 'already_in_group' using errcode = 'P0001'; end if;
  if (select count(*) from public.buddy_members where group_id = gid) >= 8 then
    raise exception 'group_full' using errcode = 'P0001';
  end if;
  insert into public.buddy_members (group_id, user_id) values (gid, me);
end;
$$;

create function public.leave_buddy_group() returns void
language sql security definer set search_path = '' as $$
  delete from public.buddy_members where user_id = (select auth.uid());
$$;

/** The owner removes a member. */
create function public.remove_buddy(buddy uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  gid uuid;
begin
  select id into gid from public.buddy_groups where owner_id = auth.uid();
  if gid is null or buddy = auth.uid() then raise exception 'not_owner' using errcode = 'P0001'; end if;
  delete from public.buddy_members where group_id = gid and user_id = buddy;
end;
$$;

/** The owner replaces the invite link; the old one stops working. */
create function public.new_buddy_invite() returns text
language plpgsql security definer set search_path = '' as $$
declare
  code text := public.buddy_new_code();
begin
  update public.buddy_groups set invite_code = code where owner_id = auth.uid();
  if not found then raise exception 'not_owner' using errcode = 'P0001'; end if;
  return code;
end;
$$;

/** One cheer for a buddy's week; repeating it changes nothing. */
create function public.cheer_buddy(buddy uuid, week date) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  gid uuid;
begin
  select a.group_id into gid from public.buddy_members a
    join public.buddy_members b on b.group_id = a.group_id and b.user_id = buddy
    where a.user_id = me and buddy <> me;
  if gid is null then raise exception 'not_a_buddy' using errcode = 'P0001'; end if;
  insert into public.buddy_cheers (group_id, from_user, to_user, week_start) values (gid, me, buddy, week)
    on conflict do nothing;
end;
$$;

/**
 * The caller's group: each member's username, shared numbers and cheers for
 * `week`. Empty when the caller is in no group.
 */
create function public.my_buddies(week date) returns table (
  user_id uuid, username text, is_me boolean, is_owner boolean, invite_code text,
  week_start date, goal_days smallint, days_this_week smallint, week_streak integer, met_this_week boolean, wpm real,
  cheers integer, cheered boolean
)
language sql stable security definer set search_path = '' as $$
  with mine as (
    select m.group_id from public.buddy_members m where m.user_id = (select auth.uid())
  )
  select m.user_id, p.username, m.user_id = (select auth.uid()), g.owner_id = m.user_id,
    g.invite_code,
    s.week_start, s.goal_days, s.days_this_week, s.week_streak, s.met_this_week, s.wpm,
    (select count(*)::integer from public.buddy_cheers c where c.group_id = g.id and c.to_user = m.user_id and c.week_start = week),
    exists (select 1 from public.buddy_cheers c where c.group_id = g.id and c.from_user = (select auth.uid()) and c.to_user = m.user_id and c.week_start = week)
  from mine
  join public.buddy_groups g on g.id = mine.group_id
  join public.buddy_members m on m.group_id = g.id
  left join public.profiles p on p.user_id = m.user_id
  left join public.buddy_stats s on s.user_id = m.user_id
  order by m.joined_at;
$$;

revoke execute on function public.create_buddy_group() from public, anon;
revoke execute on function public.buddy_invite(text) from public;
revoke execute on function public.join_buddy_group(text) from public, anon;
revoke execute on function public.leave_buddy_group() from public, anon;
revoke execute on function public.remove_buddy(uuid) from public, anon;
revoke execute on function public.new_buddy_invite() from public, anon;
revoke execute on function public.cheer_buddy(uuid, date) from public, anon;
revoke execute on function public.my_buddies(date) from public, anon;

grant execute on function public.buddy_invite(text) to anon, authenticated;
grant execute on function public.create_buddy_group() to authenticated;
grant execute on function public.join_buddy_group(text) to authenticated;
grant execute on function public.leave_buddy_group() to authenticated;
grant execute on function public.remove_buddy(uuid) to authenticated;
grant execute on function public.new_buddy_invite() to authenticated;
grant execute on function public.cheer_buddy(uuid, date) to authenticated;
grant execute on function public.my_buddies(date) to authenticated;
