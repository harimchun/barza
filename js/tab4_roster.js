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
          <label>우선순위<select class="re-priority">
            ${[1, 2, 3].map(v => `<option value="${v}" ${(p.priority || 2) === v ? 'selected' : ''}>${Quota.PRIORITY_LABELS[v]} (×${Quota.PRIORITY_WEIGHTS[v]})</option>`).join('')}
          </select></label>
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
      const prio = p.priority || 2;
      const prioBadge = prio !== 2 ? ` <span class="prio-badge prio-${prio}" title="우선순위 ${prio} (출전 가중치 ×${Quota.PRIORITY_WEIGHTS[prio]})">${prio === 1 ? icon('star', 'ic-sm') + ' 1순위' : '3순위'}</span>` : '';
      const meta = [
        p.fullName && p.fullName !== name ? escapeHtml(p.fullName) : '',
        p.jerseyNo != null ? `#${p.jerseyNo}` : '',
        isGuestGroup && lastSeen[name] ? `최근 ${escapeHtml(lastSeen[name])}` : '',
      ].filter(Boolean).join(' · ');
      return `
    <tr>
      <td class="roster-name">${safe}${prioBadge}${meta ? `<div class="roster-meta">${meta}</div>` : ''}</td>
      <td class="roster-pos">${pos ? escapeHtml(pos) : '<span class="empty-hint">-</span>'}</td>
      <td><span class="role-badge ${isGuestGroup ? 'guest' : 'member'}">${isGuestGroup ? '용병' : (p.active === false ? '비활동' : '멤버')}</span></td>
      <td class="roster-actions">
        <button class="btn-sm editor-only" data-action="edit" data-name="${safe}" title="편집">${icon('edit')}</button>
        ${isGuestGroup
          ? `<button class="btn-sm btn-promote editor-only" data-action="promote" data-name="${safe}">멤버로</button>`
          : `<button class="btn-sm btn-demote editor-only" data-action="demote" data-name="${safe}">용병으로</button>`}
        <button class="btn-sm btn-delete-player editor-only" data-action="delete" data-name="${safe}" title="삭제">${icon('trash')}</button>
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
      <h3>${icon('plus')} 선수 / 용병 등록</h3>
      <div class="roster-add-form">
        <input type="text" id="new-player-name" class="editor-only" placeholder="이름 입력">
        <input type="text" id="new-player-positions" class="editor-only" placeholder="선호 포지션 (예: RB, GK)">
        <select id="new-player-role" class="editor-only">
          <option value="member">멤버</option>
          <option value="guest">용병</option>
        </select>
        <select id="new-player-priority" class="editor-only" title="출전 우선순위">
          <option value="2">2순위 (기본)</option>
          <option value="1">1순위 (핵심 ×1.25)</option>
          <option value="3">3순위 (보조 ×0.75)</option>
        </select>
        <button class="btn-primary editor-only" data-action="add">등록하기</button>
      </div>
    </div>

    <div class="roster-stack">
      <div class="roster-section">
        <h3>${icon('shirt')} 정식 멤버 <span class="count-badge">${members.length}</span></h3>
        ${table(members, false)}
        ${inactive.length ? `<details style="margin-top:0.5rem"><summary class="hint-text">비활동 멤버 ${inactive.length}명</summary>${table(inactive, false)}</details>` : ''}
      </div>
      <details class="roster-section roster-guests" ${AppState.rosterGuestsOpen ? 'open' : ''}>
        <summary><h3>${icon('users')} 용병 <span class="count-badge guest">${guests.length}</span> <small class="hint-text">최근 출전순 · 눌러서 펼치기</small></h3></summary>
        <input type="search" id="roster-guest-filter" placeholder="용병 이름 검색" autocomplete="off" style="margin-bottom:0.5rem">
        <div id="roster-guest-table">${table(guests, true)}</div>
      </details>
    </div>

    <div class="roster-section" style="margin-top:1rem">
      <h3>${icon('settings')} 편집 권한 (구글 계정)</h3>
      <p class="hint-text">아래 목록에 있는 구글 계정으로 로그인한 사람만 경기·명단을 수정할 수 있습니다. 멤버의 구글 이메일을 추가하거나, 멤버가 보낸 권한 요청을 승인하세요.</p>
      ${buildEditorsSection()}
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
    else if (action === 'add-editor') addEditorFromForm();
    else if (action === 'remove-editor') removeEditorConfirm(btn.dataset.key);
    else if (action === 'approve-request') handleEditorRequest(btn.dataset.uid, true);
    else if (action === 'reject-request') handleEditorRequest(btn.dataset.uid, false);
  };
  const editorInput = document.getElementById('new-editor-email');
  if (editorInput) editorInput.addEventListener('keydown', e => { if (e.key === 'Enter') addEditorFromForm(); });

  document.getElementById('new-player-name').addEventListener('keydown', e => {
    if (e.key === 'Enter') addPlayer();
  });
  const guestsBox = container.querySelector('.roster-guests');
  if (guestsBox) guestsBox.addEventListener('toggle', () => { AppState.rosterGuestsOpen = guestsBox.open; });
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
  const prioSel = document.getElementById('new-player-priority');
  AppState.roster[name] = normalizePlayer(name, {
    role: roleSel.value, positions: parsePositionsInput(posInp.value),
    fullName: name.length >= 3 ? name : null,
    priority: prioSel ? parseInt(prioSel.value, 10) : 2,
  });
  nameInp.value = '';
  posInp.value = '';
  await persistPlayer(name, `${name} 등록 완료! (${roleSel.value === 'guest' ? '용병' : '멤버'})`);
}

async function setPlayerRole(name, role) {
  if (!checkEditorAccess()) return;
  AppState.roster[name].role = role;
  await persistPlayer(name, role === 'member' ? `${name}님을 정식 멤버로 승격했습니다!` : `${name}님을 용병으로 변경했습니다.`);
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
  p.priority = parseInt(form.querySelector('.re-priority').value, 10) || 2;
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

// ── 편집자(구글 계정) 관리 ─────────────────────────────────────────────────
function buildEditorsSection() {
  const editors = Object.entries(AppState.editors || {}).sort((a, b) => (a[1].email || '').localeCompare(b[1].email || ''));
  const requests = Object.entries(AppState.editorRequests || {});
  const me = AppState.user ? AppState.user.email : '';
  const editorRows = editors.length
    ? editors.map(([key, e]) => `
        <li class="editor-item">
          <span class="editor-mail">${escapeHtml(e.email)}${e.email === me ? ' <small>(나)</small>' : ''}${e.name ? ` <small>${escapeHtml(e.name)}</small>` : ''}</span>
          <button class="btn-sm btn-delete-player editor-only" data-action="remove-editor" data-key="${escapeHtml(key)}" title="편집 권한 제거" ${editors.length === 1 ? 'disabled' : ''}>${icon('close')}</button>
        </li>`).join('')
    : '<li class="empty-hint">아직 편집자가 없습니다. 처음 로그인하는 계정이 자동으로 편집자가 됩니다.</li>';
  const requestRows = requests.length
    ? `<h4 class="editor-sub">권한 요청 <span class="count-badge guest">${requests.length}</span></h4>
       <ul class="editor-list">${requests.map(([uid, r]) => `
        <li class="editor-item">
          <span class="editor-mail">${escapeHtml(r.email || '')}${r.name ? ` <small>${escapeHtml(r.name)}</small>` : ''}</span>
          <span class="editor-actions">
            <button class="btn-sm btn-promote editor-only" data-action="approve-request" data-uid="${escapeHtml(uid)}">승인</button>
            <button class="btn-sm btn-demote editor-only" data-action="reject-request" data-uid="${escapeHtml(uid)}">거절</button>
          </span>
        </li>`).join('')}</ul>`
    : '';
  return `
      <ul class="editor-list">${editorRows}</ul>
      <div class="roster-add-form" style="margin-top:0.6rem">
        <input type="email" id="new-editor-email" class="editor-only" placeholder="멤버 구글 이메일 (예: name@gmail.com)">
        <input type="text" id="new-editor-name" class="editor-only" placeholder="이름 (선택)" style="max-width:140px">
        <button class="btn-primary editor-only" data-action="add-editor">편집자 추가</button>
      </div>
      ${requestRows}`;
}

async function addEditorFromForm() {
  if (!checkEditorAccess()) return;
  const email = (document.getElementById('new-editor-email').value || '').trim();
  const name = (document.getElementById('new-editor-name').value || '').trim();
  if (!email) return;
  try {
    await addEditor(email, name, AppState.user ? AppState.user.email : '');
    showToast(`${email} 계정에 편집 권한을 주었습니다.`);
  } catch (e) {
    showToast('편집자 추가 실패: ' + e.message, 'error');
  }
  renderRosterTab();
}

async function removeEditorConfirm(key) {
  if (!checkEditorAccess()) return;
  const e = AppState.editors[key];
  if (!e) return;
  const mine = AppState.user && e.email === AppState.user.email;
  if (!confirm(`${e.email} 계정의 편집 권한을 제거할까요?${mine ? '\n(본인 계정입니다. 제거하면 바로 읽기 전용이 됩니다.)' : ''}`)) return;
  try {
    await removeEditor(key);
    showToast('편집 권한을 제거했습니다.');
    if (mine) await applyAuthState(window._fbAuth && window._fbAuth.currentUser);
  } catch (err) {
    showToast('제거 실패: ' + err.message, 'error');
  }
  renderRosterTab();
}

async function handleEditorRequest(uid, approve) {
  if (!checkEditorAccess()) return;
  const r = AppState.editorRequests[uid];
  try {
    await resolveEditorRequest(uid, approve);
    showToast(approve ? `${r ? r.email : ''} 계정을 편집자로 승인했습니다.` : '요청을 거절했습니다.');
  } catch (e) {
    showToast('처리 실패: ' + e.message, 'error');
  }
  renderRosterTab();
}
