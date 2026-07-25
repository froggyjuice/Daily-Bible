"""
GitHub Pages 빌드 & 배포 스크립트
========================================
사용법:
  python update_pages.py

동작:
  1. output/*.md → data/*.json 변환
  2. static/ 파일을 Pages용으로 수정 (경로, app.js 교체)
  3. gh-pages 브랜치에 커밋 & push
  4. 원래 브랜치(main)로 복귀
"""

import json
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

BASE       = Path(__file__).parent
OUTPUT_DIR = BASE / "output"
BUILD_DIR  = BASE / "_pages_build"   # 임시 빌드 디렉토리 (gitignored)


# ── 헬퍼 ────────────────────────────────────
def run(cmd: str, **kwargs):
    """셸 명령 실행"""
    result = subprocess.run(cmd, cwd=BASE, shell=True, capture_output=True, text=True, **kwargs)
    if result.returncode != 0:
        print(f"[오류] {cmd}\n{result.stderr}")
        sys.exit(1)
    return result.stdout.strip()


# ── Step 1: 정적 사이트 빌드 ─────────────────
def build():
    print("[1/4] 정적 사이트 빌드 중...")

    if BUILD_DIR.exists():
        shutil.rmtree(BUILD_DIR)
    (BUILD_DIR / "data").mkdir(parents=True)

    # 마크다운 → JSON 변환
    mds = sorted(OUTPUT_DIR.glob("*.md"), reverse=True)
    entries = [f.stem for f in mds]

    if not entries:
        print("  경고: output/ 에 스크랩된 파일이 없습니다")

    # entries.json
    (BUILD_DIR / "data" / "entries.json").write_text(
        json.dumps(entries, ensure_ascii=False), encoding="utf-8"
    )

    # 날짜별 JSON
    for md in mds:
        content = md.read_text(encoding="utf-8")
        data    = {"date": md.stem, "content": content}
        (BUILD_DIR / "data" / f"{md.stem}.json").write_text(
            json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    print(f"  → {len(entries)}개 항목 JSON 변환 완료")

    # HTML: 경로 수정 + app-pages.js 사용
    html = (BASE / "static" / "index.html").read_text(encoding="utf-8")
    html = (html
        .replace('href="/static/style.css"',   'href="./style.css"')
        .replace('href="/static/favicon.svg"',  'href="./favicon.svg"')
        .replace('src="/static/app.js"',        'src="./app-pages.js"')
    )
    (BUILD_DIR / "index.html").write_text(html, encoding="utf-8")

    # CSS, JS, 파비콘 복사
    shutil.copy(BASE / "static" / "style.css",    BUILD_DIR / "style.css")
    shutil.copy(BASE / "static" / "app-pages.js", BUILD_DIR / "app-pages.js")
    shutil.copy(BASE / "static" / "favicon.svg",  BUILD_DIR / "favicon.svg")

    print("  → HTML/CSS/JS 복사 완료")
    return entries


# ── Step 2: gh-pages 브랜치 관리 ────────────
def deploy(entries):
    print("[2/4] 현재 브랜치 확인...")
    original = run("git branch --show-current")
    print(f"  → 현재 브랜치: {original}")

    # gh-pages 브랜치 존재 여부 확인
    branches = run("git branch -a")
    has_pages = "gh-pages" in branches

    print("[3/4] gh-pages 브랜치로 전환...")

    # 현재 변경사항 임시 저장 (stash)
    stash = run("git stash")

    if has_pages:
        run("git checkout gh-pages")
        # 기존 파일 전체 삭제 (data/, index.html 등)
        run("git rm -rf --quiet --ignore-unmatch index.html style.css app-pages.js favicon.svg data/")
    else:
        # 새 orphan 브랜치 생성
        run("git checkout --orphan gh-pages")
        run("git rm -rf --quiet .")

    # 빌드 파일 복사
    for src in BUILD_DIR.rglob("*"):
        if src.is_file():
            rel = src.relative_to(BUILD_DIR)
            dst = BASE / rel
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(src, dst)

    print("[4/4] 커밋 & push...")
    run("git add -A")

    latest = entries[0] if entries else "없음"
    msg = f"[Pages] {datetime.now().strftime('%Y-%m-%d %H:%M')} | 최신: {latest} | {len(entries)}건"
    run(f'git commit -m "{msg}"')
    run("git push origin gh-pages")

    # 원래 브랜치 복귀
    run(f"git checkout {original}")
    if "No local changes" not in stash:
        run("git stash pop")

    # 임시 빌드 디렉토리 삭제
    shutil.rmtree(BUILD_DIR)

    print()
    print("=" * 50)
    print(f"  gh-pages 배포 완료!")
    print(f"  {len(entries)}개 항목 서빙 중")
    print(f"  URL: https://froggyjuice.github.io/Daily-Bible/")
    print("=" * 50)


if __name__ == "__main__":
    entries = build()
    deploy(entries)
