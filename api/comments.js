// 날짜별 댓글 (매일성경/순 공통 — 같은 성경 본문) — 계정 없이 닉네임으로 작성, 브라우저별 토큰으로 본인 댓글만 삭제
//   GET    /api/comments?date=        (헤더 X-Comment-Token: 내 댓글 표시용)
//   POST   /api/comments  { date, nickname, body, token }
//   DELETE /api/comments?id=&token=
import { createHash } from 'node:crypto';
import { listComments, insertComment, deleteComment } from './_lib/db.js';
import { todayKst } from './_lib/scrape.js';

const hash = token => createHash('sha256').update(`qt-comment-v1:${token}`).digest('hex');
const validToken = t => typeof t === 'string' && /^[A-Za-z0-9_-]{16,128}$/.test(t);
const validDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '') && d <= todayKst();

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');

  try {
    if (req.method === 'GET') {
      const { date } = req.query;
      if (!validDate(date)) return res.status(400).json({ error: 'invalid params' });
      const token = req.headers['x-comment-token'];
      const mine = validToken(token) ? hash(token) : null;
      const rows = await listComments(date);
      return res.status(200).json({
        comments: rows.map(({ delete_hash, ...c }) => ({ ...c, mine: delete_hash === mine })),
      });
    }

    if (req.method === 'POST') {
      const { date, nickname, body, token } = req.body || {};
      const nick = String(nickname || '').trim();
      const text = String(body || '').trim();
      if (!validDate(date) || !validToken(token)) {
        return res.status(400).json({ error: 'invalid params' });
      }
      if (nick.length < 1 || nick.length > 20) return res.status(400).json({ error: '닉네임은 1~20자' });
      if (text.length < 1 || text.length > 500) return res.status(400).json({ error: '댓글은 1~500자' });

      const row = await insertComment({ qt_date: date, nickname: nick, body: text, delete_hash: hash(token) });
      return res.status(201).json({ comment: { ...row, mine: true } });
    }

    if (req.method === 'DELETE') {
      const { id, token } = req.query;
      if (!/^\d+$/.test(id || '') || !validToken(token)) return res.status(400).json({ error: 'invalid params' });
      const n = await deleteComment(id, hash(token));
      return n ? res.status(200).json({ ok: true }) : res.status(403).json({ error: '본인 댓글만 삭제할 수 있습니다' });
    }

    res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'db error' });
  }
}
