// =============================================
// FC 바르자 팀 매니저 - Firebase / Auth 연동 (스키마 v2, 구글 로그인)
// =============================================
//
// DB 구조 (v2):
//   /roster/{name}            { name, fullName, role:'member'|'guest', positions:[], jerseyNo, aliases:[], active, priority:1|2|3 }
//   /matches/{matchId}        경기 레코드 (docs/data-schema.md 참고)
//   /settings/venues          ["잠실유수지", ...]
//   /settings/editors         편집 가능한 구글 계정 { emailKey: {email,name,...} }
//   /settings/editorRequests  편집 권한 요청 { uid: {email,name,requestedAt} }
//   /settings/schemaVersion   2
//
// 쓰기는 항상 레코드 단위(/matches/{id}, /roster/{name})로 하여 동시 편집 시 다른 레코드를 덮어쓰지 않는다.

const DB_NODES = {
    roster: '/roster.json',
    matches: '/matches.json',
    venues: '/settings/venues.json',
    editors: '/settings/editors.json',
    editorRequests: '/settings/editorRequests.json',
    schemaVersion: '/settings/schemaVersion.json',
};

function dbUrl(node, token) {
    const base = CONFIG.FIREBASE_DB_URL.replace(/\/$/, '') + node;
    return token ? `${base}?auth=${encodeURIComponent(token)}` : base;
}

// Firebase 키에 쓸 수 없는 문자(. $ # [ ] /) 제거
function dbKey(s) {
    return String(s).replace(/[.$#[\]/]/g, '_');
}

// 현재 로그인 사용자(또는 없음)의 ID 토큰 — 쓰기 요청에 첨부
async function getIdToken() {
    try {
        const u = window._fbAuth && window._fbAuth.currentUser;
        return u ? await u.getIdToken() : null;
    } catch { return null; }
}

// ── 편집 권한: 구글 로그인 + 편집자 허용 목록 ─────────────────────────────
//
//   /settings/editors/{emailKey}        { email, name, addedAt, addedBy }   ← 편집 가능한 구글 계정
//   /settings/editorRequests/{uid}      { email, name, requestedAt }        ← 권한 요청 (편집자가 승인)
//
//   emailKey = 소문자 이메일에서 '.' 을 ',' 로 바꾼 것 (Firebase 키에 '.' 불가). DB 규칙도 같은 변환을 쓴다.
//   편집자 목록이 비어 있으면 처음 로그인한 계정이 자동으로 첫 편집자가 된다 (부트스트랩).

function emailKey(email) {
    return String(email || '').trim().toLowerCase().replace(/\./g, ',');
}

function isKakaoInAppBrowser() {
    return /KAKAOTALK/i.test(navigator.userAgent);
}

// 카카오톡 인앱 브라우저에서는 구글 로그인 팝업이 막히므로 외부 브라우저로 여는 링크 제공
function kakaoExternalUrl() {
    return 'kakaotalk://web/openExternal?url=' + encodeURIComponent(location.href.split('#')[0]);
}

// ── 헤더 로그인/편집 상태 UI ───────────────────────────────────────────────
function updateEditModeUI(state) {
    const btn = document.getElementById('auth-btn');
    const status = document.getElementById('auth-status');
    const menu = document.getElementById('auth-menu');
    if (!btn || !status) return;

    btn.className = 'auth-btn';
    btn.onclick = null;
    btn.disabled = false;
    btn.title = '';
    if (menu) menu.style.display = 'none';
    const u = AppState.user;

    switch (state) {
        case 'no-config':
            btn.textContent = '⚙️ DB 미설정';
            btn.classList.add('auth-warn');
            btn.onclick = () => window.open('https://console.firebase.google.com/', '_blank');
            status.textContent = 'js/config.js에서 FIREBASE_DB_URL을 설정하세요.';
            break;

        case 'loading':
            btn.textContent = '⏳ 로딩 중';
            btn.disabled = true;
            status.textContent = '데이터를 불러오는 중...';
            break;

        case 'error':
            btn.textContent = '❌ 연결 오류';
            btn.classList.add('auth-warn');
            btn.onclick = () => initBackend();
            status.textContent = 'DB 연결 실패. 새로고침하거나 설정을 확인하세요.';
            break;

        case 'signed-out':
            btn.textContent = 'G 구글로 로그인';
            btn.onclick = signInWithGoogle;
            status.textContent = '읽기 전용';
            break;

        case 'no-access':
            { const mu = document.getElementById('auth-menu-user'); if (mu && u) mu.textContent = `${u.email} · 권한 없음`; }
            btn.textContent = '🙋 편집 권한 요청';
            btn.classList.add('auth-warn');
            btn.onclick = requestEditorAccess;
            status.textContent = `${u ? u.email : ''} · 편집 권한 없음`;
            if (menu) menu.style.display = '';
            break;

        case 'requested':
            { const mu = document.getElementById('auth-menu-user'); if (mu && u) mu.textContent = `${u.email} · 승인 대기`; }
            btn.textContent = '⏳ 승인 대기 중';
            btn.disabled = true;
            status.textContent = `${u ? u.email : ''} · 편집자 승인을 기다리는 중`;
            if (menu) menu.style.display = '';
            break;

        case 'unlocked':
            btn.textContent = `✏️ ${u && (u.displayName || u.email)}`;
            { const mu = document.getElementById('auth-menu-user'); if (mu && u) mu.textContent = `${u.email} · 편집 가능`; }
            btn.classList.add('auth-connected');
            btn.onclick = () => { if (menu) menu.style.display = menu.style.display === 'none' ? '' : 'none'; };
            btn.title = '클릭하면 로그아웃 메뉴';
            status.textContent = '편집 모드';
            if (menu) menu.style.display = 'none';
            break;
    }
}

// ── 구글 로그인 / 로그아웃 ──────────────────────────────────────────────────
async function signInWithGoogle() {
    if (typeof firebase === 'undefined' || !window._fbAuth) {
        showToast('Firebase 인증을 초기화하지 못했습니다. 새로고침해 주세요.', 'error');
        return;
    }
    if (isKakaoInAppBrowser()) {
        showKakaoNotice(true);
        return;
    }
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
        await window._fbAuth.signInWithPopup(provider);
    } catch (e) {
        const code = e && e.code;
        if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment'
            || code === 'auth/cancelled-popup-request' || code === 'auth/web-storage-unsupported') {
            try { await window._fbAuth.signInWithRedirect(provider); return; }
            catch (e2) { showToast('로그인 실패: ' + (e2.message || e2), 'error'); return; }
        }
        if (code === 'auth/popup-closed-by-user') return;
        if (code === 'auth/operation-not-allowed') {
            showToast('Firebase 콘솔에서 Google 로그인 제공업체를 켜야 합니다.', 'error');
            return;
        }
        showToast('로그인 실패: ' + (e.message || code || e), 'error');
    }
}

async function signOutGoogle() {
    try { await window._fbAuth.signOut(); }
    catch (e) { showToast('로그아웃 실패: ' + e.message, 'error'); }
}

// ── 편집자 목록 / 권한 요청 ────────────────────────────────────────────────
async function loadEditors() {
    try {
        const v = await fbGet(DB_NODES.editors);
        AppState.editors = (v && typeof v === 'object') ? v : {};
    } catch { AppState.editors = {}; }
    try {
        const r = await fbGet(DB_NODES.editorRequests);
        AppState.editorRequests = (r && typeof r === 'object') ? r : {};
    } catch { AppState.editorRequests = {}; }
}

function isEditorEmail(email) {
    return !!(email && AppState.editors && AppState.editors[emailKey(email)]);
}

async function addEditor(email, name, addedBy) {
    const key = emailKey(email);
    if (!key || !key.includes('@')) throw new Error('올바른 이메일이 아닙니다.');
    const rec = { email: String(email).trim().toLowerCase(), name: name || '', addedAt: new Date().toISOString(), addedBy: addedBy || '' };
    await fbPut(`/settings/editors/${encodeURIComponent(key)}.json`, rec);
    AppState.editors[key] = rec;
}

async function removeEditor(key) {
    await fbDelete(`/settings/editors/${encodeURIComponent(key)}.json`);
    delete AppState.editors[key];
}

async function requestEditorAccess() {
    const u = AppState.user;
    if (!u) return;
    try {
        await fbPut(`/settings/editorRequests/${encodeURIComponent(u.uid)}.json`,
            { email: (u.email || '').toLowerCase(), name: u.displayName || '', requestedAt: new Date().toISOString() });
        AppState.editorRequests[u.uid] = { email: u.email, name: u.displayName || '' };
        updateEditModeUI('requested');
        showToast('편집 권한을 요청했습니다. 편집자가 승인하면 바로 사용할 수 있습니다.');
    } catch (e) {
        showToast('요청 실패: ' + e.message, 'error');
    }
}

async function resolveEditorRequest(uid, approve) {
    const req = AppState.editorRequests[uid];
    if (!req) return;
    if (approve) await addEditor(req.email, req.name, AppState.user ? AppState.user.email : '');
    await fbDelete(`/settings/editorRequests/${encodeURIComponent(uid)}.json`);
    delete AppState.editorRequests[uid];
}

// 로그인 상태가 바뀔 때마다 편집 권한 재평가
async function applyAuthState(user) {
    // 이메일 없는 계정(예전 익명 로그인 세션)은 편집 권한을 가질 수 없으므로 로그아웃 처리
    if (user && !user.email) {
        try { if (window._fbAuth && window._fbAuth.currentUser === user) await window._fbAuth.signOut(); } catch { /* ignore */ }
        user = null;
    }
    AppState.user = user ? { uid: user.uid, email: (user.email || '').toLowerCase(), displayName: user.displayName || '' } : null;
    if (!user) {
        AppState.isEditor = false;
        updateEditModeUI('signed-out');
        updateEditButtonsVisibility();
        return;
    }
    await loadEditors();
    // 부트스트랩: 편집자가 아무도 없으면 첫 로그인 계정을 편집자로 등록
    if (Object.keys(AppState.editors).length === 0 && AppState.user.email) {
        try {
            await addEditor(AppState.user.email, AppState.user.displayName, 'bootstrap');
            showToast('첫 편집자로 등록되었습니다. 선수단 관리 → 편집 설정에서 다른 멤버를 추가하세요. 🎉');
        } catch (e) {
            console.warn('첫 편집자 등록 실패:', e);
        }
    }
    if (isEditorEmail(AppState.user.email)) {
        AppState.isEditor = true;
        updateEditModeUI('unlocked');
    } else {
        AppState.isEditor = false;
        updateEditModeUI(AppState.editorRequests[AppState.user.uid] ? 'requested' : 'no-access');
    }
    updateEditButtonsVisibility();
    if (document.getElementById('tab4').classList.contains('active')) renderRosterTab();
}

// ── 편집 권한 체크 (외부에서 호출) ───────────────────────────────────────
function checkEditorAccess() {
    if (AppState.isEditor) return true;
    showToast(AppState.user
        ? '🔒 편집 권한이 없습니다. 오른쪽 위 "편집 권한 요청"을 눌러 주세요.'
        : '🔒 편집하려면 오른쪽 위에서 구글로 로그인하세요.', 'error');
    return false;
}

// ── 로컬 데이터 모드 (?local=1): data/import/*.json 을 DB 대신 읽고, 쓰기는 콘솔에만 기록 ──
// 이관 결과를 업로드 전에 앱에서 미리 확인하는 용도 (python3 -m http.server 로 띄운 뒤 index.html?local=1)
const LOCAL_DATA_MODE = new URLSearchParams(location.search).get('local') === '1';
const LOCAL_DATA_FILES = {
    [DB_NODES.roster]: 'data/import/roster.json',
    [DB_NODES.matches]: 'data/import/matches.json',
    [DB_NODES.venues]: 'data/import/venues.json',
};

// 로컬 모드 쓰기는 페이지 메모리의 JSON 트리에만 반영 (새로고침하면 사라짐)
const LOCAL_TREE = {};
function localPath(node) {
    return decodeURIComponent(node.replace(/\.json$/, '')).split('/').filter(Boolean);
}
function localGet(node) {
    let cur = LOCAL_TREE;
    for (const seg of localPath(node)) {
        if (cur === null || typeof cur !== 'object' || !(seg in cur)) return undefined;
        cur = cur[seg];
    }
    return cur;
}
function localSet(node, value) {
    const segs = localPath(node);
    let cur = LOCAL_TREE;
    segs.slice(0, -1).forEach(seg => { if (cur[seg] === null || typeof cur[seg] !== 'object') cur[seg] = {}; cur = cur[seg]; });
    const last = segs[segs.length - 1];
    if (value === undefined) delete cur[last]; else cur[last] = JSON.parse(JSON.stringify(value));
}

// ── Firebase REST API ──────────────────────────────────────────────────────
async function fbGet(node) {
    if (LOCAL_DATA_MODE) {
        const mem = localGet(node);
        if (mem !== undefined) return mem;
        const file = LOCAL_DATA_FILES[node];
        if (!file) return null;
        const resp = await fetch(file + '?t=' + Date.now());
        if (!resp.ok) throw new Error(`로컬 데이터 읽기 실패: ${file} (${resp.status})`);
        return resp.json();
    }
    const resp = await fetch(dbUrl(node));
    if (!resp.ok) throw new Error(`DB 읽기 실패: ${resp.status}`);
    return resp.json();
}

async function fbWrite(node, method, data) {
    if (LOCAL_DATA_MODE) {
        console.info(`[local-data] ${method} ${node}`, data);
        if (method === 'DELETE') localSet(node, undefined);
        else if (method === 'PATCH') localSet(node, Object.assign({}, localGet(node) || {}, data));
        else localSet(node, data);
        return;
    }
    const token = await getIdToken();
    const resp = await fetch(dbUrl(node, token), {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: data === undefined ? undefined : JSON.stringify(data),
    });
    if (!resp.ok) {
        // 401/403이면 보통 익명 인증 미설정 또는 쓰기 규칙 문제
        const hint = (resp.status === 401 || resp.status === 403)
            ? ' (편집자로 등록된 구글 계정으로 로그인했는지, DB 규칙이 README 와 같은지 확인)'
            : '';
        throw new Error(`DB 쓰기 실패: ${resp.status}${hint}`);
    }
}

const fbPut = (node, data) => fbWrite(node, 'PUT', data);
const fbPatch = (node, data) => fbWrite(node, 'PATCH', data);
const fbDelete = (node) => fbWrite(node, 'DELETE');

// ── Firebase Auth 초기화 (구글 로그인) ─────────────────────────────────────
function initFirebaseAuth() {
    if (typeof firebase === 'undefined') return;
    if (!firebase.apps.length) firebase.initializeApp(CONFIG.FIREBASE_CONFIG);
    window._fbAuth = firebase.auth();
    // 리다이렉트 로그인 결과 (팝업이 막힌 환경)
    window._fbAuth.getRedirectResult().catch(e => {
        if (e && e.code && e.code !== 'auth/no-auth-event') showToast('로그인 실패: ' + e.message, 'error');
    });
    window._fbAuth.onAuthStateChanged(user => {
        // 데이터 로드 전에는 보류, initBackend 끝에서 한 번 적용
        if (!AppState.isSignedIn) { AppState.pendingAuthUser = user; return; }
        applyAuthState(user);
    });
}

// ── 초기화 ────────────────────────────────────────────────────────────────
async function initBackend() {
    if (!CONFIG.FIREBASE_DB_URL || CONFIG.FIREBASE_DB_URL === 'YOUR_FIREBASE_DB_URL_HERE') {
        updateEditModeUI('no-config');
        return;
    }

    updateEditModeUI('loading');
    initFirebaseAuth();

    try {
        await loadAllData();
    } catch (e) {
        updateEditModeUI('error');
        showToast('서버 연결 실패: ' + e.message, 'error');
        console.error(e);
        return;
    }

    // 로그인 상태 반영 (로드 중 도착한 상태 또는 현재 사용자)
    const cur = (window._fbAuth && window._fbAuth.currentUser) || AppState.pendingAuthUser || null;
    AppState.pendingAuthUser = undefined;
    await applyAuthState(cur);
    showKakaoNotice(false);
}

// 카카오톡 인앱 브라우저 안내 배너
function showKakaoNotice(force) {
    const el = document.getElementById('kakao-notice');
    if (!el) return;
    if (!isKakaoInAppBrowser() && !force) { el.style.display = 'none'; return; }
    el.style.display = 'block';
    el.innerHTML = `📱 카카오톡 안에서는 구글 로그인이 막힐 수 있습니다. 보기만 할 때는 그대로 쓰고, 편집하려면
      <a href="${kakaoExternalUrl()}">외부 브라우저(Chrome/Safari)로 열기</a> 를 눌러 주세요.`;
}

// ── 편집 버튼 표시 제어 ────────────────────────────────────────────────────
function updateEditButtonsVisibility() {
    document.body.classList.toggle('is-editor', AppState.isEditor);
    document.body.classList.toggle('is-viewer', !AppState.isEditor);

    document.querySelectorAll('.editor-only').forEach(el => {
        if (AppState.isEditor) {
            el.removeAttribute('disabled');
            el.removeAttribute('aria-disabled');
            el.title = '';
        } else {
            if (el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'SELECT') {
                el.setAttribute('disabled', '');
            }
            el.setAttribute('aria-disabled', 'true');
            el.title = '편집하려면 잠금을 해제하세요';
        }
    });

    const notice = document.getElementById('role-notice');
    if (notice) {
        if (AppState.isEditor) {
            notice.style.display = 'none';
        } else {
            notice.style.display = 'block';
            notice.className = 'role-notice-banner';
            notice.textContent = AppState.user
                ? `👀 읽기 전용 — ${AppState.user.email} 계정은 아직 편집 권한이 없습니다. 오른쪽 위 "편집 권한 요청"을 눌러 주세요.`
                : '👀 읽기 전용 — 오른쪽 위 "구글로 로그인"을 누르면 편집할 수 있습니다 (편집자로 등록된 계정만).';
        }
    }
}

async function loadAllData() {
    await loadRoster();
    await loadMatches();
    await loadVenues();
    AppState.isSignedIn = true;
    renderTab1();
    showToast('데이터 로드 완료!');
}

// ── 명단 ──────────────────────────────────────────────────────────────────
async function loadRoster() {
    const data = await fbGet(DB_NODES.roster);
    if (data && typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length) {
        AppState.roster = {};
        for (const [name, v] of Object.entries(data)) {
            AppState.roster[name] = normalizePlayer(name, v);
        }
    } else {
        AppState.roster = getDefaultRoster();
        await fbPut(DB_NODES.roster, AppState.roster);
    }
}

// 레거시(v1: "Member"/"Guest" 문자열) → v2 객체
function normalizePlayer(name, v) {
    if (typeof v === 'string') {
        return { name, fullName: null, role: v === 'Guest' ? 'guest' : 'member', positions: [], jerseyNo: null, aliases: [], active: true, priority: 2 };
    }
    return {
        name,
        fullName: v.fullName || null,
        role: v.role === 'guest' ? 'guest' : 'member',
        positions: Array.isArray(v.positions) ? v.positions : [],
        jerseyNo: (v.jerseyNo === 0 || v.jerseyNo) ? v.jerseyNo : null,
        aliases: Array.isArray(v.aliases) ? v.aliases : [],
        active: v.active !== false,
        priority: [1, 2, 3].includes(Number(v.priority)) ? Number(v.priority) : 2, // 1 핵심 · 2 기본 · 3 보조
    };
}

async function savePlayer(name) {
    const p = AppState.roster[name];
    if (!p) return;
    await fbPut(`/roster/${encodeURIComponent(dbKey(name))}.json`, p);
}

async function deletePlayerRecord(name) {
    await fbDelete(`/roster/${encodeURIComponent(dbKey(name))}.json`);
}

// ── 경기 기록 ─────────────────────────────────────────────────────────────
async function loadMatches() {
    const data = await fbGet(DB_NODES.matches);
    let list = [];
    if (Array.isArray(data)) {
        // v1: 배열 전체 저장 방식 → v2 레코드로 변환 (업로드 전까지의 호환)
        const seen = {};
        list = data.filter(Boolean).map(m => migrateLegacyMatch(m, seen));
        AppState.legacyMatches = true;
    } else if (data && typeof data === 'object') {
        list = Object.values(data).filter(Boolean);
        AppState.legacyMatches = false;
    }
    AppState.matches = list.sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

async function saveMatchRecord(record) {
    await fbPut(`/matches/${encodeURIComponent(dbKey(record.id))}.json`, record);
    const idx = AppState.matches.findIndex(m => m.id === record.id);
    if (idx >= 0) AppState.matches[idx] = record; else AppState.matches.push(record);
    AppState.matches.sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

async function deleteMatchRecord(id) {
    await fbDelete(`/matches/${encodeURIComponent(dbKey(id))}.json`);
    AppState.matches = AppState.matches.filter(m => m.id !== id);
}

// v1 레코드(날짜_장소_상대 ID, formation_plan 등) → v2 레코드
function migrateLegacyMatch(old, seen = {}) {
    let id = old.date || old.id;
    if (seen[id]) id = `${old.date}-${String.fromCharCode(97 + seen[old.date])}`;
    seen[old.date] = (seen[old.date] || 0) + 1;

    const quarters = {};
    QUARTERS.forEach(q => {
        const lineup = (old.formation_plan && old.formation_plan[q]) || {};
        const subsMap = (old.formation_subs && old.formation_subs[q]) || {};
        const subs = Object.entries(subsMap)
            .filter(([, n]) => n && n !== '-')
            .map(([pos, n]) => ({ in: n, out: lineup[pos] || null, pos }));
        quarters[q] = {
            formation: (old.formation_types && old.formation_types[q]) || '4-2-3-1',
            lineup: Object.fromEntries(Object.entries(lineup).filter(([, n]) => n && n !== '-')),
            coords: (old.formation_coords && old.formation_coords[q]) || {},
            subs,
        };
    });
    const stats = {};
    (old.match_stats || []).forEach(r => {
        if (r && r['이름'] && ((r['골'] || 0) || (r['어시스트'] || 0))) {
            stats[r['이름']] = { goals: r['골'] || 0, assists: r['어시스트'] || 0 };
        }
    });
    return {
        id,
        date: old.date,
        venue: old.location || '',
        opponent: old.opponent || '상대팀',
        title: `${old.location || ''} vs ${old.opponent || '상대팀'}`,
        timeSlot: null,
        notes: '',
        type: 'match',
        status: old.is_draft ? 'draft' : 'final',
        quarterCount: 4,
        onFieldSize: 11,
        attendees: old.attendees || [],
        quarters,
        scores: old.scores || {},
        scoresKnown: true,
        stats,
        events: old.match_events || [],
        source: { kind: 'app-v1', legacyId: old.id },
        updatedAt: new Date().toISOString(),
    };
}

// ── 경기장 목록 ───────────────────────────────────────────────────────────
async function loadVenues() {
    try {
        const v = await fbGet(DB_NODES.venues);
        AppState.venues = Array.isArray(v) && v.length ? v : [...DEFAULT_VENUES];
    } catch {
        AppState.venues = [...DEFAULT_VENUES];
    }
    // 구버전 localStorage 커스텀 경기장 병합
    try {
        const local = JSON.parse(localStorage.getItem('fc_barza_venues') || '[]');
        local.forEach(v => { if (v && !AppState.venues.includes(v)) AppState.venues.push(v); });
    } catch { /* ignore */ }
}

async function saveVenues() {
    await fbPut(DB_NODES.venues, AppState.venues);
}

// ── 기본 선수 명단 ────────────────────────────────────────────────────────
function getDefaultRoster() {
    const defaults = [
        '주열', '재훈', '경조', '민철', '현수', '우성', '현성', '형록', '형모', '선우',
        '승문', '진서', '주영', '준호', '영제', '현재', '하림', '선택', '진환', '요셉',
        '선명', '준만', '준희', '윤성', '영식', '태근', '승환', '준현', '재성', '경환',
        '민규', '지호', '지용', '세용', '영현', '정준', '성호', '경원',
    ];
    const roster = {};
    defaults.forEach(p => roster[p] = normalizePlayer(p, 'Member'));
    return roster;
}
