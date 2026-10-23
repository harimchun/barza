#!/usr/bin/env python3
"""
FC 바르자 스프레드시트 → 앱 데이터 이관 스크립트

사용법:
  python3 tools/import_sheet.py <export.xlsx> [--out data/import] [--upload] [--backup]

  <export.xlsx> : 구글 시트를 "파일 > 다운로드 > Microsoft Excel(.xlsx)"로 받은 파일
                  (또는 https://docs.google.com/spreadsheets/d/<ID>/export?format=xlsx)
  --out         : 결과 JSON을 쓸 폴더 (roster.json, matches.json, venues.json, report.md)
  --upload      : 결과를 Firebase Realtime Database에 업로드 (전체 덮어쓰기, --id-token 필요)
  --id-token    : 편집자 구글 계정의 Firebase ID 토큰 (앱 콘솔: await firebase.auth().currentUser.getIdToken())
  --backup      : 업로드 전 현재 DB 내용을 <out>/backup-<timestamp>.json 으로 저장

읽는 것:
  - 경기 시트 31개: 쿼터별 보드 격자(C~G / J~N 열) → 라인업, In/Out 열 → 교체 쌍,
    P~Z열 → 선호 포지션·참여·골·어시스트
  - 대시보드 시트: 주차 블록의 쿼터별 득점/실점, 선수별 누적(참여횟수·총 쿼터·골·어시) → 검증용
  - 팀등록 정보 / New 등번호 시트: 멤버 본명·등번호

주의: 구글 시트 xlsx 내보내기는 XML이 일부 깨져 있어 openpyxl이 실패하므로 정규식으로 직접 파싱한다.
"""
import argparse
import datetime as dt
import html
import json
import os
import re
import sys
import tempfile
import zipfile
from collections import defaultdict

try:
    from scipy.optimize import linear_sum_assignment
    import numpy as np
except ImportError:  # pragma: no cover
    linear_sum_assignment = None

# ── 앱 포메이션 좌표 (js/tab1_match.js PITCH_POS_COORDS 와 동일하게 유지) ──────
PITCH_POS_COORDS = {
    '4-2-3-1': {
        'ST': (50, 13), 'LW': (18, 28), 'CAM': (50, 33), 'RW': (82, 28),
        'LDM': (35, 50), 'RDM': (65, 50),
        'LB': (12, 70), 'LCB': (37, 73), 'RCB': (63, 73), 'RB': (88, 70), 'GK': (50, 90),
    },
    '4-3-3': {
        'LW': (20, 15), 'ST': (50, 13), 'RW': (80, 15),
        'LCM': (25, 42), 'CM': (50, 38), 'RCM': (75, 42),
        'LB': (12, 70), 'LCB': (37, 73), 'RCB': (63, 73), 'RB': (88, 70), 'GK': (50, 90),
    },
    '4-4-2': {
        'LW': (35, 15), 'RW': (65, 15),
        'LM': (12, 42), 'LCM': (37, 40), 'RCM': (63, 40), 'RM': (88, 42),
        'LB': (12, 70), 'LCB': (37, 73), 'RCB': (63, 73), 'RB': (88, 70), 'GK': (50, 90),
    },
    '3-5-2': {
        'LW': (35, 15), 'ST': (50, 13), 'RW': (65, 15),
        'MF0': (25, 42), 'MF1': (50, 38), 'MF2': (75, 42),
        'LB': (12, 70), 'LCB': (37, 73), 'RCB': (63, 73), 'RB': (88, 70), 'GK': (50, 90),
    },
}

# 시트 격자 → 피치 % 좌표. 열 오프셋 0..4 (C..G), 행 오프셋 0..11 (타이틀 다음 행부터)
def grid_to_pct(col_off, row_off):
    return (12 + 19 * col_off, 13 + 7 * row_off)

# 시트에 쓰인 포지션 표기 → 앱 코드 정규화 (알 수 없는 표기는 대문자로 그대로 둠)
POSITION_ALIASES = {
    '중미': 'CM', '센백': 'CB', '센터백': 'CB', '풀백': 'FB', '윙': 'W', '윙백': 'WB',
    '공미': 'CAM', '수미': 'DM', '골키퍼': 'GK', '공격수': 'ST', '스트라이커': 'ST',
}

EXCEL_EPOCH = dt.date(1899, 12, 30)


# ═══════════════════════════════════════════════════════════════════════════
# xlsx 파싱 (정규식 기반 — 깨진 XML 허용)
# ═══════════════════════════════════════════════════════════════════════════
CELL_RE = re.compile(r'<c r="([A-Z]+)(\d+)"([^>]*?)(?:/>|>(.*?)</c>)', re.S)


def col2num(col):
    n = 0
    for ch in col:
        n = n * 26 + ord(ch) - 64
    return n


def num2col(n):
    s = ''
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def clean_str(s):
    s = html.unescape(s)
    s = re.sub(r'_x[0-9A-Fa-f]{4}_', '', s)  # 제어문자 이스케이프 제거
    return s


class Workbook:
    def __init__(self, xlsx_path):
        self.tmp = tempfile.mkdtemp(prefix='barza-xlsx-')
        with zipfile.ZipFile(xlsx_path) as z:
            z.extractall(self.tmp)
        ss = self._read('xl/sharedStrings.xml')
        self.shared = [clean_str(''.join(re.findall(r'<t[^>]*>(.*?)</t>', si, re.S)))
                       for si in re.findall(r'<si>(.*?)</si>', ss, re.S)]
        wb = self._read('xl/workbook.xml')
        rels = self._read('xl/_rels/workbook.xml.rels')
        rid2file = {m.group(1): m.group(2) for m in re.finditer(r'Id="([^"]*)"[^>]*Target="([^"]*)"', rels)}
        self.sheets = []  # (name, path)
        for m in re.finditer(r'<sheet [^>]*name="([^"]*)"[^>]*r:id="([^"]*)"', wb):
            self.sheets.append((clean_str(m.group(1)), rid2file[m.group(2)]))
        self._cache = {}

    def _read(self, rel):
        with open(os.path.join(self.tmp, rel), encoding='utf-8', errors='replace') as f:
            return f.read()

    def cells(self, sheet_name, with_formulas=False):
        """{(col, row): value} — 빈 문자열 제외. with_formulas면 {(col,row): formula} 도 반환"""
        key = (sheet_name, with_formulas)
        if key in self._cache:
            return self._cache[key]
        path = dict(self.sheets)[sheet_name]
        xml = self._read('xl/' + path)
        vals, forms = {}, {}
        for col, row, attrs, inner in CELL_RE.findall(xml):
            inner = inner or ''
            t = re.search(r't="([^"]+)"', attrs)
            t = t.group(1) if t else ''
            v = re.search(r'<v>(.*?)</v>', inner, re.S)
            is_ = re.search(r'<is>.*?<t[^>]*>(.*?)</t>', inner, re.S)
            val = None
            if v:
                val = v.group(1)
                if t == 's':
                    val = self.shared[int(val)]
                elif t == 'b':
                    val = bool(int(val))
                elif t in ('str', 'inlineStr', 'e'):
                    val = clean_str(val)
                else:
                    try:
                        val = float(val)
                    except ValueError:
                        val = clean_str(val)
            elif is_:
                val = clean_str(is_.group(1))
            if isinstance(val, str):
                val = val.strip()
                if val == '':
                    val = None
            if val is not None:
                vals[(col, int(row))] = val
            if with_formulas:
                f = re.search(r'<f[^>]*>(.*?)</f>', inner, re.S)
                if f:
                    forms[(col, int(row))] = html.unescape(f.group(1))
        result = (vals, forms) if with_formulas else vals
        self._cache[key] = result
        return result


# ═══════════════════════════════════════════════════════════════════════════
# 이름 정규화 / 별칭
# ═══════════════════════════════════════════════════════════════════════════
def norm_name(s):
    if s is None:
        return None
    s = str(s).strip().replace(' ', '')
    s = re.sub(r'\(.*?\)', '', s)  # "(용병)" 같은 괄호 제거
    return s or None


class NameResolver:
    """
    시트에 등장하는 이름 표기를 하나의 키로 묶는다.
      - 멤버: 두 글자 이름 (주열, 재훈 ...)
      - 용병: 시트 '용병' 섹션의 표기 (대부분 세 글자 본명)
      - 별칭: 보드/In-Out 칸에 다른 표기로 쓰인 경우 (재혁 → 장재혁, 정민 → 변정민)
    """

    def __init__(self):
        self.members = set()
        self.guests = set()
        self.aliases = {}          # 표기 → 정식 키
        self.unresolved = set()
        self.resolutions = []      # 로그용 (표기, 키, 근거)

    def known(self, name):
        return name in self.members or name in self.guests

    def resolve(self, raw, context=''):
        name = norm_name(raw)
        if not name:
            return None
        if self.known(name):
            return name
        if name in self.aliases:
            return self.aliases[name]

        cands = []
        if len(name) == 2:
            # 두 글자 → 같은 글자로 끝나는 용병 본명이 하나뿐이면 그 사람
            cands = [g for g in self.guests if g.endswith(name) and len(g) >= 3]
        elif len(name) >= 3:
            # 세 글자 이상 → 뒤 두 글자가 멤버 이름이고, 같은 본명의 용병이 없으면 멤버
            short = name[-2:]
            if short in self.members:
                cands = [short]
        if len(cands) == 1:
            self.aliases[name] = cands[0]
            self.resolutions.append((name, cands[0], context))
            return cands[0]
        self.unresolved.add(name)
        return name


# ═══════════════════════════════════════════════════════════════════════════
# 경기 시트 파싱
# ═══════════════════════════════════════════════════════════════════════════
TITLE_RE = re.compile(
    r'^(?P<venue>.+?)\s*vs\.?\s*(?P<opp>.+?)\s*\n\(?\s*(?P<y>\d{4})\.(?P<m>\d{1,2})\.(?P<d>\d{1,2})\s*/\s*(?P<time>[^)]*)\)?\s*$',
    re.S)
SHEETNAME_DATE_RE = re.compile(r'(\d{4})\.(\d{1,2})\.(\d{1,2})')


def parse_title(a1, sheet_name):
    info = {'venue': None, 'opponent': None, 'date': None, 'timeSlot': None, 'notes': ''}
    m = TITLE_RE.match(a1 or '')
    if m:
        info['venue'] = m.group('venue').replace(' ', '')
        opp = m.group('opp').strip()
        tag = re.search(r'\((.*?)\)\s*$', opp)
        if tag:
            info['notes'] = tag.group(1).strip()
            opp = opp[:tag.start()].strip()
        info['opponent'] = opp
        info['date'] = f"{int(m.group('y')):04d}-{int(m.group('m')):02d}-{int(m.group('d')):02d}"
        info['timeSlot'] = m.group('time').strip()
    if not info['date']:
        d = SHEETNAME_DATE_RE.search(sheet_name)
        if d:
            info['date'] = f"{int(d.group(1)):04d}-{int(d.group(2)):02d}-{int(d.group(3)):02d}"
    if not info['venue']:
        info['venue'] = sheet_name.split('(')[0].replace(' ', '')
    return info


def is_name_cell(v):
    return isinstance(v, str) and 1 < len(v) <= 6 and not re.fullmatch(r'[1-5]Q(\.SUBS)?|In|Out', v)


def parse_match_sheet(wb, sheet_name, resolver, warn):
    cells = wb.cells(sheet_name)
    info = parse_title(cells.get(('A', 1)), sheet_name)

    # ── 쿼터 보드 위치: 'nQ' 라벨이 C열 또는 J열에 있음 ──
    boards = []  # (quarter, title_row, name_cols, inout_cols)
    for (col, row), v in cells.items():
        if isinstance(v, str) and re.fullmatch(r'[1-5]Q', v) and col in ('C', 'J') and row <= 40:
            if col == 'C':
                boards.append((v, row, ['C', 'D', 'E', 'F', 'G'], ('A', 'B')))
            else:
                boards.append((v, row, ['J', 'K', 'L', 'M', 'N'], ('H', 'I')))
    boards.sort(key=lambda b: int(b[0][0]))
    quarters = {}
    for q, trow, ncols, (in_col, out_col) in boards:
        players = []  # (name, col_off, row_off)
        for r in range(trow + 1, trow + 13):
            for ci, c in enumerate(ncols):
                v = cells.get((c, r))
                if is_name_cell(v):
                    name = resolver.resolve(v, f'{sheet_name} {q} 보드')
                    players.append((name, ci, r - (trow + 1)))
        subs = []
        for r in range(trow + 3, trow + 13):
            vin, vout = cells.get((in_col, r)), cells.get((out_col, r))
            if is_name_cell(vin) or is_name_cell(vout):
                subs.append({
                    'in': resolver.resolve(vin, f'{sheet_name} {q} In') if is_name_cell(vin) else None,
                    'out': resolver.resolve(vout, f'{sheet_name} {q} Out') if is_name_cell(vout) else None,
                })
        # 보드 밖(아래)에 적힌 이름 경고
        quarters[q] = {'players': players, 'subs': subs}

    # ── 오른쪽 명단: P=포지션, Q=이름, R=참여, 골/어시 열은 헤더로 탐색 ──
    header = {v: col for (col, row), v in cells.items() if row == 1 and isinstance(v, str)}
    goal_col, assist_col = header.get('골'), header.get('어시스트')
    roster_rows = []
    guest_section = False
    r = 2
    while r < 80:
        qv = cells.get(('Q', r))
        if qv == '참여인원':
            break
        if qv == '용병':
            guest_section = True
            r += 1
            continue
        if is_name_cell(qv):
            name = norm_name(qv)
            roster_rows.append({
                'name': name,
                'positions': cells.get(('P', r)),
                'attended': cells.get(('R', r)) == 'O',
                'goals': float(cells.get((goal_col, r)) or 0) if goal_col else 0,
                'assists': float(cells.get((assist_col, r)) or 0) if assist_col else 0,
                'guest': guest_section,
            })
        r += 1
    return info, quarters, roster_rows


# ═══════════════════════════════════════════════════════════════════════════
# 포메이션 추정 (격자 좌표 ↔ 앱 포메이션 슬롯 최소비용 매칭)
# ═══════════════════════════════════════════════════════════════════════════
def assign_positions(players):
    """players: [(name, col_off, row_off)] → (formation, lineup{pos:name}, coords{pos:{left,top}}, cost)"""
    pts = [grid_to_pct(c, r) for _, c, r in players]
    if not pts:
        return '4-2-3-1', {}, {}, 0.0
    best = None
    for ftype, slots in PITCH_POS_COORDS.items():
        labels = list(slots.keys())
        cost = np.zeros((len(pts), len(labels)))
        for i, (x, y) in enumerate(pts):
            for j, lab in enumerate(labels):
                sx, sy = slots[lab]
                # 세로(라인) 차이를 가로보다 무겁게 — 같은 라인 안에서는 좌우만 맞추면 됨
                cost[i, j] = ((x - sx) / 19.0) ** 2 + ((y - sy) / 7.0) ** 2 * 1.5
        if len(pts) > len(labels):
            # 12명 이상은 앱 포메이션으로 표현 불가 → 초과 인원은 일반 라벨
            rows, cols = linear_sum_assignment(cost[:len(labels)])
            extra = list(range(len(labels), len(pts)))
        else:
            rows, cols = linear_sum_assignment(cost)
            extra = []
        total = cost[rows, cols].sum()
        if best is None or total < best[0]:
            best = (total, ftype, list(zip(rows, cols)), extra, labels)
    total, ftype, pairs, extra, labels = best
    lineup, coords = {}, {}
    for i, j in pairs:
        name, c, r = players[i]
        lineup[labels[j]] = name
        left, top = grid_to_pct(c, r)
        coords[labels[j]] = {'left': left, 'top': top}
    for k, i in enumerate(extra):
        name, c, r = players[i]
        lab = f'X{k + 1}'
        lineup[lab] = name
        left, top = grid_to_pct(c, r)
        coords[lab] = {'left': left, 'top': top}
    return ftype, lineup, coords, float(total)


# ═══════════════════════════════════════════════════════════════════════════
# 대시보드 파싱 (스코어 + 검증용 누적치)
# ═══════════════════════════════════════════════════════════════════════════
def parse_dashboard(wb, sheet_name):
    vals, forms = wb.cells(sheet_name, with_formulas=True)
    # 블록 → 참조 시트: 5~45행 수식에서 '시트명'! 추출
    col_sheet = {}
    for (col, row), f in forms.items():
        if 5 <= row <= 45:
            m = re.search(r"'([^']+)'!", f)
            if m and col not in col_sheet:
                col_sheet[col] = clean_str(m.group(1))
    # 블록 시작열(참/불참 헤더) 목록. 참조 수식은 쿼터(+1)/골(+2)/어시(+3) 열에 있음
    start_sheet = {}
    for col, sname in col_sheet.items():
        n = col2num(col)
        for off in (1, 2, 3):
            if vals.get((num2col(n - off), 4)) == '참/불참':
                start_sheet[n - off] = sname
                break
    starts = sorted(col2num(c) for (c, r), v in vals.items() if r == 4 and v == '참/불참')
    blocks = {}  # 시트명(없으면 'dashboard:<date>') → block info
    for start in starts:
        s = num2col(start)
        serial0 = vals.get((s, 1))
        date0 = (EXCEL_EPOCH + dt.timedelta(days=int(serial0))).isoformat() if isinstance(serial0, (int, float)) else None
        sname = start_sheet.get(start) or f'dashboard:{date0}'
        us_col, them_col = num2col(start + 2), num2col(start + 3)
        serial = vals.get((s, 1))
        date = (EXCEL_EPOCH + dt.timedelta(days=int(serial))).isoformat() if isinstance(serial, (int, float)) else None
        scores = {}
        for i, q in enumerate(['1Q', '2Q', '3Q', '4Q']):
            u, t = vals.get((us_col, 51 + i)), vals.get((them_col, 51 + i))
            scores[q] = [int(u or 0), int(t or 0)]
        blocks[sname] = {
            'date': date,
            'venue': vals.get((s, 2)),
            'opponent': vals.get((s, 3)),
            'scores': scores,
            'total': [vals.get((us_col, 47)), vals.get((them_col, 47))],
            'result': vals.get((us_col, 48)),
            'quarters': {},
            'goals': {},
            'assists': {},
        }
        # 선수별 쿼터 수 / 골 / 어시 (검증용 + 시트 없는 경기 복원용)
        for r in range(5, 46):
            name = vals.get(('A', r))
            if isinstance(name, str):
                n = norm_name(name)
                blocks[sname]['quarters'][n] = float(vals.get((num2col(start + 1), r)) or 0)
                g, a = vals.get((us_col, r)), vals.get((them_col, r))
                if g: blocks[sname]['goals'][n] = int(g)
                if a: blocks[sname]['assists'][n] = int(a)
    totals = {}
    for r in range(5, 46):
        name = vals.get(('A', r))
        if isinstance(name, str):
            totals[norm_name(name)] = {
                'matches': float(vals.get(('B', r)) or 0),
                'quarters': float(vals.get(('C', r)) or 0),
                'goals': float(vals.get(('D', r)) or 0),
                'assists': float(vals.get(('E', r)) or 0),
            }
    return blocks, totals


# ═══════════════════════════════════════════════════════════════════════════
# 멤버 본명 / 등번호
# ═══════════════════════════════════════════════════════════════════════════
def parse_fullnames(wb):
    full = {}  # short → fullName
    jersey = {}  # fullName → number
    names = dict(wb.sheets)
    if '팀등록 정보' in names:
        for (col, row), v in wb.cells('팀등록 정보').items():
            if col == 'B' and isinstance(v, str):
                full[norm_name(v)[-2:]] = norm_name(v)
    if 'New 등번호' in names:
        c = wb.cells('New 등번호')
        for r in range(3, 60):
            num = c.get(('B', r))
            cur, need_change, new = c.get(('C', r)), c.get(('D', r)), c.get(('F', r))
            if not isinstance(num, (int, float)):
                continue
            for cand in (new, cur if need_change != 'O' else None):
                if isinstance(cand, str) and cand != '-':
                    fn = norm_name(cand)
                    jersey.setdefault(fn, int(num))
                    full.setdefault(fn[-2:], fn)
    return full, jersey


def normalize_positions(raw):
    if not isinstance(raw, str):
        return []
    out = []
    for tok in re.split(r'[,/\s]+', raw.strip()):
        if not tok:
            continue
        tok = POSITION_ALIASES.get(tok, tok.upper())
        if tok not in out:
            out.append(tok)
    return out


# ═══════════════════════════════════════════════════════════════════════════
# 메인
# ═══════════════════════════════════════════════════════════════════════════
def participation(quarter):
    """시트 규칙: 보드에 있으면 1, In/Out에 등장할 때마다 0.5 차감"""
    credit = defaultdict(float)
    on_board = set(quarter['lineup'].values())
    sub_names = []
    for s in quarter['subs']:
        for k in ('in', 'out'):
            if s[k]:
                sub_names.append(s[k])
    for n in on_board | set(sub_names):
        credit[n] = 1.0
    for n in sub_names:
        credit[n] -= 0.5
    return {n: max(0.0, c) for n, c in credit.items()}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('xlsx')
    ap.add_argument('--out', default='data/import')
    ap.add_argument('--upload', action='store_true')
    ap.add_argument('--backup', action='store_true')
    ap.add_argument('--db-url', default=None)
    ap.add_argument('--api-key', default=None)
    ap.add_argument('--id-token', default=None,
                    help='편집자 구글 계정의 Firebase ID 토큰 (앱 콘솔에서 await firebase.auth().currentUser.getIdToken())')
    args = ap.parse_args()

    if linear_sum_assignment is None:
        sys.exit('scipy/numpy 가 필요합니다: pip install scipy numpy')

    warn_log = []
    def warn(msg):
        warn_log.append(msg)
        print('⚠️ ', msg)

    wb = Workbook(args.xlsx)
    match_sheets = [n for n, _ in wb.sheets
                    if n not in ('팀등록 정보', '2026_회비', 'New 등번호') and '대시보드' not in n]
    dash_name = next((n for n, _ in wb.sheets if n == '대시보드'), None)
    print(f'경기 시트 {len(match_sheets)}개, 대시보드: {dash_name}')

    # ── 1) 명단 수집 (멤버/용병 섹션) — 최신 시트가 기준 ──
    resolver = NameResolver()
    latest = match_sheets[0]
    sheet_rosters = {}
    for sname in match_sheets:
        cells = wb.cells(sname)
        rows = []
        guest = False
        r = 2
        while r < 80:
            qv = cells.get(('Q', r))
            if qv == '참여인원':
                break
            if qv == '용병':
                guest = True
            elif is_name_cell(qv):
                rows.append((norm_name(qv), guest, cells.get(('P', r))))
            r += 1
        sheet_rosters[sname] = rows
        for name, g, _ in rows:
            (resolver.guests if g else resolver.members).add(name)
    # 멤버/용병 양쪽에 있는 이름은 멤버 우선
    resolver.guests -= resolver.members

    # ── 2) 경기 파싱 ──
    matches = []
    for sname in match_sheets:
        info, quarters, roster_rows = parse_match_sheet(wb, sname, resolver, warn)
        intra = bool(info['opponent'] and '자체전' in info['opponent'])
        qdata = {}
        for q, qd in quarters.items():
            ftype, lineup, coords, cost = assign_positions(qd['players'])
            subs = []
            for s in qd['subs']:
                pos = next((p for p, n in lineup.items() if n == s['out']), None) if s['out'] else None
                subs.append({'in': s['in'], 'out': s['out'], 'pos': pos})
            if len(qd['players']) > 11:
                warn(f'{sname} {q}: 보드에 {len(qd["players"])}명 (11명 초과)')
            qdata[q] = {'formation': ftype, 'lineup': lineup, 'coords': coords, 'subs': subs,
                        '_cost': round(cost, 2), '_n': len(qd['players'])}
        attended = {resolver.resolve(r['name'], sname) for r in roster_rows if r['attended']}
        played = set()
        for qd in qdata.values():
            played |= set(qd['lineup'].values())
            for s in qd['subs']:
                played |= {s['in'], s['out']} - {None}
        attendees = sorted(played) if intra else sorted(attended | played)
        stats = {}
        for r in roster_rows:
            if r['goals'] or r['assists']:
                stats[resolver.resolve(r['name'], sname)] = {'goals': int(r['goals']), 'assists': int(r['assists'])}
        quarter_count = len(qdata)
        matches.append({
            'id': info['date'],
            'date': info['date'],
            'venue': info['venue'],
            'opponent': info['opponent'] or '상대팀',
            'timeSlot': info['timeSlot'],
            'notes': info['notes'],
            'type': 'intra' if intra else 'match',
            'status': 'final',
            'quarterCount': quarter_count,
            'onFieldSize': 11,
            'attendees': attendees,
            'quarters': qdata,
            'scores': {q: [0, 0] for q in qdata},
            'scoresKnown': False,
            'stats': stats,
            'events': [],
            'source': {'kind': 'sheet', 'sheet': sname},
            '_sheet': sname,
        })

    # 같은 날짜 여러 경기(자체전 두 팀) → id 접미사
    by_date = defaultdict(list)
    for m in matches:
        by_date[m['date']].append(m)
    for date, ms in by_date.items():
        if len(ms) > 1:
            for i, m in enumerate(sorted(ms, key=lambda x: x['_sheet'])):
                m['id'] = f'{date}-{chr(97 + i)}'
                tag = m['_sheet'].rsplit('_', 1)[-1] if '_' in m['_sheet'] else chr(65 + i)
                m['opponent'] = f"{m['opponent']} ({tag})"
    for m in matches:
        m['title'] = f"{m['venue']} vs {m['opponent']}"

    # ── 3) 대시보드 스코어 + 검증치 ──
    dash_blocks, dash_totals = ({}, {})
    if dash_name:
        dash_blocks, dash_totals = parse_dashboard(wb, dash_name)
        for m in matches:
            b = dash_blocks.get(m['_sheet'])
            if not b:
                if m['type'] != 'intra':
                    warn(f"{m['_sheet']}: 대시보드에 스코어 블록 없음")
                continue
            if b['date'] and b['date'] != m['date']:
                warn(f"{m['_sheet']}: 대시보드 날짜 {b['date']} ≠ 시트 날짜 {m['date']}")
            m['scores'] = {q: b['scores'].get(q, [0, 0]) for q in m['quarters']}
            m['scoresKnown'] = True
            if b['opponent'] and not m['opponent']:
                m['opponent'] = b['opponent']
            tot_u = sum(v[0] for v in m['scores'].values())
            tot_t = sum(v[1] for v in m['scores'].values())
            if b['total'][0] is not None and (int(b['total'][0]) != tot_u or int(b['total'][1]) != tot_t):
                warn(f"{m['_sheet']}: 쿼터 합 {tot_u}:{tot_t} ≠ 대시보드 총점 {b['total']}")
            goals_sum = sum(s['goals'] for s in m['stats'].values())
            if goals_sum != tot_u:
                warn(f"{m['_sheet']}: 선수 골 합 {goals_sum} ≠ 팀 득점 {tot_u}")

    # 대시보드에만 있는 경기(포메이션 시트 없음): 스코어·골·어시만 복원
    for key, b in dash_blocks.items():
        if not key.startswith('dashboard:') or not b['date']:
            continue
        has_scores = any(v[0] or v[1] for v in b['scores'].values())
        if not (has_scores or b['goals'] or b['assists'] or b['result'] not in (None, '경기전')):
            continue
        stats = {}
        for n, g in b['goals'].items():
            stats.setdefault(resolver.resolve(n, '대시보드'), {'goals': 0, 'assists': 0})['goals'] += g
        for n, a in b['assists'].items():
            stats.setdefault(resolver.resolve(n, '대시보드'), {'goals': 0, 'assists': 0})['assists'] += a
        attendees = sorted(set(stats) | {resolver.resolve(n, '대시보드') for n, q in b['quarters'].items() if q > 0})
        matches.append({
            'id': b['date'], 'date': b['date'], 'venue': (b['venue'] or '').replace(' ', ''),
            'opponent': b['opponent'] or '상대팀', 'timeSlot': None,
            'notes': '포메이션 기록 없음 (대시보드 스코어만 이관)',
            'type': 'match', 'status': 'final', 'quarterCount': 4, 'onFieldSize': 11,
            'attendees': attendees, 'quarters': {}, 'scores': b['scores'],
            'scoresKnown': has_scores or b['result'] not in (None, '경기전'),
            'stats': stats, 'events': [], 'source': {'kind': 'dashboard'}, '_sheet': key,
        })
        warn(f"{b['date']} {b['opponent']}: 포메이션 시트 없음 → 대시보드 스코어/골/어시만 이관")
    for m in matches:
        m['title'] = f"{m['venue']} vs {m['opponent']}"

    # ── 4) 로스터 구성 ──
    full, jersey = parse_fullnames(wb)
    latest_rows = sheet_rosters[latest]
    latest_members = {n for n, g, _ in latest_rows if not g}
    positions = {}
    for sname in match_sheets:  # 최신 시트 우선
        for n, g, p in sheet_rosters[sname]:
            key = resolver.resolve(n, sname)
            if key not in positions and p:
                positions[key] = normalize_positions(p)
    roster = {}
    for n in sorted(resolver.members | resolver.guests):
        is_member = n in resolver.members
        fn = full.get(n) if is_member else (n if len(n) >= 3 else None)
        roster[n] = {
            'name': n,
            'fullName': fn,
            'role': 'member' if is_member else 'guest',
            'positions': positions.get(n, []),
            'jerseyNo': jersey.get(fn) if fn else None,
            'aliases': sorted(a for a, k in resolver.aliases.items() if k == n),
            'active': (n in latest_members) if is_member else True,
        }
    # 보드에만 등장하고 명단에 없는 이름 → 용병으로 추가
    for n in sorted(resolver.unresolved):
        if n not in roster:
            roster[n] = {'name': n, 'fullName': n if len(n) >= 3 else None, 'role': 'guest',
                         'positions': [], 'jerseyNo': None, 'aliases': [], 'active': True}
            warn(f'명단에 없는 이름을 용병으로 추가: {n}')

    # ── 5) 검증: 대시보드 선수 누적치와 비교 ──
    report = ['# 시트 이관 리포트', '', f'- 경기 {len(matches)}건, 선수 {len(roster)}명', '']
    # 대시보드는 선수별 쿼터 칸이 수식이 아니라 값이라 어느 시점 이후 갱신되지 않을 수 있다.
    # → 선수별 쿼터가 하나라도 입력된 블록(경기)만 대조 대상으로 삼는다.
    # (정민/해근 행만 수식이라 그 두 명만 값이 있는 블록은 미갱신으로 본다 → 출전 선수 5명 이상인 블록만)
    covered = {k for k, b in dash_blocks.items()
               if sum(1 for v in b['quarters'].values() if v > 0) >= 5 or k.startswith('dashboard:')}
    uncovered = sorted(m['date'] for m in matches if m['type'] != 'intra' and m['_sheet'] not in covered)
    agg = defaultdict(lambda: {'matches': 0, 'quarters': 0.0, 'goals': 0, 'assists': 0})
    for m in matches:
        if m['type'] == 'intra':
            continue
        # 골/어시는 전체 경기, 참여횟수/쿼터는 대시보드에 값이 있는 경기만 합산
        for n, s in m['stats'].items():
            agg[n]['goals'] += s['goals']
            agg[n]['assists'] += s['assists']
        if m['_sheet'] not in covered:
            continue
        credits = defaultdict(float)
        for q in m['quarters'].values():
            for n, c in participation(q).items():
                credits[n] += c
        for n, c in credits.items():
            if c > 0:
                agg[n]['matches'] += 1
                agg[n]['quarters'] += c
    report += ['## 대시보드 대조 (선수별 참여횟수 / 총 쿼터 / 골 / 어시)', '',
               '골/어시는 전체 경기 합계, 참여횟수/총 쿼터는 대시보드에 선수별 쿼터가 입력된 경기만 합산. '
               + (f'쿼터 미입력 경기 {len(uncovered)}건: {", ".join(uncovered)}' if uncovered else ''), '',
               '| 이름 | 대시보드 | 이관 결과 | 상태 |', '|---|---|---|---|']
    mismatches = 0
    for dn, dv in dash_totals.items():
        key = resolver.resolve(dn, '대시보드')
        av = agg.get(key, {'matches': 0, 'quarters': 0.0, 'goals': 0, 'assists': 0})
        d = (dv['matches'], dv['quarters'], dv['goals'], dv['assists'])
        a = (av['matches'], av['quarters'], av['goals'], av['assists'])
        ok = all(abs(x - y) < 1e-6 for x, y in zip(d, a))
        if not ok:
            mismatches += 1
        report.append(f"| {dn}{'' if key == dn else ' → ' + key} | {d[0]:.0f} / {d[1]:g} / {d[2]:.0f} / {d[3]:.0f} "
                      f"| {a[0]} / {a[1]:g} / {a[2]} / {a[3]} | {'✅' if ok else '❌'} |")
    report += ['', f'불일치 {mismatches}명 (별칭 보정·시트 수식 범위 차이로 생기는 차이는 아래 경고 참고)', '']
    if resolver.resolutions:
        report += ['## 별칭 해석', '']
        for a, k, ctx in sorted(set(resolver.resolutions)):
            report.append(f'- {a} → {k}  ({ctx})')
        report.append('')
    if resolver.unresolved:
        report += ['## 명단에 없던 이름 (용병으로 추가됨)', '', ', '.join(sorted(resolver.unresolved)), '']
    report += ['## 쿼터별 포메이션 추정', '', '| 경기 | 쿼터 | 인원 | 포메이션 | 매칭비용 | 교체 |', '|---|---|---|---|---|---|']
    for m in matches:
        for q, qd in m['quarters'].items():
            subs = ', '.join(f"{s['in'] or '?'}→{s['out'] or '?'}" for s in qd['subs']) or '-'
            flag = ' ⚠️' if qd['_cost'] > 12 or qd['_n'] < 10 else ''
            report.append(f"| {m['date']} {m['opponent']} | {q} | {qd['_n']} | {qd['formation']} | {qd['_cost']}{flag} | {subs} |")
    report += ['', '## 경고', ''] + [f'- {w}' for w in warn_log]

    # ── 6) 출력 ──
    os.makedirs(args.out, exist_ok=True)
    venues = sorted({m['venue'] for m in matches if m['venue']})
    now = dt.datetime.now(dt.timezone.utc).isoformat(timespec='seconds')
    for m in matches:
        m.pop('_sheet', None)
        for qd in m['quarters'].values():
            qd.pop('_cost', None)
            qd.pop('_n', None)
        m['updatedAt'] = now
    matches_obj = {m['id']: m for m in sorted(matches, key=lambda x: x['id'])}
    with open(os.path.join(args.out, 'roster.json'), 'w', encoding='utf-8') as f:
        json.dump(roster, f, ensure_ascii=False, indent=2)
    with open(os.path.join(args.out, 'matches.json'), 'w', encoding='utf-8') as f:
        json.dump(matches_obj, f, ensure_ascii=False, indent=2)
    with open(os.path.join(args.out, 'venues.json'), 'w', encoding='utf-8') as f:
        json.dump(venues, f, ensure_ascii=False, indent=2)
    with open(os.path.join(args.out, 'report.md'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(report) + '\n')
    print(f"\n✅ 경기 {len(matches)}건 · 선수 {len(roster)}명 · 경기장 {len(venues)}곳 → {args.out}/")
    print(f"   대시보드 대조 불일치 {mismatches}명, 경고 {len(warn_log)}건 — {args.out}/report.md 참고")

    if args.upload:
        upload(args, roster, matches_obj, venues)


# ═══════════════════════════════════════════════════════════════════════════
# Firebase 업로드 (익명 인증 → REST PUT)
# ═══════════════════════════════════════════════════════════════════════════
def load_config_js():
    """js/config.js 에서 DB URL 과 apiKey 를 읽는다 (간단 정규식)"""
    here = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(here, '..', 'js', 'config.js')
    src = open(path, encoding='utf-8').read()
    url = re.search(r"FIREBASE_DB_URL:\s*'([^']+)'", src)
    key = re.search(r'apiKey:\s*"([^"]+)"', src)
    return (url.group(1) if url else None), (key.group(1) if key else None)


def upload(args, roster, matches, venues):
    import urllib.request
    db_url, api_key = load_config_js()
    db_url = (args.db_url or db_url or '').rstrip('/')
    api_key = args.api_key or api_key
    if not db_url or not api_key:
        sys.exit('DB URL / API key 를 찾을 수 없습니다 (--db-url, --api-key)')

    def req(url, method='GET', body=None):
        data = json.dumps(body).encode() if body is not None else None
        r = urllib.request.Request(url, data=data, method=method, headers={'Content-Type': 'application/json'})
        with urllib.request.urlopen(r) as resp:
            return json.loads(resp.read() or b'null')

    # DB 쓰기 규칙이 편집자(구글 계정)만 허용하므로, 앱에서 로그인한 편집자의 ID 토큰이 필요하다.
    #   앱을 연 브라우저 콘솔에서:  await firebase.auth().currentUser.getIdToken()
    token = args.id_token or os.environ.get('BARZA_ID_TOKEN')
    if not token:
        sys.exit('--id-token 이 필요합니다. 앱에 편집자 계정으로 로그인한 뒤 브라우저 콘솔에서 '
                 'await firebase.auth().currentUser.getIdToken() 값을 복사해 넘기세요.')

    if args.backup:
        snap = req(f'{db_url}/.json')
        bpath = os.path.join(args.out, f"backup-{dt.datetime.now().strftime('%Y%m%d-%H%M%S')}.json")
        with open(bpath, 'w', encoding='utf-8') as f:
            json.dump(snap, f, ensure_ascii=False, indent=2)
        print(f'🗄  DB 백업 저장: {bpath}')

    req(f'{db_url}/roster.json?auth={token}', 'PUT', roster)
    req(f'{db_url}/matches.json?auth={token}', 'PUT', matches)
    req(f'{db_url}/settings/venues.json?auth={token}', 'PUT', venues)
    req(f'{db_url}/settings/schemaVersion.json?auth={token}', 'PUT', 2)
    print('🚀 업로드 완료: /roster, /matches, /settings/venues, /settings/schemaVersion=2')


if __name__ == '__main__':
    main()
