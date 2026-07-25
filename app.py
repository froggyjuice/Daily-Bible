"""
매일성경 웹 대시보드 - FastAPI 백엔드
APScheduler로 매일 00:00 (자정) 자동 스크랩 실행
"""
import asyncio
import sys
from datetime import datetime
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

sys.path.insert(0, str(Path(__file__).parent))

OUTPUT_DIR = Path(__file__).parent / "output"
STATIC_DIR  = Path(__file__).parent / "static"

# ── 공유 상태 ─────────────────────────────────────────────
state: dict = {
    "is_running": False,
    "last_run":   None,          # ISO 문자열
    "last_status": "idle",       # idle | running | success | error
    "last_error":  None,
}

scheduler = AsyncIOScheduler(timezone="Asia/Seoul")


# ── 스크래퍼 실행 ─────────────────────────────────────────
async def run_scraper_task() -> None:
    if state["is_running"]:
        return

    state["is_running"] = True
    state["last_status"] = "running"
    state["last_error"]  = None

    try:
        import scraper
        await scraper.main()
        state["last_run"]    = datetime.now().isoformat()
        state["last_status"] = "success"
    except Exception as exc:
        state["last_status"] = "error"
        state["last_error"]  = str(exc)
    finally:
        state["is_running"] = False


# ── 앱 수명주기 ───────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    OUTPUT_DIR.mkdir(exist_ok=True)
    import scraper
    scraper.migrate_legacy_files()

    scheduler.add_job(
        run_scraper_task,
        CronTrigger(hour=0, minute=0, timezone="Asia/Seoul"),
        id="daily_bible",
        replace_existing=True,
    )
    scheduler.start()
    print("[OK] APScheduler 시작 - 매일 00:00(자정) 자동 스크랩 예약됨")

    yield

    scheduler.shutdown(wait=False)


app = FastAPI(title="매일성경 대시보드", lifespan=lifespan)


# ── API 엔드포인트 ────────────────────────────────────────
@app.get("/api/status")
async def api_status(type: str = Query("main")):
    job = scheduler.get_job("daily_bible")
    next_run = None
    if job and job.next_run_time:
        next_run = job.next_run_time.isoformat()

    target_dir = OUTPUT_DIR / (type if type in ["main", "soon"] else "main")
    entries = list(target_dir.glob("*.md")) if target_dir.exists() else []
    
    return {
        "is_running":    state["is_running"],
        "last_run":      state["last_run"],
        "last_status":   state["last_status"],
        "last_error":    state["last_error"],
        "next_run":      next_run,
        "total_entries": len(entries),
        "type":          type,
    }


@app.get("/api/entries")
async def api_entries(type: str = Query("main")):
    version = type if type in ["main", "soon"] else "main"
    target_dir = OUTPUT_DIR / version
    if not target_dir.exists():
        return []
    files = sorted(target_dir.glob("*.md"), reverse=True)
    return [f.stem for f in files]


@app.get("/api/entry/{date_str}")
async def api_entry(date_str: str, type: str = Query("main")):
    try:
        datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="날짜 형식 오류 (YYYY-MM-DD)")

    version = type if type in ["main", "soon"] else "main"
    path = OUTPUT_DIR / version / f"{date_str}.md"
    if not path.exists():
        raise HTTPException(status_code=404, detail="해당 날짜의 데이터가 없습니다")

    return {"date": date_str, "type": version, "content": path.read_text(encoding="utf-8")}


@app.post("/api/scrape")
async def api_scrape():
    if state["is_running"]:
        return {"status": "already_running", "message": "이미 스크랩 중입니다"}

    asyncio.create_task(run_scraper_task())
    return {"status": "started", "message": "스크랩을 시작했습니다"}


# ── HTML 서빙 ─────────────────────────────────────────────
@app.get("/", response_class=HTMLResponse)
async def root():
    return (STATIC_DIR / "index.html").read_text(encoding="utf-8")

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=False)

