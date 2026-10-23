// =============================================
// FC 바르자 팀 매니저 - Firebase / Auth 연동 (스키마 v2)
// =============================================
//
// DB 구조 (v2):
//   /roster/{name}            { name, fullName, role:'member'|'guest', positions:[], jerseyNo, aliases:[], active }
//   /matches/{matchId}        경기 레코드 (docs/data-schema.md 참고)
//   /settings/venues          ["잠실유수지", ...]
//   /settings/edit_passcode   편집 암호 해시
//   /settings/schemaVersion   2
//
// 쓰기는 항상 레코드 단위(/matches/{id}, /roster/{name})로 하여 동시 편집 시 다른 레코드를 덮어쓰지 않는다.

const DB_NODES = {
    roster: '/roster.json',
    matches: '/matches.json',
    venues: '/settings/venues.json',
    passcode: '/settings/edit_passcode.json',
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

// 현재 익명 사용자(또는 없음)의 ID 토큰 — 쓰기 요청에 첨부
async function getIdToken() {
    try {
        const u = window._fbAuth && window._fbAuth.currentUser;
        return u ? await u.getIdToken() : null;
    } catch { return null; }
}

// ── 편집 암호 해시 (공유 암호 기반 편집 권한) ──────────────────────────────
const EDIT_KEY_STORAGE = 'fc_barza_edit_key'; // localStorage: 마지막으로 통과한 암호 해시
const PASSCODE_SALT = 'fc-barza-edit::';      // 해시 솔트(단순 레인보우 테이블 방지)

async function sha256Hex(text) {
    const data = new TextEncoder().encode(PASSCODE_SALT + text);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── 헤더 편집 모드 UI ──────────────────────────────────────────────────────
function updateEditModeUI(state) {
    const btn = document.getElementById('auth-btn');
    const status = document.getElementById('auth-status');
    if (!btn || !status) return;

    btn.className = 'auth-btn';
    btn.onclick = null;
    btn.disabled = false;
    btn.title = '';

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

        case 'locked':
            btn.textContent = '🔓 편집 잠금 해제';
            btn.onclick = openUnlockModal;
            status.textContent = '읽기 전용';
            break;

        case 'unlocked':
            btn.textContent = '🔒 편집 모드 (잠그기)';
            btn.classList.add('auth-connected');
            btn.onclick = lockEditing;
            btn.title = '클릭하면 편집을 잠급니다';
            status.textContent = '편집 모드';
            break;
    }
}

// ── 잠금 / 해제 ────────────────────────────────────────────────────────────
function unlockEditing(hash) {
    AppState.isEditor = true;
    if (hash) localStorage.setItem(EDIT_KEY_STORAGE, hash);
    updateEditModeUI('unlocked');
    updateEditButtonsVisibility();
}

function lockEditing() {
    AppState.isEditor = false;
    localStorage.removeItem(EDIT_KEY_STORAGE);
    updateEditModeUI('locked');
    updateEditButtonsVisibility();
    showToast('편집 모드를 잠갔습니다. 🔒');
}

// ── 편집 암호 로드 / 저장 ──────────────────────────────────────────────────
async function loadEditPasscode() {
    try {
        const v = await fbGet(DB_NODES.passcode);
        AppState.editPasscodeHash = (typeof v === 'string' && v) ? v : null;
    } catch {
        AppState.editPasscodeHash = null;
    }
}

async function saveEditPasscode(hash) {
    await fbPut(DB_NODES.passcode, hash);
    AppState.editPasscodeHash = hash;
}

// ── 편집 암호 입력 모달 ────────────────────────────────────────────────────
function openPasscodeModal({ title, desc, confirmLabel = '확인', onConfirm }) {
    const overlay = document.getElementById('passcode-modal');
    const input = document.getElementById('passcode-input');
    const confirmBtn = document.getElementById('passcode-confirm');
    const cancelBtn = document.getElementById('passcode-cancel');
    if (!overlay || !input) return;

    document.getElementById('passcode-modal-title').textContent = title;
    document.getElementById('passcode-modal-desc').textContent = desc || '';
    confirmBtn.textContent = confirmLabel;
    input.value = '';
    overlay.style.display = 'flex';
    setTimeout(() => input.focus(), 50);

    const cleanup = () => {
        confirmBtn.onclick = null;
        cancelBtn.onclick = null;
        input.onkeydown = null;
        overlay.onclick = null;
    };
    const close = () => { overlay.style.display = 'none'; cleanup(); };
    const submit = async () => {
        const val = input.value.trim();
        if (!val) { showToast('암호를 입력하세요.', 'error'); return; }
        confirmBtn.disabled = true;
        let ok = false;
        try { ok = await onConfirm(val); }
        finally { confirmBtn.disabled = false; }
        if (ok) close();
    };

    confirmBtn.onclick = submit;
    cancelBtn.onclick = close;
    input.onkeydown = (e) => {
        if (e.key === 'Enter') { e.preventDefault(); submit(); }
        else if (e.key === 'Escape') close();
    };
    overlay.onclick = (e) => { if (e.target === overlay) close(); };
}

function openUnlockModal() {
    if (!AppState.editPasscodeHash) {
        // 아직 암호가 없을 때 → 최초 설정
        openPasscodeModal({
            title: '편집 암호 설정',
            desc: '팀과 공유할 편집 암호를 정하세요. 이 암호를 아는 사람은 누구나 경기를 기록·수정할 수 있습니다.',
            confirmLabel: '설정하고 시작',
            onConfirm: async (val) => {
                try { await saveEditPasscode(await sha256Hex(val)); }
                catch (e) { showToast('암호 저장 실패: ' + e.message, 'error'); return false; }
                unlockEditing(AppState.editPasscodeHash);
                showToast('편집 암호를 설정하고 편집 모드로 전환했습니다. ✏️');
                return true;
            },
        });
    } else {
        openPasscodeModal({
            title: '편집 잠금 해제',
            desc: '편집 암호를 입력하세요.',
            confirmLabel: '잠금 해제',
            onConfirm: async (val) => {
                const hash = await sha256Hex(val);
                if (hash === AppState.editPasscodeHash) {
                    unlockEditing(hash);
                    showToast('편집 모드로 전환했습니다. ✏️');
                    return true;
                }
                showToast('암호가 올바르지 않습니다.', 'error');
                return false;
            },
        });
    }
}

// 편집 암호 변경 (편집 모드에서만 호출)
function openChangePasscodeModal() {
    if (!AppState.isEditor) { showToast('먼저 편집 잠금을 해제하세요.', 'error'); return; }
    openPasscodeModal({
        title: '편집 암호 변경',
        desc: '새 편집 암호를 입력하세요. 변경하면 기존 암호로 잠금 해제한 다른 기기는 다시 잠깁니다.',
        confirmLabel: '변경',
        onConfirm: async (val) => {
            try { await saveEditPasscode(await sha256Hex(val)); }
            catch (e) { showToast('변경 실패: ' + e.message, 'error'); return false; }
            unlockEditing(AppState.editPasscodeHash); // 현재 기기는 새 암호로 유지
            showToast('편집 암호를 변경했습니다. 🔑');
            return true;
        },
    });
}

// ── 편집 권한 체크 (외부에서 호출) ───────────────────────────────────────
function checkEditorAccess() {
    if (AppState.isEditor) return true;
    showToast('🔒 편집하려면 먼저 "편집 잠금 해제"를 눌러 암호를 입력하세요.', 'error');
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

// ── Firebase REST API ──────────────────────────────────────────────────────
async function fbGet(node) {
    if (LOCAL_DATA_MODE) {
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
            ? ' (Firebase 콘솔에서 "익명" 로그인 활성화 + 규칙 .write: "auth != null" 확인)'
            : '';
        throw new Error(`DB 쓰기 실패: ${resp.status}${hint}`);
    }
}

const fbPut = (node, data) => fbWrite(node, 'PUT', data);
const fbPatch = (node, data) => fbWrite(node, 'PATCH', data);
const fbDelete = (node) => fbWrite(node, 'DELETE');

// ── 익명 인증 (쓰기 요청 토큰 확보) ────────────────────────────────────────
async function initAnonymousAuth() {
    try {
        if (typeof firebase === 'undefined') return;
        if (!firebase.apps.length) firebase.initializeApp(CONFIG.FIREBASE_CONFIG);
        window._fbAuth = firebase.auth();
        if (!window._fbAuth.currentUser) {
            await window._fbAuth.signInAnonymously();
        }
    } catch (e) {
        console.warn('익명 인증 실패 — Firebase 콘솔에서 "익명" 로그인을 켜주세요:', e && (e.code || e.message));
    }
}

// ── 초기화 ────────────────────────────────────────────────────────────────
async function initBackend() {
    if (!CONFIG.FIREBASE_DB_URL || CONFIG.FIREBASE_DB_URL === 'YOUR_FIREBASE_DB_URL_HERE') {
        updateEditModeUI('no-config');
        return;
    }

    updateEditModeUI('loading');

    // 익명 인증 먼저 (쓰기에 필요) — 실패해도 읽기는 진행
    await initAnonymousAuth();

    try {
        await loadAllData();
        await loadEditPasscode();
    } catch (e) {
        updateEditModeUI('error');
        showToast('서버 연결 실패: ' + e.message, 'error');
        console.error(e);
        return;
    }

    // 이 기기에서 이전에 통과한 암호가 현재 암호와 같으면 편집 모드 자동 유지
    const savedKey = localStorage.getItem(EDIT_KEY_STORAGE);
    if (savedKey && AppState.editPasscodeHash && savedKey === AppState.editPasscodeHash) {
        AppState.isEditor = true;
        updateEditModeUI('unlocked');
    } else {
        if (savedKey) localStorage.removeItem(EDIT_KEY_STORAGE);
        AppState.isEditor = false;
        updateEditModeUI('locked');
    }
    updateEditButtonsVisibility();
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
            notice.textContent = AppState.editPasscodeHash
                ? '👀 읽기 전용 — 오른쪽 위 "편집 잠금 해제"에서 암호를 입력하면 편집할 수 있습니다.'
                : '👀 읽기 전용 — 오른쪽 위 "편집 잠금 해제"에서 편집 암호를 먼저 설정하세요.';
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
        return { name, fullName: null, role: v === 'Guest' ? 'guest' : 'member', positions: [], jerseyNo: null, aliases: [], active: true };
    }
    return {
        name,
        fullName: v.fullName || null,
        role: v.role === 'guest' ? 'guest' : 'member',
        positions: Array.isArray(v.positions) ? v.positions : [],
        jerseyNo: (v.jerseyNo === 0 || v.jerseyNo) ? v.jerseyNo : null,
        aliases: Array.isArray(v.aliases) ? v.aliases : [],
        active: v.active !== false,
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
