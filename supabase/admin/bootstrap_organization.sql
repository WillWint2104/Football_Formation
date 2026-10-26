-- Operator-only, after resource approval and creation/invitation of an Auth user.
-- psql -v organization_id=club-example -v organization_name='Example Club' -v owner_user_id=<existing-auth-uuid> -f ...
-- Never run this through a browser/client or expose it as an application RPC.
begin;
insert into public.organizations(id,name) values (:'organization_id', :'organization_name');
insert into public.organization_memberships(organization_id,user_id,role)
  values (:'organization_id', :'owner_user_id'::uuid, 'owner');
commit;
