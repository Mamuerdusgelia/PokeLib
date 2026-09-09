create table public.operation_chunks(
 owner_id uuid not null references auth.users(id) on delete cascade,
 operation_id uuid not null, chunk_index integer not null check(chunk_index between 0 and 10000),
 kind text not null, request_hash text not null check(request_hash~'^[a-f0-9]{64}$'), result jsonb not null,
 created_at timestamptz not null default now(), primary key(owner_id,operation_id,chunk_index)
);
alter table public.operation_chunks enable row level security;
revoke all on public.operation_chunks from public,anon,authenticated;
create policy own_operation_chunks on public.operation_chunks for select to authenticated using(owner_id=(select auth.uid()));
alter function public.vault(text,jsonb) rename to vault_before_receipts;
revoke all on function public.vault_before_receipts(text,jsonb) from public,anon,authenticated;
create function public.vault(action text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); k jsonb:=payload->'chunk';op uuid;idx integer;receipt public.operation_chunks%rowtype;r jsonb;tid uuid;count_deleted integer;
begin
 if u is null then raise exception 'Please sign in.';end if;
 if octet_length(payload::text)>6000000 then raise exception 'Request too large.';end if;
 if action in ('import','bulk','bulk_delete') and k is not null then
  op:=(k->>'operation_id')::uuid;idx:=(k->>'chunk_index')::integer;
  if jsonb_typeof(case when action='import' then payload->'teams' else payload->'ids' end) is distinct from 'array' then raise exception 'Invalid operation chunk.';end if;
  if op is null or idx is null or idx not between 0 and 10000 or coalesce(k->>'request_hash','')!~'^[a-f0-9]{64}$' or jsonb_array_length(case when action='import' then payload->'teams' else payload->'ids' end) not between 1 and 5 then raise exception 'Invalid operation chunk.';end if;
  perform pg_advisory_xact_lock(hashtextextended(u::text||op::text||idx::text,0));
  select * into receipt from public.operation_chunks where owner_id=u and operation_id=op and chunk_index=idx;
  if found then
   if receipt.kind<>action or receipt.request_hash<>k->>'request_hash' then raise exception 'This retry differs from the original operation.';end if;
   return receipt.result;
  end if;
  if action='bulk_delete' then
   if jsonb_array_length(payload->'ids')<>(select count(distinct value) from jsonb_array_elements_text(payload->'ids')) then raise exception 'Invalid bulk selection.';end if;
   for tid in select value::uuid from jsonb_array_elements_text(payload->'ids') order by value loop
    perform 1 from public.teams where id=tid and owner_id=u for update;if not found then raise exception 'A selected team is missing or belongs to another account.';end if;
   end loop;
   delete from public.teams where owner_id=u and id in (select value::uuid from jsonb_array_elements_text(payload->'ids'));
   get diagnostics count_deleted = row_count;
   r:=jsonb_build_object('count',count_deleted);
  else
   r:=public.vault_before_receipts(action,payload-'chunk');
  end if;
  insert into public.operation_chunks(owner_id,operation_id,chunk_index,kind,request_hash,result) values(u,op,idx,action,k->>'request_hash',r);
  return r;
 end if;
 return public.vault_before_receipts(action,payload);
end $$;
revoke all on function public.vault(text,jsonb) from public,anon,authenticated;
grant execute on function public.vault(text,jsonb) to authenticated;
