-- Save replaces only the current version's content. Existing snapshots need no rewrite:
-- coalesce(snapshot->>'edit_revision', id::text) is the optimistic revision token.
create or replace function private.immutable_version() returns trigger language plpgsql set search_path='' as $$
declare currentid uuid;
begin
 select current_version_id into currentid from public.teams where id=old.team_id for update;
 if currentid is distinct from old.id then raise exception 'Historical versions are immutable';end if;
 if new.id is distinct from old.id or new.team_id is distinct from old.team_id
  or new.version_number is distinct from old.version_number or new.created_at is distinct from old.created_at
  or new.parent_version_id is distinct from old.parent_version_id
  or new.snapshot->'id' is distinct from old.snapshot->'id'
  or new.snapshot->'team_id' is distinct from old.snapshot->'team_id'
  or new.snapshot->'version_number' is distinct from old.snapshot->'version_number'
  or new.snapshot->'parent_version_id' is distinct from old.snapshot->'parent_version_id'
  or new.snapshot->'created_at' is distinct from old.snapshot->'created_at'
  or new.snapshot->'original_text' is distinct from old.snapshot->'original_text'
  or new.snapshot->'version_comment' is distinct from old.snapshot->'version_comment'
  or jsonb_typeof(new.snapshot->'edit_revision') is distinct from 'string'
  or length(new.snapshot->>'edit_revision')=0
  or new.snapshot->>'edit_revision' is not distinct from coalesce(old.snapshot->>'edit_revision',old.id::text)
 then raise exception 'Current version identity is immutable; saves require a new edit revision';end if;
 return new;
end $$;

create function private.forward_version_pointer() returns trigger language plpgsql set search_path='' as $$
begin
 if new.current_version_id is distinct from old.current_version_id and not exists(
  select 1 from public.team_versions next join public.team_versions previous on previous.id=old.current_version_id and previous.team_id=old.id
  where next.id=new.current_version_id and next.team_id=new.id and next.version_number>previous.version_number
 ) then raise exception 'Invalid team version pointer: historical versions cannot become current';end if;
 return new;
end $$;
create trigger version_pointer_guard before update of current_version_id on public.teams for each row execute function private.forward_version_pointer();
revoke all on function private.forward_version_pointer() from public,anon,authenticated;

-- The existing authenticated dispatcher retains all other operations unchanged.
create or replace function public.vault(action text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); tid uuid; vid uuid; currentid uuid; currentupdated timestamptz; current_snapshot jsonb; parentid uuid; n int; m jsonb; s jsonb; r jsonb; entry jsonb; terms jsonb; ids jsonb:='[]'; patch jsonb; tag text; include_archived boolean:=coalesce(payload->'include_archived'='true'::jsonb,false);
begin
 if u is null then raise exception 'Please sign in.';end if;
 if octet_length(payload::text)>6000000 then raise exception 'Request too large.';end if;
 insert into public.profiles(id) values(u) on conflict do nothing;
 if action='get' then
  r:=private.get_team((payload->>'id')::uuid,u);if r is null then raise exception 'Team not found.';end if;return r;
 elsif action='list' then
  with filtered as (
   select t.* from public.teams t where t.owner_id=u and (include_archived or t.archived=coalesce((payload->>'archived')::boolean,false))
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
   'all',(select count(*) from public.teams where owner_id=u and (include_archived or not archived)),
   'favourites',(select count(*) from public.teams where owner_id=u and favourite and (include_archived or not archived)),
   'archived',(select count(*) from public.teams where owner_id=u and archived));
 elsif action='import' then
  if jsonb_typeof(payload->'teams')<>'array' or jsonb_array_length(payload->'teams') not between 1 and 200 then raise exception 'Import 1–200 teams.';end if;
  for entry in select value from jsonb_array_elements(payload->'teams') loop
   tid:=(entry->>'id')::uuid;vid:=(entry->'snapshot'->>'id')::uuid;m:=entry->'meta';s:=entry->'snapshot';
   perform private.check_meta(m);perform private.check_snapshot(s);perform private.check_set_editing(s);
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
   update public.teams set metadata=m,title=m->>'title',format=m->>'format',team_date=m->>'team_date',source_name=m->>'source_name',favourite=coalesce((patch->>'favourite')::boolean,favourite),archived=coalesce((patch->>'archived')::boolean,archived),updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where id=tid and owner_id=u;
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
 elsif action in ('save','version','patch','share','revoke') then
  tid:=(payload->>'id')::uuid;
  select current_version_id,updated_at into currentid,currentupdated from public.teams where id=tid and owner_id=u for update;
  if not found then raise exception 'Team not found.';end if;
  if action in ('save','version') then
   select snapshot into current_snapshot from public.team_versions where id=currentid and team_id=tid;
   if currentid is distinct from (payload->>'expected')::uuid
    or coalesce(current_snapshot->>'edit_revision',currentid::text) is distinct from payload->>'expected_revision'
    or currentupdated is distinct from (payload->>'expected_updated_at')::timestamptz
   then raise exception 'This team changed in another window. Reload it before saving.';end if;
   parentid:=(payload->>'parent')::uuid;
   if action='save' and parentid is distinct from currentid then raise exception 'Historical versions are immutable. Restore as a new version.';end if;
   if not exists(select 1 from public.team_versions where team_id=tid and id=parentid) then raise exception 'Version not found.';end if;
   m:=payload->'meta';s:=payload->'snapshot';
   perform private.check_meta(m);perform private.check_snapshot(s);perform private.check_set_editing(s);
   if action='version' then
    select max(version_number)+1 into n from public.team_versions where team_id=tid;
    vid:=(s->>'id')::uuid;
    s:=s||jsonb_build_object('id',vid,'edit_revision',vid,'team_id',tid,'version_number',n,'parent_version_id',parentid,'created_at',now());
    insert into public.team_versions(id,team_id,version_number,snapshot,parent_version_id) values(vid,tid,n,s,parentid);
   else
    vid:=currentid;
    s:=s||jsonb_build_object('id',vid,'edit_revision',gen_random_uuid(),'team_id',tid,
     'version_number',current_snapshot->'version_number','parent_version_id',current_snapshot->'parent_version_id',
     'created_at',current_snapshot->'created_at','original_text',current_snapshot->'original_text',
     'version_comment',current_snapshot->'version_comment');
    update public.team_versions set snapshot=s where id=vid and team_id=tid;
    delete from public.search_terms where team_id=tid and version_id=vid::text;
   end if;
   update public.teams set metadata=m,title=m->>'title',format=m->>'format',team_date=m->>'team_date',source_name=m->>'source_name',current_version_id=vid,updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where id=tid;
   perform private.index_team(tid,u,m,payload->'terms');return private.get_team(tid,u);
  elsif action='patch' then
   if not exists(select 1 from public.teams where id=tid and updated_at=(payload->>'expected_updated_at')::timestamptz) then raise exception 'Team details changed. Reload before saving.';end if;
   m:=payload->'meta';perform private.check_meta(m);
   update public.teams set metadata=m,title=m->>'title',format=m->>'format',team_date=m->>'team_date',source_name=m->>'source_name',favourite=(payload->>'favourite')::boolean,archived=(payload->>'archived')::boolean,updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where id=tid;
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

revoke execute on function public.vault(text,jsonb) from public,anon,authenticated;
grant execute on function public.vault(text,jsonb) to authenticated;

-- Builder authoring flags are private application state, not part of sharing/export.
create or replace function public.resolve_share(p_token text,p_version int default null) returns jsonb language sql stable security definer set search_path='' as $$
 select t.metadata||jsonb_build_object('id',t.id,'current_version_id',t.current_version_id,'version',v.snapshot-'set_editing')
 from public.share_links s join public.teams t on t.id=s.team_id join public.team_versions v on v.team_id=t.id and ((p_version is null and v.id=t.current_version_id) or v.version_number=p_version)
 where p_token~'^[a-f0-9]{64}$' and s.token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and s.revoked_at is null and (p_version is null or p_version>0)
 limit 1
$$;

create function private.check_set_editing(s jsonb) returns void language plpgsql set search_path='' as $$
begin
 if not s?'set_editing' then return;end if;
 if jsonb_typeof(s->'set_editing') is distinct from 'array' then raise exception 'Invalid set editing metadata.';end if;
 if jsonb_array_length(s->'set_editing')<>jsonb_array_length(s->'parsed_team') then raise exception 'Invalid set editing metadata.';end if;
 if exists(select 1 from jsonb_array_elements(s->'set_editing') e where e<>'null'::jsonb and (
  jsonb_typeof(e) is distinct from 'object' or e->'authored' is distinct from 'true'::jsonb
  or coalesce(e->>'attack_iv','') not in ('eligible','auto','manual') or coalesce(e->>'tera','') not in ('auto','manual')
 )) then raise exception 'Invalid set editing metadata.';end if;
end $$;
revoke all on function private.check_set_editing(jsonb) from public,anon,authenticated;
