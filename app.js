/* ────────────────────────────────────────────
   매일성경 — Vercel + Supabase 버전
   데이터는 /api/entries, /api/entry (암호 쿠키 필요) 에서 로드
   ──────────────────────────────────────────── */

// ── 전역 상태 ────────────────────────────────
let currentVersion = 'main';          // 'main' | 'soon'
let currentDate    = null;

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
  migrateHighlights();
  initInstall();
  document.getElementById('book').addEventListener('scroll', syncPagePills, { passive: true });
  toggleDock(null);

  await loadEntries();
});


// ═══════════════════════════════════════════
//  테마
// ═══════════════════════════════════════════
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

// 3~5월 봄, 6~8월 여름, 9~11월 가을, 12~2월 겨울 (KST)
function currentSeason() {
  const m = new Date(Date.now() + 9 * 3600 * 1000).getUTCMonth() + 1;
  return m >= 3 && m <= 5 ? 'spring' : m >= 6 && m <= 8 ? 'summer' : m >= 9 && m <= 11 ? 'autumn' : 'winter';
}

function initTheme() {
  let saved = null;
  try { saved = localStorage.getItem('theme'); } catch {}
  // 예전 설정(다크/라이트/시스템) 이어받기
  const legacy = { dark: 'winter', light: 'autumn', system: null };
  if (saved in legacy) saved = legacy[saved];
  applyTheme(SEASONS.includes(saved) ? saved : currentSeason(), false);
}

const SEASON_LABEL = { spring: '🌼 봄', summer: '🐬 여름', autumn: '🍂 가을', winter: '☃️ 겨울' };

// 좁은 화면은 지금 계절 버튼 하나만 보이므로, 누르면 다음 계절로 넘어감
function pickTheme(theme) {
  if (window.matchMedia('(max-width: 768px)').matches) {
    const cur = document.documentElement.getAttribute('data-theme');
    theme = SEASONS[(SEASONS.indexOf(cur) + 1) % SEASONS.length];
    showToast(`${SEASON_LABEL[theme]} 테마`, 'info', 1200);
  }
  setTheme(theme);
}

function setTheme(theme) {
  try { localStorage.setItem('theme', theme); } catch {}
  applyTheme(theme, true);
}

function applyTheme(theme, animate) {
  const html = document.documentElement;
  if (!animate) html.style.transition = 'none';
  html.setAttribute('data-theme', theme);
  if (!animate) { void html.offsetHeight; html.style.transition = ''; }
  // 휴대폰 상단 상태바 / 설치 앱 제목줄 색도 계절에 맞춤
  document.querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', getComputedStyle(html).getPropertyValue('--bg').trim());
  SEASONS.forEach(t => document.getElementById(`theme-btn-${t}`)?.classList.toggle('active', t === theme));
}


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
  resetPages();
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
    applyBookmarks();
    setAudio(data.mediaUrl, data.speaker);
    const hymnBtn = document.getElementById('btn-hymn');
    hymnBtn.style.display = currentHymn ? '' : 'none';
    hymnBtn.textContent = currentHymn ? `🎵 찬송 ${currentHymn}장` : '🎵 찬송';
    document.getElementById('more-wrap').style.display = currentBookInfo ? '' : 'none';
  } catch (e) {
    if (e instanceof AuthRequired) return;
    showToast('콘텐츠 로드 실패: ' + e.message, 'error');
  }
}



// ═══════════════════════════════════════════
//  마크다운 파싱
// ═══════════════════════════════════════════
let currentBookInfo = null;  // { book: '사사기', chapter: '13' }
let currentHymn = null;      // 새찬송가 장 번호 (본문 머리 '찬송가 221장')

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
  currentHymn = md.match(/찬송가\s*(\d+)\s*장/)?.[1] || null;

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
        <button class="vcb-btn vcb-bm" onclick="bookmarkSelectedVerses()" title="책갈피">🔖</button>
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
  document.getElementById('more-wrap').style.display = 'none';
  closeMore();
  setAudio(null, null);
  ['bonmun','haeseol'].forEach(t => {
    document.getElementById(`empty-${t}`).style.display = 'flex';
    document.getElementById(`${t}-body`).innerHTML = '';
  });
}


// ═══════════════════════════════════════════
//  책 펼침면 — 넓은 화면은 양쪽 쪽, 좁은 화면은 옆으로 넘김
// ═══════════════════════════════════════════
// 쪽 순서: 왼쪽(첫 쪽) = 해설, 오른쪽(둘째 쪽) = 본문
const PAGE_ORDER = ['haeseol', 'bonmun'];

function goPage(name) {
  // scroll-snap 컨테이너에서는 scrollTo(smooth) 가 멈추는 경우가 있어 scrollIntoView 사용
  document.getElementById(`page-${name}`)
    .scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' });
}

function syncPagePills() {
  const book = document.getElementById('book');
  const idx = book.clientWidth ? Math.round(book.scrollLeft / book.clientWidth) : 0;
  PAGE_ORDER.forEach((name, i) => document.getElementById(`pill-${name}`).classList.toggle('active', idx === i));
}

// 날짜를 바꾸면 두 쪽 모두 맨 위, 좁은 화면은 첫 쪽(해설)부터
function resetPages() {
  const book = document.getElementById('book');
  book.scrollLeft = 0;
  document.getElementById('page-bonmun').scrollTop = 0;
  document.getElementById('page-haeseol').scrollTop = 0;
  syncPagePills();
}


// ═══════════════════════════════════════════
//  메모 / 나눔 / 책갈피 칸 — ⋯ 더보기에서 열고, 같은 항목을 다시 누르거나 ✕ 로 닫음
// ═══════════════════════════════════════════
let dockOpen = null;  // null | 'memo' | 'nanum' | 'bookmarks'

function toggleDock(which) {
  dockOpen = dockOpen === which ? null : which;
  const dock = document.getElementById('dock');
  dock.classList.toggle('open', !!dockOpen);
  ['memo', 'nanum', 'bookmarks'].forEach(k => {
    document.getElementById(`dock-btn-${k}`).classList.toggle('active', dockOpen === k);
    document.getElementById(`dock-${k}`).style.display = dockOpen === k ? '' : 'none';
  });
  if (dockOpen) document.getElementById('dock').scrollIntoView({ block: 'nearest' });
  if (dockOpen === 'memo') document.getElementById('memo-input').focus({ preventScroll: true });
  if (dockOpen === 'bookmarks') renderBookmarks();
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
//  절별 책갈피 — 이 브라우저에만 저장, 표시는 계절 아이콘(🌼 🐬 🍂 ☃️)
//  본문에서 절을 탭해 선택 → 하단 바 🔖 / 아래 도크 🔖 책갈피에서 모아보기
//  매일성경/순은 같은 성경 본문이라 날짜+절 단위로 저장 (track 은 돌아갈 때 쓰는 값)
// ═══════════════════════════════════════════
const BM_KEY = 'bookmarks';

function loadBookmarks() {
  try { return JSON.parse(localStorage.getItem(BM_KEY)) || []; }
  catch { return []; }
}

function saveBookmarks(list) {
  try { localStorage.setItem(BM_KEY, JSON.stringify(list)); }
  catch { showToast('브라우저 저장소를 쓸 수 없습니다', 'error'); }
  document.getElementById('bookmark-badge').textContent = list.length || '';
}

function applyBookmarks() {
  const marked = new Set(loadBookmarks().filter(b => b.date === currentDate).map(b => b.verse));
  document.querySelectorAll('#bonmun-body .verse-line').forEach(el =>
    el.classList.toggle('bookmarked', marked.has(Number(el.dataset.verseNum)))
  );
  fillBookmarkTexts();
}

// 예전 형광펜에서 옮겨온 책갈피는 절 내용이 비어 있으니, 그 날짜를 열 때 채움
function fillBookmarkTexts() {
  const list = loadBookmarks();
  let changed = false;
  for (const b of list) {
    if (b.date !== currentDate || b.text) continue;
    const el = document.querySelector(`#bonmun-body .verse-line[data-verse-num="${b.verse}"] .verse-text`);
    if (!el) continue;
    Object.assign(b, {
      text: el.textContent.trim(),
      book: currentBookInfo?.book || '',
      chapter: currentBookInfo?.chapter || '',
      title: currentBookInfo?.title || '',
    });
    changed = true;
  }
  if (changed) saveBookmarks(list);
}

// 선택한 절에 책갈피 꽂기 / 이미 다 꽂혀 있으면 빼기
function bookmarkSelectedVerses() {
  const els = [...selectedVerses].sort((a, b) => a.dataset.verseNum - b.dataset.verseNum);
  const nums = els.map(el => Number(el.dataset.verseNum));
  let list = loadBookmarks();
  const have = new Set(list.filter(b => b.date === currentDate).map(b => b.verse));
  const allOn = nums.every(n => have.has(n));

  if (allOn) {
    list = list.filter(b => !(b.date === currentDate && nums.includes(b.verse)));
  } else {
    for (const el of els) {
      const verse = Number(el.dataset.verseNum);
      if (have.has(verse)) continue;
      list.push({
        date: currentDate,
        track: currentVersion,
        verse,
        book: currentBookInfo?.book || '',
        chapter: currentBookInfo?.chapter || '',
        title: currentBookInfo?.title || '',
        text: el.querySelector('.verse-text').textContent.trim(),
        savedAt: Date.now(),
      });
    }
  }
  saveBookmarks(list);
  clearVerseSelection();
  applyBookmarks();
  if (dockOpen === 'bookmarks') renderBookmarks();
  showToast(allOn ? '🔖 책갈피를 뺐어요' : '🔖 책갈피를 꽂았어요', 'success', 1600);
}

// 형광펜(절 단위)을 쓰던 브라우저: 칠해 둔 절을 책갈피로 옮기고 형광펜 기록은 정리
function migrateHighlights() {
  const keys = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (/^hl:(main|soon):\d{4}-\d{2}-\d{2}$/.test(k)) keys.push(k);
    }
  } catch { return; }

  const list = loadBookmarks();
  const ids = new Set(list.map(b => `${b.date}:${b.verse}`));
  for (const k of keys) {
    const [, track, date] = k.split(':');
    let verses = [];
    try { verses = JSON.parse(localStorage.getItem(k))?.v || []; } catch {}
    for (const verse of verses) {
      if (ids.has(`${date}:${verse}`)) continue;
      ids.add(`${date}:${verse}`);
      list.push({ date, track, verse, book: '', chapter: '', title: '', text: '', savedAt: Date.now() });
    }
    try { localStorage.removeItem(k); } catch {}
  }
  saveBookmarks(list);
}

// ── 모아보기 ──
function renderBookmarks() {
  const ul = document.getElementById('bookmark-list');
  const list = loadBookmarks().sort((a, b) => b.date.localeCompare(a.date) || a.verse - b.verse);
  document.getElementById('bookmark-count').textContent = list.length ? `${list.length}개` : '';
  ul.innerHTML = '';
  if (!list.length) {
    ul.innerHTML = '<li class="comment-empty">본문에서 절을 눌러 고른 뒤 🔖 를 누르면 여기에 모여요</li>';
    return;
  }

  let lastDate = null;
  for (const b of list) {
    if (b.date !== lastDate) {
      lastDate = b.date;
      const head = document.createElement('li');
      head.className = 'bm-date';
      head.textContent = formatDateKo(b.date) + (b.title ? ` · ${b.title}` : '');
      ul.appendChild(head);
    }
    const li = document.createElement('li');
    li.className = 'bm-item';
    const icon = document.createElement('span');
    icon.className = 'bm-icon';
    const main = document.createElement('button');
    main.className = 'bm-main';
    main.onclick = () => openBookmark(b);
    const ref = document.createElement('span');
    ref.className = 'bm-ref';
    ref.textContent = b.book ? `${b.book} ${b.chapter}:${b.verse}` : `${b.verse}절`;
    const text = document.createElement('span');
    text.className = 'bm-text';
    text.textContent = b.text || '(이 날짜를 한 번 열면 내용이 채워져요)';
    main.append(ref, text);
    const del = document.createElement('button');
    del.className = 'bm-del';
    del.title = '책갈피 빼기';
    del.textContent = '✕';
    del.onclick = () => removeBookmark(b);
    li.append(icon, main, del);
    ul.appendChild(li);
  }
}

function removeBookmark(b) {
  saveBookmarks(loadBookmarks().filter(x => !(x.date === b.date && x.verse === b.verse)));
  if (b.date === currentDate) applyBookmarks();
  renderBookmarks();
}

// 책갈피를 누르면 그 날짜 본문으로 가서 해당 절을 보여줌
async function openBookmark(b) {
  toggleDock(null);
  if (b.track && b.track !== currentVersion) await switchVersion(b.track);
  if (currentDate !== b.date) await selectDate(b.date);
  const book = document.getElementById('book');
  book.scrollLeft = document.getElementById('page-bonmun').offsetLeft;  // 좁은 화면: 본문 쪽으로
  const el = document.querySelector(`#bonmun-body .verse-line[data-verse-num="${b.verse}"]`);
  if (!el) return;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.classList.add('verse-copied');
  setTimeout(() => el.classList.remove('verse-copied'), 700);
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
//  ⋯ 더보기 — 듣기 · 찬송 · 유튜브 · 검색 · 같이 읽어요 · 갓피플성경
// ═══════════════════════════════════════════
function toggleMore() {
  const open = document.getElementById('more-menu').classList.toggle('open');
  document.getElementById('btn-more').setAttribute('aria-expanded', open);
  document.getElementById('btn-more').classList.toggle('active', open);
}

function closeMore() {
  document.getElementById('more-menu').classList.remove('open');
  document.getElementById('btn-more').setAttribute('aria-expanded', 'false');
  document.getElementById('btn-more').classList.remove('active');
}

// 메뉴 바깥을 누르거나 Esc 를 누르면 닫힘
document.addEventListener('click', e => {
  if (!e.target.closest('#more-wrap')) closeMore();
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  closeMore();
  if (document.getElementById('puzzle-modal').style.display === 'flex') closePuzzle();
  else if (dockOpen) toggleDock(null);
});


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
//  본문 바로가기: 유튜브/웹 검색 · 같이 읽어요(공유) · 갓피플성경
// ═══════════════════════════════════════════
function passageRef() {
  const b = currentBookInfo;
  if (!b) return '';
  return b.verseStart === b.verseEnd ? `${b.book} ${b.chapter}:${b.verseStart}` : `${b.book} ${b.chapter}:${b.verseStart}-${b.verseEnd}`;
}

// 성서유니온이 고른 오늘의 찬송(새찬송가) — 음원 제공처가 없어 유튜브 검색으로 연결 (모바일은 유튜브 앱)
function playHymn() {
  if (!currentHymn) return;
  document.getElementById('qt-audio').pause();
  const q = `새찬송가 ${currentHymn}장`;
  window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`, '_blank', 'noopener');
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

// 공유 문구:
//   📖 오늘 말씀, 같이 읽어요!
//   10/18 (일) 매일성경 「차별이라는 죄」
//   야고보서 2:1-13
//   (빈 줄)
//   절 내용 — 고른 절이 있으면 그 절들, 없으면 첫 절 (절 번호 없이)
//   (빈 줄)
//   👉 링크
function buildShareText() {
  const d = new Date(currentDate + 'T00:00:00Z');
  const days = ['일','월','화','수','목','금','토'];
  const label = currentVersion === 'soon' ? '매일성경 순' : '매일성경';
  const title = currentBookInfo?.title ? ` 「${currentBookInfo.title}」` : '';
  const url = `${location.origin}/?date=${currentDate}${currentVersion === 'soon' ? '&v=soon' : ''}`;

  const picked = [...selectedVerses].sort((a, b) => a.dataset.verseNum - b.dataset.verseNum);
  const verseEls = picked.length ? picked : [document.querySelector('#bonmun-body .verse-line')].filter(Boolean);
  const verses = verseEls.map(el => el.querySelector('.verse-text').textContent.trim());

  return [
    '📖 오늘 말씀, 같이 읽어요!',
    `${d.getUTCMonth() + 1}/${d.getUTCDate()} (${days[d.getUTCDay()]}) ${label}${title}`,
    passageRef(),
    '',
    ...verses,
    '',
    `👉 ${url}`,
  ].join('\n');
}

async function sharePassage() {
  if (!currentDate) return;
  const text = buildShareText();

  // 링크는 문구 끝에 이미 들어 있음 — url 을 따로 넘기면 앱에 따라 링크가 두 번 붙음
  if (navigator.share) {
    try { await navigator.share({ text }); }
    catch (e) { if (e.name !== 'AbortError') showToast('공유 실패: ' + e.message, 'error'); }
    return;
  }
  await writeClipboard(text);
  showToast('🔗 본문과 링크를 복사했어요 — 붙여넣어 보내세요', 'success');
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
//  🧩 말씀 퍼즐 — 그날 본문으로 하는 탭 퍼즐
//  조각 맞추기: 한 절을 어절 조각으로 섞어 순서대로 누르기 (고른 절이 있으면 그 절)
//  순서 맞추기: 이어지는 5절을 섞어 순서대로 누르기
//  누를 때마다 바로 채점 — 틀리면 흔들림, 💡 힌트는 다음 조각을 깜빡여 줌
// ═══════════════════════════════════════════
const PZ_MAX_PIECES = 12;   // 긴 절은 어절을 묶어 조각 수를 이 정도로
const PZ_VERSE_RUN = 5;     // 순서 맞추기에서 섞을 절 수

let pzMode = 'words';
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

function openPuzzle() {
  if (!currentDate || !puzzleVerses().length) {
    showToast('본문을 불러온 뒤에 할 수 있어요', 'info');
    return;
  }
  const modal = document.getElementById('puzzle-modal');
  const backdrop = document.getElementById('puzzle-backdrop');
  modal.style.display = 'flex';
  backdrop.style.display = 'block';
  setTimeout(() => { modal.classList.add('active'); backdrop.classList.add('active'); }, 10);
  startPuzzle();
}

function closePuzzle() {
  clearInterval(pzTimer);
  const modal = document.getElementById('puzzle-modal');
  const backdrop = document.getElementById('puzzle-backdrop');
  modal.classList.remove('active');
  backdrop.classList.remove('active');
  setTimeout(() => { modal.style.display = 'none'; backdrop.style.display = 'none'; }, 250);
}

function setPuzzleMode(mode) {
  pzMode = mode;
  document.getElementById('pz-mode-words').classList.toggle('active', mode === 'words');
  document.getElementById('pz-mode-verses').classList.toggle('active', mode === 'verses');
  startPuzzle();
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

  const words = verse.text.split(/\s+/).filter(Boolean);
  const size = Math.ceil(words.length / PZ_MAX_PIECES);
  const pieces = [];
  for (let i = 0; i < words.length; i += size) pieces.push(words.slice(i, i + size).join(' '));

  const b = currentBookInfo;
  return {
    ref: b ? `${b.book} ${b.chapter}:${verse.num}` : `${verse.num}절`,
    guide: '말씀 조각을 순서대로 눌러 한 절을 완성하세요',
    pieces,
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

function startPuzzle() {
  clearInterval(pzTimer);
  const verses = puzzleVerses();
  if (pzMode === 'verses' && verses.length < 2) { setPuzzleMode('words'); return; }

  const p = pzMode === 'words' ? makeWordsPuzzle(verses) : makeVersesPuzzle(verses);
  clearVerseSelection();
  pz = { ...p, pool: shuffleIds(p.pieces.length), placed: [], mistakes: 0, hints: 0, start: Date.now(), done: false };

  document.getElementById('pz-ref').textContent = p.ref;
  document.getElementById('pz-guide').textContent = p.guide;
  document.getElementById('pz-guide').classList.remove('done');
  document.getElementById('pz-hint').disabled = false;
  renderPuzzle();
  pzTimer = setInterval(renderPuzzleStatus, 1000);
}

function puzzlePieceEl(id, placed) {
  const btn = document.createElement('button');
  btn.className = 'pz-piece' + (pzMode === 'verses' ? ' pz-verse' : '') + (placed ? ' placed' : '');
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

  let solved = 1;
  try {
    const key = `puzzle:${currentDate}`;
    solved = (Number(localStorage.getItem(key)) || 0) + 1;
    localStorage.setItem(key, String(solved));
  } catch {}

  const perfect = !pz.mistakes && !pz.hints ? ' 완벽해요!' : '';
  const guide = document.getElementById('pz-guide');
  guide.textContent = `🎉 정답!${perfect} 오늘 ${solved}문제 맞혔어요 — 🔀 다른 문제로 계속해 보세요`;
  guide.classList.add('done');
  puzzleCelebrate();
}

// 계절 아이콘(🌼 🐬 🍂 ☃️)이 퐁퐁 떠오름
function puzzleCelebrate() {
  const box = document.getElementById('puzzle-modal');
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
//  앱 설치 (PWA) — 안드로이드/PC 크롬·엣지는 설치 창을 바로 띄우고,
//  그 밖(아이폰 Safari 등)은 설치 방법 안내를 보여줌
// ═══════════════════════════════════════════
let installPrompt = null;

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();          // 브라우저 기본 안내 대신 우리 버튼으로
  installPrompt = e;
});

window.addEventListener('appinstalled', () => {
  installPrompt = null;
  document.getElementById('install-banner').style.display = 'none';
  document.getElementById('btn-install').style.display = 'none';
  showToast('📲 설치됐어요! 홈 화면(앱 목록)에서 열 수 있어요', 'success', 4000);
});

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

function detectOS() {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  return 'desktop';
}

function initInstall() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  if (isStandalone()) return;  // 이미 설치한 앱으로 열었으면 안내하지 않음
  document.getElementById('btn-install').style.display = '';
  let dismissed = false;
  try { dismissed = localStorage.getItem('installBannerDismissed') === '1'; } catch {}
  if (!dismissed) document.getElementById('install-banner').style.display = '';
}

function dismissInstallBanner() {
  document.getElementById('install-banner').style.display = 'none';
  try { localStorage.setItem('installBannerDismissed', '1'); } catch {}
}

async function installApp() {
  if (installPrompt) {
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    return;
  }
  openInstallGuide();
}

function openInstallGuide() {
  // 지금 기기에 맞는 방법을 맨 위에, 강조해서
  const os = detectOS();
  const box = document.getElementById('install-steps');
  const mine = box.querySelector(`.install-os[data-os="${os}"]`);
  box.querySelectorAll('.install-os').forEach(el => el.classList.toggle('current', el === mine));
  box.prepend(mine);

  const modal = document.getElementById('install-modal');
  const backdrop = document.getElementById('install-backdrop');
  modal.style.display = 'flex';
  backdrop.style.display = 'block';
  setTimeout(() => { modal.classList.add('active'); backdrop.classList.add('active'); }, 10);
}

function closeInstallGuide() {
  const modal = document.getElementById('install-modal');
  const backdrop = document.getElementById('install-backdrop');
  modal.classList.remove('active');
  backdrop.classList.remove('active');
  setTimeout(() => { modal.style.display = 'none'; backdrop.style.display = 'none'; }, 250);
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
