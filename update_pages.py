"""
로컬 GitHub Pages 배포 스크립트
================================
build_pages.py 로 빌드 후 gh-pages 브랜치에 직접 push.

Usage:  python update_pages.py

* CI 환경(GitHub Actions)에서는 daily_scrape.yml 이 대신 처리합니다.
"""

import os
import subprocess
import sys
import tempfile
from datetime import datetime

from build_pages import build as build_pages, BASE, BUILD_DIR


# ── Helper ─────────────────────────────────────
def run(cmd: str, allow_fail: bool = False) -> str:
    result = subprocess.run(
        cmd, cwd=BASE, shell=True,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE,
    )
    stdout = result.stdout.decode("utf-8", errors="replace").strip()
    stderr = result.stderr.decode("utf-8", errors="replace").strip()
    if result.returncode != 0 and not allow_fail:
        print(f"[ERROR] {cmd}")
        if stderr:
            print(stderr)
        sys.exit(1)
    return stdout


def git_commit(message: str):
    """한글 커밋 메시지를 임시 파일로 처리 (Windows shell 인코딩 우회)"""
    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", suffix=".txt", delete=False
    ) as f:
        f.write(message)
        tmpfile = f.name
    try:
        run(f'git commit -F "{tmpfile}"')
    finally:
        os.unlink(tmpfile)


# ── Deploy ──────────────────────────────────────
def deploy(entries: list):
    print("[2/4] 현재 브랜치 확인...")
    original  = run("git branch --show-current")
    print(f"  -> {original}")

    branches  = run("git branch -a")
    has_pages = "gh-pages" in branches

    stash_out = run("git stash", allow_fail=True)

    print("[3/4] gh-pages 브랜치로 전환...")
    if has_pages:
        run("git checkout gh-pages")
        run("git rm -rf --quiet --ignore-unmatch .", allow_fail=True)
    else:
        run("git checkout --orphan gh-pages")
        run("git rm -rf --quiet .", allow_fail=True)

    # 빌드 결과 복사
    import shutil
    for src in BUILD_DIR.rglob("*"):
        if src.is_file():
            rel = src.relative_to(BUILD_DIR)
            dst = BASE / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(src, dst)

    print("[4/4] 커밋 & push...")
    run("git add -A")

    latest  = entries[0] if entries else "none"
    ts      = datetime.now().strftime("%Y-%m-%d %H:%M")
    git_commit(f"[Pages] {ts} | latest: {latest} | {len(entries)} entries")

    run("git push origin gh-pages")

    # 원래 브랜치로 복귀
    run(f"git checkout {original}")
    if "No local changes" not in stash_out:
        run("git stash pop", allow_fail=True)

    shutil.rmtree(BUILD_DIR, ignore_errors=True)

    print()
    print("=" * 52)
    print(f"  gh-pages 배포 완료!  ({len(entries)}개 항목)")
    print(f"  URL: https://froggyjuice.github.io/Daily-Bible/")
    print("=" * 52)


if __name__ == "__main__":
    print("[1/4] 정적 사이트 빌드...")
    entries = build_pages()
    print(f"  -> {len(entries)}개 항목 완료")
    deploy(entries)
