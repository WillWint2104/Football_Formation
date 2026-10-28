begin;
do $$ begin
  if exists (select 1 from public.presentation_revisions) then
    raise exception 'Presentation history exists: retain journal and roll back application only';
  end if;
end $$;
drop function public.save_presentation(text,uuid,bigint,jsonb);
drop view public.presentations_current;
drop table public.presentation_revisions;
drop table public.presentation_heads;
commit;
