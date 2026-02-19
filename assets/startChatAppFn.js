// assets/startChatAppFn.js | GH: HyperRushNet | 2026 | MIT License
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

export function startChatApp(customConfig = {}) {
  console.log('startChatApp called with customConfig:', customConfig);
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
  console.log('CONFIG initialized:', CONFIG);

  lucide.createIcons();
  console.log('lucide icons created');

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
    isChatChannelReady: false
  };
  console.log('state initialized:', state);

  const FLAG_LOGOUT = 'hrn_flag_force_logout';
  const FLAG_GUEST_NAME = 'hrn_flag_guest_name';
  const FLAG_GUEST_ID = 'hrn_flag_guest_id';
  console.log('flags defined:', FLAG_LOGOUT, FLAG_GUEST_NAME, FLAG_GUEST_ID);

  let toastQueue = [];
  let toastVisible = false;
  console.log('toastQueue and toastVisible initialized');

  const tabChannel = new BroadcastChannel('hrn_tab_sync');
  console.log('tabChannel created');

  const db = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true },
    realtime: { params: { eventsPerSecond: 10 } }
  });
  console.log('db client created');

  const esc = t => {
    console.log('esc called with t:', t);
    const p = document.createElement('p');
    p.textContent = t;
    const result = p.innerHTML;
    console.log('esc result:', result);
    return result;
  };

  const $ = id => {
    console.log('$ called with id:', id);
    const result = document.getElementById(id);
    console.log('$ result:', result);
    return result;
  };

  const updateOnlineDisplay = (count) => {
    console.log('updateOnlineDisplay called with count:', count);
    if (typeof count === 'number') {
      state.lastKnownOnlineCount = count;
      console.log('state.lastKnownOnlineCount updated:', state.lastKnownOnlineCount);
    }
    const displayCount = (typeof count === 'number') ? count : '--';
    console.log('displayCount:', displayCount);
    document.querySelectorAll('.live-count').forEach(el => {
      if (el.innerText !== displayCount.toString()) {
        console.log('updating live-count el:', el, 'to', displayCount);
        el.innerText = displayCount;
      }
    });
    const hubCount = $('hub-online-count');
    if (hubCount && hubCount.innerText !== displayCount.toString()) {
      console.log('updating hub-online-count to', displayCount);
      hubCount.innerText = displayCount;
    }
  };

  const updateUptime = () => {
    console.log('updateUptime called');
    if (!state.sessionStartTime) {
      console.log('no sessionStartTime, returning');
      return;
    }
    const diff = Math.floor((Date.now() - state.sessionStartTime) / 1000);
    console.log('diff:', diff);
    const mins = Math.floor(diff / 60).toString().padStart(2, '0');
    const secs = (diff % 60).toString().padStart(2, '0');
    console.log('mins, secs:', mins, secs);
    const el = $('hub-uptime');
    if (el) {
      console.log('updating hub-uptime to', `${mins}:${secs}`);
      el.innerText = `${mins}:${secs}`;
    }
  };

  const processToastQueue = () => {
    console.log('processToastQueue called, toastVisible:', toastVisible, 'toastQueue.length:', toastQueue.length);
    if (toastVisible || toastQueue.length === 0) return;
    toastVisible = true;
    console.log('toastVisible set to true');
    const msg = toastQueue.shift();
    console.log('toast msg:', msg);
    const c = $('toast-container');
    const t = document.createElement('div');
    t.className = 'toast-item';
    t.innerText = msg;
    t.onclick = () => {
      console.log('toast onclick triggered');
      t.style.opacity = '0';
      setTimeout(() => {
        t.remove();
        toastVisible = false;
        processToastQueue();
        console.log('toast removed, toastVisible false, processToastQueue called');
      }, 400);
    };
    c.appendChild(t);
    console.log('toast appended');
    setTimeout(() => {
      if (t.parentNode) {
        t.style.opacity = '0';
        console.log('toast opacity set to 0');
        setTimeout(() => {
          if (t.parentNode) t.remove();
          toastVisible = false;
          processToastQueue();
          console.log('toast removed after timeout, toastVisible false');
        }, 400);
      }
    }, 3000);
  };

  window.toast = m => {
    console.log('toast called with m:', m);
    toastQueue.push(m);
    console.log('toastQueue:', toastQueue);
    processToastQueue();
  };

  window.setLoading = (s, text = null) => {
    console.log('setLoading called with s:', s, 'text:', text);
    const loader = $('loader-overlay');
    const loaderText = $('loader-text');
    if (s) loader.classList.add('active');
    else loader.classList.remove('active');
    if (text) loaderText.innerText = text;
    else loaderText.innerText = "Loading...";
  };

  const safeAwait = async (promise) => {
    console.log('safeAwait called');
    try {
      const result = await promise;
      console.log('safeAwait success:', result);
      return [result, null];
    } catch (error) {
      console.log('safeAwait error:', error);
      return [null, error];
    }
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
  console.log('workerCode defined');

  const workerBlob = new Blob([workerCode], { type: 'application/javascript' });
  console.log('workerBlob created');

  const cryptoWorker = new Worker(URL.createObjectURL(workerBlob));
  console.log('cryptoWorker created');

  const pendingCallbacks = {};
  console.log('pendingCallbacks initialized');

  cryptoWorker.onmessage = (e) => {
    console.log('cryptoWorker onmessage received:', e.data);
    const { type } = e.data;
    if (pendingCallbacks[type]) {
      console.log('calling pendingCallback for type:', type);
      pendingCallbacks[type](e.data);
      delete pendingCallbacks[type];
      console.log('pendingCallback deleted for type:', type);
    }
  };

  const generateSalt = () => {
    console.log('generateSalt called');
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    const result = Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
    console.log('generateSalt result:', result);
    return result;
  };

  const sha256 = async (text) => {
    console.log('sha256 called with text:', text);
    const buffer = new TextEncoder().encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const result = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    console.log('sha256 result:', result);
    return result;
  };

  const deriveKey = (pass, salt) => new Promise((resolve, reject) => {
    console.log('deriveKey called with pass:', pass, 'salt:', salt);
    pendingCallbacks['keyDerived'] = (data) => {
      console.log('keyDerived callback data:', data);
      if (data.success) resolve(true);
      else reject("Key derivation failed");
    };
    cryptoWorker.postMessage({ type: 'deriveKey', payload: { password: pass, salt: salt } });
    console.log('deriveKey postMessage sent');
  });

  const encryptMessage = (text) => new Promise((resolve, reject) => {
    console.log('encryptMessage called with text:', text);
    pendingCallbacks['encrypted'] = (data) => {
      console.log('encrypted callback data:', data);
      if (data.result) resolve(data.result);
      else reject("Encryption failed");
    };
    const time = new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
    cryptoWorker.postMessage({ type: 'encrypt', payload: { text: time + "|" + text } });
    console.log('encryptMessage postMessage sent');
  });

  const cleanupPresence = async () => {
    console.log('cleanupPresence called');
    if (state.presenceChannel) {
      try {
        await db.removeChannel(state.presenceChannel);
        console.log('presenceChannel removed');
      } catch (e) {
        console.log('error removing presenceChannel:', e);
      }
      state.presenceChannel = null;
      state.isPresenceSubscribed = false;
      console.log('state updated after cleanupPresence');
    }
    if (state.heartbeatInterval) {
      clearInterval(state.heartbeatInterval);
      state.heartbeatInterval = null;
      console.log('heartbeatInterval cleared');
    }
    updateOnlineDisplay(null);
  };

  const cleanupChatChannel = async () => {
    console.log('cleanupChatChannel called');
    if (state.chatChannel) {
      try {
        await db.removeChannel(state.chatChannel);
        console.log('chatChannel removed');
      } catch (e) {
        console.log('error removing chatChannel:', e);
      }
      state.chatChannel = null;
      state.isChatChannelReady = false;
      console.log('state updated after cleanupChatChannel');
    }
  };

  const cleanupChannels = async () => {
    console.log('cleanupChannels called');
    await cleanupChatChannel();
  };

  const queryOnlineCountImmediately = async () => {
    console.log('queryOnlineCountImmediately called');
    if (!state.presenceChannel) {
      console.log('no presenceChannel, returning');
      return;
    }
    try {
      const presState = state.presenceChannel.presenceState();
      console.log('presState:', presState);
      const allPresences = Object.values(presState).flat();
      console.log('allPresences:', allPresences);
      const uniqueUserIds = new Set(allPresences.map(p => p.user_id));
      console.log('uniqueUserIds size:', uniqueUserIds.size);
      updateOnlineDisplay(uniqueUserIds.size);

      if (uniqueUserIds.size > CONFIG.maxUsers) {
        if (!state.serverFull) {
          state.serverFull = true;
          console.log('serverFull set to true');
          $('capacity-overlay').classList.add('active');
          await cleanupChannels();
        }
      } else {
        state.serverFull = false;
        console.log('serverFull set to false');
      }
    } catch (e) {
      console.log('error in queryOnlineCountImmediately:', e);
    }
  };

  const initPresence = async (force = false) => {
    console.log('initPresence called with force:', force);
    if (!state.isMasterTab || !state.user) {
      console.log('not master or no user, returning');
      return;
    }
    const now = Date.now();
    console.log('current time:', now, 'lastReconnectAttempt:', state.lastReconnectAttempt);
    if (!force && state.isConnecting) {
      console.log('already connecting, returning');
      return;
    }
    if (!force && (now - state.lastReconnectAttempt < CONFIG.reconnectDebounceMs)) {
      console.log('debounce active, returning');
      return;
    }
    state.lastReconnectAttempt = now;
    state.isConnecting = true;
    state.isPresenceSubscribed = false;
    console.log('state updated for initPresence');

    if (state.presenceChannel) {
      try { await db.removeChannel(state.presenceChannel); } catch(e) {
        console.log('error removing presenceChannel:', e);
      }
    }
    updateOnlineDisplay(null);
    const myId = state.user.id;
    console.log('myId:', myId);
    state.presenceChannel = db.channel('online-users', {
      config: { presence: { key: myId } }
    });
    console.log('presenceChannel created');

    state.presenceChannel
      .on('presence', { event: 'sync' }, () => {
        console.log('presence sync event');
        if (!state.presenceChannel) return;
        queryOnlineCountImmediately();
      })
      .subscribe(async (status, err) => {
        console.log('subscribe status:', status, 'err:', err);
        if (status === 'SUBSCRIBED') {
          if (!state.presenceChannel) return;
          state.isPresenceSubscribed = true;
          state.isConnecting = false;
          console.log('subscribed, state updated');
          await queryOnlineCountImmediately();
          await state.presenceChannel.track({
            user_id: myId,
            online_at: new Date().toISOString()
          });
          console.log('track sent');
          await queryOnlineCountImmediately();
          if (state.heartbeatInterval) clearInterval(state.heartbeatInterval);
          state.heartbeatInterval = setInterval(async () => {
            console.log('heartbeatInterval tick');
            if (state.presenceChannel && state.isMasterTab && !state.serverFull) {
              try {
                await state.presenceChannel.track({
                  user_id: myId,
                  online_at: new Date().toISOString()
                });
                console.log('heartbeat track sent');
              } catch(e) {
                console.log('heartbeat track error:', e);
              }
            }
          }, CONFIG.presenceHeartbeatMs);
          console.log('heartbeatInterval set');
          setTimeout(() => {
            if (state.lastKnownOnlineCount === null && state.isPresenceSubscribed && !state.serverFull) {
              queryOnlineCountImmediately();
            }
          }, 2000);
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          state.isPresenceSubscribed = false;
          state.isConnecting = false;
          updateOnlineDisplay(null);
          console.log('subscription failed, state updated');
        }
      });
  };

  const monitorConnection = () => {
    console.log('monitorConnection started');
    setInterval(() => {
      console.log('monitorConnection interval tick');
      if (!navigator.onLine) {
        $('offline-screen').classList.add('active');
        state.isPresenceSubscribed = false;
        updateOnlineDisplay(null);
        console.log('offline, updated');
        return;
      }
      $('offline-screen').classList.remove('active');
      console.log('online, screen updated');
      if (!state.user || !state.isMasterTab) {
        console.log('no user or not master, returning');
        return;
      }
      const wsState = db.realtime.connectionState();
      console.log('wsState:', wsState);
      if ((wsState === 'disconnected' || wsState === 'stopped') && !state.isConnecting) {
        initPresence(true);
      }
      if (state.lastKnownOnlineCount === null && state.isPresenceSubscribed && !state.isConnecting && !state.serverFull) {
        setTimeout(() => {
          if (state.lastKnownOnlineCount === null && state.isPresenceSubscribed && !state.isConnecting && !state.serverFull) {
            queryOnlineCountImmediately();
          }
        }, 1000);
      }
    }, 5000);
  };

  window.retryConnection = () => {
    console.log('retryConnection called');
    $('capacity-overlay').classList.remove('active');
    state.serverFull = false;
    initPresence(true);
  };

  window.handlePrivateToggle = () => {
    console.log('handlePrivateToggle called');
    const isPrivate = $('c-private').checked;
    console.log('isPrivate:', isPrivate);
    const passInput = $('c-pass');
    passInput.placeholder = isPrivate ? "Passkey (Required)" : "Passkey (Optional)";
    console.log('passInput placeholder updated');
  };

  window.forceClaimMaster = () => {
    console.log('forceClaimMaster called');
    if (!state.isMasterTab) {
      state.isMasterTab = true;
      console.log('isMasterTab set to true');
      tabChannel.postMessage({ type: 'CLAIM_MASTER', id: state.tabId });
      console.log('CLAIM_MASTER postMessage sent');
      $('block-overlay').classList.remove('active');
      if (localStorage.getItem(FLAG_LOGOUT) !== 'true' && state.user) {
        initPresence(true);
      }
    }
  };

  window.closeTabAttempt = () => {
    console.log('closeTabAttempt called');
    window.open('', '_self');
    window.close();
  };

  tabChannel.onmessage = (ev) => {
    console.log('tabChannel onmessage:', ev.data);
    if (ev.data.type === 'CLAIM_MASTER' && ev.data.id !== state.tabId) {
      if (state.isMasterTab) {
        cleanupPresence();
        cleanupChatChannel();
        state.isMasterTab = false;
        console.log('isMasterTab set to false');
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
        console.log('overlay updated for session moved');
      }
    }
    if (ev.data.type === 'PING_MASTER') {
      if (state.isMasterTab) {
        tabChannel.postMessage({ type: 'PONG_MASTER' });
        console.log('PONG_MASTER sent');
      }
    }
  };

  window.addEventListener('beforeunload', () => {
    console.log('beforeunload event');
    tabChannel.postMessage({ type: 'CLAIM_MASTER', id: state.tabId });
  });

  const checkMaster = () => {
    console.log('checkMaster called');
    return new Promise((resolve) => {
      let masterFound = false;
      const handler = (ev) => {
        console.log('checkMaster handler ev:', ev.data);
        if (ev.data.type === 'PONG_MASTER') masterFound = true;
      };
      tabChannel.addEventListener('message', handler);
      tabChannel.postMessage({ type: 'PING_MASTER' });
      console.log('PING_MASTER sent for checkMaster');
      setTimeout(() => {
        tabChannel.removeEventListener('message', handler);
        console.log('checkMaster resolved with masterFound:', masterFound);
        resolve(masterFound);
      }, 300);
    });
  };

  window.showGuestInfo = () => {
    console.log('showGuestInfo called');
    $('overlay-container').classList.add('active');
    window.showOverlayView('guest-info');
    lucide.createIcons();
  };

  window.openHub = () => {
    console.log('openHub called');
    $('overlay-container').classList.add('active');
    window.showOverlayView('hub');
    lucide.createIcons();
  };

  window.closeOverlay = () => {
    console.log('closeOverlay called');
    $('overlay-container').classList.remove('active');
  };

  window.showOverlayView = (viewId) => {
    console.log('showOverlayView called with viewId:', viewId);
    const panel = document.querySelector('.panel-card');
    if (!panel) {
      console.log('no panel, returning');
      return;
    }
    panel.querySelectorAll('.view-content').forEach(v => v.classList.remove('active'));
    const target = $(`view-${viewId}`);
    if (target) {
      target.classList.add('active');
      lucide.createIcons();
      console.log('overlay view activated');
    }
  };

  window.prepareMyAccount = () => {
    console.log('prepareMyAccount called');
    if (!state.user) {
      console.log('no user, returning');
      return;
    }
    const isGuest = state.user.is_anonymous;
    console.log('isGuest:', isGuest);
    $('my-acc-name').innerText = state.user.user_metadata?.full_name || "User";
    $('my-acc-id').innerText = state.user.id;
    $('my-acc-email').innerText = isGuest ? "Guest Mode" : (state.user.email || "No email");
    $('my-acc-type').innerText = isGuest ? "Guest Account" : "Full Account";
    $('my-acc-type').style.color = isGuest ? "var(--warning)" : "var(--success)";
    window.showOverlayView('my-account');
  };

  window.inspectUser = async (uid) => {
    console.log('inspectUser called with uid:', uid);
    if (uid === state.user?.id) return window.prepareMyAccount();
    window.setLoading(true, "Fetching info...");
    const { data, error } = await db.from('profiles').select('id, full_name, updated_at, is_guest').eq('id', uid).single();
    console.log('inspectUser data:', data, 'error:', error);
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
    console.log('prepareGuestScreen called');
    const storedName = localStorage.getItem(FLAG_GUEST_NAME);
    console.log('storedName:', storedName);
    const nameInput = $('g-name');
    const lockIcon = document.querySelector('.input-lock-icon');
    if (storedName) {
      nameInput.value = storedName;
      nameInput.disabled = true;
      nameInput.placeholder = "Identity Locked";
      if (lockIcon) lockIcon.style.display = 'block';
    } else {
      nameInput.value = '';
      nameInput.disabled = false;
      nameInput.placeholder = "Enter Name (Permanent)";
      if (lockIcon) lockIcon.style.display = 'none';
    }
    lucide.createIcons();
  };

  window.nav = (id, direction = null) => {
    console.log('nav called with id:', id, 'direction:', direction);
    const current = document.querySelector('.screen.active');
    const next = $(id);
    if (!next) {
      console.log('no next screen, returning');
      return;
    }
    if (id === 'scr-guest') prepareGuestScreen();
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('slide-left', 'slide-right'));
    if (direction === 'left') {
      current.classList.add('slide-left');
      next.classList.remove('slide-right');
    } else if (direction === 'right') {
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
    console.log('loadRooms called');
    if (!state.user) {
      console.log('no user, returning');
      return;
    }
    window.setLoading(true, "Fetching Rooms...");
    const { data } = await db.from('rooms').select('*').eq('is_private', false).order('created_at', { ascending: false });
    console.log('loadRooms data:', data);
    state.allRooms = data || [];
    console.log('state.allRooms updated:', state.allRooms);
    window.filterRooms();
    window.setLoading(false);
  };

  window.filterRooms = () => {
    console.log('filterRooms called');
    const q = $('search-bar').value.toLowerCase();
    console.log('search query:', q);
    const list = $('room-list');
    const filtered = state.allRooms.filter(r => r.name.toLowerCase().includes(q));
    console.log('filtered rooms:', filtered);
    if (filtered.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <i data-lucide="folder" class="empty-state-icon"></i>
          <div class="empty-state-title">No groups yet</div>
          <div class="empty-state-sub">Create one to start chatting.</div>
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
    console.log('joinAttempt called with id:', id);
    if (state.serverFull) return window.toast("Network is full");
    window.setLoading(true, "Joining Room...");
    const { data, error } = await db.from('rooms').select('*').eq('id', id).single();
    console.log('joinAttempt data:', data, 'error:', error);
    window.setLoading(false);
    if (error || !data) return window.toast("Room not found");
    if (data.has_password) {
      state.pending = { id: data.id, name: data.name, salt: data.salt };
      console.log('state.pending updated:', state.pending);
      window.nav('scr-gate');
    } else {
      window.openVault(data.id, data.name, null, data.salt);
    }
  };

  window.joinPrivate = async () => {
    console.log('joinPrivate called');
    if (state.serverFull) return window.toast("Network is full");
    if (!state.user) return window.toast("Login required");
    const id = $('join-id').value.trim();
    console.log('join id:', id);
    if (!id) return;
    window.setLoading(true, "Searching Room...");
    const { data } = await db.from('rooms').select('*').eq('id', id).single();
    console.log('joinPrivate data:', data);
    window.setLoading(false);
    if (data) {
      if (data.has_password) {
        state.pending = { id: data.id, name: data.name, salt: data.salt };
        console.log('state.pending updated:', state.pending);
        window.nav('scr-gate');
      } else {
        window.openVault(data.id, data.name, null, data.salt);
      }
    } else window.toast("Not found");
  };

  const getDateLabel = (d) => {
    console.log('getDateLabel called with d:', d);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = Math.round((today - target) / 86400000);
    console.log('diff:', diff);
    if (diff === 0) return "Today";
    if (diff === 1) return "Yesterday";
    if (diff < 7) return d.toLocaleDateString('en-GB', { weekday: 'long' });
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  };

  const processText = (text) => {
    console.log('processText called with text:', text);
    let t = esc(text);
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    t = t.replace(urlRegex, (url) => {
      console.log('replaced url:', url);
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="chat-link">${url}</a>`;
    });
    console.log('processed text:', t);
    return t;
  };

  const checkChatEmpty = () => {
    console.log('checkChatEmpty called');
    const container = $('chat-messages');
    const emptyState = $('chat-empty-state');
    const hasMessages = container.querySelector('.msg');
    console.log('hasMessages:', !!hasMessages);
    if (emptyState) emptyState.style.display = hasMessages ? 'none' : 'flex';
  };

  const renderMsg = (m, prepend = false) => {
    console.log('renderMsg called with m:', m, 'prepend:', prepend);
    let html = "";
    const msgDateObj = new Date(m.created_at);
    const currentLabel = getDateLabel(msgDateObj);
    if (!prepend && currentLabel !== state.lastRenderedDateLabel) {
      html += `<div class="date-divider"><span class="date-label">${currentLabel}</span></div>`;
      state.lastRenderedDateLabel = currentLabel;
      console.log('date divider added, lastRenderedDateLabel:', state.lastRenderedDateLabel);
    } else if (prepend) {
      html += `<div class="date-divider"><span class="date-label">${currentLabel}</span></div>`;
      state.lastRenderedDateLabel = currentLabel;
      console.log('prepend date divider added');
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
    console.log('renderMsg html:', html);
    return html;
  };

  const handleScroll = () => {
    console.log('handleScroll called');
    const container = $('chat-messages');
    if (!container) {
      console.log('no container, returning');
      return;
    }
    if (container.scrollTop < 50 && !state.isLoadingHistory && state.hasMoreHistory) {
      loadMoreHistory();
    }
  };

  const fetchGuestStatuses = async (userIds) => {
    console.log('fetchGuestStatuses called with userIds:', userIds);
    if (!userIds || userIds.length === 0) return;
    const uniqueIds = [...new Set(userIds)];
    console.log('uniqueIds:', uniqueIds);
    const { data, error } = await db.from('profiles').select('id, full_name, is_guest').in('id', uniqueIds);
    console.log('fetchGuestStatuses data:', data, 'error:', error);
    if (data) {
      data.forEach(p => {
        state.roomGuestStatus[p.id] = p.is_guest;
        console.log('roomGuestStatus updated for', p.id, ':', p.is_guest);
      });
    }
  };

  const loadMoreHistory = async () => {
    console.log('loadMoreHistory called');
    if (!state.oldestMessageTimestamp || !state.currentRoomId) {
      console.log('no oldestMessageTimestamp or currentRoomId, returning');
      return;
    }
    state.isLoadingHistory = true;
    console.log('isLoadingHistory set to true');
    const container = $('chat-messages');
    const oldScrollHeight = container.scrollHeight;
    console.log('oldScrollHeight:', oldScrollHeight);
    container.insertAdjacentHTML('afterbegin', '<div id="history-loader" class="history-loader">Loading...</div>');
    const { data, error } = await db
      .from('messages')
      .select('*')
      .eq('room_id', state.currentRoomId)
      .lt('created_at', state.oldestMessageTimestamp)
      .order('created_at', { ascending: false })
      .limit(CONFIG.historyLoadLimit);
    console.log('loadMoreHistory data:', data, 'error:', error);
    $('history-loader')?.remove();
    if (error || !data || data.length === 0) {
      state.hasMoreHistory = false;
      state.isLoadingHistory = false;
      console.log('no more history or error, updated state');
      return;
    }
    data.reverse();
    pendingCallbacks['historyDecrypted'] = async (res) => {
      console.log('historyDecrypted callback res:', res);
      const validMsgs = res.results.filter(m => !m.error);
      console.log('validMsgs:', validMsgs);
      if (validMsgs.length > 0) {
        state.oldestMessageTimestamp = validMsgs[0].created_at;
        console.log('oldestMessageTimestamp updated:', state.oldestMessageTimestamp);
        const ids = validMsgs.map(m => m.user_id);
        await fetchGuestStatuses(ids);
        const lastBatchDate = getDateLabel(new Date(validMsgs[validMsgs.length - 1].created_at));
        const firstMsgEl = container.querySelector('.msg');
        let firstExistingDate = null;
        if (firstMsgEl) {
          const firstTime = firstMsgEl.getAttribute('data-time');
          if (firstTime) firstExistingDate = getDateLabel(new Date(firstTime));
        }
        console.log('lastBatchDate:', lastBatchDate, 'firstExistingDate:', firstExistingDate);
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
        console.log('history appended, scroll updated');
      }
      state.isLoadingHistory = false;
      console.log('isLoadingHistory set to false');
    };
    cryptoWorker.postMessage({ type: 'decryptHistory', payload: { messages: data } });
    console.log('decryptHistory postMessage sent');
  };

  window.openVault = async (id, n, rawPassword, roomSalt) => {
    console.log('openVault called with id:', id, 'n:', n, 'rawPassword:', rawPassword, 'roomSalt:', roomSalt);
    if (!state.user) {
      console.log('no user, toasting and returning');
      return window.toast("Please login first");
    }
    window.setLoading(true, "Deriving Key...");
    if (state.chatChannel) await db.removeChannel(state.chatChannel);
    state.currentRoomId = id;
    state.lastRenderedDateLabel = null;
    state.roomGuestStatus = {};
    state.oldestMessageTimestamp = null;
    state.hasMoreHistory = true;
    state.isLoadingHistory = false;
    state.isChatChannelReady = false;
    console.log('state updated for openVault');
    $('chat-title').innerText = n;
    $('chat-messages').innerHTML = '<div id="chat-empty-state" class="empty-state"><i data-lucide="message-circle" class="empty-state-icon"></i><div class="empty-state-title">No messages yet</div><div class="empty-state-sub">Be the first to say something.</div></div>';
    $('chat-messages').onscroll = handleScroll;
    const copyIcon = $('icon-copy-chat');
    const checkIcon = $('icon-check-chat');
    if (copyIcon) copyIcon.style.display = 'block';
    if (checkIcon) checkIcon.style.display = 'none';
    const keySource = rawPassword ? (rawPassword + id) : id;
    console.log('keySource:', keySource);
    try {
      await deriveKey(keySource, roomSalt);
    } catch (e) {
      console.log('deriveKey error:', e);
      window.setLoading(false);
      return window.toast("Key derivation failed");
    }
    window.setLoading(true, "Fetching History...");
    const { data } = await db.from('messages')
      .select('*')
      .eq('room_id', id)
      .order('created_at', { ascending: false })
      .limit(CONFIG.maxMessages);
    console.log('history data:', data);
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
        console.log('historyDecrypted res:', res);
        const b = $('chat-messages');
        b.innerHTML = '';
        const ids = res.results.map(m => m.user_id);
        await fetchGuestStatuses(ids);
        res.results.forEach(m => {
          if (!m.error) b.insertAdjacentHTML('beforeend', renderMsg(m));
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
    console.log('chatChannel created');
    state.chatChannel.on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `room_id=eq.${id}`
    }, async (payload) => {
      console.log('postgres_changes event:', payload);
      const m = payload.new;
      if (m && state.currentRoomId) {
        pendingCallbacks['singleDecrypted'] = async (decRes) => {
          console.log('singleDecrypted decRes:', decRes);
          if (decRes.result) {
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
      console.log('chatChannel subscribe status:', status);
      if (status === 'SUBSCRIBED') {
        state.isChatChannelReady = true;
        console.log('isChatChannelReady set to true');
      } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        state.isChatChannelReady = false;
        console.log('isChatChannelReady set to false');
      }
    });
  };

  const applyRateLimit = () => {
    console.log('applyRateLimit called');
    const now = Date.now();
    console.log('now:', now, 'lastMessageTime:', state.lastMessageTime);
    if (now - state.lastMessageTime < CONFIG.rateLimitMs) {
      const wait = CONFIG.rateLimitMs - (now - state.lastMessageTime);
      $('chat-input-area').classList.add('rate-limited');
      setTimeout(() => {
        $('chat-input-area').classList.remove('rate-limited');
      }, wait);
      console.log('rate limited, wait:', wait);
      return false;
    }
    return true;
  };

  window.sendMsg = async (e) => {
    console.log('sendMsg called with e.isTrusted:', e?.isTrusted);
    if (!e || !e.isTrusted) return;
    if (!state.user || !state.currentRoomId) return;
    if (state.processingAction) return;
    if (!state.isChatChannelReady) {
      window.toast("Connection not ready yet – please wait a moment");
      return;
    }
    if (!applyRateLimit()) return;
    state.processingAction = true;
    console.log('processingAction set to true');
    const v = $('chat-input').value.trim();
    console.log('message v:', v);
    if (!v) {
      state.processingAction = false;
      return;
    }
    $('chat-input').value = '';
    state.lastMessageTime = Date.now();
    try {
      const enc = await encryptMessage(v);
      console.log('encrypted enc:', enc);
      await db.from('messages').insert([{
        room_id: state.currentRoomId,
        user_id: state.user.id,
        user_name: state.user.user_metadata?.full_name,
        content: enc
      }]);
      console.log('message inserted');
    } catch (e) {
      console.log('sendMsg error:', e);
      window.toast("Failed to send");
    }
    state.processingAction = false;
    console.log('processingAction set to false');
  };

  window.sendGuestReply = async (e, message) => {
    console.log('sendGuestReply called with message:', message, 'e.isTrusted:', e?.isTrusted);
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
    } catch (e) {
      console.log('sendGuestReply error:', e);
    }
    state.processingAction = false;
  };

  window.leaveChat = async () => {
    console.log('leaveChat called');
    window.setLoading(true, "Leaving Room...");
    if (state.chatChannel) await db.removeChannel(state.chatChannel);
    state.chatChannel = null;
    state.currentRoomId = null;
    state.roomGuestStatus = {};
    state.isChatChannelReady = false;
    window.nav('scr-lobby');
    window.loadRooms();
    window.setLoading(false);
  };

  window.handleLogin = async (e) => {
    console.log('handleLogin called');
    if (!e || !e.isTrusted) return;
    if (state.processingAction) return;
    state.processingAction = true;
    const em = $('l-email').value, p = $('l-pass').value;
    if (!em || !p) {
      window.toast("Input missing");
      state.processingAction = false;
      return;
    }
    window.setLoading(true, "Signing In...");
    localStorage.removeItem(FLAG_LOGOUT);
    const { error } = await db.auth.signInWithPassword({ email: em, password: p });
    console.log('signIn error:', error);
    if (error) {
      window.toast(error.message);
      window.setLoading(false);
    }
    state.processingAction = false;
  };

  window.handleRegister = async (e) => {
    console.log('handleRegister called');
    if (!e || !e.isTrusted) return;
    if (state.processingAction) return;
    state.processingAction = true;
    const n = $('r-name').value, em = $('r-email').value.trim().toLowerCase(), p = $('r-pass').value;
    if (!n || !em || p.length < 8) {
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
    console.log('mailApi response:', r, 'err:', err);
    if (r) {
      if (r.status === 429) {
        window.toast("Too many attempts. Wait a minute.");
        state.processingAction = false;
        window.setLoading(false);
        return;
      }
      const j = await r.json();
      console.log('mailApi json:', j);
      if (j.message === "Code sent") {
        sessionStorage.setItem('temp_reg', JSON.stringify({ n, em, p }));
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
    console.log('startVTimer called');
    let left = CONFIG.verificationCodeExpiry;
    if (state.vTimer) clearInterval(state.vTimer);
    state.vTimer = setInterval(() => {
      left--;
      $('v-timer').innerText = `${Math.floor(left/60)}:${(left%60).toString().padStart(2,'0')}`;
      if (left <= 0) {
        clearInterval(state.vTimer);
        window.nav('scr-register');
      }
    }, 1000);
  };

  window.handleVerify = async (e) => {
    console.log('handleVerify called');
    if (!e || !e.isTrusted) return;
    if (state.processingAction) return;
    state.processingAction = true;
    const code = $('v-code').value, temp = JSON.parse(sessionStorage.getItem('temp_reg'));
    console.log('code:', code, 'temp:', temp);
    if (!temp) {
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
    console.log('verify response status:', r.status);
    if (r.status === 429) {
      window.toast("Too many attempts.");
      state.processingAction = false;
      window.setLoading(false);
      return;
    }
    const j = await r.json();
    console.log('verify json:', j);
    if (j.message === "Verified") {
      localStorage.removeItem(FLAG_LOGOUT);
      const { error } = await db.auth.signUp({
        email: temp.em,
        password: temp.p,
        options: { data: { full_name: temp.n } }
      });
      console.log('signUp error:', error);
      if (error) {
        window.toast(error.message);
        window.setLoading(false);
      }
    } else {
      window.toast(j.message || "Wrong code");
      window.setLoading(false);
    }
    state.processingAction = false;
  };

  window.handleGuestLogin = async (e) => {
    console.log('handleGuestLogin called');
    if (!e || !e.isTrusted) return;
    if (state.processingAction) return;
    const nameInput = $('g-name');
    let name = nameInput.value.trim();
    const lockedName = localStorage.getItem(FLAG_GUEST_NAME);
    console.log('name:', name, 'lockedName:', lockedName);
    if (lockedName) name = lockedName;
    else {
      if (!name) return window.toast("Please enter a name.");
    }
    if (!lockedName) {
      window.openHub();
      window.showOverlayView('guest-warn');
    } else {
      await performGuestLogin(name);
    }
  };

  window.confirmGuestLoginAction = async (e) => {
    console.log('confirmGuestLoginAction called');
    if (!e || !e.isTrusted) return;
    const name = $('g-name').value.trim();
    if (!name) return;
    await performGuestLogin(name);
  };

  const performGuestLogin = async (name) => {
    console.log('performGuestLogin called with name:', name);
    window.closeOverlay();
    window.setLoading(true, "Initializing...");
    localStorage.removeItem(FLAG_LOGOUT);
    const { data: { user: existingUser } } = await db.auth.getUser();
    console.log('existingUser:', existingUser);
    if (existingUser && existingUser.is_anonymous) {
      const currentName = existingUser.user_metadata?.full_name;
      console.log('currentName:', currentName);
      if (!currentName || currentName !== name) {
        await db.auth.updateUser({ data: { full_name: name } });
        state.user = existingUser;
        state.user.user_metadata = state.user.user_metadata || {};
        state.user.user_metadata.full_name = name;
        console.log('user updated');
      } else {
        state.user = existingUser;
      }
      await db.from('profiles').upsert({ id: state.user.id, full_name: name, is_guest: true });
      localStorage.setItem(FLAG_GUEST_ID, state.user.id);
      localStorage.setItem(FLAG_GUEST_NAME, name);
      window.nav('scr-lobby');
      window.loadRooms();
      window.forceClaimMaster();
      window.setLoading(false);
      return;
    }
    const { data, error } = await db.auth.signInAnonymously();
    console.log('signInAnonymously data:', data, 'error:', error);
    if (error) {
      window.toast(error.message);
      window.setLoading(false);
      return;
    }
    if (data.user) {
      await db.auth.updateUser({ data: { full_name: name } });
      await db.from('profiles').upsert({ id: data.user.id, full_name: name, is_guest: true });
      state.user = data.user;
      state.user.user_metadata = state.user.user_metadata || {};
      state.user.user_metadata.full_name = name;
      localStorage.setItem(FLAG_GUEST_ID, state.user.id);
      localStorage.setItem(FLAG_GUEST_NAME, name);
      window.nav('scr-lobby');
      window.loadRooms();
      window.forceClaimMaster();
    }
    window.setLoading(false);
  };

  window.handleCreate = async (e) => {
    console.log('handleCreate called');
    if (!e || !e.isTrusted) return;
    if (state.serverFull) return window.toast("Network full");
    if (state.user?.is_anonymous) return window.toast("Guests cannot create rooms");
    if (state.processingAction) return;
    state.processingAction = true;
    const n = $('c-name').value, p = $('c-pass').value, isP = $('c-private').checked;
    console.log('room name:', n, 'pass:', p, 'isPrivate:', isP);
    if (isP && !p) {
      window.toast("Private rooms require a password");
      state.processingAction = false;
      return;
    }
    if (!n) {
      window.toast("Name required");
      state.processingAction = false;
      return;
    }
    window.setLoading(true, "Deploying Room...");
    const roomSalt = generateSalt();
    const { data, error } = await db.from('rooms').insert([{
      name: n,
      has_password: !!p,
      is_private: isP,
      salt: roomSalt,
      created_by: state.user.id
    }]).select();
    console.log('room insert data:', data, 'error:', error);
    if (error) {
      window.toast("Error: " + error.message);
      state.processingAction = false;
      window.setLoading(false);
      return;
    }
    if (data && data.length > 0) {
      const newRoom = data[0];
      if (p) {
        const accessHash = await sha256(p + roomSalt);
        await db.rpc('set_room_password', { p_room_id: newRoom.id, p_hash: accessHash });
        console.log('room password set');
      }
      state.lastCreated = newRoom;
      state.lastCreatedPass = p;
      $('s-id').innerText = newRoom.id;
      window.nav('scr-success');
    }
    state.processingAction = false;
    window.setLoading(false);
  };

  window.submitGate = async (e) => {
    console.log('submitGate called');
    if (!e || !e.isTrusted) return;
    const inputPass = $('gate-pass').value;
    const inputHash = await sha256(inputPass + state.pending.salt);
    console.log('inputHash:', inputHash);
    window.setLoading(true, "Verifying Access...");
    const { data, error } = await db.rpc('verify_room_password', {
      p_room_id: state.pending.id,
      p_hash: inputHash
    });
    console.log('verify_room_password data:', data, 'error:', error);
    window.setLoading(false);
    if (data === true) window.openVault(state.pending.id, state.pending.name, inputPass, state.pending.salt);
    else window.toast("Access Denied");
  };

  window.handleLogout = async (e) => {
    console.log('handleLogout called');
    if (!e || !e.isTrusted) return;
    window.setLoading(true, "Switching Account...");
    await cleanupPresence();
    await cleanupChatChannel();
    if (state.heartbeatInterval) clearInterval(state.heartbeatInterval);
    if (state.uptimeInterval) clearInterval(state.uptimeInterval);
    state.uptimeInterval = null;
    state.sessionStartTime = null;
    if (state.user && state.user.is_anonymous) {
      localStorage.setItem(FLAG_GUEST_ID, state.user.id);
      localStorage.setItem(FLAG_GUEST_NAME, state.user.user_metadata?.full_name);
      state.user = null;
      state.isMasterTab = false;
      localStorage.setItem(FLAG_LOGOUT, 'true');
      window.nav('scr-start');
      window.toast("Guest session saved.");
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
    console.log('copyId called');
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
    console.log('copySId called');
    navigator.clipboard.writeText(state.lastCreated.id);
    window.toast("ID Copied");
  };

  window.enterCreated = () => {
    console.log('enterCreated called');
    const pass = state.lastCreatedPass;
    window.openVault(state.lastCreated.id, state.lastCreated.name, pass, state.lastCreated.salt);
    state.lastCreatedPass = null;
  };

  let touchStartX = 0, touchEndX = 0;
  document.addEventListener('touchstart', e => {
    console.log('touchstart event');
    touchStartX = e.changedTouches[0].screenX;
  }, false);
  document.addEventListener('touchend', e => {
    console.log('touchend event');
    touchEndX = e.changedTouches[0].screenX;
    const active = document.querySelector('.screen.active');
    if (!active) return;
    const diff = touchEndX - touchStartX;
    if (active.id === 'scr-start' && diff < -50) window.nav('scr-guest', 'left');
    else if (active.id === 'scr-guest' && diff > 50) window.nav('scr-start', 'right');
  }, false);

  window.addEventListener('online', () => {
    console.log('online event');
    $('offline-screen').classList.remove('active');
    window.toast("Back online");
    if (state.user && state.isMasterTab) initPresence(true);
  });

  window.addEventListener('offline', () => {
    console.log('offline event');
    $('offline-screen').classList.add('active');
    updateOnlineDisplay(null);
    window.toast("Connection lost");
  });

  db.auth.onAuthStateChange(async (ev, ses) => {
    console.log('onAuthStateChange ev:', ev, 'ses:', ses);
    const isFlaggedLogout = localStorage.getItem(FLAG_LOGOUT) === 'true';
    if (isFlaggedLogout) {
      state.user = null;
      return;
    }
    state.user = ses?.user;
    const createBtn = $('icon-plus-lobby');
    const activeScreenId = document.querySelector('.screen.active')?.id;
    if (createBtn) createBtn.style.display = state.user?.is_anonymous && activeScreenId === 'scr-lobby' ? 'none' : 'flex';
    if (ev === 'SIGNED_IN') {
      if (state.user) {
        localStorage.setItem(FLAG_GUEST_ID, state.user.id);
        if (state.user.user_metadata?.full_name) localStorage.setItem(FLAG_GUEST_NAME, state.user.user_metadata.full_name);
        state.sessionStartTime = Date.now();
        if (state.uptimeInterval) clearInterval(state.uptimeInterval);
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
      await cleanupPresence();
      await cleanupChatChannel();
      localStorage.removeItem(FLAG_GUEST_ID);
      localStorage.removeItem(FLAG_GUEST_NAME);
      localStorage.removeItem(FLAG_LOGOUT);
      window.nav('scr-start');
    }
  });

  const init = async () => {
    console.log('init called');
    if (!navigator.onLine) $('offline-screen').classList.add('active');
    if (localStorage.getItem(FLAG_LOGOUT) === 'true') {
      state.user = null;
      window.nav('scr-start');
      window.setLoading(false);
      monitorConnection();
      return;
    }
    const { data: { session } } = await db.auth.getSession();
    console.log('getSession session:', session);
    if (session) {
      state.user = session.user;
      localStorage.setItem(FLAG_GUEST_ID, state.user.id);
      if (state.user.user_metadata?.full_name) localStorage.setItem(FLAG_GUEST_NAME, state.user.user_metadata.full_name);
      const masterExists = await checkMaster();
      console.log('masterExists:', masterExists);
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
      if (state.uptimeInterval) clearInterval(state.uptimeInterval);
      state.uptimeInterval = setInterval(updateUptime, 1000);
      console.log('uptimeInterval set');
    } else {
      $('guest-swipe-hint').style.display = 'flex';
    }
    lucide.createIcons();
    window.setLoading(false);
    monitorConnection();
  };

  init();
}
