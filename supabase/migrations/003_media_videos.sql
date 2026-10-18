-- 공식 오디오 (성서유니온 mp3 주소 + 낭독/해설자) — 매일성경/순 공통 오디오
alter table public.qt_entries
  add column if not exists media_url text,
  add column if not exists speaker   text;

-- 유튜브 검색 결과 캐시 (날짜별 — API 할당량 절약)
create table if not exists public.qt_videos (
  qt_date    date        primary key,
  query      text        not null,
  items      jsonb       not null,            -- [{ id, title, channel, thumb, published }]
  fetched_at timestamptz not null default now()
);

alter table public.qt_videos enable row level security;
revoke all on public.qt_videos from anon, authenticated;
