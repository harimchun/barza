// =============================================
// FC 바르자 팀 매니저 - Tab 1: 당일 경기 운영
// =============================================

// ── Tab 1 전체 렌더링 ──────────────────────────────────────────────────────
function renderTab1() {
    ensureQuarterState();
    syncMatchSettingsUI();
    renderQuarterSelector();
    renderPlayerChecklist();
    renderSquadTable();
    renderPlaytimeStats();
    renderLiveRecorder();
    renderFormationBuilder();
    updateEditModeNotice();
    renderFormationOverview();
    updateAutoSaveStatus();
}

// 쿼터 선택 버튼 (쿼터 수에 따라 4~5개)
function renderQuarterSelector() {
    const el = document.getElementById('quarter-selector');
    if (!el) return;
    el.innerHTML = editorQuarters().map(q =>
        `<button type="button" class="qbtn ${q === AppState.currentQuarter ? 'active' : ''}" data-q="${q}">${q}</button>`
    ).join('');
    const sel = document.getElementById('formation-type-select');
    if (sel) sel.value = AppState.formationTypes[AppState.currentQuarter] || '4-2-3-1';
}

// 경기 설정 셀렉트(쿼터 수·출전 인원)를 상태와 맞춤
function syncMatchSettingsUI() {
    const qc = document.getElementById('match-quarter-count');
    const of = document.getElementById('match-on-field');
    if (qc) qc.value = String(AppState.quarterCount);
    if (of) of.value = String(AppState.onFieldSize);
}

// 쿼터 수 / 출전 인원 변경
function applyMatchSettings(quarterCount, onFieldSize) {
    if (quarterCount) AppState.quarterCount = Quota.QUARTER_OPTIONS.includes(quarterCount) ? quarterCount : Quota.DEFAULT_QUARTER_COUNT;
    if (onFieldSize) AppState.onFieldSize = onFieldSize;
    ensureQuarterState();
    renderTab1();
}

function updateEditModeNotice() {
    const el = document.getElementById('edit-mode-notice');
    if (!el) return;
    if (AppState.editModeId) {
        const extra = AppState.editingExtras || {};
        const tag = extra.source && extra.source.kind === 'sheet' ? ' (스프레드시트 이관 기록)' : '';
        el.textContent = `✏️ 수정 중: ${AppState.editModeId}${tag}`;
        el.style.display = 'block';
    } else {
        el.style.display = 'none';
    }
}

// ── 전체 쿼터 포메이션 개요 ──────────────────────────────────────────────
function renderFormationOverview() {
    const grid = document.getElementById('overview-grid');
    if (grid) {
        const want = editorQuarters().map(q => `overview-canvas-${q}`).join(',');
        if (grid.dataset.canvases !== want) {
            grid.innerHTML = editorQuarters().map(q => `
              <div class="overview-quarter">
                <div class="overview-q-label">${q}</div>
                <canvas id="overview-canvas-${q}" class="overview-canvas" width="280" height="190"></canvas>
              </div>`).join('');
            grid.dataset.canvases = want;
        }
    }
    editorQuarters().forEach(q => {
        const canvas = document.getElementById(`overview-canvas-${q}`);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const W = canvas.width, H = canvas.height;

        ctx.fillStyle = '#1a4731';
        ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = 'rgba(255,255,255,0.25)';
        ctx.lineWidth = 1;
        ctx.strokeRect(4, 4, W - 8, H - 8);
        ctx.beginPath();
        ctx.moveTo(4, H / 2); ctx.lineTo(W - 4, H / 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(W / 2, H / 2, Math.min(W, H) * 0.1, 0, Math.PI * 2);
        ctx.stroke();

        const formation = AppState.formationState[q] || {};
        if (Object.keys(formation).length === 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.font = `${W * 0.07}px Pretendard, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('미배치', W / 2, H / 2);
            return;
        }

        const formationType = AppState.formationTypes[q] || '4-2-3-1';
        Object.entries(formation).filter(([, player]) => player && player !== '-').forEach(([pos, player]) => {
            const coord = getPosCoord(q, pos, formationType);
            const cx = W * (coord.left / 100);
            const cy = H * (coord.top / 100);
            const r = W * 0.038;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fillStyle = '#A50044';
            ctx.fill();
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.fillStyle = '#fff';
            ctx.font = `bold ${W * 0.055}px Pretendard, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText((player || '').slice(0, 2), cx, cy + r + 1);
        });
    });
}

// ── 참석자 체크리스트 (멤버 / 비활동 멤버 / 용병 그룹) ────────────────────
function renderPlayerChecklist() {
    const container = document.getElementById('player-checklist');
    if (!container) return;
    const { members, inactive, guests, lastSeen } = getRosterGroups();

    const item = (name) => {
        const checked = AppState.attendees.includes(name) ? 'checked' : '';
        const guest = isGuest(name);
        const safe = escapeHtml(name);
        const p = getPlayer(name) || {};
        const pos = (p.positions || []).slice(0, 2).join('·');
        const seen = guest && lastSeen[name] ? `<em>${escapeHtml(lastSeen[name].slice(5))}</em>` : '';
        return `
      <label class="player-check-item ${guest ? 'is-guest' : ''}">
        <input type="checkbox" class="player-cb" data-name="${safe}" ${checked}>
        <span>${safe}${pos ? ` <small class="pos-hint">${escapeHtml(pos)}</small>` : ''}${seen}</span>
      </label>`;
    };

    const checkedGuests = guests.filter(n => AppState.attendees.includes(n)).length;
    container.innerHTML = `
      <div class="check-group">
        <div class="check-group-title">멤버 <span class="count-badge">${members.length}</span></div>
        <div class="check-grid">${members.map(item).join('')}</div>
      </div>
      ${inactive.length ? `
      <details class="check-group">
        <summary class="check-group-title">비활동 멤버 <span class="count-badge">${inactive.length}</span></summary>
        <div class="check-grid">${inactive.map(item).join('')}</div>
      </details>` : ''}
      <details class="check-group" ${checkedGuests ? 'open' : ''}>
        <summary class="check-group-title">용병 <span class="count-badge guest">${guests.length}</span>${checkedGuests ? ` · 선택 ${checkedGuests}` : ''}</summary>
        <input type="search" id="guest-filter" placeholder="용병 이름 검색" autocomplete="off">
        <div class="check-grid" id="guest-check-grid">${guests.map(item).join('')}</div>
      </details>`;

    container.querySelectorAll('.player-cb').forEach(cb => {
        cb.addEventListener('change', () => {
            const name = cb.dataset.name;
            if (cb.checked) {
                if (!AppState.attendees.includes(name)) AppState.attendees.push(name);
            } else {
                AppState.attendees = AppState.attendees.filter(n => n !== name);
            }
            renderSquadTable();
            renderPlaytimeStats();
            renderLiveRecorder();
            renderFormationBuilder();
        });
    });

    const filter = container.querySelector('#guest-filter');
    if (filter) {
        filter.addEventListener('input', () => {
            const kw = filter.value.trim();
            container.querySelectorAll('#guest-check-grid .player-check-item').forEach(el => {
                const n = el.querySelector('.player-cb').dataset.name;
                el.style.display = (!kw || n.includes(kw)) ? '' : 'none';
            });
        });
    }
}

// ── 스쿼드 테이블 (포메이션 배치에서 자동 계산: ●=주전, ◐=교체 관여) ────────
function renderSquadTable() {
    const container = document.getElementById('squad-table-container');
    if (!container) return;
    if (AppState.attendees.length === 0) {
        container.innerHTML = '<p class="empty-hint">참석자를 선택해주세요.</p>';
        return;
    }
    const t = editorTargets();
    const qs = t.quarterKeys;
    const statusLabel = { under: '부족', over: '초과', ok: '' };
    const rows = [...AppState.attendees]
        .sort((a, b) => (t.participation[b] ? t.participation[b].credit : 0) - (t.participation[a] ? t.participation[a].credit : 0) || a.localeCompare(b, 'ko'))
        .map(name => {
            const p = t.participation[name] || { credit: 0, byQuarter: {} };
            const qCells = qs.map(q => {
                const c = p.byQuarter[q] || 0;
                const mark = c >= 1 ? '●' : c > 0 ? '◐' : '';
                return `<td class="${c > 0 ? 'check-yes' : 'check-no'}" title="${c}">${mark}</td>`;
            }).join('');
            const diff = p.credit - t.target;
            const st = p.credit === 0 ? 'unplayed' : t.status[name];
            const diffStr = p.credit === 0 ? '미출전' : `${diff > 0 ? '+' : ''}${fmtQ(diff, 1)}`;
            return `<tr class="squad-row-${st}">
      <td class="squad-name">${escapeHtml(formatPlayerName(name))}</td>
      ${qCells}
      <td class="participation-score ${st}">${fmtQ(p.credit)}</td>
      <td class="participation-diff ${st}">${diffStr}${statusLabel[st] ? ` <small>${statusLabel[st]}</small>` : ''}</td>
    </tr>`;
        }).join('');

    const perQ = qs.map(q => `<th title="${q} 출전 인원">${q}<small>${t.perQuarter[q]}</small></th>`).join('');
    container.innerHTML = `
    <table class="squad-table">
      <thead>
        <tr><th>이름</th>${perQ}<th>참여</th><th>목표 ${fmtQ(t.target)}</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="hint-text" style="margin-top:0.4rem">● 주전 1쿼터 · ◐ 교체 In/Out 0.5쿼터 · 목표 = 출전 ${t.onFieldSize}명 × ${t.quarterCount}쿼터 ÷ 참석 ${t.attendees}명 · 목표와 1쿼터 이상 차이 나면 부족/초과</p>`;
}

// 목표 쿼터 (시트의 "예상 평균쿼터")
function targetQuarters() {
    return editorTargets().target;
}

// ── 출전 시간 통계 ──────────────────────────────────────────────────────────
function renderPlaytimeStats() {
    const el = document.getElementById('playtime-stats');
    if (!el || AppState.attendees.length === 0) {
        if (el) el.innerHTML = '';
        return;
    }
    const t = editorTargets();
    const issues = [];
    if (t.under.length) issues.push(`부족 ${t.under.map(escapeHtml).join(', ')}`);
    if (t.over.length) issues.push(`초과 ${t.over.map(escapeHtml).join(', ')}`);
    if (t.unplayed.length) issues.push(`미출전 ${t.unplayed.map(escapeHtml).join(', ')}`);
    const slotNote = t.actualSlots !== t.slots ? ` · 배치 ${t.actualSlots}/${t.slots}` : '';
    el.innerHTML = `
    <div class="playtime-info">
      <span>참석 <strong>${t.attendees}명</strong></span>
      <span>목표 <strong>${fmtQ(t.target)}Q</strong></span>
      <span>실제 평균 <strong>${fmtQ(t.avg)}Q</strong></span>
      <span>범위 <strong>${fmtQ(t.min)}~${fmtQ(t.max)}Q</strong>${slotNote}</span>
    </div>
    <div class="playtime-alert ${t.balanced && !issues.length ? 'success' : 'warning'}">
      ${t.balanced && !issues.length
            ? `✅ 균형 배정 (최대-최소 ${fmtQ(t.spread)}Q)`
            : `⚠️ ${t.balanced ? '' : `최대 ${fmtQ(t.max)}Q vs 최소 ${fmtQ(t.min)}Q`}${issues.length ? (t.balanced ? '' : ' · ') + issues.join(' · ') : ''}`}
    </div>`;
}

// ── 포메이션 빌더 (피치 위 비주얼 배치) ──────────────────────────────────

// 포지션 좌표: { left%, top% } — 세로 피치 (ST=상단, GK=하단)
// ※ tools/import_sheet.py 의 PITCH_POS_COORDS 와 동일하게 유지할 것
const PITCH_POS_COORDS = {
    '4-2-3-1': {
        'ST':  { left: 50, top: 13 },
        'LW':  { left: 18, top: 28 },
        'CAM': { left: 50, top: 33 },
        'RW':  { left: 82, top: 28 },
        'LDM': { left: 35, top: 50 },
        'RDM': { left: 65, top: 50 },
        'LB':  { left: 12, top: 70 },
        'LCB': { left: 37, top: 73 },
        'RCB': { left: 63, top: 73 },
        'RB':  { left: 88, top: 70 },
        'GK':  { left: 50, top: 90 },
    },
    '4-3-3': {
        'LW':  { left: 20, top: 15 },
        'ST':  { left: 50, top: 13 },
        'RW':  { left: 80, top: 15 },
        'LCM': { left: 25, top: 42 },
        'CM':  { left: 50, top: 38 },
        'RCM': { left: 75, top: 42 },
        'LB':  { left: 12, top: 70 },
        'LCB': { left: 37, top: 73 },
        'RCB': { left: 63, top: 73 },
        'RB':  { left: 88, top: 70 },
        'GK':  { left: 50, top: 90 },
    },
    '4-4-2': {
        'LW':  { left: 35, top: 15 },
        'RW':  { left: 65, top: 15 },
        'LM':  { left: 12, top: 42 },
        'LCM': { left: 37, top: 40 },
        'RCM': { left: 63, top: 40 },
        'RM':  { left: 88, top: 42 },
        'LB':  { left: 12, top: 70 },
        'LCB': { left: 37, top: 73 },
        'RCB': { left: 63, top: 73 },
        'RB':  { left: 88, top: 70 },
        'GK':  { left: 50, top: 90 },
    },
    '3-5-2': {
        'LW':  { left: 35, top: 15 },
        'ST':  { left: 50, top: 13 },
        'RW':  { left: 65, top: 15 },
        'MF0': { left: 25, top: 42 },
        'MF1': { left: 50, top: 38 },
        'MF2': { left: 75, top: 42 },
        'LB':  { left: 12, top: 70 },
        'LCB': { left: 37, top: 73 },
        'RCB': { left: 63, top: 73 },
        'RB':  { left: 88, top: 70 },
        'GK':  { left: 50, top: 90 },
    },
};

// 포지션 → 행 키(row key) 매핑 (라벨 색상용)
function getPosRowKey(pos, fType) {
    const fDef = FORMATION_POSITIONS[fType];
    if (!fDef) return 'mf';
    for (const row of fDef.rows) {
        if (row.positions.includes(pos)) return row.key;
    }
    return 'mf';
}

// 알 수 없는 포메이션/추가 라벨(X1 등)도 렌더링할 수 있도록 포지션 목록을 동적으로 구성
function getFormationPositions(q, fType) {
    const fDef = FORMATION_POSITIONS[fType];
    const base = fDef ? fDef.rows.flatMap(row => row.positions) : [];
    const extra = Object.keys(AppState.formationState[q] || {}).filter(p => !base.includes(p));
    return [...base, ...extra];
}

function fbRefresh() {
    renderFormationBuilder();
    renderSquadTable();
    renderPlaytimeStats();
    renderFormationOverview();
}

// 주전 선택 (드롭다운)
function fbApplyMain(q, pos, val) {
    const fMap = AppState.formationState[q];
    if (val === '-') delete fMap[pos]; else fMap[pos] = val;
    fbRefresh();
}

// 교체 선택 (드롭다운)
function fbApplySub(q, pos, val) {
    const fSubs = AppState.formationSubs[q];
    if (val === '-') delete fSubs[pos]; else fSubs[pos] = val;
    fbRefresh();
}

// 포지션 카드 좌표: 사용자 드래그 오버라이드 → 포메이션 기본값 순
function getPosCoord(q, pos, fType) {
    const custom = AppState.formationCoords && AppState.formationCoords[q] && AppState.formationCoords[q][pos];
    if (custom && typeof custom.left === 'number' && typeof custom.top === 'number') return custom;
    return (PITCH_POS_COORDS[fType] || {})[pos] || { left: 50, top: 50 };
}

function renderFormationBuilder() {
    const container = document.getElementById('formation-builder');
    if (!container) return;

    const q = AppState.currentQuarter;
    const fType = AppState.formationTypes[q];
    const bench = document.getElementById('formation-bench');
    const fMap = AppState.formationState[q];
    const fSubs = AppState.formationSubs[q];
    const extra = AppState.extraSubs[q] || [];

    // ── 벤치 (현재 쿼터에 주전/교체로 배정되지 않은 참석자) ──
    const assigned = new Set();
    Object.values(fMap).forEach(n => { if (n && n !== '-') assigned.add(n); });
    Object.values(fSubs).forEach(n => { if (n && n !== '-') assigned.add(n); });
    extra.forEach(s => { if (s.in) assigned.add(s.in); if (s.out) assigned.add(s.out); });
    const benchPlayers = AppState.attendees.filter(n => !assigned.has(n));

    if (bench) {
        const target = targetQuarters();
        const chips = benchPlayers.map(n => {
            const part = getParticipation(n);
            const pLabel = `<em>${fmtQ(part)}/${target.toFixed(1)}</em>`;
            return `<span class="bench-chip${isGuest(n) ? ' is-guest' : ''}">${escapeHtml(n)}${pLabel}</span>`;
        }).join('');
        const extraHtml = extra.length
            ? `<div class="extra-subs">기타 교체: ${extra.map((s, i) =>
                `<span class="extra-sub">${escapeHtml(s.in || '?')} → ${escapeHtml(s.out || '?')} <button type="button" class="extra-sub-del" data-idx="${i}" title="삭제">✕</button></span>`).join(' ')}</div>`
            : '';
        bench.innerHTML = `
      <div class="bench-head">
        <span class="bench-title">🪑 미배치 <span class="bench-count">${benchPlayers.length}</span></span>
        <span class="bench-hint">선수는 카드의 드롭다운으로 선택 · 카드를 끌면 위치 자유 조정 · 칩의 숫자는 참여/목표 쿼터</span>
      </div>
      <div class="bench-chips">${
            AppState.attendees.length === 0
                ? '<span class="empty-hint">참석자를 먼저 선택하세요.</span>'
                : (chips || '<span class="empty-hint">모든 참석자가 배치되었습니다. ⚽</span>')
        }</div>${extraHtml}`;
        bench.querySelectorAll('.extra-sub-del').forEach(btn => btn.addEventListener('click', () => {
            AppState.extraSubs[q].splice(parseInt(btn.dataset.idx, 10), 1);
            fbRefresh();
        }));
    }

    // 선수 드롭다운 옵션 (다른 포지션 주전/교체로 배정된 선수 제외)
    function buildOptions(pos, type) {
        const current = type === 'main' ? (fMap[pos] || '-') : (fSubs[pos] || '-');
        const assignedOther = new Set();
        for (const [p, player] of Object.entries(fMap)) {
            if (p !== pos && player && player !== '-') assignedOther.add(player);
        }
        for (const [p, s] of Object.entries(fSubs)) {
            if (p !== pos && s && s !== '-') assignedOther.add(s);
        }
        // 참석자 목록에 없는 이름이 배정돼 있으면(이관 기록 등) 옵션에 유지
        const pool = [...AppState.attendees];
        if (current !== '-' && !pool.includes(current)) pool.push(current);
        const opts = pool.filter(n => {
            if (n === current) return true;
            if (assignedOther.has(n)) return false;
            if (type === 'sub') return n !== (fMap[pos] || '');
            return true;
        });
        const optionHtml = opts.map(n =>
            `<option value="${escapeHtml(n)}" ${n === current ? 'selected' : ''}>${escapeHtml(formatPlayerName(n))}</option>`
        ).join('');
        const noneLabel = type === 'main' ? '선택' : '교체 없음';
        return `<option value="-" ${current === '-' ? 'selected' : ''}>${noneLabel}</option>${optionHtml}`;
    }

    const locks = AppState.locks[q] || {};
    const reasons = AppState.draftReasons[q] || {};
    function buildPosCell(pos) {
        const label = (POSITION_DISPLAY_LABELS[fType] || {})[pos] || pos;
        const coord = getPosCoord(q, pos, fType);
        const rowKey = getPosRowKey(pos, fType);
        const hasSub = fSubs[pos] && fSubs[pos] !== '-';
        const filled = fMap[pos] && fMap[pos] !== '-';
        const locked = !!locks[pos] && filled;
        const r = reasons[pos];
        const reasonHtml = (filled && r && r.name === fMap[pos] && !locked)
            ? `<span class="pos-reason pos-reason-${escapeHtml(r.reason)}" title="자동 초안 근거: ${escapeHtml(AutoDraft.reasonLabel(r))}">${escapeHtml(AutoDraft.reasonLabel(r))}</span>` : '';
        return `
      <div class="pos-cell ${filled ? 'is-filled' : ''} ${hasSub ? 'has-sub' : ''} ${locked ? 'is-locked' : ''}" data-pos="${escapeHtml(pos)}" style="left:${coord.left}%;top:${coord.top}%">
        <button type="button" class="pos-lock-toggle ${locked ? 'active' : ''}" data-pos="${escapeHtml(pos)}" title="${locked ? '잠금 해제 (자동 초안이 바꿀 수 있음)' : '이 자리 잠그기 (자동 초안이 유지)'}" aria-label="자리 잠금">${locked ? '🔒' : '🔓'}</button>
        <button type="button" class="pos-sub-toggle ${hasSub ? 'active' : ''}" data-pos="${escapeHtml(pos)}" title="교체 선수 지정/해제" aria-label="교체 선수 지정">⇄</button>
        <div class="pos-badge pos-badge-${rowKey}" title="드래그하여 위치 이동">${escapeHtml(label)}</div>
        <select class="pos-main-sel" data-pos="${escapeHtml(pos)}" aria-label="${escapeHtml(label)} 선수">${buildOptions(pos, 'main')}</select>
        ${reasonHtml}
        <select class="pos-sub-sel ${hasSub ? 'show' : ''}" data-pos="${escapeHtml(pos)}" aria-label="${escapeHtml(label)} 교체 선수">${buildOptions(pos, 'sub')}</select>
      </div>`;
    }

    const positionsHtml = getFormationPositions(q, fType).map(pos => buildPosCell(pos)).join('');

    container.innerHTML = `
    <div class="pitch-title">FC BARZA · ${escapeHtml(q)} · ${escapeHtml(fType)}</div>
    <div class="pitch-lines"></div>
    <div class="pitch-center-circle"></div>
    <div class="pitch-penalty-top"></div>
    <div class="pitch-penalty-bottom"></div>
    ${positionsHtml}`;

    container.querySelectorAll('.pos-sub-sel').forEach(sel => {
        sel.addEventListener('change', () => fbApplySub(q, sel.dataset.pos, sel.value));
        sel.addEventListener('pointerdown', e => e.stopPropagation());
    });

    container.querySelectorAll('.pos-lock-toggle').forEach(btn => {
        btn.addEventListener('pointerdown', e => e.stopPropagation());
        btn.addEventListener('click', () => {
            const pos = btn.dataset.pos;
            if (!fMap[pos] || fMap[pos] === '-') { showToast('선수를 먼저 배치한 뒤 잠글 수 있습니다.', 'error'); return; }
            if (!AppState.locks[q]) AppState.locks[q] = {};
            if (AppState.locks[q][pos]) delete AppState.locks[q][pos]; else AppState.locks[q][pos] = true;
            renderFormationBuilder();
        });
    });

    container.querySelectorAll('.pos-sub-toggle').forEach(btn => {
        btn.addEventListener('pointerdown', e => e.stopPropagation());
        btn.addEventListener('click', () => {
            const pos = btn.dataset.pos;
            const cell = btn.closest('.pos-cell');
            const subSel = container.querySelector(`.pos-sub-sel[data-pos="${CSS.escape(pos)}"]`);
            const turningOn = !btn.classList.contains('active');
            if (turningOn) {
                btn.classList.add('active');
                if (cell) cell.classList.add('has-sub');
                if (subSel) { subSel.classList.add('show'); subSel.focus(); }
            } else {
                fbApplySub(q, pos, '-');
            }
        });
    });

    container.querySelectorAll('.pos-main-sel').forEach(sel => {
        sel.addEventListener('change', () => fbApplyMain(q, sel.dataset.pos, sel.value));
        sel.addEventListener('pointerdown', e => e.stopPropagation());
    });

    // ── 포지션 카드 자유 이동 (전술 보드처럼 드래그) ──
    container.querySelectorAll('.pos-cell').forEach(cell => {
        cell.addEventListener('pointerdown', e => {
            if (e.button !== undefined && e.button !== 0) return;
            if (e.target.closest('select, .pos-sub-toggle')) return;

            const pos = cell.dataset.pos;
            const rect = container.getBoundingClientRect();
            const startX = e.clientX, startY = e.clientY;
            const topMin = (34 / rect.height) * 100 + 4;
            let moved = false;

            const onMove = ev => {
                if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return;
                moved = true;
                cell.classList.add('dragging');
                let left = ((ev.clientX - rect.left) / rect.width) * 100;
                let top = ((ev.clientY - rect.top) / rect.height) * 100;
                left = Math.min(93, Math.max(7, left));
                top = Math.min(95, Math.max(topMin, top));
                cell.style.left = left.toFixed(1) + '%';
                cell.style.top = top.toFixed(1) + '%';
                ev.preventDefault();
            };

            const finish = () => {
                cell.removeEventListener('pointermove', onMove);
                cell.removeEventListener('pointerup', onUp);
                cell.removeEventListener('pointercancel', onUp);
                try { cell.releasePointerCapture(e.pointerId); } catch { /* 합성 이벤트 등 */ }
                cell.classList.remove('dragging');
            };

            const onUp = () => {
                finish();
                if (moved) {
                    if (!AppState.formationCoords[q]) AppState.formationCoords[q] = {};
                    AppState.formationCoords[q][pos] = {
                        left: parseFloat(cell.style.left),
                        top: parseFloat(cell.style.top),
                    };
                    renderFormationOverview();
                }
            };

            try { cell.setPointerCapture(e.pointerId); } catch { /* 합성 이벤트 등 */ }
            cell.addEventListener('pointermove', onMove);
            cell.addEventListener('pointerup', onUp);
            cell.addEventListener('pointercancel', onUp);
        });
    });
}

// ── 자동 초안 (선호 포지션 + 쿼터 균형) ──────────────────────────────────
function runAutoDraft() {
    if (!checkEditorAccess()) return;
    if (AppState.attendees.length === 0) { showToast('참석자를 먼저 선택하세요.', 'error'); return; }
    const qs = editorQuarters();
    const hasAny = qs.some(q => Object.keys(AppState.formationState[q] || {}).length > 0);
    const lockCount = qs.reduce((n, q) => n + Object.keys(AppState.locks[q] || {}).filter(p => AppState.formationState[q] && AppState.formationState[q][p]).length, 0);
    if (hasAny && AppState.draftSeed === 0) {
        if (!confirm(`기존 배치를 자동 초안으로 덮어씁니다.${lockCount ? ` 잠근 ${lockCount}자리는 유지됩니다.` : ' (유지할 자리는 🔒 로 잠근 뒤 실행하세요)'} 계속할까요?`)) return;
    }
    const positions = {};
    AppState.attendees.forEach(n => { positions[n] = (getPlayer(n) || {}).positions || []; });
    const formationSlots = {};
    Object.entries(FORMATION_POSITIONS).forEach(([f, def]) => { formationSlots[f] = def.rows.flatMap(r => r.positions); });
    const locks = {};
    qs.forEach(q => {
        locks[q] = {};
        Object.keys(AppState.locks[q] || {}).forEach(pos => {
            const n = (AppState.formationState[q] || {})[pos];
            if (n && n !== '-') locks[q][pos] = n;
        });
    });
    AppState.draftSeed += 1;
    const result = AutoDraft.generate({
        attendees: AppState.attendees, positions,
        quarterCount: AppState.quarterCount, onFieldSize: AppState.onFieldSize,
        formations: AppState.formationTypes, formationSlots, locks,
        seed: AppState.draftSeed * 7919 + AppState.attendees.length,
    });
    qs.forEach(q => {
        AppState.formationState[q] = { ...result.quarters[q].lineup };
        AppState.formationSubs[q] = {};
        AppState.extraSubs[q] = [];
        AppState.draftReasons[q] = result.quarters[q].reasons;
    });
    fbRefresh();
    const t = editorTargets();
    const msg = `✨ 초안 ${AppState.draftSeed}번째 · 목표 ${fmtQ(t.target)}Q · 실제 ${fmtQ(t.min)}~${fmtQ(t.max)}Q`;
    showToast(msg, result.warnings.length ? 'error' : 'success');
    result.warnings.forEach(w => showToast('⚠️ ' + w, 'error'));
}

// ── 이벤트 → 스코어/스탯 자동 계산 ─────────────────────────────────────────
function recalcFromEvents() {
    AppState.quarterScores = {};
    editorQuarters().forEach(q => { AppState.quarterScores[q] = [0, 0]; });
    AppState.matchStats = {};

    AppState.matchEvents.forEach(ev => {
        const q = ev.quarter;
        if (!AppState.quarterScores[q]) AppState.quarterScores[q] = [0, 0];
        if (ev.type === 'goal') {
            AppState.quarterScores[q][0] += 1;
            if (ev.scorer) {
                if (!AppState.matchStats[ev.scorer]) AppState.matchStats[ev.scorer] = { goals: 0, assists: 0 };
                AppState.matchStats[ev.scorer].goals += 1;
            }
            if (ev.assister) {
                if (!AppState.matchStats[ev.assister]) AppState.matchStats[ev.assister] = { goals: 0, assists: 0 };
                AppState.matchStats[ev.assister].assists += 1;
            }
        } else if (ev.type === 'opponentGoal') {
            AppState.quarterScores[q][1] += 1;
        }
    });
}

// ── 실시간 기록판 ────────────────────────────────────────────────────────────
function renderLiveRecorder() {
    const container = document.getElementById('live-recorder');
    if (!container) return;

    if (AppState.attendees.length === 0) {
        container.innerHTML = '<p class="empty-hint">참석자를 선택하면 기록이 활성화됩니다.</p>';
        return;
    }

    const lq = AppState.liveQuarter;
    const hasEvents = AppState.matchEvents.length > 0;

    const totalUs = editorQuarters().reduce((a, q) => a + AppState.quarterScores[q][0], 0);
    const totalThem = editorQuarters().reduce((a, q) => a + AppState.quarterScores[q][1], 0);

    const playerOpts = AppState.attendees.map(n =>
        `<option value="${escapeHtml(n)}">${escapeHtml(formatPlayerName(n))}</option>`
    ).join('');

    const playerOptionsWith = (selected) => {
        const names = (!selected || AppState.attendees.includes(selected))
            ? AppState.attendees
            : [selected, ...AppState.attendees];
        return names.map(n =>
            `<option value="${escapeHtml(n)}" ${n === selected ? 'selected' : ''}>${escapeHtml(formatPlayerName(n))}</option>`
        ).join('');
    };
    const quarterOptions = (selected) =>
        editorQuarters().map(qq => `<option value="${qq}" ${qq === selected ? 'selected' : ''}>${qq}</option>`).join('');

    const buildEditForm = (ev, globalIdx) => {
        const fields = ev.type === 'goal'
            ? `<select class="ev-edit-quarter" aria-label="쿼터">${quarterOptions(ev.quarter)}</select>
               <select class="ev-edit-scorer" aria-label="득점자">${playerOptionsWith(ev.scorer)}</select>
               <select class="ev-edit-assister" aria-label="도움"><option value="">👟 도움 없음</option>${playerOptionsWith(ev.assister)}</select>`
            : `<select class="ev-edit-quarter" aria-label="쿼터">${quarterOptions(ev.quarter)}</select>
               <span class="ev-edit-label">🔴 상대팀 득점</span>`;
        return `<div class="event-item event-edit-form">
              <div class="ev-edit-fields">${fields}</div>
              <div class="ev-edit-actions">
                <button class="ev-edit-save" data-idx="${globalIdx}">저장</button>
                <button class="ev-edit-cancel">취소</button>
              </div>
            </div>`;
    };

    const eventsHtml = editorQuarters().map(q => {
        const qEvents = AppState.matchEvents.filter(e => e.quarter === q);
        const [us, them] = AppState.quarterScores[q];
        const evList = qEvents.length === 0
            ? '<span class="empty-hint" style="font-size:0.75rem">기록 없음</span>'
            : qEvents.map((ev) => {
                const globalIdx = AppState.matchEvents.indexOf(ev);
                if (globalIdx === AppState.editingEventIdx) return buildEditForm(ev, globalIdx);
                const actions = `<span class="event-actions">
                      <button class="event-edit" data-idx="${globalIdx}" title="수정">✎</button>
                      <button class="event-delete" data-idx="${globalIdx}" title="삭제">✕</button>
                    </span>`;
                if (ev.type === 'goal') {
                    const assStr = ev.assister ? `, 👟 ${escapeHtml(ev.assister)}` : '';
                    return `<div class="event-item event-goal"><span>⚽ ${escapeHtml(ev.scorer)}${assStr}</span>${actions}</div>`;
                }
                return `<div class="event-item event-opponent"><span>🔴 상대팀 득점</span>${actions}</div>`;
            }).join('');

        return `<div class="event-quarter-block ${q === lq ? 'active-quarter' : ''}">
          <div class="event-quarter-header">
            <span class="event-q-label">${q}</span>
            <span class="event-q-score">${us} : ${them}</span>
          </div>
          <div class="event-list">${evList}</div>
        </div>`;
    }).join('');

    // 이벤트 로그가 없는 기록(시트 이관분)은 쿼터 스코어/선수 스탯을 직접 입력
    const manualHtml = !hasEvents ? `
    <details class="manual-score" ${AppState.editModeId ? 'open' : ''}>
      <summary>✍️ 스코어·골·어시스트 직접 입력 (이벤트 로그 없이 합계만 기록)</summary>
      <div class="manual-score-grid">
        ${editorQuarters().map(q => `
          <label>${q}
            <input type="number" min="0" class="manual-us" data-q="${q}" value="${AppState.quarterScores[q][0]}" aria-label="${q} 득점">
            :
            <input type="number" min="0" class="manual-them" data-q="${q}" value="${AppState.quarterScores[q][1]}" aria-label="${q} 실점">
          </label>`).join('')}
      </div>
      <table class="manual-stats-table">
        <thead><tr><th>이름</th><th>⚽ 골</th><th>👟 도움</th></tr></thead>
        <tbody>${AppState.attendees.map(n => {
            const s = AppState.matchStats[n] || { goals: 0, assists: 0 };
            return `<tr><td>${escapeHtml(formatPlayerName(n))}</td>
              <td><input type="number" min="0" class="manual-goals" data-name="${escapeHtml(n)}" value="${s.goals || 0}"></td>
              <td><input type="number" min="0" class="manual-assists" data-name="${escapeHtml(n)}" value="${s.assists || 0}"></td></tr>`;
        }).join('')}</tbody>
      </table>
    </details>` : '';

    container.innerHTML = `
    <div class="live-score-summary">
      <span class="live-team-name">FC 바르자</span>
      <span class="live-total-score">${totalUs} : ${totalThem}</span>
      <span class="live-team-name">${escapeHtml(AppState.matchOpponent || '상대팀')}</span>
    </div>

    <div class="live-input-section">
      <div class="live-quarter-selector">
        ${editorQuarters().map(q => `<button class="live-qbtn ${q === lq ? 'active' : ''}" data-q="${q}">${q}</button>`).join('')}
      </div>
      <div class="live-action-row">
        <select id="live-scorer" class="live-select">
          <option value="">⚽ 득점자 선택</option>
          ${playerOpts}
        </select>
        <select id="live-assister" class="live-select">
          <option value="">👟 어시스트 없음</option>
          ${playerOpts}
        </select>
        <button id="live-add-goal" class="btn-goal">⚽ 골!</button>
      </div>
      <div class="live-action-row" style="margin-top:0.3rem">
        <button id="live-add-opponent-goal" class="btn-opponent-goal">🔴 상대팀 득점</button>
      </div>
    </div>

    <div class="event-log">${eventsHtml}</div>
    ${manualHtml}`;

    container.querySelectorAll('.live-qbtn').forEach(btn => {
        btn.addEventListener('click', () => {
            AppState.liveQuarter = btn.dataset.q;
            renderLiveRecorder();
        });
    });

    document.getElementById('live-add-goal').addEventListener('click', () => {
        const scorer = document.getElementById('live-scorer').value;
        if (!scorer) { showToast('득점자를 선택해주세요.', 'error'); return; }
        const assister = document.getElementById('live-assister').value;
        AppState.matchEvents.push({ quarter: AppState.liveQuarter, type: 'goal', scorer, assister: assister || null });
        recalcFromEvents();
        renderLiveRecorder();
        showToast(`⚽ ${scorer} 골!${assister ? ` (👟 ${assister})` : ''}`);
    });

    document.getElementById('live-add-opponent-goal').addEventListener('click', () => {
        AppState.matchEvents.push({ quarter: AppState.liveQuarter, type: 'opponentGoal', scorer: null, assister: null });
        recalcFromEvents();
        renderLiveRecorder();
        showToast('🔴 상대팀 득점');
    });

    container.querySelectorAll('.event-delete').forEach(btn => {
        btn.addEventListener('click', () => removeMatchEvent(parseInt(btn.dataset.idx, 10)));
    });
    container.querySelectorAll('.event-edit').forEach(btn => {
        btn.addEventListener('click', () => {
            AppState.editingEventIdx = parseInt(btn.dataset.idx, 10);
            renderLiveRecorder();
        });
    });
    container.querySelectorAll('.ev-edit-cancel').forEach(btn => {
        btn.addEventListener('click', () => {
            AppState.editingEventIdx = null;
            renderLiveRecorder();
        });
    });
    container.querySelectorAll('.ev-edit-save').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.idx, 10);
            const ev = AppState.matchEvents[idx];
            const form = btn.closest('.event-edit-form');
            if (!ev || !form) { AppState.editingEventIdx = null; renderLiveRecorder(); return; }
            const qSel = form.querySelector('.ev-edit-quarter');
            const newQuarter = qSel ? qSel.value : ev.quarter;
            if (ev.type === 'goal') {
                const scorer = form.querySelector('.ev-edit-scorer').value;
                if (!scorer) { showToast('득점자를 선택해주세요.', 'error'); return; }
                const assister = form.querySelector('.ev-edit-assister').value || null;
                if (assister && assister === scorer) { showToast('득점자와 도움이 같을 수 없습니다.', 'error'); return; }
                ev.scorer = scorer;
                ev.assister = assister;
            }
            ev.quarter = newQuarter;
            AppState.editingEventIdx = null;
            AppState.liveQuarter = newQuarter;
            recalcFromEvents();
            renderLiveRecorder();
            showToast('기록을 수정했습니다. ✏️');
        });
    });

    // 수동 입력 (이벤트 로그 없는 경우)
    const summaryEl = container.querySelector('.live-score-summary .live-total-score');
    const syncSummary = () => {
        const u = editorQuarters().reduce((a, q) => a + AppState.quarterScores[q][0], 0);
        const t = editorQuarters().reduce((a, q) => a + AppState.quarterScores[q][1], 0);
        if (summaryEl) summaryEl.textContent = `${u} : ${t}`;
        container.querySelectorAll('.event-quarter-block').forEach((blk, i) => {
            const s = blk.querySelector('.event-q-score');
            if (s) s.textContent = `${AppState.quarterScores[editorQuarters()[i]][0]} : ${AppState.quarterScores[editorQuarters()[i]][1]}`;
        });
    };
    container.querySelectorAll('.manual-us, .manual-them').forEach(inp => {
        inp.addEventListener('input', () => {
            const q = inp.dataset.q;
            const idx = inp.classList.contains('manual-us') ? 0 : 1;
            AppState.quarterScores[q][idx] = Math.max(0, parseInt(inp.value, 10) || 0);
            syncSummary();
        });
    });
    container.querySelectorAll('.manual-goals, .manual-assists').forEach(inp => {
        inp.addEventListener('input', () => {
            const n = inp.dataset.name;
            if (!AppState.matchStats[n]) AppState.matchStats[n] = { goals: 0, assists: 0 };
            AppState.matchStats[n][inp.classList.contains('manual-goals') ? 'goals' : 'assists'] = Math.max(0, parseInt(inp.value, 10) || 0);
        });
    });
}

function removeMatchEvent(idx) {
    AppState.matchEvents.splice(idx, 1);
    AppState.editingEventIdx = null;
    recalcFromEvents();
    renderLiveRecorder();
}

// ── 자동저장 ─────────────────────────────────────────────────────────────────
function startAutoSave() {
    stopAutoSave();
    AppState.autoSaveTimer = setInterval(async () => {
        if (!AppState.isEditor || AppState.attendees.length === 0) return;
        // 이미 확정된 기록을 수정 중일 때는 자동저장으로 임시 상태로 되돌리지 않음
        if (AppState.editModeId) {
            const cur = AppState.matches.find(m => m.id === AppState.editModeId);
            if (cur && cur.status === 'final') return;
        }
        try {
            await handleSave(true, true);
            AppState.lastAutoSave = new Date();
            updateAutoSaveStatus();
        } catch (e) {
            console.error('자동저장 실패:', e);
        }
    }, 2 * 60 * 1000);
}

function stopAutoSave() {
    if (AppState.autoSaveTimer) {
        clearInterval(AppState.autoSaveTimer);
        AppState.autoSaveTimer = null;
    }
}

function updateAutoSaveStatus() {
    const el = document.getElementById('autosave-status');
    if (!el) return;
    if (AppState.lastAutoSave) {
        const t = AppState.lastAutoSave;
        const hh = String(t.getHours()).padStart(2, '0');
        const mm = String(t.getMinutes()).padStart(2, '0');
        el.textContent = `💾 자동저장: ${hh}:${mm} (2분 간격, 새 경기만)`;
    } else {
        el.textContent = '💾 자동저장: 새 경기는 2분 간격으로 임시 저장됩니다';
    }
}

// ── Tab 1 이벤트 초기화 ────────────────────────────────────────────────────
function initTab1Events() {
    document.getElementById('match-date').addEventListener('change', e => {
        AppState.matchDate = e.target.value;
    });

    const locSel = document.getElementById('match-location');
    locSel.addEventListener('change', e => {
        const val = e.target.value;
        if (val === '__custom__') {
            document.getElementById('venue-custom-row').style.display = 'flex';
            document.getElementById('venue-custom-input').focus();
        } else {
            document.getElementById('venue-custom-row').style.display = 'none';
            AppState.matchLocation = val;
        }
    });

    document.getElementById('venue-add-btn').addEventListener('click', async () => {
        const inp = document.getElementById('venue-custom-input');
        const name = inp.value.trim();
        if (!name) return;
        await addVenue(name);
        AppState.matchLocation = name;
        populateVenueSelect(name);
        document.getElementById('venue-custom-row').style.display = 'none';
        inp.value = '';
        showToast(`경기장 "${name}" 추가 완료!`);
    });
    document.getElementById('venue-custom-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('venue-add-btn').click();
    });
    document.getElementById('match-opponent').addEventListener('input', e => {
        AppState.matchOpponent = e.target.value;
    });

    // 게스트 추가
    document.getElementById('add-guest-btn').addEventListener('click', async () => {
        const inp = document.getElementById('guest-name-input');
        const name = inp.value.trim().replace(/\s+/g, '');
        if (!name) return;
        if (!AppState.roster[name]) {
            AppState.roster[name] = normalizePlayer(name, { role: 'guest', fullName: name.length >= 3 ? name : null });
            try { await savePlayer(name); }
            catch (e) { showToast('용병 저장 실패: ' + e.message, 'error'); }
        }
        if (!AppState.attendees.includes(name)) AppState.attendees.push(name);
        inp.value = '';
        renderPlayerChecklist();
        renderSquadTable();
        renderPlaytimeStats();
        renderLiveRecorder();
        renderFormationBuilder();
        showToast(`${name} (용병) 추가 완료!`);
    });
    document.getElementById('guest-name-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('add-guest-btn').click();
    });

    // 쿼터 수 / 출전 인원
    const qcSel = document.getElementById('match-quarter-count');
    if (qcSel) qcSel.addEventListener('change', e => applyMatchSettings(parseInt(e.target.value, 10), null));
    const ofSel = document.getElementById('match-on-field');
    if (ofSel) ofSel.addEventListener('change', e => applyMatchSettings(null, parseInt(e.target.value, 10)));

    // 쿼터 선택
    document.getElementById('quarter-selector').addEventListener('click', e => {
        const btn = e.target.closest('.qbtn');
        if (!btn) return;
        AppState.currentQuarter = btn.dataset.q;
        renderQuarterSelector();
        renderFormationBuilder();
    });

    // 포메이션 타입 변경
    document.getElementById('formation-type-select').addEventListener('change', e => {
        const q = AppState.currentQuarter;
        AppState.formationTypes[q] = e.target.value;
        AppState.formationState[q] = {};
        AppState.formationSubs[q] = {};
        AppState.formationCoords[q] = {};
        AppState.locks[q] = {};
        AppState.draftReasons[q] = {};
        fbRefresh();
    });

    const resetBtn = document.getElementById('formation-reset-btn');
    if (resetBtn) resetBtn.addEventListener('click', () => {
        const q = AppState.currentQuarter;
        AppState.formationCoords[q] = {};
        renderFormationBuilder();
        renderFormationOverview();
        showToast(`${q} 포지션 위치를 기본 배치로 되돌렸습니다. ↺`);
    });

    document.getElementById('export-formation-btn').addEventListener('click', exportCombinedFormation);
    const draftBtn = document.getElementById('auto-draft-btn');
    if (draftBtn) draftBtn.addEventListener('click', runAutoDraft);
    document.getElementById('draft-save-btn').addEventListener('click', () => handleSave(true));
    document.getElementById('final-save-btn').addEventListener('click', () => handleSave(false));
    document.getElementById('new-match-btn').addEventListener('click', () => {
        if (confirm('현재 입력 내용을 초기화하고 새 경기를 시작하시겠습니까?')) {
            resetMatchState();
            const fp = document.getElementById('match-date')._flatpickr;
            if (fp) fp.setDate(today()); else document.getElementById('match-date').value = today();
            populateVenueSelect(AppState.matchLocation);
            document.getElementById('venue-custom-row').style.display = 'none';
            document.getElementById('match-opponent').value = '상대팀';
            renderTab1();
            startAutoSave();
            showToast('새 경기 준비 완료!');
        }
    });

    startAutoSave();
    updateAutoSaveStatus();
}

// ── 저장 로직 (v2 레코드) ──────────────────────────────────────────────────
function buildMatchRecord(id, isDraft) {
    const extras = AppState.editingExtras || {};
    const quarters = {};
    editorQuarters().forEach(q => {
        const lineup = {};
        for (const [pos, n] of Object.entries(AppState.formationState[q] || {})) {
            if (n && n !== '-') lineup[pos] = n;
        }
        quarters[q] = {
            formation: AppState.formationTypes[q] || '4-2-3-1',
            lineup,
            coords: JSON.parse(JSON.stringify(AppState.formationCoords[q] || {})),
            subs: editorSubsForQuarter(q),
        };
    });
    // 편집기가 다루지 않는 5Q 이상 쿼터는 그대로 보존
    Object.entries(extras.quarters || {}).forEach(([q, qd]) => { if (!quarters[q]) quarters[q] = qd; });

    const scores = {};
    Object.keys(quarters).forEach(q => {
        scores[q] = AppState.quarterScores[q] ? [...AppState.quarterScores[q]] : ((extras.scores || {})[q] || [0, 0]);
    });
    const stats = {};
    Object.entries(AppState.matchStats).forEach(([n, s]) => {
        if ((s.goals || 0) || (s.assists || 0)) stats[n] = { goals: s.goals || 0, assists: s.assists || 0 };
    });

    return {
        id,
        date: AppState.matchDate,
        venue: AppState.matchLocation,
        opponent: AppState.matchOpponent || '상대팀',
        title: `${AppState.matchLocation} vs ${AppState.matchOpponent || '상대팀'}`,
        timeSlot: extras.timeSlot || null,
        notes: extras.notes || '',
        type: extras.type || 'match',
        status: isDraft ? 'draft' : 'final',
        quarterCount: Object.keys(quarters).length,
        onFieldSize: AppState.onFieldSize || Quota.DEFAULT_ON_FIELD,
        attendees: [...AppState.attendees],
        quarters,
        scores,
        scoresKnown: true,
        stats,
        events: JSON.parse(JSON.stringify(AppState.matchEvents || [])),
        source: extras.source || { kind: 'app' },
        updatedAt: new Date().toISOString(),
    };
}

async function handleSave(isDraft, overwrite = false, forceNewId = false) {
    if (!checkEditorAccess()) return;
    if (AppState.attendees.length === 0) {
        showToast('참석자를 선택해주세요.', 'error');
        return;
    }
    if (AppState.legacyMatches) {
        showToast('DB가 아직 구버전 형식입니다. tools/import_sheet.py --upload 로 이관한 뒤 저장할 수 있습니다.', 'error');
        return;
    }

    // ID = 날짜 (같은 날 두 번째 경기는 -b, -c ...)
    let matchId = AppState.editModeId || AppState.matchDate;
    if (!AppState.editModeId) {
        const dup = AppState.matches.find(m => m.id === matchId);
        if (dup && forceNewId) {
            let i = 1;
            while (AppState.matches.some(m => m.id === `${AppState.matchDate}-${String.fromCharCode(97 + i)}`)) i++;
            matchId = `${AppState.matchDate}-${String.fromCharCode(97 + i)}`;
        } else if (dup && !overwrite) {
            AppState.dupConfirmId = matchId;
            AppState.dupConfirmAction = isDraft ? 'draft' : 'final';
            renderDuplicateWarning(dup, isDraft);
            return;
        }
    }

    const record = buildMatchRecord(matchId, isDraft);
    try {
        await saveMatchRecord(record);
        AppState.editModeId = record.id; // 저장 후에는 같은 레코드를 계속 수정
        hideDuplicateWarning();
        updateEditModeNotice();
        showToast(`${isDraft ? '임시 저장' : '확정 저장'} 완료! ✅`);
        if (!isDraft) {
            const totUs = Object.values(record.scores).reduce((a, s) => a + s[0], 0);
            const totThem = Object.values(record.scores).reduce((a, s) => a + s[1], 0);
            showToast(`최종 스코어: 바르자 ${totUs} : ${totThem} ${record.opponent} 🎉`, 'success');
        }
    } catch (e) {
        showToast('저장 실패: ' + e.message, 'error');
    }
}

function renderDuplicateWarning(dup, isDraft) {
    const el = document.getElementById('duplicate-warning');
    if (!el) return;
    el.innerHTML = `
    <div class="dup-box">
      <p>⚠️ <strong>${escapeHtml(dup.date)}</strong> 날짜에 이미 <strong>${escapeHtml(dup.title)}</strong> 기록이 있습니다.</p>
      <div class="dup-actions">
        <button class="btn-overwrite" id="dup-overwrite">덮어쓰기 (${isDraft ? '임시' : '확정'})</button>
        <button class="btn-secondary" id="dup-new">같은 날 다른 경기로 저장</button>
        <button class="btn-cancel" id="dup-cancel">취소</button>
      </div>
    </div>`;
    el.style.display = 'block';
    el.querySelector('#dup-overwrite').onclick = () => handleSave(isDraft, true);
    el.querySelector('#dup-new').onclick = () => handleSave(isDraft, false, true);
    el.querySelector('#dup-cancel').onclick = hideDuplicateWarning;
}

function hideDuplicateWarning() {
    const el = document.getElementById('duplicate-warning');
    if (el) el.style.display = 'none';
    AppState.dupConfirmId = null;
}

// ── 기록에서 불러오기 (Tab3 → Tab1) ────────────────────────────────────────
function loadMatchToEditor(record) {
    if (!checkEditorAccess()) return;
    resetMatchState();

    // 명단에 없는 이름(이관 기록의 용병 등)은 용병으로 등록해 둔다 (DB 저장은 하지 않음)
    const allNames = new Set(record.attendees || []);
    Object.values(record.quarters || {}).forEach(qd => {
        Object.values(qd.lineup || {}).forEach(n => allNames.add(n));
        (qd.subs || []).forEach(s => { if (s.in) allNames.add(s.in); if (s.out) allNames.add(s.out); });
    });
    allNames.forEach(n => { if (n && !AppState.roster[n]) AppState.roster[n] = normalizePlayer(n, { role: 'guest' }); });

    AppState.matchDate = record.date;
    AppState.matchLocation = record.venue;
    AppState.matchOpponent = record.opponent;
    const recQuarters = recordQuarters(record).length;
    AppState.quarterCount = Quota.QUARTER_OPTIONS.includes(recQuarters) ? recQuarters : Quota.DEFAULT_QUARTER_COUNT;
    AppState.onFieldSize = record.onFieldSize || Quota.DEFAULT_ON_FIELD;
    ensureQuarterState();
    AppState.attendees = [...allNames].filter(Boolean);
    AppState.editModeId = record.id;
    AppState.editingExtras = {
        type: record.type, timeSlot: record.timeSlot, notes: record.notes, source: record.source,
        onFieldSize: record.onFieldSize,
        quarters: Object.fromEntries(Object.entries(record.quarters || {}).filter(([q]) => !editorQuarters().includes(q))),
        scores: Object.fromEntries(Object.entries(record.scores || {}).filter(([q]) => !editorQuarters().includes(q))),
    };
    AppState.formationTypes = {}; AppState.formationState = {}; AppState.formationCoords = {};
    AppState.formationSubs = {}; AppState.extraSubs = {}; AppState.quarterScores = {};
    AppState.locks = {}; AppState.draftReasons = {}; AppState.draftSeed = 0;

    editorQuarters().forEach(q => {
        const qd = (record.quarters || {})[q] || {};
        AppState.formationTypes[q] = FORMATION_POSITIONS[qd.formation] ? qd.formation : '4-2-3-1';
        AppState.formationState[q] = { ...(qd.lineup || {}) };
        AppState.formationCoords[q] = JSON.parse(JSON.stringify(qd.coords || {}));
        AppState.formationSubs[q] = {};
        AppState.extraSubs[q] = [];
        (qd.subs || []).forEach(s => {
            let pos = s.pos && AppState.formationState[q][s.pos] === s.out ? s.pos : null;
            if (!pos && s.out) pos = Object.keys(AppState.formationState[q]).find(p => AppState.formationState[q][p] === s.out) || null;
            if (pos && s.in && !AppState.formationSubs[q][pos]) AppState.formationSubs[q][pos] = s.in;
            else AppState.extraSubs[q].push({ in: s.in || null, out: s.out || null });
        });
        AppState.quarterScores[q] = (record.scores && record.scores[q]) ? [...record.scores[q]] : [0, 0];
    });

    AppState.matchStats = {};
    Object.entries(record.stats || {}).forEach(([n, s]) => {
        AppState.matchStats[n] = { goals: s.goals || 0, assists: s.assists || 0 };
    });
    AppState.matchEvents = JSON.parse(JSON.stringify(record.events || []));
    if (AppState.matchEvents.length) recalcFromEvents();

    const fp = document.getElementById('match-date')._flatpickr;
    if (fp) fp.setDate(record.date); else document.getElementById('match-date').value = record.date;
    populateVenueSelect(record.venue);
    document.getElementById('venue-custom-row').style.display = 'none';
    document.getElementById('match-opponent').value = record.opponent;
    renderTab1();
    startAutoSave();
    setTimeout(() => {
        switchTab('tab1');
        showToast(`"${record.title}" 불러오기 완료 ✏️`);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 0);
}
