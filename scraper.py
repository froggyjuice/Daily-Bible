"""
매일성경 (sum.su.or.kr) 본문 & 해설 자동 스크래퍼
- 매일성경(QT1) 및 매일성경 순(QT6) 모두 스크랩합니다.
- 결과는 output/main/ 및 output/soon/ 폴더에 날짜별 마크다운 파일로 저장됩니다.
"""

import asyncio
from datetime import datetime
from pathlib import Path

from playwright.async_api import async_playwright

URL = "https://sum.su.or.kr:8888/bible/today"
OUTPUT_DIR = Path(__file__).parent / "output"


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


def migrate_legacy_files():
    """기존 output/*.md 파일들을 output/main/으로 이동"""
    main_dir = OUTPUT_DIR / "main"
    main_dir.mkdir(parents=True, exist_ok=True)
    (OUTPUT_DIR / "soon").mkdir(parents=True, exist_ok=True)

    for file in OUTPUT_DIR.glob("*.md"):
        if file.is_file():
            target = main_dir / file.name
            if not target.exists():
                file.rename(target)
                print(f"[마이그레이션] {file.name} -> {target}")


def save_output(date_str: str, bonmun: str, haeseol: str, version_type: str = "main"):
    target_dir = OUTPUT_DIR / version_type
    target_dir.mkdir(parents=True, exist_ok=True)
    filename = target_dir / f"{date_str}.md"
    
    title_prefix = "매일성경" if version_type == "main" else "매일성경 순"
    content = f"""# {title_prefix} - {date_str}

> 출처: {URL}
> 수집 시각: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

---

{bonmun}

---

{haeseol}

---

> *해설의 저작권은 성서유니온에 있습니다.*
"""
    filename.write_text(content, encoding="utf-8")
    print(f"[{title_prefix} 저장 완료] {filename}")
    return filename


async def main():
    migrate_legacy_files()
    date_str = datetime.now().strftime("%Y-%m-%d")
    print(f"[시작] {date_str} 매일성경 & 매일성경 순 스크랩 중...")

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

        print(f"[접속] {URL}")
        await page.goto(URL, wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(1000)

        # 1. 매일성경 (QT1)
        print("[추출] 매일성경(QT1) 본문 & 해설...")
        bonmun_main = await get_bonmun(page)
        haeseol_main = await get_haeseol(page)
        save_output(date_str, bonmun_main, haeseol_main, "main")

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
        save_output(date_str, bonmun_soon, haeseol_soon, "soon")

        await browser.close()

    print("[완료] 모든 스크랩 성공!")


if __name__ == "__main__":
    asyncio.run(main())

