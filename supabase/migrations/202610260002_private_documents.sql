-- Journal only: does not provision a bucket, hosted project, credentials or Auth accounts.
begin;
create table public.private_document_objects (
  organization_id text not null references public.organizations(id),
  id text not null check (id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$'),
  revision bigint not null check (revision between 1 and 9007199254740991),
  object_key text not null unique,
  filename text not null check (length(filename) between 5 and 190 and filename !~ '[/\\]' and position('..' in filename)=0),
  byte_length integer not null check (byte_length between 1 and 3145728),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  actor uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key (organization_id,id,revision),
  check (object_key ~ '^[A-Za-z0-9_-]+/[0-9a-f-]{36}\.pdf$'),
  check (split_part(object_key,'/',1)=organization_id)
);
create trigger immutable before update or delete on public.private_document_objects
  for each row execute function private.immutable_revision();
alter table public.private_document_objects enable row level security;
revoke all on public.private_document_objects from public,anon,authenticated,service_role;
grant select on public.private_document_objects to service_role;

create function public.register_coaching_document(p_actor uuid,p_record jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.organization_memberships where organization_id=p_record->>'organization_id'
    and user_id=p_actor and active for share;
  if not found then raise exception using errcode='42501',message='Organization unavailable'; end if;
  insert into public.private_document_objects(organization_id,id,revision,object_key,filename,byte_length,sha256,actor)
    values(p_record->>'organization_id',p_record->>'id',(p_record->>'revision')::bigint,
      p_record->>'object_key',p_record->>'filename',(p_record->>'byte_length')::integer,p_record->>'sha256',p_actor);
end;
$$;
revoke all on function public.register_coaching_document(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.register_coaching_document(uuid,jsonb) to service_role;
commit;
