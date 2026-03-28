alter table public.emissions
add column if not exists co2 double precision,
add column if not exists ch4 double precision,
add column if not exists n2o double precision;

comment on column public.emissions.co2 is 'Calculated CO2 mass in kg for the emission entry.';
comment on column public.emissions.ch4 is 'Calculated CH4 mass in kg for the emission entry.';
comment on column public.emissions.n2o is 'Calculated N2O mass in kg for the emission entry.';
