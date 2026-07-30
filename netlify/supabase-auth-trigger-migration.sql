-- SVK Works — Auto-create profile row on signup
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
--
-- Why this is needed:
-- js/auth.js used to write the new user's profile row from the browser right
-- after signUp(). That write requires an active login session (RLS policy
-- "auth.uid() = id"), but Supabase doesn't hand back a session until the
-- user's email is confirmed — so the profile row silently never got created
-- for any account that hadn't confirmed yet. This migration replaces that
-- client-side write with a database trigger that runs automatically the
-- moment a new user is created, regardless of email-confirmation status.
--
-- Safe to re-run.

create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name')
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(excluded.full_name, profiles.full_name);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Backfill: create profile rows for any accounts that already signed up
-- before this trigger existed (e.g. while testing) and are missing one.
insert into profiles (id, email, full_name)
select id, email, raw_user_meta_data->>'full_name'
from auth.users
on conflict (id) do nothing;
