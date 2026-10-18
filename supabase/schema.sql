-- 매일성경 Supabase 스키마
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 Run.
-- 모든 읽기/쓰기는 서버(Vercel API, 로컬 스크립트)가 secret(service_role) 키로만 수행.
-- RLS 를 켜고 정책을 두지 않으므로 anon/publishable 키로는 아무것도 읽을 수 없음.

create table if not exists public.qt_entries (
  qt_date    date        not null,
  track      text        not null check (track in ('main', 'soon')),
  title      text,
  bible_ref  text,
  content_md text        not null,
  scraped_at timestamptz not null default now(),
  scraped_by text,                       -- 'vercel-cron' | 'vercel-manual' | 'local' | 'migration'
  primary key (qt_date, track)
);

create table if not exists public.scrape_runs (
  id          bigserial   primary key,
  ran_at      timestamptz not null default now(),
  source      text        not null,
  ok          boolean     not null,
  scraped     text[]      not null default '{}',   -- 'YYYY-MM-DD:track'
  error       text
);

alter table public.qt_entries  enable row level security;
alter table public.scrape_runs enable row level security;

-- PostgREST 노출 차단 (service_role 은 RLS·권한을 우회)
revoke all on public.qt_entries  from anon, authenticated;
revoke all on public.scrape_runs from anon, authenticated;
