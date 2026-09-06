-- TeamVault / PostgreSQL 15+. Apply once through Supabase migrations.
-- No service-role key is required by the application.
create schema if not exists private;
revoke all on schema private from public;
create table public.profiles(id uuid primary key references auth.users(id) on delete cascade, display_name text, created_at timestamptz not null default now());
create table public.teams(
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 metadata jsonb not null, title text not null check(length(title) between 1 and 160),
 format text not null, team_date text, source_name text not null default '',
 current_version_id uuid, favourite boolean not null default false, archived boolean not null default false,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), imported_at timestamptz
);
create table public.team_versions(
 id uuid primary key default gen_random_uuid(), team_id uuid not null references public.teams(id) on delete cascade,
 version_number integer not null check(version_number>0), snapshot jsonb not null,
 parent_version_id uuid, created_at timestamptz not null default now(),
 unique(team_id,version_number), unique(team_id,id),
 foreign key(team_id,parent_version_id) references public.team_versions(team_id,id)
);
alter table public.teams add constraint current_version_same_team foreign key(id,current_version_id) references public.team_versions(team_id,id) deferrable initially deferred;
create table public.search_terms(
 team_id uuid not null references public.teams(id) on delete cascade, version_id text not null,
 slot integer not null check(slot between -1 and 23), field text not null, value text not null,
 primary key(team_id,version_id,slot,field,value)
);
create index terms_lookup on public.search_terms(field,value,team_id,version_id,slot);
create index teams_owner_updated on public.teams(owner_id,archived,updated_at desc,id);
create index teams_owner_title on public.teams(owner_id,lower(title),id);
create index teams_owner_date on public.teams(owner_id,team_date,id);
create table public.tags(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users(id) on delete cascade,display_name text not null,normalized_name text not null,unique(owner_id,normalized_name));
create table public.team_tags(team_id uuid not null references public.teams(id) on delete cascade,tag_id uuid not null references public.tags(id) on delete cascade,primary key(team_id,tag_id));
create table public.share_links(id uuid primary key default gen_random_uuid(),team_id uuid not null references public.teams(id) on delete cascade,token_hash text not null unique check(token_hash~'^[a-f0-9]{64}$'),created_at timestamptz not null default now(),revoked_at timestamptz);
create index share_team on public.share_links(team_id);
alter table public.profiles enable row level security;
alter table public.teams enable row level security;
alter table public.team_versions enable row level security;
alter table public.search_terms enable row level security;
alter table public.tags enable row level security;
alter table public.team_tags enable row level security;
alter table public.share_links enable row level security;
create policy own_profile on public.profiles for select to authenticated using(id=(select auth.uid()));
create policy own_teams on public.teams for select to authenticated using(owner_id=(select auth.uid()));
create policy own_versions on public.team_versions for select to authenticated using(exists(select 1 from public.teams t where t.id=team_id and t.owner_id=(select auth.uid())));
create policy own_terms on public.search_terms for select to authenticated using(exists(select 1 from public.teams t where t.id=team_id and t.owner_id=(select auth.uid())));
create policy own_tags on public.tags for select to authenticated using(owner_id=(select auth.uid()));
create policy own_team_tags on public.team_tags for select to authenticated using(exists(select 1 from public.teams t where t.id=team_id and t.owner_id=(select auth.uid())));
create policy own_shares on public.share_links for select to authenticated using(exists(select 1 from public.teams t where t.id=team_id and t.owner_id=(select auth.uid())));
revoke all on public.profiles,public.teams,public.team_versions,public.search_terms,public.tags,public.team_tags,public.share_links from anon,authenticated;
grant select on public.profiles,public.teams,public.team_versions,public.search_terms,public.tags,public.team_tags to authenticated;
-- Tokens and hashes are deliberately never returned through owner table reads.
create function private.immutable_version() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Historical versions are immutable. Create a new version.'; end $$;
create trigger immutable_version before update on public.team_versions for each row execute function private.immutable_version();
create function private.check_meta(m jsonb) returns void language plpgsql set search_path='' as $$
declare d text:=m->>'team_date'; precision text:=m->>'team_date_precision'; expanded text;
begin
 if jsonb_typeof(m) is distinct from 'object' or length(coalesce(m->>'title','')) not between 1 and 160 or octet_length(m::text)>80000 or jsonb_typeof(m->'format') is distinct from 'string' then raise exception 'Invalid team metadata.';end if;
 if jsonb_typeof(m->'tags') is distinct from 'array' or jsonb_array_length(m->'tags')>30 then raise exception 'Invalid tags.';end if;
 if precision is null or precision not in ('unknown','year','month','exact') then raise exception 'Invalid date precision.';end if;
 if precision='unknown' then if d is not null then raise exception 'Unknown dates must be null.';end if;
 else
  if d is null or not (case precision when 'year' then d~'^\d{4}$' when 'month' then d~'^\d{4}-\d{2}$' else d~'^\d{4}-\d{2}-\d{2}$' end) then raise exception 'Invalid historical date.';end if;
  expanded:=case precision when 'year' then d||'-01-01' when 'month' then d||'-01' else d end;
  if to_char(expanded::date,'YYYY-MM-DD')<>expanded or substring(d,1,4)::int<1900 then raise exception 'Invalid historical date.';end if;
 end if;
 if coalesce(m->>'source_url','')<>'' and not (m->>'source_url'~*'^https?://') then raise exception 'Invalid source URL.';end if;
 if coalesce(m->>'source_type','') not in ('Self-built','Copied from','Received from','Adapted from','Tournament','Website','Discord','Other') then raise exception 'Invalid source type.';end if;
end $$;
create function private.check_snapshot(s jsonb) returns void language plpgsql set search_path='' as $$
begin
 if jsonb_typeof(s) is distinct from 'object' or octet_length(s::text)>500000 or length(coalesce(s->>'showdown_text','')) not between 1 and 150000 or jsonb_typeof(s->'parsed_team') is distinct from 'array' or jsonb_array_length(s->'parsed_team') not between 1 and 24 or jsonb_typeof(s->'set_notes') is distinct from 'array' or jsonb_typeof(s->'team_notes') is distinct from 'string' or jsonb_typeof(s->'original_text') is distinct from 'string' or jsonb_typeof(s->'version_comment') is distinct from 'string' then raise exception 'Invalid team snapshot.';end if;
 if exists(select 1 from jsonb_array_elements(s->'parsed_team') p where jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(p->'species') is distinct from 'string' or jsonb_typeof(p->'moves') is distinct from 'array') or exists(select 1 from jsonb_array_elements(s->'set_notes') n where jsonb_typeof(n) is distinct from 'string' or length(n::text)>10002) then raise exception 'Invalid set data.';end if;
end $$;
create function private.get_team(p_id uuid,p_owner uuid,p_history boolean default true) returns jsonb language sql stable set search_path='' as $$
 select t.metadata||jsonb_build_object('id',t.id,'current_version_id',t.current_version_id,'favourite',t.favourite,'archived',t.archived,'created_at',t.created_at,'updated_at',t.updated_at,'imported_at',t.imported_at,'version',v.snapshot)
 ||case when p_history then jsonb_build_object('history',(select coalesce(jsonb_agg(h.snapshot order by h.version_number desc),'[]') from public.team_versions h where h.team_id=t.id),'has_share',exists(select 1 from public.share_links s where s.team_id=t.id and s.revoked_at is null)) else '{}'::jsonb end
 from public.teams t join public.team_versions v on v.id=t.current_version_id and v.team_id=t.id where t.id=p_id and t.owner_id=p_owner
$$;
create function private.index_team(p_id uuid,p_owner uuid,m jsonb,terms jsonb) returns void language plpgsql set search_path='' as $$
declare tag text; tagid uuid; term jsonb; tag_names jsonb:='[]';
begin
 if jsonb_typeof(terms)<>'array' or jsonb_array_length(terms)>6000 then raise exception 'Invalid search index.';end if;
 delete from public.search_terms where team_id=p_id and version_id='';
 for term in select value from jsonb_array_elements(terms) loop
  insert into public.search_terms(team_id,version_id,slot,field,value) values(p_id,term->>'version_id',(term->>'slot')::int,term->>'field',term->>'value') on conflict do nothing;
 end loop;
 delete from public.team_tags where team_id=p_id;
 for tag in select distinct trim(regexp_replace(value,'\s+',' ','g')) from jsonb_array_elements_text(m->'tags') loop
  if length(tag) not between 1 and 60 then raise exception 'Invalid tag.';end if;
  insert into public.tags(owner_id,display_name,normalized_name) values(p_owner,tag,lower(tag)) on conflict(owner_id,normalized_name) do nothing;
  select id,display_name into tagid,tag from public.tags where owner_id=p_owner and normalized_name=lower(tag);
  insert into public.team_tags(team_id,tag_id) values(p_id,tagid) on conflict do nothing;
  tag_names:=tag_names||jsonb_build_array(tag);
 end loop;
 update public.teams set metadata=jsonb_set(metadata,'{tags}',tag_names) where id=p_id and owner_id=p_owner;
end $$;
create function private.matches(p_id uuid,p_current uuid,p jsonb) returns boolean language sql stable set search_path='' as $$
 select not exists(select 1 from jsonb_array_elements(coalesce(p->'meta','[]')) q where not exists(select 1 from public.search_terms m where m.team_id=p_id and m.version_id='' and m.field=q->>'field' and m.value=q->>'value'))
 and (
 (jsonb_array_length(coalesce(p->'set','[]'))=0 and jsonb_array_length(coalesce(p->'free','[]'))=0)
 or exists(
 select 1 from public.search_terms s where s.team_id=p_id and s.version_id=p_current::text and s.slot>=0
 and not exists(select 1 from jsonb_array_elements(coalesce(p->'set','[]')) q where not exists(select 1 from public.search_terms x where x.team_id=p_id and x.version_id=s.version_id and x.slot=s.slot and x.field=q->>'field' and x.value=q->>'value'))
 and not exists(select 1 from jsonb_array_elements_text(coalesce(p->'free','[]')) q where not exists(select 1 from public.search_terms x where x.team_id=p_id and (x.version_id='' or (x.version_id=s.version_id and x.slot=s.slot)) and x.value=q))
 ) or (jsonb_array_length(coalesce(p->'fallback','[]'))>0 and not exists(select 1 from jsonb_array_elements_text(p->'fallback') q where not exists(select 1 from public.search_terms f where f.team_id=p_id and f.version_id='' and f.value=q))) )
$$;
create function public.vault(action text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); tid uuid; vid uuid; currentid uuid; parentid uuid; n int; m jsonb; s jsonb; r jsonb; entry jsonb; terms jsonb; ids jsonb:='[]'; patch jsonb; tag text;
begin
 if u is null then raise exception 'Please sign in.';end if;
 if octet_length(payload::text)>6000000 then raise exception 'Request too large.';end if;
 insert into public.profiles(id) values(u) on conflict do nothing;
 if action='get' then
  r:=private.get_team((payload->>'id')::uuid,u);if r is null then raise exception 'Team not found.';end if;return r;
 elsif action='list' then
  with filtered as (
   select t.* from public.teams t where t.owner_id=u and t.archived=coalesce((payload->>'archived')::boolean,false)
   and (not coalesce((payload->>'favourite')::boolean,false) or t.favourite)
   and (coalesce(payload->>'format','')='' or t.format=payload->>'format')
   and (coalesce(payload->>'source','')='' or t.source_name=payload->>'source')
   and (coalesce(payload->>'year','')='' or (payload->>'year'='unknown' and t.team_date is null) or substring(t.team_date,1,4)=payload->>'year')
   and (coalesce(payload->>'tag','')='' or exists(select 1 from public.team_tags tt join public.tags tg on tg.id=tt.tag_id where tt.team_id=t.id and tg.normalized_name=lower(payload->>'tag')))
   and private.matches(t.id,t.current_version_id,coalesce(payload->'plan','{}'))
  ), page as (
   select t.* from filtered t order by
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
  ) select jsonb_build_object('total',(select count(*) from filtered),'teams',coalesce((select jsonb_agg(private.get_team(t.id,u,false)) from page t),'[]')) into r;return r;
 elsif action='facets' then
  return jsonb_build_object(
   'formats',(select coalesce(jsonb_agg(x.format order by x.format),'[]') from (select distinct format from public.teams where owner_id=u)x),
   'sources',(select coalesce(jsonb_agg(x.source_name order by x.source_name),'[]') from (select distinct source_name from public.teams where owner_id=u and source_name<>'')x),
   'years',(select coalesce(jsonb_agg(x.team_year order by x.team_year),'[]') from (select distinct substring(team_date,1,4) as team_year from public.teams where owner_id=u and team_date is not null)x),
   'tags',(select coalesce(jsonb_agg(display_name order by normalized_name),'[]') from public.tags where owner_id=u),
   'all',(select count(*) from public.teams where owner_id=u and not archived),
   'favourites',(select count(*) from public.teams where owner_id=u and favourite and not archived),
   'archived',(select count(*) from public.teams where owner_id=u and archived));
 elsif action='import' then
  if jsonb_typeof(payload->'teams')<>'array' or jsonb_array_length(payload->'teams') not between 1 and 200 then raise exception 'Import 1–200 teams.';end if;
  for entry in select value from jsonb_array_elements(payload->'teams') loop
   tid:=(entry->>'id')::uuid;vid:=(entry->'snapshot'->>'id')::uuid;m:=entry->'meta';s:=entry->'snapshot';
   perform private.check_meta(m);perform private.check_snapshot(s);
   s:=s||jsonb_build_object('id',vid,'team_id',tid,'version_number',1,'parent_version_id',null,'created_at',now());
   insert into public.teams(id,owner_id,metadata,title,format,team_date,source_name,current_version_id,imported_at) values(tid,u,m,m->>'title',m->>'format',m->>'team_date',m->>'source_name',vid,case when (entry->>'imported')::boolean then now() end);
   insert into public.team_versions(id,team_id,version_number,snapshot) values(vid,tid,1,s);
   perform private.index_team(tid,u,m,entry->'terms');ids:=ids||jsonb_build_array(tid);
  end loop;
  return jsonb_build_object('ids',ids,'count',jsonb_array_length(ids));
 elsif action='bulk' then
  if jsonb_array_length(payload->'ids') not between 1 and 200 then raise exception 'Select 1–200 teams.';end if;
  -- Lock all owned targets in a stable order before applying any writes.
  for tid in select value::uuid from jsonb_array_elements_text(payload->'ids') order by value loop
   perform 1 from public.teams where id=tid and owner_id=u for update;if not found then raise exception 'Team not found.';end if;
  end loop;
  patch:=payload->'patch';
  for tid in select value::uuid from jsonb_array_elements_text(payload->'ids') loop
   select metadata into m from public.teams where id=tid and owner_id=u;
   m:=m||(patch-'tags'-'favourite'-'archived');
   if patch?'tags' then m:=jsonb_set(m,'{tags}',(select coalesce(jsonb_agg(v),'[]') from (select distinct value v from jsonb_array_elements((m->'tags')||(patch->'tags')))x));end if;
   perform private.check_meta(m);
   update public.teams set metadata=m,title=m->>'title',format=m->>'format',team_date=m->>'team_date',source_name=m->>'source_name',favourite=coalesce((patch->>'favourite')::boolean,favourite),archived=coalesce((patch->>'archived')::boolean,archived),updated_at=now() where id=tid and owner_id=u;
   -- Rebuild changed metadata tokens in SQL; set tokens and notes are untouched.
   delete from public.search_terms where team_id=tid and version_id='' and field in ('tag','source','year','format','team','text');
   insert into public.search_terms select tid,'',-1,'tag',regexp_replace(lower(value),'[^a-z0-9]','','g') from jsonb_array_elements_text(m->'tags') on conflict do nothing;
   insert into public.search_terms select tid,'',-1,'text',regexp_replace(lower(w),'[^a-z0-9]','','g') from jsonb_array_elements_text(m->'tags') v cross join lateral regexp_split_to_table(v,'\s+') w where w<>'' on conflict do nothing;
   insert into public.search_terms select tid,'',-1,'source',regexp_replace(lower(w),'[^a-z0-9]','','g') from regexp_split_to_table(concat_ws(' ',m->>'source_type',m->>'source_name',m->>'source_note',m->>'source_url'),'[^[:alnum:]]+') w where w<>'' on conflict do nothing;
   insert into public.search_terms values(tid,'',-1,'year',coalesce(substring(m->>'team_date',1,4),'')),(tid,'',-1,'format',regexp_replace(lower(m->>'format'),'[^a-z0-9]','','g')) on conflict do nothing;
   insert into public.search_terms select tid,'',-1,'team',regexp_replace(lower(w),'[^a-z0-9]','','g') from regexp_split_to_table(m->>'title','[^[:alnum:]]+') w where w<>'' on conflict do nothing;
   insert into public.search_terms select tid,'',-1,'text',regexp_replace(lower(w),'[^a-z0-9]','','g') from public.team_versions v cross join lateral regexp_split_to_table(v.snapshot->>'version_comment','[^[:alnum:]]+') w where v.team_id=tid and w<>'' on conflict do nothing;
   select coalesce(jsonb_agg(jsonb_build_object('version_id',version_id,'slot',slot,'field',field,'value',value)),'[]') into terms from public.search_terms where team_id=tid and version_id='';
   perform private.index_team(tid,u,m,terms);
  end loop;
  return jsonb_build_object('count',jsonb_array_length(payload->'ids'));
 elsif action in ('version','patch','share','revoke') then
  tid:=(payload->>'id')::uuid;
  select current_version_id into currentid from public.teams where id=tid and owner_id=u for update;
  if not found then raise exception 'Team not found.';end if;
  if action='version' then
   if currentid is distinct from (payload->>'expected')::uuid then raise exception 'This team changed in another window. Reload it before saving.';end if;
   parentid:=(payload->>'parent')::uuid;
   if not exists(select 1 from public.team_versions where team_id=tid and id=parentid) then raise exception 'Version not found.';end if;
   select max(version_number)+1 into n from public.team_versions where team_id=tid;
   m:=payload->'meta';s:=payload->'snapshot';vid:=(s->>'id')::uuid;
   perform private.check_meta(m);perform private.check_snapshot(s);
   s:=s||jsonb_build_object('id',vid,'team_id',tid,'version_number',n,'parent_version_id',parentid,'created_at',now());
   insert into public.team_versions(id,team_id,version_number,snapshot,parent_version_id) values(vid,tid,n,s,parentid);
   update public.teams set metadata=m,title=m->>'title',format=m->>'format',team_date=m->>'team_date',source_name=m->>'source_name',current_version_id=vid,updated_at=now() where id=tid;
   perform private.index_team(tid,u,m,payload->'terms');return private.get_team(tid,u);
  elsif action='patch' then
   if not exists(select 1 from public.teams where id=tid and updated_at=(payload->>'expected_updated_at')::timestamptz) then raise exception 'Team details changed. Reload before saving.';end if;
   m:=payload->'meta';perform private.check_meta(m);
   update public.teams set metadata=m,title=m->>'title',format=m->>'format',team_date=m->>'team_date',source_name=m->>'source_name',favourite=(payload->>'favourite')::boolean,archived=(payload->>'archived')::boolean,updated_at=now() where id=tid;
   perform private.index_team(tid,u,m,payload->'terms');return private.get_team(tid,u);
  elsif action='share' then
   update public.share_links set revoked_at=now() where team_id=tid and revoked_at is null;
   insert into public.share_links(team_id,token_hash) values(tid,payload->>'token_hash');return '{"created":true}';
  else
   update public.share_links set revoked_at=now() where team_id=tid and revoked_at is null;return '{"revoked":true}';
  end if;
 end if;
 raise exception 'Unknown action.';
end $$;
create function public.resolve_share(p_token text,p_version int default null) returns jsonb language sql stable security definer set search_path='' as $$
 select t.metadata||jsonb_build_object('id',t.id,'current_version_id',t.current_version_id,'version',v.snapshot)
 from public.share_links s join public.teams t on t.id=s.team_id join public.team_versions v on v.team_id=t.id and ((p_version is null and v.id=t.current_version_id) or v.version_number=p_version)
 where p_token~'^[a-f0-9]{64}$' and s.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and s.revoked_at is null and (p_version is null or p_version>0)
 limit 1
$$;
revoke execute on all functions in schema private from public,anon,authenticated;
revoke execute on function public.vault(text,jsonb) from public,anon,authenticated;
revoke execute on function public.resolve_share(text,int) from public,anon,authenticated;
grant execute on function public.vault(text,jsonb) to authenticated;
grant execute on function public.resolve_share(text,int) to anon,authenticated;
