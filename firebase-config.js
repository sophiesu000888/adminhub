// ================================================================
// Firebase 設定檔
// ================================================================
// 設定步驟：
// 1. 前往 https://console.firebase.google.com 建立專案
// 2. 新增 Web 應用程式，複製 firebaseConfig 貼入下方
// 3. 開啟 Authentication → Sign-in method → Email/Password
// 4. Authentication → Users 新增兩個帳號：
//    - s802316s@gmail.com（設定密碼）
//    - sophiesu000@gmail.com（設定密碼）
//    並在使用者的「編輯」中設定 Display Name：Shu / Su
// 5. 建立 Firestore Database（Production mode）
// 6. Firestore → Rules 貼上以下規則後發布：
//    rules_version = '2';
//    service cloud.firestore {
//      match /databases/{database}/documents {
//        match /{document=**} {
//          allow read, write: if request.auth != null;
//        }
//      }
//    }
// ================================================================

const FIREBASE_CONFIG = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// 使用者對應表（顯示名稱 → 信箱）
// 密碼由 Firebase Authentication 管理，不存在程式碼中
const USERS = {
  'Shu': 's802316s@gmail.com',
  'Su': 'sophiesu000@gmail.com'
};
