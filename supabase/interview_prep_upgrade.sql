alter table public.entries
  add column if not exists content_json jsonb,
  add column if not exists attachments jsonb;

insert into storage.buckets (id, name, public)
values ('study-uploads', 'study-uploads', false)
on conflict (id) do update
set public = false;

drop policy if exists "study_uploads_select_own" on storage.objects;
create policy "study_uploads_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'study-uploads'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "study_uploads_insert_own" on storage.objects;
create policy "study_uploads_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'study-uploads'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "study_uploads_update_own" on storage.objects;
create policy "study_uploads_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'study-uploads'
  and split_part(name, '/', 1) = auth.uid()::text
)
with check (
  bucket_id = 'study-uploads'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "study_uploads_delete_own" on storage.objects;
create policy "study_uploads_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'study-uploads'
  and split_part(name, '/', 1) = auth.uid()::text
);
