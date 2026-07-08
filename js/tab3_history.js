// =============================================
// FC 바르자 팀 매니저 - Tab 3: 기록 조회 & 수정
// =============================================

function renderHistoryTab() {
  const container = document.getElementById('tab3-content');
  if (!container) return;

  const history = [...AppState.matches].reverse();

  if (history.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>📭 저장된 경기 기록이 없습니다.</p></div>';
    return;
  }

  const optionsHtml = history.map((m, i) => {
    const icon = m.is_draft ? '📝' : '✅';
    return `<option value="${i}">${icon} ${escapeHtml(m.date)} — ${escapeHtml(m.location)} vs ${escapeHtml(m.opponent)}</option>`;
  }).join('');

  container.innerHTML = `
    <div class="history-selector-row">
      <select id="history-match-select" class="history-select">
        ${optionsHtml}
      </select>
    </div>
    <div id="history-match-detail"></div>`;

  const sel = document.getElementById('history-match-select');
  sel.addEventListener('change', () => renderMatchDetail(history[parseInt(sel.value)]));
  renderMatchDetail(history[0]);
}

// match_events → 좌(바르자)/우(상대) 타임라인 HTML
function buildTimelineHtml(events, scores) {
  const blocks = QUARTERS.map(q => {
    const evs = events.filter(e => e && e.quarter === q);
    if (evs.length === 0) return '';
    const [u, t] = scores[q] || [0, 0];
    const rows = evs.map(ev => {
      if (ev.type === 'goal') {
        const ass = ev.assister ? `<span class="tl-assist">👟 ${escapeHtml(ev.assister)}</span>` : '';
        return `<div class="tl-row us"><div class="tl-card">⚽ <strong>${escapeHtml(ev.scorer)}</strong>${ass}</div></div>`;
      }
      return `<div class="tl-row them"><div class="tl-card">상대팀 득점</div></div>`;
    }).join('');
    return `<div class="tl-quarter">
      <div class="tl-q-header"><span class="tl-q-pill">${q} <em>${u} : ${t}</em></span></div>
      <div class="tl-events">${rows}</div>
    </div>`;
  }).join('');
  if (!blocks) return '<p class="empty-hint">기록된 이벤트가 없습니다.</p>';
  return `<div class="tl-legend"><span class="tl-legend-us">◀ FC 바르자</span><span class="tl-legend-them">상대팀 ▶</span></div>${blocks}`;
}

function renderMatchDetail(match) {
  const container = document.getElementById('history-match-detail');
  if (!container || !match) return;

  const isDraft = match.is_draft;
  const scores = match.scores || {};
  const totUs = QUARTERS.reduce((s, q) => s + (scores[q]?.[0] || 0), 0);
  const totThem = QUARTERS.reduce((s, q) => s + (scores[q]?.[1] || 0), 0);

  // 승/무/패
  const resultKey = totUs > totThem ? 'win' : totUs < totThem ? 'loss' : 'draw';
  const resultLabel = { win: '승리', loss: '패배', draw: '무승부' }[resultKey];

  // 쿼터 스코어 칩
  const quarterChips = QUARTERS.map(q => {
    const [u, t] = scores[q] || [0, 0];
    const cls = u > t ? 'q-win' : u < t ? 'q-loss' : 'q-draw';
    return `<div class="hero-q-chip ${cls}">
      <span class="hero-q-label">${q}</span>
      <span class="hero-q-score">${u} : ${t}</span>
    </div>`;
  }).join('');

  // 타임라인 (실시간 기록 이벤트 기반 — 구버전 기록엔 없을 수 있음)
  const events = Array.isArray(match.match_events) ? match.match_events : [];
  const hasTimeline = events.length > 0;

  // 스탯: 공격포인트 순 정렬 + 합계, 최고 기록자 하이라이트
  const stats = (match.match_stats || []).map(r => ({
    name: r['이름'], g: r['골'] || 0, a: r['어시스트'] || 0,
  }));
  stats.sort((x, y) => (y.g - x.g) || (y.a - x.a) || String(x.name).localeCompare(String(y.name), 'ko'));
  const totalG = stats.reduce((s, r) => s + r.g, 0);
  const totalA = stats.reduce((s, r) => s + r.a, 0);
  const maxPts = stats.reduce((m, r) => Math.max(m, r.g + r.a), 0);
  const statsRows = stats.map(r => {
    const pts = r.g + r.a;
    const cls = pts === 0 ? 'stat-dim' : (maxPts > 0 && pts === maxPts ? 'stat-top' : '');
    return `<tr class="${cls}">
      <td>${cls === 'stat-top' ? '⭐ ' : ''}${escapeHtml(r.name)}</td>
      <td class="num-cell">${r.g || ''}</td>
      <td class="num-cell">${r.a || ''}</td>
    </tr>`;
  }).join('');

  const squadRows = (match.squad_plan || []).map(row => {
    const qCells = QUARTERS.map(q => `<td class="${row[q] ? 'check-yes' : 'check-no'}">${row[q] ? '✓' : ''}</td>`).join('');
    return `<tr><td>${escapeHtml(row['이름'])}</td>${qCells}</tr>`;
  }).join('');

  // 포메이션 이미지 생성
  const hasFormation = match.formation_plan && Object.values(match.formation_plan).some(f => Object.keys(f).length > 0);
  const formationSection = hasFormation
    ? `<img class="formation-image" src="${buildCombinedFormationImage(
      match.formation_plan, match.formation_subs, match.formation_types)}" alt="포메이션">`
    : '<p class="empty-hint">저장된 포메이션 데이터가 없습니다.</p>';

  container.innerHTML = `
    <div class="match-hero">
      <div class="hero-top">
        <div class="hero-badges">
          <span class="status-badge ${isDraft ? 'draft' : 'final'}">${isDraft ? '📝 임시' : '✅ 확정'}</span>
          <span class="hero-result-chip ${resultKey}">${resultLabel}</span>
        </div>
        <div class="match-actions">
          <button class="btn-hero-action editor-only" data-action="edit-match">✏️ 수정</button>
          <button class="btn-hero-action danger editor-only" data-action="delete-match">🗑️ 삭제</button>
        </div>
      </div>

      <div class="hero-score-row">
        <div class="hero-team">FC 바르자</div>
        <div class="hero-score"><span>${totUs}</span><span class="hero-colon">:</span><span>${totThem}</span></div>
        <div class="hero-team">${escapeHtml(match.opponent || '상대팀')}</div>
      </div>

      <div class="hero-meta">📅 ${escapeHtml(match.date)} &nbsp;·&nbsp; 📍 ${escapeHtml(match.location)}</div>
      <div class="hero-quarters">${quarterChips}</div>
    </div>

    <div class="card detail-card">
      <div class="detail-tabs">
        ${hasTimeline ? '<button class="detail-tab-btn active" data-dtab="dt-timeline">⏱️ 타임라인</button>' : ''}
        <button class="detail-tab-btn ${hasTimeline ? '' : 'active'}" data-dtab="dt-stats">📊 스탯</button>
        <button class="detail-tab-btn" data-dtab="dt-formation">🏟️ 포메이션</button>
        <button class="detail-tab-btn" data-dtab="dt-squad">📋 명단</button>
      </div>

      ${hasTimeline ? `<div id="dt-timeline" class="detail-tab-panel">${buildTimelineHtml(events, scores)}</div>` : ''}

      <div id="dt-stats" class="detail-tab-panel" ${hasTimeline ? 'style="display:none"' : ''}>
        <table class="stats-table">
          <thead><tr><th>이름</th><th>⚽ 골</th><th>👟 도움</th></tr></thead>
          <tbody>${statsRows || '<tr><td colspan="3" class="empty-hint" style="text-align:center">데이터 없음</td></tr>'}</tbody>
          ${stats.length ? `<tfoot><tr class="stats-total"><td>합계</td><td class="num-cell">${totalG}</td><td class="num-cell">${totalA}</td></tr></tfoot>` : ''}
        </table>
      </div>

      <div id="dt-formation" class="detail-tab-panel" style="display:none">
        ${formationSection}
      </div>

      <div id="dt-squad" class="detail-tab-panel" style="display:none">
        <table class="squad-table">
          <thead><tr><th>이름</th><th>1Q</th><th>2Q</th><th>3Q</th><th>4Q</th></tr></thead>
          <tbody>${squadRows || '<tr><td colspan="5" class="empty-hint" style="text-align:center">데이터 없음</td></tr>'}</tbody>
        </table>
      </div>
    </div>

    <div id="delete-confirm-box" style="display:none" class="dup-box danger-box">
      <p id="delete-confirm-text"></p>
      <div class="dup-actions">
        <button class="btn-danger" id="delete-confirm-yes">네, 삭제합니다</button>
        <button class="btn-cancel" id="delete-confirm-no">취소</button>
      </div>
    </div>`;

  // ── 이벤트 바인딩 (인라인 onclick 대신 — 특수문자 안전) ──
  const editBtn = container.querySelector('[data-action="edit-match"]');
  if (editBtn) editBtn.addEventListener('click', () => {
    const fresh = AppState.matches.find(m => m.id === match.id);
    if (fresh) loadMatchToEditor(fresh);
  });

  const delBtn = container.querySelector('[data-action="delete-match"]');
  if (delBtn) delBtn.addEventListener('click', () => confirmDeleteMatch(match.id, match.title));

  container.querySelectorAll('.detail-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchDetailTab(btn, btn.dataset.dtab));
  });

  const cancelDel = container.querySelector('#delete-confirm-no');
  if (cancelDel) cancelDel.addEventListener('click', () => {
    const box = document.getElementById('delete-confirm-box');
    if (box) box.style.display = 'none';
  });

  // 새로 그려진 편집 버튼에 권한 상태 반영
  if (typeof updateEditButtonsVisibility === 'function') updateEditButtonsVisibility();
}

function switchDetailTab(btn, panelId) {
  document.querySelectorAll('.detail-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.detail-tab-panel').forEach(p => p.style.display = 'none');
  btn.classList.add('active');
  const panel = document.getElementById(panelId);
  if (panel) panel.style.display = '';
}

function confirmDeleteMatch(matchId, matchTitle) {
  if (!checkEditorAccess()) return;
  const box = document.getElementById('delete-confirm-box');
  const text = document.getElementById('delete-confirm-text');
  const yesBtn = document.getElementById('delete-confirm-yes');
  if (!box) return;
  text.innerHTML = `정말 <strong>${escapeHtml(matchTitle)}</strong> 기록을 삭제하시겠습니까?`;
  yesBtn.onclick = async () => {
    await deleteMatch(matchId);
  };
  box.style.display = 'block';
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function deleteMatch(matchId) {
  if (!checkEditorAccess()) return;
  AppState.matches = AppState.matches.filter(m => m.id !== matchId);
  try {
    await saveMatches();
    showToast('기록이 삭제되었습니다.', 'success');
    renderHistoryTab();
  } catch (e) {
    showToast('삭제 실패: ' + e.message, 'error');
  }
}
