// assets/startChatAppFn.js | GH: HyperRushNet | 2026 | MIT License
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

export function startChatApp(customConfig = {}) {
  // ────────────────────────────────────────────────
  //  Config + Defaults
  // ────────────────────────────────────────────────
  const CONFIG = Object.freeze({
    supabaseUrl: customConfig.supabaseUrl || "https://fahbqdajxnhswevdagdn.supabase.co",
    supabaseKey: customConfig.supabaseKey || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZhaGJxZGFqeG5oc3dldmRhZ2RuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NTEyODEsImV4cCI6MjA4NjEyNzI4MX0.UPgPxyaWBULjH4jL8UaSr6bJXTsFWWJRIYodHmXeVTI",
    mailApi: customConfig.mailApi || "https://vercel-serverless-gray-sigma.vercel.app/api/mailAPI",
    maxUsers: Number.isInteger(customConfig.maxUsers) && customConfig.maxUsers > 0 ? customConfig.maxUsers : 475,
    maxMessages: Number.isInteger(customConfig.maxMessages) && customConfig.maxMessages > 0 ? customConfig.maxMessages : 15,
    historyLoadLimit: Number.isInteger(customConfig.historyLoadLimit) && customConfig.historyLoadLimit > 0 ? customConfig.historyLoadLimit : 10,
    rateLimitMs: Number.isInteger(customConfig.rateLimitMs) && customConfig.rateLimitMs >= 300 ? customConfig.rateLimitMs : 1000,
    presenceHeartbeatMs: Number.isInteger(customConfig.presenceHeartbeatMs) && customConfig.presenceHeartbeatMs >= 5000 ? customConfig.presenceHeartbeatMs : 10000,
    reconnectDebounceMs: Number.isInteger(customConfig.reconnectDebounceMs) && customConfig.reconnectDebounceMs >= 1000 ? customConfig.reconnectDebounceMs : 3000,
    verificationCodeExpiry: Number.isInteger(customConfig.verificationCodeExpiry) && customConfig.verificationCodeExpiry >= 60 ? customConfig.verificationCodeExpiry : 600,
  });

  // ────────────────────────────────────────────────
  //  Global state –尽量减少可变状态，尽量用 const/let 局部化
  // ────────────────────────────────────────────────
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
    pendingRoom: null,
    lastCreatedRoom: null,
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
    cryptoWorker: null,
    pendingCallbacks: {},
  };

  // Flags & constants
  const FLAG_LOGOUT     = 'hrn_flag_force_logout';
  const FLAG_GUEST_NAME = 'hrn_flag_guest_name';
  const FLAG_GUEST_ID   = 'hrn_flag_guest_id';

  let toastQueue = [];
  let toastVisible = false;

  const tabChannel = new BroadcastChannel('hrn_tab_sync');
  const db = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: false },
    realtime: { params: { eventsPerSecond: 8 } }
  });

  // ────────────────────────────────────────────────
  //  Utility functions
  // ────────────────────────────────────────────────
  const $ = id => document.getElementById(id) || null;

  const esc = text => {
    if (typeof text !== 'string') return '';
    const p = document.createElement('p');
    p.textContent = text;
    return p.innerHTML;
  };

  const safeAwait = async (promise) => {
    try {
      return [await promise, null];
    } catch (err) {
      return [null, err];
    }
  };

  const updateOnlineDisplay = (count = null) => {
    if (typeof count === 'number' && count >= 0) {
      state.lastKnownOnlineCount = count;
    }
    const display = (typeof state.lastKnownOnlineCount === 'number') ? state.lastKnownOnlineCount : '—';
    document.querySelectorAll('.live-count, #hub-online-count').forEach(el => {
      if (el.textContent !== display) el.textContent = display;
    });
  };

  const updateUptime = () => {
    if (!state.sessionStartTime) return;
    const diff = Math.floor((Date.now() - state.sessionStartTime) / 1000);
    const mins = Math.floor(diff / 60).toString().padStart(2, '0');
    const secs = (diff % 60).toString().padStart(2, '0');
    const el = $('hub-uptime');
    if (el) el.textContent = `${mins}:${secs}`;
  };

  const showToast = (message) => {
    if (typeof message !== 'string' || !message.trim()) return;
    toastQueue.push(message.trim());
    processToastQueue();
  };

  const processToastQueue = () => {
    if (toastVisible || toastQueue.length === 0) return;
    toastVisible = true;
    const msg = toastQueue.shift();
    const container = $('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast-item';
    toast.textContent = msg;
    toast.onclick = () => {
      toast.style.opacity = '0';
      setTimeout(() => {
        toast.remove();
        toastVisible = false;
        processToastQueue();
      }, 400);
    };

    container.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.opacity = '0';
        setTimeout(() => {
          if (toast.parentNode) toast.remove();
          toastVisible = false;
          processToastQueue();
        }, 400);
      }
    }, 3400);
  };

  window.toast = showToast;

  window.setLoading = (active, text = 'Loading...') => {
    const overlay = $('loader-overlay');
    const txtEl = $('loader-text');
    if (!overlay || !txtEl) return;
    if (active) {
      overlay.classList.add('active');
      txtEl.textContent = text;
    } else {
      overlay.classList.remove('active');
    }
  };

  // ────────────────────────────────────────────────
  //  Crypto Worker
  // ────────────────────────────────────────────────
  const workerCode = `self.onmessage = async e => {
    const {type, payload, id} = e.data;
    try {
      if (type === 'deriveKey') {
        const keyMat = await crypto.subtle.importKey('raw', new TextEncoder().encode(payload.password), {name:'PBKDF2'}, false, ['deriveKey']);
        const key = await crypto.subtle.deriveKey(
          {name:'PBKDF2', salt: new TextEncoder().encode(payload.salt), iterations: 300_000, hash:'SHA-256'},
          keyMat, {name:'AES-GCM', length:256}, true, ['encrypt','decrypt']
        );
        self.cryptoKey = key;
        self.postMessage({id, type:'keyDerived', success:true});
      }
      else if (type === 'encrypt') {
        if (!self.cryptoKey) throw new Error("no key");
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const data = new TextEncoder().encode(payload.text);
        const ct = await crypto.subtle.encrypt({name:'AES-GCM', iv}, self.cryptoKey, data);
        const combined = new Uint8Array(iv.byteLength + ct.byteLength);
        combined.set(iv);
        combined.set(new Uint8Array(ct), iv.byteLength);
        self.postMessage({id, type:'encrypted', result: btoa(String.fromCharCode(...combined))});
      }
      else if (type === 'decryptHistory') {
        if (!self.cryptoKey) throw new Error("no key");
        const results = [];
        for (const msg of payload.messages) {
          try {
            const bin = atob(msg.content);
            const bytes = Uint8Array.from(bin, c=>c.charCodeAt(0));
            const iv = bytes.subarray(0,12);
            const ct  = bytes.subarray(12);
            const dec = await crypto.subtle.decrypt({name:'AES-GCM',iv}, self.cryptoKey, ct);
            const txt = new TextDecoder().decode(dec);
            const [time, ...rest] = txt.split('|');
            results.push({id:msg.id, time, text:rest.join('|'), user_id:msg.user_id, user_name:msg.user_name, created_at:msg.created_at});
          } catch {
            results.push({id:msg.id, error:true});
          }
        }
        self.postMessage({id, type:'historyDecrypted', results});
      }
      else if (type === 'decryptSingle') {
        if (!self.cryptoKey) throw new Error("no key");
        const bin = atob(payload.content);
        const bytes = Uint8Array.from(bin, c=>c.charCodeAt(0));
        const iv = bytes.subarray(0,12);
        const ct  = bytes.subarray(12);
        const dec = await crypto.subtle.decrypt({name:'AES-GCM',iv}, self.cryptoKey, ct);
        const txt = new TextDecoder().decode(dec);
        const [time, ...rest] = txt.split('|');
        self.postMessage({id, type:'singleDecrypted', result:{time, text:rest.join('|')}});
      }
    } catch (err) {
      self.postMessage({id, type:'error', message:err.message});
    }
  };`;

  const blob = new Blob([workerCode], {type: 'application/javascript'});
  state.cryptoWorker = new Worker(URL.createObjectURL(blob));

  state.cryptoWorker.onmessage = e => {
    const {id, type, ...rest} = e.data;
    if (state.pendingCallbacks[id]) {
      state.pendingCallbacks[id]({type, ...rest});
      delete state.pendingCallbacks[id];
    }
  };

  const sendToWorker = (type, payload) => new Promise((resolve, reject) => {
    const id = crypto.randomUUID();
    state.pendingCallbacks[id] = data => {
      if (data.type === 'error') reject(new Error(data.message || 'worker error'));
      else if (data.type.includes('Decrypted') || data.type === 'encrypted' || data.type === 'keyDerived') resolve(data);
      else reject(new Error('unexpected worker response'));
    };
    state.cryptoWorker.postMessage({type, payload, id});
  });

  const deriveKey = (password, salt) => sendToWorker('deriveKey', {password, salt});
  const encryptMessage = async text => {
    const time = new Date().toLocaleTimeString('en-GB', {hour:'2-digit', minute:'2-digit'});
    const {result} = await sendToWorker('encrypt', {text: time + '|' + text});
    return result;
  };

  // ────────────────────────────────────────────────
  //  Channel & Presence
  // ────────────────────────────────────────────────
  const cleanupChannels = async () => {
    const tasks = [];
    if (state.presenceChannel) {
      tasks.push(db.removeChannel(state.presenceChannel).catch(() => {}));
      state.presenceChannel = null;
      state.isPresenceSubscribed = false;
    }
    if (state.chatChannel) {
      tasks.push(db.removeChannel(state.chatChannel).catch(() => {}));
      state.chatChannel = null;
      state.isChatChannelReady = false;
    }
    if (state.heartbeatInterval) {
      clearInterval(state.heartbeatInterval);
      state.heartbeatInterval = null;
    }
    await Promise.allSettled(tasks);
  };

  const queryOnlineCountImmediately = () => {
    if (!state.presenceChannel) return;
    const presence = state.presenceChannel.presenceState();
    const users = new Set(Object.values(presence).flat().map(p => p.user_id));
    const count = users.size;
    updateOnlineDisplay(count);

    if (count > CONFIG.maxUsers && !state.serverFull) {
      state.serverFull = true;
      $('capacity-overlay')?.classList.add('active');
      cleanupChannels();
      showToast("Server capacity reached");
    } else if (count <= CONFIG.maxUsers && state.serverFull) {
      state.serverFull = false;
      $('capacity-overlay')?.classList.remove('active');
    }
  };

  const initPresence = async (force = false) => {
    if (!state.isMasterTab || !state.user?.id || state.serverFull) return;
    const now = Date.now();
    if (!force && (state.isConnecting || (now - state.lastReconnectAttempt < CONFIG.reconnectDebounceMs))) return;

    state.lastReconnectAttempt = now;
    state.isConnecting = true;

    await cleanupChannels();

    state.presenceChannel = db.channel('online-users', {
      config: { presence: { key: state.user.id } }
    });

    state.presenceChannel
      .on('presence', { event: 'sync' }, queryOnlineCountImmediately)
      .subscribe(async (status, err) => {
        if (status === 'SUBSCRIBED') {
          state.isPresenceSubscribed = true;
          state.isConnecting = false;
          await state.presenceChannel.track({
            user_id: state.user.id,
            online_at: new Date().toISOString(),
            tab: state.tabId
          });
          queryOnlineCountImmediately();

          state.heartbeatInterval = setInterval(async () => {
            if (state.presenceChannel && state.isMasterTab && !state.serverFull) {
              await state.presenceChannel.track({
                user_id: state.user.id,
                online_at: new Date().toISOString(),
                tab: state.tabId
              }).catch(()=>{});
            }
          }, CONFIG.presenceHeartbeatMs);
        } else if (['CLOSED','CHANNEL_ERROR','TIMED_OUT'].includes(status)) {
          state.isPresenceSubscribed = false;
          state.isConnecting = false;
          updateOnlineDisplay(null);
          if (!state.serverFull) setTimeout(() => initPresence(true), 4000);
        }
      });
  };

  // ────────────────────────────────────────────────
  //  Tab / Master logic
  // ────────────────────────────────────────────────
  const checkMaster = () => new Promise(resolve => {
    let found = false;
    const handler = ev => {
      if (ev.data?.type === 'PONG_MASTER') found = true;
    };
    tabChannel.addEventListener('message', handler);
    tabChannel.postMessage({type: 'PING_MASTER'});
    setTimeout(() => {
      tabChannel.removeEventListener('message', handler);
      resolve(found);
    }, 400);
  });

  tabChannel.onmessage = ev => {
    if (!ev.data?.type) return;

    if (ev.data.type === 'CLAIM_MASTER' && ev.data.id !== state.tabId) {
      if (state.isMasterTab) {
        cleanupChannels();
        state.isMasterTab = false;
        state.isPresenceSubscribed = false;
        updateOnlineDisplay(null);
        const overlay = $('block-overlay');
        if (overlay) {
          overlay.innerHTML = `
            <i data-lucide="log-out" style="width:48px;height:48px;margin-bottom:24px;color:var(--danger)"></i>
            <h1 class="title">Session Moved</h1>
            <p class="subtitle" style="margin-bottom:48px">Activity detected in another tab.</p>
            <button class="btn btn-accent" onclick="window.forceClaimMaster()">Take control here</button>
          `;
          overlay.classList.add('active');
          lucide.createIcons();
        }
      }
    }

    if (ev.data.type === 'PING_MASTER' && state.isMasterTab) {
      tabChannel.postMessage({type: 'PONG_MASTER'});
    }
  };

  window.forceClaimMaster = () => {
    if (state.isMasterTab) return;
    state.isMasterTab = true;
    tabChannel.postMessage({type: 'CLAIM_MASTER', id: state.tabId});
    $('block-overlay')?.classList.remove('active');
    if (state.user && localStorage.getItem(FLAG_LOGOUT) !== 'true') {
      initPresence(true);
    }
  };

  // ────────────────────────────────────────────────
  //  Room & Chat logic
  // ────────────────────────────────────────────────
  const getDateLabel = date => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const d = new Date(date);
    const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((today - target) / 86400000);

    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays < 7) return d.toLocaleDateString('en-GB', {weekday: 'long'});
    return d.toLocaleDateString('en-GB', {day:'2-digit', month:'short'});
  };

  const processText = text => {
    if (typeof text !== 'string') return '';
    let safe = esc(text);
    safe = safe.replace(/(https?:\/\/[^\s<>"']+)/g, url => {
      const clean = url.replace(/[<>"']/g, '');
      return `<a href="${clean}" target="_blank" rel="noopener noreferrer" class="chat-link">${clean}</a>`;
    });
    return safe;
  };

  const renderMsg = (msg, prepend = false) => {
    if (!msg?.created_at) return '';

    const msgDate = new Date(msg.created_at);
    let html = '';

    const label = getDateLabel(msgDate);
    if (!prepend && label !== state.lastRenderedDateLabel) {
      html += `<div class="date-divider"><span class="date-label">${label}</span></div>`;
      state.lastRenderedDateLabel = label;
    } else if (prepend) {
      html += `<div class="date-divider"><span class="date-label">${label}</span></div>`;
      state.lastRenderedDateLabel = label;
    }

    const isMe = msg.user_id === state.user?.id;
    const isGuest = !!state.roomGuestStatus[msg.user_id];
    const displayName = isGuest && msg.user_name ? msg.user_name : msg.user_name || '—';
    const guestPill = isGuest ? '<span class="guest-pill">Guest</span>' : '';

    html += `
      <div class="msg ${isMe ? 'me' : ''}" data-time="${msg.created_at}">
        <span class="msg-user" onclick="window.inspectUser('${msg.user_id}')">${esc(displayName)}${guestPill}</span>
        <div>${processText(msg.text)}</div>
        <span class="msg-time">${esc(msg.time || '—')}</span>
      </div>`;

    return html;
  };

  const checkChatEmpty = () => {
    const container = $('chat-messages');
    const empty = $('chat-empty-state');
    if (!container || !empty) return;
    empty.style.display = container.querySelector('.msg') ? 'none' : 'flex';
  };

  const fetchGuestStatuses = async userIds => {
    if (!Array.isArray(userIds) || userIds.length === 0) return;
    const unique = [...new Set(userIds.filter(Boolean))];
    if (unique.length === 0) return;

    const {data, error} = await db.from('profiles')
      .select('id, is_guest')
      .in('id', unique);

    if (error || !data) return;

    data.forEach(p => {
      state.roomGuestStatus[p.id] = !!p.is_guest;
    });
  };

  // ────────────────────────────────────────────────
  //  History loading
  // ────────────────────────────────────────────────
  const loadMoreHistory = async () => {
    if (!state.currentRoomId || !state.oldestMessageTimestamp || state.isLoadingHistory || !state.hasMoreHistory) return;

    state.isLoadingHistory = true;
    const container = $('chat-messages');
    if (!container) return;

    const prevHeight = container.scrollHeight;
    container.insertAdjacentHTML('afterbegin', '<div class="history-loader">Loading older messages…</div>');

    const {data, error} = await db.from('messages')
      .select('*')
      .eq('room_id', state.currentRoomId)
      .lt('created_at', state.oldestMessageTimestamp)
      .order('created_at', {ascending: false})
      .limit(CONFIG.historyLoadLimit);

    document.querySelector('.history-loader')?.remove();

    if (error || !data || data.length === 0) {
      state.hasMoreHistory = false;
      state.isLoadingHistory = false;
      return;
    }

    data.reverse();
    state.oldestMessageTimestamp = data[0]?.created_at ?? null;

    const {results} = await sendToWorker('decryptHistory', {messages: data}).catch(() => ({results:[]}));

    const valid = results.filter(m => !m.error);
    if (valid.length === 0) {
      state.isLoadingHistory = false;
      return;
    }

    await fetchGuestStatuses(valid.map(m => m.user_id));

    let html = '';
    let prevLabel = null;
    const firstVisibleTime = container.querySelector('.msg')?.getAttribute('data-time');
    const firstVisibleLabel = firstVisibleTime ? getDateLabel(new Date(firstVisibleTime)) : null;

    valid.forEach((m, i) => {
      const lbl = getDateLabel(new Date(m.created_at));
      if (lbl !== prevLabel) {
        if (i === valid.length - 1 && lbl === firstVisibleLabel) {
          // avoid duplicate divider
        } else {
          html += `<div class="date-divider"><span class="date-label">${lbl}</span></div>`;
        }
        prevLabel = lbl;
      }
      html += renderMsg(m, true);
    });

    container.insertAdjacentHTML('afterbegin', html);

    // maintain scroll position
    const newHeight = container.scrollHeight;
    container.scrollTop = newHeight - prevHeight;

    state.isLoadingHistory = false;
  };

  const handleScroll = () => {
    const c = $('chat-messages');
    if (!c) return;
    if (c.scrollTop < 80 && !state.isLoadingHistory && state.hasMoreHistory) {
      loadMoreHistory();
    }
  };

  // ────────────────────────────────────────────────
  //  Room entry / vault
  // ────────────────────────────────────────────────
  window.openVault = async (roomId, roomName, password = null, roomSalt) => {
    if (!state.user || !roomId || typeof roomName !== 'string') {
      showToast("Invalid room or not logged in");
      return;
    }

    window.setLoading(true, "Preparing room…");

    await cleanupChannels();

    state.currentRoomId = roomId;
    state.lastRenderedDateLabel = null;
    state.roomGuestStatus = {};
    state.oldestMessageTimestamp = null;
    state.hasMoreHistory = true;
    state.isLoadingHistory = false;

    const titleEl = $('chat-title');
    if (titleEl) titleEl.textContent = roomName;

    const messagesEl = $('chat-messages');
    if (messagesEl) {
      messagesEl.innerHTML = `
        <div id="chat-empty-state" class="empty-state">
          <i data-lucide="message-circle" class="empty-state-icon"></i>
          <div class="empty-state-title">No messages yet</div>
          <div class="empty-state-sub">Start the conversation.</div>
        </div>`;
      messagesEl.onscroll = handleScroll;
    }

    const keyMaterial = password ? password + roomId : roomId;

    try {
      await deriveKey(keyMaterial, roomSalt);
    } catch (err) {
      window.setLoading(false);
      showToast("Failed to initialize encryption");
      return;
    }

    window.setLoading(true, "Loading recent messages…");

    const {data: recent} = await db.from('messages')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', {ascending: false})
      .limit(CONFIG.maxMessages);

    const isGuest = !!state.user?.is_anonymous;
    $('guest-info-chat')?.style.setProperty('display', isGuest ? 'flex' : 'none');
    $('chat-input')?.style.setProperty('display', isGuest ? 'none' : 'block');
    $('guest-replies')?.style.setProperty('display', isGuest ? 'flex' : 'none');
    $('send-btn')?.style.setProperty('display', isGuest ? 'none' : 'flex');

    window.nav('scr-chat');

    if (!recent || recent.length === 0) {
      state.hasMoreHistory = false;
      checkChatEmpty();
      window.setLoading(false);
    } else {
      state.oldestMessageTimestamp = recent[recent.length - 1]?.created_at ?? null;
      recent.reverse();

      window.setLoading(true, "Decrypting…");

      try {
        const {results} = await sendToWorker('decryptHistory', {messages: recent});
        const valid = results.filter(m => !m.error);
        if (valid.length > 0) {
          await fetchGuestStatuses(valid.map(m => m.user_id));
          const container = $('chat-messages');
          container.innerHTML = '';
          valid.forEach(m => {
            container.insertAdjacentHTML('beforeend', renderMsg(m));
          });
          container.scrollTop = container.scrollHeight;
        }
        checkChatEmpty();
      } catch {
        showToast("Some messages could not be decrypted");
      }
      window.setLoading(false);
    }

    // ─── Realtime ───────────────────────────────────────
    state.chatChannel = db.channel(`room_chat_${roomId}`, {
      config: { broadcast: { self: true } }
    });

    state.chatChannel.on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `room_id=eq.${roomId}`
    }, async payload => {
      const msg = payload.new;
      if (!msg?.content || state.currentRoomId !== roomId) return;

      try {
        const {result} = await sendToWorker('decryptSingle', {content: msg.content});
        await fetchGuestStatuses([msg.user_id]);
        const fullMsg = {
          ...msg,
          time: result.time,
          text: result.text
        };
        const container = $('chat-messages');
        container.insertAdjacentHTML('beforeend', renderMsg(fullMsg));
        container.scrollTop = container.scrollHeight;
        checkChatEmpty();
      } catch {
        // silent fail – don't block realtime
      }
    }).subscribe(status => {
      state.isChatChannelReady = status === 'SUBSCRIBED';
    });
  };

  // ────────────────────────────────────────────────
  //  Sending messages
  // ────────────────────────────────────────────────
  const canSendMessage = () => {
    if (state.processingAction) return false;
    if (!state.user || !state.currentRoomId) return false;
    if (!state.isChatChannelReady) {
      showToast("Connection not ready – wait a moment");
      return false;
    }
    const now = Date.now();
    if (now - state.lastMessageTime < CONFIG.rateLimitMs) {
      const wait = CONFIG.rateLimitMs - (now - state.lastMessageTime);
      $('chat-input-area')?.classList.add('rate-limited');
      setTimeout(() => $('chat-input-area')?.classList.remove('rate-limited'), wait + 100);
      showToast(`Please wait ${Math.ceil(wait/1000)}s`);
      return false;
    }
    return true;
  };

  window.sendMsg = async e => {
    if (!e?.isTrusted) return;
    if (!canSendMessage()) return;

    state.processingAction = true;
    const input = $('chat-input');
    const text = input?.value?.trim();
    if (!text) {
      state.processingAction = false;
      return;
    }

    input.value = '';
    state.lastMessageTime = Date.now();

    try {
      const encrypted = await encryptMessage(text);
      const {error} = await db.from('messages').insert({
        room_id: state.currentRoomId,
        user_id: state.user.id,
        user_name: state.user.user_metadata?.full_name || 'User',
        content: encrypted
      });

      if (error) throw error;
    } catch {
      showToast("Message could not be sent");
    } finally {
      state.processingAction = false;
    }
  };

  // ────────────────────────────────────────────────
  //  Guest / Auth flows
  // ────────────────────────────────────────────────
  const performGuestLogin = async name => {
    if (typeof name !== 'string' || !name.trim()) {
      showToast("Name is required");
      return;
    }
    name = name.trim();

    window.setLoading(true, "Starting guest session…");
    localStorage.removeItem(FLAG_LOGOUT);

    try {
      let user = (await db.auth.getUser()).data.user;

      if (user?.is_anonymous) {
        if (user.user_metadata?.full_name !== name) {
          await db.auth.updateUser({data: {full_name: name}});
          user.user_metadata = user.user_metadata || {};
          user.user_metadata.full_name = name;
        }
      } else {
        const {data, error} = await db.auth.signInAnonymously();
        if (error) throw error;
        user = data.user;
        await db.auth.refreshSession();
        const fresh = await db.auth.getSession();
        user = fresh.data.session?.user || user;
        await db.auth.updateUser({data: {full_name: name}});
      }

      const {error: profileErr} = await db.from('profiles').upsert({
        id: user.id,
        full_name: name,
        is_guest: true
      }, {onConflict: 'id'});

      if (profileErr) console.warn("profile upsert failed", profileErr);

      state.user = user;
      state.user.user_metadata = state.user.user_metadata || {};
      state.user.user_metadata.full_name = name;

      localStorage.setItem(FLAG_GUEST_ID, user.id);
      localStorage.setItem(FLAG_GUEST_NAME, name);

      window.nav('scr-lobby');
      await window.loadRooms();
      await new Promise(r => setTimeout(r, 600));
      window.forceClaimMaster();
    } catch (err) {
      showToast("Guest login failed – try again");
      console.error(err);
    } finally {
      window.setLoading(false);
    }
  };

  window.handleGuestLogin = async e => {
    if (!e?.isTrusted) return;
    const nameEl = $('g-name');
    const name = nameEl?.value?.trim();
    const locked = localStorage.getItem(FLAG_GUEST_NAME);

    if (locked) {
      await performGuestLogin(locked);
    } else if (name) {
      window.openHub();
      window.showOverlayView('guest-warn');
    } else {
      showToast("Please enter a name");
    }
  };

  window.confirmGuestLoginAction = async () => {
    const name = $('g-name')?.value?.trim();
    if (name) await performGuestLogin(name);
  };

  // ────────────────────────────────────────────────
  //  Init & lifecycle
  // ────────────────────────────────────────────────
  const init = async () => {
    if (!navigator.onLine) $('offline-screen')?.classList.add('active');

    if (localStorage.getItem(FLAG_LOGOUT) === 'true') {
      state.user = null;
      window.nav('scr-start');
      window.setLoading(false);
      monitorConnection();
      return;
    }

    window.setLoading(true, "Restoring session…");

    const {data: {session}} = await db.auth.getSession();

    if (session?.user) {
      state.user = session.user;
      localStorage.setItem(FLAG_GUEST_ID, state.user.id);
      if (state.user.user_metadata?.full_name) {
        localStorage.setItem(FLAG_GUEST_NAME, state.user.user_metadata.full_name);
      }

      const hasOtherMaster = await checkMaster();

      if (hasOtherMaster) {
        $('block-overlay')?.classList.add('active');
        lucide.createIcons();
      } else {
        window.forceClaimMaster();
      }

      window.nav('scr-lobby');
      await window.loadRooms();

      state.sessionStartTime = Date.now();
      state.uptimeInterval = setInterval(updateUptime, 1000);
    } else {
      $('guest-swipe-hint')?.style.setProperty('display', 'flex');
    }

    lucide.createIcons();
    window.setLoading(false);
    monitorConnection();
  };

  // Start everything
  init();

  // Keepalive / connection monitor
  const monitorConnection = () => {
    setInterval(() => {
      if (!navigator.onLine) {
        $('offline-screen')?.classList.add('active');
        state.isPresenceSubscribed = false;
        updateOnlineDisplay(null);
        return;
      }

      $('offline-screen')?.classList.remove('active');

      if (!state.user || !state.isMasterTab || state.serverFull) return;

      const ws = db.realtime.connectionState();
      if ((ws === 'disconnected' || ws === 'stopped') && !state.isConnecting) {
        initPresence(true);
      }

      if (state.lastKnownOnlineCount === null && state.isPresenceSubscribed && !state.isConnecting && !state.serverFull) {
        setTimeout(queryOnlineCountImmediately, 1200);
      }
    }, 6000);
  };

  window.addEventListener('online', () => {
    $('offline-screen')?.classList.remove('active');
    showToast("Connection restored");
    if (state.user && state.isMasterTab) initPresence(true);
  });

  window.addEventListener('offline', () => {
    $('offline-screen')?.classList.add('active');
    updateOnlineDisplay(null);
    showToast("Offline");
  });

  window.addEventListener('beforeunload', () => {
    tabChannel.postMessage({type: 'CLAIM_MASTER', id: state.tabId});
  });

  db.auth.onAuthStateChange(async (event, session) => {
    if (localStorage.getItem(FLAG_LOGOUT) === 'true') {
      state.user = null;
      return;
    }

    state.user = session?.user ?? null;

    if (event === 'SIGNED_IN' && state.user) {
      state.sessionStartTime = Date.now();
      if (state.uptimeInterval) clearInterval(state.uptimeInterval);
      state.uptimeInterval = setInterval(updateUptime, 1000);

      const screens = ['scr-start','scr-login','scr-register','scr-verify'];
      if (screens.includes(document.querySelector('.screen.active')?.id)) {
        window.nav('scr-lobby');
        await window.loadRooms();
        window.forceClaimMaster();
      }
    }

    if (event === 'SIGNED_OUT') {
      if (state.heartbeatInterval) clearInterval(state.heartbeatInterval);
      if (state.uptimeInterval) clearInterval(state.uptimeInterval);
      state.uptimeInterval = null;
      state.sessionStartTime = null;
      await cleanupChannels();
      localStorage.removeItem(FLAG_GUEST_ID);
      localStorage.removeItem(FLAG_GUEST_NAME);
      localStorage.removeItem(FLAG_LOGOUT);
      window.nav('scr-start');
    }
  });
}
