-- Ensure the 'birds' bucket exists
-- Note: You might need to create this bucket manually in the Supabase Dashboard if this script fails due to permissions.
insert into storage.buckets (id, name, public)
values ('birds', 'birds', true)
on conflict (id) do nothing;

-- Enable RLS on objects (Usually enabled by default, skipping to avoid permission errors)
-- alter table storage.objects enable row level security;

-- Policy: Everyone can view images in 'birds' bucket
drop policy if exists "Public Access" on storage.objects;
create policy "Public Access"
  on storage.objects for select
  using ( bucket_id = 'birds' );

-- Policy: Authenticated users can upload images to 'birds' bucket
drop policy if exists "Authenticated users can upload" on storage.objects;
create policy "Authenticated users can upload"
  on storage.objects for insert
  with check ( bucket_id = 'birds' and auth.role() = 'authenticated' );

-- Policy: Users can update their own images
drop policy if exists "Users can update own files" on storage.objects;
create policy "Users can update own files"
  on storage.objects for update
  using ( bucket_id = 'birds' and auth.uid() = owner );

-- Policy: Users can delete their own images
drop policy if exists "Users can delete own files" on storage.objects;
create policy "Users can delete own files"
  on storage.objects for delete
  using ( bucket_id = 'birds' and auth.uid() = owner );
