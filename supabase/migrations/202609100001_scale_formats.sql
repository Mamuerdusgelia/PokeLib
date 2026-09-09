-- Append-only indexes; existing rows/snapshots and write guards remain unchanged.
create index teams_owner_modified_id on public.teams(owner_id,updated_at,id);
create index teams_owner_format_id on public.teams(owner_id,format,id);
create index teams_owner_created_id on public.teams(owner_id,created_at,id);
-- Explicit note: filters include current set notes as well as current team notes.
-- Historical set tokens remain indexed but must not satisfy current-library queries.
create or replace function private.matches(p_id uuid,p_current uuid,p jsonb) returns boolean language sql stable set search_path='' as $$
 select not exists(select 1 from jsonb_array_elements(coalesce(p->'meta','[]')) q where not exists(select 1 from public.search_terms m where m.team_id=p_id and (m.version_id='' or ((q->>'field')='note' and m.version_id=p_current::text)) and m.field=q->>'field' and (m.value=q->>'value' or (q->>'field'='format' and m.value in (select jsonb_array_elements_text(coalesce(q->'values','[]')))))))
 and (
 (jsonb_array_length(coalesce(p->'set','[]'))=0 and jsonb_array_length(coalesce(p->'free','[]'))=0)
 or exists(
 select 1 from public.search_terms s where s.team_id=p_id and s.version_id=p_current::text and s.slot>=0 and (jsonb_array_length(coalesce(p->'set','[]'))=0 or (s.field=p->'set'->0->>'field' and s.value=p->'set'->0->>'value'))
 and not exists(select 1 from jsonb_array_elements(coalesce(p->'set','[]')) q where not exists(select 1 from public.search_terms x where x.team_id=p_id and x.version_id=s.version_id and x.slot=s.slot and x.field=q->>'field' and x.value=q->>'value'))
 and not exists(select 1 from jsonb_array_elements_text(coalesce(p->'free','[]')) q where not exists(select 1 from public.search_terms x where x.team_id=p_id and (x.version_id='' or (x.version_id=s.version_id and x.slot=s.slot)) and x.value=q))
 ) or (jsonb_array_length(coalesce(p->'fallback','[]'))>0 and not exists(select 1 from jsonb_array_elements_text(p->'fallback') q where not exists(select 1 from public.search_terms f where f.team_id=p_id and f.version_id='' and f.value=q))) )
$$;
revoke all on function private.matches(uuid,uuid,jsonb) from public,anon,authenticated;

-- Retain the previously validated mutation implementation behind a narrow dispatch wrapper.
alter function public.vault(text,jsonb) rename to vault_before_scale;
revoke all on function public.vault_before_scale(text,jsonb) from public,anon,authenticated;
create function public.vault(action text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();r jsonb;
begin
 if u is null then raise exception 'Please sign in.';end if;
 if octet_length(payload::text)>6000000 then raise exception 'Request too large.';end if;
 if action='list' and payload->'ids_only'='true'::jsonb then
  select jsonb_build_object('ids',coalesce(jsonb_agg(t.id order by t.id),'[]'),'total',count(*)) into r from (
   select t.id from public.teams t where t.owner_id=u
   and (payload->'include_archived'='true'::jsonb or t.archived=coalesce((payload->>'archived')::boolean,false))
   and (not coalesce((payload->>'favourite')::boolean,false) or t.favourite)
   and (coalesce(payload->>'format','')='' or t.format=payload->>'format')
   and (coalesce(payload->>'source','')='' or t.source_name=payload->>'source')
   and (coalesce(payload->>'year','')='' or (payload->>'year'='unknown' and t.team_date is null) or substring(t.team_date,1,4)=payload->>'year')
   and (coalesce(payload->>'tag','')='' or exists(select 1 from public.team_tags tt join public.tags tg on tg.id=tt.tag_id where tt.team_id=t.id and tg.normalized_name=lower(payload->>'tag')))
   and private.matches(t.id,t.current_version_id,coalesce(payload->'plan','{}')) order by t.id limit 10001
  )t;
  if (r->>'total')::int>10000 then raise exception 'Narrow the selection to at most 10,000 teams.';end if;
  return r;
 end if;
 r:=public.vault_before_scale(action,payload);
 if action='facets' then
  r:=r||jsonb_build_object('format_contexts',coalesce((select jsonb_object_agg(x.format,x.context) from (select distinct on(format) format,metadata->'format_context' context from public.teams where owner_id=u and jsonb_typeof(metadata->'format_context')='object' order by format,updated_at desc)x),'{}'));
 end if;
 return r;
end $$;
revoke all on function public.vault(text,jsonb) from public,anon,authenticated;
grant execute on function public.vault(text,jsonb) to authenticated;
alter function private.check_meta(jsonb) rename to check_meta_before_formats;
create function private.check_meta(m jsonb) returns void language plpgsql set search_path='' as $$
begin
 perform private.check_meta_before_formats(m);
 if m?'format_context' and (jsonb_typeof(m->'format_context') is distinct from 'object' or coalesce(m->'format_context'->>'battle','') not in ('singles','doubles') or coalesce(m->'format_context'->>'generation','') !~ '^[1-9]$') then raise exception 'Invalid custom format context.';end if;
end $$;
revoke all on function private.check_meta(jsonb),private.check_meta_before_formats(jsonb) from public,anon,authenticated;
