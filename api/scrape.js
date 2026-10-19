// 대시보드 🔄 버튼: 최근 7일 ~ 오늘 중 빠진 날짜를 즉시 스크랩
import { runScrape } from './_lib/job.js';

// 공개 엔드포인트라 연타·외부 호출이 원본 사이트를 두드리지 않도록 인스턴스당 1분 간격 제한
let lastRun = 0;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });
  if (Date.now() - lastRun < 60 * 1000) {
    return res.status(429).json({ ok: false, scraped: [], error: '잠시 후 다시 시도해 주세요' });
  }
  lastRun = Date.now();

  const result = await runScrape({ source: 'vercel-manual', lookback: 7 });
  res.status(result.ok ? 200 : 502).json(result);
}
