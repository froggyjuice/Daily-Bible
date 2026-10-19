import { listDates } from './_lib/db.js';
import { runScrape } from './_lib/job.js';
import { TRACKS, todayKst } from './_lib/scrape.js';

let lastVisitScrape = 0;

export default async function handler(req, res) {

  const track = req.query.track || 'main';
  if (!TRACKS[track]) return res.status(400).json({ error: 'invalid track' });

  try {
    const today = todayKst();
    let dates = await listDates(track, today);

    // 자정이 지났는데 Cron 이 아직이면, 첫 방문자가 오늘자를 바로 채운다 (1~2초)
    // 사이트가 막혔거나 아직 미공개일 때 매 요청마다 재시도하지 않도록 인스턴스당 5분 간격 제한
    if (dates[0] !== today && Date.now() - lastVisitScrape > 5 * 60 * 1000) {
      lastVisitScrape = Date.now();
      const result = await runScrape({ source: 'vercel-visit', dates: [today] });
      if (result.scraped.length) dates = await listDates(track, today);
    }

    res.setHeader('Cache-Control', 'private, no-cache');
    res.status(200).json({ track, today, dates });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'db error' });
  }
}
