-- Every workspace record is owned by the authenticated user. RLS is the
-- authorization boundary: a client cannot access another user's data by
-- changing an ID in the browser, request, or URL.

alter table public.listings add column if not exists user_id uuid references auth.users(id) on delete cascade;
-- Existing unowned rows remain inaccessible once the user-scoped policy below
-- is applied. New inserts always include a user_id from the authenticated UI.

alter table public.listings drop constraint if exists listings_source_source_url_key;
alter table public.listings drop constraint if exists listings_user_id_source_source_url_key;
alter table public.listings add constraint listings_user_id_source_source_url_key unique (user_id, source, source_url);

drop policy if exists "Signed in users can browse listings" on public.listings;
drop policy if exists "Authenticated users can add listings" on public.listings;
drop policy if exists "Authenticated users can update listings" on public.listings;
drop policy if exists "Users manage their own listings" on public.listings;
create policy "Users manage their own listings"
on public.listings for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Do not allow a user to create a match or shortlist item that points to a
-- resume, listing, or match belonging to somebody else.
drop policy if exists "Users manage their own matches" on public.matches;
create policy "Users manage their own matches"
on public.matches for all to authenticated
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (select 1 from public.resumes r where r.id = resume_id and r.user_id = auth.uid())
  and exists (select 1 from public.listings l where l.id = listing_id and l.user_id = auth.uid())
);

drop policy if exists "Users manage their own shortlist" on public.shortlist_items;
create policy "Users manage their own shortlist"
on public.shortlist_items for all to authenticated
using (auth.uid() = user_id)
with check (
  auth.uid() = user_id
  and exists (select 1 from public.listings l where l.id = listing_id and l.user_id = auth.uid())
  and (match_id is null or exists (select 1 from public.matches m where m.id = match_id and m.user_id = auth.uid()))
);

create table if not exists public.chat_briefings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  title text not null default 'Career assistant',
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.chat_briefings to authenticated;
grant all on public.chat_briefings to service_role;
alter table public.chat_briefings enable row level security;
drop policy if exists "Users manage their own chat briefings" on public.chat_briefings;
create policy "Users manage their own chat briefings"
on public.chat_briefings for all to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);
drop trigger if exists chat_briefings_updated_at on public.chat_briefings;
create trigger chat_briefings_updated_at before update on public.chat_briefings for each row execute function public.update_updated_at_column();

-- Resume object paths are created as <auth.uid()>/<file>. Only the owning
-- authenticated user may read, write, or delete that user's objects.
drop policy if exists "Users manage their own resume files" on storage.objects;
create policy "Users manage their own resume files"
on storage.objects for all to authenticated
using (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text)
with check (bucket_id = 'resumes' and (storage.foldername(name))[1] = auth.uid()::text);
