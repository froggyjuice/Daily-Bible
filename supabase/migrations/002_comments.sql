-- ── 댓글 (날짜별 — 매일성경/순은 같은 성경 본문이라 공유. 로그인 없이 닉네임, 브라우저 토큰으로 본인 삭제) ──
create table if not exists public.qt_comments (
  id          bigserial   primary key,
  qt_date     date        not null,
  nickname    text        not null check (char_length(nickname) between 1 and 20),
  body        text        not null check (char_length(body) between 1 and 500),
  delete_hash text        not null,          -- sha256(브라우저 토큰), 본인 삭제 확인용
  created_at  timestamptz not null default now()
);
create index if not exists qt_comments_date on public.qt_comments (qt_date, created_at);

alter table public.qt_comments enable row level security;
revoke all on public.qt_comments from anon, authenticated;
