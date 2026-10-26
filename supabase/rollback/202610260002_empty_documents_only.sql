-- Never delete journals or objects during rollback. With data, use a reviewed forward repair.
begin;
do $$ begin
  if exists(select 1 from public.private_document_objects) then
    raise exception 'Rollback refused: document journals exist. Reconcile storage and use forward repair.';
  end if;
end $$;
drop function public.register_coaching_document(uuid,jsonb);
drop table public.private_document_objects;
commit;
