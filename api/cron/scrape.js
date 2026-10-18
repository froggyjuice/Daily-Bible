// Vercel Cron (vercel.json): 매일 자정 직후(KST), 최근 30일 ~ 오늘 중 빠진 날짜를 스크랩
import { runScrape } from '../_lib/job.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const result = await runScrape({ source: 'vercel-cron', lookback: 30 });
  res.status(result.ok ? 200 : 502).json(result);
}
