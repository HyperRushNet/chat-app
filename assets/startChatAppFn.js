// assets/startChatAppFn.js | GH: HyperRushNet | 2026 | MIT License
// DEBUG MODE: alles wordt gelogd

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const debugEnabled = true; // Zet op false om logging uit te zetten

const debug = (...args) => {
  if (debugEnabled) {
    console.log('[DEBUG]', new Date().toISOString(), ...args);
  }
};

const debugError = (...args) => {
  if (debugEnabled) {
    console.error('[DEBUG ERROR]', new Date().toISOString(), ...args);
  }
};

export function startChatApp(customConfig = {}) {
  debug('startChatApp aangeroepen met config:', customConfig);

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
  debug('CONFIG samengesteld:', CONFIG);

  lucide.createIcons();
  debug('Lucide icons geïnitialiseerd');

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
  debug('State geïnitialiseerd, tabId:', state.tabId);

  const FLAG_LOGOUT = 'hrn_flag_force_logout';
  const FLAG_GUEST_NAME = 'hrn_flag_guest_name';
  const FLAG_GUEST_ID = 'hrn_flag_guest_id';

  let toastQueue = [];
  let toastVisible = false;

  const tabChannel = new BroadcastChannel('hrn_tab_sync');
  debug('BroadcastChannel aangemaakt: hrn_tab_sync');

  const db = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true },
    realtime: { params: { eventsPerSecond: 10 } }
  });
  debug('Supabase client aangemaakt');

  const esc = t => {
    const p = document.createElement('p');
    p.textContent = t;
    return p.innerHTML;
  };

  const $ = id => document.getElementById(id);

  const updateOnlineDisplay = (count) => {
    debug('updateOnlineDisplay aangeroepen met count:', count);
    if (typeof count === 'number') state.lastKnownOnlineCount = count;
    const displayCount = (typeof count === 'number') ? count : '--';
    document.querySelectorAll('.live-count').forEach(el => {
      if (el.innerText !== displayCount.toString()) {
        el.innerText = displayCount;
        debug('live-count bijgewerkt:', displayCount);
      }
    });
    const hubCount = $('hub-online-count');
    if (hubCount && hubCount.innerText !== displayCount.toString()) {
      hubCount.innerText = displayCount;
      debug('hub-online-count bijgewerkt:', displayCount);
    }
  };

  const updateUptime = () => {
    if (!state.sessionStartTime) return;
    const diff = Math.floor((Date.now() - state.sessionStartTime) / 1000);
    const mins = Math.floor(diff / 60).toString().padStart(2, '0');
    const secs = (diff % 60).toString().padStart(2, '0');
    const el = $('hub-uptime');
    if (el) {
      const newText = `${mins}:${secs}`;
      if (el.innerText !== newText) {
        el.innerText = newText;
        debug('Uptime bijgewerkt:', newText);
      }
    }
  };

  const processToastQueue = () => {
    if (toastVisible || toastQueue.length === 0) return;
    toastVisible = true;
    const msg = toastQueue.shift();
    debug('Toast getoond:', msg);
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
    debug('toast() aangeroepen met:', m);
    toastQueue.push(m);
    processToastQueue();
  };

  window.setLoading = (s, text = null) => {
    debug('setLoading aangeroepen:', s, text || 'Loading...');
    const loader = $('loader-overlay');
    const loaderText = $('loader-text');
    if (s) loader.classList.add('active');
    else loader.classList.remove('active');
    if (text) loaderText.innerText = text;
    else loaderText.innerText = "Loading...";
  };

  const safeAwait = async (promise) => {
    try {
      const result = await promise;
      debug('safeAwait succes:', result);
      return [result, null];
    } catch (error) {
      debugError('safeAwait error:', error);
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

  const workerBlob = new Blob([workerCode], { type: 'application/javascript' });
  const cryptoWorker = new Worker(URL.createObjectURL(workerBlob));
  debug('Crypto Web Worker gestart');

  const pendingCallbacks = {};

  cryptoWorker.onmessage = (e) => {
    const { type } = e.data;
    debug('Crypto worker bericht ontvangen, type:', type);
    if (pendingCallbacks[type]) {
      pendingCallbacks[type](e.data);
      delete pendingCallbacks[type];
    }
  };

  const generateSalt = () => {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    const salt = Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
    debug('generateSalt →', salt);
    return salt;
  };

  const sha256 = async (text) => {
    debug('sha256 aangeroepen voor tekst lengte:', text.length);
    const buffer = new TextEncoder().encode(text);
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    debug('sha256 resultaat:', hash);
    return hash;
  };

  const deriveKey = (pass, salt) => new Promise((resolve, reject) => {
    debug('deriveKey gestart met salt:', salt);
    pendingCallbacks['keyDerived'] = (data) => {
      if (data.success) {
        debug('deriveKey succesvol');
        resolve(true);
      } else {
        debugError('deriveKey mislukt');
        reject("Key derivation failed");
      }
    };
    cryptoWorker.postMessage({ type: 'deriveKey', payload: { password: pass, salt: salt } });
  });

  const encryptMessage = (text) => new Promise((resolve, reject) => {
    debug('encryptMessage aangeroepen, tekst lengte:', text.length);
    pendingCallbacks['encrypted'] = (data) => {
      if (data.result) {
        debug('encryptMessage succesvol, base64 lengte:', data.result.length);
        resolve(data.result);
      } else {
        debugError('encryptMessage mislukt');
        reject("Encryption failed");
      }
    };
    const time = new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
    cryptoWorker.postMessage({ type: 'encrypt', payload: { text: time + "|" + text } });
  });

  const cleanupPresence = async () => {
    debug('cleanupPresence gestart');
    if (state.presenceChannel) {
      try {
        await db.removeChannel(state.presenceChannel);
        debug('presenceChannel verwijderd');
      } catch (err) {
        debugError('fout bij verwijderen presenceChannel:', err);
      }
      state.presenceChannel = null;
    }
    state.isPresenceSubscribed = false;
    state.isConnecting = false;
    if (state.heartbeatInterval) {
      clearInterval(state.heartbeatInterval);
      state.heartbeatInterval = null;
      debug('heartbeatInterval gestopt');
    }
    updateOnlineDisplay(null);
    debug('cleanupPresence voltooid');
  };

  const cleanupChatChannel = async () => {
    debug('cleanupChatChannel gestart');
    if (state.chatChannel) {
      try {
        await db.removeChannel(state.chatChannel);
        debug('chatChannel verwijderd');
      } catch (err) {
        debugError('fout bij verwijderen chatChannel:', err);
      }
      state.chatChannel = null;
    }
    state.isChatChannelReady = false;
    debug('cleanupChatChannel voltooid');
  };

  const cleanupChannels = async () => {
    debug('cleanupChannels aangeroepen');
    await cleanupChatChannel();
  };

  const queryOnlineCountImmediately = async () => {
    debug('queryOnlineCountImmediately aangeroepen');
    if (!state.presenceChannel) {
      debug('geen presenceChannel → abort');
      return;
    }
    try {
      const presState = state.presenceChannel.presenceState();
      debug('presenceState ontvangen:', Object.keys(presState).length, 'keys');
      const allPresences = Object.values(presState).flat();
      const uniqueUserIds = new Set(allPresences.map(p => p.user_id));
      debug('unieke users gedetecteerd:', uniqueUserIds.size);
      updateOnlineDisplay(uniqueUserIds.size);

      if (uniqueUserIds.size > CONFIG.maxUsers) {
        if (!state.serverFull) {
          state.serverFull = true;
          debug('Server vol! Capaciteit overschreden:', uniqueUserIds.size);
          $('capacity-overlay').classList.add('active');
          await cleanupChannels();
        }
      } else {
        state.serverFull = false;
      }
    } catch (err) {
      debugError('fout in queryOnlineCountImmediately:', err);
    }
  };

  const initPresence = async (force = false) => {
    debug('initPresence aangeroepen, force:', force, 'masterTab:', state.isMasterTab, 'user aanwezig:', !!state.user);
    if (!state.isMasterTab || !state.user) {
      debug('initPresence afgebroken: geen master tab of geen user');
      return;
    }

    const now = Date.now();
    if (!force && state.isConnecting) {
      debug('initPresence afgebroken: al aan het connecten');
      return;
    }
    if (!force && (now - state.lastReconnectAttempt < CONFIG.reconnectDebounceMs)) {
      debug('initPresence afgebroken: debounce actief');
      return;
    }

    state.lastReconnectAttempt = now;
    state.isConnecting = true;

    await cleanupPresence();

    const myId = state.user.id;
    debug('Aanmaken presence channel met key:', myId);
    state.presenceChannel = db.channel('online-users', {
      config: { presence: { key: myId } }
    });

    state.presenceChannel
      .on('presence', { event: 'sync' }, () => {
        debug('Presence sync event ontvangen');
        if (!state.presenceChannel) return;
        queryOnlineCountImmediately();
      })
      .subscribe(async (status) => {
        debug('Presence subscribe status:', status);
        if (status === 'SUBSCRIBED') {
          state.isPresenceSubscribed = true;
          state.isConnecting = false;
          debug('Presence SUBSCRIBED → track starten');

          try {
            await state.presenceChannel.track({
              user_id: myId,
              online_at: new Date().toISOString(),
              tab_id: state.tabId
            });
            debug('Track succesvol uitgevoerd');
          } catch (err) {
            debugError('Track mislukt:', err);
          }

          await queryOnlineCountImmediately();

          if (state.heartbeatInterval) clearInterval(state.heartbeatInterval);
          state.heartbeatInterval = setInterval(async () => {
            if (state.presenceChannel && state.isMasterTab && !state.serverFull) {
              try {
                await state.presenceChannel.track({
                  user_id: myId,
                  online_at: new Date().toISOString(),
                  tab_id: state.tabId
                });
                debug('Heartbeat track succesvol');
              } catch (err) {
                debugError('Heartbeat track mislukt:', err);
              }
            }
          }, CONFIG.presenceHeartbeatMs);
          debug('Heartbeat interval gestart');

          setTimeout(async () => {
            await queryOnlineCountImmediately();
            debug('Force count na 800ms');
          }, 800);
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          debug('Presence kanaal gesloten/fout:', status);
          state.isPresenceSubscribed = false;
          state.isConnecting = false;
          updateOnlineDisplay(null);
        }
      });
  };

  const monitorConnection = () => {
    debug('monitorConnection interval gestart');
    setInterval(() => {
      debug('monitorConnection tick');
      if (!navigator.onLine) {
        debug('Geen internet → offline scherm aan');
        $('offline-screen').classList.add('active');
        state.isPresenceSubscribed = false;
        updateOnlineDisplay(null);
        return;
      }

      $('offline-screen').classList.remove('active');

      if (!state.user || !state.isMasterTab) {
        debug('Geen user of geen master tab → skip');
        return;
      }

      const wsState = db.realtime.connectionState();
      debug('Realtime WS state:', wsState);

      if ((wsState === 'disconnected' || wsState === 'stopped') && !state.isConnecting) {
        debug('WS disconnected/stopped → initPresence(true)');
        initPresence(true);
      }

      if (!state.isPresenceSubscribed && !state.isConnecting && !state.serverFull) {
        debug('Presence niet subscribed → herstart na 1200ms');
        setTimeout(() => {
          if (!state.isPresenceSubscribed && !state.isConnecting && !state.serverFull) {
            initPresence(true);
          }
        }, 1200);
      }

      if (state.lastKnownOnlineCount === null && state.isPresenceSubscribed && !state.isConnecting && !state.serverFull) {
        debug('Count nog null → force query na 1000ms');
        setTimeout(queryOnlineCountImmediately, 1000);
      }
    }, 4000);
  };

  // ... (de rest van de functies blijven hetzelfde, maar met debug logs waar nuttig)

  window.handleLogout = async (e) => {
    if (!e || !e.isTrusted) return;
    debug('handleLogout gestart');
    window.setLoading(true, "Switching Account...");
    await cleanupPresence();
    await cleanupChatChannel();
    state.currentRoomId = null;
    state.roomGuestStatus = {};
    state.sessionStartTime = null;
    try {
      const { error } = await db.auth.signOut({ scope: 'local' });
      if (error) debugError('signOut error:', error);
      else debug('signOut succesvol');
    } catch (err) {
      debugError('signOut exception:', err);
    }
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
      window.nav('scr-start');
    }
    window.setLoading(false);
    debug('handleLogout voltooid');
  };

  // Voeg debug toe aan andere kritieke plekken indien nodig, bijvoorbeeld:
  db.auth.onAuthStateChange(async (ev, ses) => {
    debug('Auth state change:', ev, 'session aanwezig:', !!ses);
    // ... rest van de code
  });

  const init = async () => {
    debug('init() gestart');
    if (!navigator.onLine) {
      debug('Offline bij opstart → offline scherm');
      $('offline-screen').classList.add('active');
    }
    if (localStorage.getItem(FLAG_LOGOUT) === 'true') {
      debug('Force logout flag aanwezig → start scherm');
      state.user = null;
      window.nav('scr-start');
      window.setLoading(false);
      monitorConnection();
      return;
    }
    const { data: { session } } = await db.auth.getSession();
    debug('Sessiestatus bij init:', session ? 'bestaat' : 'geen sessie');
    if (session) {
      state.user = session.user;
      localStorage.setItem(FLAG_GUEST_ID, state.user.id);
      if (state.user.user_metadata?.full_name) localStorage.setItem(FLAG_GUEST_NAME, state.user.user_metadata.full_name);
      const masterExists = await checkMaster();
      debug('Master tab bestaat elders:', masterExists);
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
      await new Promise(r => setTimeout(r, 400));
      debug('init → presence starten');
      initPresence(true);
    } else {
      debug('Geen sessie → guest swipe hint');
      $('guest-swipe-hint').style.display = 'flex';
    }
    lucide.createIcons();
    window.setLoading(false);
    monitorConnection();
    debug('init() voltooid');
  };

  init();
}
