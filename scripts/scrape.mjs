// 수동 스크랩/백필 CLI (Vercel Cron 이 빠뜨린 날짜를 채울 때)
//
//   node --env-file=.env.local scripts/scrape.mjs                 # 최근 30일 ~ 오늘 빠진 날짜
//   node --env-file=.env.local scripts/scrape.mjs --all           # DB 최초 날짜부터 빠진 날짜 전부
//   node --env-file=.env.local scripts/scrape.mjs --from 2026-01-01 [--to 2026-05-31]
//   node --env-file=.env.local scripts/scrape.mjs --date 2026-10-12 --force   # 덮어쓰기
//
// 종료 코드: 0 = 성공, 1 = 실패

import { runScrape } from '../api/_lib/job.js';
import { addDays, todayKst } from '../api/_lib/scrape.js';

const args = process.argv.slice(2);
const opt = name => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const opts = { source: 'local', force: args.includes('--force') };
if (opt('--date')) {
  opts.dates = [opt('--date')];
} else if (opt('--from')) {
  const to = opt('--to') || todayKst();
  opts.dates = [];
  for (let d = opt('--from'); d <= to; d = addDays(d, 1)) opts.dates.push(d);
} else if (args.includes('--all')) {
  opts.lookback = 'all';
}

const result = await runScrape(opts);
process.exitCode = result.ok ? 0 : 1;
