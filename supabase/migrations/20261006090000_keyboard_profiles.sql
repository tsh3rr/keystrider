-- Keyboard profiles (optional, off by default in the app): the learner can
-- name the physical keyboards they practise on, and each practice round
-- records which one it was typed on (as "kb" inside practice_sessions.data,
-- see src/sync/codec.ts). The list of profiles is synced here, keyed by
-- profile id (see KeyboardProfile in src/keyboards.ts). Removed profiles
-- stay as a marker so the removal reaches the learner's other devices.
--
-- user_state is already granted to authenticated with row-level security
-- limiting each user to their own row; a new column is covered by both.

alter table public.user_state
  add column keyboards jsonb not null default '{}'::jsonb
  check (jsonb_typeof(keyboards) = 'object' and pg_column_size(keyboards) <= 16384);

comment on column public.user_state.keyboards is 'Keyboard profiles by id: name, layout, when created and last changed.';
