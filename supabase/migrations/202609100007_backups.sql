-- Full-fidelity portable backup, append-only. No existing snapshots are rewritten.
create table public.backup_generations(owner_id uuid primary key references auth.users(id) on delete cascade,generation bigint not null);
create table public.backup_restores(owner_id uuid not null references auth.users(id) on delete cascade,id uuid not null,state jsonb not null,created_at timestamptz not null default now(),primary key(owner_id,id));
alter table public.backup_generations enable row level security;
alter table public.backup_restores enable row level security;
revoke all on public.backup_generations,public.backup_restores from public,anon,authenticated;
create index backup_teams_order on public.teams(owner_id,coalesce(family_id,id),id);
create function private.backup_generation() returns trigger language plpgsql security definer set search_path='' as $$
declare u uuid; r jsonb;
begin
 r:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 if tg_table_name in ('team_versions','team_tags') then select owner_id into u from public.teams where id=(r->>'team_id')::uuid;
 else u:=(r->>'owner_id')::uuid;end if;
 if u is not null and exists(select 1 from auth.users where id=u) then
  insert into public.backup_generations values(u,1) on conflict(owner_id) do update set generation=public.backup_generations.generation+1;
 end if;
 return null;
end $$;
do $$ declare t text;begin
 foreach t in array array['teams','team_families','tags','collections','team_versions','team_tags'] loop
  execute format('create trigger backup_generation after insert or update or delete on public.%I for each row execute function private.backup_generation()',t);
 end loop;
end $$;
create function private.backup_id(ns text,kind text,n text) returns uuid language sql immutable set search_path='' as $$
 select (substr(h,1,8)||'-'||substr(h,9,4)||'-8'||substr(h,14,3)||'-a'||substr(h,18,3)||'-'||substr(h,21,12))::uuid
 from (select encode(sha256(convert_to(ns||':'||kind||':'||n,'UTF8')),'hex') h)x
$$;
create function private.backup_keys(r jsonb,required text[],optional text[] default '{}') returns void language plpgsql set search_path='' as $$
begin
 if jsonb_typeof(r) is distinct from 'object' or not r ?& required or exists(select 1 from jsonb_object_keys(r) k where not k=any(required||optional)) then raise exception 'Missing or unexpected backup fields.';end if;
end $$;
create function private.backup_snapshot(s jsonb) returns void language plpgsql set search_path='' as $$
begin
 perform private.backup_keys(s,array['version_number','parent_revision','version_comment','showdown_text','original_text','parsed_team','team_notes','set_notes','created_at'],array['set_editing']);
 if (s->>'version_number')::int not between 1 and 10000 or octet_length(s::text)>2097152
  or jsonb_typeof(s->'showdown_text') is distinct from 'string' or length(s->>'showdown_text') not between 1 and 150000
  or jsonb_typeof(s->'original_text') is distinct from 'string' or length(s->>'original_text')>500000
  or jsonb_typeof(s->'version_comment') is distinct from 'string' or length(s->>'version_comment')>2000
  or jsonb_typeof(s->'team_notes') is distinct from 'string' or length(s->>'team_notes')>50000
  or jsonb_typeof(s->'parsed_team') is distinct from 'array' or jsonb_array_length(s->'parsed_team') not between 1 and 24
  or jsonb_typeof(s->'set_notes') is distinct from 'array' or jsonb_array_length(s->'set_notes')<>jsonb_array_length(s->'parsed_team') then raise exception 'Invalid backup snapshot.';end if;
 if s->>'parent_revision' is not null and (s->>'parent_revision')::int not between 1 and (s->>'version_number')::int-1 then raise exception 'Invalid history parent.';end if;
 if exists(select 1 from jsonb_array_elements(s->'parsed_team') p where jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(p->'species') is distinct from 'string' or jsonb_typeof(p->'moves') is distinct from 'array')
  or exists(select 1 from jsonb_array_elements(s->'set_notes') n where jsonb_typeof(n) is distinct from 'string' or length(n#>>'{}')>10000) then raise exception 'Invalid backup sets.';end if;
 perform private.check_set_editing(s);
 perform (s->>'created_at')::timestamptz;
end $$;
revoke all on function private.backup_generation(),private.backup_id(text,text,text),private.backup_keys(jsonb,text[],text[]),private.backup_snapshot(jsonb) from public,anon,authenticated;

alter function public.vault(text,jsonb) rename to vault_before_backups;
revoke all on function public.vault_before_backups(text,jsonb) from public,anon,authenticated;
create function public.vault(action text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare u uuid:=auth.uid();g bigint;r jsonb;op uuid;st jsonb;manifest jsonb;counts jsonb;ns text;idx int;entry jsonb;line text;pos int:=0;
 fid uuid;tid uuid;vid uuid;parentid uuid;expected uuid;s jsonb;m jsonb;ctx jsonb;terms jsonb;term jsonb;def jsonb;backup_name text;suffix text;tag text;type text;n int;family_n int;variant_n int;revision_n int;
begin
 if action not like 'backup_%' then return public.vault_before_backups(action,payload);end if;
 if u is null then raise exception 'Please sign in.';end if;
 if octet_length(payload::text)>6000000 then raise exception 'Request too large.';end if;
 select coalesce((select generation from public.backup_generations where owner_id=u),0) into g;
 if action='backup_info' then
  select jsonb_build_object('families',count(distinct coalesce(family_id,id)),'variants',count(*),'revisions',(select count(*) from public.team_versions v join public.teams t on t.id=v.team_id where t.owner_id=u),'tags',(select count(*) from public.tags where owner_id=u),'collections',(select count(*) from public.collections where owner_id=u)) into counts from public.teams where owner_id=u;
  return jsonb_build_object('generation',g,'counts',counts);
 elsif action in ('backup_page','backup_check') then
  if (payload->>'generation')::bigint is distinct from g then raise exception 'Your library changed while the backup was being prepared. Try exporting again when editing has finished.';end if;
  if action='backup_check' then return jsonb_build_object('ok',true);end if;
  if payload->>'section'='tags' then
   select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') into r from (select id,display_name from public.tags where owner_id=u and id>coalesce(nullif(payload->>'after','')::uuid,'00000000-0000-0000-0000-000000000000'::uuid) order by id limit 40)x;
  elsif payload->>'section'='collections' then
   select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') into r from (select id,name,description,definition,created_at,updated_at from public.collections where owner_id=u and id>coalesce(nullif(payload->>'after','')::uuid,'00000000-0000-0000-0000-000000000000'::uuid) order by id limit 20)x;
  elsif payload->>'section'='revisions' then
   with candidates as (
    select t.id,coalesce(t.family_id,t.id) family_key,v.id version_id,v.version_number,octet_length(v.snapshot::text)+octet_length(t.metadata::text)+2000 bytes
    from public.teams t join public.team_versions v on v.team_id=t.id where t.owner_id=u
    and (coalesce(t.family_id,t.id),t.id,v.version_number)>(coalesce(nullif(payload->'cursor'->>'family','')::uuid,'00000000-0000-0000-0000-000000000000'::uuid),coalesce(nullif(payload->'cursor'->>'team','')::uuid,'00000000-0000-0000-0000-000000000000'::uuid),(payload->'cursor'->>'version')::int)
    order by coalesce(t.family_id,t.id),t.id,v.version_number limit 40
   ), bounded as (select *,sum(bytes) over(order by family_key,id,version_number) size,row_number() over(order by family_key,id,version_number) rn from candidates), result as (
    select t.id,t.title,t.metadata,t.variant_name,t.variant_description,t.favourite,t.archived,t.created_at,t.updated_at,t.imported_at,b.family_key,
     coalesce(f.created_at,t.created_at) family_created_at,coalesce(f.updated_at,t.updated_at) family_updated_at,
     (select count(*) from public.teams z where z.owner_id=t.owner_id and coalesce(z.family_id,z.id)=b.family_key) variant_count,
     (select count(*) from public.team_versions h where h.team_id=t.id) revision_count,
     current.version_number current_number,v.snapshot,parent.version_number parent_number,b.version_number ordering,
     (select coalesce(jsonb_agg(tg.display_name),'[]') from public.team_tags tt join public.tags tg on tg.id=tt.tag_id and tg.owner_id=t.owner_id where tt.team_id=t.id) tag_names
    from bounded b join public.teams t on t.id=b.id join public.team_versions v on v.id=b.version_id
    join public.team_versions current on current.id=t.current_version_id and current.team_id=t.id
    left join public.team_families f on f.id=t.family_id and f.owner_id=t.owner_id
    left join public.team_versions parent on parent.id=v.parent_version_id and parent.team_id=t.id
    where b.size<=524288 or b.rn=1
   ) select coalesce(jsonb_agg(to_jsonb(result)-'ordering' order by family_key,id,ordering),'[]') into r from result;
  else raise exception 'Invalid backup section.';end if;
  return r;
 end if;
 op:=(payload->>'id')::uuid;
 if op is null then raise exception 'Invalid restore operation.';end if;
 if action<>'backup_status' then perform pg_advisory_xact_lock(hashtextextended('teamvault-write:'||u::text,0));end if;
 if action='backup_begin' then insert into public.backup_generations(owner_id,generation) values(u,0) on conflict do nothing;end if;
 if action<>'backup_status' then select generation into g from public.backup_generations where owner_id=u for update;end if;
 select state into st from public.backup_restores where owner_id=u and id=op for update;
 if action='backup_begin' then
  manifest:=payload->'manifest';
  perform private.backup_keys(manifest,array['header','hashes','bytes','digest']);
  perform private.backup_keys(manifest->'header',array['format','schema_version','exported_at','app_version','counts']);
  if manifest->'header'->>'format' is distinct from 'pokelib-backup' or manifest->'header'->>'schema_version' is distinct from '1'
   or jsonb_typeof(manifest->'hashes') is distinct from 'array' or jsonb_array_length(manifest->'hashes')>10000 or coalesce(manifest->>'digest','')!~'^[a-f0-9]{64}$'
   or exists(select 1 from jsonb_array_elements_text(manifest->'hashes') h where h!~'^[a-f0-9]{64}$') then raise exception 'Invalid backup validation receipt.';end if;
  counts:=manifest->'header'->'counts';
  perform private.backup_keys(counts,array['families','variants','revisions','tags','collections']);
  if (counts->>'families')::int not between 0 and 10000 or (counts->>'variants')::int not between 0 and 50000 or (counts->>'revisions')::int not between 0 and 250000 or (counts->>'tags')::int not between 0 and 10000 or (counts->>'collections')::int not between 0 and 10000 then raise exception 'Backup exceeds supported counts.';end if;
  if st is not null then
   if st->'manifest'->>'digest' is distinct from manifest->>'digest' then raise exception 'Choose the same backup to resume this restore.';end if;
   return st;
  end if;
  st:=jsonb_build_object('id',op,'namespace',gen_random_uuid(),'manifest',manifest,'next_chunk',0,'generation',g,'counts',jsonb_build_object('families',0,'variants',0,'revisions',0,'tags',0,'collections',0),'family',0,'variant',0,'revision',0,'context',null,'complete',jsonb_array_length(manifest->'hashes')=0,'phase',0,'family_seen',0,'family_expected',0);
  insert into public.backup_restores(owner_id,id,state) values(u,op,st);
  insert into public.profiles(id) values(u) on conflict do nothing;
  return st;
 end if;
 if st is null then raise exception 'Restore operation not found for this account.';end if;
 if action='backup_status' then return st;end if;
 if action<>'backup_restore' then raise exception 'Unknown backup action.';end if;
 idx:=(payload->>'index')::int;
 if idx is null or idx<0 or idx>=jsonb_array_length(st->'manifest'->'hashes')
  or encode(sha256(convert_to(payload->>'text','UTF8')),'hex') is distinct from st->'manifest'->'hashes'->>idx then raise exception 'This chunk differs from the fully validated backup.';end if;
 if idx<(st->>'next_chunk')::int then return st;end if;
 if g is distinct from (st->>'generation')::bigint then raise exception 'Library data was edited in another window. Restore stopped without overwriting that edit. Earlier chunks remain saved.';end if;
 if idx<>(st->>'next_chunk')::int or octet_length(payload->>'text')>2097153 then raise exception 'Restore chunks must be bounded and committed in order.';end if;
 ns:=st->>'namespace';counts:=st->'counts';ctx:=st->'context';family_n:=(st->>'family')::int;variant_n:=(st->>'variant')::int;revision_n:=(st->>'revision')::int;
 for line in select value from unnest(string_to_array(trim(trailing E'\n' from payload->>'text'),E'\n')) value loop
  entry:=line::jsonb;type:=entry->>'type';pos:=pos+1;
  if pos>40 then raise exception 'Too many backup records.';end if;
  if type='tag' then
   perform private.backup_keys(entry,array['type','id','name']);backup_name:=entry->>'name';
   if (st->>'phase')::int<>0 or (entry->>'id')::int is distinct from (counts->>'tags')::int+1 or length(backup_name) not between 1 and 60 then raise exception 'Invalid tag record.';end if;
   insert into public.tags(id,owner_id,display_name,normalized_name) values(private.backup_id(ns,'tag',entry->>'id'),u,backup_name,lower(backup_name)) on conflict(owner_id,normalized_name) do nothing;
   counts:=jsonb_set(counts,'{tags}',to_jsonb((counts->>'tags')::int+1));
  elsif type='family' then
   perform private.backup_keys(entry,array['type','id','title','variants','created_at','updated_at']);
   if (st->>'phase')::int>1 or (entry->>'id')::int is distinct from (counts->>'families')::int+1 or (st->>'family_seen')::int<>(st->>'family_expected')::int or (ctx is not null and ctx<>'null'::jsonb and revision_n<>(ctx->>'revisions')::int) then raise exception 'Invalid family relationship.';end if;
   family_n:=(entry->>'id')::int;
   insert into public.team_families(id,owner_id,title,created_at,updated_at) values(private.backup_id(ns,'family',family_n::text),u,entry->>'title',(entry->>'created_at')::timestamptz,(entry->>'updated_at')::timestamptz);
   st:=st||jsonb_build_object('phase',1,'family_seen',0,'family_expected',(entry->>'variants')::int);
   counts:=jsonb_set(counts,'{families}',to_jsonb((counts->>'families')::int+1));
  elsif type in ('variant','revision') then
   if type='variant' then
    perform private.backup_keys(entry,array['type','id','family','name','description','meta','current_revision','revisions','favourite','archived','created_at','updated_at','imported_at','snapshot']);
    if (st->>'phase')::int<>1 or (entry->>'family')::int is distinct from family_n or (entry->>'id')::int is distinct from (counts->>'variants')::int+1 or (entry->>'revisions')::int not between 1 and 10000 or entry->'current_revision' is distinct from entry->'revisions' or (ctx is not null and ctx<>'null'::jsonb and revision_n<>(ctx->>'revisions')::int) then raise exception 'Invalid variant relationship.';end if;
    variant_n:=(entry->>'id')::int;revision_n:=0;ctx:=entry-'snapshot';m:=entry->'meta';
    perform private.backup_keys(m,array['title','format','tags','source_type','source_name','source_url','source_note','team_date','team_date_precision'],array['format_context']);
    perform private.check_meta(m);
    if length(entry->>'name') not between 1 and 80 or length(entry->>'description')>1000 or jsonb_typeof(entry->'favourite') is distinct from 'boolean' or jsonb_typeof(entry->'archived') is distinct from 'boolean' then raise exception 'Invalid variant state.';end if;
    if exists(select 1 from jsonb_array_elements_text(m->'tags') tag where not exists(select 1 from public.tags tg where tg.owner_id=u and tg.normalized_name=lower(tag))) then raise exception 'Missing reusable tag.';end if;
    st:=jsonb_set(st,'{family_seen}',to_jsonb((st->>'family_seen')::int+1));
    if (st->>'family_seen')::int>(st->>'family_expected')::int then raise exception 'Too many family variants.';end if;
    counts:=jsonb_set(counts,'{variants}',to_jsonb((counts->>'variants')::int+1));
   else
    perform private.backup_keys(entry,array['type','variant','snapshot']);
    if (st->>'phase')::int<>1 or (entry->>'variant')::int is distinct from variant_n then raise exception 'Cross-variant history relationship.';end if;
   end if;
   s:=entry->'snapshot';perform private.backup_snapshot(s);
   n:=(s->>'version_number')::int;
   if n is distinct from revision_n+1 or n>(ctx->>'revisions')::int then raise exception 'Invalid revision order.';end if;
   tid:=private.backup_id(ns,'variant',variant_n::text);fid:=private.backup_id(ns,'family',family_n::text);vid:=private.backup_id(ns,'version',variant_n::text||':'||n::text);
   parentid:=case when s->>'parent_revision' is not null then private.backup_id(ns,'version',variant_n::text||':'||(s->>'parent_revision')) end;
   s:=(s-'parent_revision')||jsonb_build_object('id',vid,'team_id',tid,'edit_revision',vid,'parent_version_id',parentid);
   if type='variant' then
    insert into public.teams(id,owner_id,family_id,variant_name,variant_key,variant_description,metadata,title,format,team_date,source_name,current_version_id,favourite,archived,created_at,updated_at,imported_at)
    values(tid,u,fid,ctx->>'name',lower(ctx->>'name'),ctx->>'description',m,m->>'title',m->>'format',m->>'team_date',m->>'source_name',vid,(ctx->>'favourite')::boolean,(ctx->>'archived')::boolean,(ctx->>'created_at')::timestamptz,(ctx->>'updated_at')::timestamptz,(ctx->>'imported_at')::timestamptz);
    insert into public.team_tags(team_id,tag_id) select tid,tg.id from public.tags tg join jsonb_array_elements_text(m->'tags') tag on tg.normalized_name=lower(tag) where tg.owner_id=u;
   else
    expected:=private.backup_id(ns,'version',variant_n::text||':'||revision_n::text);
    perform 1 from public.teams t join public.team_versions v on v.team_id=t.id and v.id=t.current_version_id where t.id=tid and t.owner_id=u and t.current_version_id=expected and coalesce(v.snapshot->>'edit_revision',v.id::text)=expected::text and t.updated_at=(ctx->>'updated_at')::timestamptz for update of t;
    if not found then raise exception 'A restored variant was edited in another window. Restore stopped without overwriting that edit.';end if;
   end if;
   insert into public.team_versions(id,team_id,version_number,snapshot,parent_version_id,created_at) values(vid,tid,n,s,parentid,(s->>'created_at')::timestamptz);
   if type='revision' then update public.teams set current_version_id=vid where id=tid and owner_id=u;end if;
   terms:=payload->'terms'->(pos-1);
   if jsonb_typeof(terms) is distinct from 'array' or jsonb_array_length(terms)>20000 then raise exception 'Invalid rebuilt search terms.';end if;
   delete from public.search_terms where team_id=tid and (version_id<>'' or field<>'text');
   for term in select value from jsonb_array_elements(terms) loop
    if coalesce(term->>'version_id','!') not in ('',vid::text) then raise exception 'Invalid search version relationship.';end if;
    insert into public.search_terms(team_id,version_id,slot,field,value) values(tid,term->>'version_id',(term->>'slot')::int,term->>'field',term->>'value') on conflict do nothing;
   end loop;
   revision_n:=n;counts:=jsonb_set(counts,'{revisions}',to_jsonb((counts->>'revisions')::int+1));
  elsif type='collection' then
   perform private.backup_keys(entry,array['type','id','name','description','definition','created_at','updated_at']);
   if (entry->>'id')::int is distinct from (counts->>'collections')::int+1 or (st->>'family_seen')::int<>(st->>'family_expected')::int or (ctx is not null and ctx<>'null'::jsonb and revision_n<>(ctx->>'revisions')::int) then raise exception 'Invalid collection order.';end if;
   perform private.backup_keys(entry->'definition',array['query','filters','sort','favourite']);
   def:=payload->'definitions'->(pos-1);
   if jsonb_typeof(def) is distinct from 'object' or def->'version' is distinct from '1'::jsonb
    or jsonb_typeof(def->'query') is distinct from 'string' or length(def->>'query')>10000
    or jsonb_typeof(def->'filters') is distinct from 'array' or jsonb_array_length(def->'filters')>30 or jsonb_typeof(def->'plan') is distinct from 'object'
    or def->>'sort' not in ('modified_desc','modified_asc','title_asc','title_desc','created_desc','created_asc','date_desc','date_asc','format','source')
    or jsonb_typeof(def->'favourite') is distinct from 'boolean' or octet_length(def::text)>200000 then raise exception 'Invalid collection filters.';end if;
   -- Derived plans follow the normal authenticated collection RPC validation boundary.
   if (def-'plan'-'version') is distinct from entry->'definition' then raise exception 'Collection definition changed during restore.';end if;
   backup_name:=entry->>'name';suffix:=' (restored '||substr(op::text,1,8)||'-'||(entry->>'id')||')';
   if exists(select 1 from public.collections c where c.owner_id=u and c.name_key=lower(backup_name)) then backup_name:=substr(backup_name,1,120-length(suffix))||suffix;end if;
   insert into public.collections(id,owner_id,name,name_key,description,definition,created_at,updated_at) values(private.backup_id(ns,'collection',entry->>'id'),u,backup_name,lower(backup_name),entry->>'description',def,(entry->>'created_at')::timestamptz,(entry->>'updated_at')::timestamptz);
   st:=jsonb_set(st,'{phase}','2');counts:=jsonb_set(counts,'{collections}',to_jsonb((counts->>'collections')::int+1));
  else raise exception 'Unknown backup record.';end if;
 end loop;
 st:=st||jsonb_build_object('counts',counts,'family',family_n,'variant',variant_n,'revision',revision_n,'context',ctx,'next_chunk',idx+1,'complete',idx+1=jsonb_array_length(st->'manifest'->'hashes'));
 if st->'complete'='true'::jsonb and (counts is distinct from st->'manifest'->'header'->'counts' or (st->>'family_seen')::int<>(st->>'family_expected')::int or (ctx is not null and ctx<>'null'::jsonb and revision_n<>(ctx->>'revisions')::int)) then raise exception 'Restore consistency verification failed.';end if;
 insert into public.operation_chunks(owner_id,operation_id,chunk_index,kind,request_hash,result) values(u,op,idx,'backup_restore',st->'manifest'->'hashes'->>idx,counts);
 select generation into g from public.backup_generations where owner_id=u;
 st:=st||jsonb_build_object('generation',g);
 update public.backup_restores set state=st where owner_id=u and id=op;
 return st;
end $$;
revoke all on function public.vault(text,jsonb) from public,anon;
grant execute on function public.vault(text,jsonb) to authenticated;
