create table public.choir_shares (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  title text not null check (char_length(title) <= 500),
  package_version integer not null check (package_version = 1),
  fingerprint text not null check (fingerprint ~ '^[0-9a-f]{64}$'),
  storage_path text not null unique,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  state text not null default 'creating' check (state in ('creating','ready')),
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (owner_id,request_id)
);
alter table public.choir_shares enable row level security;
revoke all on public.choir_shares from anon, authenticated;
grant all on public.choir_shares to service_role;
create index choir_shares_owner_created on public.choir_shares(owner_id,created_at desc);
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('choir-practice-v1','choir-practice-v1',false,10485760,array['application/octet-stream'])
on conflict (id) do update set public=false,file_size_limit=10485760,allowed_mime_types=array['application/octet-stream'];
-- No anonymous/authenticated Storage policies: all reads and mutations pass through the function.
