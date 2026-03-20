// =============================================
// FC 바르자 팀 매니저 - 포메이션 Canvas 그리기 & 이미지 내보내기
// =============================================

/**
 * 단일 quarter 포메이션을 지정 canvas context에 그린다.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} ox - 오프셋 x
 * @param {number} oy - 오프셋 y
 * @param {number} w  - 그릴 너비
 * @param {number} h  - 그릴 높이
 * @param {string} quarter - '1Q'...'4Q'
 * @param {Object} fMap   - { pos: playerName }
 * @param {Object} fSubs  - { pos: subPlayerName }
 * @param {string} fType  - 포메이션 문자열
 */
function drawQuarterFormation(ctx, ox, oy, w, h, quarter, fMap, fSubs, fType) {
    // --- 배경: 잔디 ---
    ctx.fillStyle = '#2d6a4f';
    ctx.fillRect(ox, oy, w, h);

    // --- 피치 라인 ---
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;

    // 외곽선
    ctx.strokeRect(ox + 2, oy + 2, w - 4, h - 4);

    // 센터라인 (수직)
    const cx = ox + w / 2;
    ctx.beginPath(); ctx.moveTo(cx, oy + 2); ctx.lineTo(cx, oy + h - 2); ctx.stroke();

    // 센터서클
    ctx.beginPath();
    ctx.arc(cx, oy + h / 2, Math.min(w, h) * 0.12, 0, Math.PI * 2);
    ctx.stroke();

    // 왼쪽 페널티 에어리어
    const pW = w * 0.165;
    const pH = h * 0.57;
    const pTop = oy + (h - pH) / 2;
    ctx.strokeRect(ox + 2, pTop, pW, pH);

    // 오른쪽 페널티 에어리어
    ctx.strokeRect(ox + w - pW - 2, pTop, pW, pH);

    ctx.restore();

    // --- 타이틀 ---
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(ox, oy, w, 28);
    ctx.fillStyle = '#f0b429';
    ctx.font = `bold ${Math.max(11, w * 0.032)}px "Inter", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`FC BARZA  ${quarter}  (${fType || '?'})`, ox + w / 2, oy + 14);
    ctx.restore();

    // --- 선수 마커 ---
    fMap = fMap || {};
    fSubs = fSubs || {};

    for (const [pos, player] of Object.entries(fMap)) {
        if (!player || player === '-') continue;
        const coord = POS_COORDS[pos];
        if (!coord) continue;

        // pitch-to-canvas 변환 (pitch: 0-100 x, 0-70 y with y=0 at bottom after flip)
        const px = ox + (coord[0] / 100) * w;
        const py = oy + 28 + ((1 - coord[1] / 70) * (h - 28));

        const radius = Math.max(14, w * 0.035);

        // 원 배경 (본선)
        ctx.save();
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fillStyle = '#1d3461';
        ctx.fill();
        ctx.strokeStyle = '#f0b429';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();

        // 포지션 라벨
        ctx.save();
        ctx.fillStyle = '#f0b429';
        ctx.font = `bold ${Math.max(8, radius * 0.55)}px "Inter", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(pos, px, py);
        ctx.restore();

        // 선수 이름 (교체 있으면 "out / in" 형식으로 표시)
        const subPlayer = fSubs[pos];
        const hasSubPlayer = subPlayer && subPlayer !== '-';
        const nameStr = hasSubPlayer ? `${player} / ${subPlayer}` : player;

        ctx.save();
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${Math.max(9, radius * 0.65)}px "Apple Gothic", "Malgun Gothic", "NanumGothic", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(nameStr, px, py + radius + 2);
        ctx.restore();
    }
}

/**
 * 현재 AppState의 4개 쿼터 포메이션을 2x2 그리드로 합성 → PNG 다운로드
 */
function exportCombinedFormation() {
    const qW = 700, qH = 480;
    const canvas = document.createElement('canvas');
    canvas.width = qW * 2;
    canvas.height = qH * 2;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    QUARTERS.forEach((q, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const ox = col * qW;
        const oy = row * qH;
        drawQuarterFormation(
            ctx, ox, oy, qW, qH, q,
            AppState.formationState[q],
            AppState.formationSubs[q],
            AppState.formationTypes[q]
        );
    });

    // 다운로드
    canvas.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `fc_barza_formations_${AppState.matchDate}.png`;
        a.click();
        URL.revokeObjectURL(url);
    }, 'image/png');
}

/**
 * 4개 쿼터 포메이션을 이미지 src로 반환 (기록 조회 탭용)
 */
function buildCombinedFormationImage(formationPlan, formationSubs, formationTypes) {
    const qW = 600, qH = 400;
    const canvas = document.createElement('canvas');
    canvas.width = qW * 2;
    canvas.height = qH * 2;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    QUARTERS.forEach((q, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        drawQuarterFormation(
            ctx, col * qW, row * qH, qW, qH, q,
            formationPlan?.[q] || {},
            formationSubs?.[q] || {},
            formationTypes?.[q] || '?'
        );
    });
    return canvas.toDataURL('image/png');
}

/**
 * Tab1 포메이션 미리보기 캔버스 업데이트
 */
function updateFormationPreview() {
    const canvas = document.getElementById('formation-preview-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const q = AppState.currentQuarter;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawQuarterFormation(
        ctx, 0, 0, canvas.width, canvas.height, q,
        AppState.formationState[q],
        AppState.formationSubs[q],
        AppState.formationTypes[q]
    );
}
