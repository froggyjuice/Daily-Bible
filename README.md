# 매일성경 (Daily Bible)

성서유니온 매일성경 본문 & 해설 자동 스크래퍼 + 정적 웹 대시보드

## 기능

- **자동 스크랩**: 로컬 PC 로그온 시 자동 실행 (Windows 작업 스케줄러), 매일성경(QT1)·매일성경 순(QT6) 두 트랙 모두 수집
- **정적 대시보드**: 본문 / 해설 탭 전환, 날짜별 기록 열람, "오늘로 가기"
- **캘린더 뷰**: 월별 그리드로 스크랩 기록 확인
- **테마**: 다크 / 라이트 / 시스템 설정 지원
- **과거 데이터 백필**: 사이트가 지원하는 과거 조회 범위까지 한 번에 소급 수집

## 기술 스택

| 구분 | 기술 |
|------|------|
| 스크래퍼 | Python · Playwright (headless Chromium) |
| 자동화 | Windows 작업 스케줄러(로컬, 주력) · GitHub Actions(백업용 cron) |
| 프론트엔드 | Vanilla HTML/CSS/JS · marked.js (GitHub Pages 정적 호스팅) |

## 왜 로컬 자동화가 주력인가

`sum.su.or.kr`이 일부 해외/클라우드 IP(GitHub Actions 러너 포함)를 차단합니다. 러너별로 간헐적이라 완전히 막히진 않지만, 재시도로 우회되지 않는 경우가 많습니다. 이미 한국 IP인 개인 PC에서 로그온 시 자동 실행하는 방식이 훨씬 안정적이라 이쪽을 주력으로 삼았습니다. `daily.yml`의 GitHub Actions cron은 백업/보조 용도로 남아있습니다.

## 설치 및 실행

```bash
pip install -r requirements.txt
playwright install chromium
```

### 오늘자 스크랩

```bash
python scraper.py
```

### 과거 데이터 백필

```bash
python backfill.py
```

`data/main/entries.json` 기준 어제부터 과거로 하루씩 이동하며, 사이트가 지원하는 조회 범위를 벗어나면(연속 2회 실패) 자동 중단합니다.

### 로컬 자동화 (Windows)

`auto_scrape.ps1`이 로그온 시 오늘자 데이터를 확인하고, 없으면 스크랩 후 커밋·푸시합니다. 작업 스케줄러 등록 예시:

```powershell
$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument '-WindowStyle Hidden -ExecutionPolicy Bypass -File "<repo-path>\auto_scrape.ps1"'
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "<DOMAIN>\<user>"
$trigger.Delay = "PT1M"
Register-ScheduledTask -TaskName "DailyBibleAutoScrape" -Action $action -Trigger $trigger -RunLevel Limited
```

로그는 `logs/auto_scrape.log`에 남습니다(`.gitignore`에 의해 커밋되지 않음).

## 파일 구조

```
bible_scraper/
├── scraper.py          # 오늘자 스크랩 (Playwright)
├── backfill.py          # 과거 날짜 소급 스크랩
├── auto_scrape.ps1      # 로컬 자동화 진입점 (작업 스케줄러가 호출)
├── index.html            # 대시보드 정적 페이지
├── style.css              # 다크/라이트 테마 스타일
├── app.js                 # 프론트엔드 로직 (데이터는 ./data/*.json에서 직접 fetch)
├── favicon.svg
├── data/
│   ├── main/               # 매일성경(QT1) — {date}.json + entries.json
│   └── soon/                # 매일성경 순(QT6) — {date}.json + entries.json
└── .github/workflows/daily.yml   # 백업용 GitHub Actions cron
```

## 출처

- 매일성경: [성서유니온선교회](https://sum.su.or.kr)
- 해설의 저작권은 성서유니온에 있습니다.
