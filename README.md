# ⚽ FC 바르자 팀 매니저 — 설정 가이드

> 저장소: **Firebase Realtime Database** (팀 전체 공유 · 보기는 로그인 불필요, 편집은 구글 로그인)

---

## 한 번만 하는 초기 설정 (약 3분)

### 1단계: Firebase 프로젝트 만들기

1. [Firebase 콘솔](https://console.firebase.google.com/) 접속 (Google 계정 로그인)
2. **"프로젝트 추가"** 클릭 → 이름: `FC Barza` → 만들기

### 2단계: Realtime Database 생성

1. 왼쪽 메뉴 → **"빌드"** → **"Realtime Database"**
2. **"데이터베이스 만들기"**
3. 위치: 본인 가까운 곳 선택 (기본값 OK)
4. 보안 규칙 → **"테스트 모드에서 시작"** 선택 → **"사용 설정"**

### 3단계: 보안 규칙 (읽기 공개 · 쓰기는 편집자 구글 계정만)

Database 탭 → **"규칙"** 탭 → 아래 내용으로 교체 후 **"게시"**:

```json
{
  "rules": {
    ".read": true,
    ".write": "auth != null && auth.token.email != null && root.child('settings/editors').child(auth.token.email.toLowerCase().replace('.', ',')).exists()",
    "settings": {
      "editors": {
        "$key": {
          ".write": "auth != null && auth.token.email != null && !root.child('settings/editors').exists() && $key == auth.token.email.toLowerCase().replace('.', ',')"
        }
      },
      "editorRequests": {
        "$uid": {
          ".write": "auth != null && auth.uid == $uid"
        }
      }
    }
  }
}
```

> 누구나 **볼** 수 있지만, **쓰기**는 `/settings/editors` 에 등록된 구글 계정만 가능합니다.
> 편집자 목록이 비어 있을 때는 처음 로그인한 계정이 스스로를 등록할 수 있고(부트스트랩),
> 로그인한 누구나 자기 uid 로 권한 요청(`/settings/editorRequests`)을 남길 수 있습니다.

### 3.5단계: Google 로그인 켜기

**"빌드" → "Authentication" → "Sign-in method"** 탭 → **Google** → **사용 설정** → 프로젝트 지원 이메일 선택 → 저장.
같은 화면의 **설정 → 승인된 도메인**에 배포 도메인(예: `harimchun.github.io`)이 있어야 합니다.

### 4단계: DB URL 복사 → config.js 에 붙여넣기

Database 탭 상단에 표시된 URL (`https://fc-barza-xxxxx-default-rtdb.firebaseio.com`) 을 복사하여  
`js/config.js` 파일을 열고:

```js
FIREBASE_DB_URL: 'https://fc-barza-xxxxx-default-rtdb.firebaseio.com',
```

---

## 데이터 구조 / 스프레드시트 이관

- DB 구조(v2)는 [docs/data-schema.md](docs/data-schema.md) 참고. 경기는 `/matches/{날짜}`, 선수는 `/roster/{이름}` 단위로 저장됩니다.
- 기존 팀 스프레드시트(경기 시트 + 대시보드)를 한 번에 가져오려면:

```bash
# 1) 구글 시트를 xlsx로 내려받기 (파일 > 다운로드 > Microsoft Excel)
# 2) 결과 미리보기 (data/import/ 에 JSON + report.md 생성)
python3 tools/import_sheet.py ~/Downloads/바르자.xlsx --out data/import
# 3) 앱에서 확인: python3 -m http.server 8765 → http://localhost:8765/index.html?local=1
# 4) 문제 없으면 업로드 (기존 DB는 data/import/backup-*.json 으로 백업)
#    쓰기는 편집자 계정만 가능 → 앱에 로그인한 뒤 브라우저 콘솔에서
#    await firebase.auth().currentUser.getIdToken()  값을 복사해 --id-token 으로 전달
python3 tools/import_sheet.py ~/Downloads/바르자.xlsx --out data/import --upload --backup --id-token <토큰>
```

> `scipy`, `numpy` 필요 (`pip install scipy numpy`). `report.md` 에 대시보드 대조 결과·별칭 해석·포메이션 추정 내역이 정리됩니다.

## 쿼터 보장 계산 (js/quota.js)

스프레드시트 수식을 그대로 옮긴 순수 함수 모듈입니다. 경기 정보에서 **쿼터 수(4/5)** 와 **쿼터당 출전 인원**을 고르면
목표 쿼터 = 출전 인원 × 쿼터 수 ÷ 참석자 수 로 계산되고, 교체 In/Out 은 0.5쿼터로 차감됩니다.

```bash
node --test tests/*.test.js   # 쿼터 엔진(시트 2026.10.17 경기 대조) + 자동 초안 엔진 테스트
```

## 자동 초안 (js/autodraft.js)

참석자를 고르고 **✨ 자동 초안 만들기**를 누르면 전 쿼터 라인업이 채워집니다.

- 선수단 관리에 적힌 **선호 포지션**(우선순위 순)과 슬롯의 적합도(1순위 3점 · 같은 계열 2.5 · 같은 라인 1.5 · 인접 라인 0.7, 순위가 뒤로 갈수록 ×0.85)를 헝가리안 매칭으로 최대화
- 쿼터마다 **누적 출전이 적은 선수부터** 투입하고, 직전 쿼터에 쉰 선수를 우선 → 연속 벤치 방지. GK 선호 선수가 있으면 매 쿼터 GK 보장
- 카드의 🔒 를 켜 두면 그 자리는 유지되고, 버튼을 다시 누르면 동점 순서를 바꿔 다른 조합을 제안
- 카드 아래 배지(1순위 / 2순위 계열 / 같은 라인 / 대체)로 배치 근거 표시

## 앱 실행

```bash
python3 -m http.server 8080
```
→ 브라우저에서 `http://localhost:8080` 접속

---

## 팀과 공유하기

### GitHub Pages (추천)

1. 이 폴더를 GitHub 저장소에 업로드
2. Settings → Pages → Source: `main` 브랜치
3. 생성된 URL을 카카오톡 공유

> ✅ **팀원 누구나 별도 로그인 없이** 같은 URL에서 같은 데이터를 바로 **볼** 수 있습니다.

---

## 편집 권한 (구글 로그인)

기록을 **보는 것**은 누구나 가능하지만, **수정·저장**은 편집자로 등록된 구글 계정만 할 수 있습니다.

1. 앱 우측 상단 **"G 구글로 로그인"** → 구글 계정 선택
2. 편집자 목록이 비어 있으면 그 계정이 **첫 편집자**로 자동 등록됩니다
3. 편집자는 **선수단 관리 → 편집 권한** 에서 멤버의 구글 이메일을 추가하거나, 멤버가 보낸 **권한 요청**을 승인합니다
4. 권한이 없는 계정으로 로그인하면 우측 상단 **"편집 권한 요청"** 버튼으로 요청을 남길 수 있습니다

> 📱 **카카오톡 안에서 열면** 구글 로그인 팝업이 막힐 수 있습니다. 앱이 안내 배너를 띄우니 "외부 브라우저로 열기"를 눌러 Chrome/Safari 에서 로그인하세요. 보기만 할 때는 카카오톡 안에서도 됩니다.

## 데이터 구조 / 스프레드시트 이관

- DB 구조(v2)는 [docs/data-schema.md](docs/data-schema.md) 참고. 경기는 `/matches/{날짜}`, 선수는 `/roster/{이름}` 단위로 저장됩니다.
- 기존 팀 스프레드시트(경기 시트 + 대시보드)를 한 번에 가져오려면:

```bash
# 1) 구글 시트를 xlsx로 내려받기 (파일 > 다운로드 > Microsoft Excel)
# 2) 결과 미리보기 (data/import/ 에 JSON + report.md 생성)
python3 tools/import_sheet.py ~/Downloads/바르자.xlsx --out data/import
# 3) 앱에서 확인: python3 -m http.server 8765 → http://localhost:8765/index.html?local=1
# 4) 문제 없으면 업로드 (기존 DB는 data/import/backup-*.json 으로 백업)
#    쓰기는 편집자 계정만 가능 → 앱에 로그인한 뒤 브라우저 콘솔에서
#    await firebase.auth().currentUser.getIdToken()  값을 복사해 --id-token 으로 전달
python3 tools/import_sheet.py ~/Downloads/바르자.xlsx --out data/import --upload --backup --id-token <토큰>
```

> `scipy`, `numpy` 필요 (`pip install scipy numpy`). `report.md` 에 대시보드 대조 결과·별칭 해석·포메이션 추정 내역이 정리됩니다.

## 쿼터 보장 계산 (js/quota.js)

스프레드시트 수식을 그대로 옮긴 순수 함수 모듈입니다. 경기 정보에서 **쿼터 수(4/5)** 와 **쿼터당 출전 인원**을 고르면
목표 쿼터 = 출전 인원 × 쿼터 수 ÷ 참석자 수 로 계산되고, 교체 In/Out 은 0.5쿼터로 차감됩니다.

```bash
node --test tests/*.test.js   # 시트의 실제 경기(2026.10.17)로 X열 값과 대조하는 테스트
```

## 앱 실행

```bash
python3 -m http.server 8080
```
→ 브라우저에서 `http://localhost:8080` 접속

---

## 팀과 공유하기

### GitHub Pages (추천)

1. 이 폴더를 GitHub 저장소에 업로드
2. Settings → Pages → Source: `main` 브랜치
3. 생성된 URL을 카카오톡 공유

> ✅ **팀원 누구나 별도 로그인 없이** 같은 URL에서 같은 데이터를 바로 **볼** 수 있습니다.

---

## 편집 권한 (공유 암호)

기록을 **보는 것**은 누구나 가능하지만, **수정·저장**은 공유 편집 암호로 잠겨 있습니다.

1. 앱 우측 상단 **"🔓 편집 잠금 해제"** 클릭
2. 처음이라면 → 팀에서 함께 쓸 **편집 암호를 설정**합니다 (DB에 안전하게 해시로 저장됨)
3. 이후엔 그 암호를 입력하면 **편집 모드**로 전환됩니다 (기기에 기억되어 다음부터 자동 유지)
4. 편집할 팀원에게 **카카오톡으로 암호를 공유**하면, 그 팀원도 똑같이 편집할 수 있습니다

> 🔑 암호 변경: **선수단 관리 → 편집 설정 → "편집 암호 변경"**. 변경하면 기존 암호로 해제했던 다른 기기는 다시 잠깁니다.
>

---

## 주요 기능

| 탭 | 기능 |
|---|---|
| 📋 당일 경기 운영 | 고정 요약 바(참석·목표·균형), 단계별 흐름(경기 정보 → 참석 → 배치 → 기록 → 저장), 참석 검색·최근 참석순, 쿼터 수·출전 인원 설정, **자동 초안**(선호 포지션 + 쿼터 균형, 🔒 잠금, 재생성), 피치 카드 탭 → 선수 선택 시트(적합도·참여/목표 표시, 자리 바꾸기), 벤치 선수 탭 → 자리 탭 배치, 드래그 위치 조정, 교체(In/Out), 쿼터 요약 스트립, 실시간 골/스코어 기록, 임시/확정 저장 |
| 📈 시즌 스탯 | 시즌(연도) 필터·자체전/임시 포함 옵션, 승/무/패·득실·경기 평균 쿼터, 최근 전적 스트립(누르면 기록으로), 득점/도움/공격P/출전 리더보드, 쿼터별 득실, 정렬 가능한 전체 선수 표, **선수별 상세**(참석/출전/총·평균 쿼터/골/도움/교체, 실제 뛴 포지션 분포, 경기별 기록), CSV 다운로드 |
| 📚 기록 조회 & 수정 | 경기 목록, 포메이션 이미지(4·5쿼터), 교체 내역, 명단·쿼터, 수정, 삭제 |
| 👥 선수단 관리 | 멤버/용병 등록, 본명·선호 포지션·등번호·별칭 편집, 활동 여부 |
