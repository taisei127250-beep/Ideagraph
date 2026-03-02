-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Profiles table (auto-created on auth.users insert)
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text,
  avatar_color text default '#818cf8',
  created_at timestamptz default now()
);

-- Ideas table
create table ideas (
  id text primary key,
  user_id uuid references profiles(id) on delete cascade not null,
  content text not null,
  tags text[] default '{}',
  summary text,
  genre_id text,
  serendipity jsonb default '[]',
  created_at timestamptz default now()
);

-- Genres table (composite PK)
create table genres (
  id text not null,
  user_id uuid references profiles(id) on delete cascade not null,
  name text not null,
  emoji text,
  idea_ids text[] default '{}',
  primary key (id, user_id)
);

-- Tag layers table (composite PK)
create table tag_layers (
  user_id uuid references profiles(id) on delete cascade not null,
  level int not null,
  groups jsonb not null default '[]',
  updated_at timestamptz default now(),
  primary key (user_id, level)
);

-- Indexes for performance
create index idx_ideas_user_id on ideas(user_id);
create index idx_ideas_genre_id on ideas(genre_id);
create index idx_genres_user_id on genres(user_id);

-- RLS Policies
alter table profiles enable row level security;
alter table ideas enable row level security;
alter table genres enable row level security;
alter table tag_layers enable row level security;

-- Profiles: everyone can read (for integrated view), only own user can modify
create policy "profiles_select" on profiles for select using (true);
create policy "profiles_insert" on profiles for insert with check (auth.uid() = id);
create policy "profiles_update" on profiles for update using (auth.uid() = id);

-- Ideas: everyone can read, only own user can modify
create policy "ideas_select" on ideas for select using (true);
create policy "ideas_insert" on ideas for insert with check (auth.uid() = user_id);
create policy "ideas_update" on ideas for update using (auth.uid() = user_id);
create policy "ideas_delete" on ideas for delete using (auth.uid() = user_id);

-- Genres: everyone can read, only own user can modify
create policy "genres_select" on genres for select using (true);
create policy "genres_insert" on genres for insert with check (auth.uid() = user_id);
create policy "genres_update" on genres for update using (auth.uid() = user_id);
create policy "genres_delete" on genres for delete using (auth.uid() = user_id);

-- Tag layers: everyone can read, only own user can modify
create policy "tag_layers_select" on tag_layers for select using (true);
create policy "tag_layers_insert" on tag_layers for insert with check (auth.uid() = user_id);
create policy "tag_layers_update" on tag_layers for update using (auth.uid() = user_id);
create policy "tag_layers_delete" on tag_layers for delete using (auth.uid() = user_id);

-- Trigger: auto-create profile when user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
