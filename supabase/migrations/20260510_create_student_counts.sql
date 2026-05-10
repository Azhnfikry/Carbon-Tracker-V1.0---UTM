create table if not exists public.student_counts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  students integer not null check (students >= 0),
  description text,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create index if not exists student_counts_user_id_idx on public.student_counts(user_id);
create index if not exists student_counts_date_idx on public.student_counts(date desc);

alter table public.student_counts enable row level security;

drop policy if exists "Users can view their own student counts" on public.student_counts;
create policy "Users can view their own student counts"
on public.student_counts
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own student counts" on public.student_counts;
create policy "Users can insert their own student counts"
on public.student_counts
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own student counts" on public.student_counts;
create policy "Users can update their own student counts"
on public.student_counts
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own student counts" on public.student_counts;
create policy "Users can delete their own student counts"
on public.student_counts
for delete
to authenticated
using (auth.uid() = user_id);
