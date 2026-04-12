// ================================================================
// shared.js — 共用模組：Firebase 初始化、驗證、狀態列、同步
// ================================================================

const _TEST_KEY = 'adminhub_test_user';

// 本機測試模式：密碼輸入 ok 時使用 localStorage，不需要 Firebase
function _testUser() {
  try { return JSON.parse(localStorage.getItem(_TEST_KEY)); } catch(e) { return null; }
}

// 用 email 反查 USERS 對照表取得顯示名稱，不依賴 Firebase displayName 設定
function _getDisplayName(user) {
  if (!user) return '—';
  // 本機測試模式直接用 displayName
  if (user.displayName) return user.displayName;
  // 正式登入：從 firebase-config.js 的 USERS 反查
  if (typeof USERS !== 'undefined') {
    const match = Object.entries(USERS).find(([, email]) => email === user.email);
    if (match) return match[0];
  }
  return user.email;
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
      recordActivity(user, 'login', _getModuleFromPath());
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
      font-family: 'Kalam', 'Noto Sans TC', sans-serif;
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
    #status-bar .s-right { display:flex; align-items:center; gap:10px; }
    #status-bar .s-sync { font-size: 12px; color: #999; }
    #status-bar .s-online { display:flex; align-items:center; gap:3px; }
    .s-dot { width:22px; height:22px; border-radius:50%; color:#fff; font-size:9px; font-weight:700; display:flex; align-items:center; justify-content:center; border:1.5px solid rgba(255,255,255,0.8); box-shadow:0 0 0 1.5px rgba(0,0,0,0.15); cursor:default; flex-shrink:0; }
    #status-bar .s-saved  { color: #4caf50; }
    #status-bar .s-saving { color: #ff9800; }
    #status-bar .s-sync   { color: #2196f3; }
    #status-bar .s-err    { color: #f44336; }
    #status-bar .s-logout {
      font-size: 13px; color: #666; font-weight: 600;
      padding: 4px 10px; border: 1.5px solid #ccc; border-radius: 6px;
      background: none; cursor: pointer; transition: background .15s, color .15s;
      font-family: 'Kalam', 'Noto Sans TC', sans-serif;
    }
    #status-bar .s-logout:hover { background: #fee; color: #c0392b; border-color: #c0392b; }
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
    <div class="s-right">
      <span id="sb-online" class="s-online"></span>
      <span id="sb-sync" class="s-sync">⟳ 連線中</span>
      <button class="s-logout" onclick="_statusBarLogout()">登出</button>
    </div>
  `;
  document.body.prepend(bar);
}

function _statusBarLogout() {
  const tu = _testUser();
  if (tu) {
    localStorage.removeItem(_TEST_KEY);
    window.location.href = 'index.html';
    return;
  }
  const { auth } = initFirebase();
  auth.signOut().then(() => { window.location.href = 'index.html'; });
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
  const who = isMe ? '你' : displayName;
  const time = timestamp ? _fmtTime(timestamp.toDate ? timestamp.toDate() : new Date(timestamp)) : '剛剛';
  el.textContent = `最後儲存：${who}　${time}`;
}

function _fmtTime(date) {
  const diff = Date.now() - date.getTime();
  if (diff < 60000)    return '剛剛';
  if (diff < 3600000)  return `${Math.floor(diff / 60000)} 分鐘前`;
  return date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
}

// ── 活動紀錄 ──────────────────────────────────────────────────
async function recordActivity(user, type, module) {
  if (_testUser()) return; // 本機測試模式不記錄
  try {
    const { db } = initFirebase();
    const ref = db.collection('user_activity').doc(user.uid);
    const snap = await ref.get();
    const existing = snap.exists ? (snap.data().events || []) : [];
    const newEvent = { type, module: module || '—', ts: new Date().toISOString() };
    const events = [newEvent, ...existing].slice(0, 10);
    await ref.set({ displayName: _getDisplayName(user), email: user.email, events });
  } catch(e) { console.warn('recordActivity failed', e); }
}

function _getModuleFromPath() {
  return window.location.pathname.split('/').pop().replace('.html','') || 'index';
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
        if (el) el.textContent = `最後儲存：${tu ? tu.displayName : '你'}（本機）`;
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
          displayName: _getDisplayName(user),
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        }
      };
      try {
        await db.collection('modules').doc(moduleName).set(payload);
        setSyncStatus('✓ 已儲存', 'saved');
        recordActivity(user, 'save', moduleName);
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
    try { onRemoteUpdate(stored ? JSON.parse(stored) : null); } catch(e) { onRemoteUpdate(null); }
    setSyncStatus('✓ 本機模式', 'saved');
    return () => {};
  }

  const { db } = initFirebase();

  return db.collection('modules').doc(moduleName).onSnapshot((snap) => {
    if (!snap.exists) {
      setSyncStatus('✓ 已儲存', 'saved');
      onRemoteUpdate(null);
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

// ── 在線狀態 ──────────────────────────────────────────────────────
function _emailToColor(email) {
  let hash = 0;
  for (let i = 0; i < email.length; i++) hash = email.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360}, 55%, 44%)`;
}

// onlineEmails: Set of email strings currently online
function _updateOnlineDisplay(onlineEmails) {
  const el = document.getElementById('sb-online');
  if (!el) return;

  // Always show all known users (from firebase-config.js USERS)
  let allUsers = [];
  if (typeof USERS !== 'undefined') {
    allUsers = Object.entries(USERS).map(([name, email]) => ({ name, email }));
  }
  if (!allUsers.length) return;

  el.innerHTML = allUsers.map(({ name, email }) => {
    const isOnline = onlineEmails instanceof Set && onlineEmails.has(email);
    const color    = isOnline ? _emailToColor(email) : '#c8c8c8';
    const txtColor = isOnline ? '#fff' : '#999';
    const initials = name.replace(/\s+/g, '').slice(0, 2);
    return `<span class="s-dot" style="background:${color};color:${txtColor}" title="${name}${isOnline?' · 在線':''}" data-user="${name}" data-email="${email}">${initials}</span>`;
  }).join('');
}

function initPresence(user) {
  if (_testUser()) {
    _updateOnlineDisplay(new Set([user.email || '']));
    return;
  }
  const { db } = initFirebase();
  const presenceRef = db.collection('presence').doc(user.uid);
  const writePresence = () => presenceRef.set({
    displayName: user.displayName || user.email || '使用者',
    email: user.email || '',
    uid: user.uid,
    ts: firebase.firestore.FieldValue.serverTimestamp()
  });
  writePresence();
  const heartbeat = setInterval(writePresence, 30000);
  window.addEventListener('beforeunload', () => {
    clearInterval(heartbeat);
    presenceRef.delete();
  });
  db.collection('presence').onSnapshot(snap => {
    const now = Date.now();
    const onlineEmails = new Set();
    snap.forEach(doc => {
      const d = doc.data();
      const ts = d.ts ? d.ts.toMillis() : 0;
      if (now - ts < 90000 && d.email) onlineEmails.add(d.email);
    });
    _updateOnlineDisplay(onlineEmails);
  });
}
