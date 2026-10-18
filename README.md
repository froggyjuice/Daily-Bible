# 매일성경 (Daily Bible)

성서유니온 매일성경 본문 & 해설 자동 스크래퍼 + 웹 대시보드 (Vercel + Supabase)

## 구조

```
Vercel Cron (하루 1회, icn1) ─┐
대시보드 🔄 버튼 (/api/scrape) ├─ lib/job.js → lib/scrape.js (fetch) → Supabase qt_entries (upsert)
로컬 PC 로그온 (대체 경로)   ─┘
                                        │
                     /api/entries · /api/entry  (암호 쿠키 필요)
                                        │
                      index.html · app.js · style.css (Vercel 정적 호스팅)
```

- **스크랩**: 사이트가 내부적으로 쓰는 AJAX JSON 엔드포인트(`/Ajax/Bible/BodyBibleCont`, `/Ajax/Bible/BodyBible`)를 `fetch`로 직접 호출합니다. 브라우저(Playwright)가 필요 없고, 날짜를 지정해 과거 날짜도 받을 수 있습니다. 출력 마크다운은 예전 Playwright 스크래퍼와 같습니다.
- **데이터**: Supabase Postgres `qt_entries`(날짜 + 트랙 기본키). RLS를 켜고 정책을 두지 않았으므로 서버의 secret 키로만 접근할 수 있습니다. 본문/해설은 저장소에 두지 않습니다(저작권).
- **암호**: `SITE_PASSWORD`로 한 번 로그인하면 1년짜리 HttpOnly 쿠키가 발급되어, 같은 브라우저에서는 다시 묻지 않습니다. 암호를 바꾸면 기존 쿠키는 모두 무효가 됩니다.
- **IP 차단**: `sum.su.or.kr`는 일부 해외/클라우드 IP를 막습니다(GitHub Actions에서 `ERR_CONNECTION_TIMED_OUT`). 그래서 Vercel 함수는 서울(icn1)에서 돌리고, 그래도 막히는 날을 대비해 로컬 PC 자동화를 대체 경로로 둡니다.

## 환경변수

`.env.example` 참고. Vercel 프로젝트 설정과 로컬 `.env.local`(gitignore) 양쪽에 넣습니다.

| 이름 | 용도 |
|------|------|
| `SUPABASE_URL` | Supabase 프로젝트 URL |
| `SUPABASE_SECRET_KEY` | Supabase secret(service_role) 키 — 서버 전용 |
| `SITE_PASSWORD` | 사이트 공유 암호 |
| `AUTH_SECRET` | 쿠키 서명용 무작위 문자열 |
| `CRON_SECRET` | Vercel Cron 호출 인증 |

## 처음 설정

1. Supabase에서 서울(Northeast Asia — Seoul) 리전으로 프로젝트를 만들고, SQL Editor에서 `supabase/schema.sql`을 실행합니다.
2. `.env.local`을 작성합니다.
3. (기존 JSON이 있다면) `node --env-file=.env.local scripts/migrate.mjs`
4. Vercel에 이 저장소를 연결하고 환경변수를 등록한 뒤 배포합니다.

## 로컬 스크랩 / 백필

```bash
node --env-file=.env.local scripts/scrape.mjs                       # 최근 30일 ~ 이틀 뒤 중 빠진 날짜
node --env-file=.env.local scripts/scrape.mjs --all                 # DB 최초 날짜부터 빠진 날짜 전부
node --env-file=.env.local scripts/scrape.mjs --from 2026-01-01     # 특정 기간
node --env-file=.env.local scripts/scrape.mjs --date 2026-10-12 --force
```

### 로그온 자동 실행 (Windows, 대체 경로)

`auto_scrape.ps1`이 위 기본 명령을 실행하고 `logs/auto_scrape.log`에 기록합니다. 작업 스케줄러 등록 예시:

```powershell
$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument '-WindowStyle Hidden -ExecutionPolicy Bypass -File "<repo-path>\auto_scrape.ps1"'
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "<DOMAIN>\<user>"
$trigger.Delay = "PT1M"
Register-ScheduledTask -TaskName "DailyBibleAutoScrape" -Action $action -Trigger $trigger -RunLevel Limited
```

## 파일 구조

```
bible_scraper/
├── api/
│   ├── login.js          # POST 암호 확인 → 쿠키 발급
│   ├── entries.js        # GET 날짜 목록
│   ├── entry.js          # GET 날짜별 본문/해설 마크다운
│   ├── scrape.js         # POST 🔄 버튼: 최근 7일 ~ 이틀 뒤 빠진 날짜 스크랩
│   └── cron/scrape.js    # Vercel Cron: 최근 30일 ~ 이틀 뒤 빠진 날짜 스크랩
├── lib/
│   ├── scrape.js         # sum.su.or.kr AJAX 호출 + 마크다운 변환
│   ├── job.js            # 빠진 날짜 계산 → 스크랩 → upsert → scrape_runs 기록
│   ├── db.js             # Supabase PostgREST 최소 클라이언트
│   └── auth.js           # 암호 쿠키
├── scripts/
│   ├── scrape.mjs        # 로컬 CLI
│   └── migrate.mjs       # 1회용 JSON → Supabase 이전
├── supabase/schema.sql
├── auto_scrape.ps1       # 로그온 자동 실행 (대체 경로)
├── index.html · app.js · style.css · favicon.svg
└── vercel.json           # icn1 리전, Cron, 헤더
```

## 출처

- 매일성경: [성서유니온선교회](https://sum.su.or.kr)
- 해설의 저작권은 성서유니온에 있습니다.
