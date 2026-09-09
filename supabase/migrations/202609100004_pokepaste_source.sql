-- Preserve the existing metadata validation, adding a named provenance type.
alter function private.check_meta(jsonb) rename to check_meta_before_pokepaste;
revoke all on function private.check_meta_before_pokepaste(jsonb) from public,anon,authenticated;
create function private.check_meta(m jsonb) returns void language plpgsql set search_path='' as $$
begin
 perform private.check_meta_before_pokepaste(case when m->>'source_type'='PokéPaste'
   then m||jsonb_build_object('source_type','Website') else m end);
end $$;
revoke all on function private.check_meta(jsonb) from public,anon,authenticated;
