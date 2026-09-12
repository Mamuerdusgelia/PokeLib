-- Additive compatibility for the legacy vault/backup RPC. No rows are rewritten.
-- The local-first Cloud API already stores validated metadata as JSON.
create or replace function private.check_meta(m jsonb) returns void language plpgsql set search_path='' as $$
begin
 perform private.check_meta_before_pokepaste(case
   when m->>'source_type' in ('PokéPaste','Found on') then m||jsonb_build_object('source_type','Website')
   when m->>'source_type'='Built by' then m||jsonb_build_object('source_type','Self-built')
   when m->>'source_type'='Given by' then m||jsonb_build_object('source_type','Received from')
   else m end);
end $$;
revoke all on function private.check_meta(jsonb) from public,anon,authenticated;
