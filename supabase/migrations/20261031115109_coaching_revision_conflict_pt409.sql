-- Deterministic stale versions must not use PostgreSQL serialization_failure.
-- PostgREST 14 retries 40001; PT409 returns an HTTP conflict.
-- CREATE OR REPLACE preserves the existing owner and EXECUTE ACL.
begin;

CREATE OR REPLACE FUNCTION public.save_coaching_bundle(p_organization_id text, p_actor uuid, p_expected_version bigint, p_bundle jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    raise exception using errcode = 'PT409', message = 'Revision conflict';
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
$function$;

commit;
