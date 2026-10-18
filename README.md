# 매일성경 (Daily Bible)

성서유니온 매일성경 본문 & 해설 자동 스크래퍼 + 웹 대시보드 (Vercel + Supabase)

## 구조

```
Vercel Cron (하루 1회, icn1) ─┐
대시보드 🔄 버튼 (/api/scrape) ├─ api/_lib/job.js → api/_lib/scrape.js (fetch) → Supabase qt_entries (upsert)
로컬 PC 로그온 (대체 경로)   ─┘
                                        │
                     /api/entries · /api/entry  (암호 쿠키 필요)
                                        │
                      index.html · app.js · style.css (Vercel 정적 호스팅)
```

- **스크랩**: 사이트가 내부적으로 쓰는 AJAX JSON 엔드포인트(`/Ajax/Bible/BodyBibleCont`, `/Ajax/Bible/BodyBible`)를 `fetch`로 직접 호출합니다. 브라우저(Playwright)가 필요 없고, 날짜를 지정해 과거 날짜도 받을 수 있습니다. 출력 마크다운은 예전 Playwright 스크래퍼와 같습니다.
- **데이터**: Supabase Postgres `qt_entries`(날짜 + 트랙 기본키). RLS를 켜고 정책을 두지 않았으므로 서버의 secret 키로만 접근할 수 있습니다. 본문/해설은 저장소에 두지 않습니다(저작권).
- **공개 범위**: KST 기준 오늘 본문까지만 저장·공개합니다. Cron 은 자정 직후(00:05 KST, Hobby 플랜이라 최대 59분 지연)에 돌고, 그 전에 누가 먼저 접속하면 `/api/entries` 가 오늘자를 즉석에서 받아옵니다.
- **책 펼침면**: 해설(왼쪽 쪽)과 본문(오른쪽 쪽)을 한 화면에. 900px 미만에서는 해설부터 한 쪽씩 옆으로 넘기고, 위의 📝 해설 / 📖 본문 버튼으로 이동.
- **메모 / 나눔 도크**: 책 아래 ✏️ 메모 · 💬 나눔 · 🔖 책갈피 버튼으로 열고 닫음. 메모는 날짜별로 이 브라우저(localStorage)에, 나눔(댓글)은 Supabase `qt_comments` 에 저장(닉네임만, 브라우저 토큰으로 본인 댓글만 삭제). 매일성경/순은 같은 성경 본문이라 날짜 단위로 공유.
- **계절 테마**: 🌼 봄(연두·초록·노랑) / 🐬 여름(하늘·연주황·살구) / 🍂 가을(양피지·금빛) / ☃️ 겨울(어두운 밤하늘). 고르지 않으면 지금 계절(KST 월 기준).
- **절별 책갈피**: 본문에서 절을 탭해 고른 뒤 하단 바 🔖 (다시 누르면 빠짐). 표시는 계절 아이콘(🌼 🐬 🍂 ☃️)을 따라가고, 아래 도크 🔖 책갈피에서 모아보기 → 누르면 그 날짜·그 절로 이동. 이 브라우저(localStorage `bookmarks`)에만 저장. 예전 형광펜(절 단위) 기록은 처음 열 때 책갈피로 옮겨짐.
- **공식 오디오**: ⋯ 더보기 → 🎧 듣기 — 성서유니온 mp3(본문낭독 + 오디오해설)를 화면 안에서 재생. 주소와 낭독자는 스크랩 때 `BodyMatterDetail` 에서 함께 저장.
- **⋯ 더보기** (본문 탭 옆 메뉴): 🎵 찬송 N장(본문 머리의 새찬송가 번호로 유튜브 검색) / ▶ 유튜브 / 🔍 웹 검색 / 🤝 같이 읽어요(권유 멘트 + 날짜·제목 + 본문 위치 + 고른 절(없으면 첫 절) + 링크 `?date=YYYY-MM-DD&v=soon`) / 📱 갓피플성경(모바일 전용 — 본문 위치를 복사한 뒤 앱 실행. 특정 본문으로 바로 가는 공개 링크가 없음).
- **🧩 말씀 퍼즐** (⋯ 더보기): 그날 본문으로 하는 탭 퍼즐. 조각 맞추기(한 절을 어절 조각으로 섞음, 고른 절이 있으면 그 절) / 순서 맞추기(이어지는 5절을 섞음). 누를 때마다 채점, 💡 힌트, 시간·실수·힌트 기록, 맞히면 계절 아이콘이 떠오름. 날짜별 맞힌 개수는 localStorage `puzzle:{date}`.
- **앱 설치 (PWA)**: `manifest.webmanifest` + `sw.js`(화면 파일만 네트워크 우선 캐시, `/api/*` 는 캐시 안 함) + `icons/`. 안드로이드·PC 크롬/엣지는 📲 설치하기 버튼으로 바로 설치, 아이폰은 Safari 공유 → 홈 화면에 추가(앱 안 가이드에서 기기별 안내). 설치 앱은 저장 공간이 따로일 수 있어 첫 실행 때 암호를 다시 입력.
- **암호**: `SITE_PASSWORD`로 한 번 로그인하면 1년짜리 HttpOnly 쿠키가 발급되어, 같은 브라우저에서는 다시 묻지 않습니다. 암호를 바꾸면 기존 쿠키는 모두 무효가 됩니다.
- **IP 차단**: `sum.su.or.kr`는 일부 해외/클라우드 IP를 막습니다(GitHub Actions 미국 러너에서 `ERR_CONNECTION_TIMED_OUT`). Vercel 함수는 서울(icn1)에서 돌며, 2026-10-18 테스트에서 5회 모두 정상 접속됐습니다. 그래도 막히는 날을 대비해 로컬 PC 자동화를 대체 경로로 둡니다(`scrape_runs` 테이블에서 실패 여부 확인).

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
node --env-file=.env.local scripts/scrape.mjs                       # 최근 30일 ~ 오늘 중 빠진 날짜
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
│   ├── comments.js       # GET/POST/DELETE 날짜별 댓글
│   ├── scrape.js         # POST 🔄 버튼: 최근 7일 ~ 오늘 빠진 날짜 스크랩
│   └── cron/scrape.js    # Vercel Cron: 최근 30일 ~ 오늘 빠진 날짜 스크랩
├── api/_lib/            # 라우트가 아닌 서버 전용 모듈 (정적 공개 안 됨)
│   ├── scrape.js         # sum.su.or.kr AJAX 호출 + 마크다운 변환
│   ├── job.js            # 빠진 날짜 계산 → 스크랩 → upsert → scrape_runs 기록
│   ├── db.js             # Supabase PostgREST 최소 클라이언트
│   └── auth.js           # 암호 쿠키
├── scripts/
│   ├── scrape.mjs        # 로컬 CLI
│   └── migrate.mjs       # 1회용 JSON → Supabase 이전
├── supabase/schema.sql  # 전체 스키마 (migrations/ 는 기존 DB에 추가로 적용할 변경분)
├── auto_scrape.ps1       # 로그온 자동 실행 (대체 경로)
├── index.html · app.js · style.css · favicon.svg
├── manifest.webmanifest · sw.js · icons/   # 앱 설치(PWA)
└── vercel.json           # icn1 리전, Cron(00:05 KST), 헤더
```

## 출처

- 매일성경: [성서유니온선교회](https://sum.su.or.kr)
- 해설의 저작권은 성서유니온에 있습니다.
