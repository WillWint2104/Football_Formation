-- Run only against a disposable/empty foundation. Saved data requires export + forward repair.
begin;
do $$ begin
  if exists (select 1 from public.organization_snapshots)
    or exists (select 1 from public.organizations) then
    raise exception 'Rollback refused: organization or coaching data exists. Export and use a forward migration.';
  end if;
end $$;
drop function public.save_coaching_bundle(text,uuid,bigint,jsonb);
drop table public.organization_snapshots, public.document_revisions, public.scene_revisions,
  public.exercise_revisions, public.template_revisions, public.session_revisions,
  public.calendar_events, public.coaches, public.teams;
drop table public.organization_memberships;
drop table public.organizations;
drop function private.is_org_member(text);
drop function private.immutable_revision();
commit;
