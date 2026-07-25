"""
GitHub Pages 정적 사이트 빌드 스크립트
=======================================
output/*.md -> _pages_build/ (데이터 + 정적 파일)

로컬 사용:   python build_pages.py
CI 사용:     GitHub Actions가 자동 호출
"""

import json
import shutil
from pathlib import Path

BASE       = Path(__file__).parent
OUTPUT_DIR = BASE / "output"
STATIC_DIR = BASE / "static"
BUILD_DIR  = BASE / "_pages_build"


def build() -> list:
    """
    output/*.md → _pages_build/data/*.json 변환 + static 파일 복사.
    Returns: 빌드된 날짜 문자열 목록 (내림차순)
    """
    # 빌드 디렉토리 초기화
    if BUILD_DIR.exists():
        shutil.rmtree(BUILD_DIR)
    (BUILD_DIR / "data").mkdir(parents=True)

    mds     = sorted(OUTPUT_DIR.glob("*.md"), reverse=True)
    entries = [f.stem for f in mds]

    if not entries:
        print("  [경고] output/ 에 스크랩 파일이 없습니다")

    # entries.json
    (BUILD_DIR / "data" / "entries.json").write_text(
        json.dumps(entries, ensure_ascii=False),
        encoding="utf-8",
    )

    # 날짜별 JSON
    for md in mds:
        content = md.read_text(encoding="utf-8")
        data    = {"date": md.stem, "content": content}
        (BUILD_DIR / "data" / f"{md.stem}.json").write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    # index.html: 경로 수정 + app-pages.js 교체
    html = (STATIC_DIR / "index.html").read_text(encoding="utf-8")
    html = (html
        .replace('href="/static/style.css"',   'href="./style.css"')
        .replace('href="/static/favicon.svg"',  'href="./favicon.svg"')
        .replace('src="/static/app.js"',        'src="./app-pages.js"')
    )
    (BUILD_DIR / "index.html").write_text(html, encoding="utf-8")

    # CSS / JS / 파비콘 복사
    shutil.copy(STATIC_DIR / "style.css",    BUILD_DIR / "style.css")
    shutil.copy(STATIC_DIR / "app-pages.js", BUILD_DIR / "app-pages.js")
    shutil.copy(STATIC_DIR / "favicon.svg",  BUILD_DIR / "favicon.svg")

    return entries


if __name__ == "__main__":
    entries = build()
    print(f"[빌드 완료] {len(entries)}개 항목 -> {BUILD_DIR}")
    for e in entries:
        print(f"  - {e}")
