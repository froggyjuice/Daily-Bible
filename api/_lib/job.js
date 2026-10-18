/* ────────────────────────────────────────────
   스크랩 작업: 빠진 (날짜, 트랙)을 찾아 스크랩 → Supabase upsert
   Vercel Cron / 수동 새로고침 / 로컬 스크립트가 공통으로 사용
   ──────────────────────────────────────────── */

import { openSession, fetchQt, toMarkdown, TRACKS, todayKst, addDays } from './scrape.js';
import { existingKeys, oldestDate, upsertEntries, logRun } from './db.js';

/**
 * @param {object} opts
 * @param {string} opts.source      scrape_runs.source / qt_entries.scraped_by 값
 * @param {string[]} [opts.dates]   지정 시 이 날짜들만 (force 와 함께 쓰면 기존 것도 덮어씀)
 * @param {number} [opts.lookback]  오늘 기준 며칠 전까지 빠진 날짜를 채울지 (기본 30, 'all' 이면 DB의 가장 오래된 날짜부터)
 * @param {number} [opts.ahead]     오늘 이후 며칠까지 미리 받을지 (사이트 공개 범위 밖은 자동으로 건너뜀)
 * @param {boolean} [opts.force]
 * @param {(msg: string) => void} [opts.log]
 */
export async function runScrape({ source, dates, lookback = 30, ahead = 2, force = false, log = console.log } = {}) {
  const today = todayKst();
  let targets = dates;
  if (!targets) {
    let from = addDays(today, -lookback);
    if (lookback === 'all') from = (await oldestDate()) || today;
    targets = [];
    for (let d = from; d <= addDays(today, ahead); d = addDays(d, 1)) targets.push(d);
  }
  targets = [...new Set(targets)].sort();

  const have = force ? new Set() : await existingKeys(targets[0], targets[targets.length - 1]);
  const todo = [];
  for (const date of targets) for (const track of Object.keys(TRACKS)) {
    if (!have.has(`${date}:${track}`)) todo.push({ date, track });
  }

  const result = { ok: true, scraped: [], unavailable: [], error: null };
  if (todo.length === 0) {
    log('[완료] 빠진 날짜 없음');
    return result;
  }
  log(`[시작] 대상 ${todo.length}건: ${todo.map(t => `${t.date}:${t.track}`).join(', ')}`);

  const rows = [];
  try {
    const session = await openSession();
    for (const { date, track } of todo) {
      const qt = await fetchQt(session, date, track);
      if (!qt) {
        result.unavailable.push(`${date}:${track}`);
        continue;
      }
      rows.push({
        qt_date: date,
        track,
        title: qt.title,
        bible_ref: qt.ref,
        content_md: toMarkdown(qt),
        scraped_at: new Date().toISOString(),
        scraped_by: source,
      });
      result.scraped.push(`${date}:${track}`);
      log(`[성공] ${date} ${track} — ${qt.title}`);
    }
    if (result.unavailable.length) log(`[건너뜀] 아직 공개 안 됨/범위 밖: ${result.unavailable.join(', ')}`);
  } catch (e) {
    result.ok = false;
    result.error = e.cause ? `${e.message} (${e.cause.code || e.cause.message})` : e.message;
    log(`[실패] ${result.error}`);
  }

  // 중간에 실패해도 그때까지 받은 것은 저장
  try {
    await upsertEntries(rows);
  } catch (e) {
    result.ok = false;
    result.scraped = [];
    result.error = [result.error, e.message].filter(Boolean).join(' / ');
    log(`[저장 실패] ${e.message}`);
  }

  await logRun({ source, ok: result.ok, scraped: result.scraped, error: result.error });
  return result;
}
