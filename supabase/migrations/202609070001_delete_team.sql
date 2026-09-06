-- Permanent deletion uses the existing cascading foreign keys in one transaction.
-- Reusable tags belong to the account; only this team's tag associations disappear.
create function public.delete_team(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare owner uuid := auth.uid();
begin
  if owner is null then raise exception 'Please sign in.'; end if;
  delete from public.teams where id = p_id and owner_id = owner;
  if not found then raise exception 'Team not found.'; end if;
  return jsonb_build_object('deleted', true);
end;
$$;
revoke all on function public.delete_team(uuid) from public, anon, authenticated;
grant execute on function public.delete_team(uuid) to authenticated;
