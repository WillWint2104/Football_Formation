-- Additive journal: no changes to existing schema-1.0 snapshots or their save RPC.
begin;
create table public.presentation_heads (
  organization_id text not null references public.organizations(id),
  id text not null check (id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'),
  current_revision bigint not null default 0 check (current_revision between 0 and 9007199254740991),
  primary key (organization_id,id)
);
create table public.presentation_revisions (
  organization_id text not null, id text not null,
  revision bigint not null check (revision between 1 and 9007199254740991),
  payload jsonb not null, saved_at timestamptz not null default now(),
  primary key (organization_id,id,revision),
  foreign key (organization_id,id) references public.presentation_heads(organization_id,id),
  check (jsonb_typeof(payload) = 'object' and payload->>'schemaVersion' = '1.0'
    and payload->>'organizationId' = organization_id and payload->>'id' = id
    and payload->>'revision' = revision::text and jsonb_typeof(payload->'blocks') = 'array'
    and jsonb_array_length(payload->'blocks') <= 128 and octet_length(payload::text) <= 2097152)
);
create trigger presentation_history_immutable before update or delete on public.presentation_revisions
  for each row execute function private.immutable_revision();
alter table public.presentation_heads enable row level security;
alter table public.presentation_revisions enable row level security;
create policy presentation_heads_read on public.presentation_heads for select to authenticated using (private.is_org_member(organization_id));
create policy presentation_revisions_read on public.presentation_revisions for select to authenticated using (private.is_org_member(organization_id));
revoke all on public.presentation_heads, public.presentation_revisions from public, anon, authenticated, service_role;
grant select on public.presentation_heads, public.presentation_revisions to authenticated;
create view public.presentations_current with (security_invoker=true) as
  select r.organization_id, r.id, r.revision, r.payload from public.presentation_revisions r
  join public.presentation_heads h on h.organization_id=r.organization_id and h.id=r.id and h.current_revision=r.revision;
grant select on public.presentations_current to authenticated;

create function public.save_presentation(p_organization_id text, p_actor uuid, p_expected_revision bigint, p_payload jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_current bigint; v_id text;
begin
  -- Lock membership against revocation for the entire write, matching coaching persistence.
  perform 1 from public.organization_memberships where organization_id=p_organization_id and user_id=p_actor and active for share;
  if not found then raise exception 'Organization unavailable' using errcode='42501'; end if;
  v_id := p_payload->>'id';
  if p_expected_revision is null or p_expected_revision < 0 or p_expected_revision >= 9007199254740991
    or jsonb_typeof(p_payload) is distinct from 'object'
    or v_id is null or v_id !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'
    or p_payload->>'organizationId' is distinct from p_organization_id
    or p_payload->>'schemaVersion' is distinct from '1.0'
    or p_payload->>'revision' is distinct from (p_expected_revision+1)::text
    or jsonb_typeof(p_payload->'blocks') is distinct from 'array'
    or octet_length(p_payload::text)>2097152 then
    raise exception 'Invalid presentation' using errcode='22023';
  end if;
  insert into public.presentation_heads(organization_id,id) values (p_organization_id,v_id) on conflict do nothing;
  select current_revision into v_current from public.presentation_heads where organization_id=p_organization_id and id=v_id for update;
  if v_current <> p_expected_revision then raise exception 'Presentation changed' using errcode='40001'; end if;
  insert into public.presentation_revisions(organization_id,id,revision,payload) values (p_organization_id,v_id,v_current+1,p_payload);
  update public.presentation_heads set current_revision=v_current+1 where organization_id=p_organization_id and id=v_id;
  return v_current+1;
end $$;
revoke all on function public.save_presentation(text,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.save_presentation(text,uuid,bigint,jsonb) to service_role;
commit;

