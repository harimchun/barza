// =============================================
// FC 바르자 팀 매니저 - Tab 3: 기록 조회 & 수정
// =============================================

function renderHistoryTab(selectId) {
  const container = document.getElementById('tab3-content');
  if (!container) return;

  const history = [...AppState.matches].sort((a, b) => String(b.id).localeCompare(String(a.id)));
  const startIdx = selectId ? Math.max(0, history.findIndex(m => m.id === selectId)) : 0;

  if (history.length === 0) {
    container.innerHTML = '<div class="empty-state"><p>📭 저장된 경기 기록이 없습니다.</p></div>';
    return;
  }

  const optionsHtml = history.map((m, i) => {
    const icon = m.status === 'draft' ? '📝' : (m.type === 'intra' ? '🔁' : '✅');
    return `<option value="${i}" ${i === startIdx ? 'selected' : ''}>${icon} ${escapeHtml(m.date)} — ${escapeHtml(m.venue)} vs ${escapeHtml(m.opponent)}</option>`;
  }).join('');

  container.innerHTML = `
    ${AppState.legacyMatches ? '<div class="role-notice-banner">⚠️ DB가 구버전 형식입니다. 스프레드시트 이관(tools/import_sheet.py --upload)을 실행하면 전체 기록이 표시됩니다.</div>' : ''}
    <div class="history-selector-row">
      <select id="history-match-select" class="history-select">
        ${optionsHtml}
      </select>
    </div>
    <div id="history-match-detail"></div>`;

  const sel = document.getElementById('history-match-select');
  sel.addEventListener('change', () => renderMatchDetail(history[parseInt(sel.value)]));
  renderMatchDetail(history[startIdx]);
  if (selectId) window.scrollTo({ top: 0, behavior: 'smooth' });
}

// events → 좌(바르자)/우(상대) 타임라인 HTML
function buildTimelineHtml(events, scores, quarters) {
  const blocks = quarters.map(q => {
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

  const isDraft = match.status === 'draft';
  const quarters = recordQuarters(match);
  const scores = match.scores || {};
  const totUs = quarters.reduce((s, q) => s + ((scores[q] || [0, 0])[0]), 0);
  const totThem = quarters.reduce((s, q) => s + ((scores[q] || [0, 0])[1]), 0);

  const resultKey = totUs > totThem ? 'win' : totUs < totThem ? 'loss' : 'draw';
  const resultLabel = match.scoresKnown === false ? '스코어 미기록' : { win: '승리', loss: '패배', draw: '무승부' }[resultKey];

  const quarterChips = quarters.map(q => {
    const [u, t] = scores[q] || [0, 0];
    const cls = u > t ? 'q-win' : u < t ? 'q-loss' : 'q-draw';
    return `<div class="hero-q-chip ${cls}">
      <span class="hero-q-label">${q}</span>
      <span class="hero-q-score">${u} : ${t}</span>
    </div>`;
  }).join('');

  const events = Array.isArray(match.events) ? match.events : [];
  const hasTimeline = events.length > 0;

  // 스탯: 공격포인트 순 정렬 + 합계
  const credits = recordParticipation(match);
  const names = new Set([...(match.attendees || []), ...Object.keys(credits), ...Object.keys(match.stats || {})]);
  const stats = [...names].map(n => ({
    name: n, g: (match.stats && match.stats[n] && match.stats[n].goals) || 0,
    a: (match.stats && match.stats[n] && match.stats[n].assists) || 0,
    q: credits[n] || 0,
  }));
  stats.sort((x, y) => (y.g - x.g) || (y.a - x.a) || (y.q - x.q) || String(x.name).localeCompare(String(y.name), 'ko'));
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
      <td class="num-cell">${r.q ? fmtQ(r.q) : ''}</td>
    </tr>`;
  }).join('');

  // 명단: 쿼터별 ● 주전 / ◐ 교체 관여 + 실 참여 합계
  const targets = recordTargets(match);
  const played = [...names].filter(n => credits[n] > 0).sort((a, b) => (credits[b] - credits[a]) || a.localeCompare(b, 'ko'));
  const benchOnly = [...names].filter(n => !(credits[n] > 0));
  const squadRows = played.map(n => {
    const qCells = quarters.map(q => {
      const qd = (match.quarters || {})[q] || {};
      const c = quarterCredit(qd.lineup, qd.subs, n);
      const mark = c >= 1 ? '●' : c > 0 ? '◐' : '';
      return `<td class="${c > 0 ? 'check-yes' : 'check-no'}">${mark}</td>`;
    }).join('');
    const st = targets.status[n] || 'ok';
    return `<tr class="squad-row-${st}"><td>${escapeHtml(formatPlayerName(n))}</td>${qCells}<td class="num-cell participation-score ${st}">${fmtQ(credits[n])}</td></tr>`;
  }).join('');
  const subsRows = quarters.map(q => {
    const subs = (((match.quarters || {})[q] || {}).subs || []);
    if (!subs.length) return '';
    return `<li><strong>${q}</strong> ${subs.map(s => `${escapeHtml(s.in || '?')} <span class="sub-arrow">→</span> ${escapeHtml(s.out || '?')}${s.pos ? ` <small>(${escapeHtml(s.pos)})</small>` : ''}`).join(' · ')}</li>`;
  }).join('');
  const playedCount = played.length;

  // 포메이션 이미지
  const plan = {}, subsMap = {}, types = {}, coords = {};
  quarters.forEach(q => {
    const qd = (match.quarters || {})[q] || {};
    plan[q] = qd.lineup || {};
    types[q] = qd.formation || '?';
    coords[q] = qd.coords || {};
    subsMap[q] = {};
    (qd.subs || []).forEach(s => { if (s.pos && s.in) subsMap[q][s.pos] = s.in; });
  });
  const hasFormation = Object.values(plan).some(f => Object.keys(f).length > 0);
  const formationSection = hasFormation
    ? `<img class="formation-image" src="${buildCombinedFormationImage(plan, subsMap, types, coords, quarters)}" alt="포메이션">`
    : '<p class="empty-hint">저장된 포메이션 데이터가 없습니다.</p>';

  const sourceTag = match.source && match.source.kind === 'sheet' ? ' · 📄 스프레드시트' : '';
  const metaExtra = [match.timeSlot, match.notes].filter(Boolean).map(escapeHtml).join(' · ');

  container.innerHTML = `
    <div class="match-hero">
      <div class="hero-top">
        <div class="hero-badges">
          <span class="status-badge ${isDraft ? 'draft' : 'final'}">${isDraft ? '📝 임시' : '✅ 확정'}</span>
          <span class="hero-result-chip ${resultKey}">${resultLabel}</span>
          ${match.type === 'intra' ? '<span class="status-badge draft">🔁 자체전 (통계 제외)</span>' : ''}
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

      <div class="hero-meta">📅 ${escapeHtml(match.date)} &nbsp;·&nbsp; 📍 ${escapeHtml(match.venue)}${metaExtra ? ' &nbsp;·&nbsp; ' + metaExtra : ''}${sourceTag}</div>
      <div class="hero-quarters">${quarterChips}</div>
    </div>

    <div class="card detail-card">
      <div class="detail-tabs">
        ${hasTimeline ? '<button class="detail-tab-btn active" data-dtab="dt-timeline">⏱️ 타임라인</button>' : ''}
        <button class="detail-tab-btn ${hasTimeline ? '' : 'active'}" data-dtab="dt-stats">📊 스탯</button>
        <button class="detail-tab-btn" data-dtab="dt-formation">🏟️ 포메이션</button>
        <button class="detail-tab-btn" data-dtab="dt-squad">📋 명단·쿼터</button>
      </div>

      ${hasTimeline ? `<div id="dt-timeline" class="detail-tab-panel">${buildTimelineHtml(events, scores, quarters)}</div>` : ''}

      <div id="dt-stats" class="detail-tab-panel" ${hasTimeline ? 'style="display:none"' : ''}>
        <table class="stats-table">
          <thead><tr><th>이름</th><th>⚽ 골</th><th>👟 도움</th><th>쿼터</th></tr></thead>
          <tbody>${statsRows || '<tr><td colspan="4" class="empty-hint" style="text-align:center">데이터 없음</td></tr>'}</tbody>
          ${stats.length ? `<tfoot><tr class="stats-total"><td>합계</td><td class="num-cell">${totalG}</td><td class="num-cell">${totalA}</td><td></td></tr></tfoot>` : ''}
        </table>
      </div>

      <div id="dt-formation" class="detail-tab-panel" style="display:none">
        ${formationSection}
        ${subsRows ? `<ul class="subs-list"><li class="subs-list-title">교체 (In → Out)</li>${subsRows}</ul>` : ''}
      </div>

      <div id="dt-squad" class="detail-tab-panel" style="display:none">
        <div class="playtime-info" style="margin-bottom:0.5rem">
          <span>참석 <strong>${targets.attendees}명</strong></span>
          <span>출전 <strong>${playedCount}명</strong></span>
          <span>목표 <strong>${fmtQ(targets.target)}Q</strong> <small>(${targets.onFieldSize}명 × ${targets.quarterCount}Q)</small></span>
          <span>실제 평균 <strong>${fmtQ(targets.avg)}Q</strong></span>
          <span>범위 <strong>${fmtQ(targets.min)}~${fmtQ(targets.max)}Q</strong></span>
        </div>
        <table class="squad-table">
          <thead><tr><th>이름</th>${quarters.map(q => `<th>${q}</th>`).join('')}<th>참여</th></tr></thead>
          <tbody>${squadRows || '<tr><td colspan="6" class="empty-hint" style="text-align:center">데이터 없음</td></tr>'}</tbody>
        </table>
        ${benchOnly.length ? `<p class="hint-text" style="margin-top:0.5rem">출전 없음: ${benchOnly.map(escapeHtml).join(', ')}</p>` : ''}
        <p class="hint-text">● 주전 1쿼터 · ◐ 교체 In/Out 0.5쿼터</p>
      </div>
    </div>

    <div id="delete-confirm-box" style="display:none" class="dup-box danger-box">
      <p id="delete-confirm-text"></p>
      <div class="dup-actions">
        <button class="btn-danger" id="delete-confirm-yes">네, 삭제합니다</button>
        <button class="btn-cancel" id="delete-confirm-no">취소</button>
      </div>
    </div>`;

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
  yesBtn.onclick = async () => { await deleteMatch(matchId); };
  box.style.display = 'block';
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

async function deleteMatch(matchId) {
  if (!checkEditorAccess()) return;
  if (AppState.legacyMatches) { showToast('DB 이관 전에는 삭제할 수 없습니다.', 'error'); return; }
  try {
    await deleteMatchRecord(matchId);
    if (AppState.editModeId === matchId) AppState.editModeId = null;
    showToast('기록이 삭제되었습니다.', 'success');
    renderHistoryTab();
  } catch (e) {
    showToast('삭제 실패: ' + e.message, 'error');
  }
}
