# 매일성경 (Daily Bible)

성서유니온 매일성경 본문 & 해설 자동 스크래퍼 + 웹 대시보드 (Vercel + Supabase)

## 구조

```
Vercel Cron (하루 1회, icn1) ─┐
대시보드 🔄 버튼 (/api/scrape) ┴─ api/_lib/job.js → api/_lib/scrape.js (fetch) → Supabase qt_entries (upsert)
                                        │
                     /api/entries · /api/entry
                                        │
                      index.html · app.js · pilgrim.js · style.css (Vercel 정적 호스팅)
```

- **스크랩**: 사이트가 내부적으로 쓰는 AJAX JSON 엔드포인트(`/Ajax/Bible/BodyBibleCont`, `/Ajax/Bible/BodyBible`)를 `fetch`로 직접 호출합니다. 브라우저(Playwright)가 필요 없고, 날짜를 지정해 과거 날짜도 받을 수 있습니다. 출력 마크다운은 예전 Playwright 스크래퍼와 같습니다.
- **데이터**: Supabase Postgres `qt_entries`(날짜 + 트랙 기본키). RLS를 켜고 정책을 두지 않았으므로 서버의 secret 키로만 접근할 수 있습니다. 본문/해설은 저장소에 두지 않습니다(저작권).
- **공개 범위**: KST 기준 오늘 본문까지만 저장·공개합니다. Cron 은 자정 직후(00:05 KST, Hobby 플랜이라 최대 59분 지연)에 돌고, 그 전에 누가 먼저 접속하면 `/api/entries` 가 오늘자를 즉석에서 받아옵니다.
- **책 펼침면**: 해설(왼쪽 쪽)과 본문(오른쪽 쪽)을 한 화면에. 900px 미만에서는 해설부터 한 쪽씩 옆으로 넘기고, 위의 📝 해설 / 📖 본문 버튼으로 이동.
- **메모 / 나눔 / 책갈피**: ⋯ 더보기 메뉴 맨 위에서 열면 책 아래에 칸이 펼쳐짐(✕ 또는 같은 메뉴로 닫음). 메모는 날짜별로 이 브라우저(localStorage)에, 나눔(댓글)은 Supabase `qt_comments` 에 저장(닉네임만, 브라우저 토큰으로 본인 댓글만 삭제). 매일성경/순은 같은 성경 본문이라 날짜 단위로 공유.
- **계절 테마**: 🌼 봄(연두·초록·노랑) / 🐬 여름(하늘·연주황·살구) / 🍂 가을(양피지·금빛) / ☃️ 겨울(어두운 밤하늘). 고르지 않으면 지금 계절(KST 월 기준).
- **절별 책갈피**: 본문에서 절을 탭해 고른 뒤 하단 바 🔖 (다시 누르면 빠짐). 표시는 계절 아이콘(🌼 🐬 🍂 ☃️)을 따라가고, ⋯ 더보기 → 🔖 책갈피에서 모아보기 → 누르면 그 날짜·그 절로 이동. 이 브라우저(localStorage `bookmarks`)에만 저장. 예전 형광펜(절 단위) 기록은 처음 열 때 책갈피로 옮겨짐.
- **공식 오디오**: ⋯ 더보기 → 🎧 듣기 — 성서유니온 mp3(본문낭독 + 오디오해설)를 화면 안에서 재생. 주소와 낭독자는 스크랩 때 `BodyMatterDetail` 에서 함께 저장.
- **⋯ 더보기** (본문 탭 옆 메뉴): 🎵 찬송 N장(본문 머리의 새찬송가 번호로 유튜브 검색) / ▶ 유튜브 / 🔍 웹 검색 / 🤝 같이 읽어요(권유 멘트 + 날짜·제목 + 본문 위치 + 고른 절(없으면 첫 절) + 링크 `?date=YYYY-MM-DD&v=soon`) / 📱 갓피플성경(모바일 전용 — 본문 위치를 복사한 뒤 앱 실행. 특정 본문으로 바로 가는 공개 링크가 없음).
- **🗺️ 천로역정 순례길** (헤더 오른쪽 🗺️ 버튼 → 누르면 순례길 창, 새 이야기·관문이 기다리면 아바타가 두근두근): 존 버니언 《천로역정》 제1부를 따라 멸망의 도시에서 천국 성문까지 48칸·19곳을 걷는 보드게임. 하루 최대 3칸 — 📖 오늘 말씀 열기(저절로) · ✏️ 메모(5자 이상)나 나눔 댓글 · 🤝 같이 읽어요 공유(KST 날짜 기준, 종류별 하루 한 번). 장소에 도착하면 짧은 이야기, 관문 10곳은 선택 문제나 그날 본문 퍼즐(조각 맞추기 / 순서 맞추기)을 넘어야 다음으로 가고 그동안 얻은 걸음은 모아 둠. 보스 아폴리온·절망의 거인은 두 판, 의혹의 성 두 번째 판은 내 🔖 책갈피 구절이 「언약 열쇠」. 족자·전신갑주·면류관 등 6가지 순례 가방, 완주 후 다시 순례하기(회차). 진행은 localStorage `pilgrim`. 예전 📮 출석도장(첫 실행 때 지난 출석일을 최대 8칸으로 옮김)과 단독 🧩 말씀 퍼즐을 대체. 이야기는 주요섭 역본의 인물·장소 이름을 따라 새로 쓴 글(번역 문장은 쓰지 않음).
- **앱 설치 (PWA)**: `manifest.webmanifest` + `sw.js`(화면 파일만 네트워크 우선 캐시, `/api/*` 는 캐시 안 함) + `icons/`. 안드로이드·PC 크롬/엣지는 ⋯ 더보기 → 📲 앱으로 설치하기(설치한 앱으로 열면 안 보임)로 바로 설치, 아이폰은 Safari 공유 → 홈 화면에 추가(앱 안 가이드에서 기기별 안내). 설치 앱은 저장 공간이 따로일 수 있어 메모·책갈피는 옮겨지지 않음.
- **공개 접속**: 암호 없이 누구나 열람할 수 있습니다(2026-10-19 암호 게이트 제거). 🔄 `/api/scrape` 는 인스턴스당 1분에 한 번만 돌고, 그 사이 요청은 429.
- **IP 차단**: `sum.su.or.kr`는 일부 해외/클라우드 IP를 막습니다(GitHub Actions 미국 러너에서 `ERR_CONNECTION_TIMED_OUT`). Vercel 함수는 서울(icn1)에서 돌며, 2026-10-18 테스트에서 5회 모두 정상 접속됐습니다. 빠진 날이 있으면 `scrape_runs` 테이블에서 실패 여부를 확인하고, 아래 로컬 CLI로 채웁니다.

## 환경변수

`.env.example` 참고. Vercel 프로젝트 설정과 로컬 `.env.local`(gitignore) 양쪽에 넣습니다.

| 이름 | 용도 |
|------|------|
| `SUPABASE_URL` | Supabase 프로젝트 URL |
| `SUPABASE_SECRET_KEY` | Supabase secret(service_role) 키 — 서버 전용 |
| `CRON_SECRET` | Vercel Cron 호출 인증 |

## 처음 설정

1. Supabase에서 서울(Northeast Asia — Seoul) 리전으로 프로젝트를 만들고, SQL Editor에서 `supabase/schema.sql`을 실행합니다.
2. `.env.local`을 작성합니다.
3. Vercel에 이 저장소를 연결하고 환경변수를 등록한 뒤 배포합니다.

## 수동 스크랩 / 백필 (로컬 CLI)

Cron 이 빠뜨린 날짜를 채우거나 기간을 다시 받을 때 씁니다. 자동 실행은 없습니다.

```bash
node --env-file=.env.local scripts/scrape.mjs                       # 최근 30일 ~ 오늘 중 빠진 날짜
node --env-file=.env.local scripts/scrape.mjs --all                 # DB 최초 날짜부터 빠진 날짜 전부
node --env-file=.env.local scripts/scrape.mjs --from 2026-01-01     # 특정 기간
node --env-file=.env.local scripts/scrape.mjs --date 2026-10-12 --force
```

## 파일 구조

```
bible_scraper/
├── api/
│   ├── entries.js        # GET 날짜 목록
│   ├── entry.js          # GET 날짜별 본문/해설 마크다운
│   ├── comments.js       # GET/POST/DELETE 날짜별 댓글
│   ├── scrape.js         # POST 🔄 버튼: 최근 7일 ~ 오늘 빠진 날짜 스크랩
│   └── cron/scrape.js    # Vercel Cron: 최근 30일 ~ 오늘 빠진 날짜 스크랩
├── api/_lib/            # 라우트가 아닌 서버 전용 모듈 (정적 공개 안 됨)
│   ├── scrape.js         # sum.su.or.kr AJAX 호출 + 마크다운 변환
│   ├── job.js            # 빠진 날짜 계산 → 스크랩 → upsert → scrape_runs 기록
│   └── db.js             # Supabase PostgREST 최소 클라이언트
├── scripts/
│   └── scrape.mjs        # 수동 스크랩/백필 CLI
├── supabase/schema.sql  # 전체 스키마 (migrations/ 는 기존 DB에 추가로 적용할 변경분)
├── index.html · app.js · style.css · favicon.svg
├── pilgrim.js · pilgrim-story.js   # 🗺️ 천로역정 순례길 (게임 로직 · 장소/이야기 데이터)
├── manifest.webmanifest · sw.js · icons/   # 앱 설치(PWA)
└── vercel.json           # icn1 리전, Cron(00:05 KST), 헤더
```

## 출처

화면 맨 아래에도 같은 안내가 흐린 글씨로 표시됩니다(개역개정 © 대한성서공회, 해설 © 성서유니온선교회, 비영리 묵상·나눔 목적, 만든 이 연락처).

- 매일성경: [성서유니온선교회](https://sum.su.or.kr)
- 성경 본문: 성경전서 개역개정판 © 재단법인 대한성서공회
- 해설의 저작권은 사단법인 성서유니온선교회에 있습니다.
