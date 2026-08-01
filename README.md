# 매일성경 (Daily Bible)

성서유니온 매일성경 본문 & 해설 자동 스크래퍼 + 정적 웹 대시보드

## 기능

- **자동 스크랩**: 로컬 PC 로그온 시 자동 실행 (Windows 작업 스케줄러), 매일성경(QT1)·매일성경 순(QT6) 두 트랙 모두 수집
- **정적 대시보드**: 본문 / 해설 탭 전환, 날짜별 기록 열람, "오늘로 가기"
- **스크랩 새로고침**: CDN 캐시를 무시하고 최신 데이터를 강제로 다시 불러오는 버튼
- **캘린더 뷰**: 월별 그리드로 스크랩 기록 확인
- **테마**: 다크 / 라이트 / 시스템 설정 지원
- **과거 데이터 백필**: 사이트가 지원하는 과거 조회 범위까지 한 번에 소급 수집

## 기술 스택

| 구분 | 기술 |
|------|------|
| 스크래퍼 | Python · Playwright (headless Chromium) |
| 자동화 | Windows 작업 스케줄러 (로컬, 유일한 스크랩 경로) |
| 프론트엔드 | Vanilla HTML/CSS/JS · marked.js (GitHub Pages 정적 호스팅) |

## 왜 로컬 자동화만 쓰는가

`sum.su.or.kr`이 일부 해외/클라우드 IP를 차단합니다. GitHub Actions 러너로 시도해봤지만 러너별로 간헐적으로 막혀 재시도로도 우회되지 않는 경우가 많았고, 로컬 자동화와 동시에 돌 때 같은 날짜를 서로 다른 시점에 재스크랩하면서 git push 충돌까지 발생한 적이 있어 완전히 걷어냈습니다. 이미 한국 IP인 개인 PC에서 로그온 시 자동 실행하는 방식이 유일한 경로입니다.

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
```

## 출처

- 매일성경: [성서유니온선교회](https://sum.su.or.kr)
- 해설의 저작권은 성서유니온에 있습니다.
