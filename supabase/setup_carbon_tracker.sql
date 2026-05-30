create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  job_title text,
  email text,
  company_name text,
  industry text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, company_name)
  values (
    new.id,
    new.raw_user_meta_data ->> 'full_name',
    new.email,
    new.raw_user_meta_data ->> 'company_name'
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    email = excluded.email,
    company_name = excluded.company_name,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create table if not exists public.company_info (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  company_name text,
  company_description text,
  facility_address_line_1 text,
  facility_address_line_2 text,
  facility_postcode text,
  facility_state text,
  consolidation_approach text,
  business_description text,
  reporting_period text,
  financial_reporting_periods text,
  scope3_activities text,
  excluded_activities text,
  base_year text,
  base_year_rationale text,
  base_year_recalculation_policy text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.emissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  activity_type text not null,
  category text not null,
  scope integer not null check (scope in (1, 2, 3)),
  quantity double precision not null,
  unit text not null,
  emission_factor double precision not null,
  co2_equivalent double precision not null,
  co2 double precision,
  ch4 double precision,
  n2o double precision,
  date date not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.student_counts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  students integer not null check (students >= 0),
  description text,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create table if not exists public.emission_factors (
  id text primary key,
  activity_type text not null,
  category text not null,
  scope integer not null check (scope in (1, 2, 3)),
  unit text not null,
  factor double precision not null,
  co2 double precision,
  ch4 double precision,
  n2o double precision,
  source text,
  region text,
  year integer,
  created_at timestamptz not null default now(),
  unique (scope, activity_type)
);

create index if not exists emissions_user_id_idx on public.emissions(user_id);
create index if not exists emissions_date_idx on public.emissions(date desc);
create index if not exists student_counts_user_id_idx on public.student_counts(user_id);
create index if not exists student_counts_date_idx on public.student_counts(date desc);
create index if not exists emission_factors_scope_activity_idx on public.emission_factors(scope, activity_type);

alter table public.profiles enable row level security;
alter table public.company_info enable row level security;
alter table public.emissions enable row level security;
alter table public.student_counts enable row level security;
alter table public.emission_factors enable row level security;

drop policy if exists "Profiles are viewable by owner" on public.profiles;
create policy "Profiles are viewable by owner"
on public.profiles
for select
to authenticated
using (auth.uid() = id);

drop policy if exists "Profiles are insertable by owner" on public.profiles;
create policy "Profiles are insertable by owner"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

drop policy if exists "Profiles are updatable by owner" on public.profiles;
create policy "Profiles are updatable by owner"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

drop policy if exists "Company info is viewable by owner" on public.company_info;
create policy "Company info is viewable by owner"
on public.company_info
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Company info is insertable by owner" on public.company_info;
create policy "Company info is insertable by owner"
on public.company_info
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Company info is updatable by owner" on public.company_info;
create policy "Company info is updatable by owner"
on public.company_info
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can view their own emissions" on public.emissions;
create policy "Users can view their own emissions"
on public.emissions
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists "Users can insert their own emissions" on public.emissions;
create policy "Users can insert their own emissions"
on public.emissions
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists "Users can update their own emissions" on public.emissions;
create policy "Users can update their own emissions"
on public.emissions
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own emissions" on public.emissions;
create policy "Users can delete their own emissions"
on public.emissions
for delete
to authenticated
using (auth.uid() = user_id);

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

drop policy if exists "Emission factors are readable by everyone" on public.emission_factors;
create policy "Emission factors are readable by everyone"
on public.emission_factors
for select
to anon, authenticated
using (true);

insert into public.emission_factors (
  id, activity_type, category, scope, unit, factor, co2, ch4, n2o, source, year
)
values
  ('1', 'Natural Gas (Sm3 or BTU)', 'Stationary Combustion', 1, 'MMBTU', 53.11450, 53.06000, 0.00100, 0.00010, 'PA Emission Factors for Greenhouse Gas Inventories', 2018),
  ('2', 'Diesel (Litre or BTU)', 'Stationary Combustion', 1, 'Litre', 2.66155, 2.62818, 0.00001, 0.00012, 'BIES 2025', 2025),
  ('3', 'LPG (kg or BTU)', 'Stationary Combustion', 1, 'kg', 61.95300, 61.71000, 0.00300, 0.00060, 'PA Emission Factors for Greenhouse Gas Inventories', 2018),
  ('4', 'Petrol (Litre)', 'Mobile Combustion', 1, 'Litre', 2.30154, 2.28819, 0.00865, 0.00470, 'GHG Protocol 2024', 2024),
  ('5', 'Diesel (Litre)', 'Mobile Combustion', 1, 'Litre', 2.91440, 2.90999, 0.00232, 0.00210, 'GHG Protocol 2024', 2024),
  ('6', 'Water (m3)', 'Water Treatment', 1, 'm3', 0.17088, null, null, null, 'GHG Protocol 2025 Condensed Set', 2025),
  ('7', 'Refrigerant R22', 'Refrigerant', 1, 'Kg', 1760, null, null, null, 'GHG Protocol 2025 Condensed Set', 2025),
  ('8', 'Refrigerant R410', 'Refrigerant', 1, 'Kg', 1924, null, null, null, 'GHG Protocol 2025 Condensed Set', 2025),
  ('9', 'Refrigerant R32', 'Refrigerant', 1, 'Kg', 677, null, null, null, 'GHG Protocol 2025 Condensed Set', 2025),
  ('10', 'Refrigerant R123', 'Refrigerant', 1, 'Kg', 79, null, null, null, 'GHG Protocol 2025 Condensed Set', 2025),
  ('11', 'Horse (number of head)', 'Livestock', 1, 'head', 0.789, null, null, null, 'Exiobase Australia', 2021),
  ('12', 'Cattle (number of head)', 'Livestock', 1, 'head', 12.673, null, null, null, 'Exiobase Australia', 2021),
  ('13', 'Goat (number of head)', 'Livestock', 1, 'head', 0.789, null, null, null, 'Exiobase Australia', 2021),
  ('14', 'Sheep (number of head)', 'Livestock', 1, 'head', 0.789, null, null, null, 'Exiobase Australia', 2021),
  ('15', 'Poultry (number of head)', 'Livestock', 1, 'head', 2.3946, null, null, null, 'Exiobase Australia', 2021),
  ('16', 'Total Electricity Bill (kWh)', 'Electricity', 2, 'Kwh', 0.774, null, null, null, 'Malaysia Energy Comission (2023)', 2023),
  ('17', 'Total Solar Generation (kWh)', 'Electricity', 2, 'Kwh', 0.774, null, null, null, 'Malaysia Energy Comission (2023)', 2023),
  ('18', 'Total Solar Injected to Grid (kWh)', 'Electricity', 2, 'Kwh', 0.774, null, null, null, 'Malaysia Energy Comission (2023)', 2023),
  ('19', 'Total Green Electricity Tarif Purchased (kWh)', 'Electricity', 2, 'Kwh', 0.774, null, null, null, 'Malaysia Energy Comission (2023)', 2023),
  ('20', 'Solid Waste (Landfill)', 'Waste (Solid)', 3, 'Kg', 520.335, null, null, null, 'GHG Protocol 2025 Condensed Set', 2025),
  ('21', 'Food Waste', 'Waste (Solid)', 3, 'Kg', 655.987, null, null, null, 'GHG Protocol 2025 Condensed Set', 2025),
  ('22', 'Kitar Semula', 'Waste (Solid)', 3, 'Kg', 90, null, null, null, 'EPA', 2021),
  ('23', 'Sisa Landskap', 'Waste (Solid)', 3, 'Kg', 646.607, null, null, null, 'GHG Protocol 2025 Condensed Set', 2025),
  ('24', 'Total Water Purchased (m3)', 'Water Supply', 3, 'm3', 0.1776, null, null, null, 'GHG Protocol 2025 Condensed Set', 2025)
on conflict (id) do update
set
  activity_type = excluded.activity_type,
  category = excluded.category,
  scope = excluded.scope,
  unit = excluded.unit,
  factor = excluded.factor,
  co2 = excluded.co2,
  ch4 = excluded.ch4,
  n2o = excluded.n2o,
  source = excluded.source,
  year = excluded.year;

notify pgrst, 'reload schema';
