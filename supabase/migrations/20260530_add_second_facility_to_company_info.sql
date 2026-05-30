alter table public.company_info
  add column if not exists facility_count text default '1',
  add column if not exists facility_2_address_line_1 text,
  add column if not exists facility_2_address_line_2 text,
  add column if not exists facility_2_postcode text,
  add column if not exists facility_2_state text;

update public.company_info
set facility_count = '1'
where facility_count is null;

