"""
매일성경 (sum.su.or.kr) 과거 날짜 백필 스크래퍼

두 가지 모드:
- `python backfill.py`        : 어제부터 과거로 하루씩 이동하며 접근 가능한
                                 범위까지 전체 백필 (연속 실패 시 자동 중단)
- `python backfill.py --gaps` : 기존 entries.json 범위(가장 오래된 날짜~오늘)
                                 안에서 누락된 날짜만 찾아서 채움. 누락이
                                 없으면 브라우저도 띄우지 않고 바로 종료.
"""

import asyncio
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path

from playwright.async_api import async_playwright

from scraper import KST, URL, get_bonmun, get_haeseol, save_json, update_entries

DATA_DIR = Path(__file__).parent / "data"

MAX_DAYS_BACK = 90  # 안전 상한선 (실제로는 연속 실패 시 더 일찍 중단됨)
CONSECUTIVE_FAILURE_LIMIT = 2
POLITE_DELAY_MS = 1200


async def wait_for_date(page, date_str: str, timeout: int = 8000) -> bool:
    target = datetime.strptime(date_str, "%Y-%m-%d").strftime("%Y.%m.%d")
    try:
        await page.wait_for_function(
            """(target) => {
                const el = document.getElementById('dailybible_info');
                return !!(el && el.textContent.includes(target));
            }""",
            arg=target,
            timeout=timeout,
        )
        return True
    except Exception:
        return False


async def select_qt(page, value: str):
    await page.evaluate(
        """(value) => {
            const el = document.querySelector(`input[value="${value}"]`);
            if (el) { el.checked = true; SelectQtType(el); }
        }""",
        value,
    )
    await page.wait_for_timeout(1000)


async def scrape_date(page, date_str: str) -> bool:
    await page.evaluate("(d) => SelectNextCheck(d)", date_str)
    if not await wait_for_date(page, date_str):
        return False
    await page.wait_for_timeout(500)

    # QT1 (매일성경)
    bonmun = await get_bonmun(page)
    haeseol = await get_haeseol(page)
    save_json(date_str, bonmun, haeseol, "main")
    update_entries(date_str, "main")

    # QT6 (매일성경 순) - 같은 날짜 유지된 채 트랙만 전환
    await select_qt(page, "QT6")
    await wait_for_date(page, date_str, timeout=4000)
    bonmun_soon = await get_bonmun(page)
    haeseol_soon = await get_haeseol(page)
    save_json(date_str, bonmun_soon, haeseol_soon, "soon")
    update_entries(date_str, "soon")

    # 다음 날짜 반복을 위해 QT1으로 원복
    await select_qt(page, "QT1")
    return True


async def open_today_page(p):
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
    await page.goto(URL, wait_until="domcontentloaded", timeout=60000)
    await page.wait_for_selector("#mainView_2", timeout=30000)
    await page.wait_for_timeout(1500)
    return browser, page


def get_existing_dates(version_type: str = "main") -> set[str]:
    path = DATA_DIR / version_type / "entries.json"
    if not path.exists():
        return set()
    try:
        return set(json.loads(path.read_text(encoding="utf-8")))
    except (json.JSONDecodeError, ValueError):
        return set()


def find_gap_dates() -> list[str]:
    """기존 entries.json(main 기준)의 최고(最古) 날짜 ~ 오늘 사이에서 누락된 날짜를 찾는다."""
    existing = get_existing_dates("main")
    if not existing:
        return []

    oldest = datetime.strptime(min(existing), "%Y-%m-%d").date()
    today = datetime.now(KST).date()

    all_dates = []
    d = oldest
    while d <= today:
        all_dates.append(d.strftime("%Y-%m-%d"))
        d += timedelta(days=1)

    return [d for d in all_dates if d not in existing]


async def run_gap_fill():
    missing = find_gap_dates()
    if not missing:
        print("[갭 확인] 누락된 날짜 없음 - 브라우저 실행 생략")
        return

    print(f"[갭 확인] 누락된 날짜 {len(missing)}건: {', '.join(missing)}")

    async with async_playwright() as p:
        browser, page = await open_today_page(p)

        success_count = 0
        for date_str in missing:
            print(f"[시도] {date_str} ...")
            try:
                ok = await scrape_date(page, date_str)
            except Exception as err:
                print(f"[에러] {date_str}: {err}")
                ok = False

            if ok:
                print(f"[성공] {date_str}")
                success_count += 1
            else:
                print(f"[실패] {date_str} (건너뜀 - 다음 실행 때 다시 시도됨)")

            await page.wait_for_timeout(POLITE_DELAY_MS)

        await browser.close()

    print(f"[완료] 갭 채우기 {success_count}/{len(missing)}건 성공")


async def main():
    start = datetime.now(KST).date() - timedelta(days=1)  # 어제부터 (오늘은 이미 있음)
    print(f"[백필 시작] {start} 부터 과거로 최대 {MAX_DAYS_BACK}일 탐색")

    async with async_playwright() as p:
        browser, page = await open_today_page(p)

        success_count = 0
        consecutive_failures = 0
        d = start

        for _ in range(MAX_DAYS_BACK):
            date_str = d.strftime("%Y-%m-%d")
            print(f"[시도] {date_str} ...")
            try:
                ok = await scrape_date(page, date_str)
            except Exception as err:
                print(f"[에러] {date_str}: {err}")
                ok = False

            if ok:
                print(f"[성공] {date_str}")
                success_count += 1
                consecutive_failures = 0
            else:
                consecutive_failures += 1
                print(f"[실패] {date_str} (연속 실패 {consecutive_failures}/{CONSECUTIVE_FAILURE_LIMIT})")
                if consecutive_failures >= CONSECUTIVE_FAILURE_LIMIT:
                    print("[중단] 연속 실패 - 접근 가능 범위의 끝으로 판단하고 백필을 종료합니다.")
                    break

            d -= timedelta(days=1)
            await page.wait_for_timeout(POLITE_DELAY_MS)

        await browser.close()

    print(f"[완료] 총 {success_count}일치 백필 완료")


if __name__ == "__main__":
    if "--gaps" in sys.argv:
        asyncio.run(run_gap_fill())
    else:
        asyncio.run(main())
