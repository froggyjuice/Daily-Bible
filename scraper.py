"""
매일성경 (sum.su.or.kr) 본문 & 해설 자동 스크래퍼
- 매일성경(QT1) 및 매일성경 순(QT6) 모두 스크랩합니다.
- 결과는 data/main/ 및 data/soon/ 폴더에 날짜별 JSON 파일로 저장됩니다.
"""

import asyncio
import json
from datetime import datetime, timezone, timedelta

KST = timezone(timedelta(hours=9))
from pathlib import Path

from playwright.async_api import async_playwright

URL = "https://sum.su.or.kr:8888/bible/today"
DATA_DIR = Path(__file__).parent / "data"


async def get_bonmun(page) -> str:
    """본문 탭 텍스트 추출"""
    await page.evaluate("mainViewChg('2')")
    await page.wait_for_timeout(800)

    title_el = await page.query_selector("#mainView_2 #bible_text")
    title = (await title_el.inner_text()).strip() if title_el else ""

    ref_el = await page.query_selector("#mainView_2 #bibleinfo_box")
    ref = (await ref_el.inner_text()).strip() if ref_el else ""

    verses = await page.evaluate("""() => {
        const items = document.querySelectorAll('#mainView_2 #body_list li');
        return Array.from(items).map(li => {
            const num = li.querySelector('.num')?.innerText?.trim() ?? '';
            const info = li.querySelector('.info')?.innerText?.trim() ?? '';
            return num ? `${num}. ${info}` : info;
        });
    }""")

    lines = ["## 본문", f"**{title}**", f"*{ref}*", ""]
    lines += verses
    return "\n".join(lines)


async def get_haeseol(page) -> str:
    """해설 탭 텍스트 추출"""
    await page.evaluate("mainViewChg('3')")
    await page.wait_for_timeout(800)

    title_el = await page.query_selector("#mainView_3 .bible_text")
    title = (await title_el.inner_text()).strip() if title_el else ""

    ref_el = await page.query_selector("#mainView_3 #bibleinfo_box_3")
    ref = (await ref_el.inner_text()).strip() if ref_el else ""

    blocks = await page.evaluate("""() => {
        const container = document.getElementById('body_cont_3');
        if (!container) return [];
        return Array.from(container.children).map(el => {
            const cls = el.className || '';
            const text = el.innerText?.trim() ?? '';
            return { cls, text };
        });
    }""")

    lines = ["## 해설", f"**{title}**", f"*{ref}*", ""]
    for block in blocks:
        cls = block["cls"]
        text = block["text"]
        if not text:
            continue
        if "b_text" in cls:
            lines.append(text)
        elif "g_text" in cls:
            lines.append(f"\n### {text}")
        elif "text" in cls:
            lines.append(text)
        else:
            lines.append(text)
        lines.append("")

    return "\n".join(lines)


def save_json(date_str: str, bonmun: str, haeseol: str, version_type: str = "main"):
    """data/{version_type}/{date}.json 저장"""
    target_dir = DATA_DIR / version_type
    target_dir.mkdir(parents=True, exist_ok=True)

    title_prefix = "매일성경" if version_type == "main" else "매일성경 순"
    content = f"""# {title_prefix} - {date_str}

> 출처: {URL}
> 수집 시각: {datetime.now(KST).strftime('%Y-%m-%d %H:%M:%S')} (KST)

---

{bonmun}

---

{haeseol}

---

> *해설의 저작권은 성서유니온에 있습니다.*
"""

    data = {"date": date_str, "type": version_type, "content": content}
    filepath = target_dir / f"{date_str}.json"
    filepath.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"[{title_prefix} 저장 완료] {filepath}")
    return filepath


def update_entries(date_str: str, version_type: str = "main"):
    """data/{version_type}/entries.json에 날짜를 누적 추가 (내림차순)"""
    target_dir = DATA_DIR / version_type
    target_dir.mkdir(parents=True, exist_ok=True)
    entries_path = target_dir / "entries.json"

    # 기존 목록 로드
    entries: list[str] = []
    if entries_path.exists():
        try:
            entries = json.loads(entries_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, ValueError):
            entries = []

    # 중복 방지 후 내림차순 정렬
    if date_str not in entries:
        entries.append(date_str)
    entries.sort(reverse=True)

    entries_path.write_text(
        json.dumps(entries, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"[entries 업데이트] {entries_path} ({len(entries)}건)")


async def main():
    date_str = datetime.now(KST).strftime("%Y-%m-%d")
    print(f"[시작] {date_str} 매일성경 & 매일성경 순 스크랩 중...")

    NAV_RETRIES = 3

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            locale="ko-KR",
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            ignore_https_errors=True,
        )
        page = await context.new_page()

        # ── 페이지 접속 + 셀렉터 대기를 함께 재시도 ──
        loaded = False
        for attempt in range(1, NAV_RETRIES + 1):
            goto_timeout = 60000 + (attempt - 1) * 30000   # 60s → 90s → 120s
            selector_timeout = 30000 + (attempt - 1) * 15000  # 30s → 45s → 60s

            print(f"[접속 시도 {attempt}/{NAV_RETRIES}] {URL} "
                  f"(goto={goto_timeout // 1000}s, selector={selector_timeout // 1000}s)")
            try:
                await page.goto(URL, wait_until="domcontentloaded", timeout=goto_timeout)
            except Exception as err:
                print(f"[경고] page.goto 실패: {err}")
                if attempt < NAV_RETRIES:
                    wait_sec = 10 * attempt
                    print(f"[대기] {wait_sec}초 후 재시도...")
                    await page.wait_for_timeout(wait_sec * 1000)
                continue  # goto 실패 시 selector 대기 없이 바로 재시도

            try:
                await page.wait_for_selector("#mainView_2", timeout=selector_timeout)
                loaded = True
                print("[접속 성공] 페이지 로드 완료")
                break
            except Exception as err:
                print(f"[경고] 셀렉터 대기 실패: {err}")
                if attempt < NAV_RETRIES:
                    wait_sec = 10 * attempt
                    print(f"[대기] {wait_sec}초 후 재시도...")
                    await page.wait_for_timeout(wait_sec * 1000)

        if not loaded:
            await browser.close()
            raise RuntimeError(
                f"[실패] {NAV_RETRIES}회 시도 후에도 페이지 로드 불가: {URL}"
            )

        await page.wait_for_timeout(2000)

        # 1. 매일성경 (QT1)
        print("[추출] 매일성경(QT1) 본문 & 해설...")
        bonmun_main = await get_bonmun(page)
        haeseol_main = await get_haeseol(page)
        save_json(date_str, bonmun_main, haeseol_main, "main")
        update_entries(date_str, "main")

        # 2. 매일성경 순 (QT6)
        print("[전환] 매일성경 순(QT6) 선택 중...")
        await page.evaluate("""() => {
            const el = document.querySelector('input[value="QT6"]');
            if (el) {
                el.checked = true;
                SelectQtType(el);
            }
        }""")
        await page.wait_for_timeout(2000)

        print("[추출] 매일성경 순(QT6) 본문 & 해설...")
        bonmun_soon = await get_bonmun(page)
        haeseol_soon = await get_haeseol(page)
        save_json(date_str, bonmun_soon, haeseol_soon, "soon")
        update_entries(date_str, "soon")

        await browser.close()

    print("[완료] 모든 스크랩 성공!")


if __name__ == "__main__":
    asyncio.run(main())

