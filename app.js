/* ────────────────────────────────────────────
   매일성경 — Vercel + Supabase 버전
   데이터는 /api/entries, /api/entry (암호 쿠키 필요) 에서 로드
   ──────────────────────────────────────────── */

// ── 전역 상태 ────────────────────────────────
let currentVersion = 'main';          // 'main' | 'soon'
let currentDate    = null;
let currentTab     = 'bonmun';

// 캘린더 상태 (KST 기준)
const _kstNow = new Date(Date.now() + 9 * 3600 * 1000);
let calYear  = _kstNow.getUTCFullYear();
let calMonth = _kstNow.getUTCMonth();
const entrySet = new Set();

// 사이드바 / 뷰 상태
let currentView      = 'list';
let sidebarCollapsed = false;


// ═══════════════════════════════════════════
//  버전 전환 (매일성경 ↔ 매일성경 순)
// ═══════════════════════════════════════════
async function switchVersion(ver) {
  if (currentVersion === ver) return;
  currentVersion = ver;
  currentDate = null;

  document.getElementById('version-btn-main')?.classList.toggle('active', ver === 'main');
  document.getElementById('version-btn-soon')?.classList.toggle('active', ver === 'soon');

  clearPanels();
  document.getElementById('content-meta').textContent = '날짜를 선택하세요';
  await loadEntries();
}



// ═══════════════════════════════════════════
//  초기화
// ═══════════════════════════════════════════
// 공유 링크(?date=YYYY-MM-DD&v=soon)로 들어오면 그 날짜를 먼저 연다
let pendingDate = null;

window.addEventListener('DOMContentLoaded', async () => {
  marked.setOptions({ gfm: true, breaks: true });

  initTheme();
  restoreUI();

  const params = new URLSearchParams(location.search);
  if (params.get('v') === 'soon') {
    currentVersion = 'soon';
    document.getElementById('version-btn-main')?.classList.remove('active');
    document.getElementById('version-btn-soon')?.classList.add('active');
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(params.get('date') || '')) pendingDate = params.get('date');
  if (params.has('date') || params.has('v')) history.replaceState(null, '', location.pathname);

  if (isMobile()) document.getElementById('btn-godpeople').style.display = '';
  document.addEventListener('selectionchange', onSelectionChange);

  await loadEntries();
});


// ═══════════════════════════════════════════
//  테마
// ═══════════════════════════════════════════
function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  applyTheme(saved, false);
}

function setTheme(theme) {
  localStorage.setItem('theme', theme);
  applyTheme(theme, true);
}

function applyTheme(theme, animate) {
  const html = document.documentElement;
  if (!animate) html.style.transition = 'none';

  if (theme === 'system') {
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    html.setAttribute('data-theme', dark ? 'dark' : 'light');
  } else {
    html.setAttribute('data-theme', theme);
  }

  if (!animate) { void html.offsetHeight; html.style.transition = ''; }

  ['dark','light','system'].forEach(t =>
    document.getElementById(`theme-btn-${t}`)?.classList.toggle('active', t === theme)
  );
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (localStorage.getItem('theme') === 'system') applyTheme('system', true);
});


// ═══════════════════════════════════════════
//  사이드바 토글
// ═══════════════════════════════════════════
function toggleSidebar() {
  sidebarCollapsed = !sidebarCollapsed;
  document.getElementById('sidebar').classList.toggle('collapsed', sidebarCollapsed);
  document.getElementById('sidebar-toggle-btn').classList.toggle('sidebar-collapsed', sidebarCollapsed);
  localStorage.setItem('sidebarCollapsed', sidebarCollapsed ? '1' : '0');
  
  // 모바일 백드롭 처리
  const backdrop = document.getElementById('sidebar-backdrop');
  if (backdrop && window.innerWidth <= 768) {
    if (!sidebarCollapsed) {
      backdrop.style.display = 'block';
      setTimeout(() => backdrop.classList.add('active'), 10);
    } else {
      backdrop.classList.remove('active');
      setTimeout(() => {
        if (sidebarCollapsed) backdrop.style.display = 'none';
      }, 280);
    }
  }
}

function restoreUI() {
  const isMobile = window.innerWidth <= 768;
  const savedState = localStorage.getItem('sidebarCollapsed');
  
  // 사용자가 이전에 닫아둔 경우, 또는 첫 접근(기본값)인 경우
  if (savedState === '1' || savedState === null) {
    sidebarCollapsed = true;
    document.getElementById('sidebar').classList.add('collapsed');
    document.getElementById('sidebar-toggle-btn').classList.add('sidebar-collapsed');
  } else {
    sidebarCollapsed = false;
  }
  
  // 초기 모바일 백드롭 렌더링
  if (isMobile && !sidebarCollapsed) {
    const backdrop = document.getElementById('sidebar-backdrop');
    if (backdrop) {
      backdrop.style.display = 'block';
      backdrop.classList.add('active');
    }
  }

  const savedView = localStorage.getItem('sidebarView') || 'list';
  if (savedView === 'calendar') switchView('calendar', false);
}

// 윈도우 리사이즈 시 백드롭 정리
window.addEventListener('resize', () => {
  const backdrop = document.getElementById('sidebar-backdrop');
  if (window.innerWidth > 768 && backdrop) {
    backdrop.style.display = 'none';
    backdrop.classList.remove('active');
  } else if (window.innerWidth <= 768 && !sidebarCollapsed && backdrop) {
    backdrop.style.display = 'block';
    backdrop.classList.add('active');
  }
});


// ═══════════════════════════════════════════
//  뷰 전환
// ═══════════════════════════════════════════
function switchView(view, save = true) {
  currentView = view;
  if (save) localStorage.setItem('sidebarView', view);

  const listEl  = document.getElementById('view-list');
  const calEl   = document.getElementById('view-calendar');
  const btnList = document.getElementById('view-btn-list');
  const btnCal  = document.getElementById('view-btn-calendar');

  if (view === 'list') {
    listEl.style.display = 'flex'; calEl.style.display = 'none';
    btnList.classList.add('active'); btnCal.classList.remove('active');
  } else {
    listEl.style.display = 'none'; calEl.style.display = 'flex';
    btnList.classList.remove('active'); btnCal.classList.add('active');
    renderCalendar(calYear, calMonth);
  }
}


// ═══════════════════════════════════════════
//  데이터 로드
// ═══════════════════════════════════════════
async function loadEntries() {
  try {
    const { dates: entries } = await apiFetch(`/api/entries?track=${currentVersion}`);

    entrySet.clear();
    entries.forEach(d => entrySet.add(d));

    renderSidebar(entries);

    // 공유 링크 날짜 → 없으면 최신(= 오늘, 서버가 오늘 이후는 내려주지 않음)
    if (entries.length > 0) {
      const target = pendingDate && entrySet.has(pendingDate) ? pendingDate : entries[0];
      pendingDate = null;
      await selectDate(target);
    } else {
      clearPanels();
    }

    // 마지막 업데이트 시각 표시
    if (entries.length > 0) {
      const nextEl = document.getElementById('next-run-label');
      if (nextEl) nextEl.textContent = `최종 업데이트: ${entries[0]}`;
    }

  } catch (e) {
    if (e instanceof AuthRequired) return;
    showToast('데이터 로드 실패: ' + e.message, 'error');
    console.error(e);
  }
}


// ═══════════════════════════════════════════
//  사이드바 목록 렌더링
// ═══════════════════════════════════════════
function renderSidebar(entries) {
  const list = document.getElementById('date-list');

  if (entries.length === 0) {
    list.innerHTML = `<li class="date-item loading-placeholder">데이터가 없습니다</li>`;
    return;
  }

  const today     = todayKST();
  const yesterday = offsetDate(today, -1);

  list.innerHTML = entries.map(dateStr => {
    let sub = formatDateKo(dateStr);
    if (dateStr === today)          sub = '오늘';
    else if (dateStr === yesterday) sub = '어제';

    return `
      <li class="date-item" id="item-${dateStr}" onclick="selectDate('${dateStr}')">
        <span class="date-item-label">${dateStr}</span>
        <span class="date-item-sub">${sub}</span>
      </li>`;
  }).join('');

  if (currentView === 'calendar') renderCalendar(calYear, calMonth);
}


// ═══════════════════════════════════════════
//  날짜 선택
// ═══════════════════════════════════════════
async function selectDate(dateStr) {
  if (currentDate === dateStr) return;

  document.getElementById(`item-${currentDate}`)?.classList.remove('active');
  const cur = document.getElementById(`item-${dateStr}`);
  if (cur) { cur.classList.add('active'); cur.scrollIntoView({ block: 'nearest' }); }

  currentDate = dateStr;
  clearPanels();
  clearVerseSelection();
  hideHighlightBar();
  document.getElementById('content-meta').textContent = formatDateKo(dateStr);
  loadMemo(dateStr);
  loadComments(dateStr);

  // 모바일에서는 날짜 선택 시 가로 렌더링 최적화를 위해 사이드바 자동 닫기
  if (window.innerWidth <= 768 && !sidebarCollapsed) {
    toggleSidebar();
  }

  if (currentView === 'calendar') renderCalendar(calYear, calMonth);

  try {
    const data = await apiFetch(`/api/entry?track=${currentVersion}&date=${dateStr}`, { cache: 'no-cache' });
    if (currentDate !== dateStr) return;  // 그사이 다른 날짜를 눌렀으면 버림
    parseAndRender(data.content);
    applyHighlights();
    setAudio(data.mediaUrl, data.speaker);
    document.getElementById('passage-actions').style.display = currentBookInfo ? '' : 'none';
  } catch (e) {
    if (e instanceof AuthRequired) return;
    showToast('콘텐츠 로드 실패: ' + e.message, 'error');
  }
}



// ═══════════════════════════════════════════
//  마크다운 파싱
// ═══════════════════════════════════════════
let currentBookInfo = null;  // { book: '사사기', chapter: '13' }

function parseAndRender(raw) {
  const sections = raw.split(/\n---\n/);
  let bonmunMd = '', haeseolMd = '';

  sections.forEach(sec => {
    const t = sec.trim();
    if (/^##\s*(📖\s*)?본문/.test(t))  bonmunMd  = t;
    if (/^##\s*(📝\s*)?해설/.test(t))  haeseolMd = t;
  });

  if (!bonmunMd  && sections.length >= 2) bonmunMd  = sections[1].trim();
  if (!haeseolMd && sections.length >= 3) haeseolMd = sections[2].trim();

  // 본문 헤더에서 책 이름 · 장 · 절 정보 추출
  currentBookInfo = extractBookInfo(bonmunMd);

  renderPanel('bonmun',  bonmunMd);
  renderPanel('haeseol', haeseolMd);
}

function extractBookInfo(md) {
  // 제목 추출: **제목** 패턴 (## 본문 다음 줄)
  const titleMatch = md.match(/\*\*([^*]+)\*\*/);
  const title = titleMatch ? titleMatch[1].trim() : '';

  // 패턴: 사사기(Judges)13:15 - 13:25  또는  창세기(Genesis)1:1 - 1:31
  const m = md.match(/([가-힣]+(?:\s[가-힣]+)*)\([^)]+\)(\d+):(\d+)\s*-\s*\d*:?(\d+)/);
  if (m) return { book: m[1], chapter: m[2], verseStart: m[3], verseEnd: m[4], title };
  // 영문 없는 경우 폴백
  const m2 = md.match(/본문\s*:\s*([가-힣]+(?:\s[가-힣]+)*)\s*(\d+):(\d+)\s*-\s*\d*:?(\d+)/);
  if (m2) return { book: m2[1], chapter: m2[2], verseStart: m2[3], verseEnd: m2[4], title };
  return null;
}

function renderPanel(tab, md) {
  const empty = document.getElementById(`empty-${tab}`);
  const body  = document.getElementById(`${tab}-body`);
  if (!md) { empty.style.display = 'flex'; body.innerHTML = ''; return; }
  empty.style.display = 'none';
  body.innerHTML = marked.parse(md);

  // <ol><li> → 커스텀 절 요소로 변환 (정확한 절 번호 표시)
  convertOlToVerseElements(body);
}

// ═══════════════════════════════════════════
//  절 번호 변환 + 클릭 복사 기능
// ═══════════════════════════════════════════
const selectedVerses = new Set();

function convertOlToVerseElements(container) {
  const olElements = container.querySelectorAll('ol');
  olElements.forEach(ol => {
    const startNum = parseInt(ol.getAttribute('start') || '1', 10);
    const lis = [...ol.querySelectorAll(':scope > li')];
    const wrapper = document.createElement('div');
    wrapper.className = 'verse-group';

    lis.forEach((li, idx) => {
      const verseNum = startNum + idx;
      const div = document.createElement('div');
      div.className = 'verse-line';
      div.dataset.verseNum = verseNum;
      div.innerHTML = `<span class="verse-num">${verseNum}</span><span class="verse-text">${li.innerHTML}</span>`;
      div.addEventListener('click', () => toggleVerseSelection(div));
      wrapper.appendChild(div);
    });

    ol.replaceWith(wrapper);
  });
}

// ── 절 선택 토글 ──
function toggleVerseSelection(el) {
  if (selectedVerses.has(el)) {
    selectedVerses.delete(el);
    el.classList.remove('verse-selected');
  } else {
    selectedVerses.add(el);
    el.classList.add('verse-selected');
  }
  updateCopyBar();
}

// ── 플로팅 복사 바 ──
function updateCopyBar() {
  let bar = document.getElementById('verse-copy-bar');

  if (selectedVerses.size === 0) {
    if (bar) bar.classList.remove('active');
    return;
  }

  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'verse-copy-bar';
    bar.innerHTML = `
      <span class="vcb-info"></span>
      <div class="vcb-actions">
        <button class="vcb-btn vcb-hl" onclick="highlightSelectedVerses()" title="형광펜">🖍</button>
        <button class="vcb-btn" onclick="copySelectedVerses()">📋 복사</button>
        <button class="vcb-btn vcb-cancel" onclick="clearVerseSelection()">✕</button>
      </div>`;
    document.body.appendChild(bar);
  }

  const nums = [...selectedVerses]
    .map(el => parseInt(el.dataset.verseNum))
    .sort((a, b) => a - b);

  const rangeLabel = buildRangeLabel(nums);
  bar.querySelector('.vcb-info').textContent = `✝ ${rangeLabel} 선택됨`;
  bar.classList.add('active');
}

// ── 범위 레이블 생성 (15-18절 / 15,17절 등) ──
function buildRangeLabel(nums) {
  if (nums.length === 1) return `${nums[0]}절`;
  // 연속 범위인지 확인
  const isContiguous = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);
  if (isContiguous) return `${nums[0]}-${nums[nums.length - 1]}절`;
  return nums.join(', ') + '절';
}

// ── 복사 머리글 생성 (날짜 + 제목 + 성경 레퍼런스) ──
function buildCopyHeader(nums) {
  const lines = [];

  // 1행: 날짜 + 제목  →  9/29 (화) "내 이름은 기묘자라"
  if (currentDate) {
    const d = new Date(currentDate + 'T00:00:00Z');
    const days = ['일','월','화','수','목','금','토'];
    const datePart = `${d.getUTCMonth() + 1}/${d.getUTCDate()} (${days[d.getUTCDay()]})`;
    const titlePart = currentBookInfo?.title ? ` "${currentBookInfo.title}"` : '';
    lines.push(datePart + titlePart);
  }

  // 2행: [사사기 13:15-16]
  if (currentBookInfo) {
    const { book, chapter } = currentBookInfo;
    let ref;
    if (nums.length === 1) {
      ref = `${chapter}:${nums[0]}`;
    } else {
      const isContiguous = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1);
      ref = isContiguous
        ? `${chapter}:${nums[0]}-${nums[nums.length - 1]}`
        : `${chapter}:${nums.join(',')}`;
    }
    lines.push(`[${book} ${ref}]`);
  }

  return lines.join('\n');
}

// ── 선택 절 복사 ──
async function copySelectedVerses() {
  const sorted = [...selectedVerses]
    .sort((a, b) => a.dataset.verseNum - b.dataset.verseNum);

  const nums = sorted.map(el => parseInt(el.dataset.verseNum));
  const header = buildCopyHeader(nums);

  const body = sorted
    .map(el => `${el.dataset.verseNum}. ${el.querySelector('.verse-text').textContent.trim()}`)
    .join('\n');

  const text = header ? `${header}\n${body}` : body;
  await writeClipboard(text);

  // 복사 피드백
  sorted.forEach(el => {
    el.classList.add('verse-copied');
    setTimeout(() => el.classList.remove('verse-copied'), 600);
  });

  const rangeLabel = buildRangeLabel(nums);
  showToast(`📋 ${rangeLabel} 복사됨`, 'success', 2200);
  clearVerseSelection();
}

// ── 선택 초기화 ──
function clearVerseSelection() {
  selectedVerses.forEach(el => el.classList.remove('verse-selected'));
  selectedVerses.clear();
  const bar = document.getElementById('verse-copy-bar');
  if (bar) bar.classList.remove('active');
}

// ── 클립보드 쓰기 ──
async function writeClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

function clearPanels() {
  document.getElementById('passage-actions').style.display = 'none';
  setAudio(null, null);
  ['bonmun','haeseol'].forEach(t => {
    document.getElementById(`empty-${t}`).style.display = 'flex';
    document.getElementById(`${t}-body`).innerHTML = '';
  });
}


// ═══════════════════════════════════════════
//  탭 전환
// ═══════════════════════════════════════════
function switchTab(tab) {
  currentTab = tab;
  if (tab !== 'haeseol') hideHighlightBar();
  if (tab !== 'bonmun') clearVerseSelection();
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById(`tab-${tab}`).classList.add('active');
  document.getElementById(`panel-${tab}`).classList.add('active');
}


// ═══════════════════════════════════════════
//  캘린더
// ═══════════════════════════════════════════
function renderCalendar(year, month) {
  calYear  = year;
  calMonth = month;

  document.getElementById('cal-title').textContent = `${year}년 ${month + 1}월`;

  const grid     = document.getElementById('cal-grid');
  const dayNames = ['일','월','화','수','목','금','토'];
  const today    = todayKST();
  const firstDay = new Date(year, month, 1).getDay();
  const lastDate = new Date(year, month + 1, 0).getDate();

  let html = dayNames.map(d => `<div class="cal-day-header">${d}</div>`).join('');
  for (let i = 0; i < firstDay; i++) html += `<div class="cal-cell empty"></div>`;

  for (let d = 1; d <= lastDate; d++) {
    const mm      = String(month + 1).padStart(2, '0');
    const dd      = String(d).padStart(2, '0');
    const dateStr = `${year}-${mm}-${dd}`;
    const has     = entrySet.has(dateStr);
    const isToday = dateStr === today;
    const isSel   = dateStr === currentDate;

    let cls = 'cal-cell' + (has ? ' has-data' : ' no-data') +
              (isToday ? ' today' : '') + (isSel ? ' selected' : '');
    const click = has ? `onclick="selectDate('${dateStr}')"` : '';
    html += `<div class="${cls}" ${click}>${d}</div>`;
  }

  grid.innerHTML = html;
}

function goToToday() {
  const today = todayKST();
  const [y, m] = today.split('-').map(Number);
  calYear = y;
  calMonth = m - 1;
  if (currentView === 'calendar') renderCalendar(calYear, calMonth);

  if (currentDate === today) return;
  if (!entrySet.has(today)) {
    showToast('오늘 데이터가 아직 없습니다.', 'info');
    return;
  }
  selectDate(today);
}

async function refreshData() {
  const btn = document.getElementById('btn-refresh');
  if (btn.classList.contains('spinning')) return;
  btn.classList.add('spinning');
  showRefreshStatus('빠진 날짜 확인 및 스크랩 중...');

  try {
    const result = await apiFetch('/api/scrape', { method: 'POST' }, true);
    if (!result.ok) {
      showToast('❌ 스크랩 실패: ' + (result.error || ''), 'error', 6000);
    } else if (result.scraped.length === 0) {
      showToast('✅ 빠진 날짜 없음 — 최신 상태', 'success');
    } else {
      const days = new Set(result.scraped.map(k => k.split(':')[0]));
      showToast(`✅ ${days.size}일치 새로 스크랩됨`, 'success');
    }
    const keep = currentDate;
    currentDate = null;
    await loadEntries();
    if (keep && entrySet.has(keep)) await selectDate(keep);
  } catch (e) {
    if (!(e instanceof AuthRequired)) showToast('새로고침 실패: ' + e.message, 'error');
  } finally {
    btn.classList.remove('spinning');
    hideRefreshStatus();
  }
}

// ── 새로고침 진행 상태 표시 ──
function showRefreshStatus(msg) {
  const el = document.getElementById('refresh-status');
  if (!el) return;
  if (msg) { el.textContent = msg; el.style.display = 'block'; }
}
function hideRefreshStatus() {
  const el = document.getElementById('refresh-status');
  if (el) { el.style.display = 'none'; el.textContent = ''; }
}


// ═══════════════════════════════════════════
//  암호 입력
// ═══════════════════════════════════════════
class AuthRequired extends Error {}

function showLogin() {
  const modal = document.getElementById('login-modal');
  const backdrop = document.getElementById('login-modal-backdrop');
  if (modal.style.display === 'flex') return;
  modal.style.display = 'flex';
  backdrop.style.display = 'block';
  setTimeout(() => {
    modal.classList.add('active');
    backdrop.classList.add('active');
    document.getElementById('login-password').focus();
  }, 10);
}

function hideLogin() {
  const modal = document.getElementById('login-modal');
  const backdrop = document.getElementById('login-modal-backdrop');
  modal.classList.remove('active');
  backdrop.classList.remove('active');
  setTimeout(() => { modal.style.display = 'none'; backdrop.style.display = 'none'; }, 250);
}

async function submitLogin(event) {
  event.preventDefault();
  const input = document.getElementById('login-password');
  const errEl = document.getElementById('login-error');
  const btn = document.getElementById('login-submit');
  btn.disabled = true;
  errEl.textContent = '';
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: input.value }),
    });
    if (!res.ok) {
      errEl.textContent = res.status === 401 ? '암호가 올바르지 않습니다' : `오류 (${res.status})`;
      input.select();
      return;
    }
    input.value = '';
    hideLogin();
    currentDate = null;
    await loadEntries();
  } catch (e) {
    errEl.textContent = '연결 실패: ' + e.message;
  } finally {
    btn.disabled = false;
  }
}

function calPrev() {
  calMonth--;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  renderCalendar(calYear, calMonth);
}

function calNext() {
  calMonth++;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  renderCalendar(calYear, calMonth);
}


// ═══════════════════════════════════════════
//  형광펜 (노란색) — 이 브라우저에만 저장
//  본문: 절을 탭해 선택 → 하단 바 🖍 / 해설: 글자를 드래그 → 하단 바 🖍
// ═══════════════════════════════════════════
const hlKey = () => `hl:${currentVersion}:${currentDate}`;

function loadHl() {
  try { return JSON.parse(localStorage.getItem(hlKey())) || { v: [], r: [] }; }
  catch { return { v: [], r: [] }; }
}

function saveHl(hl) {
  try {
    if (!hl.v.length && !hl.r.length) localStorage.removeItem(hlKey());
    else localStorage.setItem(hlKey(), JSON.stringify(hl));
  } catch { showToast('브라우저 저장소를 쓸 수 없습니다', 'error'); }
}

function applyHighlights() {
  const hl = loadHl();
  document.querySelectorAll('#bonmun-body .verse-line').forEach(el =>
    el.classList.toggle('verse-hl', hl.v.includes(Number(el.dataset.verseNum)))
  );
  const body = document.getElementById('haeseol-body');
  body.querySelectorAll('mark.hl').forEach(m => m.replaceWith(...m.childNodes));
  body.normalize();
  hl.r.forEach((range, idx) => wrapRange(body, range, idx));
}

function textNodes(container) {
  const nodes = [];
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  for (let pos = 0, n; (n = walker.nextNode()); pos += n.data.length) nodes.push({ n, start: pos });
  return nodes;
}

// 컨테이너 textContent 기준 [시작, 끝) 범위를 <mark class="hl"> 로 감싼다
function wrapRange(container, [rs, re], idx) {
  for (const { n, start } of textNodes(container)) {
    const a = Math.max(rs, start) - start;
    const b = Math.min(re, start + n.data.length) - start;
    if (a >= b) continue;
    let target = n;
    if (b < target.data.length) target.splitText(b);
    if (a > 0) target = target.splitText(a);
    const mark = document.createElement('mark');
    mark.className = 'hl';
    mark.dataset.r = idx;
    target.replaceWith(mark);
    mark.appendChild(target);
  }
}

function textOffset(container, node, offset) {
  const r = document.createRange();
  r.selectNodeContents(container);
  r.setEnd(node, offset);
  return r.toString().length;
}

function mergeRanges(ranges) {
  const sorted = ranges.slice().sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const [s, e] of sorted) {
    if (out.length && s <= out[out.length - 1][1]) out[out.length - 1][1] = Math.max(out[out.length - 1][1], e);
    else out.push([s, e]);
  }
  return out;
}

// ── 본문: 선택한 절 칠하기 / 이미 다 칠해져 있으면 지우기 ──
function highlightSelectedVerses() {
  const nums = [...selectedVerses].map(el => Number(el.dataset.verseNum));
  const hl = loadHl();
  const allOn = nums.every(n => hl.v.includes(n));
  hl.v = allOn ? hl.v.filter(n => !nums.includes(n)) : [...new Set([...hl.v, ...nums])].sort((a, b) => a - b);
  saveHl(hl);
  clearVerseSelection();
  applyHighlights();
  showToast(allOn ? '🖍 형광펜 지움' : '🖍 형광펜 칠함', 'success', 1800);
}

// ── 해설: 글자 선택 → 하단 바 ──
let hlPending = null;   // { add: [s, e] } | { remove: idx }
let hlHideTimer = null;

function onSelectionChange() {
  const sel = window.getSelection();
  const body = document.getElementById('haeseol-body');
  if (sel.rangeCount && !sel.isCollapsed && currentTab === 'haeseol') {
    const r = sel.getRangeAt(0);
    if (body.contains(r.commonAncestorContainer)) {
      const s = textOffset(body, r.startContainer, r.startOffset);
      const e = textOffset(body, r.endContainer, r.endOffset);
      if (e > s) {
        clearTimeout(hlHideTimer);
        hlPending = { add: [s, e] };
        showHighlightBar('형광펜 칠하기');
        return;
      }
    }
  }
  // 모바일은 버튼을 누르는 순간 선택이 풀릴 수 있어서 잠깐 기다렸다가 숨김
  if (hlPending?.add) hlHideTimer = setTimeout(hideHighlightBar, 400);
}

document.addEventListener('click', e => {
  const mark = e.target.closest?.('#haeseol-body mark.hl');
  if (mark && window.getSelection().isCollapsed) {
    hlPending = { remove: Number(mark.dataset.r) };
    showHighlightBar('이 형광펜 지우기');
  } else if (hlPending && hlPending.remove !== undefined && !e.target.closest('#hl-bar')) {
    hideHighlightBar();
  }
});

function showHighlightBar(label) {
  let bar = document.getElementById('hl-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'hl-bar';
    bar.innerHTML = `
      <span class="vcb-info"></span>
      <div class="vcb-actions">
        <button class="vcb-btn vcb-hl" onclick="applyPendingHighlight()">🖍</button>
        <button class="vcb-btn vcb-cancel" onclick="hideHighlightBar()">✕</button>
      </div>`;
    // 버튼을 눌러도 텍스트 선택이 풀리지 않게
    bar.addEventListener('pointerdown', e => e.preventDefault());
    document.body.appendChild(bar);
  }
  bar.querySelector('.vcb-info').textContent = label;
  bar.classList.add('active');
}

function hideHighlightBar() {
  clearTimeout(hlHideTimer);
  hlPending = null;
  document.getElementById('hl-bar')?.classList.remove('active');
}

function applyPendingHighlight() {
  if (!hlPending || !currentDate) return;
  const hl = loadHl();
  if (hlPending.add) hl.r = mergeRanges([...hl.r, hlPending.add]);
  else hl.r.splice(hlPending.remove, 1);
  saveHl(hl);
  window.getSelection().removeAllRanges();
  hideHighlightBar();
  applyHighlights();
}


// ═══════════════════════════════════════════
//  메모 — 날짜별, 이 브라우저에만 저장 (매일성경/순은 같은 성경 본문이라 공통)
// ═══════════════════════════════════════════
let memoTimer = null;

function loadMemo(dateStr) {
  const input = document.getElementById('memo-input');
  let saved = '';
  try { saved = localStorage.getItem(`memo:${dateStr}`) || ''; } catch {}
  input.value = saved;
  input.disabled = false;
  document.getElementById('memo-status').textContent = saved ? '저장된 메모' : '';
}

function onMemoInput() {
  const dateStr = currentDate;
  const value = document.getElementById('memo-input').value;
  document.getElementById('memo-status').textContent = '입력 중…';
  clearTimeout(memoTimer);
  memoTimer = setTimeout(() => {
    try {
      if (value.trim()) localStorage.setItem(`memo:${dateStr}`, value);
      else localStorage.removeItem(`memo:${dateStr}`);
      const t = new Date().toLocaleTimeString('ko-KR', { hour: 'numeric', minute: '2-digit' });
      document.getElementById('memo-status').textContent = `저장됨 · ${t}`;
    } catch {
      document.getElementById('memo-status').textContent = '⚠ 저장 실패 (브라우저 저장소를 쓸 수 없음)';
    }
  }, 400);
}


// ═══════════════════════════════════════════
//  댓글 — 날짜별, 닉네임만으로 작성, 이 브라우저에서 쓴 댓글만 삭제 가능
// ═══════════════════════════════════════════
function commentToken() {
  try {
    let t = localStorage.getItem('commentToken');
    if (!t) {
      const bytes = crypto.getRandomValues(new Uint8Array(24));
      t = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      localStorage.setItem('commentToken', t);
    }
    return t;
  } catch { return ''; }
}

async function loadComments(dateStr) {
  const list = document.getElementById('comment-list');
  list.innerHTML = '<li class="comment-empty">불러오는 중…</li>';
  try { document.getElementById('comment-nick').value = localStorage.getItem('commentNick') || ''; } catch {}
  try {
    const { comments } = await apiFetch(`/api/comments?date=${dateStr}`, { headers: { 'X-Comment-Token': commentToken() } });
    if (currentDate !== dateStr) return;
    renderComments(comments);
  } catch (e) {
    if (e instanceof AuthRequired) return;
    list.innerHTML = '<li class="comment-empty">댓글을 불러오지 못했습니다</li>';
    setCommentCount(0);
  }
}

function setCommentCount(n) {
  document.getElementById('comment-count').textContent = n ? `${n}개` : '';
  document.getElementById('comment-badge').textContent = n ? n : '';
}

function renderComments(comments) {
  const list = document.getElementById('comment-list');
  setCommentCount(comments.length);
  list.innerHTML = '';
  if (!comments.length) {
    list.innerHTML = '<li class="comment-empty">첫 나눔을 남겨주세요 🙂</li>';
    return;
  }
  for (const c of comments) list.appendChild(commentItem(c));
}

function commentItem(c) {
  const li = document.createElement('li');
  li.className = 'comment-item';
  const head = document.createElement('div');
  head.className = 'comment-head';
  const nick = document.createElement('span');
  nick.className = 'comment-nick';
  nick.textContent = c.nickname;
  const time = document.createElement('span');
  time.className = 'comment-time';
  time.textContent = new Date(c.created_at).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  head.append(nick, time);
  if (c.mine) {
    const del = document.createElement('button');
    del.className = 'comment-del';
    del.textContent = '삭제';
    del.onclick = () => removeComment(c.id);
    head.appendChild(del);
  }
  const body = document.createElement('p');
  body.className = 'comment-body';
  body.textContent = c.body;
  li.append(head, body);
  return li;
}

async function submitComment(event) {
  event.preventDefault();
  if (!currentDate) return;
  const nickEl = document.getElementById('comment-nick');
  const bodyEl = document.getElementById('comment-body');
  const btn = document.getElementById('comment-submit');
  btn.disabled = true;
  try {
    const res = await apiFetch('/api/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: currentDate, nickname: nickEl.value, body: bodyEl.value, token: commentToken() }),
    }, true);
    if (!res.comment) { showToast(res.error || '등록 실패', 'error'); return; }
    try { localStorage.setItem('commentNick', nickEl.value.trim()); } catch {}
    bodyEl.value = '';
    await loadComments(currentDate);
    showToast('💬 등록했어요', 'success', 1800);
  } catch (e) {
    if (!(e instanceof AuthRequired)) showToast('등록 실패: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
  }
}

async function removeComment(id) {
  if (!confirm('이 댓글을 삭제할까요?')) return;
  try {
    const res = await apiFetch(`/api/comments?id=${id}&token=${encodeURIComponent(commentToken())}`, { method: 'DELETE' }, true);
    if (!res.ok) { showToast(res.error || '삭제 실패', 'error'); return; }
    await loadComments(currentDate);
  } catch (e) {
    if (!(e instanceof AuthRequired)) showToast('삭제 실패: ' + e.message, 'error');
  }
}


// ═══════════════════════════════════════════
//  공식 오디오 (성서유니온 mp3 — 본문낭독 + 오디오해설, 매일성경/순 공통)
// ═══════════════════════════════════════════
let audioOpen = false;
let currentMedia = { url: null, speaker: null };

function setAudio(url, speaker) {
  const audio = document.getElementById('qt-audio');
  if (currentMedia.url !== url) {
    audio.pause();
    if (url) audio.src = url; else audio.removeAttribute('src');
  }
  currentMedia = { url, speaker };
  document.getElementById('audio-speaker').textContent = (speaker || '')
    .split('|').map(p => p.replace(':', ' ')).filter(Boolean).join(' · ');
  renderAudio();
}

function renderAudio() {
  const has = !!currentMedia.url;
  const btn = document.getElementById('btn-audio');
  btn.style.display = has ? '' : 'none';
  btn.classList.toggle('active', has && audioOpen);
  document.getElementById('audio-bar').style.display = has && audioOpen ? '' : 'none';
}

function toggleAudio() {
  const audio = document.getElementById('qt-audio');
  audioOpen = !audioOpen;
  renderAudio();
  if (audioOpen) audio.play().catch(() => {});
  else audio.pause();
}


// ═══════════════════════════════════════════
//  유튜브 영상 — 화면 안에서 재생 (/api/videos 가 검색·캐시)
// ═══════════════════════════════════════════
async function openVideos() {
  if (!currentDate) return;
  const dateStr = currentDate;
  let data;
  try {
    data = await apiFetch(`/api/videos?date=${dateStr}`, undefined, true);
  } catch (e) {
    if (e instanceof AuthRequired) return;
    data = { error: e.message };
  }
  if (currentDate !== dateStr) return;
  if (!data.items) {
    // API 키 없음/할당량 초과 → 예전처럼 유튜브 검색을 새 창으로
    searchPassage('youtube');
    return;
  }
  if (!data.items.length) {
    showToast('관련 영상을 찾지 못했어요 — 유튜브에서 직접 찾아볼게요', 'info');
    searchPassage('youtube');
    return;
  }

  document.getElementById('qt-audio').pause();
  document.getElementById('video-query').textContent = `🔎 ${data.query}`;
  document.getElementById('video-more').href =
    `https://www.youtube.com/results?search_query=${encodeURIComponent(data.query)}`;

  const list = document.getElementById('video-list');
  list.innerHTML = '';
  data.items.forEach((v, i) => {
    const li = document.createElement('li');
    li.className = 'video-item';
    li.onclick = () => playVideo(v.id, li);
    const img = document.createElement('img');
    img.src = v.thumb; img.alt = ''; img.loading = 'lazy';
    const meta = document.createElement('div');
    meta.className = 'video-meta';
    const title = document.createElement('div');
    title.className = 'video-title';
    title.textContent = decodeEntities(v.title);
    const ch = document.createElement('div');
    ch.className = 'video-channel';
    ch.textContent = `${decodeEntities(v.channel)} · ${new Date(v.published).toLocaleDateString('ko-KR')}`;
    meta.append(title, ch);
    li.append(img, meta);
    list.appendChild(li);
    if (i === 0) playVideo(v.id, li);
  });

  const sheet = document.getElementById('video-sheet');
  const backdrop = document.getElementById('video-backdrop');
  sheet.style.display = 'flex';
  backdrop.style.display = 'block';
  setTimeout(() => { sheet.classList.add('active'); backdrop.classList.add('active'); }, 10);
}

function playVideo(id, li) {
  document.getElementById('video-iframe').src =
    `https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&rel=0&playsinline=1`;
  document.querySelectorAll('.video-item.active').forEach(el => el.classList.remove('active'));
  li?.classList.add('active');
}

function closeVideos() {
  const sheet = document.getElementById('video-sheet');
  const backdrop = document.getElementById('video-backdrop');
  document.getElementById('video-iframe').src = 'about:blank';  // 재생 중지
  sheet.classList.remove('active');
  backdrop.classList.remove('active');
  setTimeout(() => { sheet.style.display = 'none'; backdrop.style.display = 'none'; }, 250);
}

// YouTube API 제목에는 &quot; &#39; 같은 엔티티가 섞여 옴
function decodeEntities(s) {
  const t = document.createElement('textarea');
  t.innerHTML = s || '';
  return t.value;
}


// ═══════════════════════════════════════════
//  본문 바로가기: 유튜브/웹 검색 · 같이 읽어요(공유) · 갓피플성경
// ═══════════════════════════════════════════
function passageRef() {
  const b = currentBookInfo;
  if (!b) return '';
  return b.verseStart === b.verseEnd ? `${b.book} ${b.chapter}:${b.verseStart}` : `${b.book} ${b.chapter}:${b.verseStart}-${b.verseEnd}`;
}

function searchPassage(kind) {
  const b = currentBookInfo;
  if (!b) return;
  const verses = `${b.chapter}장 ${b.verseStart}-${b.verseEnd}절`;
  const url = kind === 'youtube'
    ? `https://www.youtube.com/results?search_query=${encodeURIComponent(`매일성경 ${b.book} ${verses}`)}`
    : `https://www.google.com/search?q=${encodeURIComponent(`${b.book} ${verses} 묵상`)}`;
  window.open(url, '_blank', 'noopener');
}

async function sharePassage() {
  if (!currentDate) return;
  const d = new Date(currentDate + 'T00:00:00Z');
  const days = ['일','월','화','수','목','금','토'];
  const label = currentVersion === 'soon' ? '매일성경 순' : '매일성경';
  const title = currentBookInfo?.title ? ` "${currentBookInfo.title}"` : '';
  const text = `같이 읽어요 📖\n${d.getUTCMonth() + 1}/${d.getUTCDate()} (${days[d.getUTCDay()]}) ${label}${title}\n${passageRef()}`;
  const url = `${location.origin}/?date=${currentDate}${currentVersion === 'soon' ? '&v=soon' : ''}`;

  if (navigator.share) {
    try { await navigator.share({ title: '매일성경', text, url }); }
    catch (e) { if (e.name !== 'AbortError') showToast('공유 실패: ' + e.message, 'error'); }
    return;
  }
  await writeClipboard(`${text}\n${url}`);
  showToast('🔗 공유 문구와 링크를 복사했어요', 'success');
}

// 갓피플성경은 특정 본문으로 바로 가는 공개 링크가 없어서, 본문 위치를 복사한 뒤 앱을 연다
async function openGodpeople() {
  const ref = passageRef();
  if (ref) {
    await writeClipboard(ref);
    showToast(`📋 "${ref}" 복사됨 — 앱에서 찾아보세요`, 'info', 3000);
  }
  const ua = navigator.userAgent;
  setTimeout(() => {
    if (/Android/i.test(ua)) {
      const store = 'https://play.google.com/store/apps/details?id=com.godpeople.GPBIBLE';
      location.href = 'intent://#Intent;package=com.godpeople.GPBIBLE;action=android.intent.action.MAIN;' +
        `category=android.intent.category.LAUNCHER;S.browser_fallback_url=${encodeURIComponent(store)};end`;
    } else {
      location.href = 'https://apps.apple.com/kr/app/id511852665';
    }
  }, 600);
}

function isMobile() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}


// ═══════════════════════════════════════════
//  유틸리티
// ═══════════════════════════════════════════
// allowErrorBody: 실패 응답이어도 JSON 본문을 그대로 돌려줌 (/api/scrape 결과 표시용)
async function apiFetch(url, options, allowErrorBody = false) {
  const res = await fetch(url, { credentials: 'same-origin', ...options });
  if (res.status === 401) { showLogin(); throw new AuthRequired(); }
  if (!res.ok && !allowErrorBody) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

function todayKST() {
  const kst = new Date(Date.now() + 9 * 3600 * 1000);
  return kst.toISOString().slice(0, 10);
}

function offsetDate(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDateKo(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const days = ['일','월','화','수','목','금','토'];
  return `${d.getUTCMonth()+1}월 ${d.getUTCDate()}일 (${days[d.getUTCDay()]})`;
}

function showToast(msg, type = 'info', duration = 3500) {
  const container = document.getElementById('toast-container');
  const icons = { success: '✅', error: '❌', info: '💬' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${icons[type]||''}</span><span>${msg}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.animation = 'slideOut .22s ease forwards';
    el.addEventListener('animationend', () => el.remove());
  }, duration);
}
