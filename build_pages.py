"""
GitHub Pages 정적 사이트 빌드 스크립트
=======================================
output/main/*.md & output/soon/*.md -> _pages_build/ (데이터 + 정적 파일)

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


def process_version(version_name: str) -> list:
    v_output_dir = OUTPUT_DIR / version_name
    v_build_dir = BUILD_DIR / "data" / version_name
    v_build_dir.mkdir(parents=True, exist_ok=True)

    mds = sorted(v_output_dir.glob("*.md"), reverse=True) if v_output_dir.exists() else []
    entries = [f.stem for f in mds]

    # entries.json
    (v_build_dir / "entries.json").write_text(
        json.dumps(entries, ensure_ascii=False),
        encoding="utf-8",
    )

    # 날짜별 JSON
    for md in mds:
        content = md.read_text(encoding="utf-8")
        data = {"date": md.stem, "type": version_name, "content": content}
        (v_build_dir / f"{md.stem}.json").write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    return entries


def build() -> dict:
    """
    output/main/*.md & output/soon/*.md → _pages_build/data/*/*.json 변환 + static 파일 복사.
    Returns: 버전별 빌드된 날짜 문자열 목록 dict
    """
    # 기존 마이그레이션 실행
    import scraper
    scraper.migrate_legacy_files()

    # 빌드 디렉토리 초기화
    if BUILD_DIR.exists():
        shutil.rmtree(BUILD_DIR)
    (BUILD_DIR / "data").mkdir(parents=True)

    main_entries = process_version("main")
    soon_entries = process_version("soon")

    if not main_entries and not soon_entries:
        print("  [경고] output/ 에 마크다운 파일이 없어 스크래퍼를 자동 실행합니다...")
        import asyncio
        asyncio.run(scraper.main())
        main_entries = process_version("main")
        soon_entries = process_version("soon")


    # 호환성을 위해 레거시 루트 data/ 경로에도 main 데이터 복사
    (BUILD_DIR / "data" / "entries.json").write_text(
        json.dumps(main_entries, ensure_ascii=False),
        encoding="utf-8",
    )
    for md in (OUTPUT_DIR / "main").glob("*.md"):
        content = md.read_text(encoding="utf-8")
        data = {"date": md.stem, "type": "main", "content": content}
        (BUILD_DIR / "data" / f"{md.stem}.json").write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    # index.html: 경로 수정 + app-pages.js 교체
    html = (STATIC_DIR / "index.html").read_text(encoding="utf-8")
    html = (html
        .replace('href="/static/style.css"',   'href="./style.css"')
        .replace('href="/static/favicon.svg"',  'href="./favicon.svg"')
        .replace('src="/static/app-pages.js"',  'src="./app-pages.js"')
        .replace('src="/static/app.js"',        'src="./app-pages.js"')
    )

    (BUILD_DIR / "index.html").write_text(html, encoding="utf-8")

    # CSS / JS / 파비콘 복사
    shutil.copy(STATIC_DIR / "style.css",    BUILD_DIR / "style.css")
    shutil.copy(STATIC_DIR / "app-pages.js", BUILD_DIR / "app-pages.js")
    shutil.copy(STATIC_DIR / "favicon.svg",  BUILD_DIR / "favicon.svg")
    (BUILD_DIR / ".nojekyll").touch()


    return {"main": main_entries, "soon": soon_entries}


if __name__ == "__main__":
    results = build()
    print(f"[빌드 완료] 매일성경: {len(results['main'])}개, 매일성경 순: {len(results['soon'])}개 -> {BUILD_DIR}")

