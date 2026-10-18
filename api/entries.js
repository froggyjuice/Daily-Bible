import { requireAuth } from '../lib/auth.js';
import { listDates } from '../lib/db.js';
import { TRACKS } from '../lib/scrape.js';

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;

  const track = req.query.track || 'main';
  if (!TRACKS[track]) return res.status(400).json({ error: 'invalid track' });

  try {
    const dates = await listDates(track);
    res.setHeader('Cache-Control', 'private, no-cache');
    res.status(200).json({ track, dates });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'db error' });
  }
}
