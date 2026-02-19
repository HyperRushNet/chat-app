// assets/startChatAppFn.js | HyperRushNet | 2026 | MIT License
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

export function startChatApp(customConfig = {}) {
  const CONFIG = {
    supabaseUrl: customConfig.supabaseUrl || "https://fahbqdajxnhswevdagdn.supabase.co",
    supabaseKey: customConfig.supabaseKey || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhaGJxZGFqeG5oc3dldmRhZ2RuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NTEyODEsImV4cCI6MjA4NjEyNzI4MX0.UPgPxyaWBULjH4jL8UaSr6bJXTsFWWJRIYodHmXeVTI",
    mailApi: customConfig.mailApi || "https://vercel-serverless-gray-sigma.vercel.app/api/mailAPI",
    maxUsers: customConfig.maxUsers || 475,
    maxMessages: customConfig.maxMessages || 15,
    historyLoadLimit: customConfig.historyLoadLimit || 10,
    rateLimitMs: customConfig.rateLimitMs || 1000,
    presenceHeartbeatMs: customConfig.presenceHeartbeatMs || 10000,
    reconnectDebounceMs: customConfig.reconnectDebounceMs || 3000,
    verificationCodeExpiry: customConfig.verificationCodeExpiry || 600,
  };

  lucide.createIcons();

  const state = {
    user: null,
    currentRoomId: null,
    chatChannel: null,
    presenceChannel: null,
    allRooms: [],
    vTimer: null,
    lastRenderedDateLabel: null,
    lastKnownOnlineCount: null,
    heartbeatInterval: null,
    uptimeInterval: null,
    sessionStartTime: null,
    isPresenceSubscribed: false,
    lastReconnectAttempt: 0,
    roomGuestStatus: {},
    pending: null,
    lastCreated: null,
    lastCreatedPass: null,
    isMasterTab: false,
    tabId: sessionStorage.getItem('hrn_tab_id') || (sessionStorage.setItem('hrn_tab_id', crypto.randomUUID()), sessionStorage.getItem('hrn_tab_id')),
    processingAction: false,
    serverFull: false,
    isLoadingHistory: false,
    oldestMessageTimestamp: null,
    hasMoreHistory: true,
    lastMessageTime: 0,
    isConnecting: false,
    isChatChannelReady: false,
    currentRoomAccessType: null,
    currentRoomData: null,
    selectedAllowedUsers: [], 
    currentPickerContext: null, // 'c' or 'edit-room'
  };

  const FLAG_LOGOUT = 'hrn_flag_force_logout';
  const FLAG_GUEST_NAME = 'hrn_flag_guest_name';
  const FLAG_GUEST_ID = 'hrn_flag_guest_id';

  let toastQueue = [];
  let toastVisible = false;

  const tabChannel = new BroadcastChannel('hrn_tab_sync');

  const db = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 10 } }
  });

  const esc = t => {
    const p = document.createElement('p');
    p.textContent = t;
    return p.innerHTML;
  };

  const $ = id => document.getElementById(id);

  const updateOnlineDisplay = (count) => {
    if (typeof count === 'number') state.lastKnownOnlineCount = count;
    const displayCount = (typeof count === 'number') ? count : '--';
    document.querySelectorAll('.live-count').forEach(el => {
      if (el.innerText !== displayCount.toString()) el.innerText = displayCount;
    });
    const hubCount = $('hub-online-count');
    if (hubCount && hubCount.innerText !== displayCount.toString()) hubCount.innerText = displayCount;
  };

  const updateUptime = () => {
    if (!state.sessionStartTime) return;
    const diff = Math.floor((Date.now() - state.sessionStartTime) / 1000);
    const mins = Math.floor(diff / 60).toString().padStart(2, '0');
    const secs = (diff % 60).toString().padStart(2, '0');
    const el = $('hub-uptime');
    if (el) el.innerText = `${mins}:${secs}`;
  };

  const processToastQueue = () => {
    if (toastVisible || toastQueue.length === 0) return;
    toastVisible = true;
    const msg = toastQueue.shift();
    const c = $('toast-container');
    const t = document.createElement('div');
    t.className = 'toast-item';
    t.innerText = msg;
    t.onclick = () => {
      t.style.opacity = '0';
      setTimeout(() => {
        t.remove();
        toastVisible = false;
        processToastQueue();
      }, 400);
    };
    c.appendChild(t);
    setTimeout(() => {
      if (t.parentNode) {
        t.style.opacity = '0';
        setTimeout(() => {
          if (t.parentNode) t.remove();
          toastVisible = false;
          processToastQueue();
        }, 400);
      }
    }, 3000);
  };

  window.toast = m => {
    toastQueue.push(m);
    processToastQueue();
  };

  window.setLoading = (s, text = null) => {
    const loader = $('loader-overlay');
    const loaderText = $('loader-text');
    if (s) loader.classList.add('active');
    else loader.classList.remove('active');
    if (text) loaderText.innerText = text;
    else loaderText.innerText = "Loading...";
  };

  const safeAwait = async (promise) => {
    try { return [await promise, null]; }
    catch (error) { return [null, error]; }
  };

  const workerCode = `self.onmessage = async (e) => {
    const { type, payload } = e.data;
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    try {
      if (type === 'deriveKey') {
        const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(payload.password), { name: 'PBKDF2' }, false, ['deriveKey']);
        const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: encoder.encode(payload.salt), iterations: 300000, hash: 'SHA-256' }, keyMaterial, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
        self.cryptoKey = key;
        self.postMessage({ type: 'keyDerived', success: true });
      } else if (type === 'encrypt') {
        if (!self.cryptoKey) throw new Error("Key not derived");
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoded = encoder.encode(payload.text);
        const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, self.cryptoKey, encoded);
        const combined = new Uint8Array(iv.length + ciphertext.byteLength);
        combined.set(iv, 0);
        combined.set(new Uint8Array(ciphertext), iv.length);
        const base64 = btoa(String.fromCharCode(...combined));
        self.postMessage({ type: 'encrypted', result: base64 });
      } else if (type === 'decryptHistory') {
        if (!self.cryptoKey) throw new Error("Key not derived");
        const results = [];
        for (const m of payload.messages) {
          try {
            const binary = atob(m.content);
            const bytes = new Uint8Array(binary.length);
            for(let i=0; i<binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const iv = bytes.slice(0, 12);
            const ciphertext = bytes.slice(12);
            const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, self.cryptoKey, ciphertext);
            const text = decoder.decode(decrypted);
            const parts = text.split('|');
            results.push({ id: m.id, time: parts[0], text: parts.slice(1).join('|'), user_id: m.user_id, user_name: m.user_name, created_at: m.created_at });
          } catch (err) {
            results.push({ id: m.id, error: true });
          }
        }
        self.postMessage({ type: 'historyDecrypted', results });
      } else if (type === 'decryptSingle') {
        if (!self.cryptoKey) throw new Error("Key not derived");
        try {
          const binary = atob(payload.content);
          const bytes = new Uint8Array(binary.length);
          for(let i=0; i<binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const iv = bytes.slice(0, 12);
          const ciphertext = bytes.slice(12);
          const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, self.cryptoKey, ciphertext);
          const text = decoder.decode(decrypted);
          const parts = text.split('|');
          self.postMessage({ type: 'singleDecrypted', result: { time: parts[0], text: parts.slice(1).join('|') } });
        } catch(e) {
          self.postMessage({ type: 'singleDecrypted', error: e.message });
        }
      }
    } catch (error) {
      self.postMessage({ type: 'error', message: error.message });
    }
  };`;

  const workerBlob = new Blob([workerCode], { type: 'application/javascript' });
  const cryptoWorker = new Worker(URL.createObjectURL(workerBlob));

  const pendingCallbacks = {};
  cryptoWorker.onmessage = (e) => {
    const { type } = e.data;
    if (pendingCallbacks[type]) {
      pendingCallbacks[type](e.data);
      delete pendingCallbacks[type];
    }
  };

  const generateSalt = () => {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
  };

  const sha256 = async (text) => {
    const buffer = new TextEncoder().encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const deriveKey = (pass, salt) => new Promise((resolve, reject) => {
    pendingCallbacks['keyDerived'] = (data) => {
      if (data.success) resolve(true);
      else reject("Key derivation failed");
    };
    cryptoWorker.postMessage({ type: 'deriveKey', payload: { password: pass, salt: salt } });
  });

  const encryptMessage = (text) => new Promise((resolve, reject) => {
    pendingCallbacks['encrypted'] = (data) => {
      if (data.result) resolve(data.result);
      else reject("Encryption failed");
    };
    const time = new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
    cryptoWorker.postMessage({ type: 'encrypt', payload: { text: time + "|" + text } });
  });

  const cleanupChannels = async () => {
    if (state.presenceChannel) {
      state.presenceChannel.unsubscribe();
      state.presenceChannel = null;
      state.isPresenceSubscribed = false;
    }
    if (state.chatChannel) {
      state.chatChannel.unsubscribe();
      state.chatChannel = null;
    }
  };

  const queryOnlineCountImmediately = async () => {
    if (!state.presenceChannel) return;
    const presState = state.presenceChannel.presenceState();
    const allPresences = Object.values(presState).flat();
    const uniqueUserIds = new Set(allPresences.map(p => p.user_id));
    updateOnlineDisplay(uniqueUserIds.size);
    if (uniqueUserIds.size > CONFIG.maxUsers) {
      if(!state.serverFull) {
        state.serverFull = true;
        $('capacity-overlay').classList.add('active');
        cleanupChannels();
      }
    } else {
      state.serverFull = false;
    }
  };

  const initPresence = async (force = false) => {
    if (!state.isMasterTab || !state.user) return;
    const now = Date.now();
    if (!force && state.isConnecting) return;
    if (!force && (now - state.lastReconnectAttempt < CONFIG.reconnectDebounceMs)) return;
    state.lastReconnectAttempt = now;
    state.isConnecting = true;
    state.isPresenceSubscribed = false;
    if(state.presenceChannel) {
      state.presenceChannel.unsubscribe();
      state.presenceChannel = null;
    }
    updateOnlineDisplay(null);
    const myId = state.user.id;
    state.presenceChannel = db.channel('online-users', {
      config: { presence: { key: myId } }
    });
    state.presenceChannel
      .on('presence', { event: 'sync' }, () => {
        if (!state.presenceChannel) return;
        queryOnlineCountImmediately();
      })
      .subscribe(async (status, err) => {
        if (status === 'SUBSCRIBED') {
          if (!state.presenceChannel) return;
          state.isPresenceSubscribed = true;
          state.isConnecting = false;
          queryOnlineCountImmediately();
          await state.presenceChannel.track({
            user_id: myId,
            online_at: new Date().toISOString()
          });
          queryOnlineCountImmediately();
          if (state.heartbeatInterval) clearInterval(state.heartbeatInterval);
          state.heartbeatInterval = setInterval(async () => {
            if (state.presenceChannel && state.isMasterTab && !state.serverFull) {
              await state.presenceChannel.track({
                user_id: myId,
                online_at: new Date().toISOString()
              });
            }
          }, CONFIG.presenceHeartbeatMs);
          setTimeout(() => {
            if (state.lastKnownOnlineCount === null && state.isPresenceSubscribed && !state.serverFull) {
              queryOnlineCountImmediately();
            }
          }, 2000);
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          state.isPresenceSubscribed = false;
          state.isConnecting = false;
          updateOnlineDisplay(null);
        }
      });
  };

  const monitorConnection = () => {
    setInterval(() => {
      if (!navigator.onLine) {
        $('offline-screen').classList.add('active');
        state.isPresenceSubscribed = false;
        updateOnlineDisplay(null);
        return;
      }
      $('offline-screen').classList.remove('active');
      if (!state.user || !state.isMasterTab) return;
      if (state.currentRoomId) return;
      const wsState = db.realtime.connectionState();
      if ((wsState === 'disconnected' || wsState === 'stopped') && !state.isConnecting) {
        initPresence(true);
      }
    }, 5000);
  };

  window.retryConnection = () => {
    $('capacity-overlay').classList.remove('active');
    state.serverFull = false;
    initPresence(true);
  };

  window.handlePrivateToggle = () => {
    const isPrivate = $('c-private').checked;
    const passInput = $('c-pass');
    passInput.placeholder = isPrivate ? "Passkey (Required)" : "Passkey (Optional)";
  };

  // --- Access Logic ---
  
  window.handleAccessToggle = (prefix, type) => {
    const btnEveryone = $(`${prefix}-access-everyone`);
    const btnSpecific = $(`${prefix}-access-specific`);
    const summaryEl = $(`${prefix}-access-summary`);
    
    if (type === 'everyone') {
      btnEveryone.classList.add('active');
      btnSpecific.classList.remove('active');
      summaryEl.innerHTML = `<span class="c-main">Everyone can join</span><i data-lucide="globe" class="w-16 h-16"></i>`;
      state.selectedAllowedUsers = [];
    } else {
      btnEveryone.classList.remove('active');
      btnSpecific.classList.add('active');
      updateAccessSummary(prefix);
    }
    lucide.createIcons();
  };

  const updateAccessSummary = (prefix) => {
    const summaryEl = $(`${prefix}-access-summary`);
    const count = state.selectedAllowedUsers.length;
    if (count === 0) {
      summaryEl.innerHTML = `<span class="c-danger">No users selected</span><i data-lucide="users" class="w-16 h-16"></i>`;
    } else {
      summaryEl.innerHTML = `<span class="c-accent">${count} user${count > 1 ? 's' : ''} selected</span><i data-lucide="chevron-right" class="w-16 h-16"></i>`;
    }
    lucide.createIcons();
  };

  window.openAccessManager = async (prefix) => {
    state.currentPickerContext = prefix;
    
    if (prefix === 'edit-room' && state.selectedAllowedUsers.length === 0 && state.currentRoomData) {
        const ids = state.currentRoomData.allowed_users;
        if (!ids.includes('*')) {
            const { data: profiles } = await db.from('profiles').select('id, full_name').in('id', ids);
            state.selectedAllowedUsers = ids.map(id => {
                const p = profiles?.find(pro => pro.id === id);
                return { id: id, name: p?.full_name || 'Unknown' };
            });
        }
    }
    
    renderPickerSelectedUsers();
    
    $('overlay-container').classList.add('active');
    window.showOverlayView('access-manager');
    
    $('picker-id-input').value = '';
    $('picker-id-input').focus();
  };

  // FIX: Navigate back to settings instead of closing if coming from settings
  window.closeAccessManager = () => {
    if (state.currentPickerContext === 'edit-room') {
        window.showOverlayView('room-settings');
    } else {
        window.closeOverlay();
    }
    updateAccessSummary(state.currentPickerContext);
  };

  const renderPickerSelectedUsers = () => {
    const container = $('picker-selected-list');
    const displayUsers = state.selectedAllowedUsers;
    
    if (displayUsers.length === 0) {
      container.innerHTML = `<div class="picker-empty">No users added yet.</div>`;
      $('picker-count').innerText = '0';
      return;
    }
    
    $('picker-count').innerText = displayUsers.length;
    
    container.innerHTML = displayUsers.map(u => `
      <div class="picker-user-card">
        <div class="picker-user-info">
            <div class="picker-user-avatar">${u.name.charAt(0)}</div>
            <div class="picker-user-text">
                <span class="picker-user-name">${esc(u.name)} ${u.id === state.user.id ? '<span class="c-mute">(You)</span>' : ''}</span>
                <span class="picker-user-id">${u.id}</span>
            </div>
        </div>
        <button class="picker-remove-btn" onclick="window.removePickerUser('${u.id}')">
            <i data-lucide="x" class="w-16 h-16"></i>
        </button>
      </div>
    `).join('');
    lucide.createIcons();
  };

  window.removePickerUser = (id) => {
    state.selectedAllowedUsers = state.selectedAllowedUsers.filter(u => u.id !== id);
    renderPickerSelectedUsers();
  };

  window.addUserById = async () => {
    const input = $('picker-id-input');
    const id = input.value.trim();
    if (!id) return window.toast("Please enter an ID");

    if (state.selectedAllowedUsers.find(u => u.id === id)) {
        return window.toast("User already added");
    }

    window.setLoading(true, "Fetching user...");
    const { data, error } = await db.from('profiles').select('id, full_name').eq('id', id).single();
    window.setLoading(false);

    if (error || !data) return window.toast("User ID not found");

    state.selectedAllowedUsers.push({ id: data.id, name: data.full_name });
    renderPickerSelectedUsers();
    input.value = '';
    window.toast("User added");
  };

  window.forceClaimMaster = () => {
    if (!state.isMasterTab) {
      state.isMasterTab = true;
      tabChannel.postMessage({ type: 'CLAIM_MASTER', id: state.tabId });
      $('block-overlay').classList.remove('active');
      if (localStorage.getItem(FLAG_LOGOUT) !== 'true' && state.user) {
        initPresence(true);
      }
    }
  };

  window.closeTabAttempt = () => {
    window.open('', '_self');
    window.close();
  };

  tabChannel.onmessage = (ev) => {
    if (ev.data.type === 'CLAIM_MASTER' && ev.data.id !== state.tabId) {
      if (state.isMasterTab) {
        cleanupChannels();
        if (state.heartbeatInterval) clearInterval(state.heartbeatInterval);
        state.heartbeatInterval = null;
        state.isPresenceSubscribed = false;
        state.isMasterTab = false;
        updateOnlineDisplay(null);
        const overlay = $('block-overlay');
        overlay.innerHTML = `
          <i data-lucide="log-out" style="width:48px;height:48px;margin-bottom:24px;color:var(--danger)"></i>
          <h1 class="title">Session Moved</h1>
          <p class="subtitle" style="margin-bottom:48px">You switched to a new tab.</p>
          <button class="btn btn-accent" onclick="window.forceClaimMaster()">Use Here</button>
        `;
        overlay.classList.add('active');
        lucide.createIcons();
      }
    }
    if (ev.data.type === 'PING_MASTER') {
      if (state.isMasterTab) {
        tabChannel.postMessage({ type: 'PONG_MASTER' });
      }
    }
  };

  window.addEventListener('beforeunload', () => {
    tabChannel.postMessage({ type: 'CLAIM_MASTER', id: state.tabId });
  });

  const checkMaster = () => {
    return new Promise((resolve) => {
      let masterFound = false;
      const handler = (ev) => {
        if (ev.data.type === 'PONG_MASTER') masterFound = true;
      };
      tabChannel.addEventListener('message', handler);
      tabChannel.postMessage({ type: 'PING_MASTER' });
      setTimeout(() => {
        tabChannel.removeEventListener('message', handler);
        resolve(masterFound);
      }, 300);
    });
  };

  window.showGuestInfo = () => {
    $('overlay-container').classList.add('active');
    window.showOverlayView('guest-info');
    lucide.createIcons();
  };

  window.openHub = () => {
    $('overlay-container').classList.add('active');
    window.showOverlayView('hub');
    lucide.createIcons();
  };

  window.closeOverlay = () => $('overlay-container').classList.remove('active');

  window.showOverlayView = (viewId) => {
    const panel = document.querySelector('.panel-card');
    if(!panel) return;
    panel.querySelectorAll('.view-content').forEach(v => v.classList.remove('active'));
    const target = $(`view-${viewId}`);
    if(target) {
      target.classList.add('active');
      lucide.createIcons();
    }
  };

  window.prepareMyAccount = () => {
    if(!state.user) return;
    const isGuest = state.user.is_anonymous;
    $('my-acc-name').innerText = state.user.user_metadata?.full_name || "User";
    $('my-acc-id').innerText = state.user.id;
    $('my-acc-email').innerText = isGuest ? "Guest Mode" : (state.user.email || "No email");
    $('my-acc-type').innerText = isGuest ? "Guest Account" : "Full Account";
    $('my-acc-type').style.color = isGuest ? "var(--warning)" : "var(--success)";
    window.showOverlayView('my-account');
  };

  window.inspectUser = async (uid) => {
    if (uid === state.user?.id) return window.prepareMyAccount();
    window.setLoading(true, "Fetching info...");
    const { data, error } = await db.from('profiles').select('id, full_name, updated_at, is_guest').eq('id', uid).single();
    window.setLoading(false);
    if (error || !data) return window.toast("User not found");
    $('qv-user-name').innerText = data.full_name;
    $('qv-user-avatar').innerText = data.full_name.charAt(0).toUpperCase();
    $('qv-user-id').innerText = data.id;
    $('qv-full-name').innerText = data.full_name;
    const statusEl = $('qv-status');
    statusEl.innerText = data.is_guest ? "Guest" : "Registered";
    statusEl.style.color = data.is_guest ? "var(--warning)" : "var(--success)";
    const d = new Date(data.updated_at);
    $('qv-user-date').innerText = d.toLocaleDateString('en-GB');
    window.showOverlayView('quick-view-user');
    $('overlay-container').classList.add('active');
  };

  const prepareGuestScreen = () => {
    const storedName = localStorage.getItem(FLAG_GUEST_NAME);
    const nameInput = $('g-name');
    const lockIcon = document.querySelector('.input-lock-icon');
    if (storedName) {
      nameInput.value = storedName;
      nameInput.disabled = true;
      nameInput.placeholder = "Identity Locked";
      if(lockIcon) lockIcon.style.display = 'block';
    } else {
      nameInput.value = '';
      nameInput.disabled = false;
      nameInput.placeholder = "Enter Name (Permanent)";
      if(lockIcon) lockIcon.style.display = 'none';
    }
    lucide.createIcons();
  };

  window.nav = (id, direction = null) => {
    const current = document.querySelector('.screen.active');
    const next = $(id);
    if(!next) return;
    if(id === 'scr-guest') prepareGuestScreen();
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('slide-left', 'slide-right'));
    if(direction === 'left') {
      current.classList.add('slide-left');
      next.classList.remove('slide-right');
    } else if(direction === 'right') {
      current.classList.add('slide-right');
      next.classList.remove('slide-left');
    } else {
      document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    }
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    next.classList.add('active');
    lucide.createIcons();
    const createBtn = $('icon-plus-lobby');
    if (createBtn) createBtn.style.display = state.user?.is_anonymous && id === 'scr-lobby' ? 'none' : 'flex';
  };

  window.loadRooms = async () => {
    if(!state.user) return;
    window.setLoading(true, "Fetching accessible rooms...");
    const { data: rooms, error } = await db
      .from('rooms')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      window.toast("Failed to load rooms");
      window.setLoading(false);
      return;
    }
    const accessible = [];
    for (const room of rooms || []) {
      const { data: canAccess } = await db.rpc('can_access_room', { p_room_id: room.id });
      if (canAccess) accessible.push(room);
    }
    state.allRooms = accessible;
    window.filterRooms();
    window.setLoading(false);
  };

  window.filterRooms = () => {
    const q = $('search-bar').value.toLowerCase();
    const list = $('room-list');
    const filtered = state.allRooms.filter(r => r.name.toLowerCase().includes(q));
    if (filtered.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <i data-lucide="folder" class="empty-state-icon"></i>
          <div class="empty-state-title">No groups yet</div>
          <div class="empty-state-sub">Create one or get invited.</div>
        </div>
      `;
    } else {
      list.innerHTML = filtered.map(r => `
        <div class="room-card" onclick="window.joinAttempt('${r.id}')">
          <span class="room-name">${esc(r.name)}</span>
          <span class="room-icon">
            <i data-lucide="${r.has_password ? 'lock' : 'chevron-right'}" style="width:18px;height:18px;color:var(--text-mute)"></i>
          </span>
        </div>
      `).join('');
    }
    lucide.createIcons();
  };

  window.joinAttempt = async (id) => {
    if(state.serverFull) return window.toast("Network is full");
    window.setLoading(true, "Checking access...");
    const { data: canAccess } = await db.rpc('can_access_room', { p_room_id: id });
    if (!canAccess) {
      window.setLoading(false);
      return window.toast("Access denied — you are not on the allowed list");
    }
    const { data, error } = await db.from('rooms').select('*').eq('id', id).single();
    window.setLoading(false);
    if (error || !data) return window.toast("Room not found");
    state.pending = { id: data.id, name: data.name, salt: data.salt };
    state.currentRoomData = data;
    if (data.has_password) {
      window.nav('scr-gate');
    } else {
      window.openVault(data.id, data.name, null, data.salt);
    }
  };

  window.joinPrivate = async () => {
    if(state.serverFull) return window.toast("Network is full");
    if(!state.user) return window.toast("Login required");
    const id = $('join-id').value.trim();
    if(!id) return;
    window.setLoading(true, "Checking access...");
    const { data: canAccess } = await db.rpc('can_access_room', { p_room_id: id });
    if (!canAccess) {
      window.setLoading(false);
      return window.toast("Access denied — not allowed");
    }
    const { data } = await db.from('rooms').select('*').eq('id',id).single();
    window.setLoading(false);
    if(data) {
      state.pending = { id: data.id, name: data.name, salt: data.salt };
      state.currentRoomData = data;
      if(data.has_password) {
        window.nav('scr-gate');
      } else {
        window.openVault(data.id, data.name, null, data.salt);
      }
    } else window.toast("Not found");
  };

  const getDateLabel = (d) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = Math.round((today - target) / 86400000);
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    if (diff < 7) return d.toLocaleDateString('en-GB', { weekday: 'long' });
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  };

  const processText = (text) => {
    let t = esc(text);
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    t = t.replace(urlRegex, (url) => {
      const safeUrl = url.replace(/[<>"']/g, '');
      return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="chat-link">${safeUrl}</a>`;
    });
    return t;
  };

  const checkChatEmpty = () => {
    const container = $('chat-messages');
    const emptyState = $('chat-empty-state');
    const hasMessages = container.querySelector('.msg');
    if (emptyState) emptyState.style.display = hasMessages ? 'none' : 'flex';
  };

  const renderMsg = (m, prepend = false) => {
    let html = "";
    const msgDateObj = new Date(m.created_at);
    const currentLabel = getDateLabel(msgDateObj);
    if (!prepend && currentLabel !== state.lastRenderedDateLabel) {
      html += `<div class="date-divider"><span class="date-label">${currentLabel}</span></div>`;
      state.lastRenderedDateLabel = currentLabel;
    } else if (prepend) {
      html += `<div class="date-divider"><span class="date-label">${currentLabel}</span></div>`;
      state.lastRenderedDateLabel = currentLabel;
    }
    const isGuest = state.roomGuestStatus[m.user_id] || false;
    const displayName = isGuest && m.user_name ? m.user_name : m.user_name;
    const guestPill = isGuest ? '<span class="guest-pill">Guest</span>' : '';
    const processedText = processText(m.text);
    html += `
      <div class="msg ${m.user_id===state.user?.id?'me':''}" data-time="${m.created_at}">
        <span class="msg-user" onclick="window.inspectUser('${m.user_id}')">${esc(displayName)} ${guestPill}</span>
        <div>${processedText}</div>
        <span class="msg-time">${esc(m.time)}</span>
      </div>`;
    return html;
  };

  const handleScroll = () => {
    const container = $('chat-messages');
    if (!container) return;
    if (container.scrollTop < 50 && !state.isLoadingHistory && state.hasMoreHistory) {
      loadMoreHistory();
    }
  };

  const fetchGuestStatuses = async (userIds) => {
    if (!userIds || userIds.length === 0) return;
    const uniqueIds = [...new Set(userIds)];
    const { data, error } = await db.from('profiles').select('id, full_name, is_guest').in('id', uniqueIds);
    if (data) {
      data.forEach(p => {
        state.roomGuestStatus[p.id] = p.is_guest;
      });
    }
  };

  const loadMoreHistory = async () => {
    if (!state.oldestMessageTimestamp || !state.currentRoomId) return;
    state.isLoadingHistory = true;
    const container = $('chat-messages');
    const oldScrollHeight = container.scrollHeight;
    container.insertAdjacentHTML('afterbegin', '<div id="history-loader" class="history-loader">Loading...</div>');
    const { data, error } = await db
      .from('messages')
      .select('*')
      .eq('room_id', state.currentRoomId)
      .lt('created_at', state.oldestMessageTimestamp)
      .order('created_at', { ascending: false })
      .limit(CONFIG.historyLoadLimit);
    $('history-loader')?.remove();
    if (error || !data || data.length === 0) {
      state.hasMoreHistory = false;
      state.isLoadingHistory = false;
      return;
    }
    data.reverse();
    pendingCallbacks['historyDecrypted'] = async (res) => {
      const validMsgs = res.results.filter(m => !m.error);
      if (validMsgs.length > 0) {
        state.oldestMessageTimestamp = validMsgs[0].created_at;
        const ids = validMsgs.map(m => m.user_id);
        await fetchGuestStatuses(ids);
        const lastBatchDate = getDateLabel(new Date(validMsgs[validMsgs.length - 1].created_at));
        const firstMsgEl = container.querySelector('.msg');
        let firstExistingDate = null;
        if (firstMsgEl) {
          const firstTime = firstMsgEl.getAttribute('data-time');
          if (firstTime) firstExistingDate = getDateLabel(new Date(firstTime));
        }
        let html = "";
        let tempLabel = null;
        validMsgs.forEach((m, index) => {
          const msgDate = getDateLabel(new Date(m.created_at));
          if (msgDate !== tempLabel) {
            if (index === validMsgs.length - 1 && msgDate === firstExistingDate) {
            } else {
              html += `<div class="date-divider"><span class="date-label">${msgDate}</span></div>`;
            }
            tempLabel = msgDate;
          }
          const isGuest = state.roomGuestStatus[m.user_id] || false;
          const displayName = isGuest && m.user_name ? m.user_name : m.user_name;
          const guestPill = isGuest ? '<span class="guest-pill">Guest</span>' : '';
          const processedText = processText(m.text);
          html += `
            <div class="msg ${m.user_id===state.user?.id?'me':''}" data-time="${m.created_at}">
              <span class="msg-user" onclick="window.inspectUser('${m.user_id}')">${esc(displayName)} ${guestPill}</span>
              <div>${processedText}</div>
              <span class="msg-time">${esc(m.time)}</span>
            </div>`;
        });
        if (lastBatchDate === firstExistingDate) {
          const firstDivider = container.querySelector('.date-divider');
          if (firstDivider) firstDivider.remove();
        }
        container.insertAdjacentHTML('afterbegin', html);
        const newScrollHeight = container.scrollHeight;
        container.scrollTop = newScrollHeight - oldScrollHeight;
      }
      state.isLoadingHistory = false;
    };
    cryptoWorker.postMessage({ type: 'decryptHistory', payload: { messages: data } });
  };

  window.openVault = async (id, n, rawPassword, roomSalt) => {
    if (!state.user) return window.toast("Please login first");
    window.setLoading(true, "Deriving Key...");
    if (state.chatChannel) state.chatChannel.unsubscribe();
    state.currentRoomId = id;
    state.lastRenderedDateLabel = null;
    state.roomGuestStatus = {};
    state.oldestMessageTimestamp = null;
    state.hasMoreHistory = true;
    state.isLoadingHistory = false;
    $('chat-title').innerText = n;
    $('chat-messages').innerHTML = '<div id="chat-empty-state" class="empty-state"><i data-lucide="message-circle" class="empty-state-icon"></i><div class="empty-state-title">No messages yet</div><div class="empty-state-sub">Be the first to say something.</div></div>';
    $('chat-messages').onscroll = handleScroll;
    const copyIcon = $('icon-copy-chat');
    const checkIcon = $('icon-check-chat');
    if (copyIcon) copyIcon.style.display = 'block';
    if (checkIcon) checkIcon.style.display = 'none';
    
    const keySource = rawPassword ? (rawPassword + id) : id;
    try {
      await deriveKey(keySource, roomSalt);
    } catch(e) {
      window.setLoading(false);
      return window.toast("Key derivation failed");
    }
    
    const { data: room } = await db.from('rooms').select('*').eq('id', id).single();
    state.currentRoomData = room;
    
    const isOwner = room && room.created_by === state.user.id;
    const settingsIcon = $('room-settings-icon');
    if (settingsIcon) settingsIcon.style.display = isOwner ? 'block' : 'none';

    window.setLoading(true, "Fetching History...");
    const { data } = await db.from('messages')
      .select('*')
      .eq('room_id', id)
      .order('created_at', { ascending: false })
      .limit(CONFIG.maxMessages);
    const isGuest = state.user.is_anonymous;
    const guestInfoBtn = $('guest-info-chat');
    if (guestInfoBtn) guestInfoBtn.style.display = isGuest ? 'flex' : 'none';
    $('chat-input').style.display = isGuest ? 'none' : 'block';
    $('guest-replies').style.display = isGuest ? 'flex' : 'none';
    $('send-btn').style.display = isGuest ? 'none' : 'flex';
    window.nav('scr-chat');
    
    if (data && data.length > 0) {
      data.reverse();
      if (data.length > 0) state.oldestMessageTimestamp = data[0].created_at;
      window.setLoading(true, "Decrypting...");
      pendingCallbacks['historyDecrypted'] = async (res) => {
        const b = $('chat-messages');
        b.innerHTML = '';
        const ids = res.results.map(m => m.user_id);
        await fetchGuestStatuses(ids);
        res.results.forEach(m => {
          if(!m.error) b.insertAdjacentHTML('beforeend', renderMsg(m));
        });
        b.scrollTop = b.scrollHeight;
        checkChatEmpty();
        window.setLoading(false);
      };
      cryptoWorker.postMessage({ type: 'decryptHistory', payload: { messages: data } });
    } else {
      state.hasMoreHistory = false;
      checkChatEmpty();
      window.setLoading(false);
    }
    
    state.chatChannel = db.channel(`room_chat_${id}`, {
      config: { broadcast: { self: true } }
    });
    state.chatChannel.on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `room_id=eq.${id}`
    }, async (payload) => {
      const m = payload.new;
      if (m && state.currentRoomId) {
        pendingCallbacks['singleDecrypted'] = async (decRes) => {
          if(decRes.result) {
            await fetchGuestStatuses([m.user_id]);
            const msgObj = { ...m, time: decRes.result.time, text: decRes.result.text };
            const b = $('chat-messages');
            b.insertAdjacentHTML('beforeend', renderMsg(msgObj));
            b.scrollTop = b.scrollHeight;
            checkChatEmpty();
          }
        };
        cryptoWorker.postMessage({ type: 'decryptSingle', payload: { content: m.content } });
      }
    }).subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        state.isChatChannelReady = true;
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        state.isChatChannelReady = false;
      }
    });
  };

  const applyRateLimit = () => {
    const now = Date.now();
    if (now - state.lastMessageTime < CONFIG.rateLimitMs) {
      const wait = CONFIG.rateLimitMs - (now - state.lastMessageTime);
      $('chat-input-area').classList.add('rate-limited');
      setTimeout(() => {
        $('chat-input-area').classList.remove('rate-limited');
      }, wait);
      return false;
    }
    return true;
  };

  window.sendMsg = async (e) => {
    if (!e || !e.isTrusted) return;
    if (!state.user || !state.currentRoomId) return;
    if (state.processingAction) return;
    if (!state.isChatChannelReady) {
      window.toast("Connection not ready yet – please wait a moment");
      return;
    }
    if (!applyRateLimit()) return;
    state.processingAction = true;
    const v = $('chat-input').value.trim();
    if(!v) {
      state.processingAction = false;
      return;
    }
    $('chat-input').value = '';
    state.lastMessageTime = Date.now();
    try {
      const enc = await encryptMessage(v);
      await db.from('messages').insert([{
        room_id: state.currentRoomId,
        user_id: state.user.id,
        user_name: state.user.user_metadata?.full_name,
        content: enc
      }]);
    } catch(e) {
      window.toast("Failed to send");
    }
    state.processingAction = false;
  };

  window.sendGuestReply = async (e, message) => {
    if (!e || !e.isTrusted) return;
    if (!state.user || !state.currentRoomId) return;
    if (state.processingAction) return;
    if (!state.isChatChannelReady) {
      window.toast("Connection not ready yet – please wait a moment");
      return;
    }
    if (!applyRateLimit()) return;
    state.processingAction = true;
    state.lastMessageTime = Date.now();
    try {
      const enc = await encryptMessage(message);
      await db.from('messages').insert([{
        room_id: state.currentRoomId,
        user_id: state.user.id,
        user_name: state.user.user_metadata?.full_name,
        content: enc
      }]);
    } catch(err) {}
    state.processingAction = false;
  };

  window.leaveChat = async () => {
    window.setLoading(true, "Leaving Room...");
    if(state.chatChannel) state.chatChannel.unsubscribe();
    state.chatChannel = null;
    state.currentRoomId = null;
    state.roomGuestStatus = {};
    state.currentRoomAccessType = null;
    state.currentRoomData = null;
    
    const settingsIcon = $('room-settings-icon');
    if (settingsIcon) settingsIcon.style.display = 'none';
    
    window.nav('scr-lobby');
    window.loadRooms();
    window.setLoading(false);
  };

  window.handleLogin = async (e) => {
    if (!e || !e.isTrusted) return;
    if(state.processingAction) return;
    state.processingAction = true;
    const em = $('l-email').value, p = $('l-pass').value;
    if(!em || !p) {
      window.toast("Input missing");
      state.processingAction = false;
      return;
    }
    window.setLoading(true, "Signing In...");
    localStorage.removeItem(FLAG_LOGOUT);
    const {error} = await db.auth.signInWithPassword({email:em, password:p});
    if(error) {
      window.toast(error.message);
      window.setLoading(false);
    } else {
      await initPresence(true);
    }
    state.processingAction = false;
  };

  window.handleRegister = async (e) => {
    if (!e || !e.isTrusted) return;
    if(state.processingAction) return;
    state.processingAction = true;
    const n=$('r-name').value, em=$('r-email').value.trim().toLowerCase(), p=$('r-pass').value;
    if(!n || !em || p.length < 8) {
      window.toast("Check inputs");
      state.processingAction = false;
      return;
    }
    window.setLoading(true, "Sending Code...");
    const [r, err] = await safeAwait(fetch(CONFIG.mailApi, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "send", email: em })
    }));
    if(r) {
      if(r.status === 429) {
        window.toast("Too many attempts. Wait a minute.");
        state.processingAction = false;
        window.setLoading(false);
        return;
      }
      const j = await r.json();
      if(j.message === "Code sent") {
        sessionStorage.setItem('temp_reg', JSON.stringify({n, em, p}));
        window.nav('scr-verify');
        startVTimer();
        window.setLoading(false);
      } else {
        window.toast(j.message || "Mail error");
        window.setLoading(false);
      }
    } else {
      window.toast("Network error");
      window.setLoading(false);
    }
    state.processingAction = false;
  };

  const startVTimer = () => {
    let left = CONFIG.verificationCodeExpiry;
    if(state.vTimer) clearInterval(state.vTimer);
    state.vTimer = setInterval(() => {
      left--;
      $('v-timer').innerText = `${Math.floor(left/60)}:${(left%60).toString().padStart(2,'0')}`;
      if(left<=0) {
        clearInterval(state.vTimer);
        window.nav('scr-register');
      }
    }, 1000);
  };

  window.handleVerify = async (e) => {
    if (!e || !e.isTrusted) return;
    if(state.processingAction) return;
    state.processingAction = true;
    const code = $('v-code').value, temp = JSON.parse(sessionStorage.getItem('temp_reg'));
    if(!temp) {
      window.toast("Session expired");
      state.processingAction = false;
      return;
    }
    window.setLoading(true, "Verifying Code...");
    const r = await fetch(CONFIG.mailApi, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify", email: temp.em, code: code })
    });
    if (r.status === 429) {
      window.toast("Too many attempts.");
      state.processingAction = false;
      window.setLoading(false);
      return;
    }
    const j = await r.json();
    if(j.message === "Verified") {
      localStorage.removeItem(FLAG_LOGOUT);
      const { error } = await db.auth.signUp({
        email: temp.em,
        password: temp.p,
        options: { data: { full_name: temp.n } }
      });
      if(error) {
        window.toast(error.message);
        window.setLoading(false);
      } else {
        await initPresence(true);
      }
    } else {
      window.toast(j.message || "Wrong code");
      window.setLoading(false);
    }
    state.processingAction = false;
  };

  window.handleGuestLogin = async (e) => {
    if (!e || !e.isTrusted) return;
    if(state.processingAction) return;
    const nameInput = $('g-name');
    let name = nameInput.value.trim();
    const lockedName = localStorage.getItem(FLAG_GUEST_NAME);
    if (lockedName) name = lockedName;
    else {
      if (!name) return window.toast("Please enter a name.");
    }
    if (!lockedName) {
      window.openHub();
      window.showOverlayView('guest-warn');
    } else {
      await performGuestLogin(name);
      await initPresence(true);
    }
  };

  window.confirmGuestLoginAction = async (e) => {
    if (!e || !e.isTrusted) return;
    const name = $('g-name').value.trim();
    if(!name) return;
    await performGuestLogin(name);
  };

  const performGuestLogin = async (name) => {
    window.closeOverlay();
    window.setLoading(true, "Initializing...");
    localStorage.removeItem(FLAG_LOGOUT);
    const { data: { user: existingUser } } = await db.auth.getUser();
    let finalUser;
    if (existingUser && existingUser.is_anonymous) {
      const currentName = existingUser.user_metadata?.full_name;
      if (!currentName || currentName !== name) {
        await db.auth.updateUser({ data: { full_name: name } });
        finalUser = existingUser;
        finalUser.user_metadata = finalUser.user_metadata || {};
        finalUser.user_metadata.full_name = name;
      } else {
        finalUser = existingUser;
      }
    } else {
      const { data, error } = await db.auth.signInAnonymously();
      if (error) {
        window.toast(error.message || "Anonymous login failed");
        window.setLoading(false);
        return;
      }
      finalUser = data.user;
      await new Promise(resolve => setTimeout(resolve, 1000));
      await db.auth.refreshSession();
      const refreshed = await db.auth.getSession();
      finalUser = refreshed.data.session?.user || finalUser;
    }
    await db.auth.updateUser({ data: { full_name: name } });
    await db.from('profiles').upsert({
      id: finalUser.id,
      full_name: name,
      is_guest: true
    });
    state.user = finalUser;
    state.user.user_metadata = state.user.user_metadata || {};
    state.user.user_metadata.full_name = name;
    localStorage.setItem(FLAG_GUEST_ID, state.user.id);
    localStorage.setItem(FLAG_GUEST_NAME, name);
    window.nav('scr-lobby');
    window.loadRooms();
    await new Promise(resolve => setTimeout(resolve, 800));
    window.forceClaimMaster();
    window.setLoading(false);
    await initPresence(true);
  };

  window.handleCreate = async (e) => {
    if (!e || !e.isTrusted) return;
    if(state.serverFull) return window.toast("Network full");
    if(state.user?.is_anonymous) return window.toast("Guests cannot create rooms");
    if(state.processingAction) return;
    state.processingAction = true;
    const n = $('c-name').value.trim();
    const p = $('c-pass').value;
    const isP = $('c-private').checked;
    
    const isEveryone = $('c-access-everyone').classList.contains('active');
    let allowedUsers = ['*'];
    
    if (!isEveryone) {
        allowedUsers = state.selectedAllowedUsers.map(u => u.id);
        if (!allowedUsers.includes(state.user.id)) allowedUsers.push(state.user.id);
        if (allowedUsers.length === 0) {
             window.toast("Select at least one user");
             state.processingAction = false;
             return;
        }
    }

    if(isP && !p) {
      window.toast("Private rooms require a password");
      state.processingAction = false;
      return;
    }
    if(!n) {
      window.toast("Name required");
      state.processingAction = false;
      return;
    }

    window.setLoading(true, "Deploying Room...");
    const roomSalt = generateSalt();
    const {data, error} = await db.from('rooms').insert([{
      name: n,
      has_password: !!p,
      is_private: isP,
      salt: roomSalt,
      created_by: state.user.id,
      allowed_users: allowedUsers
    }]).select();
    if(error) {
      window.toast("Error: " + error.message);
      state.processingAction = false;
      window.setLoading(false);
      return;
    }
    if(data && data.length > 0) {
      const newRoom = data[0];
      if(p) {
        const accessHash = await sha256(p + roomSalt);
        await db.rpc('set_room_password', { p_room_id: newRoom.id, p_hash: accessHash });
      }
      state.lastCreated = newRoom;
      state.lastCreatedPass = p;
      $('s-id').innerText = newRoom.id;
      window.nav('scr-success');
      state.selectedAllowedUsers = [];
    }
    state.processingAction = false;
    window.setLoading(false);
  };

  window.submitGate = async (e) => {
    if (!e || !e.isTrusted) return;
    const inputPass = $('gate-pass').value;
    const inputHash = await sha256(inputPass + state.pending.salt);
    window.setLoading(true, "Verifying Access...");
    const { data, error } = await db.rpc('verify_room_password', {
      p_room_id: state.pending.id,
      p_hash: inputHash
    });
    window.setLoading(false);
    if(data === true) window.openVault(state.pending.id, state.pending.name, inputPass, state.pending.salt);
    else window.toast("Access Denied");
  };

  window.handleLogout = async (e) => {
    if (!e || !e.isTrusted) return;
    window.setLoading(true, "Switching Account...");
    if (state.heartbeatInterval) clearInterval(state.heartbeatInterval);
    if (state.uptimeInterval) clearInterval(state.uptimeInterval);
    state.uptimeInterval = null;
    state.sessionStartTime = null;
    if (state.presenceChannel) state.presenceChannel.unsubscribe();
    if (state.chatChannel) state.chatChannel.unsubscribe();
    
    if (state.user && state.user.is_anonymous) {
      localStorage.setItem(FLAG_GUEST_ID, state.user.id);
      localStorage.setItem(FLAG_GUEST_NAME, state.user.user_metadata?.full_name);
      state.user = null; 
      state.isMasterTab = false;
      window.nav('scr-start');
      window.toast("Guest session saved. Refresh to restore.");
    } else {
      localStorage.setItem(FLAG_LOGOUT, 'true');
      state.user = null;
      localStorage.removeItem(FLAG_GUEST_ID);
      localStorage.removeItem(FLAG_GUEST_NAME);
      await db.auth.signOut();
      window.nav('scr-start');
    }
    window.setLoading(false);
  };

  window.copyId = () => {
    navigator.clipboard.writeText(state.currentRoomId);
    const copyIcon = $('icon-copy-chat');
    const checkIcon = $('icon-check-chat');
    copyIcon.style.display = 'none';
    checkIcon.style.display = 'block';
    setTimeout(() => {
      copyIcon.style.display = 'block';
      checkIcon.style.display = 'none';
    }, 2000);
  };

  window.copySId = () => {
    navigator.clipboard.writeText(state.lastCreated.id);
    window.toast("ID Copied");
  };

  window.enterCreated = () => {
    const pass = state.lastCreatedPass;
    window.openVault(state.lastCreated.id, state.lastCreated.name, pass, state.lastCreated.salt);
    state.lastCreatedPass = null;
  };

  let touchStartX = 0, touchEndX = 0;
  document.addEventListener('touchstart', e => touchStartX = e.changedTouches[0].screenX, false);
  document.addEventListener('touchend', e => {
    touchEndX = e.changedTouches[0].screenX;
    const active = document.querySelector('.screen.active');
    if(!active) return;
    const diff = touchEndX - touchStartX;
    if(active.id === 'scr-start' && diff < -50) window.nav('scr-guest', 'left');
    else if(active.id === 'scr-guest' && diff > 50) window.nav('scr-start', 'right');
  }, false);

  window.addEventListener('online', () => {
    $('offline-screen').classList.remove('active');
    window.toast("Back online");
    if(state.user && state.isMasterTab) initPresence(true);
  });

  window.addEventListener('offline', () => {
    $('offline-screen').classList.add('active');
    updateOnlineDisplay(null);
    window.toast("Connection lost");
  });

  db.auth.onAuthStateChange(async (ev, ses) => {
    const isFlaggedLogout = localStorage.getItem(FLAG_LOGOUT) === 'true';
    const hasGuestId = localStorage.getItem(FLAG_GUEST_ID);
    
    if (isFlaggedLogout && hasGuestId) {
       localStorage.removeItem(FLAG_LOGOUT);
    }
    
    if (localStorage.getItem(FLAG_LOGOUT) === 'true') {
      state.user = null;
      return;
    }
    
    state.user = ses?.user;
    const createBtn = $('icon-plus-lobby');
    const activeScreenId = document.querySelector('.screen.active')?.id;
    if (createBtn) createBtn.style.display = state.user?.is_anonymous && activeScreenId === 'scr-lobby' ? 'none' : 'flex';
    if (ev === 'SIGNED_IN') {
      if(state.user) {
        localStorage.setItem(FLAG_GUEST_ID, state.user.id);
        if(state.user.user_metadata?.full_name) localStorage.setItem(FLAG_GUEST_NAME, state.user.user_metadata.full_name);
        state.sessionStartTime = Date.now();
        if(state.uptimeInterval) clearInterval(state.uptimeInterval);
        state.uptimeInterval = setInterval(updateUptime, 1000);
        const authScreens = ['scr-start', 'scr-login', 'scr-register', 'scr-verify'];
        if (authScreens.includes(activeScreenId)) {
          window.nav('scr-lobby');
          window.loadRooms();
          window.forceClaimMaster();
        }
      }
    }
    if (ev === 'SIGNED_OUT') {
      if (state.heartbeatInterval) clearInterval(state.heartbeatInterval);
      if (state.uptimeInterval) clearInterval(state.uptimeInterval);
      state.uptimeInterval = null;
      state.sessionStartTime = null;
      if (state.presenceChannel) state.presenceChannel.unsubscribe();
      if (state.chatChannel) state.chatChannel.unsubscribe();
      if (!hasGuestId) {
        localStorage.removeItem(FLAG_GUEST_ID);
        localStorage.removeItem(FLAG_GUEST_NAME);
      }
      localStorage.removeItem(FLAG_LOGOUT);
      window.nav('scr-start');
    }
  });

  window.openRoomSettings = async () => {
    if (!state.currentRoomId || !state.currentRoomData || state.currentRoomData.created_by !== state.user.id) {
      return window.toast("You are not the owner of this room");
    }
    window.setLoading(true, "Loading room settings...");
    const room = state.currentRoomData;
    
    $('edit-room-name').value = room.name;
    $('edit-room-private').checked = room.is_private;
    $('edit-room-pass').value = '';
    
    state.selectedAllowedUsers = [];
    
    const isEveryone = room.allowed_users.includes('*');
    if (isEveryone) {
        window.handleAccessToggle('edit-room', 'everyone');
    } else {
        window.handleAccessToggle('edit-room', 'specific');
        const ids = room.allowed_users;
        const { data: profiles } = await db.from('profiles').select('id, full_name').in('id', ids);
        state.selectedAllowedUsers = ids.map(id => {
            const p = profiles?.find(pro => pro.id === id);
            return { id: id, name: p?.full_name || 'Unknown' };
        });
    }
    
    updateAccessSummary('edit-room');
    
    $('overlay-container').classList.add('active');
    window.showOverlayView('room-settings');
    window.setLoading(false);
  };

  window.saveRoomSettings = async (e) => {
    if (!e || !e.isTrusted) return;
    if (state.processingAction) return;
    state.processingAction = true;
    const name = $('edit-room-name').value.trim();
    const isPrivate = $('edit-room-private').checked;
    const newPass = $('edit-room-pass').value;
    
    const isEveryone = $('edit-room-access-everyone').classList.contains('active');
    let allowedUsers = ['*'];
    if (!isEveryone) {
        allowedUsers = state.selectedAllowedUsers.map(u => u.id);
        if (!allowedUsers.includes(state.user.id)) allowedUsers.push(state.user.id);
        if (allowedUsers.length === 0) {
             window.toast("Select at least one user");
             state.processingAction = false;
             return;
        }
    }

    if (!name) {
      window.toast("Room name is required");
      state.processingAction = false;
      return;
    }

    window.setLoading(true, "Saving changes...");
    
    const updates = { name, is_private: isPrivate, allowed_users: allowedUsers };
    const { error: updateError } = await db.from('rooms').update(updates).eq('id', state.currentRoomId);

    if (updateError) {
      window.toast("Failed to update room: " + updateError.message);
      window.setLoading(false);
      state.processingAction = false;
      return;
    }

    if (newPass) {
      const roomSalt = state.currentRoomData.salt;
      const accessHash = await sha256(newPass + roomSalt);
      const { error: passError } = await db.rpc('set_room_password', { p_room_id: state.currentRoomId, p_hash: accessHash });
      if (passError) {
        window.toast("Failed to update password");
      } else {
        await db.from('rooms').update({ has_password: true }).eq('id', state.currentRoomId);
        state.currentRoomData.has_password = true;
      }
    }

    const { data: updatedRoom } = await db.from('rooms').select('*').eq('id', state.currentRoomId).single();
    state.currentRoomData = updatedRoom;
    $('chat-title').innerText = updatedRoom.name;
    
    window.toast("Room settings saved");
    window.closeOverlay();
    state.processingAction = false;
    window.setLoading(false);
  };

  const init = async () => {
    if (!navigator.onLine) {
      $('offline-screen').classList.add('active');
      return;
    }
    
    if (localStorage.getItem(FLAG_GUEST_ID)) {
        localStorage.removeItem(FLAG_LOGOUT);
    }

    if (localStorage.getItem(FLAG_LOGOUT) === 'true') {
      state.user = null;
      window.nav('scr-start');
      window.setLoading(false);
      monitorConnection();
      return;
    }
    const [sessionRes, sessionErr] = await safeAwait(db.auth.getSession());
    if (sessionErr) {
      console.error("Failed to get session:", sessionErr);
      window.toast("Failed to get session");
      window.nav('scr-start');
      window.setLoading(false);
      monitorConnection();
      return;
    }
    const session = sessionRes.data.session;
    if (session) {
      state.user = session.user;
      localStorage.setItem(FLAG_GUEST_ID, state.user.id);
      if (state.user.user_metadata?.full_name) localStorage.setItem(FLAG_GUEST_NAME, state.user.user_metadata.full_name);
      const masterExists = await checkMaster();
      if (masterExists) {
        const overlay = $('block-overlay');
        overlay.classList.add('active');
        lucide.createIcons();
        window.nav('scr-lobby');
        window.loadRooms();
      } else {
        window.forceClaimMaster();
        window.nav('scr-lobby');
        window.loadRooms();
      }
      state.sessionStartTime = Date.now();
      if(state.uptimeInterval) clearInterval(state.uptimeInterval);
      state.uptimeInterval = setInterval(updateUptime, 1000);
      await initPresence(true);
    } else {
      $('guest-swipe-hint').style.display = 'flex';
    }
    lucide.createIcons();
    window.setLoading(false);
    monitorConnection();
  };

  init();
}
