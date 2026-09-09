-- Additive migration: legacy team/version IDs and snapshot bytes are untouched.
create table public.team_families(
 id uuid primary key, owner_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(length(title) between 1 and 160),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.team_families enable row level security;
create policy own_families on public.team_families for select to authenticated using(owner_id=(select auth.uid()));
revoke all on public.team_families from public,anon,authenticated;
grant select on public.team_families to authenticated;
alter table public.teams add column family_id uuid references public.team_families(id) on delete cascade,
 add column variant_name text not null default 'Main',
 add column variant_key text not null default 'main',
 add column variant_description text not null default '';
create index teams_owner_family on public.teams(owner_id,family_id,id);
create index teams_owner_effective_family on public.teams(owner_id,coalesce(family_id,id));
create unique index variants_family_name on public.teams(family_id,variant_key);

create function private.variant_family_guard() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then
  if old.family_id is not null and exists(select 1 from public.team_families where id=old.family_id)
   and (select count(*) from public.teams where family_id=old.family_id)=1
   and exists(select 1 from auth.users where id=old.owner_id)
  then raise exception 'Use Delete team family to delete the final variant.';end if;
  return old;
 end if;
 if tg_op='UPDATE' and old.family_id is not null and new.family_id is distinct from old.family_id then raise exception 'Variant family is immutable.';end if;
 if tg_op='INSERT' and new.family_id is null and exists(select 1 from public.team_families where id=new.id) then raise exception 'This ID already belongs to a team family.';end if;
 if new.family_id is not null and not exists(select 1 from public.team_families f where f.id=new.family_id and f.owner_id=new.owner_id and f.title=new.title and f.title=new.metadata->>'title')
 then raise exception 'Invalid family ownership or title. Use Rename team family.';end if;
 return new;
end $$;
create trigger variant_family_guard before insert or update or delete on public.teams for each row execute function private.variant_family_guard();
revoke all on function private.variant_family_guard() from public,anon,authenticated;

create or replace function private.get_team(p_id uuid,p_owner uuid,p_history boolean default true) returns jsonb language sql stable set search_path='' as $$
 select t.metadata||jsonb_build_object('id',t.id,'family_id',t.family_id,'family_key',coalesce(t.family_id,t.id),'variant_name',t.variant_name,'variant_description',t.variant_description,
 'variant_count',case when t.family_id is null then 1 else (select count(*) from public.teams s where s.family_id=t.family_id and s.owner_id=t.owner_id) end,
 'current_version_id',t.current_version_id,'favourite',t.favourite,'archived',t.archived,'created_at',t.created_at,'updated_at',t.updated_at,'imported_at',t.imported_at,'version',v.snapshot)
 ||case when p_history then jsonb_build_object('history',(select coalesce(jsonb_agg(h.snapshot order by h.version_number desc),'[]') from public.team_versions h where h.team_id=t.id),'has_share',exists(select 1 from public.share_links s where s.team_id=t.id and s.revoked_at is null)) else '{}'::jsonb end
 from public.teams t join public.team_versions v on v.id=t.current_version_id and v.team_id=t.id where t.id=p_id and t.owner_id=p_owner
$$;

alter function public.vault(text,jsonb) rename to vault_before_variants;
revoke all on function public.vault_before_variants(text,jsonb) from public,anon,authenticated;
create function public.vault(action text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare u uuid:=auth.uid();t public.teams%rowtype; fid uuid;tid uuid;vid uuid;s jsonb;r jsonb;k jsonb;op uuid;idx int;digest text;receipt public.operation_chunks%rowtype;
 n int;name text;descr text;family_title text;ids jsonb;grouped boolean:=coalesce(payload->'group_families'='true'::jsonb,false);
begin
 if u is null then raise exception 'Please sign in.';end if;
 if octet_length(payload::text)>6000000 then raise exception 'Request too large.';end if;
 -- One owner write lock also covers legacy NULL-family materialization. It avoids
 -- inverted family/team locks in older RPCs and serializes only this owner's writes.
 if action not in ('get','list','facets','family_expand') then perform pg_advisory_xact_lock(hashtextextended('teamvault-write:'||u::text,0));end if;
 if action='facets' and grouped then
  r:=public.vault_before_variants(action,payload);
  return r||jsonb_build_object(
   'all',(select count(distinct coalesce(family_id,id)) from public.teams where owner_id=u and (coalesce(payload->'include_archived'='true'::jsonb,false) or not archived)),
   'favourites',(select count(distinct coalesce(family_id,id)) from public.teams where owner_id=u and favourite and (coalesce(payload->'include_archived'='true'::jsonb,false) or not archived)),
   'archived',(select count(distinct coalesce(family_id,id)) from public.teams where owner_id=u and archived));
 end if;
 if action='list' and (grouped or payload?'family_id') then
  with filtered as (
   select t.id,t.family_id,t.variant_key,t.title,t.format,t.team_date,t.source_name,t.current_version_id,t.created_at,t.updated_at from public.teams t where t.owner_id=u
   and (coalesce(payload->'include_archived'='true'::jsonb,false) or t.archived=coalesce((payload->>'archived')::boolean,false))
   and (not coalesce((payload->>'favourite')::boolean,false) or t.favourite)
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
 end if;
 if action in ('variant_create','family_bulk_delete') then
  k:=case when action='variant_create' then jsonb_build_object('operation_id',payload->'operation_id','chunk_index',0,'request_hash',payload->'request_hash') else payload->'chunk' end;
  op:=(k->>'operation_id')::uuid;idx:=(k->>'chunk_index')::int;digest:=k->>'request_hash';
  if op is null or idx is null or idx not between 0 and 10000 or coalesce(digest,'')!~'^[a-f0-9]{64}$' then raise exception 'Invalid operation.';end if;
  select * into receipt from public.operation_chunks where owner_id=u and operation_id=op and chunk_index=idx;
  if found then
   if receipt.kind<>action or receipt.request_hash<>digest then raise exception 'This retry differs from the original operation.';end if;
   if action='variant_create' then return private.get_team((receipt.result->>'id')::uuid,u);end if;
   return receipt.result;
  end if;
 end if;
 if action in ('family_expand','family_bulk_delete') then
  ids:=payload->'ids';
  if jsonb_typeof(ids) is distinct from 'array' then raise exception 'Invalid family selection.';end if;
  if jsonb_array_length(ids) not between 1 and (case when action='family_bulk_delete' then 5 else 10000 end)
   or jsonb_array_length(ids)<>(select count(distinct value) from jsonb_array_elements_text(ids))
   then raise exception 'Invalid family selection.';end if;
  select count(distinct coalesce(family_id,id)) into n from public.teams where owner_id=u and coalesce(family_id,id) in (select value::uuid from jsonb_array_elements_text(ids));
  if n<>jsonb_array_length(ids) then raise exception 'A selected family is missing or belongs to another account.';end if;
  if action='family_expand' then
   select jsonb_build_object('ids',jsonb_agg(id order by id),'families',n) into r from (select id from public.teams where owner_id=u and coalesce(family_id,id) in (select value::uuid from jsonb_array_elements_text(ids)) limit 10001)x;
   if jsonb_array_length(r->'ids')>10000 then raise exception 'Narrow your selection to at most 10,000 variants.';end if;
   return r;
  end if;
  delete from public.team_families where owner_id=u and id in (select value::uuid from jsonb_array_elements_text(ids));
  delete from public.teams where owner_id=u and family_id is null and id in (select value::uuid from jsonb_array_elements_text(ids));
  r:=jsonb_build_object('count',n);
 elsif action in ('variant_create','variant_rename','variant_delete','family_rename') then
  select * into t from public.teams where id=(payload->>'id')::uuid and owner_id=u for update;
  if not found then raise exception 'Team not found.';end if;
  fid:=coalesce(t.family_id,t.id);
  if action='variant_delete' then
   if t.family_id is null or (select count(*) from public.teams where family_id=fid)<2 then raise exception 'Use Delete team family to delete the final variant.';end if;
   delete from public.teams where id=t.id;return '{"deleted":true}';
  end if;
  if t.updated_at is distinct from (payload->>'expected_updated_at')::timestamptz then raise exception 'This team changed. Reload before saving.';end if;
  if action='family_rename' then
   family_title:=trim(payload->>'title');
   if coalesce(length(family_title),0) not between 1 and 160 then raise exception 'Enter a team title of 1–160 characters.';end if;
   update public.team_families set title=family_title,updated_at=clock_timestamp() where id=fid and owner_id=u;
   update public.teams set title=family_title,metadata=jsonb_set(metadata,'{title}',to_jsonb(family_title)),updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where owner_id=u and coalesce(family_id,id)=fid;
   delete from public.search_terms where version_id='' and field='team' and team_id in(select id from public.teams where owner_id=u and coalesce(family_id,id)=fid);
   insert into public.search_terms select t.id,'',-1,'team',regexp_replace(lower(w),'[^a-z0-9]','','g') from public.teams t cross join lateral regexp_split_to_table(payload->>'title','[^[:alnum:]]+') w where t.owner_id=u and coalesce(t.family_id,t.id)=fid and w<>'' on conflict do nothing;
   return private.get_team(t.id,u);
  end if;
  name:=trim(regexp_replace(payload->>'name','\s+',' ','g'));descr:=coalesce(payload->>'description','');
  if coalesce(length(name),0) not between 1 and 80 or length(descr)>1000 then raise exception 'Invalid variant name or description.';end if;
  if action='variant_rename' then
   update public.teams set variant_name=name,variant_key=lower(name),variant_description=descr,updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where id=t.id;
   return private.get_team(t.id,u);
  end if;
  select snapshot into s from public.team_versions where team_id=t.id and id=t.current_version_id;
  if t.current_version_id is distinct from (payload->>'expected')::uuid or coalesce(s->>'edit_revision',t.current_version_id::text) is distinct from payload->>'expected_revision' then raise exception 'This team changed. Reload before creating a variant.';end if;
  select snapshot into s from public.team_versions where team_id=t.id and id=(payload->>'version_id')::uuid;
  if not found then raise exception 'Version not found.';end if;
  tid:=gen_random_uuid();vid:=gen_random_uuid();
  s:=s||jsonb_build_object('id',vid,'edit_revision',vid,'team_id',tid,'version_number',1,'parent_version_id',null,'created_at',clock_timestamp());
  insert into public.team_families(id,owner_id,title,created_at) values(fid,u,t.title,t.created_at) on conflict do nothing;
  update public.teams set family_id=fid where id=t.id and family_id is null;
  insert into public.teams(id,owner_id,family_id,variant_name,variant_key,variant_description,metadata,title,format,team_date,source_name,current_version_id,imported_at)
   values(tid,u,fid,name,lower(name),descr,t.metadata,t.title,t.format,t.team_date,t.source_name,vid,t.imported_at);
  insert into public.team_versions(id,team_id,version_number,snapshot) values(vid,tid,1,s);
  insert into public.search_terms select tid,case when version_id='' then '' else vid::text end,slot,field,value from public.search_terms where team_id=t.id and (version_id='' or version_id=payload->>'version_id');
  -- Rebuild metadata tokens/tags using only this variant's one history revision.
  perform public.vault_before_variants('bulk',jsonb_build_object('ids',jsonb_build_array(tid),'patch','{}'::jsonb));
  r:=jsonb_build_object('id',tid);
 else return public.vault_before_variants(action,payload);
 end if;
 insert into public.operation_chunks(owner_id,operation_id,chunk_index,kind,request_hash,result) values(u,op,idx,action,digest,r);
 if action='variant_create' then return private.get_team(tid,u);end if;
 return r;
end $$;
create or replace function public.resolve_share(p_token text,p_version int default null) returns jsonb language sql stable security definer set search_path='' as $$
 select t.metadata||jsonb_build_object('id',t.id,'variant_name',t.variant_name,'variant_description',t.variant_description,'current_version_id',t.current_version_id,'version',v.snapshot-'set_editing')
 from public.share_links s join public.teams t on t.id=s.team_id join public.team_versions v on v.team_id=t.id and ((p_version is null and v.id=t.current_version_id) or v.version_number=p_version)
 where p_token~'^[a-f0-9]{64}$' and s.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and s.revoked_at is null and (p_version is null or p_version>0)
 limit 1
$$;
revoke all on function public.vault(text,jsonb) from public,anon,authenticated;
grant execute on function public.vault(text,jsonb) to authenticated;

create or replace function public.delete_team(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();
begin
 if u is null then raise exception 'Please sign in.';end if;
 perform pg_advisory_xact_lock(hashtextextended('teamvault-write:'||u::text,0));
 delete from public.teams where id=p_id and owner_id=u;
 if not found then raise exception 'Team not found.';end if;
 return '{"deleted":true}';
end $$;
