import { requireAuth } from './_lib/auth.js';
import { getEntry } from './_lib/db.js';
import { TRACKS, todayKst } from './_lib/scrape.js';

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  const { date, track = 'main' } = req.query;
  if (!TRACKS[track] || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) {
    return res.status(400).json({ error: 'invalid params' });
  }
  if (date > todayKst()) return res.status(404).json({ error: 'not yet published' });

  try {
    const row = await getEntry(date, track);
    if (!row) return res.status(404).json({ error: 'not found' });
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.status(200).json({ date: row.qt_date, type: row.track, content: row.content_md });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'db error' });
  }
}
