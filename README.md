# 매일성경 (Daily Bible)

성서유니온 매일성경 본문 & 해설 자동 스크래퍼 + 웹 대시보드

## 기능

- **자동 스크랩**: 매일 오전 05:00 KST 자동 실행 (APScheduler)
- **웹 대시보드**: 본문 / 해설 탭 전환, 날짜별 기록 열람
- **캘린더 뷰**: 월별 그리드로 스크랩 기록 확인
- **테마**: 다크 / 라이트 / 시스템 설정 지원
- **수동 실행**: 대시보드에서 즉시 스크랩 가능

## 기술 스택

| 구분 | 기술 |
|------|------|
| 스크래퍼 | Python · Playwright (headless Chromium) |
| 백엔드 | FastAPI · APScheduler |
| 프론트엔드 | Vanilla HTML/CSS/JS · marked.js |

## 설치 및 실행

```bash
# 1. 의존성 설치
pip install playwright fastapi "uvicorn[standard]" apscheduler
playwright install chromium

# 2. 웹 서버 실행 (Windows)
run_web.bat

# 또는 직접 실행
python -m uvicorn app:app --host 0.0.0.0 --port 8000
```

브라우저에서 `http://localhost:8000` 접속

## 파일 구조

```
bible_scraper/
├── scraper.py          # Playwright 기반 스크래퍼
├── app.py              # FastAPI + APScheduler 백엔드
├── run_web.bat         # Windows 실행 스크립트
├── register_task.ps1   # Windows 작업 스케줄러 등록
├── static/
│   ├── index.html      # 대시보드 SPA
│   ├── style.css       # 다크/라이트 테마 스타일
│   ├── app.js          # 프론트엔드 로직
│   └── favicon.svg     # 십자가 아이콘
└── output/             # 날짜별 스크랩 결과 (YYYY-MM-DD.md)
```

## 출처

- 매일성경: [성서유니온선교회](https://sum.su.or.kr)
- 해설의 저작권은 성서유니온에 있습니다.
