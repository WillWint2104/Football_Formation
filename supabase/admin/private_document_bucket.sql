-- OPERATOR ONLY after separate hosted-service approval. NOT run by application or migration.
-- Review existing Storage policies before executing. Service-role server clients bypass RLS.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values ('coaching-documents','coaching-documents',false,3145728,array['application/pdf']);
-- Defense against unrelated permissive object policies. No browser access to this bucket.
create policy coaching_documents_server_only on storage.objects as restrictive
  for all to anon,authenticated using (bucket_id <> 'coaching-documents')
  with check (bucket_id <> 'coaching-documents');
commit;
