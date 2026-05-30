alter table public.company_info
  add column if not exists facility_address_line_1 text,
  add column if not exists facility_address_line_2 text,
  add column if not exists facility_postcode text,
  add column if not exists facility_state text;

