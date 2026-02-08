-- Create system_settings table for storing global app configuration
create table if not exists public.system_settings (
    key text primary key,
    value text not null, -- Stores values as text, can be cast to specific types
    description text,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_by uuid references auth.users(id)
);

-- Enable RLS
alter table public.system_settings enable row level security;

-- Policies
-- 1. Read access: Authenticated users can read settings (e.g. for Dashboard)
create policy "Allow read access for authenticated users"
on public.system_settings for select
to authenticated
using (true);

-- 2. Write access: Only service_role (Admin actions) can modify settings
create policy "Allow all access for service_role"
on public.system_settings for all
to service_role
using (true);

-- Indexes
create index if not exists system_settings_key_idx on public.system_settings (key);

-- Insert default value if not exists (optional, handled by code)
-- insert into public.system_settings (key, value, description) 
-- values ('last_import_at', extract(epoch from now())::text, 'Timestamp of last successful data import')
-- on conflict do nothing;
