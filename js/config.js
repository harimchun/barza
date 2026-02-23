// =============================================
// FC 바르자 팀 매니저 - 설정 파일
// =============================================
const CONFIG = {
  // Firebase Realtime Database URL
  FIREBASE_DB_URL: 'https://fc-barja-default-rtdb.asia-southeast1.firebasedatabase.app/',

  // Firebase 프로젝트 설정 (Google 로그인용)
  FIREBASE_CONFIG: {
    apiKey: "AIzaSyAhYi96-WeWO12h0O9WqBzrP6_kZl8ss8s",
    authDomain: "fc-barja.firebaseapp.com",
    databaseURL: "https://fc-barja-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "fc-barja",
    storageBucket: "fc-barja.firebasestorage.app",
    messagingSenderId: "1059135679350",
    appId: "1:1059135679350:web:6e769f19ca482edb9b2857",
  },

  // ✏️ 경기 기록 저장/수정/삭제 권한이 있는 이메일 목록
  // 본인 구글 이메일을 추가하세요.
  ALLOWED_EDITORS: [
    'bgr1663@gmail.com',
  ],
};
