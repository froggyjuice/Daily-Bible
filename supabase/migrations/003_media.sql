-- 공식 오디오 (성서유니온 mp3 주소 + 낭독/해설자) — 매일성경/순 공통 오디오
alter table public.qt_entries
  add column if not exists media_url text,
  add column if not exists speaker   text;
