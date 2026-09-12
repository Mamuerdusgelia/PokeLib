-- Preserve existing saved-search sharing for Cloud teams. Local teams are never uploaded by sharing a collection.
create function private.lf_clause(terms jsonb,p jsonb) returns boolean language sql immutable set search_path='' as $$
 select (jsonb_array_length(coalesce(p->'set','[]'))=0 and jsonb_array_length(coalesce(p->'free','[]'))=0)
 or exists(select 1 from jsonb_array_elements(terms) s where (s->>'slot')::int>=0
  and not exists(select 1 from jsonb_array_elements(coalesce(p->'set','[]')) q where not (
   exists(select 1 from jsonb_array_elements(terms) x where x->>'slot'=s->>'slot' and x->>'field'=q->>'field' and x->>'value'=q->>'value')
   or (jsonb_array_length(coalesce(q->'equivalent','[]'))>0 and not exists(select 1 from jsonb_array_elements(q->'equivalent') e where not exists(
    select 1 from jsonb_array_elements(terms) x where x->>'slot'=s->>'slot' and x->>'field'=e->>'field' and x->>'value'=e->>'value')))))
  and not exists(select 1 from jsonb_array_elements_text(coalesce(p->'free','[]')) q where not exists(
   select 1 from jsonb_array_elements(terms) x where ((x->>'slot')::int<0 or x->>'slot'=s->>'slot') and x->>'value'=q)))
 or (jsonb_array_length(coalesce(p->'fallback','[]'))>0 and not exists(select 1 from jsonb_array_elements_text(p->'fallback') q where not exists(
  select 1 from jsonb_array_elements(terms) x where (x->>'slot')::int<0 and x->>'value'=q)))
 or (jsonb_array_length(coalesce(p->'set','[]'))=0 and not exists(select 1 from jsonb_array_elements_text(coalesce(p->'free','[]')) q where not exists(
  select 1 from jsonb_array_elements(terms) x where (x->>'slot')::int<0 and x->>'value'=q)))
$$;
create function private.lf_matches(terms jsonb,p jsonb,t jsonb) returns boolean language sql immutable set search_path='' as $$
 select not exists(select 1 from jsonb_array_elements(coalesce(p->'meta','[]')) q where not (
  (q->>'field'='storage' and q->>'value'='cloud') or
  (q->>'field'='year' and q->>'value'='unknown' and t->>'team_date' is null) or
  exists(select 1 from jsonb_array_elements(terms) x where ((x->>'slot')::int<0 or q->>'field'='note') and x->>'field'=q->>'field'
   and (x->>'value'=q->>'value' or (q->>'field'='format' and x->>'value' in(select jsonb_array_elements_text(coalesce(q->'values','[]'))))))))
 and private.lf_clause(terms,p) and not exists(select 1 from jsonb_array_elements(coalesce(p->'clauses','[]')) c where not private.lf_clause(terms,c))
$$;
create table public.lf_collection_links (
 id uuid primary key, owner_id uuid references auth.users(id) on delete set null,
 token text not null unique, data jsonb not null, revision bigint not null default 1, snapshot jsonb
);
alter table public.lf_collection_links enable row level security;
revoke all on public.lf_collection_links from public,anon,authenticated;
create function private.lf_collection_teams(u uuid,d jsonb) returns jsonb language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(private.lf_public(c.data,c.data->'version')||jsonb_build_object('id',c.id,'family_key',coalesce(c.data->>'family_id',c.id::text)) order by
 case when d->'definition'->>'sort' in ('modified_desc','created_desc','date_desc','title_desc') then
  case d->'definition'->>'sort' when 'created_desc' then c.data->>'created_at' when 'date_desc' then c.data->>'team_date' when 'title_desc' then c.data->>'title' else c.data->>'updated_at' end end desc nulls last,
 case d->'definition'->>'sort' when 'created_asc' then c.data->>'created_at' when 'date_asc' then c.data->>'team_date' when 'title_asc' then c.data->>'title' when 'format' then c.data->>'format' when 'source' then c.data->>'source_name' else c.data->>'updated_at' end asc nulls last,c.id),'[]')
 from public.lf_cloud c where c.owner_id=u and c.deleted_at is null
 and (not coalesce((d->'definition'->>'favourite')::boolean,false) or (c.data->>'favourite')::boolean)
 and (not exists(select 1 from jsonb_array_elements(d->'definition'->'filters') f where f->>'field'='year' and f->>'value'='unknown') or c.data->>'team_date' is null)
 and private.lf_matches(c.search_index,d->'definition'->'plan',c.data)
$$;
create function public.lf_collection(action text,payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); c public.lf_collection_links; tok text;
begin
 if u is null then raise exception 'Sign in to share a Cloud collection.'; end if;
 if octet_length(payload::text)>30000 then raise exception 'Collection too large.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(payload->>'id',1));
 select * into c from public.lf_collection_links where id=(payload->>'id')::uuid for update;
 if c.id is not null and c.owner_id is distinct from u then raise exception 'Collection not found.'; end if;
 if action='collection_revoke' then delete from public.lf_collection_links where id=c.id; return jsonb_build_object('ok',true); end if;
 if action not in ('collection_share','collection_save') then raise exception 'Invalid collection action.'; end if;
 if c.id is not null and c.revision<>coalesce((payload->>'expected_revision')::bigint,0) then raise exception 'Shared collection changed; reopen it.'; end if;
 if action='collection_share' then tok:=coalesce(c.token,replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','')); else tok:=c.token; end if;
 if tok is null then raise exception 'Share this collection first.'; end if;
 if c.id is null then insert into public.lf_collection_links(id,owner_id,token,data) values((payload->>'id')::uuid,u,tok,payload->'collection') returning * into c;
 else update public.lf_collection_links set token=tok,data=payload->'collection',revision=revision+1 where id=c.id returning * into c; end if;
 return jsonb_build_object('token',tok,'revision',c.revision);
end $$;
create function public.lf_resolve_collection(p_token text,p_selection jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.lf_collection_links; teams jsonb; result jsonb;
begin
 select * into c from public.lf_collection_links where token=p_token;
 if c.id is null then return null; end if;
 teams:=coalesce(c.snapshot,private.lf_collection_teams(c.owner_id,c.data));
 if p_selection->>'team' is not null then select t into result from jsonb_array_elements(teams) t where t->>'id'=p_selection->>'team'; return result; end if;
 with filtered as (select t,position,row_number() over(partition by t->>'family_key' order by position) rn,
   count(*) over(partition by t->>'family_key') variants from jsonb_array_elements(teams) with ordinality as items(t,position)
   where p_selection->>'family' is null or t->>'family_key'=p_selection->>'family'),
 grouped as (select t||jsonb_build_object('matching_variant_count',variants) t,position from filtered where p_selection->>'family' is not null or rn=1),
 page as (select * from grouped order by position limit 30 offset greatest(0,least(100000,coalesce((p_selection->>'page')::int,0)))*30)
 select jsonb_build_object('name',c.data->'name','description',c.data->'description','mode',case when c.snapshot is null then 'live' else 'snapshot' end,
  'teams',coalesce((select jsonb_agg(t order by position) from page),'[]'),'total',(select count(*) from grouped)) into result;
 return result;
end $$;
revoke all on function public.lf_collection(text,jsonb),public.lf_resolve_collection(text,jsonb) from public;
grant execute on function public.lf_collection(text,jsonb) to authenticated;
grant execute on function public.lf_resolve_collection(text,jsonb) to anon,authenticated;
revoke all on function private.lf_clause(jsonb,jsonb),private.lf_matches(jsonb,jsonb,jsonb),private.lf_collection_teams(uuid,jsonb) from public,anon,authenticated;
create or replace function public.lf_delete_account(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from auth.users where id=p_id for update;
 perform 1 from public.lf_cloud where owner_id=p_id for update;
 update public.lf_collection_links set snapshot=private.lf_collection_teams(p_id,data) where owner_id=p_id;
 update public.lf_shares s set snapshot=private.lf_public(c.data,c.data->'version'),team_id=null,show_history=false
 from public.lf_cloud c where s.team_id=c.id and c.owner_id=p_id;
 delete from auth.users where id=p_id;
end $$;
