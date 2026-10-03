-- The username is chosen when the account is created: the app checks that
-- it is free (username_available) and passes it with the sign-up, and the
-- profile row is created in the same transaction as the account, so a name
-- taken in the meantime makes the sign-up fail instead of leaving an account
-- without its name. Accounts made without one (Google sign-in) choose it later.

-- Lets the sign-up form say "already taken" before the account exists.
-- Reveals only whether a name is in use, never whose it is.
create function public.username_available(name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.profiles where lower(username) = lower(name));
$$;

revoke execute on function public.username_available(text) from public;
grant execute on function public.username_available(text) to anon, authenticated;

create function public.create_profile_at_signup() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(new.raw_user_meta_data ->> 'username', '') <> '' then
    insert into public.profiles (user_id, username) values (new.id, new.raw_user_meta_data ->> 'username');
  end if;
  return new;
end;
$$;

revoke execute on function public.create_profile_at_signup() from public, anon, authenticated;

create trigger create_profile_at_signup after insert on auth.users
  for each row execute function public.create_profile_at_signup();
