"""
매일성경 (sum.su.or.kr) 본문 & 해설 자동 스크래퍼
- 매일 오전 5시 Windows 작업 스케줄러에 의해 실행됩니다.
- 결과는 output/ 폴더에 날짜별 마크다운 파일로 저장됩니다.
"""

import asyncio
import re
from datetime import datetime
from pathlib import Path

from playwright.async_api import async_playwright

URL = "https://sum.su.or.kr:8888/bible/today"
OUTPUT_DIR = Path(__file__).parent / "output"


async def get_bonmun(page) -> str:
    """본문 탭 텍스트 추출"""
    # 본문 탭 클릭 (JavaScript 직접 호출)
    await page.evaluate("mainViewChg('2')")
    await page.wait_for_timeout(800)

    title = await page.inner_text("#mainView_2 #bible_text")
    ref = await page.inner_text("#mainView_2 #bibleinfo_box")

    # 절별 텍스트 추출
    verses = await page.evaluate("""() => {
        const items = document.querySelectorAll('#mainView_2 #body_list li');
        return Array.from(items).map(li => {
            const num = li.querySelector('.num')?.innerText?.trim() ?? '';
            const info = li.querySelector('.info')?.innerText?.trim() ?? '';
            return num ? `${num}. ${info}` : info;
        });
    }""")

    lines = [f"## 본문", f"**{title.strip()}**", f"*{ref.strip()}*", ""]
    lines += verses
    return "\n".join(lines)


async def get_haeseol(page) -> str:
    """해설 탭 텍스트 추출"""
    await page.evaluate("mainViewChg('3')")
    await page.wait_for_timeout(800)

    title = await page.inner_text("#mainView_3 .bible_text")
    ref = await page.inner_text("#mainView_3 #bibleinfo_box_3")

    # 본문 블록 전체 텍스트 (b_text, g_text, text 등 순서대로)
    blocks = await page.evaluate("""() => {
        const container = document.getElementById('body_cont_3');
        if (!container) return [];
        return Array.from(container.children).map(el => {
            const cls = el.className || '';
            const text = el.innerText?.trim() ?? '';
            return { cls, text };
        });
    }""")

    lines = [f"## 해설", f"**{title.strip()}**", f"*{ref.strip()}*", ""]
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


def save_output(date_str: str, bonmun: str, haeseol: str):
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    filename = OUTPUT_DIR / f"{date_str}.md"
    content = f"""# 매일성경 - {date_str}

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
    print(f"[저장 완료] {filename}")
    return filename


async def main():
    date_str = datetime.now().strftime("%Y-%m-%d")
    print(f"[시작] {date_str} 매일성경 스크랩 중...")

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

        print("[추출] 본문 탭...")
        bonmun = await get_bonmun(page)

        print("[추출] 해설 탭...")
        haeseol = await get_haeseol(page)

        await browser.close()

    save_output(date_str, bonmun, haeseol)
    print("[완료] 스크랩 성공!")


if __name__ == "__main__":
    asyncio.run(main())
