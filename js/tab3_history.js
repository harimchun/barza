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

function renderMatchDetail(match) {
  const container = document.getElementById('history-match-detail');
  if (!container || !match) return;

  const isDraft = match.is_draft;
  const scores = match.scores || {};
  const totUs = QUARTERS.reduce((s, q) => s + (scores[q]?.[0] || 0), 0);
  const totThem = QUARTERS.reduce((s, q) => s + (scores[q]?.[1] || 0), 0);

  const scoreRows = QUARTERS.map(q => {
    const [u, t] = scores[q] || [0, 0];
    return `<div class="score-detail-row"><span>${q}</span>
      <span class="score-badge">${u} : ${t}</span></div>`;
  }).join('');

  const statsRows = (match.match_stats || []).map(row => `
    <tr>
      <td>${escapeHtml(row['이름'])}</td>
      <td class="num-cell">${row['골'] || 0}</td>
      <td class="num-cell">${row['어시스트'] || 0}</td>
    </tr>`).join('');

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
    <div class="match-detail-card">
      <div class="match-detail-header">
        <div class="match-detail-title">
          <span class="status-badge ${isDraft ? 'draft' : 'final'}">${isDraft ? '임시' : '확정'}</span>
          <h2>${escapeHtml(match.title)}</h2>
        </div>
        <div class="match-actions">
          <button class="btn-primary editor-only" data-action="edit-match">
            ✏️ 불러오기 & 수정
          </button>
          <button class="btn-danger editor-only" data-action="delete-match">
            🗑️ 삭제
          </button>
        </div>
      </div>

      <div class="detail-score-summary">
        <div class="total-score">
          <span class="score-team">FC 바르자</span>
          <span class="score-number">${totUs}</span>
          <span class="score-colon">:</span>
          <span class="score-number">${totThem}</span>
          <span class="score-team">상대팀</span>
        </div>
        <div class="quarter-scores">${scoreRows}</div>
      </div>

      <div class="detail-tabs">
        <button class="detail-tab-btn active" data-dtab="dt-stats">📊 스탯</button>
        <button class="detail-tab-btn" data-dtab="dt-formation">🏟️ 포메이션</button>
        <button class="detail-tab-btn" data-dtab="dt-squad">📋 명단</button>
      </div>

      <div id="dt-stats" class="detail-tab-panel active">
        <table class="stats-table">
          <thead><tr><th>이름</th><th>⚽ 골</th><th>👟 어시스트</th></tr></thead>
          <tbody>${statsRows || '<tr><td colspan="3">데이터 없음</td></tr>'}</tbody>
        </table>
      </div>

      <div id="dt-formation" class="detail-tab-panel" style="display:none">
        ${formationSection}
      </div>

      <div id="dt-squad" class="detail-tab-panel" style="display:none">
        <table class="squad-table">
          <thead><tr><th>이름</th><th>1Q</th><th>2Q</th><th>3Q</th><th>4Q</th></tr></thead>
          <tbody>${squadRows || '<tr><td colspan="5">데이터 없음</td></tr>'}</tbody>
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
