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

  // ✏️ 편집 권한은 "공유 편집 암호"로 관리합니다.
  //    - 암호는 코드가 아니라 데이터베이스에 해시로 저장됩니다.
  //    - 앱 우측 상단 "편집 잠금 해제"에서 최초 1회 암호를 설정하고,
  //      팀원에게 그 암호를 공유하면 됩니다. (암호를 아는 사람만 편집 가능)
};
