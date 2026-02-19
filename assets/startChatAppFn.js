// assets/startChatAppFn.js | GH: HyperRushNet | 2026 | MIT License
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

export function startChatApp(customConfig = {}) {
  const validateConfig = (config) => {
    if (!config.supabaseUrl || typeof config.supabaseUrl !== 'string') {
      throw new Error('Invalid supabaseUrl configuration');
    }
    if (!config.supabaseKey || typeof config.supabaseKey !== 'string') {
      throw new Error('Invalid supabaseKey configuration');
    }
    return {
      supabaseUrl: config.supabaseUrl,
      supabaseKey: config.supabaseKey,
      mailApi: config.mailApi || "https://vercel-serverless-gray-sigma.vercel.app/api/mailAPI",
      maxUsers: typeof config.maxUsers === 'number' ? Math.max(10, Math.min(config.maxUsers, 1000)) : 475,
      maxMessages: typeof config.maxMessages === 'number' ? Math.max(5, Math.min(config.maxMessages, 100)) : 15,
      historyLoadLimit: typeof config.historyLoadLimit === 'number' ? Math.max(5, Math.min(config.historyLoadLimit, 50)) : 10,
      rateLimitMs: typeof config.rateLimitMs === 'number' ? Math.max(500, Math.min(config.rateLimitMs, 5000)) : 1000,
      presenceHeartbeatMs: typeof config.presenceHeartbeatMs === 'number' ? Math.max(5000, Math.min(config.presenceHeartbeatMs, 30000)) : 10000,
      reconnectDebounceMs: typeof config.reconnectDebounceMs === 'number' ? Math.max(1000, Math.min(config.reconnectDebounceMs, 10000)) : 3000,
      verificationCodeExpiry: typeof config.verificationCodeExpiry === 'number' ? Math.max(60, Math.min(config.verificationCodeExpiry, 1200)) : 600,
    };
  };

  try {
    const CONFIG = validateConfig(customConfig);
  } catch (error) {
    console.error('Configuration error:', error.message);
    throw error;
  }

  const logger = {
    log: (message, data = {}) => {
      console.log(`[LOG] ${new Date().toISOString()} - ${message}`, data);
    },
    error: (message, error = null) => {
      console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, error);
    },
    warn: (message, data = {}) => {
      console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, data);
    }
  };

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
    tabId: sessionStorage.getItem('hrn_tab_id') || (() => {
      const id = crypto.randomUUID();
      sessionStorage.setItem('hrn_tab_id', id);
      return id;
    })(),
    processingAction: false,
    serverFull: false,
    isLoadingHistory: false,
    oldestMessageTimestamp: null,
    hasMoreHistory: true,
    lastMessageTime: 0,
    isConnecting: false,
    isChatChannelReady: false,
    connectionRetries: 0,
    maxConnectionRetries: 5,
    retryTimeout: null
  };

  const FLAG_LOGOUT = 'hrn_flag_force_logout';
  const FLAG_GUEST_NAME = 'hrn_flag_guest_name';
  const FLAG_GUEST_ID = 'hrn_flag_guest_id';
  const MAX_RECONNECT_ATTEMPTS = 3;
  const CONNECTION_RETRY_DELAY = 5000;

  let toastQueue = [];
  let toastVisible = false;
  const TOAST_TYPES = {
    INFO: 'info',
    SUCCESS: 'success',
    WARNING: 'warning',
    ERROR: 'error'
  };

  let db;
  try {
    db = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 10 } }
    });
    logger.log('Supabase client initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize Supabase client', error);
    throw error;
  }

  const $ = (id) => {
    const element = document.getElementById(id);
    if (!element) {
      logger.warn(`Element with ID ${id} not found`);
    }
    return element;
  };

  const esc = (t) => {
    if (typeof t !== 'string') {
      logger.warn('Attempted to escape non-string value', { value: t });
      return '';
    }
    const p = document.createElement('p');
    p.textContent = t;
    return p.innerHTML;
  };

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

  const toast = m => {
    toastQueue.push(m);
    processToastQueue();
  };

  const setLoading = (s, text = null) => {
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

  const presenceManager = {
    async init(force = false) {
      if (!state.isMasterTab || !state.user) {
        logger.log('Presence init skipped - not master tab or no user');
        return;
      }

      const now = Date.now();
      if (!force && state.isConnecting) {
        logger.log('Presence init skipped - already connecting');
        return;
      }

      if (!force && (now - state.lastReconnectAttempt < CONFIG.reconnectDebounceMs)) {
        logger.log('Presence init skipped - debounce period active');
        return;
      }

      state.lastReconnectAttempt = now;
      state.isConnecting = true;
      state.isPresenceSubscribed = false;

      try {
        if (state.presenceChannel) {
          await db.removeChannel(state.presenceChannel);
          logger.log('Removed existing presence channel');
        }
      } catch (e) {
        logger.error('Error removing presence channel', e);
      }

      updateOnlineDisplay(null);

      const myId = state.user.id;
      try {
        state.presenceChannel = db.channel('online-users', {
          config: { presence: { key: myId } }
        });

        state.presenceChannel
          .on('presence', { event: 'sync' }, () => {
            if (!state.presenceChannel) return;
            queryOnlineCountImmediately().catch(e => logger.error('Error in presence sync', e));
          })
          .on('error', (error) => {
            logger.error('Presence channel error', error);
            state.isPresenceSubscribed = false;
            state.isConnecting = false;
            updateOnlineDisplay(null);
          })
          .subscribe(async (status, err) => {
            if (status === 'SUBSCRIBED') {
              if (!state.presenceChannel) return;
              state.isPresenceSubscribed = true;
              state.isConnecting = false;
              state.connectionRetries = 0;

              try {
                await state.presenceChannel.track({
                  user_id: myId,
                  online_at: new Date().toISOString()
                });
                queryOnlineCountImmediately().catch(e => logger.error('Error querying online count', e));
              } catch (e) {
                logger.error('Error tracking presence', e);
              }

              if (state.heartbeatInterval) {
                clearInterval(state.heartbeatInterval);
              }

              state.heartbeatInterval = setInterval(async () => {
                if (state.presenceChannel && state.isMasterTab && !state.serverFull) {
                  try {
                    await state.presenceChannel.track({
                      user_id: myId,
                      online_at: new Date().toISOString()
                    });
                  } catch (e) {
                    logger.error('Error in heartbeat', e);
                  }
                }
              }, CONFIG.presenceHeartbeatMs);

              setTimeout(() => {
                if (state.lastKnownOnlineCount === null && state.isPresenceSubscribed && !state.serverFull) {
                  queryOnlineCountImmediately().catch(e => logger.error('Error querying online count after timeout', e));
                }
              }, 2000);
            } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
              state.isPresenceSubscribed = false;
              state.isConnecting = false;
              updateOnlineDisplay(null);
              logger.log(`Presence channel status: ${status}`);
            }
          });
      } catch (error) {
        logger.error('Error initializing presence channel', error);
        state.isConnecting = false;
        updateOnlineDisplay(null);
      }
    },

    async cleanup() {
      try {
        if (state.presenceChannel) {
          await db.removeChannel(state.presenceChannel);
          logger.log('Presence channel cleaned up');
        }
      } catch (e) {
        logger.error('Error cleaning up presence channel', e);
      }
      state.presenceChannel = null;
      state.isPresenceSubscribed = false;
    }
  };

  const monitorConnection = () => {
    const checkConnection = () => {
      if (!navigator.onLine) {
        $('offline-screen')?.classList.add('active');
        state.isPresenceSubscribed = false;
        updateOnlineDisplay(null);
        logger.log('Offline detected');
        return;
      }

      $('offline-screen')?.classList.remove('active');

      if (!state.user || !state.isMasterTab) return;
      if (state.currentRoomId) return;

      const wsState = db.realtime.connectionState();
      if ((wsState === 'disconnected' || wsState === 'stopped') && !state.isConnecting) {
        logger.log(`Realtime connection state: ${wsState}, attempting reconnect`);
        presenceManager.init(true).catch(e => logger.error('Error in reconnection attempt', e));
      }

      if (state.lastKnownOnlineCount === null &&
          state.isPresenceSubscribed &&
          !state.isConnecting &&
          !state.serverFull) {
        setTimeout(() => {
          if (state.lastKnownOnlineCount === null &&
              state.isPresenceSubscribed &&
              !state.isConnecting &&
              !state.serverFull) {
            queryOnlineCountImmediately().catch(e => logger.error('Error querying online count in monitor', e));
          }
        }, 1000);
      }
    };

    checkConnection();

    const intervalId = setInterval(checkConnection, 5000);

    return () => clearInterval(intervalId);
  };

  const toastSystem = {
    show: (message, type = TOAST_TYPES.INFO, duration = 3000) => {
      toastQueue.push({ message, type, duration });
      processToastQueue();
    },

    processQueue: () => {
      if (toastVisible || toastQueue.length === 0) return;

      toastVisible = true;
      const { message, type, duration } = toastQueue.shift();
      const container = $('toast-container');

      if (!container) {
        logger.warn('Toast container not found');
        toastVisible = false;
        return;
      }

      const toast = document.createElement('div');
      toast.className = `toast-item toast-${type}`;
      toast.innerText = message;

      toast.onclick = () => {
        toast.style.opacity = '0';
        setTimeout(() => {
          toast.remove();
          toastVisible = false;
          toastSystem.processQueue();
        }, 400);
      };

      container.appendChild(toast);

      setTimeout(() => {
        if (toast.parentNode) {
          toast.style.opacity = '0';
          setTimeout(() => {
            if (toast.parentNode) toast.remove();
            toastVisible = false;
            toastSystem.processQueue();
          }, 400);
        }
      }, duration);
    }
  };

  const workerCode = `self.onmessage = async (e) => {
    const { type, payload } = e.data;
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    try {
      if (type === 'deriveKey') {
        try {
          const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(payload.password),
            { name: 'PBKDF2' },
            false,
            ['deriveKey']
          );

          const key = await crypto.subtle.deriveKey(
            {
              name: 'PBKDF2',
              salt: encoder.encode(payload.salt),
              iterations: 300000,
              hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt']
          );

          self.cryptoKey = key;
          self.postMessage({ type: 'keyDerived', success: true });
        } catch (error) {
          self.postMessage({ type: 'error', message: "Key derivation failed: " + error.message });
        }
      }
      else if (type === 'encrypt') {
        if (!self.cryptoKey) {
          throw new Error("Key not derived");
        }

        try {
          const iv = crypto.getRandomValues(new Uint8Array(12));
          const encoded = encoder.encode(payload.text);
          const ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            self.cryptoKey,
            encoded
          );

          const combined = new Uint8Array(iv.length + ciphertext.byteLength);
          combined.set(iv, 0);
          combined.set(new Uint8Array(ciphertext), iv.length);
          const base64 = btoa(String.fromCharCode(...combined));
          self.postMessage({ type: 'encrypted', result: base64 });
        } catch (error) {
          self.postMessage({ type: 'error', message: "Encryption failed: " + error.message });
        }
      }
      else if (type === 'decryptHistory') {
        if (!self.cryptoKey) {
          throw new Error("Key not derived");
        }

        const results = [];
        for (const m of payload.messages) {
          try {
            const binary = atob(m.content);
            const bytes = new Uint8Array(binary.length);
            for(let i = 0; i < binary.length; i++) {
              bytes[i] = binary.charCodeAt(i);
            }

            const iv = bytes.slice(0, 12);
            const ciphertext = bytes.slice(12);
            const decrypted = await crypto.subtle.decrypt(
              { name: 'AES-GCM', iv },
              self.cryptoKey,
              ciphertext
            );

            const text = decoder.decode(decrypted);
            const parts = text.split('|');
            results.push({
              id: m.id,
              time: parts[0],
              text: parts.slice(1).join('|'),
              user_id: m.user_id,
              user_name: m.user_name,
              created_at: m.created_at
            });
          } catch (error) {
            logger.error('Decryption error for message', { messageId: m.id, error: error.message });
            results.push({ id: m.id, error: true });
          }
        }
        self.postMessage({ type: 'historyDecrypted', results });
      }
      else if (type === 'decryptSingle') {
        if (!self.cryptoKey) {
          throw new Error("Key not derived");
        }

        try {
          const binary = atob(payload.content);
          const bytes = new Uint8Array(binary.length);
          for(let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
          }

          const iv = bytes.slice(0, 12);
          const ciphertext = bytes.slice(12);
          const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            self.cryptoKey,
            ciphertext
          );

          const text = decoder.decode(decrypted);
          const parts = text.split('|');
          self.postMessage({
            type: 'singleDecrypted',
            result: { time: parts[0], text: parts.slice(1).join('|') }
          });
        } catch (error) {
          self.postMessage({ type: 'singleDecrypted', error: error.message });
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
    } else if (type === 'error') {
      logger.error('Crypto worker error', e.data.message);
    }
  };

  cryptoWorker.onerror = (error) => {
    logger.error('Crypto worker error event', error);
  };

  const cryptoUtils = {
    generateSalt: () => {
      const arr = new Uint8Array(16);
      crypto.getRandomValues(arr);
      return Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
    },

    sha256: async (text) => {
      if (typeof text !== 'string') {
        throw new Error('Input must be a string');
      }

      const buffer = new TextEncoder().encode(text);
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    },

    deriveKey: (pass, salt) => {
      if (typeof pass !== 'string' || typeof salt !== 'string') {
        return Promise.reject(new Error('Password and salt must be strings'));
      }

      return new Promise((resolve, reject) => {
        pendingCallbacks['keyDerived'] = (data) => {
          if (data.success) resolve(true);
          else reject(new Error("Key derivation failed"));
        };

        cryptoWorker.postMessage({
          type: 'deriveKey',
          payload: { password: pass, salt: salt }
        });
      });
    },

    encryptMessage: (text) => {
      if (typeof text !== 'string') {
        return Promise.reject(new Error('Message must be a string'));
      }

      return new Promise((resolve, reject) => {
        pendingCallbacks['encrypted'] = (data) => {
          if (data.result) resolve(data.result);
          else reject(new Error("Encryption failed"));
        };

        const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        cryptoWorker.postMessage({
          type: 'encrypt',
          payload: { text: time + "|" + text }
        });
      });
    }
  };

  const cleanupChannels = async () => {
    try {
      if (state.presenceChannel) {
        await db.removeChannel(state.presenceChannel);
        logger.log('Presence channel removed');
      }
    } catch (e) {
      logger.error('Error removing presence channel', e);
    }

    try {
      if (state.chatChannel) {
        await db.removeChannel(state.chatChannel);
        logger.log('Chat channel removed');
      }
    } catch (e) {
      logger.error('Error removing chat channel', e);
    }

    state.presenceChannel = null;
    state.chatChannel = null;
    state.isPresenceSubscribed = false;
    state.isChatChannelReady = false;
  };

  const queryOnlineCountImmediately = async (retryCount = 0) => {
    if (!state.presenceChannel) {
      logger.warn('No presence channel available');
      return;
    }

    try {
      const presState = state.presenceChannel.presenceState();
      const allPresences = Object.values(presState).flat();
      const uniqueUserIds = new Set(allPresences.map(p => p.user_id));
      updateOnlineDisplay(uniqueUserIds.size);

      if (uniqueUserIds.size > CONFIG.maxUsers) {
        if (!state.serverFull) {
          state.serverFull = true;
          $('capacity-overlay')?.classList.add('active');
          await cleanupChannels();
          logger.log('Server capacity reached');
        }
      } else {
        state.serverFull = false;
      }
    } catch (error) {
      logger.error('Error querying online count', error);
      if (retryCount < 2) {
        setTimeout(() => {
          queryOnlineCountImmediately(retryCount + 1);
        }, 1000);
      }
    }
  };

  const roomManager = {
    async joinAttempt(id) {
      if (state.serverFull) {
        toastSystem.show("Network is full", TOAST_TYPES.ERROR);
        return;
      }

      try {
        window.setLoading(true, "Joining Room...");
        const { data, error } = await db.from('rooms').select('*').eq('id', id).single();

        if (error) {
          throw error;
        }

        if (!data) {
          throw new Error('Room not found');
        }

        if (data.has_password) {
          state.pending = {
            id: data.id,
            name: data.name,
            salt: data.salt
          };
          window.nav('scr-gate');
        } else {
          await roomManager.openVault(data.id, data.name, null, data.salt);
        }
      } catch (error) {
        logger.error('Error joining room', error);
        toastSystem.show(error.message || "Error joining room", TOAST_TYPES.ERROR);
      } finally {
        window.setLoading(false);
      }
    },

    async openVault(id, name, rawPassword, roomSalt) {
      if (!state.user) {
        toastSystem.show("Please login first", TOAST_TYPES.ERROR);
        return;
      }

      try {
        window.setLoading(true, "Deriving Key...");

        if (state.chatChannel) {
          await db.removeChannel(state.chatChannel);
        }

        state.currentRoomId = id;
        state.lastRenderedDateLabel = null;
        state.roomGuestStatus = {};
        state.oldestMessageTimestamp = null;
        state.hasMoreHistory = true;
        state.isLoadingHistory = false;

        $('chat-title').innerText = name;
        $('chat-messages').innerHTML = '<div id="chat-empty-state" class="empty-state"><i data-lucide="message-circle" class="empty-state-icon"></i><div class="empty-state-title">No messages yet</div><div class="empty-state-sub">Be the first to say something.</div></div>';
        $('chat-messages').onscroll = handleScroll;

        const copyIcon = $('icon-copy-chat');
        const checkIcon = $('icon-check-chat');
        if (copyIcon) copyIcon.style.display = 'block';
        if (checkIcon) checkIcon.style.display = 'none';

        const keySource = rawPassword ? (rawPassword + id) : id;

        try {
          await cryptoUtils.deriveKey(keySource, roomSalt);
        } catch (e) {
          throw new Error("Key derivation failed");
        }

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
              if (!m.error) {
                b.insertAdjacentHTML('beforeend', renderMsg(m));
              }
            });

            b.scrollTop = b.scrollHeight;
            checkChatEmpty();
            window.setLoading(false);
          };

          cryptoWorker.postMessage({
            type: 'decryptHistory',
            payload: { messages: data }
          });
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
              if (decRes.result) {
                await fetchGuestStatuses([m.user_id]);
                const msgObj = {
                  ...m,
                  time: decRes.result.time,
                  text: decRes.result.text
                };
                const b = $('chat-messages');
                b.insertAdjacentHTML('beforeend', renderMsg(msgObj));
                b.scrollTop = b.scrollHeight;
                checkChatEmpty();
              }
            };

            cryptoWorker.postMessage({
              type: 'decryptSingle',
              payload: { content: m.content }
            });
          }
        }).subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            state.isChatChannelReady = true;
            logger.log('Chat channel subscribed');
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            state.isChatChannelReady = false;
            logger.warn(`Chat channel status: ${status}`);
          }
        });
      } catch (error) {
        logger.error('Error opening vault', error);
        toastSystem.show(error.message || "Error opening room", TOAST_TYPES.ERROR);
      } finally {
        window.setLoading(false);
      }
    },

    async loadMoreHistory() {
      if (!state.oldestMessageTimestamp || !state.currentRoomId || state.isLoadingHistory || !state.hasMoreHistory) {
        return;
      }

      state.isLoadingHistory = true;
      const container = $('chat-messages');
      const oldScrollHeight = container.scrollHeight;

      try {
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
              if (firstTime) {
                firstExistingDate = getDateLabel(new Date(firstTime));
              }
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
                <div class="msg ${m.user_id === state.user?.id ? 'me' : ''}" data-time="${m.created_at}">
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
        };

        cryptoWorker.postMessage({
          type: 'decryptHistory',
          payload: { messages: data }
        });
      } catch (error) {
        logger.error('Error loading more history', error);
        toastSystem.show("Error loading more messages", TOAST_TYPES.ERROR);
      } finally {
        state.isLoadingHistory = false;
      }
    }
  };

  const processText = (text) => {
    if (typeof text !== 'string') {
      logger.warn('Non-string input to processText', { text });
      return '';
    }

    let t = esc(text);
    const urlRegex = /(https?:\/\/[^\s]+)/g;

    t = t.replace(urlRegex, (url) => {
      let safeUrl = url.replace(/[<>"']/g, '');
      safeUrl = safeUrl.replace(/javascript:/i, '');
      safeUrl = safeUrl.replace(/data:/i, '');

      if (!safeUrl.startsWith('http://') && !safeUrl.startsWith('https://')) {
        safeUrl = 'http://' + safeUrl;
      }

      return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer nofollow" class="chat-link">${safeUrl}</a>`;
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

  const userManager = {
    async handleLogin(e) {
      if (!e || !e.isTrusted) {
        logger.warn('Unauthorized login attempt');
        return;
      }

      if (state.processingAction) {
        return;
      }

      state.processingAction = true;

      try {
        const em = $('l-email').value;
        const p = $('l-pass').value;

        if (!em || !p) {
          toastSystem.show("Email and password are required", TOAST_TYPES.ERROR);
          return;
        }

        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) {
          toastSystem.show("Please enter a valid email", TOAST_TYPES.ERROR);
          return;
        }

        window.setLoading(true, "Signing In...");
        localStorage.removeItem(FLAG_LOGOUT);

        const { error } = await db.auth.signInWithPassword({ email: em, password: p });

        if (error) {
          throw error;
        }
      } catch (error) {
        logger.error('Login error', error);
        toastSystem.show(error.message || "Login failed", TOAST_TYPES.ERROR);
      } finally {
        window.setLoading(false);
        state.processingAction = false;
      }
    },

    async handleRegister(e) {
      if (!e || !e.isTrusted) {
        logger.warn('Unauthorized registration attempt');
        return;
      }

      if (state.processingAction) {
        return;
      }

      state.processingAction = true;

      try {
        const n = $('r-name').value;
        const em = $('r-email').value.trim().toLowerCase();
        const p = $('r-pass').value;

        if (!n || !em || !p) {
          toastSystem.show("All fields are required", TOAST_TYPES.ERROR);
          return;
        }

        if (p.length < 8) {
          toastSystem.show("Password must be at least 8 characters", TOAST_TYPES.ERROR);
          return;
        }

        window.setLoading(true, "Sending Code...");

        const [r, err] = await safeAwait(fetch(CONFIG.mailApi, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "send", email: em })
        }));

        if (err) {
          throw err;
        }

        if (r.status === 429) {
          toastSystem.show("Too many attempts. Wait a minute.", TOAST_TYPES.ERROR);
          return;
        }

        const j = await r.json();

        if (j.message === "Code sent") {
          sessionStorage.setItem('temp_reg', JSON.stringify({ n, em, p }));
          window.nav('scr-verify');
          startVTimer();
        } else {
          toastSystem.show(j.message || "Mail error", TOAST_TYPES.ERROR);
        }
      } catch (error) {
        logger.error('Registration error', error);
        toastSystem.show(error.message || "Registration failed", TOAST_TYPES.ERROR);
      } finally {
        window.setLoading(false);
        state.processingAction = false;
      }
    },

    async performGuestLogin(name) {
      window.closeOverlay();
      window.setLoading(true, "Initializing...");

      try {
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
            throw error;
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
      } catch (error) {
        logger.error('Guest login error', error);
        toastSystem.show(error.message || "Guest login failed", TOAST_TYPES.ERROR);
      } finally {
        window.setLoading(false);
      }
    }
  };

  const init = async () => {
    try {
      logger.log('Initializing application');

      if (!navigator.onLine) {
        $('offline-screen')?.classList.add('active');
        logger.warn('Offline mode');
      }

      if (localStorage.getItem(FLAG_LOGOUT) === 'true') {
        state.user = null;
        window.nav('scr-start');
        window.setLoading(false);
        const stopMonitoring = monitorConnection();
        return () => stopMonitoring();
      }

      const { data: { session } } = await db.auth.getSession();

      if (session) {
        state.user = session.user;
        localStorage.setItem(FLAG_GUEST_ID, state.user.id);
        if (state.user.user_metadata?.full_name) {
          localStorage.setItem(FLAG_GUEST_NAME, state.user.user_metadata.full_name);
        }

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
        if (state.uptimeInterval) {
          clearInterval(state.uptimeInterval);
        }
        state.uptimeInterval = setInterval(updateUptime, 1000);
      } else {
        $('guest-swipe-hint')?.style.display = 'flex';
      }

      lucide.createIcons();
      window.setLoading(false);
      const stopMonitoring = monitorConnection();

      return () => {
        stopMonitoring();
        if (state.uptimeInterval) {
          clearInterval(state.uptimeInterval);
        }
      };
    } catch (error) {
      logger.error('Initialization error', error);
      toastSystem.show("Failed to initialize application", TOAST_TYPES.ERROR);
      window.setLoading(false);
    }
  };

  const cleanup = await init();

  return () => {
    if (cleanup) cleanup();
    if (state.heartbeatInterval) {
      clearInterval(state.heartbeatInterval);
    }
    if (state.uptimeInterval) {
      clearInterval(state.uptimeInterval);
    }
    if (state.vTimer) {
      clearInterval(state.vTimer);
    }
    if (state.retryTimeout) {
      clearTimeout(state.retryTimeout);
    }
    await cleanupChannels();
  };
}

const safeAwait = async (promise) => {
  try {
    return [await promise, null];
  } catch (error) {
    logger.error('Error in safeAwait', error);
    return [null, error];
  }
};

window.startChatApp = startChatApp;
