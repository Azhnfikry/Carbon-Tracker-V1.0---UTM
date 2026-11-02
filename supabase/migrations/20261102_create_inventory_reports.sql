-- Report settings (MANUAL fields) and AI narrative drafts for the GHG inventory report,
-- one row per user and reporting year.
create table if not exists public.inventory_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reporting_year integer not null,
  settings jsonb not null default '{}'::jsonb,
  narrative jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, reporting_year)
);

create index if not exists inventory_reports_user_id_idx on public.inventory_reports(user_id);

alter table public.inventory_reports enable row level security;

drop policy if exists "Users can view their own inventory reports" on public.inventory_reports;
create policy "Users can view their own inventory reports"
on public.inventory_reports for select to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own inventory reports" on public.inventory_reports;
create policy "Users can insert their own inventory reports"
on public.inventory_reports for insert to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own inventory reports" on public.inventory_reports;
create policy "Users can update their own inventory reports"
on public.inventory_reports for update to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
