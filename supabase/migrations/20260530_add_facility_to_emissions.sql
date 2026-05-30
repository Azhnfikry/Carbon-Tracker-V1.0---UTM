alter table public.emissions
  add column if not exists facility text;

create index if not exists emissions_facility_idx on public.emissions(facility);

