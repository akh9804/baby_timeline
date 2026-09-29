-- Apply once with the Supabase SQL editor or supabase db push.
create table public.children (
  id uuid primary key default gen_random_uuid(), name text,
  due_date date, birth_date date,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.editors (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text, created_at timestamptz not null default now()
);
create table public.moments (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.children(id),
  title text not null check (char_length(title) between 1 and 120),
  description text check (char_length(description) <= 5000),
  occurred_at timestamptz not null,
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create type public.media_type as enum ('image', 'video');
create table public.media (
  id uuid primary key default gen_random_uuid(),
  moment_id uuid not null references public.moments(id) on delete cascade,
  type public.media_type not null, storage_path text not null unique,
  file_name text, mime_type text not null,
  file_size bigint not null check (file_size > 0 and file_size <= 524288000),
  width integer check (width > 0), height integer check (height > 0),
  duration_seconds numeric check (duration_seconds >= 0), captured_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint allowed_media_type check (
    (type = 'image' and mime_type in ('image/jpeg','image/png','image/webp','image/gif')) or
    (type = 'video' and mime_type in ('video/mp4','video/quicktime','video/webm'))
  )
);
create index moments_timeline_idx on public.moments(child_id, occurred_at desc, id desc);
create index media_moment_idx on public.media(moment_id, sort_order);

create function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger children_updated before update on public.children for each row execute function public.touch_updated_at();
create trigger moments_updated before update on public.moments for each row execute function public.touch_updated_at();

-- SECURITY DEFINER avoids recursive RLS on the allowlist; clients cannot change membership.
create function public.is_editor() returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.editors where user_id = (select auth.uid()));
$$;
revoke all on function public.is_editor() from public;
grant execute on function public.is_editor() to authenticated;
alter table public.children enable row level security;
alter table public.editors enable row level security;
alter table public.moments enable row level security;
alter table public.media enable row level security;
revoke all on public.children, public.editors, public.moments, public.media from anon, authenticated;
grant select on public.editors to authenticated;
grant select, insert, update, delete on public.children, public.moments, public.media to authenticated;
create policy editors_self on public.editors for select to authenticated using (user_id = (select auth.uid()));
create policy children_editor on public.children for all to authenticated using ((select public.is_editor())) with check ((select public.is_editor()));
create policy moments_editor on public.moments for all to authenticated using ((select public.is_editor())) with check ((select public.is_editor()));
create policy media_editor on public.media for all to authenticated using ((select public.is_editor())) with check ((select public.is_editor()));

-- Reject arbitrary paths, MIME mismatches, and attachment moves, even for direct browser writes.
create function public.validate_media_path() returns trigger language plpgsql set search_path = '' as $$
declare child uuid; extension text;
begin
  select child_id into child from public.moments where id = new.moment_id;
  extension := case new.mime_type when 'image/jpeg' then 'jpg' when 'image/png' then 'png'
    when 'image/webp' then 'webp' when 'image/gif' then 'gif' when 'video/mp4' then 'mp4'
    when 'video/quicktime' then 'mov' when 'video/webm' then 'webm' end;
  if extension is null or child is null or new.storage_path <> 'children/' || child || '/moments/' || new.moment_id || '/' || new.id || '.' || extension then
    raise exception 'Invalid media storage path';
  end if;
  if TG_OP = 'UPDATE' and (new.storage_path <> old.storage_path or new.moment_id <> old.moment_id or new.id <> old.id) then
    raise exception 'Media location is immutable';
  end if;
  return new;
end;
$$;
create trigger validate_media_path before insert or update on public.media for each row execute function public.validate_media_path();
create function public.keep_moment_child() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.child_id <> old.child_id then raise exception 'Moment child is immutable'; end if;
  return new;
end;
$$;
create trigger keep_moment_child before update on public.moments for each row execute function public.keep_moment_child();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('family-media','family-media',false,524288000,
  array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/quicktime','video/webm'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create policy family_media_select on storage.objects for select to authenticated
using (bucket_id = 'family-media' and (select public.is_editor()));
create policy family_media_insert on storage.objects for insert to authenticated
with check (bucket_id = 'family-media' and (select public.is_editor())
  and name ~ '^children/[0-9a-f-]{36}/moments/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|gif|mp4|mov|webm)$'
  and exists (select 1 from public.moments m where m.id::text = split_part(name,'/',4) and m.child_id::text = split_part(name,'/',2)));
create policy family_media_delete on storage.objects for delete to authenticated
using (bucket_id = 'family-media' and (select public.is_editor()));
-- No UPDATE policy: immutable UUID files, upload with upsert:false.

-- Durable, atomic rate limiting across serverless instances. No raw IP is retained.
create table public.access_attempts (
  key text primary key, attempts integer not null, window_start timestamptz not null
);
alter table public.access_attempts enable row level security;
revoke all on public.access_attempts from public, anon, authenticated;
create function public.consume_access_attempt(fingerprint text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare total integer; personal integer;
begin
  delete from public.access_attempts where window_start < now() - interval '1 day';
  insert into public.access_attempts as a values ('global',1,now())
    on conflict (key) do update set
      attempts = case when a.window_start < now() - interval '15 minutes' then 1 else a.attempts + 1 end,
      window_start = case when a.window_start < now() - interval '15 minutes' then now() else a.window_start end
    returning attempts into total;
  insert into public.access_attempts as a values ('ip:' || fingerprint,1,now())
    on conflict (key) do update set
      attempts = case when a.window_start < now() - interval '15 minutes' then 1 else a.attempts + 1 end,
      window_start = case when a.window_start < now() - interval '15 minutes' then now() else a.window_start end
    returning attempts into personal;
  return total <= 200 and personal <= 10;
end;
$$;
revoke all on function public.consume_access_attempt(text) from public, anon, authenticated;
grant execute on function public.consume_access_attempt(text) to service_role;

-- Track cascade-deleted files durably, including interrupted or concurrent deletions.
-- A server cleanup command drains this queue using the Storage API, never SQL object deletion.
create table public.storage_cleanup (
  storage_path text primary key, media_id uuid not null, moment_id uuid not null,
  created_at timestamptz not null default now()
);
alter table public.storage_cleanup enable row level security;
revoke all on public.storage_cleanup from public, anon, authenticated;
create function public.enqueue_media_cleanup() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.storage_cleanup(storage_path, media_id, moment_id)
    values (old.storage_path, old.id, old.moment_id) on conflict do nothing;
  return old;
end;
$$;
create trigger media_cleanup after delete on public.media for each row execute function public.enqueue_media_cleanup();
