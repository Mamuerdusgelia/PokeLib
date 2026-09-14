-- Extend existing account preferences; this flag only ever moves false -> true.
alter table public.lf_accounts
 add column duplicate_suggestion_seen boolean not null default false;

-- Preserve the established RPC for all unrelated actions, behind its existing
-- public entry point. The helper must not remain directly executable by clients.
alter function public.local_first(text,jsonb) rename to local_first_before_duplicate_suggestion;
alter function public.local_first_before_duplicate_suggestion(text,jsonb) set schema private;
revoke all on function private.local_first_before_duplicate_suggestion(text,jsonb) from public,anon,authenticated;

create function public.local_first(action text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); a public.lf_accounts;
begin
 if action not in ('preferences','preferences_save') then
  return private.local_first_before_duplicate_suggestion(action,payload);
 end if;
 if u is null then raise exception 'Please sign in to use Cloud Sync.'; end if;
 if octet_length(payload::text)>2000000 then raise exception 'Request too large.'; end if;
 if action='preferences_save' then
  update public.lf_accounts set
   auto_cloud=coalesce((payload->>'autoCloud')::boolean,auto_cloud),
   cloud_acknowledged=cloud_acknowledged or coalesce((payload->>'acknowledged')::boolean,false),
   duplicate_suggestion_seen=duplicate_suggestion_seen or coalesce((payload->>'duplicateSuggestionSeen')::boolean,false)
  where id=u;
 end if;
 select * into a from public.lf_accounts where id=u;
 return jsonb_build_object('autoCloud',a.auto_cloud,'acknowledged',a.cloud_acknowledged,
  'duplicateSuggestionSeen',a.duplicate_suggestion_seen);
end $$;
revoke all on function public.local_first(text,jsonb) from public;
grant execute on function public.local_first(text,jsonb) to anon,authenticated;
