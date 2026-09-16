-- Listings are shared public opportunity records. Authenticated users need
-- write access because the browser saves extracted website results directly.
grant insert, update on public.listings to authenticated;

drop policy if exists "Authenticated users can add listings" on public.listings;
create policy "Authenticated users can add listings"
on public.listings
for insert
to authenticated
with check (true);

drop policy if exists "Authenticated users can update listings" on public.listings;
create policy "Authenticated users can update listings"
on public.listings
for update
to authenticated
using (true)
with check (true);
