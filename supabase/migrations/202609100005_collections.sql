-- Shared query implementation: called only by owner-checked RPCs or the capability resolver.
create function private.list_family_teams(u uuid,payload jsonb) returns jsonb language plpgsql stable set search_path='' as $$
declare r jsonb;grouped boolean:=coalesce(payload->'group_families'='true'::jsonb,false);
begin
  with filtered as (
   select t.id,t.family_id,t.variant_key,t.title,t.format,t.team_date,t.source_name,t.current_version_id,t.created_at,t.updated_at from public.teams t where t.owner_id=u
   and (coalesce(payload->'include_archived'='true'::jsonb,false) or t.archived=coalesce((payload->>'archived')::boolean,false))
   and (not coalesce((payload->>'favourite')::boolean,false) or t.favourite)
   and (not payload?'team_id' or t.id=(payload->>'team_id')::uuid)
   and (not payload?'family_id' or coalesce(t.family_id,t.id)=(payload->>'family_id')::uuid)
   and (coalesce(payload->>'format','')='' or t.format=payload->>'format')
   and (coalesce(payload->>'source','')='' or t.source_name=payload->>'source')
   and (coalesce(payload->>'year','')='' or (payload->>'year'='unknown' and t.team_date is null) or substring(t.team_date,1,4)=payload->>'year')
   and (coalesce(payload->>'tag','')='' or exists(select 1 from public.team_tags tt join public.tags tg on tg.id=tt.tag_id where tt.team_id=t.id and tg.normalized_name=lower(payload->>'tag')))
   and private.matches(t.id,t.current_version_id,coalesce(payload->'plan','{}'))
  ), ranked as (
   select t.*,count(*) over(partition by coalesce(t.family_id,t.id)) matching_variant_count,
    row_number() over(partition by coalesce(t.family_id,t.id) order by case when t.variant_key='main' then 0 else 1 end,t.updated_at desc,t.id) rn from filtered t
  ), selected as (select * from ranked where not grouped or rn=1), page as (
   select t.* from selected t order by
    case when payload->>'sort' in ('date_asc','date_desc') then t.team_date is null end asc,
    case when payload->>'sort'='title_asc' then lower(t.title) end asc,
    case when payload->>'sort'='title_desc' then lower(t.title) end desc,
    case when payload->>'sort'='modified_asc' then t.updated_at end asc,
    case when payload->>'sort'='created_asc' then t.created_at end asc,
    case when payload->>'sort'='created_desc' then t.created_at end desc,
    case when payload->>'sort'='date_asc' then t.team_date end asc,
    case when payload->>'sort'='date_desc' then t.team_date end desc,
    case when payload->>'sort'='format' then t.format end asc,
    case when payload->>'sort'='source' then t.source_name end asc,
    t.updated_at desc,t.id limit 30 offset greatest(0,least(100000,coalesce((payload->>'page')::int,0)))*30
  ) select case when payload->'ids_only'='true'::jsonb then
   jsonb_build_object('ids',coalesce((select jsonb_agg(case when grouped then coalesce(x.family_id,x.id) else x.id end order by x.id) from (select * from selected limit 10001) x),'[]'),'total',(select count(*) from selected))
  else jsonb_build_object('teams',coalesce((select jsonb_agg(private.get_team(p.id,u,false)||jsonb_build_object('matching_variant_count',p.matching_variant_count)) from page p),'[]'),'total',(select count(*) from selected)) end into r;
  if payload->'ids_only'='true'::jsonb and (r->>'total')::int>10000 then raise exception 'Narrow the selection to at most 10,000 families.';end if;
  return r;

end $$;
revoke all on function private.list_family_teams(uuid,jsonb) from public,anon,authenticated;

create table public.collections(
 id uuid primary key,owner_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(length(name) between 1 and 120),name_key text not null,
 description text not null default '' check(length(description)<=1000),definition jsonb not null,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create unique index collections_owner_name on public.collections(owner_id,name_key);
create index collections_owner_updated on public.collections(owner_id,updated_at,id);
create table public.collection_shares(
 id uuid primary key default gen_random_uuid(),collection_id uuid not null references public.collections(id) on delete cascade,
 token_hash text not null unique check(token_hash~'^[a-f0-9]{64}$'),mode text not null default 'live' check(mode='live'),
 created_at timestamptz not null default now(),revoked_at timestamptz
);
create index collection_share_collection on public.collection_shares(collection_id);
alter table public.collections enable row level security;
alter table public.collection_shares enable row level security;
create policy own_collections on public.collections for select to authenticated using(owner_id=(select auth.uid()));
revoke all on public.collections,public.collection_shares from public,anon,authenticated;
grant select on public.collections to authenticated;

create function private.get_collection(p_id uuid,p_owner uuid) returns jsonb language sql stable set search_path='' as $$
 select jsonb_build_object('id',c.id,'name',c.name,'description',c.description,'definition',c.definition,'created_at',c.created_at,'updated_at',c.updated_at,
 'has_share',exists(select 1 from public.collection_shares s where s.collection_id=c.id and s.revoked_at is null))
 from public.collections c where c.id=p_id and c.owner_id=p_owner
$$;
revoke all on function private.get_collection(uuid,uuid) from public,anon,authenticated;

alter function public.vault(text,jsonb) rename to vault_before_collections;
revoke all on function public.vault_before_collections(text,jsonb) from public,anon,authenticated;
create function public.vault(action text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare u uuid:=auth.uid();c public.collections%rowtype;cid uuid;d jsonb;r jsonb;nm text;descr text;pg int;
begin
 if u is null then raise exception 'Please sign in.';end if;
 if octet_length(payload::text)>6000000 then raise exception 'Request too large.';end if;
 if action='list' and (payload->'group_families'='true'::jsonb or payload?'family_id' or payload?'team_id') then return private.list_family_teams(u,payload);end if;
 if action not in ('collection_list','collection_get','collection_save','collection_delete','collection_share','collection_revoke') then return public.vault_before_collections(action,payload);end if;
 if action='collection_list' then
  pg:=coalesce((payload->>'page')::int,0);
  if pg not between 0 and 100000 then raise exception 'Invalid page.';end if;
  return jsonb_build_object('collections',coalesce((select jsonb_agg(private.get_collection(x.id,u) order by x.updated_at desc,x.id) from (select id,updated_at from public.collections where owner_id=u order by updated_at desc,id limit 30 offset pg*30)x),'[]'),'total',(select count(*) from public.collections where owner_id=u));
 end if;
 cid:=(payload->>'id')::uuid;
 if action='collection_get' then
  r:=private.get_collection(cid,u);if r is null then raise exception 'Collection not found.';end if;return r;
 end if;
 perform pg_advisory_xact_lock(hashtextextended('teamvault-collections:'||u::text,0));
 select * into c from public.collections where id=cid and owner_id=u for update;
 if action='collection_save' then
  nm:=btrim(payload->>'name');descr:=btrim(payload->>'description');d:=payload->'definition';
  if coalesce(length(nm),0) not between 1 and 120 or descr is null or length(descr)>1000 then raise exception 'Invalid collection name or description.';end if;
  if jsonb_typeof(d) is distinct from 'object' or d->'version' is distinct from '1'::jsonb
   or jsonb_typeof(d->'query') is distinct from 'string' or length(d->>'query')>400
   or jsonb_typeof(d->'filters') is distinct from 'array' or jsonb_typeof(d->'plan') is distinct from 'object'
   or d->>'sort' not in ('modified_desc','modified_asc','title_asc','title_desc','created_desc','created_asc','date_desc','date_asc','format','source')
   or jsonb_typeof(d->'favourite') is distinct from 'boolean' or octet_length(d::text)>40000
  then raise exception 'Invalid collection filters.';end if;
  if jsonb_array_length(d->'filters')>30 then raise exception 'Invalid collection filters.';end if;
  if c.id is not null and nullif(payload->>'expected_updated_at','') is null then
   if c.name=nm and c.description=descr and c.definition=d then return private.get_collection(cid,u);end if;
   raise exception 'This collection changed in another window. Reopen it before saving.';
  end if;
  if nullif(payload->>'expected_updated_at','') is not null then
   if c.id is null or c.updated_at is distinct from (payload->>'expected_updated_at')::timestamptz then raise exception 'This collection changed in another window. Reopen it before saving.';end if;
   update public.collections set name=nm,name_key=lower(nm),description=descr,definition=d,updated_at=greatest(clock_timestamp(),c.updated_at+interval '1 millisecond') where id=cid and owner_id=u;
  else
   insert into public.collections(id,owner_id,name,name_key,description,definition) values(cid,u,nm,lower(nm),descr,d);
  end if;
  return private.get_collection(cid,u);
 end if;
 if c.id is null then raise exception 'Collection not found.';end if;
 if action='collection_delete' then
  if c.updated_at is distinct from (payload->>'expected_updated_at')::timestamptz then raise exception 'This collection changed in another window. Reopen it before saving.';end if;
  delete from public.collections where id=cid and owner_id=u;return jsonb_build_object('deleted',true);
 end if;
 update public.collection_shares set revoked_at=clock_timestamp() where collection_id=cid and revoked_at is null;
 if action='collection_revoke' then return jsonb_build_object('revoked',true);end if;
 insert into public.collection_shares(collection_id,token_hash) values(cid,payload->>'token_hash');
 return jsonb_build_object('shared',true);
exception when unique_violation then raise exception 'A collection with that name or ID already exists.';
end $$;
revoke all on function public.vault(text,jsonb) from public,anon;
grant execute on function public.vault(text,jsonb) to authenticated;

-- Build an allowlisted projection; never return owner fields, sibling counts or history.
create function private.collection_team(t jsonb,grouped boolean) returns jsonb language sql immutable set search_path='' as $$
 select (select coalesce(jsonb_object_agg(key,value),'{}') from jsonb_each(t) where key in
 ('id','title','format','format_context','team_date','team_date_precision','source_type','source_name','source_url','source_note','tags','current_version_id','variant_name','variant_description'))
 ||jsonb_build_object('version',(t->'version')-'set_editing')
 ||case when grouped then jsonb_build_object('family_key',t->'family_key','matching_variant_count',t->'matching_variant_count') else '{}'::jsonb end
$$;
revoke all on function private.collection_team(jsonb,boolean) from public,anon,authenticated;

create function public.resolve_collection(p_token text,p_selection jsonb default '{}') returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.collections%rowtype;p jsonb;r jsonb;pg int;fid uuid;tid uuid;
begin
 if coalesce(p_token,'')!~'^[a-f0-9]{64}$' or octet_length(p_selection::text)>2000 then return null;end if;
 pg:=coalesce((p_selection->>'page')::int,0);fid:=(p_selection->>'family')::uuid;tid:=(p_selection->>'team')::uuid;
 if pg not between 0 and 100000 or (fid is not null and tid is not null) then return null;end if;
 select co.* into c from public.collections co join public.collection_shares s on s.collection_id=co.id
  where s.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and s.revoked_at is null and s.mode='live';
 if c.id is null then return null;end if;
 p:=jsonb_build_object('plan',c.definition->'plan','sort',c.definition->'sort','favourite',c.definition->'favourite','include_archived',true,
  'year',case when exists(select 1 from jsonb_array_elements(c.definition->'filters') f where f->>'field'='year' and f->>'value'='unknown') then 'unknown' else '' end,
  'group_families',fid is null and tid is null,'page',case when tid is null then pg else 0 end);
 if fid is not null then p:=p||jsonb_build_object('family_id',fid);end if;
 if tid is not null then p:=p||jsonb_build_object('team_id',tid);end if;
 r:=private.list_family_teams(c.owner_id,p);
 if tid is not null then
  if jsonb_array_length(r->'teams')=0 then return null;end if;
  return private.collection_team(r->'teams'->0,false);
 end if;
 return jsonb_build_object('name',c.name,'description',c.description,'mode','live','total',r->'total',
  'teams',(select coalesce(jsonb_agg(private.collection_team(value,true) order by ord),'[]') from jsonb_array_elements(r->'teams') with ordinality x(value,ord)));
end $$;
revoke all on function public.resolve_collection(text,jsonb) from public;
grant execute on function public.resolve_collection(text,jsonb) to anon,authenticated;
