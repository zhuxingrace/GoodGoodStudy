create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date_iso text not null,
  type text not null check (type in ('LeetCode', 'SystemDesign', 'InterviewPrep', 'Other')),
  title text not null,
  link text,
  starred boolean not null default false,
  tags text[] not null default '{}',
  problem_number integer,
  difficulty text check (difficulty in ('Easy', 'Medium', 'Hard')),
  need_review boolean not null default false,
  language text,
  company text,
  round_type text,
  blocks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.day_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date_iso text not null,
  note text,
  journal text,
  mood text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, date_iso)
);

create table if not exists public.focus_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date_iso text not null,
  started_at timestamptz not null,
  ended_at timestamptz not null,
  minutes integer not null check (minutes >= 0),
  type text not null check (type in ('LeetCode', 'SystemDesign', 'InterviewPrep', 'Other')),
  label text,
  mode text not null default 'focus' check (mode in ('focus', 'break')),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists entries_user_id_idx on public.entries(user_id);
create index if not exists entries_user_date_idx on public.entries(user_id, date_iso desc);
create index if not exists day_notes_user_id_idx on public.day_notes(user_id);
create index if not exists day_notes_user_date_idx on public.day_notes(user_id, date_iso desc);
create index if not exists focus_sessions_user_id_idx on public.focus_sessions(user_id);
create index if not exists focus_sessions_user_date_idx on public.focus_sessions(user_id, date_iso desc);

drop trigger if exists entries_set_updated_at on public.entries;
create trigger entries_set_updated_at
before update on public.entries
for each row
execute function public.set_updated_at();

drop trigger if exists day_notes_set_updated_at on public.day_notes;
create trigger day_notes_set_updated_at
before update on public.day_notes
for each row
execute function public.set_updated_at();

alter table public.entries enable row level security;
alter table public.day_notes enable row level security;
alter table public.focus_sessions enable row level security;

drop policy if exists "entries_select_own" on public.entries;
create policy "entries_select_own"
on public.entries
for select
using (auth.uid() = user_id);

drop policy if exists "entries_insert_own" on public.entries;
create policy "entries_insert_own"
on public.entries
for insert
with check (auth.uid() = user_id);

drop policy if exists "entries_update_own" on public.entries;
create policy "entries_update_own"
on public.entries
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "entries_delete_own" on public.entries;
create policy "entries_delete_own"
on public.entries
for delete
using (auth.uid() = user_id);

drop policy if exists "day_notes_select_own" on public.day_notes;
create policy "day_notes_select_own"
on public.day_notes
for select
using (auth.uid() = user_id);

drop policy if exists "day_notes_insert_own" on public.day_notes;
create policy "day_notes_insert_own"
on public.day_notes
for insert
with check (auth.uid() = user_id);

drop policy if exists "day_notes_update_own" on public.day_notes;
create policy "day_notes_update_own"
on public.day_notes
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "day_notes_delete_own" on public.day_notes;
create policy "day_notes_delete_own"
on public.day_notes
for delete
using (auth.uid() = user_id);

drop policy if exists "focus_sessions_select_own" on public.focus_sessions;
create policy "focus_sessions_select_own"
on public.focus_sessions
for select
using (auth.uid() = user_id);

drop policy if exists "focus_sessions_insert_own" on public.focus_sessions;
create policy "focus_sessions_insert_own"
on public.focus_sessions
for insert
with check (auth.uid() = user_id);

drop policy if exists "focus_sessions_update_own" on public.focus_sessions;
create policy "focus_sessions_update_own"
on public.focus_sessions
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "focus_sessions_delete_own" on public.focus_sessions;
create policy "focus_sessions_delete_own"
on public.focus_sessions
for delete
using (auth.uid() = user_id);
