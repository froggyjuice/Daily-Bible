// 1회용: 기존 data/{main,soon}/{date}.json → Supabase qt_entries 업로드 후 검증
//   node --env-file=.env.local scripts/migrate.mjs

import fs from 'node:fs';
import path from 'node:path';
import { upsertEntries, listDates, getEntry } from '../api/_lib/db.js';

const DATA = path.join(import.meta.dirname, '..', 'data');
const rows = [];

for (const track of ['main', 'soon']) {
  for (const file of fs.readdirSync(path.join(DATA, track))) {
    if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(file)) continue;
    const json = JSON.parse(fs.readFileSync(path.join(DATA, track, file), 'utf8'));
    const md = json.content;
    const scraped = md.match(/수집 시각: (\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/);
    rows.push({
      qt_date: json.date,
      track,
      title: md.match(/## 본문\n\*\*(.+?)\*\*/)?.[1] ?? null,
      bible_ref: md.match(/## 본문\n\*\*.+?\*\*\n\*(.+?)\*/)?.[1] ?? null,
      content_md: md,
      scraped_at: scraped ? new Date(`${scraped[1].replace(' ', 'T')}+09:00`).toISOString() : new Date().toISOString(),
      scraped_by: 'migration',
    });
  }
}

console.log(`업로드 대상: ${rows.length}건`);
for (let i = 0; i < rows.length; i += 100) {
  await upsertEntries(rows.slice(i, i + 100));
  console.log(`  ${Math.min(i + 100, rows.length)}/${rows.length}`);
}

// 검증: 개수 + 전체 본문 일치
let mismatch = 0;
for (const track of ['main', 'soon']) {
  const local = rows.filter(r => r.track === track);
  const remote = await listDates(track);
  console.log(`[${track}] 로컬 ${local.length}건 / DB ${remote.length}건`);
  for (const r of local) {
    const got = await getEntry(r.qt_date, track);
    if (got?.content_md !== r.content_md) { mismatch++; console.log(`  불일치: ${r.qt_date}`); }
  }
}
console.log(mismatch === 0 ? '✅ 검증 통과: 모든 본문 일치' : `❌ 불일치 ${mismatch}건`);
process.exitCode = mismatch === 0 ? 0 : 1;
