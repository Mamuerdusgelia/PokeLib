-- Query-only migration. Existing snapshots, terms, collections and permissions stay intact.
-- One clause retains same-slot matching, including a Mega's base + required item.
create function private.matches_clause(p_id uuid,p_current uuid,p jsonb) returns boolean language sql stable set search_path='' as $$
 select
 (jsonb_array_length(coalesce(p->'set','[]'))=0 and jsonb_array_length(coalesce(p->'free','[]'))=0)
 or exists(
   select 1 from public.search_terms s
   where s.team_id=p_id and s.version_id=p_current::text and s.slot>=0
   and (jsonb_array_length(coalesce(p->'set','[]'))=0
     or (s.field=p->'set'->0->>'field' and s.value=p->'set'->0->>'value')
     or (s.field=p->'set'->0->'equivalent'->0->>'field' and s.value=p->'set'->0->'equivalent'->0->>'value'))
   and not exists(
     select 1 from jsonb_array_elements(coalesce(p->'set','[]')) q
     where not (
       exists(select 1 from public.search_terms x where x.team_id=p_id and x.version_id=s.version_id and x.slot=s.slot and x.field=q->>'field' and x.value=q->>'value')
       or (jsonb_array_length(coalesce(q->'equivalent','[]'))>0 and not exists(
         select 1 from jsonb_array_elements(q->'equivalent') e where not exists(
           select 1 from public.search_terms x where x.team_id=p_id and x.version_id=s.version_id and x.slot=s.slot and x.field=e->>'field' and x.value=e->>'value')))))
   and not exists(select 1 from jsonb_array_elements_text(coalesce(p->'free','[]')) q where not exists(select 1 from public.search_terms x where x.team_id=p_id and (x.version_id='' or (x.version_id=s.version_id and x.slot=s.slot)) and x.value=q))
 )
 or (jsonb_array_length(coalesce(p->'fallback','[]'))>0 and not exists(select 1 from jsonb_array_elements_text(p->'fallback') q where not exists(select 1 from public.search_terms f where f.team_id=p_id and f.version_id='' and f.value=q)))
$$;
revoke all on function private.matches_clause(uuid,uuid,jsonb) from public,anon,authenticated;

create or replace function private.matches(p_id uuid,p_current uuid,p jsonb) returns boolean language sql stable set search_path='' as $$
 select not exists(select 1 from jsonb_array_elements(coalesce(p->'meta','[]')) q where not exists(select 1 from public.search_terms m where m.team_id=p_id and (m.version_id='' or ((q->>'field')='note' and m.version_id=p_current::text)) and m.field=q->>'field' and (m.value=q->>'value' or (q->>'field'='format' and m.value in (select jsonb_array_elements_text(coalesce(q->'values','[]')))))))
 and private.matches_clause(p_id,p_current,p)
 and not exists(select 1 from jsonb_array_elements(coalesce(p->'clauses','[]')) c where not private.matches_clause(p_id,p_current,c))
$$;
revoke all on function private.matches(uuid,uuid,jsonb) from public,anon,authenticated;
