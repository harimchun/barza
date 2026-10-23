// =============================================
// FC 바르자 팀 매니저 - Tab 4: 선수단 관리
// =============================================

function renderRosterTab() {
  const container = document.getElementById('tab4-content');
  if (!container) return;

  const { members, inactive, guests, lastSeen } = getRosterGroups();

  const buildRows = (names, isGuestGroup) => {
    if (names.length === 0) {
      return `<tr><td colspan="4" class="empty-hint" style="text-align:center;padding:1rem">아직 없습니다.</td></tr>`;
    }
    return names.map(name => {
      const p = getPlayer(name);
      const safe = escapeHtml(name);
      const editing = AppState.rosterEditing === name;
      if (editing) {
        return `
    <tr class="roster-edit-row" data-name="${safe}">
      <td colspan="4">
        <div class="roster-edit-form">
          <label>이름(표시)<input type="text" value="${safe}" disabled></label>
          <label>본명<input type="text" class="re-fullname" value="${escapeHtml(p.fullName || '')}" placeholder="예: 정주열"></label>
          <label>선호 포지션<input type="text" class="re-positions" value="${escapeHtml((p.positions || []).join(', '))}" placeholder="예: RB, GK (우선순위 순)"></label>
          <label>등번호<input type="number" class="re-jersey" value="${p.jerseyNo == null ? '' : p.jerseyNo}" min="0"></label>
          <label>별칭<input type="text" class="re-aliases" value="${escapeHtml((p.aliases || []).join(', '))}" placeholder="기록에 쓰인 다른 표기"></label>
          <label class="re-check"><input type="checkbox" class="re-active" ${p.active !== false ? 'checked' : ''}> 활동 중</label>
          <div class="roster-edit-actions">
            <button class="btn-primary btn-sm" data-action="save-edit" data-name="${safe}">저장</button>
            <button class="btn-cancel btn-sm" data-action="cancel-edit">취소</button>
          </div>
        </div>
      </td>
    </tr>`;
      }
      const pos = (p.positions || []).join(', ');
      const meta = [
        p.fullName && p.fullName !== name ? escapeHtml(p.fullName) : '',
        p.jerseyNo != null ? `#${p.jerseyNo}` : '',
        isGuestGroup && lastSeen[name] ? `최근 ${escapeHtml(lastSeen[name])}` : '',
      ].filter(Boolean).join(' · ');
      return `
    <tr>
      <td class="roster-name">${safe}${meta ? `<div class="roster-meta">${meta}</div>` : ''}</td>
      <td class="roster-pos">${pos ? escapeHtml(pos) : '<span class="empty-hint">-</span>'}</td>
      <td><span class="role-badge ${isGuestGroup ? 'guest' : 'member'}">${isGuestGroup ? '용병' : (p.active === false ? '비활동' : '멤버')}</span></td>
      <td class="roster-actions">
        <button class="btn-sm editor-only" data-action="edit" data-name="${safe}">✏️</button>
        ${isGuestGroup
          ? `<button class="btn-sm btn-promote editor-only" data-action="promote" data-name="${safe}">멤버로</button>`
          : `<button class="btn-sm btn-demote editor-only" data-action="demote" data-name="${safe}">용병으로</button>`}
        <button class="btn-sm btn-delete-player editor-only" data-action="delete" data-name="${safe}" title="삭제">🗑️</button>
      </td>
    </tr>`;
    }).join('');
  };

  const table = (names, isGuestGroup) => `
        <table class="roster-table">
          <thead><tr><th>이름</th><th>선호 포지션</th><th>구분</th><th>관리</th></tr></thead>
          <tbody>${buildRows(names, isGuestGroup)}</tbody>
        </table>`;

  container.innerHTML = `
    <div class="roster-add-card">
      <h3>➕ 선수 / 용병 등록</h3>
      <div class="roster-add-form">
        <input type="text" id="new-player-name" class="editor-only" placeholder="이름 입력">
        <input type="text" id="new-player-positions" class="editor-only" placeholder="선호 포지션 (예: RB, GK)">
        <select id="new-player-role" class="editor-only">
          <option value="member">멤버</option>
          <option value="guest">용병</option>
        </select>
        <button class="btn-primary editor-only" data-action="add">등록하기</button>
      </div>
    </div>

    <div class="roster-grid">
      <div class="roster-section">
        <h3>👕 정식 멤버 <span class="count-badge">${members.length}</span></h3>
        ${table(members, false)}
        ${inactive.length ? `<details style="margin-top:0.5rem"><summary class="hint-text">비활동 멤버 ${inactive.length}명</summary>${table(inactive, false)}</details>` : ''}
      </div>
      <div class="roster-section">
        <h3>🤝 용병 <span class="count-badge guest">${guests.length}</span> <small class="hint-text">최근 출전순</small></h3>
        <input type="search" id="roster-guest-filter" placeholder="용병 이름 검색" autocomplete="off" style="margin-bottom:0.5rem">
        <div id="roster-guest-table">${table(guests, true)}</div>
      </div>
    </div>

    <div class="roster-section" style="margin-top:1rem">
      <h3>⚙️ 편집 설정</h3>
      <p class="hint-text">편집 암호를 아는 사람만 경기·명단을 수정할 수 있습니다. 정한 암호를 팀원에게 공유하세요.</p>
      <button class="btn-secondary editor-only" data-action="change-passcode">🔑 편집 암호 변경</button>
    </div>`;

  container.onclick = e => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const name = btn.dataset.name;
    if (action === 'add') addPlayer();
    else if (action === 'promote') setPlayerRole(name, 'member');
    else if (action === 'demote') setPlayerRole(name, 'guest');
    else if (action === 'delete') deletePlayer(name);
    else if (action === 'edit') { AppState.rosterEditing = name; renderRosterTab(); }
    else if (action === 'cancel-edit') { AppState.rosterEditing = null; renderRosterTab(); }
    else if (action === 'save-edit') savePlayerEdit(name, btn.closest('.roster-edit-form'));
    else if (action === 'change-passcode') openChangePasscodeModal();
  };

  document.getElementById('new-player-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') addPlayer();
  });
  const filter = document.getElementById('roster-guest-filter');
  if (filter) filter.addEventListener('input', () => {
    const kw = filter.value.trim();
    container.querySelectorAll('#roster-guest-table tbody tr').forEach(tr => {
      const n = tr.querySelector('.roster-name');
      tr.style.display = (!kw || !n || n.textContent.includes(kw)) ? '' : 'none';
    });
  });

  if (typeof updateEditButtonsVisibility === 'function') updateEditButtonsVisibility();
}

function parsePositionsInput(text) {
  return String(text || '').split(/[,/\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i);
}

async function addPlayer() {
  if (!checkEditorAccess()) return;
  const nameInp = document.getElementById('new-player-name');
  const posInp = document.getElementById('new-player-positions');
  const roleSel = document.getElementById('new-player-role');
  const name = nameInp.value.trim().replace(/\s+/g, '');
  if (!name) return;
  if (AppState.roster[name]) {
    showToast(`"${name}"은(는) 이미 등록되어 있습니다.`, 'error');
    return;
  }
  AppState.roster[name] = normalizePlayer(name, {
    role: roleSel.value, positions: parsePositionsInput(posInp.value),
    fullName: name.length >= 3 ? name : null,
  });
  nameInp.value = '';
  posInp.value = '';
  await persistPlayer(name, `${name} 등록 완료! (${roleSel.value === 'guest' ? '용병' : '멤버'})`);
}

async function setPlayerRole(name, role) {
  if (!checkEditorAccess()) return;
  AppState.roster[name].role = role;
  await persistPlayer(name, role === 'member' ? `${name}님을 정식 멤버로 승격했습니다! 🎉` : `${name}님을 용병으로 변경했습니다.`);
}

async function savePlayerEdit(name, form) {
  if (!checkEditorAccess() || !form) return;
  const p = AppState.roster[name];
  p.fullName = form.querySelector('.re-fullname').value.trim() || null;
  p.positions = parsePositionsInput(form.querySelector('.re-positions').value);
  const j = form.querySelector('.re-jersey').value.trim();
  p.jerseyNo = j === '' ? null : parseInt(j, 10);
  p.aliases = form.querySelector('.re-aliases').value.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
  p.active = form.querySelector('.re-active').checked;
  AppState.rosterEditing = null;
  await persistPlayer(name, `${name} 정보를 저장했습니다.`);
}

async function deletePlayer(name) {
  if (!checkEditorAccess()) return;
  const used = AppState.matches.filter(m => (m.attendees || []).includes(name)).length;
  const msg = used
    ? `"${name}"은(는) 경기 기록 ${used}건에 등장합니다. 명단에서 삭제해도 기록은 남습니다. 삭제하시겠습니까?`
    : `"${name}"을(를) 선수단에서 삭제하시겠습니까?`;
  if (!confirm(msg)) return;
  delete AppState.roster[name];
  try {
    await deletePlayerRecord(name);
    showToast(`${name} 삭제 완료.`);
  } catch (e) {
    showToast('명단 저장 실패: ' + e.message, 'error');
  }
  renderRosterTab();
  renderPlayerChecklist();
}

async function persistPlayer(name, successMsg) {
  try {
    await savePlayer(name);
    if (successMsg) showToast(successMsg);
  } catch (e) {
    showToast('명단 저장 실패: ' + e.message, 'error');
  }
  renderRosterTab();
  renderPlayerChecklist();
}
