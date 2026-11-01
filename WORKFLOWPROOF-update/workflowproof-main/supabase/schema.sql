-- WorkflowProof free-account foundation.
-- Run this entire script in Supabase Dashboard -> SQL Editor.
-- No workflow JSON is uploaded. Only the audit report and its findings are saved.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  free_scans_remaining integer not null default 2 check (free_scans_remaining between 0 and 2),
  created_at timestamptz not null default now()
);

create table if not exists public.scan_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workflow_name text not null,
  file_name text not null,
  score integer not null,
  report jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists scan_reports_user_created_idx
  on public.scan_reports (user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.scan_reports enable row level security;

drop policy if exists "Users can read own profile" on public.profiles;
create policy "Users can read own profile"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "Users can read own scan reports" on public.scan_reports;
create policy "Users can read own scan reports"
  on public.scan_reports for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own scan reports" on public.scan_reports;
create policy "Users can insert own scan reports"
  on public.scan_reports for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete own scan reports" on public.scan_reports;
create policy "Users can delete own scan reports"
  on public.scan_reports for delete
  using (auth.uid() = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, free_scans_remaining)
  values (new.id, 2)
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public;

drop trigger if exists on_auth_user_created_workflowproof on auth.users;
create trigger on_auth_user_created_workflowproof
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Backfill accounts that existed before this schema was installed.
insert into public.profiles (id, free_scans_remaining)
select id, 2 from auth.users
on conflict (id) do nothing;

-- One atomic operation: decrement a free credit and save the report in the same
-- database transaction. A failed insert rolls back the decrement automatically.
create or replace function public.save_scan_report(
  p_workflow_name text,
  p_file_name text,
  p_score integer,
  p_report jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  remaining integer;
  saved_report_id uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  update public.profiles
     set free_scans_remaining = free_scans_remaining - 1
   where id = auth.uid()
     and free_scans_remaining > 0
  returning free_scans_remaining into remaining;

  if remaining is null then
    raise exception 'NO_FREE_SCANS';
  end if;

  insert into public.scan_reports (user_id, workflow_name, file_name, score, report)
  values (auth.uid(), p_workflow_name, p_file_name, p_score, p_report)
  returning id into saved_report_id;

  return jsonb_build_object('remaining', remaining, 'report_id', saved_report_id);
end;
$$;

revoke all on function public.save_scan_report(text, text, integer, jsonb) from public;
grant execute on function public.save_scan_report(text, text, integer, jsonb) to authenticated;

grant select on public.profiles to authenticated;
grant select, delete on public.scan_reports to authenticated;
