// =============================================
// FC 바르자 팀 매니저 - 쿼터 보장 엔진 (순수 함수, 브라우저/Node 공용)
// =============================================
//
// 스프레드시트 수식을 그대로 옮긴 규칙:
//   쿼터 참여      = 보드(lineup)에 있으면 1, 그 쿼터 교체 In/Out 에 등장할 때마다 0.5 차감 (최소 0)
//   실 참여 쿼터   = 쿼터 참여 합                                  (시트 X열 "실 참여횟수")
//   참여인원       = 참석자 수                                    (시트 R열 O 개수)
//   목표(예상) 쿼터 = 쿼터당 출전 인원 × 쿼터 수 ÷ 참석자 수      (시트 "예상 평균쿼터" = 44/N, 5쿼터면 55/N)
//   실제 평균 쿼터 = 실 참여 > 0 인 선수들의 평균                  (시트 AVERAGEIF(>0))
//
// 사용: 브라우저에서는 전역 `Quota`, Node에서는 require('./quota.js')

(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.Quota = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

    const DEFAULT_QUARTER_COUNT = 4;
    const DEFAULT_ON_FIELD = 11;
    const QUARTER_OPTIONS = [4, 5];
    const ON_FIELD_OPTIONS = [11, 10, 9, 8, 7];

    // 쿼터 키 목록: 4 → ['1Q','2Q','3Q','4Q']
    function quarterKeys(count) {
        const n = Math.max(1, parseInt(count, 10) || DEFAULT_QUARTER_COUNT);
        return Array.from({ length: n }, (_, i) => `${i + 1}Q`);
    }

    // 한 쿼터의 교체 쌍에서 이름이 등장한 횟수 (in/out 각각 1회)
    function subAppearances(subs, name) {
        let n = 0;
        (subs || []).forEach(s => {
            if (s && s.in === name) n++;
            if (s && s.out === name) n++;
        });
        return n;
    }

    // 한 쿼터의 참여 크레딧 (1 / 0.5 / 0)
    function quarterCredit(lineup, subs, name) {
        const onBoard = Object.values(lineup || {}).includes(name);
        const subs_ = subAppearances(subs, name);
        if (!onBoard && subs_ === 0) return 0;
        return Math.max(0, 1 - 0.5 * subs_);
    }

    // 한 쿼터에 관여한 모든 이름 (보드 + 교체)
    function quarterNames(quarter) {
        const names = new Set(Object.values((quarter && quarter.lineup) || {}).filter(Boolean));
        ((quarter && quarter.subs) || []).forEach(s => {
            if (s && s.in) names.add(s.in);
            if (s && s.out) names.add(s.out);
        });
        return names;
    }

    /**
     * 선수별 참여 집계
     * @param {Object} quarters  { '1Q': { lineup:{pos:name}, subs:[{in,out}] }, ... }
     * @param {string[]} [keys]  집계할 쿼터 키 (기본: quarters 의 키를 번호순 정렬)
     * @returns {Object} { name: { credit, played, subCount, byQuarter: { q: credit } } }
     */
    function computeParticipation(quarters, keys) {
        const qs = keys || Object.keys(quarters || {}).sort((a, b) => parseInt(a) - parseInt(b));
        const result = {};
        qs.forEach(q => {
            const qd = (quarters && quarters[q]) || {};
            quarterNames(qd).forEach(name => {
                const c = quarterCredit(qd.lineup, qd.subs, name);
                const r = result[name] || (result[name] = { credit: 0, played: 0, subCount: 0, gkQuarters: 0, byQuarter: {} });
                r.credit += c;
                r.byQuarter[q] = c;
                if (c > 0) r.played += 1;
                if ((qd.lineup || {}).GK === name) r.gkQuarters += 1;
                r.subCount += subAppearances(qd.subs, name);
            });
        });
        return result;
    }

    /**
     * 목표/균형 지표
     * @param {Object} opts { quarters, attendees, quarterCount, onFieldSize, availability }
     *   availability: { name: ['1Q','2Q','3Q'] } — 일부 쿼터만 참석하는 선수 (없으면 전 쿼터)
     *   개인 목표 = 총 슬롯 × (본인 가능 쿼터 ÷ 전원 가능 쿼터 합). 전원 전 쿼터면 slots/N 과 같다.
     * @returns {Object} {
     *   quarterKeys, attendees, slots, target, personalTarget:{name:t}, availableCount:{name:n},
     *   perQuarter:{q:n}, actualSlots, participation, avg, min, max, spread,
     *   under:[], over:[], unplayed:[], gkExempt:[], balanced
     * }
     *   전담 GK(뛴 쿼터가 모두 GK 자리이고 가능한 쿼터를 전부 뛴 선수)는 status 'gk' 로 두고
     *   초과/범위/균형 판정에서 제외한다 (GK 는 보통 전 쿼터를 뛰므로 경고 대상이 아님).
     */
    function computeTargets(opts) {
        const quarters = (opts && opts.quarters) || {};
        const quarterCount = (opts && opts.quarterCount) || Math.max(DEFAULT_QUARTER_COUNT, Object.keys(quarters).length);
        const onFieldSize = (opts && opts.onFieldSize) || DEFAULT_ON_FIELD;
        const keys = quarterKeys(quarterCount);
        const participation = computeParticipation(quarters, keys);
        const attendees = Array.from(new Set([...(opts && opts.attendees || []), ...Object.keys(participation)]));

        const perQuarter = {};
        let actualSlots = 0;
        keys.forEach(q => {
            const n = Object.values(((quarters[q] || {}).lineup) || {}).filter(Boolean).length;
            perQuarter[q] = n;
            actualSlots += n;
        });

        const slots = onFieldSize * quarterCount;
        const target = attendees.length ? slots / attendees.length : 0;
        const availability = (opts && opts.availability) || {};
        const availableCount = {};
        attendees.forEach(n => {
            const av = availability[n];
            availableCount[n] = Array.isArray(av) ? av.filter(q => keys.includes(q)).length : quarterCount;
        });
        const availSum = attendees.reduce((s, n) => s + availableCount[n], 0);
        const personalTarget = {};
        attendees.forEach(n => { personalTarget[n] = availSum ? slots * availableCount[n] / availSum : 0; });
        const isFullTimeGK = n => {
            const p = participation[n];
            return !!p && p.played > 0 && p.gkQuarters === p.played && p.played >= availableCount[n];
        };
        const gkExempt = attendees.filter(isFullTimeGK);
        const credits = attendees.map(n => (participation[n] ? participation[n].credit : 0));
        const played = credits.filter(c => c > 0);
        const avg = played.length ? played.reduce((a, b) => a + b, 0) / played.length : 0;
        const rangeCredits = attendees.filter(n => !isFullTimeGK(n)).map(n => (participation[n] ? participation[n].credit : 0));
        const min = rangeCredits.length ? Math.min(...rangeCredits) : 0;
        const max = rangeCredits.length ? Math.max(...rangeCredits) : 0;

        const status = {};
        const under = [], over = [], unplayed = [];
        attendees.forEach(n => {
            const c = participation[n] ? participation[n].credit : 0;
            if (isFullTimeGK(n)) { status[n] = 'gk'; return; }
            const s = participationStatus(c, personalTarget[n]);
            status[n] = s;
            if (c === 0) unplayed.push(n);
            else if (s === 'under') under.push(n);
            else if (s === 'over') over.push(n);
        });

        return {
            quarterKeys: keys, quarterCount, onFieldSize,
            attendees: attendees.length, slots, actualSlots, target, personalTarget, availableCount, perQuarter,
            participation, status, avg, min, max, spread: max - min,
            under, over, unplayed, gkExempt,
            balanced: (max - min) < 2,
        };
    }

    // 목표 대비 상태: 1쿼터 이상 부족 → under, 1쿼터 이상 초과 → over, 그 외 ok
    function participationStatus(credit, target) {
        const diff = credit - target;
        if (diff <= -1) return 'under';
        if (diff >= 1) return 'over';
        return 'ok';
    }

    // 표시용 숫자 (3 → "3", 3.5 → "3.5", 3.142857 → "3.14")
    function fmt(n, digits = 2) {
        if (!Number.isFinite(n)) return '0';
        if (Number.isInteger(n)) return String(n);
        const s = n.toFixed(digits);
        return s.replace(/\.?0+$/, '');
    }

    return {
        DEFAULT_QUARTER_COUNT, DEFAULT_ON_FIELD, QUARTER_OPTIONS, ON_FIELD_OPTIONS,
        quarterKeys, quarterCredit, subAppearances, quarterNames,
        computeParticipation, computeTargets, participationStatus, fmt,
    };
});
