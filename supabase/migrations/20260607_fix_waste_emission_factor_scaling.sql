update public.emission_factors
set factor = case id
  when '20' then 0.520335
  when '21' then 0.655987
  when '22' then 0.09
  when '23' then 0.646607
  else factor
end
where id in ('20', '21', '22', '23');
