-- Additive local-first schema. NO existing users, teams, infrastructure or configuration are deleted.
-- Legacy tables remain readable by the legacy API. New Cloud teams use these revisioned records.
create table public.lf_accounts (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check(length(display_name) between 1 and 60),
 login_code text not null unique default upper(left(replace(gen_random_uuid()::text,'-',''),16)),
 auto_cloud boolean not null default false,
 cloud_acknowledged boolean not null default false
);
create table public.lf_cloud (
 id uuid primary key, owner_id uuid not null references auth.users(id) on delete cascade,
 revision bigint not null default 1, mutation text not null,
 data jsonb not null, search_index jsonb not null, summary jsonb not null,
 deleted_at timestamptz, updated_at timestamptz not null default now()
);
create index lf_cloud_owner on public.lf_cloud(owner_id,id);
create table public.lf_shares (
 token text primary key check(token ~ '^[a-f0-9]{64}$'),
 team_id uuid unique references public.lf_cloud(id) on delete cascade,
 snapshot jsonb,
 show_history boolean not null default false,
 created_at timestamptz not null default now(),
 check ((team_id is null) <> (snapshot is null))
);
alter table public.lf_accounts enable row level security;
alter table public.lf_cloud enable row level security;
alter table public.lf_shares enable row level security;
revoke all on public.lf_accounts,public.lf_cloud,public.lf_shares from public,anon,authenticated;
-- Capabilities never grant table access. Only these bounded, ownership-checked RPCs are exposed.
create function private.lf_account_created() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.lf_accounts(id,display_name) values(new.id,
  left(coalesce(nullif(trim(to_jsonb(new)->'raw_user_meta_data'->>'display_name'),''),'Trainer'),60));
 return new;
end $$;
create trigger lf_account_created after insert on auth.users for each row execute function private.lf_account_created();
insert into public.lf_accounts(id,display_name) select id,'Trainer' from auth.users on conflict do nothing;

-- A strict public projection. No owner, login, raw import source or private editor flags escape.
create function private.lf_public(t jsonb,s jsonb) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('id','shared','current_version_id','shared',
  'title',t->'title','format',t->'format','format_context',t->'format_context','tags',t->'tags',
  'source_type',t->'source_type','source_name',t->'source_name','source_url',t->'source_url',
  'source_note',t->'source_note','team_date',t->'team_date','team_date_precision',t->'team_date_precision',
  'variant_name',t->'variant_name','variant_description',t->'variant_description',
  'version',jsonb_build_object('id','shared','team_id','shared','version_number',s->'version_number',
   'parent_version_id',null,'version_comment','','showdown_text',s->'showdown_text','original_text','',
   'parsed_team',s->'parsed_team','team_notes',s->'team_notes','set_notes',s->'set_notes','created_at',s->'created_at'))
$$;
create function private.lf_purge() returns void language sql security definer set search_path='' as $$
 delete from public.lf_cloud where deleted_at <= now()-interval '10 minutes';
$$;

create function public.local_first(action text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); c public.lf_cloud; r jsonb; t jsonb; v jsonb; h jsonb; terms jsonb; tok text; a public.lf_accounts;
begin
 if octet_length(payload::text)>2000000 then raise exception 'Request too large.'; end if;
 perform private.lf_purge();
 if action='snapshot' then
  t:=payload->'team'; perform private.check_meta(t); perform private.check_snapshot(t->'version');
  tok:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
  insert into public.lf_shares(token,snapshot) values(tok,private.lf_public(t,t->'version'));
  return jsonb_build_object('token',tok);
 end if;
 if u is null then raise exception 'Please sign in to use Cloud Sync.'; end if;
 select * into a from public.lf_accounts where id=u;
 if action='profile' then return jsonb_build_object('id',a.id,'name',a.display_name,'login_code',a.login_code); end if;
 if action='preferences' then return jsonb_build_object('autoCloud',a.auto_cloud,'acknowledged',a.cloud_acknowledged); end if;
 if action='preferences_save' then
  update public.lf_accounts set auto_cloud=coalesce((payload->>'autoCloud')::boolean,false),cloud_acknowledged=cloud_acknowledged or coalesce((payload->>'acknowledged')::boolean,false) where id=u;
  return jsonb_build_object('ok',true);
 end if;
 if action='index' then
  select jsonb_build_object('teams',coalesce(jsonb_agg(x.r order by x.id),'[]'),'next',case when count(*)=100 then max(x.id::text) else null end) into r from (
   select id,jsonb_build_object('team',summary,'terms',search_index,'revision',revision,'deletedAt',case when deleted_at is null then null else floor(extract(epoch from deleted_at)*1000)::bigint end) r
   from public.lf_cloud where owner_id=u and (coalesce(payload->>'after','')='' or id>(payload->>'after')::uuid) order by id limit 100
  ) x; return r;
 end if;
 -- Serialize mutations even before the team exists. An old retry cannot overwrite a later revision.
 perform pg_advisory_xact_lock(hashtextextended(coalesce(payload->>'id',''),0));
 select * into c from public.lf_cloud where id=(payload->>'id')::uuid for update;
 if c.id is not null and c.owner_id<>u then raise exception 'Team not found.'; end if;
 if action='get' then
  if c.id is null or c.deleted_at is not null then raise exception 'Team not found.'; end if;
  return jsonb_build_object('team',c.summary,'terms',c.search_index,'revision',c.revision,'payload',c.data);
 end if;
 if action in ('share','revoke','live_settings') then
  if c.id is null or c.deleted_at is not null then raise exception 'Team not found.'; end if;
  if action='revoke' then delete from public.lf_shares where team_id=c.id; return jsonb_build_object('ok',true); end if;
  if action='live_settings' then update public.lf_shares set show_history=coalesce((payload->>'show_history')::boolean,false) where team_id=c.id; end if;
  select token into tok from public.lf_shares where team_id=c.id;
  if tok is null then
   tok:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
   insert into public.lf_shares(token,team_id,show_history) values(tok,c.id,coalesce((payload->>'show_history')::boolean,false));
  end if;
  return jsonb_build_object('token',tok,'show_history',(select show_history from public.lf_shares where token=tok));
 end if;
 if action not in ('put','delete','disable','restore') then raise exception 'Unknown Cloud action.'; end if;
 if c.id is not null and c.mutation=payload->>'mutation' then return jsonb_build_object('revision',c.revision); end if;
 if coalesce((payload->>'expected')::bigint,-1)<>coalesce(c.revision,0) then
  return jsonb_build_object('conflict',true,'message','Another device changed or removed this Cloud team. Your local work is retained.');
 end if;
 if action='put' then
  if c.deleted_at is not null then return jsonb_build_object('conflict',true,'message','This team was deleted on another device. Keep a Local copy to preserve your work.'); end if;
  t:=payload->'team'; perform private.check_meta(t); perform private.check_snapshot(t->'version');
  if t->>'id' is distinct from payload->>'id' or t->'version'->>'team_id' is distinct from payload->>'id' then raise exception 'Invalid team identity.'; end if;
  if jsonb_typeof(payload->'terms') is distinct from 'array' or jsonb_array_length(payload->'terms')>6000 then raise exception 'Invalid search index.'; end if;
  -- History is extended from the canonical server copy. First upload sends only the current state.
  select coalesce(jsonb_agg(e),'[]') into h from jsonb_array_elements(coalesce(c.data->'history','[]')) e where e->>'id'<>t->'version'->>'id';
  t:=(t-'owner_id'-'sync_status'-'history')||jsonb_build_object('storage','cloud','history',jsonb_build_array(t->'version')||h);
  -- Historical comments remain searchable without accepting a client's historical chain.
  select (payload->'terms')||coalesce(jsonb_agg(distinct jsonb_build_object('version_id',t->'version'->>'id','slot',-1,'field','text','value',regexp_replace(lower(w),'[^a-z0-9]','','g'))),'[]') into terms
  from jsonb_array_elements(t->'history') e cross join lateral regexp_split_to_table(normalize(coalesce(e->>'version_comment',''),NFKC),'[^[:alnum:]]+') w
  where regexp_replace(lower(w),'[^a-z0-9]','','g')<>'';
  if c.id is null then
   insert into public.lf_cloud(id,owner_id,mutation,data,search_index,summary) values((payload->>'id')::uuid,u,payload->>'mutation',t,terms,payload->'summary') returning * into c;
  else
   update public.lf_cloud set data=t,search_index=terms,summary=payload->'summary',mutation=payload->>'mutation',revision=revision+1,updated_at=now() where id=c.id returning * into c;
  end if;
 elsif action='disable' then
  delete from public.lf_cloud where id=c.id; return jsonb_build_object('revision',0);
 elsif action='delete' then
  if c.id is null then return jsonb_build_object('revision',0); end if;
  delete from public.lf_shares where team_id=c.id;
  update public.lf_cloud set deleted_at=coalesce(deleted_at,now()),revision=revision+1,mutation=payload->>'mutation' where id=c.id returning * into c;
 elsif action='restore' then
  if c.id is null then return jsonb_build_object('conflict',true,'message','The undo window ended on the server. Keep a Local copy to recover cached work.'); end if;
  update public.lf_cloud set deleted_at=null,revision=revision+1,mutation=payload->>'mutation' where id=c.id returning * into c;
 end if;
 return jsonb_build_object('revision',c.revision);
end $$;
revoke all on function public.local_first(text,jsonb) from public;
grant execute on function public.local_first(text,jsonb) to anon,authenticated;

create function public.lf_resolve_share(p_token text,p_version integer default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s public.lf_shares; c public.lf_cloud; v jsonb; r jsonb;
begin
 select * into s from public.lf_shares where token=p_token;
 if s.token is null then return null; end if;
 if s.snapshot is not null then return s.snapshot||jsonb_build_object('share_mode','snapshot'); end if;
 select * into c from public.lf_cloud where id=s.team_id and deleted_at is null;
 if c.id is null then return null; end if;
 v:=c.data->'version';
 if p_version is not null and p_version<>(v->>'version_number')::int then
  if not s.show_history then return null; end if;
  select e into v from jsonb_array_elements(c.data->'history') e where (e->>'version_number')::int=p_version;
  if v is null then return null; end if;
 end if;
 r:=private.lf_public(c.data,v)||jsonb_build_object('share_mode','live');
 if s.show_history then r:=r||jsonb_build_object('versions',(select jsonb_agg((e->>'version_number')::int) from jsonb_array_elements(c.data->'history') e)); end if;
 return r;
end $$;
revoke all on function public.lf_resolve_share(text,integer) from public;
grant execute on function public.lf_resolve_share(text,integer) to anon,authenticated;

-- Account deletion is one transaction: freeze live capabilities BEFORE the cascading owner deletion.
-- The HTTP endpoint verifies the current password before invoking this service-role-only RPC.
create function public.lf_delete_account(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 perform 1 from auth.users where id=p_id for update;
 perform 1 from public.lf_cloud where owner_id=p_id for update;
 update public.lf_shares s set snapshot=private.lf_public(c.data,c.data->'version'),team_id=null,show_history=false
 from public.lf_cloud c where s.team_id=c.id and c.owner_id=p_id;
 delete from auth.users where id=p_id;
end $$;
revoke all on function public.lf_delete_account(uuid) from public,anon,authenticated;
-- Hosted Supabase has service_role; the local PostgreSQL test shim creates the same role.
grant execute on function public.lf_delete_account(uuid) to service_role;
create function public.lf_login_email(p_code text) returns text language sql security definer set search_path='' as $$
 select to_jsonb(u)->>'email' from auth.users u join public.lf_accounts a on a.id=u.id where a.login_code=upper(replace(p_code,'-',''))
$$;
revoke all on function public.lf_login_email(text) from public,anon,authenticated;
grant execute on function public.lf_login_email(text) to service_role;
create function public.lf_registration_code(p_id uuid) returns text language sql security definer set search_path='' as $$
 select login_code from public.lf_accounts where id=p_id
$$;
revoke all on function public.lf_registration_code(uuid) from public,anon,authenticated;
grant execute on function public.lf_registration_code(uuid) to service_role;
create table private.lf_auth_limits(key text primary key, attempts int not null, expires timestamptz not null);
create function public.lf_auth_limit(p_key text) returns boolean language plpgsql security definer set search_path='' as $$
declare n int;
begin
 delete from private.lf_auth_limits where expires<now();
 insert into private.lf_auth_limits values(p_key,1,now()+interval '15 minutes')
 on conflict(key) do update set attempts=private.lf_auth_limits.attempts+1 returning attempts into n;
 return n<=20;
end $$;
revoke all on function public.lf_auth_limit(text) from public,anon,authenticated;
grant execute on function public.lf_auth_limit(text) to service_role;
revoke all on function private.lf_account_created(),private.lf_public(jsonb,jsonb),private.lf_purge() from public,anon,authenticated;

-- Exact background expiry on hosted Supabase (enable pg_cron in the dashboard first).
-- If pg_cron is unavailable, expiry is enforced on every Cloud request; expired rows are never undoable.
do $$ begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  execute $q$select cron.schedule('pokelib-short-undo','* * * * *','select private.lf_purge()')$q$;
 end if;
end $$;
