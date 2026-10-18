// 날짜별 본문 관련 유튜브 영상 (화면 안 재생용)
//   GET /api/videos?date=YYYY-MM-DD
// - YouTube Data API search.list 는 1회 100 할당량(하루 기본 10,000) → 결과를 qt_videos 에 캐시
// - 영상은 하루 중 계속 올라오므로 최근 이틀치는 6시간이 지나면 다시 검색
// - YOUTUBE_API_KEY 가 없거나 할당량 초과면 503 → 프론트가 유튜브 검색 페이지를 새 창으로 연다
import { requireAuth } from './_lib/auth.js';
import { getEntry, getVideos, saveVideos } from './_lib/db.js';
import { todayKst, addDays } from './_lib/scrape.js';

const REFRESH_MS = 6 * 60 * 60 * 1000;

// '본문 : 야고보서(James)2:1 - 2:13 찬송가 221장' → '매일성경 야고보서 2장 1-13절'
export function buildQuery(bibleRef) {
  const m = (bibleRef || '').match(/본문\s*:\s*([^(\d]+?)\s*(?:\([^)]*\))?\s*(\d+):(\d+)\s*-\s*(?:(\d+):)?(\d+)/);
  if (!m) return null;
  const [, book, ch, vs, ch2, ve] = m;
  const range = ch2 && ch2 !== ch ? `${ch}장 ${vs}절-${ch2}장 ${ve}절` : `${ch}장 ${vs}-${ve}절`;
  return `매일성경 ${book.trim()} ${range}`;
}

async function searchYoutube(query, key) {
  const params = new URLSearchParams({
    part: 'snippet', type: 'video', videoEmbeddable: 'true', maxResults: '8',
    regionCode: 'KR', relevanceLanguage: 'ko', q: query, key,
  });
  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);
  if (!res.ok) throw new Error(`YouTube API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (data.items || []).map(it => ({
    id: it.id.videoId,
    title: it.snippet.title,
    channel: it.snippet.channelTitle,
    thumb: it.snippet.thumbnails?.medium?.url || it.snippet.thumbnails?.default?.url,
    published: it.snippet.publishedAt,
  }));
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  res.setHeader('Cache-Control', 'private, no-store');

  const { date } = req.query;
  const today = todayKst();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || date > today) return res.status(400).json({ error: 'invalid date' });

  try {
    const cached = await getVideos(date);
    const fresh = cached && (date < addDays(today, -1) || Date.now() - new Date(cached.fetched_at) < REFRESH_MS);
    if (fresh) return res.status(200).json({ query: cached.query, items: cached.items, cached: true });

    const entry = await getEntry(date, 'main');
    const query = buildQuery(entry?.bible_ref);
    if (!query) return res.status(404).json({ error: 'no passage' });

    const key = process.env.YOUTUBE_API_KEY;
    if (!key) {
      return cached
        ? res.status(200).json({ query: cached.query, items: cached.items, cached: true })
        : res.status(503).json({ error: 'no_key', query });
    }

    try {
      const items = await searchYoutube(query, key);
      await saveVideos(date, query, items);
      res.status(200).json({ query, items, cached: false });
    } catch (e) {
      console.error(e);
      // 할당량 초과 등: 예전 캐시라도 있으면 그걸 보여줌
      if (cached) return res.status(200).json({ query: cached.query, items: cached.items, cached: true });
      res.status(503).json({ error: 'youtube_unavailable', query });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'db error' });
  }
}
