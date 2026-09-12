-- A first upload deliberately omits older Local history. Keep references only
-- to versions actually held by Cloud, so backups and later Local copies have
-- a complete history graph without uploading any additional private versions.
create function private.lf_cloud_history_roots() returns trigger
language plpgsql set search_path='' as $$
declare h jsonb;
begin
 select jsonb_agg(v || jsonb_build_object('parent_version_id',
   case when exists (
     select 1 from jsonb_array_elements(new.data->'history') p
     where p->>'id'=v->>'parent_version_id'
       and (p->>'version_number')::int<(v->>'version_number')::int
   ) then v->'parent_version_id' else 'null'::jsonb end) order by ord)
 into h from jsonb_array_elements(new.data->'history') with ordinality x(v,ord);
 new.data:=jsonb_set(new.data,'{history}',h);
 new.data:=jsonb_set(new.data,'{version}',
   (select v from jsonb_array_elements(h) v where v->>'id'=new.data->>'current_version_id'));
 return new;
end $$;
revoke all on function private.lf_cloud_history_roots() from public,anon,authenticated;
create trigger lf_cloud_history_roots before insert or update of data on public.lf_cloud
for each row execute function private.lf_cloud_history_roots();

-- Repair only new-architecture records with references to omitted versions.
-- Revision changes make previously cached Cloud payloads refresh normally.
update public.lf_cloud c set data=c.data,revision=c.revision+1,updated_at=now()
where exists (
 select 1 from jsonb_array_elements(c.data->'history') v
 where v->>'parent_version_id' is not null and not exists (
  select 1 from jsonb_array_elements(c.data->'history') p
  where p->>'id'=v->>'parent_version_id'
    and (p->>'version_number')::int<(v->>'version_number')::int
 )
);
