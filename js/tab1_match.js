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
    renderMatchSummary();
    updateAutoSaveStatus();
}

// ── 고정 요약 바 ───────────────────────────────────────────────────────────
function renderMatchSummary() {
    const el = document.getElementById('match-summary');
    if (!el) return;
    const n = AppState.attendees.length;
    const t = n ? editorTargets() : null;
    const info = document.getElementById('info-summary-text');
    if (info) info.textContent = `${AppState.matchDate} · ${AppState.matchLocation} vs ${AppState.matchOpponent || '상대팀'} · ${AppState.quarterCount}Q × ${AppState.onFieldSize}명`;
    const att = document.getElementById('attend-summary-text');
    if (att) att.textContent = n ? `${n}명` : '';
    let balance = '';
    if (t) {
        const ok = t.balanced && !t.under.length && !t.over.length && !t.unplayed.length;
        balance = `<span class="sum-pill ${ok ? 'ok' : 'warn'}">${ok ? '균형' : `${t.under.length + t.over.length + t.unplayed.length}명 확인`}</span>`;
    }
    el.innerHTML = `
      <div class="sum-main">
        <span class="sum-title">${escapeHtml(AppState.matchDate.slice(5))} · vs ${escapeHtml(AppState.matchOpponent || '상대팀')}</span>
        <span class="sum-stat">참석 <strong>${n}</strong></span>
        ${t ? `<span class="sum-stat">목표 <strong>${fmtQ(t.target)}Q</strong></span><span class="sum-stat">범위 <strong>${fmtQ(t.min)}~${fmtQ(t.max)}</strong></span>` : ''}
        ${balance}
      </div>
      <nav class="sum-nav">
        <a href="#step-attend">참석</a><a href="#step-lineup">배치</a><a href="#step-record">기록</a><a href="#step-save">저장</a>
      </nav>`;
    const sq = document.getElementById('squad-summary-text');
    if (sq) sq.textContent = t ? `목표 ${fmtQ(t.target)}Q · 실제 ${fmtQ(t.min)}~${fmtQ(t.max)}Q${t.unplayed.length ? ` · 미출전 ${t.unplayed.length}` : ''}` : '';
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

// ── 전체 쿼터 요약 스트립 (미니맵 대체) ────────────────────────────────────
function renderFormationOverview() {
    const el = document.getElementById('quarter-strip');
    if (!el) return;
    const t = AppState.attendees.length ? editorTargets() : null;
    el.innerHTML = editorQuarters().map(q => {
        const fType = AppState.formationTypes[q] || '4-2-3-1';
        const fDef = FORMATION_POSITIONS[fType];
        const lineup = AppState.formationState[q] || {};
        const subs = editorSubsForQuarter(q);
        const n = Object.values(lineup).filter(Boolean).length;
        const rows = fDef ? fDef.rows.map(row => {
            const names = row.positions.map(p => lineup[p]).filter(Boolean);
            if (!names.length) return '';
            return `<div class="qs-line"><span class="qs-line-key qs-${row.key}">${row.key.toUpperCase()}</span>${names.map(escapeHtml).join(' · ')}</div>`;
        }).reverse().join('') : '';
        const subHtml = subs.length ? `<div class="qs-subs">⇄ ${subs.map(sb => `${escapeHtml(sb.in || '?')}→${escapeHtml(sb.out || '?')}`).join(', ')}</div>` : '';
        const bench = AppState.attendees.filter(x => !Object.values(lineup).includes(x) && !subs.some(sb => sb.in === x) && playerAvailable(x, q));
        const away = AppState.attendees.filter(x => !playerAvailable(x, q));
        const benchHtml = (bench.length ? `<div class="qs-bench">벤치 ${bench.map(escapeHtml).join(', ')}</div>` : '')
            + (away.length ? `<div class="qs-bench">불참 ${away.map(escapeHtml).join(', ')}</div>` : '');
        const lk = quarterLockState(q);
        const lockBadge = lk.locked ? `<span class="qs-lock" title="잠근 자리">${lk.all ? '🔒 전체' : `🔒 ${lk.locked}`}</span>` : '';
        const short = (t && n < t.onFieldSize ? `<span class="qs-warn">${n}/${t.onFieldSize}</span>` : `<span class="qs-count">${n}명</span>`) + lockBadge;
        return `
          <button type="button" class="qs-card ${q === AppState.currentQuarter ? 'active' : ''}" data-q="${q}">
            <div class="qs-head"><span class="qs-q">${q}</span><span class="qs-type">${escapeHtml(fType)}</span>${short}</div>
            ${rows || '<div class="qs-empty">미배치</div>'}
            ${subHtml}${benchHtml}
          </button>`;
    }).join('');
    el.querySelectorAll('.qs-card').forEach(btn => btn.addEventListener('click', () => {
        AppState.currentQuarter = btn.dataset.q;
        renderQuarterSelector();
        renderFormationBuilder();
        renderFormationOverview();
        const b = document.getElementById('formation-builder');
        if (b && window.innerWidth < 900) b.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
}

// ── 참석자 체크리스트 (멤버 / 비활동 멤버 / 용병 그룹) ────────────────────
function renderPlayerChecklist() {
    const container = document.getElementById('player-checklist');
    if (!container) return;
    const groups = getRosterGroups();
    const { inactive, guests, lastSeen } = groups;
    // 멤버는 최근 참석순(같으면 이름순)
    const members = [...groups.members].sort((a, b) => (lastSeen[b] || '').localeCompare(lastSeen[a] || '') || a.localeCompare(b, 'ko'));

    const editingAvail = AppState.availabilityEditing;
    const item = (name) => {
        const isChecked = AppState.attendees.includes(name);
        const guest = isGuest(name);
        const safe = escapeHtml(name);
        const p = getPlayer(name) || {};
        const pos = (p.positions || []).slice(0, 2).join('·');
        const seen = lastSeen[name] ? `<em>${escapeHtml(lastSeen[name].slice(5))}</em>` : '';
        const availLabel = availabilityLabel(name);
        const availBtn = isChecked
            ? `<button type="button" class="avail-btn ${availLabel ? 'partial' : ''}" data-name="${safe}" title="참석 가능한 쿼터 설정 (일찍 가거나 늦게 오는 경우)">${availLabel ? escapeHtml(availLabel) : '전 쿼터'}</button>`
            : '';
        const toggles = (isChecked && editingAvail === name)
            ? `<div class="avail-toggles" data-name="${safe}">
                ${editorQuarters().map(q => `<button type="button" class="avail-q ${playerAvailable(name, q) ? 'on' : ''}" data-q="${q}">${q}</button>`).join('')}
                <button type="button" class="avail-done">완료</button>
               </div>` : '';
        return `
      <div class="player-check-row ${editingAvail === name ? 'editing' : ''}">
        <label class="player-check-item ${guest ? 'is-guest' : ''}">
          <input type="checkbox" class="player-cb" data-name="${safe}" ${isChecked ? 'checked' : ''}>
          <span>${safe}${pos ? ` <small class="pos-hint">${escapeHtml(pos)}</small>` : ''}${seen}</span>
        </label>${availBtn}${toggles}
      </div>`;
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
                delete AppState.availability[name];
                if (AppState.availabilityEditing === name) AppState.availabilityEditing = null;
            }
            renderPlayerChecklist();
            renderSquadTable();
            renderPlaytimeStats();
            renderLiveRecorder();
            renderFormationBuilder();
            renderFormationOverview();
            renderMatchSummary();
        });
    });
    // 참석 쿼터 설정 (일찍 가는/늦게 오는 선수)
    container.querySelectorAll('.avail-btn').forEach(btn => btn.addEventListener('click', () => {
        AppState.availabilityEditing = AppState.availabilityEditing === btn.dataset.name ? null : btn.dataset.name;
        renderPlayerChecklist();
    }));
    container.querySelectorAll('.avail-toggles').forEach(box => {
        const name = box.dataset.name;
        box.querySelectorAll('.avail-q').forEach(b => b.addEventListener('click', () => {
            const q = b.dataset.q;
            const cur = playerQuarters(name);
            const next = cur.includes(q) ? cur.filter(x => x !== q) : [...cur, q];
            if (next.length === 0) { showToast('최소 한 쿼터는 참석해야 합니다. 아예 불참이면 체크를 해제하세요.', 'error'); return; }
            setPlayerQuarters(name, next);
            // 불참 쿼터에 배치돼 있으면 빼기
            editorQuarters().forEach(qq => {
                if (playerAvailable(name, qq)) return;
                const fMap = AppState.formationState[qq] || {};
                Object.keys(fMap).forEach(pos => { if (fMap[pos] === name) delete fMap[pos]; });
                const fSubs = AppState.formationSubs[qq] || {};
                Object.keys(fSubs).forEach(pos => { if (fSubs[pos] === name) delete fSubs[pos]; });
            });
            renderPlayerChecklist();
            fbRefresh();
        }));
        box.querySelector('.avail-done').addEventListener('click', () => { AppState.availabilityEditing = null; renderPlayerChecklist(); });
    });

    const applyFilter = (kw) => {
        let shown = 0;
        container.querySelectorAll('.player-check-item').forEach(el => {
            const n = el.querySelector('.player-cb').dataset.name;
            const on = !kw || n.includes(kw);
            el.style.display = on ? '' : 'none';
            if (on) shown++;
        });
        container.querySelectorAll('details.check-group').forEach(d => { if (kw) d.open = true; });
        let empty = container.querySelector('.filter-empty');
        if (kw && shown === 0) {
            if (!empty) { empty = document.createElement('p'); empty.className = 'empty-hint filter-empty'; container.prepend(empty); }
            empty.textContent = `"${kw}" 이름이 명단에 없습니다. 새 용병이면 위의 "용병 추가" 줄에 입력하세요.`;
        } else if (empty) empty.remove();
    };
    const filter = container.querySelector('#guest-filter');
    if (filter) filter.addEventListener('input', () => applyFilter(filter.value.trim()));
    const globalFilter = document.getElementById('attend-filter');
    if (globalFilter) {
        globalFilter.oninput = () => applyFilter(globalFilter.value.trim());
        if (globalFilter.value.trim()) applyFilter(globalFilter.value.trim());
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
    const statusLabel = { under: '부족', over: '초과', ok: '', gk: 'GK' };
    const rows = [...AppState.attendees]
        .sort((a, b) => (t.participation[b] ? t.participation[b].credit : 0) - (t.participation[a] ? t.participation[a].credit : 0) || a.localeCompare(b, 'ko'))
        .map(name => {
            const p = t.participation[name] || { credit: 0, byQuarter: {} };
            const qCells = qs.map(q => {
                if (!playerAvailable(name, q)) return `<td class="check-away" title="불참 쿼터">×</td>`;
                const c = p.byQuarter[q] || 0;
                const mark = c >= 1 ? '●' : c > 0 ? '◐' : '';
                return `<td class="${c > 0 ? 'check-yes' : 'check-no'}" title="${c}">${mark}</td>`;
            }).join('');
            const myTarget = t.personalTarget[name] != null ? t.personalTarget[name] : t.target;
            const diff = p.credit - myTarget;
            const st = p.credit === 0 ? 'unplayed' : t.status[name];
            const diffStr = p.credit === 0 ? '미출전' : (st === 'gk' ? '전담' : `${diff > 0 ? '+' : ''}${fmtQ(diff, 1)}`);
            const prio = playerPriority(name);
            return `<tr class="squad-row-${st}">
      <td class="squad-name">${prio === 1 ? '★ ' : ''}${escapeHtml(formatPlayerName(name))}${prio === 3 ? ' <small class="prio-mini">3순위</small>' : ''}</td>
      ${qCells}
      <td class="participation-score ${st}">${fmtQ(p.credit)}</td>
      <td class="num-cell my-target-cell">${fmtQ(myTarget, 1)}</td>
      <td class="participation-diff ${st}">${diffStr}${statusLabel[st] ? ` <small>${statusLabel[st]}</small>` : ''}</td>
    </tr>`;
        }).join('');

    const perQ = qs.map(q => `<th title="${q} 출전 인원">${q}<small>${t.perQuarter[q]}</small></th>`).join('');
    container.innerHTML = `
    <table class="squad-table">
      <thead>
        <tr><th>이름</th>${perQ}<th>참여</th><th>목표</th><th>편차</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <p class="hint-text" style="margin-top:0.4rem">● 주전 1쿼터 · ◐ 교체 0.5쿼터 · × 불참 쿼터 · 목표는 ${t.onFieldSize}명 × ${t.quarterCount}쿼터 = ${t.slots}슬롯을 우선순위 가중치(★1순위 ×1.25 · 3순위 ×0.75)와 참석 가능 쿼터에 비례해 나눈 값 · 1쿼터 이상 차이 나면 부족/초과</p>`;
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
    renderMatchSummary();
}

// 주전 선택 (드롭다운)
function fbApplyMain(q, pos, val) {
    const fMap = AppState.formationState[q];
    const fSubs = AppState.formationSubs[q] || {};
    if (val === '-') { delete fMap[pos]; }
    else {
        Object.keys(fMap).forEach(p => { if (p !== pos && fMap[p] === val) delete fMap[p]; });
        Object.keys(fSubs).forEach(p => { if (fSubs[p] === val) delete fSubs[p]; }); // 교체로 잡혀 있던 배정 해제
        fMap[pos] = val;
    }
    AppState.pendingPick = null;
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
    const t = AppState.attendees.length ? editorTargets() : null;
    const pending = AppState.pendingPick;

    // ── 벤치 (현재 쿼터에 주전/교체로 배정되지 않은 참석자) ──
    const assigned = new Set();
    Object.values(fMap).forEach(n => { if (n && n !== '-') assigned.add(n); });
    Object.values(fSubs).forEach(n => { if (n && n !== '-') assigned.add(n); });
    extra.forEach(sb => { if (sb.in) assigned.add(sb.in); if (sb.out) assigned.add(sb.out); });
    const benchPlayers = AppState.attendees.filter(n => !assigned.has(n) && playerAvailable(n, q));
    const awayPlayers = AppState.attendees.filter(n => !assigned.has(n) && !playerAvailable(n, q));

    if (bench) {
        const chips = benchPlayers.map(n => {
            const p = t ? t.participation[n] : null;
            const credit = p ? p.credit : 0;
            const st = t ? (credit === 0 ? 'unplayed' : t.status[n]) : '';
            const myT = t ? (t.personalTarget[n] != null ? t.personalTarget[n] : t.target) : 0;
            return `<button type="button" class="bench-chip ${st} ${isGuest(n) ? 'is-guest' : ''} ${pending === n ? 'pending' : ''}" data-name="${escapeHtml(n)}">${playerPriority(n) === 1 ? '★' : ''}${escapeHtml(n)}<em>${fmtQ(credit)}${t ? `/${fmtQ(myT, 1)}` : ''}</em></button>`;
        }).join('');
        const extraHtml = extra.length
            ? `<div class="extra-subs">기타 교체: ${extra.map((sb, i) =>
                `<span class="extra-sub">${escapeHtml(sb.in || '?')} → ${escapeHtml(sb.out || '?')} <button type="button" class="extra-sub-del" data-idx="${i}" title="삭제">✕</button></span>`).join(' ')}</div>`
            : '';
        bench.innerHTML = `
      <div class="bench-head">
        <span class="bench-title">${q} 벤치 <span class="bench-count">${benchPlayers.length}</span></span>
        <span class="bench-hint">${pending ? `<strong>${escapeHtml(pending)}</strong> 선택됨 → 피치의 자리를 누르세요` : '선수를 누른 뒤 자리를 누르거나, 자리를 눌러 고르세요 · 숫자는 참여/목표'}</span>
      </div>
      <div class="bench-chips">${
            AppState.attendees.length === 0
                ? '<span class="empty-hint">참석자를 먼저 체크하세요.</span>'
                : (chips || '<span class="empty-hint">모두 배치됐습니다.</span>')
        }</div>${awayPlayers.length ? `<div class="bench-away">이번 쿼터 불참: ${awayPlayers.map(n => `<span>${escapeHtml(n)} <small>${escapeHtml(availabilityLabel(n))}</small></span>`).join(' ')}</div>` : ''}${extraHtml}`;
        bench.querySelectorAll('.bench-chip').forEach(chip => chip.addEventListener('click', () => {
            if (!checkEditorAccess()) return;
            AppState.pendingPick = AppState.pendingPick === chip.dataset.name ? null : chip.dataset.name;
            renderFormationBuilder();
        }));
        bench.querySelectorAll('.extra-sub-del').forEach(btn => btn.addEventListener('click', () => {
            AppState.extraSubs[q].splice(parseInt(btn.dataset.idx, 10), 1);
            fbRefresh();
        }));
    }

    const locks = AppState.locks[q] || {};
    const reasons = AppState.draftReasons[q] || {};
    function buildPosCell(pos) {
        const label = (POSITION_DISPLAY_LABELS[fType] || {})[pos] || pos;
        const coord = getPosCoord(q, pos, fType);
        const rowKey = getPosRowKey(pos, fType);
        const name = fMap[pos] && fMap[pos] !== '-' ? fMap[pos] : null;
        const sub = fSubs[pos] && fSubs[pos] !== '-' ? fSubs[pos] : null;
        const locked = !!locks[pos] && !!name;
        const r = reasons[pos];
        const reasonHtml = (name && r && r.name === name && !locked)
            ? `<span class="pos-reason pos-reason-${escapeHtml(r.reason)}">${escapeHtml(AutoDraft.reasonLabel(r))}</span>` : '';
        const p = name && t ? t.participation[name] : null;
        const creditHtml = name && t ? `<span class="pos-credit ${t.status[name] || ''}">${fmtQ(p ? p.credit : 0)}</span>` : '';
        return `
      <div class="pos-cell ${name ? 'is-filled' : 'is-empty'} ${sub ? 'has-sub' : ''} ${locked ? 'is-locked' : ''} ${pending ? 'is-target' : ''}" data-pos="${escapeHtml(pos)}" style="left:${coord.left}%;top:${coord.top}%">
        <button type="button" class="pos-lock-toggle ${locked ? 'active' : ''}" data-pos="${escapeHtml(pos)}" title="${locked ? '잠금 해제' : '이 자리 잠그기 (자동 초안이 유지)'}" aria-label="자리 잠금">${locked ? '🔒' : '🔓'}</button>
        <button type="button" class="pos-sub-toggle ${sub ? 'active' : ''}" data-pos="${escapeHtml(pos)}" title="교체 선수 지정" aria-label="교체 선수 지정">⇄</button>
        <div class="pos-badge pos-badge-${rowKey}" title="드래그하여 위치 이동">${escapeHtml(label)}</div>
        <button type="button" class="pos-name ${name ? '' : 'empty'}" data-pos="${escapeHtml(pos)}" aria-label="${escapeHtml(label)} 선수 선택">${name ? escapeHtml(name) : '+ 선택'}${creditHtml}</button>
        ${sub ? `<button type="button" class="pos-sub-line" data-pos="${escapeHtml(pos)}" title="교체 변경">⇄ ${escapeHtml(sub)}</button>` : ''}
        ${reasonHtml}
      </div>`;
    }

    const positionsHtml = getFormationPositions(q, fType).map(pos => buildPosCell(pos)).join('');
    updateLockQuarterButton();
    container.innerHTML = `
    <div class="pitch-title">FC BARZA · ${escapeHtml(q)} · ${escapeHtml(fType)}</div>
    <div class="pitch-lines"></div>
    <div class="pitch-center-circle"></div>
    <div class="pitch-penalty-top"></div>
    <div class="pitch-penalty-bottom"></div>
    ${positionsHtml}`;

    // 자리 누름: 대기 선수가 있으면 바로 배치, 없으면 선택 시트
    container.querySelectorAll('.pos-name').forEach(btn => {
        btn.addEventListener('pointerdown', e => e.stopPropagation());
        btn.addEventListener('click', () => {
            const pos = btn.dataset.pos;
            if (!checkEditorAccess()) return;
            if (AppState.pendingPick) { placePending(q, pos); return; }
            openPickSheet(q, pos, 'main');
        });
    });
    container.querySelectorAll('.pos-sub-line').forEach(btn => {
        btn.addEventListener('pointerdown', e => e.stopPropagation());
        btn.addEventListener('click', () => { if (checkEditorAccess()) openPickSheet(q, btn.dataset.pos, 'sub'); });
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
            if (!checkEditorAccess()) return;
            if (!fMap[pos] || fMap[pos] === '-') { showToast('주전 선수를 먼저 배치하세요.', 'error'); return; }
            openPickSheet(q, pos, 'sub');
        });
    });

    // ── 포지션 카드 자유 이동 (전술 보드처럼 드래그) ──
    container.querySelectorAll('.pos-cell').forEach(cell => {
        cell.addEventListener('pointerdown', e => {
            if (e.button !== undefined && e.button !== 0) return;
            if (e.target.closest('button')) return;

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
                    AppState.formationCoords[q][pos] = { left: parseFloat(cell.style.left), top: parseFloat(cell.style.top) };
                } else if (AppState.pendingPick && checkEditorAccess()) {
                    placePending(q, pos); // 카드 아무 곳이나 탭해도 대기 선수 배치
                }
            };
            try { cell.setPointerCapture(e.pointerId); } catch { /* 합성 이벤트 등 */ }
            cell.addEventListener('pointermove', onMove);
            cell.addEventListener('pointerup', onUp);
            cell.addEventListener('pointercancel', onUp);
        });
    });
}

// 현재 쿼터의 배치된 자리 전체 잠금/해제 버튼 상태
function quarterLockState(q) {
    const fMap = AppState.formationState[q] || {};
    const locks = AppState.locks[q] || {};
    const filled = Object.keys(fMap).filter(p => fMap[p] && fMap[p] !== '-');
    const locked = filled.filter(p => locks[p]);
    return { filled: filled.length, locked: locked.length, all: filled.length > 0 && locked.length === filled.length };
}

function updateLockQuarterButton() {
    const btn = document.getElementById('lock-quarter-btn');
    if (!btn) return;
    const q = AppState.currentQuarter;
    const st = quarterLockState(q);
    btn.disabled = !AppState.isEditor || st.filled === 0;
    btn.textContent = st.all ? `🔓 ${q} 전체 고정 해제` : `🔒 ${q} 전체 고정${st.locked ? ` (${st.locked}/${st.filled})` : ''}`;
    btn.classList.toggle('active', st.all);
}

function toggleQuarterLock() {
    if (!checkEditorAccess()) return;
    const q = AppState.currentQuarter;
    const st = quarterLockState(q);
    if (st.filled === 0) { showToast('배치된 선수가 없습니다.', 'error'); return; }
    const fMap = AppState.formationState[q];
    if (!AppState.locks[q]) AppState.locks[q] = {};
    if (st.all) {
        AppState.locks[q] = {};
        showToast(`${q} 전체 고정을 해제했습니다.`);
    } else {
        Object.keys(fMap).forEach(p => { if (fMap[p] && fMap[p] !== '-') AppState.locks[q][p] = true; });
        showToast(`${q} 배치 ${st.filled}자리를 고정했습니다. 자동 초안이 이 쿼터는 유지합니다. 🔒`);
    }
    renderFormationBuilder();
    renderFormationOverview();
}

// 대기 선수(벤치에서 누른 선수)를 자리에 배치 — 자리에 있던 선수는 벤치로
function placePending(q, pos) {
    const name = AppState.pendingPick;
    AppState.pendingPick = null;
    if (!name) return;
    const fMap = AppState.formationState[q];
    // 같은 선수가 다른 자리에 있으면 그 자리를 비움
    Object.keys(fMap).forEach(p => { if (fMap[p] === name) delete fMap[p]; });
    fMap[pos] = name;
    fbRefresh();
}

// ── 선수 선택 시트 (하단 시트) ─────────────────────────────────────────────
function openPickSheet(q, pos, mode) {
    const sheet = document.getElementById('pick-sheet');
    const body = document.getElementById('pick-sheet-body');
    if (!sheet || !body) return;
    const fType = AppState.formationTypes[q];
    const label = (POSITION_DISPLAY_LABELS[fType] || {})[pos] || pos;
    const fMap = AppState.formationState[q];
    const fSubs = AppState.formationSubs[q];
    const current = mode === 'sub' ? (fSubs[pos] || null) : (fMap[pos] || null);
    const t = AppState.attendees.length ? editorTargets() : null;
    const assignedMain = new Set(Object.values(fMap).filter(Boolean));
    const assignedSub = new Set(Object.values(fSubs).filter(Boolean));
    const benchNames = AppState.attendees.filter(n => !assignedMain.has(n) && !assignedSub.has(n) && playerAvailable(n, q));
    const awayNames = AppState.attendees.filter(n => !assignedMain.has(n) && !assignedSub.has(n) && !playerAvailable(n, q));
    // 교체(In)로 배정된 선수: 주전 자리로 옮길 수 있게 따로 표시 (현재 자리의 교체는 제외)
    const subAssigned = Object.entries(fSubs).filter(([p, n]) => n && !(mode === 'sub' && p === pos) && playerAvailable(n, q));
    const prefs = n => ((getPlayer(n) || {}).positions || []);
    const fit = n => AutoDraft.fitDetail(prefs(n), pos);
    const sortByFit = names => [...names].sort((a, b) => fit(b).score - fit(a).score || ((t && t.participation[a]) ? t.participation[a].credit : 0) - ((t && t.participation[b]) ? t.participation[b].credit : 0) || a.localeCompare(b, 'ko'));

    const chip = (n, extraCls = '') => {
        const p = t ? t.participation[n] : null;
        const credit = p ? p.credit : 0;
        const st = t ? (credit === 0 ? 'unplayed' : t.status[n]) : '';
        const f = fit(n);
        const fitLabel = f.score >= 2.5 ? AutoDraft.reasonLabel(f) : (f.score > 0 ? AutoDraft.reasonLabel(f) : '');
        return `<button type="button" class="pick-chip ${st} ${extraCls} ${n === current ? 'current' : ''}" data-name="${escapeHtml(n)}">
          <span class="pick-name">${playerPriority(n) === 1 ? '★ ' : ''}${escapeHtml(n)}${isGuest(n) ? '<small>용병</small>' : ''}${playerPriority(n) === 3 ? '<small>3순위</small>' : ''}</span>
          <span class="pick-meta">${prefs(n).slice(0, 2).join('·') || '-'}${fitLabel ? ` · <b>${escapeHtml(fitLabel)}</b>` : ''}</span>
          <span class="pick-credit">${fmtQ(credit)}${t ? `/${fmtQ(t.personalTarget[n] != null ? t.personalTarget[n] : t.target, 1)}` : ''}</span>
        </button>`;
    };

    let html = `<div class="pick-head">
        <span class="pos-badge pos-badge-${getPosRowKey(pos, fType)}">${escapeHtml(label)}</span>
        <span class="pick-title">${mode === 'sub' ? `교체 투입 선수 선택 <small>(${escapeHtml(fMap[pos] || '')} 아웃)</small>` : `${q} ${escapeHtml(label)} 선수 선택`}</span>
        <button type="button" class="pick-close" data-close="1" aria-label="닫기">✕</button>
      </div>`;
    html += `<div class="pick-section"><div class="pick-section-title">벤치 <small>${benchNames.length}명 · 적합도순</small></div>
        <div class="pick-list">${sortByFit(benchNames).map(n => chip(n)).join('') || '<span class="empty-hint">벤치에 선수가 없습니다.</span>'}</div>
        ${awayNames.length ? `<div class="hint-text" style="margin-top:0.3rem">이번 쿼터 불참: ${awayNames.map(escapeHtml).join(', ')}</div>` : ''}</div>`;
    if (mode === 'main' && subAssigned.length) {
        html += `<div class="pick-section"><div class="pick-section-title">교체로 배정된 선수 <small>고르면 교체 배정이 풀리고 이 자리의 주전이 됩니다</small></div>
        <div class="pick-list">${subAssigned.map(([p, n]) => chip(n, 'from-sub').replace('<span class="pick-meta">', `<span class="pick-meta">⇄ ${escapeHtml(p)} 교체 · `)).join('')}</div></div>`;
    }
    if (mode === 'main') {
        const others = Object.entries(fMap).filter(([p, n]) => n && p !== pos);
        if (others.length) {
            html += `<div class="pick-section"><div class="pick-section-title">자리 바꾸기 <small>배치된 선수와 교환</small></div>
            <div class="pick-list">${others.map(([p, n]) => chip(n, 'swap')).map((h, i) => h.replace('data-name=', `data-swap-pos="${escapeHtml(others[i][0])}" data-name=`)).join('')}</div></div>`;
        }
    }
    html += `<div class="pick-actions">
        ${current ? `<button type="button" class="btn-cancel" data-clear="1">${mode === 'sub' ? '교체 해제' : '자리 비우기'}</button>` : ''}
        <button type="button" class="btn-secondary" data-close="1">닫기</button>
      </div>`;
    body.innerHTML = html;
    sheet.hidden = false;
    document.body.classList.add('sheet-open');

    const close = () => { sheet.hidden = true; document.body.classList.remove('sheet-open'); };
    sheet.querySelectorAll('[data-close]').forEach(el => { el.onclick = close; });
    const clearBtn = body.querySelector('[data-clear]');
    if (clearBtn) clearBtn.onclick = () => { close(); if (mode === 'sub') fbApplySub(q, pos, '-'); else fbApplyMain(q, pos, '-'); };
    body.querySelectorAll('.pick-chip').forEach(c => c.addEventListener('click', () => {
        const name = c.dataset.name;
        close();
        if (mode === 'sub') { fbApplySub(q, pos, name); return; }
        const swapPos = c.dataset.swapPos;
        if (swapPos) {
            const mine = fMap[pos] || null;
            fMap[pos] = name;
            if (mine) fMap[swapPos] = mine; else delete fMap[swapPos];
            fbRefresh();
            return;
        }
        fbApplyMain(q, pos, name);
    }));
}

// ── 자동 초안 (선호 포지션 + 쿼터 균형) ──────────────────────────────────
const GUEST_MIN_QUARTERS = 3; // 용병 최소 보장 쿼터

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
    const unavailable = {};
    const minCredits = {};
    AppState.attendees.forEach(n => {
        const away = qs.filter(q => !playerAvailable(n, q));
        if (away.length) unavailable[n] = away;
        if (isGuest(n)) minCredits[n] = Math.min(GUEST_MIN_QUARTERS, playerQuarters(n).length);
    });
    AppState.draftSeed += 1;
    const result = AutoDraft.generate({
        attendees: AppState.attendees, positions,
        quarterCount: AppState.quarterCount, onFieldSize: AppState.onFieldSize,
        formations: AppState.formationTypes, formationSlots, locks, unavailable, minCredits,
        weights: weightsFor(AppState.attendees),
        allowSubs: true,
        seed: AppState.draftSeed * 7919 + AppState.attendees.length,
    });
    qs.forEach(q => {
        AppState.formationState[q] = { ...result.quarters[q].lineup };
        AppState.formationSubs[q] = {};
        (result.quarters[q].subs || []).forEach(sb => { if (sb.pos && sb.in) AppState.formationSubs[q][sb.pos] = sb.in; });
        AppState.extraSubs[q] = [];
        AppState.draftReasons[q] = result.quarters[q].reasons;
    });
    fbRefresh();
    const t = editorTargets();
    const msg = `✨ 초안 ${AppState.draftSeed}번째 · 목표 ${fmtQ(t.target)}Q · 실제 ${fmtQ(t.min)}~${fmtQ(t.max)}Q${result.subCount ? ` · 교체 ${result.subCount}건` : ''}`;
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
            renderMatchSummary();
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
        renderMatchSummary();
        renderLiveRecorder();
    });
    document.getElementById('match-date').addEventListener('change', () => renderMatchSummary());

    // 게스트 추가
    document.getElementById('add-guest-btn').addEventListener('click', async () => {
        if (!checkEditorAccess()) return; // 권한 없으면 이유를 토스트로 안내 (로그인 필요 / 권한 요청)
        const inp = document.getElementById('guest-name-input');
        const posInp = document.getElementById('guest-pos-input');
        const name = inp.value.trim().replace(/\s+/g, '');
        if (!name) { showToast('용병 이름을 입력하세요.', 'error'); inp.focus(); return; }
        const positions = parsePositionsInput(posInp ? posInp.value : '');
        const existing = AppState.roster[name];
        if (!existing) {
            AppState.roster[name] = normalizePlayer(name, { role: 'guest', fullName: name.length >= 3 ? name : null, positions });
            try { await savePlayer(name); }
            catch (e) { showToast('용병 저장 실패: ' + e.message, 'error'); }
        } else if (positions.length) {
            // 이미 있는 선수인데 포지션을 적었으면 갱신
            existing.positions = positions;
            try { await savePlayer(name); }
            catch (e) { showToast('포지션 저장 실패: ' + e.message, 'error'); }
        }
        if (!AppState.attendees.includes(name)) AppState.attendees.push(name);
        inp.value = '';
        if (posInp) posInp.value = '';
        renderPlayerChecklist();
        renderSquadTable();
        renderPlaytimeStats();
        renderLiveRecorder();
        renderFormationBuilder();
        renderMatchSummary();
        showToast(`${name} (용병) 추가 완료!${positions.length ? ` · ${positions.join(', ')}` : ''}`);
    });
    ['guest-name-input', 'guest-pos-input'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('add-guest-btn').click(); });
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
    const lockBtn = document.getElementById('lock-quarter-btn');
    if (lockBtn) lockBtn.addEventListener('click', toggleQuarterLock);
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

    // 좁은 화면에서는 경기 정보를 접어 두고 요약 줄만 보여줌
    const infoDetails = document.querySelector('#step-info .info-details');
    if (infoDetails && window.innerWidth < 700) infoDetails.open = false;

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
        availability: Object.fromEntries(Object.entries(AppState.availability || {}).filter(([n]) => AppState.attendees.includes(n))),
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
    AppState.availability = {};
    Object.entries(record.availability || {}).forEach(([n, qsAv]) => { if (Array.isArray(qsAv) && AppState.attendees.includes(n)) AppState.availability[n] = [...qsAv]; });
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
