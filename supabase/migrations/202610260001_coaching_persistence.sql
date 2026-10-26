-- Additive foundation. Applying this file does not create a Supabase project or Auth users.
begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.organizations (
  id text primary key check (id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'),
  name text not null check (length(trim(name)) between 1 and 200),
  version bigint not null default 0 check (version between 0 and 9007199254740991)
);
create table public.organization_memberships (
  id text not null default gen_random_uuid()::text
    check (id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'),
  organization_id text not null references public.organizations(id),
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('owner', 'member')),
  active boolean not null default true,
  primary key (organization_id, user_id),
  unique (organization_id, id)
);
create index memberships_user on public.organization_memberships(user_id, organization_id) where active;

create function private.is_org_member(org text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.organization_memberships
    where organization_id = org and user_id = (select auth.uid()) and active);
$$;
revoke all on function private.is_org_member(text) from public;
grant execute on function private.is_org_member(text) to authenticated;

create function private.immutable_revision() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = '23000', message = 'Saved revisions are immutable';
end;
$$;
revoke all on function private.immutable_revision() from public;

-- Unversioned directory records have current rows; complete organization snapshots retain history.
do $$
declare t text;
begin
  foreach t in array array['teams', 'coaches'] loop
    execute format('create table public.%I (
      organization_id text not null references public.organizations(id),
      id text not null check (id ~ ''^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$''),
      payload jsonb not null,
      primary key (organization_id, id),
      check (jsonb_typeof(payload) = ''object''),
      check (payload->>''organizationId'' is not distinct from organization_id),
      check (payload->>''id'' is not distinct from id),
      check (payload->>''schemaVersion'' is not distinct from ''1.0'')
    )', t);
  end loop;
  foreach t in array array['calendar_events', 'session_revisions', 'template_revisions',
    'exercise_revisions', 'scene_revisions', 'document_revisions'] loop
    execute format('create table public.%I (
      organization_id text not null references public.organizations(id),
      id text not null check (id ~ ''^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$''),
      revision bigint not null check (revision between 1 and 9007199254740991),
      payload jsonb not null,
      primary key (organization_id, id, revision),
      check (jsonb_typeof(payload) = ''object''),
      check (payload->>''organizationId'' is not distinct from organization_id),
      check (payload->>''id'' is not distinct from id),
      check ((payload->>''revision'')::bigint is not distinct from revision),
      check (payload->>''schemaVersion'' is not distinct from ''1.0'')
    )', t);
    execute format('create trigger immutable before update or delete on public.%I
      for each row execute function private.immutable_revision()', t);
  end loop;
end $$;

create table public.organization_snapshots (
  organization_id text not null references public.organizations(id),
  version bigint not null check (version between 1 and 9007199254740991),
  bundle jsonb not null,
  saved_at timestamptz not null default now(),
  primary key (organization_id, version),
  check (bundle->>'organizationId' is not distinct from organization_id),
  check (bundle->>'schemaVersion' is not distinct from '1.0')
);
create trigger immutable before update or delete on public.organization_snapshots
  for each row execute function private.immutable_revision();

-- All browser/anonymous writes are denied, including direct PostgREST requests.
-- Only the server-only, schema-validated write RPC below can create domain revisions.
do $$
declare t text;
begin
  foreach t in array array['teams','coaches','calendar_events','session_revisions',
    'template_revisions','exercise_revisions','scene_revisions','document_revisions',
    'organization_snapshots'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated, service_role', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('create policy member_read on public.%I for select to authenticated
      using (private.is_org_member(organization_id))', t);
  end loop;
end $$;
alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
revoke all on public.organizations, public.organization_memberships from anon, authenticated, service_role;
grant select on public.organizations, public.organization_memberships to anon, authenticated;
create policy member_read on public.organizations for select to authenticated
  using (private.is_org_member(id));
create policy own_membership on public.organization_memberships for select to authenticated
  using (user_id = (select auth.uid()) and active);

create function public.save_coaching_bundle(
  p_organization_id text, p_actor uuid, p_expected_version bigint, p_bundle jsonb
) returns bigint language plpgsql security definer set search_path = '' as $$
declare
  current_version bigint;
  collection text;
  target_table text;
  rec jsonb;
  prior jsonb;
  old_bundle jsonb;
  key text;
  seen text[];
  has_revision boolean;
begin
  -- p_actor comes exclusively from server-side getUser(), never from the HTTP body.
  perform 1 from public.organization_memberships
    where organization_id = p_organization_id and user_id = p_actor and active for share;
  if not found then
    raise exception using errcode = '42501', message = 'Organization unavailable';
  end if;
  select version into current_version from public.organizations
    where id = p_organization_id for update;
  if p_expected_version is null or p_expected_version <> current_version then
    raise exception using errcode = '40001', message = 'Revision conflict';
  end if;
  if p_bundle is null or jsonb_typeof(p_bundle) <> 'object'
    or p_bundle->>'organizationId' is distinct from p_organization_id
    or p_bundle->>'schemaVersion' is distinct from '1.0'
    or p_bundle->>'format' is distinct from 'football-formation-domain'
    or octet_length(p_bundle::text) > 10485760 then
    raise exception using errcode = '22023', message = 'Invalid domain bundle';
  end if;
  select bundle into old_bundle from public.organization_snapshots
    where organization_id = p_organization_id and version = current_version;
  foreach collection in array array['teams','coaches','events','sessions','templates','exercises','scenes','documents'] loop
    if jsonb_typeof(p_bundle->collection) is distinct from 'array' then
      raise exception using errcode = '22023', message = 'Missing domain collection';
    end if;
    has_revision := collection not in ('teams','coaches');
    seen := array[]::text[];
    -- Previously saved records may not disappear; revisions may not be rewritten.
    for prior in select value from jsonb_array_elements(coalesce(old_bundle->collection, '[]'::jsonb)) loop
      if not exists (select 1 from jsonb_array_elements(p_bundle->collection) incoming
        where incoming->>'id' = prior->>'id'
        and (not has_revision or incoming = prior)) then
        raise exception using errcode = '22023', message = 'Saved history cannot be removed or changed';
      end if;
    end loop;
    target_table := case collection when 'events' then 'calendar_events'
      when 'sessions' then 'session_revisions' when 'templates' then 'template_revisions'
      when 'exercises' then 'exercise_revisions' when 'scenes' then 'scene_revisions'
      when 'documents' then 'document_revisions' else collection end;
    for rec in select value from jsonb_array_elements(p_bundle->collection) loop
      if jsonb_typeof(rec) <> 'object' or rec->>'organizationId' is distinct from p_organization_id
        or rec->>'schemaVersion' is distinct from '1.0'
        or rec->>'id' is null or rec->>'id' !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$' then
        raise exception using errcode = '22023', message = 'Invalid record identity';
      end if;
      key := rec->>'id';
      if has_revision then
        if jsonb_typeof(rec->'revision') is distinct from 'number'
          or (rec->>'revision')::numeric not between 1 and 9007199254740991
          or (rec->>'revision')::numeric <> trunc((rec->>'revision')::numeric) then
          raise exception using errcode = '22023', message = 'Invalid record revision';
        end if;
        key := key || '@' || ((rec->>'revision')::bigint)::text;
      end if;
      if key = any(seen) then
        raise exception using errcode = '22023', message = 'Duplicate record identity';
      end if;
      seen := array_append(seen, key);
      if collection = 'coaches' and rec->>'membershipId' is not null
        and not exists (select 1 from public.organization_memberships
          where organization_id = p_organization_id and id = rec->>'membershipId') then
        raise exception using errcode = '22023', message = 'Invalid coach membership reference';
      end if;
      if has_revision then
        execute format('insert into public.%I(organization_id,id,revision,payload)
          values ($1,$2,$3,$4) on conflict do nothing', target_table)
          using p_organization_id, rec->>'id', (rec->>'revision')::bigint, rec;
      else
        execute format('insert into public.%I(organization_id,id,payload) values ($1,$2,$3)
          on conflict (organization_id,id) do update set payload = excluded.payload', target_table)
          using p_organization_id, rec->>'id', rec;
      end if;
    end loop;
  end loop;
  insert into public.organization_snapshots(organization_id,version,bundle)
    values (p_organization_id, current_version + 1, p_bundle);
  update public.organizations set version = current_version + 1 where id = p_organization_id;
  return current_version + 1;
end;
$$;
revoke all on function public.save_coaching_bundle(text,uuid,bigint,jsonb) from public, anon, authenticated;
grant execute on function public.save_coaching_bundle(text,uuid,bigint,jsonb) to service_role;
commit;
