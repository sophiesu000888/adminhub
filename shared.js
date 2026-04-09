// ================================================================
// shared.js — 共用模組：Firebase 初始化、驗證、狀態列、同步
// ================================================================

const _TEST_KEY = 'adminhub_test_user';

// 本機測試模式：密碼輸入 ok 時使用 localStorage，不需要 Firebase
function _testUser() {
  try { return JSON.parse(localStorage.getItem(_TEST_KEY)); } catch(e) { return null; }
}

// Email 對應暱稱
function _getNickname(emailOrName) {
  const map = {
    's802316s@gmail.com': 'shu',
    'sophiesu000@gmail.com': 'su'
  };
  return map[emailOrName] || emailOrName;
}

let _db = null;
let _auth = null;

function initFirebase() {
  if (!firebase.apps.length) {
    firebase.initializeApp(FIREBASE_CONFIG);
  }
  if (!_auth) _auth = firebase.auth();
  if (!_db)   _db   = firebase.firestore();
  return { auth: _auth, db: _db };
}

// ── 驗證：未登入則跳回首頁 ─────────────────────────────────────
function requireAuth(onReady) {
  // 本機測試模式直接通過
  const tu = _testUser();
  if (tu) { onReady(tu); return; }

  const { auth } = initFirebase();
  auth.onAuthStateChanged((user) => {
    if (!user) {
      window.location.href = 'index.html';
    } else {
      onReady(user);
    }
  });
}

// ── 頂部狀態列 ────────────────────────────────────────────────
function injectStatusBar(moduleName) {
  const css = `
    #status-bar {
      position: fixed; top: 0; left: 0; right: 0;
      height: 44px; background: #fff;
      border-bottom: 1px solid #e8e8e8;
      display: flex; align-items: center;
      justify-content: space-between;
      padding: 0 18px; font-size: 13px; color: #555;
      z-index: 9999; box-shadow: 0 1px 4px rgba(0,0,0,.07);
      font-family: -apple-system, 'PingFang TC', sans-serif;
    }
    #status-bar .s-left { display:flex; align-items:center; gap:16px; }
    #status-bar .s-back {
      text-decoration: none; color: #333; font-weight: 600;
      font-size: 14px; padding: 4px 10px;
      border: 1.5px solid #ccc; border-radius: 6px;
      transition: background .15s;
    }
    #status-bar .s-back:hover { background: #f0f0f0; }
    #status-bar .s-last { color: #888; font-size: 12px; }
    #status-bar .s-right { font-size: 12px; color: #999; }
    #status-bar .s-saved  { color: #4caf50; }
    #status-bar .s-saving { color: #ff9800; }
    #status-bar .s-sync   { color: #2196f3; }
    #status-bar .s-err    { color: #f44336; }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const bar = document.createElement('div');
  bar.id = 'status-bar';
  bar.innerHTML = `
    <div class="s-left">
      <a href="index.html" class="s-back">← 回主頁</a>
      <span id="sb-last" class="s-last">最後儲存：—</span>
    </div>
    <span id="sb-sync" class="s-right s-sync">⟳ 連線中</span>
  `;
  document.body.prepend(bar);
}

// ── 更新狀態列文字 ─────────────────────────────────────────────
function setSyncStatus(text, type) {
  const el = document.getElementById('sb-sync');
  if (!el) return;
  el.textContent = text;
  el.className = `s-right s-${type}`;
}

function setLastSaved(displayName, isMe, timestamp) {
  const el = document.getElementById('sb-last');
  if (!el) return;
  const who = isMe ? '你' : _getNickname(displayName);
  const time = timestamp ? _fmtTime(timestamp.toDate ? timestamp.toDate() : new Date(timestamp)) : '剛剛';
  el.textContent = `最後儲存：${who}　${time}`;
}

function _fmtTime(date) {
  const diff = Date.now() - date.getTime();
  if (diff < 60000)    return '剛剛';
  if (diff < 3600000)  return `${Math.floor(diff / 60000)} 分鐘前`;
  return date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
}

// ── 自動儲存（含 debounce）─────────────────────────────────────
function makeAutoSave(moduleName, getDataFn, debounceMs = 1800) {
  let timer = null;

  // 本機測試模式：存到 localStorage
  if (_testUser()) {
    return function triggerSave() {
      setSyncStatus('儲存中…', 'saving');
      clearTimeout(timer);
      timer = setTimeout(() => {
        localStorage.setItem('adminhub_data_' + moduleName, JSON.stringify(getDataFn()));
        const tu = _testUser();
        const el = document.getElementById('sb-last');
        if (el) el.textContent = `最後儲存：${tu ? _getNickname(tu.email || tu.displayName) : '你'}（本機）`;
        setSyncStatus('✓ 已儲存', 'saved');
      }, debounceMs);
    };
  }

  const { db, auth } = initFirebase();

  return function triggerSave() {
    setSyncStatus('儲存中…', 'saving');
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const user = auth.currentUser;
      if (!user) return;
      const payload = {
        content: getDataFn(),
        lastSaved: {
          uid: user.uid,
          displayName: user.email,
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        }
      };
      try {
        await db.collection('modules').doc(moduleName).set(payload);
        setSyncStatus('✓ 已儲存', 'saved');
      } catch (e) {
        console.error(e);
        setSyncStatus('✗ 儲存失敗', 'err');
      }
    }, debounceMs);
  };
}

// ── 即時同步監聽 ───────────────────────────────────────────────
function startSync(moduleName, currentUser, onRemoteUpdate) {
  // 本機測試模式：從 localStorage 讀取，無跨裝置同步
  if (_testUser()) {
    const stored = localStorage.getItem('adminhub_data_' + moduleName);
    if (stored) {
      try { onRemoteUpdate(JSON.parse(stored)); } catch(e) {}
    }
    setSyncStatus('✓ 本機模式', 'saved');
    return () => {};
  }

  const { db } = initFirebase();

  return db.collection('modules').doc(moduleName).onSnapshot((snap) => {
    if (!snap.exists) {
      setSyncStatus('✓ 已儲存', 'saved');
      return;
    }
    const data = snap.data();
    if (data.lastSaved) {
      const isMe = data.lastSaved.uid === currentUser.uid;
      setLastSaved(data.lastSaved.displayName, isMe, data.lastSaved.timestamp);
    }
    setSyncStatus('✓ 已儲存', 'saved');
    onRemoteUpdate(data.content || null);
  }, (err) => {
    console.error(err);
    setSyncStatus('⟳ 同步失敗', 'err');
  });
}
