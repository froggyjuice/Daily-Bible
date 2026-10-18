// Vercel Cron (vercel.json): 하루 1회, 최근 30일 ~ 이틀 뒤 중 빠진 날짜를 스크랩
import { runScrape } from '../../lib/job.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const result = await runScrape({ source: 'vercel-cron', lookback: 30, ahead: 2 });
  res.status(result.ok ? 200 : 502).json(result);
}
