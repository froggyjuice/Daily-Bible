/* ────────────────────────────────────────────
   🗺️ 천로역정 순례길 — 하루하루 말씀과 함께 걷는 보드게임
   - 하루 최대 3칸: 📖 오늘 말씀 열기 · ✏️ 메모나 나눔 남기기 · 🤝 말씀 공유하기 (KST 날짜 기준)
   - 장소에 도착하면 이야기, 관문(말씀 퍼즐 · 선택)을 넘어야 다음으로 — 그동안 얻은 걸음은 모아 둠
   - 진행은 이 브라우저(localStorage 'pilgrim')에만 저장
   - 장소/이야기는 pilgrim-story.js, 앱 공용 함수(todayKST, showToast, loadBookmarks …)는 app.js
   ──────────────────────────────────────────── */

const PG_KEY = 'pilgrim';
const PG_COLS = 7;                 // 지도 한 줄 칸 수 (아래에서 위로 지그재그)
const PG_ROW_H = 56;
const PG_TOP = 34;                 // 맨 윗줄 위 여백 (순례자 아이콘이 잘리지 않게)
const PG_KIND = {
  read:  { icon: '📖', label: '오늘 말씀' },
  note:  { icon: '✏️', label: '메모·나눔' },
  share: { icon: '🤝', label: '말씀 공유' },
};

let pgReady = false;   // 본문 목록을 처음 불러온 뒤부터 '오늘 말씀' 걸음을 줌


// ═══════════════════════════════════════════
//  상태 저장 / 계산
// ═══════════════════════════════════════════
function pgDefault() {
  return { v: 1, steps: 0, cleared: {}, seen: {}, items: [], days: {}, round: 1, startedAt: null, finishedAt: null };
}

function pgLoad() {
  try {
    const raw = localStorage.getItem(PG_KEY);
    if (raw) return { ...pgDefault(), ...JSON.parse(raw) };
  } catch { return pgDefault(); }
  return pgMigrate();
}

function pgSave(s) {
  try { localStorage.setItem(PG_KEY, JSON.stringify(s)); return true; }
  catch { return false; }   // 저장이 안 되는 브라우저(사생활 보호 모드 등)는 조용히 건너뜀
}

// 예전 📮 출석도장 기록 → 지난 출석일만큼 걸음으로 옮기고(최대 8칸), 출석도장·말씀 퍼즐 기록은 지움
function pgMigrate() {
  const s = pgDefault();
  try {
    const att = JSON.parse(localStorage.getItem('attendance'));
    if (Array.isArray(att)) {
      const today = todayKST();
      const past = att.filter(d => d < today);
      s.steps = Math.min(past.length, 8);
      if (past.length) s.startedAt = past[0];
    }
    localStorage.removeItem('attendance');
    Object.keys(localStorage).filter(k => k.startsWith('puzzle:')).forEach(k => localStorage.removeItem(k));
  } catch {}
  pgSave(s);
  return s;
}

// 아직 넘지 못한 첫 관문 — 걸음은 여기서 멈춤
function pgBlockStop(s) {
  return PILGRIM_STOPS.find(st => st.gate && !s.cleared[st.id]) || null;
}

function pgPos(s) {
  const block = pgBlockStop(s);
  return Math.min(s.steps, block ? block.cell : PILGRIM_END);
}

function pgCurrentStop(pos) {
  return [...PILGRIM_STOPS].reverse().find(st => st.cell <= pos);
}

function pgNextStop(pos) {
  return PILGRIM_STOPS.find(st => st.cell > pos) || null;
}

// 지금 할 일: 아직 안 본 이야기 → 관문 → 없음
function pgPending(s, pos = pgPos(s)) {
  const unseen = PILGRIM_STOPS.find(st => st.cell <= pos && !s.seen[st.id]);
  if (unseen) return { kind: 'story', stop: unseen };
  const block = pgBlockStop(s);
  if (block && pos === block.cell) return { kind: 'gate', stop: block };
  return null;
}

function pgFinished(s) { return !!s.cleared.celestial && !!s.seen.celestial; }

// 지도 위 순례자: 짐(십자가 전) · 길동무(신의 → 희망)
function pgAvatar(s) {
  let face = '🧑';
  if (s.cleared.vanity) face = '🧑🧒';
  else if (s.seen.faithful) face = '🧑🧑‍🦰';
  return s.seen.cross ? face : `${face}<i class="pg-burden">🎒</i>`;
}


// ═══════════════════════════════════════════
//  걸음 얻기 — 하루 종류별 한 번씩, 최대 3칸
// ═══════════════════════════════════════════
function pilgrimEarn(kind) {
  const s = pgLoad();
  const today = todayKST();
  const done = s.days[today] || [];
  if (done.includes(kind)) return;

  const before = pgPos(s);
  done.push(kind);
  s.days[today] = done;
  s.steps++;
  if (!s.startedAt) s.startedAt = today;
  // 날짜 기록은 최근 60일만
  const keep = Object.keys(s.days).sort().slice(-60);
  s.days = Object.fromEntries(keep.map(d => [d, s.days[d]]));
  if (!pgSave(s)) return;

  const after = pgPos(s);
  const k = PG_KIND[kind];
  const count = `오늘 ${done.length}/3`;
  if (pgFinished(s)) {
    showToast(`${k.icon} ${k.label} 걸음! (${count}) — 🔁 다시 순례하기로 새 여정을 시작해 보세요`, 'success', 3200);
  } else if (after > before) {
    const arrived = PILGRIM_STOPS.find(st => st.cell === after);
    showToast(arrived
      ? `📍 ${arrived.name} 도착! 순례길에서 이야기를 보세요 (${count})`
      : `👣 ${k.label} — 한 칸 전진! (${count})`, 'success', 3000);
  } else {
    const block = pgBlockStop(s);
    showToast(`👣 ${k.label} — 걸음을 모아 뒀어요. ${block ? `${block.name} 관문을 넘으면` : '곧'} 앞으로 가요 (${count})`, 'info', 3200);
  }
  renderPilgrim();
}

// 본문 목록을 불러온 뒤 / 앱을 켜 둔 채 자정을 넘겨 다시 볼 때
function pilgrimDaily() {
  pgReady = true;
  pilgrimEarn('read');
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && pgReady) pilgrimEarn('read');
});

function pilgrimGoNote() {
  if (!currentDate) { showToast('본문을 불러온 뒤에 쓸 수 있어요', 'info'); return; }
  closePilgrim();
  if (dockOpen !== 'memo' && dockOpen !== 'nanum') toggleDock('memo');
}

function pilgrimGoShare() {
  if (!currentDate) { showToast('본문을 불러온 뒤에 공유할 수 있어요', 'info'); return; }
  sharePassage();
}


// ═══════════════════════════════════════════
//  헤더 순례길 버튼 + 순례길 창 그리기
// ═══════════════════════════════════════════
function renderPilgrim() {
  const s = pgLoad();
  const pos = pgPos(s);
  const pending = pgPending(s, pos);
  const cur = pgCurrentStop(pos);
  const next = pgNextStop(pos);
  const block = pgBlockStop(s);
  const today = s.days[todayKST()] || [];

  // ── 헤더 버튼 (지금 상태는 툴팁으로) ──
  document.getElementById('jr-avatar').innerHTML = pgAvatar(s);
  let where, sub;
  if (pgFinished(s)) {
    where = '👑 천국 성문 도착 — 순례 완주!';
    sub = '🔁 다시 순례하기로 새 여정을 떠나요';
  } else if (pending?.kind === 'story') {
    where = pending.stop.cell === 0 ? '🎒 순례를 떠나요!' : `📍 ${pending.stop.name} 도착!`;
    sub = '눌러서 이야기 보기 ▶';
  } else if (pending?.kind === 'gate') {
    where = `${pending.stop.gate.boss ? pending.stop.gate.boss.icon : '⚔️'} ${pending.stop.name} 관문`;
    sub = s.steps > pos ? `넘으면 모아 둔 ${s.steps - pos}걸음만큼 전진 ▶` : '눌러서 관문 도전 ▶';
  } else {
    where = `${cur.icon} ${cur.name}`;
    sub = next ? `${next.icon} ${next.name}까지 ${next.cell - pos}칸` : '';
    if (block && s.steps > pos) sub += ` · 👣 ${s.steps - pos} 모아 둠`;
  }
  const btn = document.getElementById('jr-open');
  btn.title = sub ? `${where} · ${sub}` : where;
  btn.setAttribute('aria-label', `천로역정 순례길 열기 — ${btn.title} · 오늘 걸음 ${today.length}/3`);
  btn.classList.toggle('alert', !!pending);
  document.getElementById('jr-count').textContent = `${today.length}/3`;

  // ── 창이 열려 있으면 지도도 ──
  if (pilgrimOpen() && document.getElementById('pg-view-map').style.display !== 'none') renderPilgrimMap(s);
}

function renderPilgrimMap(s = pgLoad()) {
  const pos = pgPos(s);
  const pending = pgPending(s, pos);
  const cur = pgCurrentStop(pos);
  const next = pgNextStop(pos);
  const today = s.days[todayKST()] || [];

  document.getElementById('pg-title').textContent =
    `🗺️ 천로역정 순례길${s.round > 1 ? ` · ${s.round}회차` : ''}`;

  // ── 지금 상태 카드 ──
  const status = document.getElementById('pg-status');
  let action = '';
  if (pgFinished(s)) {
    const days = s.startedAt ? Math.round((Date.parse(s.finishedAt || todayKST()) - Date.parse(s.startedAt)) / 86400000) + 1 : 0;
    action = `
      <p class="pg-status-desc">멸망의 도시에서 천국 성문까지${days ? ` ${days}일 동안` : ''} 걸었어요. 정말 수고했어요! 👑</p>
      <div class="pg-actions">
        <button class="login-btn primary" onclick="pgShareFinish()">🤝 완주 소식 나누기</button>
        <button class="login-btn" onclick="pgRestart()">🔁 다시 순례하기</button>
      </div>`;
  } else if (pending) {
    const label = pending.kind === 'story' ? '📖 이야기 보기' : `${pending.stop.gate.boss ? '⚔️ 맞서 싸우기' : '⚔️ 관문 도전'}`;
    action = `
      <p class="pg-status-desc">${pending.stop.icon} <b>${pending.stop.name}</b> — ${pending.stop.desc}</p>
      <div class="pg-actions"><button class="login-btn primary pg-go" onclick="pgStart('${pending.stop.id}')">${label}</button></div>`;
  } else {
    action = `<p class="pg-status-desc">${cur.desc}${next ? ` · 다음 ${next.icon} <b>${next.name}</b>까지 ${next.cell - pos}칸` : ''}</p>`;
  }
  status.innerHTML = `
    <div class="pg-status-top">
      <span class="pg-status-avatar">${pgAvatar(s)}</span>
      <div><b class="pg-status-name">${cur.icon} ${cur.name}</b>
      <small class="pg-status-cells">${pos} / ${PILGRIM_END}칸${s.steps > pos && !pgFinished(s) ? ` · 👣 모아 둔 걸음 ${s.steps - pos}` : ''}</small></div>
    </div>${action}`;

  // ── 지도 ──
  renderPilgrimBoard(s, pos);

  // ── 오늘의 걸음 ──
  const rows = [
    ['read',  '오늘 말씀 열기',     '사이트를 열면 저절로', ''],
    ['note',  '메모나 나눔 남기기', '', `<button class="chip" onclick="pilgrimGoNote()">쓰러 가기</button>`],
    ['share', '말씀 공유하기',      '', `<button class="chip" onclick="pilgrimGoShare()">공유하기</button>`],
  ];
  document.getElementById('pg-missions').innerHTML = `
    <h4>오늘의 걸음 <small>${today.length}/3 · 하루 최대 3칸</small></h4>
    ${rows.map(([k, label, hint, btn]) => `
      <div class="pg-mission${today.includes(k) ? ' done' : ''}">
        <span class="pg-mission-icon">${today.includes(k) ? '✅' : PG_KIND[k].icon}</span>
        <span class="pg-mission-label">${label}${hint && !today.includes(k) ? ` <small>${hint}</small>` : ''}</span>
        ${today.includes(k) ? '<small class="pg-mission-ok">+1칸</small>' : btn}
      </div>`).join('')}`;

  // ── 모은 것 ──
  document.getElementById('pg-items').innerHTML = `
    <h4>순례 가방 <small>${s.items.length}/${Object.keys(PILGRIM_ITEMS).length}</small></h4>
    <div class="pg-item-grid">${Object.entries(PILGRIM_ITEMS).map(([id, it]) => {
      const has = s.items.includes(id);
      return `<div class="pg-item${has ? ' has' : ''}" title="${has ? it.desc : '아직 얻지 못했어요'}">
        <span>${has ? it.icon : '❔'}</span><small>${has ? it.name : '???'}</small></div>`;
    }).join('')}</div>`;
}

// 아래(출발)에서 위(천국 성문)로 올라가는 지그재그 보드
function pgCellXY(cell) {
  const rows = Math.ceil((PILGRIM_END + 1) / PG_COLS);
  const r = Math.floor(cell / PG_COLS);
  const c = r % 2 === 0 ? cell % PG_COLS : PG_COLS - 1 - (cell % PG_COLS);
  return { x: (c + 0.5) / PG_COLS, y: PG_TOP + (rows - 1 - r) * PG_ROW_H + PG_ROW_H / 2 };
}

function renderPilgrimBoard(s, pos) {
  const rows = Math.ceil((PILGRIM_END + 1) / PG_COLS);
  const h = PG_TOP + rows * PG_ROW_H;
  const board = document.getElementById('pg-board');
  board.style.height = `${h}px`;

  const pts = n => [...Array(n + 1).keys()].map(i => { const p = pgCellXY(i); return `${p.x * 700},${p.y}`; }).join(' ');
  let html = `<svg class="pg-path" viewBox="0 0 700 ${h}" preserveAspectRatio="none" aria-hidden="true">
    <polyline class="pg-path-todo" points="${pts(PILGRIM_END)}" vector-effect="non-scaling-stroke"/>
    ${pos > 0 ? `<polyline class="pg-path-done" points="${pts(pos)}" vector-effect="non-scaling-stroke"/>` : ''}
  </svg>`;

  const stopAt = Object.fromEntries(PILGRIM_STOPS.map(st => [st.cell, st]));
  for (let cell = 0; cell <= PILGRIM_END; cell++) {
    const { x, y } = pgCellXY(cell);
    const st = stopAt[cell];
    const reached = cell <= pos;
    const style = `left:${x * 100}%;top:${y}px`;
    if (st) {
      const locked = st.gate && !s.cleared[st.id];
      html += `<button class="pg-stop${reached ? ' reached' : ''}${locked && reached ? ' gate' : ''}" style="${style}"
        onclick="pgTapStop('${st.id}')" title="${st.name}">
        <span class="pg-stop-icon">${st.icon}</span>
        ${locked ? `<span class="pg-stop-lock">${st.gate.boss ? '⚔️' : st.gate.type === 'choice' ? '❓' : '🧩'}</span>` : ''}
        <span class="pg-stop-name">${st.name}</span>
      </button>`;
    } else {
      html += `<span class="pg-dot${reached ? ' reached' : ''}" style="${style}"></span>`;
    }
  }
  const me = pgCellXY(pos);
  html += `<span class="pg-me" style="left:${me.x * 100}%;top:${me.y}px">${pgAvatar(s)}</span>`;
  board.innerHTML = html;

  // 순례자가 보이게 스크롤
  const wrap = document.getElementById('pg-board-wrap');
  wrap.scrollTop = Math.max(0, me.y - wrap.clientHeight / 2);
}

function pgTapStop(id) {
  const s = pgLoad();
  const st = PILGRIM_STOPS.find(x => x.id === id);
  if (st.cell > pgPos(s)) { showToast(`${st.icon} ${st.name} — 아직 도착하지 않았어요`, 'info', 2200); return; }
  pgStart(id);
}


// ═══════════════════════════════════════════
//  순례길 창 열고 닫기
// ═══════════════════════════════════════════
function openPilgrim() {
  const modal = document.getElementById('pilgrim-modal');
  const backdrop = document.getElementById('pilgrim-backdrop');
  pgShowView('map');
  modal.style.display = 'flex';
  backdrop.style.display = 'block';
  renderPilgrimMap();
  setTimeout(() => { modal.classList.add('active'); backdrop.classList.add('active'); renderPilgrimMap(); }, 10);
}

function closePilgrim() {
  if (!pilgrimOpen()) return;
  clearInterval(pzTimer);
  const modal = document.getElementById('pilgrim-modal');
  const backdrop = document.getElementById('pilgrim-backdrop');
  modal.classList.remove('active');
  backdrop.classList.remove('active');
  setTimeout(() => { modal.style.display = 'none'; backdrop.style.display = 'none'; }, 250);
}

function pilgrimOpen() {
  return document.getElementById('pilgrim-modal').style.display === 'flex';
}

function pgShowView(view) {
  ['map', 'scene', 'gate'].forEach(v => {
    document.getElementById(`pg-view-${v}`).style.display = v === view ? '' : 'none';
  });
  document.getElementById('pg-back').style.display = view === 'map' ? 'none' : '';
  document.querySelector('.pilgrim-body').scrollTop = 0;
}

function pgBackToMap() {
  clearInterval(pzTimer);
  pgShowView('map');
  renderPilgrimMap();
}


// ═══════════════════════════════════════════
//  장소 진행: 이야기 → 관문 → 뒷이야기 → 보상
// ═══════════════════════════════════════════
let pgScene = null;   // { stop, lines, i, onDone, doneLabel }

function pgStart(id) {
  const s = pgLoad();
  const st = PILGRIM_STOPS.find(x => x.id === id);
  const pos = pgPos(s);
  const atGate = st.gate && !s.cleared[st.id] && pos === st.cell;

  // 이미 본 관문 장소에 서 있으면 이야기를 건너뛰고 바로 관문
  if (atGate && s.seen[st.id]) { pgOpenGate(st); return; }

  const lines = s.cleared[st.id] && st.after ? [...st.scene, ...st.after] : st.scene;
  pgPlay(st, lines, atGate ? '⚔️ 관문으로' : '계속 ▶', () => {
    const now = pgLoad();
    const first = !now.seen[st.id];
    now.seen[st.id] = true;
    pgSave(now);
    if (atGate) pgOpenGate(st);
    else if (first && !st.gate) pgFinishStop(st);
    else pgBackToMap();
  });
}

function pgPlay(stop, lines, doneLabel, onDone) {
  pgScene = { stop, lines, i: 0, onDone, doneLabel };
  document.getElementById('pg-scene-place').innerHTML =
    `<span>${stop.icon}</span> ${stop.name}`;
  pgShowView('scene');
  pgShowLine();
}

function pgShowLine() {
  const { lines, i, stop, doneLabel } = pgScene;
  const [who, text] = lines[i];
  const last = i === lines.length - 1;
  const face = document.getElementById('pg-face');
  face.textContent = PILGRIM_CAST[who] ?? '🙂';
  face.classList.remove('pop');
  void face.offsetWidth;
  face.classList.add('pop');
  document.getElementById('pg-name').textContent = who;
  const line = document.getElementById('pg-line');
  line.textContent = text;
  line.classList.toggle('narration', !who);
  document.getElementById('pg-dots').textContent = `${i + 1} / ${lines.length}`;
  document.getElementById('pg-ref').innerHTML = last && stop.ref ? `📖 함께 읽기 <b>${stop.ref}</b>` : '';
  document.getElementById('pg-next').textContent = last ? doneLabel : '다음 ▶';
}

function pgNext() {
  if (!pgScene) return;
  if (pgScene.i < pgScene.lines.length - 1) { pgScene.i++; pgShowLine(); return; }
  const done = pgScene.onDone;
  pgScene = null;
  done();
}

// 관문을 넘거나 관문 없는 장소의 이야기를 처음 다 봤을 때: 보상 + 축하 + 지도로
function pgFinishStop(stop) {
  const s = pgLoad();
  const item = stop.reward && !s.items.includes(stop.reward) ? PILGRIM_ITEMS[stop.reward] : null;
  if (item) s.items.push(stop.reward);
  if (stop.id === 'celestial') s.finishedAt = todayKST();
  pgSave(s);

  pgBackToMap();
  renderPilgrim();
  if (stop.id === 'celestial') {
    pgCelebrate('👑 천국 성문 도착!', '멸망의 도시에서 하늘 도성까지 — 순례를 마쳤어요');
  } else if (stop.id === 'cross') {
    pgCelebrate('✝️ 짐이 벗겨졌어요!', '📜 족자를 받았어요 — 천국 성문에서 내밀어요');
  } else if (item) {
    pgCelebrate(`${item.icon} ${item.name} 획득!`, item.desc);
  } else if (stop.gate) {
    pgCelebrate(`${stop.icon} ${stop.name} 통과!`, '다시 길을 떠나요 👣');
  }
}

function pgGateCleared(stop) {
  const s = pgLoad();
  s.cleared[stop.id] = true;
  s.seen[stop.id] = true;
  pgSave(s);
  clearInterval(pzTimer);
  if (stop.after) pgPlay(stop, stop.after, '계속 ▶', () => pgFinishStop(stop));
  else pgFinishStop(stop);
}


// ═══════════════════════════════════════════
//  관문 — 선택 문제 / 말씀 퍼즐 (보스는 여러 판)
// ═══════════════════════════════════════════
let pgGate = null;   // { stop, round }

function pgOpenGate(stop) {
  pgGate = { stop, round: 0 };
  pgShowView('gate');
  const choice = document.getElementById('pg-choice');
  const puzzle = document.getElementById('pg-puzzle');
  choice.style.display = stop.gate.type === 'choice' ? '' : 'none';
  puzzle.style.display = stop.gate.type === 'puzzle' ? '' : 'none';
  if (stop.gate.type === 'choice') renderChoiceGate(stop);
  else pgStartRound();
}

function renderGateHead() {
  const { stop, round } = pgGate;
  const boss = stop.gate.boss;
  const total = stop.gate.rounds?.length || 1;
  document.getElementById('pg-gate-head').innerHTML = (boss
    ? `<span class="pg-boss" id="pg-boss">${boss.icon}</span>
       <b>${boss.name}</b>
       <span class="pg-hp">${[...Array(total)].map((_, i) => i < total - round ? '❤️' : '🤍').join('')}</span>`
    : `<span class="pg-gate-icon">${stop.icon}</span><b>${stop.name}</b>
       ${total > 1 ? `<small>${round + 1} / ${total}</small>` : ''}`)
    + (stop.gate.guide ? `<p class="pg-gate-guide">${stop.gate.guide}</p>` : '');
}

function renderChoiceGate(stop) {
  renderGateHead();
  const g = stop.gate;
  const box = document.getElementById('pg-choice');
  box.innerHTML = `<p class="pg-question">${g.question}</p>
    <div class="pg-options">${g.options.map((o, i) =>
      `<button class="pg-option" onclick="pgPick(${i}, this)">${o.label}</button>`).join('')}</div>
    <p class="pg-reply" id="pg-reply"></p>
    <div class="pg-actions"><button class="login-btn primary" id="pg-choice-next" style="display:none" onclick="pgGateCleared(pgGate.stop)">계속 ▶</button></div>`;
}

function pgPick(i, btn) {
  const o = pgGate.stop.gate.options[i];
  const reply = document.getElementById('pg-reply');
  reply.textContent = o.reply;
  reply.className = `pg-reply ${o.ok ? 'ok' : 'retry'}`;
  if (o.ok) {
    document.querySelectorAll('.pg-option').forEach(b => { b.disabled = true; });
    btn.classList.add('right');
    document.getElementById('pg-choice-next').style.display = '';
  } else {
    btn.disabled = true;
    btn.classList.add('wrong');
  }
}

function pgStartRound() {
  renderGateHead();
  const { stop, round } = pgGate;
  const mode = stop.gate.rounds[round];
  const verses = puzzleVerses();
  const keys = mode === 'key' ? loadBookmarks().filter(b => b.text && b.text.split(/\s+/).length >= 3) : [];
  const ok = keys.length || (mode === 'verses' ? verses.length >= 2 : verses.length);
  document.getElementById('pg-nopassage').style.display = ok ? 'none' : '';
  document.getElementById('pg-puzzle-area').style.display = ok ? '' : 'none';
  if (!ok) return;
  startPuzzle(mode, keys, stop.gate.guide);
}

// 퍼즐 한 판을 맞혔을 때
function pgRoundDone() {
  const { stop } = pgGate;
  pgGate.round++;
  const total = stop.gate.rounds.length;
  if (stop.gate.boss) {
    renderGateHead();   // 하트 하나 줄이고, 새로 그린 보스가 흔들림
    document.getElementById('pg-boss').classList.add('hit');
  }
  setTimeout(() => {
    if (!pgGate || pgGate.stop !== stop) return;
    if (pgGate.round < total) {
      showToast(stop.gate.boss ? `💥 명중! ${stop.gate.boss.name}이(가) 휘청거려요 — 한 번 더!` : '좋아요! 한 번 더!', 'success', 2200);
      pgStartRound();
    } else {
      pgGateCleared(stop);
    }
  }, 1400);
}


// ═══════════════════════════════════════════
//  🧩 말씀 퍼즐 (관문용) — 그날 본문으로 하는 탭 퍼즐
//  words  : 한 절을 어절 조각으로 섞어 순서대로 누르기 (고른 절이 있으면 그 절)
//  verses : 이어지는 5절을 섞어 순서대로 누르기
//  key    : 내 책갈피 구절 하나로 조각 맞추기 (의혹의 성 — 언약 열쇠)
//  누를 때마다 바로 채점 — 틀리면 흔들림, 💡 힌트는 다음 조각을 깜빡여 줌
// ═══════════════════════════════════════════
const PZ_MAX_PIECES = 12;   // 긴 절은 어절을 묶어 조각 수를 이 정도로
const PZ_VERSE_RUN = 5;     // 순서 맞추기에서 섞을 절 수

let pzMode = 'words';
let pzKeys = [];
let pzGuide = '';
let pz = null;              // 진행 중인 문제
let pzTimer = null;
let pzLastVerse = null;     // 같은 절이 연달아 나오지 않게

function puzzleVerses() {
  return [...document.querySelectorAll('#bonmun-body .verse-line')].map(el => ({
    num: Number(el.dataset.verseNum),
    text: el.querySelector('.verse-text').textContent.trim(),
  }));
}

function shuffleIds(n) {
  const ids = [...Array(n).keys()];
  for (let tries = 0; tries < 10; tries++) {
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    if (n < 2 || ids.some((id, i) => id !== i)) break;  // 정답 순서 그대로면 다시 섞음
  }
  return ids;
}

function splitPieces(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const size = Math.ceil(words.length / PZ_MAX_PIECES);
  const pieces = [];
  for (let i = 0; i < words.length; i += size) pieces.push(words.slice(i, i + size).join(' '));
  return pieces;
}

function makeWordsPuzzle(verses) {
  const picked = [...selectedVerses].map(el => Number(el.dataset.verseNum));
  let verse = picked.length ? verses.find(v => v.num === Math.min(...picked)) : null;
  if (!verse) {
    let pool = verses.filter(v => v.text.split(/\s+/).length >= 4 && v.num !== pzLastVerse);
    if (!pool.length) pool = verses;
    verse = pool[Math.floor(Math.random() * pool.length)];
  }
  pzLastVerse = verse.num;
  const b = currentBookInfo;
  return {
    ref: b ? `${b.book} ${b.chapter}:${verse.num}` : `${verse.num}절`,
    guide: '말씀 조각을 순서대로 눌러 한 절을 완성하세요',
    pieces: splitPieces(verse.text),
    labels: null,
  };
}

function makeVersesPuzzle(verses) {
  const n = Math.min(PZ_VERSE_RUN, verses.length);
  const start = Math.floor(Math.random() * (verses.length - n + 1));
  const run = verses.slice(start, start + n);
  const b = currentBookInfo;
  const range = `${run[0].num}-${run[run.length - 1].num}`;
  return {
    ref: b ? `${b.book} ${b.chapter}:${range}` : `${range}절`,
    guide: '말씀이 이어지는 순서대로 절을 누르세요',
    pieces: run.map(v => v.text),
    labels: run.map(v => v.num),   // 맞힌 뒤에 절 번호를 보여줌
  };
}

function makeKeyPuzzle(keys) {
  let pool = keys.filter(k => `${k.date}:${k.verse}` !== pzLastVerse);
  if (!pool.length) pool = keys;
  const k = pool[Math.floor(Math.random() * pool.length)];
  pzLastVerse = `${k.date}:${k.verse}`;
  return {
    ref: `🔑 ${k.book} ${k.chapter}:${k.verse}`,
    guide: '내 책갈피 말씀이 언약 열쇠가 돼요 — 조각을 순서대로 맞춰 문을 열어요',
    pieces: splitPieces(k.text),
    labels: null,
  };
}

function startPuzzle(mode = pzMode, keys = pzKeys, guide = pzGuide) {
  clearInterval(pzTimer);
  pzMode = mode; pzKeys = keys; pzGuide = guide;
  const verses = puzzleVerses();

  let p;
  if (mode === 'key' && keys.length) p = makeKeyPuzzle(keys);
  else if (mode === 'verses' && verses.length >= 2) p = makeVersesPuzzle(verses);
  else {
    p = makeWordsPuzzle(verses);
    if (mode === 'key') p.guide = '책갈피가 없어서 오늘 말씀으로 열쇠를 만들어요 — 🔖 책갈피를 모으면 그 말씀이 열쇠가 돼요';
  }
  clearVerseSelection();
  pz = { ...p, pool: shuffleIds(p.pieces.length), placed: [], mistakes: 0, hints: 0, start: Date.now(), done: false };

  document.getElementById('pz-ref').textContent = p.ref;
  const guideEl = document.getElementById('pz-guide');
  guideEl.textContent = p.guide;
  guideEl.classList.remove('done');
  document.getElementById('pz-hint').disabled = false;
  document.getElementById('pz-shuffle').disabled = false;
  renderPuzzle();
  pzTimer = setInterval(renderPuzzleStatus, 1000);
}

function puzzlePieceEl(id, placed) {
  const btn = document.createElement('button');
  btn.className = 'pz-piece' + (pz.labels ? ' pz-verse' : '') + (placed ? ' placed' : '');
  if (placed && pz.labels) {
    const num = document.createElement('span');
    num.className = 'pz-num';
    num.textContent = pz.labels[id];
    btn.appendChild(num);
  }
  btn.appendChild(document.createTextNode(pz.pieces[id]));
  if (!placed) btn.onclick = () => pickPuzzlePiece(id, btn);
  else btn.disabled = true;
  return btn;
}

function renderPuzzle() {
  const answer = document.getElementById('pz-answer');
  const pool = document.getElementById('pz-pool');
  answer.innerHTML = '';
  pool.innerHTML = '';
  pz.placed.forEach(id => answer.appendChild(puzzlePieceEl(id, true)));
  if (!pz.placed.length) {
    const hint = document.createElement('span');
    hint.className = 'pz-empty';
    hint.textContent = '여기에 순서대로 놓여요';
    answer.appendChild(hint);
  }
  pz.pool.forEach(id => pool.appendChild(puzzlePieceEl(id, false)));
  renderPuzzleStatus();
}

function renderPuzzleStatus() {
  if (!pz) return;
  const sec = Math.floor(((pz.doneAt || Date.now()) - pz.start) / 1000);
  const time = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  document.getElementById('pz-status').textContent = `⏱ ${time} · ❌ ${pz.mistakes} · 💡 ${pz.hints}`;
}

function pickPuzzlePiece(id, btn) {
  if (pz.done) return;
  const expected = pz.pieces[pz.placed.length];
  // 같은 낱말이 두 번 나오는 절도 있으니 위치(id)가 아니라 글자로 비교
  if (pz.pieces[id] !== expected) {
    pz.mistakes++;
    btn.classList.remove('wrong');
    void btn.offsetWidth;
    btn.classList.add('wrong');
    renderPuzzleStatus();
    return;
  }
  // 글자가 같은 조각이 여럿이면 정답 순서의 조각으로 놓기 (절 번호 표시가 맞도록)
  const correctId = pz.placed.length;
  const takeId = pz.pool.includes(correctId) && pz.pieces[correctId] === pz.pieces[id] ? correctId : id;
  pz.pool = pz.pool.filter(x => x !== takeId);
  pz.placed.push(takeId);
  renderPuzzle();
  if (!pz.pool.length) finishPuzzle();
}

function puzzleHint() {
  if (!pz || pz.done) return;
  const expected = pz.pieces[pz.placed.length];
  const idx = pz.pool.findIndex(id => pz.pieces[id] === expected);
  const el = document.getElementById('pz-pool').children[idx];
  if (!el) return;
  pz.hints++;
  el.classList.remove('hint');
  void el.offsetWidth;
  el.classList.add('hint');
  renderPuzzleStatus();
}

function finishPuzzle() {
  pz.done = true;
  pz.doneAt = Date.now();
  clearInterval(pzTimer);
  renderPuzzleStatus();
  document.getElementById('pz-hint').disabled = true;
  document.getElementById('pz-shuffle').disabled = true;

  const perfect = !pz.mistakes && !pz.hints ? ' 완벽해요!' : '';
  const guide = document.getElementById('pz-guide');
  guide.textContent = `🎉 정답!${perfect}`;
  guide.classList.add('done');
  puzzleCelebrate();
  pgRoundDone();
}

// 계절 아이콘(🌼 🐬 🍂 ☃️)이 퐁퐁 떠오름
function puzzleCelebrate() {
  const box = document.getElementById('pilgrim-modal');
  for (let i = 0; i < 14; i++) {
    const s = document.createElement('span');
    s.className = 'pz-pop';
    s.style.left = `${5 + Math.random() * 90}%`;
    s.style.animationDelay = `${Math.random() * 0.4}s`;
    s.style.fontSize = `${1 + Math.random() * 1.1}rem`;
    box.appendChild(s);
    setTimeout(() => s.remove(), 2200);
  }
}


// ═══════════════════════════════════════════
//  축하 · 완주 · 다시 순례하기
// ═══════════════════════════════════════════
// 화면 가득 계절 아이콘 + 축하 카드 (3.6초 뒤 저절로 사라짐, 누르면 바로 닫힘)
function pgCelebrate(title, sub) {
  const layer = document.createElement('div');
  layer.className = 'celebrate';
  const card = document.createElement('div');
  card.className = 'celebrate-card';
  card.innerHTML = '<div class="celebrate-title"></div><div class="celebrate-sub"></div>';
  card.children[0].textContent = title;
  card.children[1].textContent = sub;
  layer.appendChild(card);
  for (let i = 0; i < 28; i++) {
    const s = document.createElement('span');
    s.className = 'celebrate-pop';
    s.style.left = `${Math.random() * 100}%`;
    s.style.animationDelay = `${Math.random() * 0.9}s`;
    s.style.fontSize = `${1.2 + Math.random() * 1.6}rem`;
    layer.appendChild(s);
  }
  const close = () => { layer.classList.add('out'); setTimeout(() => layer.remove(), 400); };
  layer.addEventListener('click', close);
  document.body.appendChild(layer);
  setTimeout(close, 3600);
}

async function pgShareFinish() {
  const s = pgLoad();
  const text = [
    '🗺️ 매일성경 천로역정 순례길을 완주했어요!',
    `멸망의 도시에서 천국 성문까지 — 👣 ${s.steps}걸음${s.round > 1 ? ` · ${s.round}회차` : ''}`,
    '',
    `👉 ${location.origin}/`,
  ].join('\n');
  if (navigator.share) {
    try { await navigator.share({ text }); pilgrimEarn('share'); }
    catch (e) { if (e.name !== 'AbortError') showToast('공유 실패: ' + e.message, 'error'); }
    return;
  }
  await writeClipboard(text);
  showToast('🔗 완주 소식을 복사했어요 — 붙여넣어 보내세요', 'success');
  pilgrimEarn('share');
}

function pgRestart() {
  if (!confirm('처음부터 다시 순례할까요? (오늘 얻은 걸음 기록은 그대로예요)')) return;
  const s = pgLoad();
  const next = { ...pgDefault(), round: s.round + 1, days: s.days, startedAt: todayKST() };
  pgSave(next);
  renderPilgrim();
  renderPilgrimMap();
  showToast('🎒 새 순례를 시작해요! 멸망의 도시에서 출발', 'success');
}

window.addEventListener('DOMContentLoaded', renderPilgrim);
