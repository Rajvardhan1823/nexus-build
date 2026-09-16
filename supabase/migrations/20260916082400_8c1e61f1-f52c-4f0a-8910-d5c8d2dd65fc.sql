create table public.profiles (
  user_id uuid primary key,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "Users manage their own profile" on public.profiles for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  file_name text not null,
  storage_path text not null,
  extracted_text text,
  skills text[] not null default '{}',
  processing_status text not null default 'queued',
  processing_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.resumes to authenticated;
grant all on public.resumes to service_role;
alter table public.resumes enable row level security;
create policy "Users manage their own resumes" on public.resumes for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_listing_id text,
  source_url text not null,
  title text not null,
  company text not null,
  location text,
  remote_ok boolean not null default false,
  stipend text,
  required_skills text[] not null default '{}',
  experience_level text,
  deadline date,
  description text,
  raw_text text,
  extraction_status text not null default 'pending',
  scraped_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_url)
);
grant select on public.listings to authenticated;
grant all on public.listings to service_role;
alter table public.listings enable row level security;
create policy "Signed in users can browse listings" on public.listings for select to authenticated using (true);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  resume_id uuid not null references public.resumes(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  score numeric(5,2) not null default 0,
  explanation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, resume_id, listing_id)
);
grant select, insert, update, delete on public.matches to authenticated;
grant all on public.matches to service_role;
alter table public.matches enable row level security;
create policy "Users manage their own matches" on public.matches for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.shortlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  listing_id uuid not null references public.listings(id) on delete cascade,
  match_id uuid references public.matches(id) on delete set null,
  status text not null default 'saved',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, listing_id)
);
grant select, insert, update, delete on public.shortlist_items to authenticated;
grant all on public.shortlist_items to service_role;
alter table public.shortlist_items enable row level security;
create policy "Users manage their own shortlist" on public.shortlist_items for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.agent_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null default 'Nexus session',
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.agent_conversations to authenticated;
grant all on public.agent_conversations to service_role;
alter table public.agent_conversations enable row level security;
create policy "Users manage their own conversations" on public.agent_conversations for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.action_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  job_type text not null,
  status text not null default 'queued',
  listing_id uuid references public.listings(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.action_jobs to authenticated;
grant all on public.action_jobs to service_role;
alter table public.action_jobs enable row level security;
create policy "Users manage their own action jobs" on public.action_jobs for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.update_updated_at_column()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.update_updated_at_column();
create trigger resumes_updated_at before update on public.resumes for each row execute function public.update_updated_at_column();
create trigger listings_updated_at before update on public.listings for each row execute function public.update_updated_at_column();
create trigger matches_updated_at before update on public.matches for each row execute function public.update_updated_at_column();
create trigger shortlist_items_updated_at before update on public.shortlist_items for each row execute function public.update_updated_at_column();
create trigger agent_conversations_updated_at before update on public.agent_conversations for each row execute function public.update_updated_at_column();
create trigger action_jobs_updated_at before update on public.action_jobs for each row execute function public.update_updated_at_column();