"""
새로고침 API 서버 (refresh_server.py)

대시보드의 새로고침 버튼에서 호출하여 누락된 날짜를 자동으로 스크랩합니다.
- POST /api/refresh  : 백필 작업 시작 (백그라운드)
- GET  /api/status   : 현재 작업 상태 및 진행률 조회
- GET  /api/gaps     : 누락된 날짜 목록만 확인 (스크랩 없이)
- GET  /api/ping     : 연결 테스트

사용법:
    python refresh_server.py [--port 5000]

핸드폰에서 접근하려면:
  같은 Wi-Fi  →  http://<PC내부IP>:5000
  외부 접속   →  Cloudflare Tunnel 등으로 노출
      cloudflared tunnel --url http://localhost:5000
"""

import json
import subprocess
import sys
import threading
from datetime import datetime, timezone, timedelta
from http.server import HTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse

KST = timezone(timedelta(hours=9))
REPO_DIR = Path(__file__).parent
PYTHON = sys.executable
PORT = int(sys.argv[sys.argv.index("--port") + 1]) if "--port" in sys.argv else 5000

# ── 작업 상태 ──────────────────────────────────
_lock = threading.Lock()
_state = {
    "running": False,
    "progress": [],
    "result": None,
    "started_at": None,
}


def _now_str():
    return datetime.now(KST).strftime("%Y-%m-%d %H:%M:%S")


def _add_progress(msg):
    ts = datetime.now(KST).strftime("%H:%M:%S")
    entry = f"[{ts}] {msg}"
    with _lock:
        _state["progress"].append(entry)
    print(entry)


# ── 서브프로세스 실행 헬퍼 ──────────────────────
_PROGRESS_KEYWORDS = (
    "[시도]", "[성공]", "[실패]", "[완료]", "[갭",
    "[에러]", "[추출]", "[전환]", "[저장]", "[접속]",
    "[시작]", "[중단]",
)


def _run_subprocess(cmd, timeout=120, label=""):
    """서브프로세스 실행 + 실시간 로그 (주요 메시지만 progress 추가)"""
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        cwd=str(REPO_DIR),
        encoding="utf-8",
        errors="replace",
    )
    output_lines = []
    try:
        for line in proc.stdout:
            line = line.rstrip()
            if line:
                output_lines.append(line)
                if any(k in line for k in _PROGRESS_KEYWORDS):
                    _add_progress(line)
        proc.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        proc.kill()
        _add_progress(f"{label} 타임아웃 ({timeout}s)")
        return -1, output_lines

    return proc.returncode, output_lines


# ── 백그라운드 새로고침 작업 ────────────────────
def _do_refresh():
    """백그라운드 스레드에서 실행되는 새로고침 작업."""
    pushed = False
    try:
        # 1) git pull
        _add_progress("git pull 중...")
        code, _ = _run_subprocess(
            ["git", "pull", "--rebase", "origin", "main"],
            timeout=60, label="git pull",
        )
        _add_progress(f"git pull 완료 (exit {code})")

        # 2) 오늘자 스크랩
        today = datetime.now(KST).strftime("%Y-%m-%d")
        today_file = REPO_DIR / "data" / "main" / f"{today}.json"

        if not today_file.exists():
            _add_progress(f"오늘({today}) 데이터 스크랩 시작...")
            code, _ = _run_subprocess(
                [PYTHON, str(REPO_DIR / "scraper.py")],
                timeout=300, label="scraper.py",
            )
            if code == 0:
                _add_progress("오늘자 스크랩 완료 ✅")
            else:
                _add_progress(f"오늘자 스크랩 실패 (exit {code})")
        else:
            _add_progress(f"오늘({today}) 데이터 이미 존재 — 스크랩 생략")

        # 3) 갭 채우기
        _add_progress("누락 날짜 확인 및 백필 시작...")
        code, _ = _run_subprocess(
            [PYTHON, str(REPO_DIR / "backfill.py"), "--gaps"],
            timeout=600, label="backfill --gaps",
        )
        _add_progress(f"백필 완료 (exit {code})")

        # 4) git add → diff → commit → push
        subprocess.run(
            ["git", "add", "data/"],
            capture_output=True, cwd=str(REPO_DIR), timeout=30,
        )

        r = subprocess.run(
            ["git", "diff", "--cached", "--quiet"],
            capture_output=True, cwd=str(REPO_DIR), timeout=10,
        )

        if r.returncode != 0:
            # 변경사항 존재
            _add_progress("변경사항 커밋 중...")
            subprocess.run(
                ["git", "commit", "-m",
                 f"data: {today} 기준 새로고침 (refresh API)"],
                capture_output=True, cwd=str(REPO_DIR), timeout=30,
            )

            _add_progress("git push 중...")
            r = subprocess.run(
                ["git", "push", "origin", "main"],
                capture_output=True, text=True,
                cwd=str(REPO_DIR), timeout=60,
            )
            if r.returncode != 0:
                _add_progress("git push 실패 — rebase 후 재시도...")
                subprocess.run(
                    ["git", "pull", "--rebase", "origin", "main"],
                    capture_output=True, cwd=str(REPO_DIR), timeout=60,
                )
                r = subprocess.run(
                    ["git", "push", "origin", "main"],
                    capture_output=True, text=True,
                    cwd=str(REPO_DIR), timeout=60,
                )

            if r.returncode == 0:
                _add_progress("git push 완료 ✅")
                pushed = True
            else:
                _add_progress(f"git push 최종 실패 (exit {r.returncode})")
        else:
            _add_progress("변경된 데이터 없음 — 커밋 생략")

        with _lock:
            _state["result"] = {
                "success": True,
                "pushed": pushed,
                "time": _now_str(),
            }

    except Exception as e:
        _add_progress(f"오류 발생: {e}")
        with _lock:
            _state["result"] = {
                "success": False,
                "error": str(e),
                "time": _now_str(),
            }
    finally:
        with _lock:
            _state["running"] = False
        _add_progress("작업 종료")


def start_refresh():
    """새로고침 작업을 백그라운드 스레드로 시작. 이미 실행 중이면 False 반환."""
    with _lock:
        if _state["running"]:
            return False
        _state["running"] = True
        _state["progress"] = []
        _state["result"] = None
        _state["started_at"] = _now_str()

    thread = threading.Thread(target=_do_refresh, daemon=True)
    thread.start()
    return True


# ── HTTP 핸들러 ────────────────────────────────
class Handler(BaseHTTPRequestHandler):
    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")

    def _json(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self._cors()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path

        if path == "/api/ping":
            self._json(200, {"ok": True, "time": _now_str()})

        elif path == "/api/status":
            with _lock:
                self._json(200, {
                    "running": _state["running"],
                    "progress": list(_state["progress"]),
                    "result": _state["result"],
                    "started_at": _state["started_at"],
                })

        elif path == "/api/gaps":
            try:
                r = subprocess.run(
                    [PYTHON, "-c",
                     "from backfill import find_gap_dates; "
                     "import json; print(json.dumps(find_gap_dates()))"],
                    capture_output=True, text=True,
                    cwd=str(REPO_DIR), timeout=10,
                )
                gaps = json.loads(r.stdout.strip()) if r.stdout.strip() else []
                self._json(200, {"gaps": gaps, "count": len(gaps)})
            except Exception as e:
                self._json(500, {"error": str(e)})

        else:
            self._json(404, {"error": "Not found"})

    def do_POST(self):
        path = urlparse(self.path).path

        if path == "/api/refresh":
            if start_refresh():
                self._json(200, {"status": "started", "time": _now_str()})
            else:
                self._json(409, {"status": "already_running", "time": _now_str()})
        else:
            self._json(404, {"error": "Not found"})

    def log_message(self, format, *args):
        print(f"[{_now_str()}] {self.client_address[0]} {args[0]}")


# ── 메인 ──────────────────────────────────────
def main():
    server = HTTPServer(("0.0.0.0", PORT), Handler)
    print("=" * 52)
    print("  새로고침 API 서버")
    print(f"  http://0.0.0.0:{PORT}")
    print()
    print(f"  POST /api/refresh  — 스크랩 시작")
    print(f"  GET  /api/status   — 진행 상태")
    print(f"  GET  /api/gaps     — 누락 날짜 확인")
    print(f"  GET  /api/ping     — 연결 테스트")
    print("=" * 52)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n서버 종료")
        server.server_close()


if __name__ == "__main__":
    main()
