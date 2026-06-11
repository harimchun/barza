// =============================================
// FC 바르자 팀 매니저 - Firebase / Auth 연동
// =============================================

const DB_NODES = {
    roster: '/roster.json',
    matches: '/matches.json',
    passcode: '/settings/edit_passcode.json',
};

function dbUrl(node) {
    return CONFIG.FIREBASE_DB_URL.replace(/\/$/, '') + node;
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

// ── Firebase REST API (읽기/쓰기 모두 인증 불필요 — 규칙이 공개) ────────────
async function fbGet(node) {
    const resp = await fetch(dbUrl(node));
    if (!resp.ok) throw new Error(`DB 읽기 실패: ${resp.status}`);
    return resp.json();
}

async function fbPut(node, data) {
    const resp = await fetch(dbUrl(node), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
    });
    if (!resp.ok) throw new Error(`DB 쓰기 실패: ${resp.status}`);
}

// ── 초기화 ────────────────────────────────────────────────────────────────
async function initBackend() {
    if (!CONFIG.FIREBASE_DB_URL || CONFIG.FIREBASE_DB_URL === 'YOUR_FIREBASE_DB_URL_HERE') {
        updateEditModeUI('no-config');
        return;
    }

    updateEditModeUI('loading');

    // 데이터 + 편집 암호 로드 (읽기는 인증 불필요)
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
        if (savedKey) localStorage.removeItem(EDIT_KEY_STORAGE); // 암호 변경/미설정 → 정리
        AppState.isEditor = false;
        updateEditModeUI('locked');
    }
    updateEditButtonsVisibility();
}

// ── 편집 버튼 표시 제어 ────────────────────────────────────────────────────
function updateEditButtonsVisibility() {
    // body에 역할 클래스를 부여 → CSS에서 읽기 전용 모드 스타일 적용
    document.body.classList.toggle('is-editor', AppState.isEditor);
    document.body.classList.toggle('is-viewer', !AppState.isEditor);

    const editorOnly = document.querySelectorAll('.editor-only');
    editorOnly.forEach(el => {
        if (AppState.isEditor) {
            el.removeAttribute('disabled');
            el.removeAttribute('aria-disabled');
            el.title = '';
        } else {
            // 버튼류는 disabled, 그 외에는 aria-disabled로 표시 (CSS가 처리)
            if (el.tagName === 'BUTTON' || el.tagName === 'INPUT' || el.tagName === 'SELECT') {
                el.setAttribute('disabled', '');
            }
            el.setAttribute('aria-disabled', 'true');
            el.title = '편집하려면 잠금을 해제하세요';
        }
    });

    // tab1 읽기 전용 안내 배너
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
    AppState.isSignedIn = true;
    renderTab1();
    showToast('데이터 로드 완료!');
}

// ── 명단 ──────────────────────────────────────────────────────────────────
async function loadRoster() {
    const data = await fbGet(DB_NODES.roster);
    if (data && typeof data === 'object' && !Array.isArray(data)) {
        AppState.roster = data;
    } else {
        AppState.roster = getDefaultRoster();
        await fbPut(DB_NODES.roster, AppState.roster);
    }
}

async function saveRoster() {
    await fbPut(DB_NODES.roster, AppState.roster);
}

// ── 경기 기록 ─────────────────────────────────────────────────────────────
async function loadMatches() {
    const data = await fbGet(DB_NODES.matches);
    AppState.matches = Array.isArray(data) ? data : [];
}

async function saveMatches() {
    await fbPut(DB_NODES.matches, AppState.matches);
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
    defaults.forEach(p => roster[p] = 'Member');
    return roster;
}
