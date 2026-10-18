/* ────────────────────────────────────────────
   매일성경 (sum.su.or.kr) 스크래퍼 — fetch 기반
   - 사이트 자체 AJAX JSON 엔드포인트를 직접 호출 (브라우저 불필요)
   - 출력 마크다운은 기존 Playwright 스크래퍼(scraper.py)와 같은 형식
   ──────────────────────────────────────────── */

const BASE = 'https://sum.su.or.kr:8888';
export const SOURCE_URL = `${BASE}/bible/today`;
export const TRACKS = { main: 'QT1', soon: 'QT6' };
const TITLE_PREFIX = { main: '매일성경', soon: '매일성경 순' };

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36';

// ── 세션 (ASP.NET_SessionId 쿠키) ──
export async function openSession({ timeoutMs = 20000 } = {}) {
  const res = await fetch(SOURCE_URL, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`세션 페이지 응답 ${res.status}`);
  await res.arrayBuffer();
  const cookie = (res.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ');
  return { cookie, timeoutMs };
}

async function post(session, endpoint, body) {
  const res = await fetch(`${BASE}/Ajax/Bible/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'X-Requested-With': 'XMLHttpRequest',
      'User-Agent': UA,
      Cookie: session.cookie,
      Referer: SOURCE_URL,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(session.timeoutMs),
  });
  if (!res.ok) throw new Error(`${endpoint} 응답 ${res.status}`);
  return res.json();
}

// ── HTML 조각 → innerText 근사 ──
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
function htmlToText(s) {
  if (s == null) return '';
  return String(s)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => {
      if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .split('\n')
    .map(line => line.replace(/[ \t ]+/g, ' ').trim())
    .join('\n')
    .trim();
}

// ── 날짜 하나 · 트랙 하나 스크랩 → 구조화 데이터 (없으면 null) ──
export async function fetchQt(session, date, track) {
  const qt_ty = TRACKS[track];
  if (!qt_ty) throw new Error(`알 수 없는 트랙: ${track}`);

  const [cont, verses, detail] = await Promise.all([
    post(session, 'BodyBibleCont', { qt_ty, Base_de: date, Bibletype: '1' }),
    post(session, 'BodyBible', { qt_ty, Base_de: date }),
    fetchMedia(session, date, track),
  ]);

  // 사이트가 해당 날짜를 아직 공개하지 않았거나 범위 밖이면 빈 응답
  if (!cont || cont.Base_de !== date || !cont.Qt_sj || !Array.isArray(verses) || verses.length === 0) {
    return null;
  }

  const ref = `본문 : ${cont.Bible_name}${cont.Bible_chapter} 찬송가 ${cont.New_song}장`;

  // 해설 블록 순서는 사이트 JS(SelectBibleCont)와 동일
  const blocks = [];
  if (cont.Qt_Brf) blocks.push({ kind: 'b', text: cont.Qt_Brf });
  const qa = n => {
    if (cont[`Qt_a${n}`]) {
      blocks.push({ kind: 'g', text: cont[`Qt_q${n}_str`] });
      blocks.push({ kind: 't', text: cont[`Qt_a${n}`] });
    }
  };
  qa(1);
  if (qt_ty === 'QT5') qa(4);
  qa(2);
  qa(3);
  if (qt_ty !== 'QT5') qa(4);

  return {
    date,
    track,
    title: htmlToText(cont.Qt_sj),
    ref,
    verses: verses.map(v => ({ num: v.Verse, text: htmlToText(v.Bible_Cn) })),
    blocks: blocks.map(b => ({ kind: b.kind, text: htmlToText(b.text) })),
    mediaUrl: detail.mediaUrl,
    speaker: detail.speaker,
  };
}

// 공식 오디오 mp3 주소 + 낭독/해설자 (BodyMatterDetail 에만 있음, 매일성경/순 공통)
export async function fetchMedia(session, date, track) {
  const d = await post(session, 'BodyMatterDetail', { qt_ty: TRACKS[track], Base_de: date });
  return {
    mediaUrl: /^https:\/\/[\w.-]+\/.+\.mp3$/i.test(d?.MediaFileUrl || '') ? d.MediaFileUrl : null,
    speaker: d?.Speaker || null,
  };
}

// ── 구조화 데이터 → 기존 형식 마크다운 ──
export function toMarkdown(qt, scrapedAt = new Date()) {
  const kst = new Date(scrapedAt.getTime() + 9 * 3600 * 1000).toISOString().replace('T', ' ').slice(0, 19);

  const bonmun = ['## 본문', `**${qt.title}**`, `*${qt.ref}*`, '',
    ...qt.verses.map(v => (v.num ? `${v.num}. ${v.text}` : v.text))].join('\n');

  const h = ['## 해설', `**${qt.title}**`, `*${qt.ref}*`, ''];
  for (const b of qt.blocks) {
    if (!b.text) continue;
    h.push(b.kind === 'g' ? `\n### ${b.text}` : b.text);
    h.push('');
  }
  const haeseol = h.join('\n');

  return `# ${TITLE_PREFIX[qt.track]} - ${qt.date}

> 출처: ${SOURCE_URL}
> 수집 시각: ${kst} (KST)

---

${bonmun}

---

${haeseol}

---

> *해설의 저작권은 성서유니온에 있습니다.*
`;
}

// ── 날짜 유틸 (KST) ──
export function todayKst(offsetDays = 0) {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

export function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
