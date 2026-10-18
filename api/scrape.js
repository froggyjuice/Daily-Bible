// 대시보드 🔄 버튼: 최근 7일 ~ 이틀 뒤 중 빠진 날짜를 즉시 스크랩
import { requireAuth } from '../lib/auth.js';
import { runScrape } from '../lib/job.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  if (!requireAuth(req, res)) return;

  const result = await runScrape({ source: 'vercel-manual', lookback: 7, ahead: 2 });
  res.status(result.ok ? 200 : 502).json(result);
}
