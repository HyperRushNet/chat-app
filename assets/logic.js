/* 
 *  © 2026 
 *  GitHub: https://github.com/HyperRushNet/chat-app
 *  Version: 1.0.6
 *  assets/logic.js 
 *  MIT License
 */

import {
    createClient
} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

export function initHRNchat(customConfig = {}) {
    const CONFIG = {
        supabaseUrl: customConfig.supabaseUrl || "https://jnhsuniduzvhkpexorqk.supabase.co",
        supabaseKey: customConfig.supabaseKey || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpuaHN1bmlkdXp2aGtwZXhvcnFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NjAxMDYsImV4cCI6MjA4NzEzNjEwNn0.9I5bbqskCgksUaNWYlFFo0-6Odht28pOMdxTGZECahY",
        mailApi: customConfig.mailApi || "https://vercel-serverless-hrn.vercel.app/api/mailAPI",
        maxUsers: customConfig.maxUsers || 1,
        maxMessages: customConfig.maxMessages || 50,
        historyLoadLimit: customConfig.historyLoadLimit || 20,
        rateLimitMs: customConfig.rateLimitMs || 1000,
        presenceHeartbeatMs: customConfig.presenceHeartbeatMs || 10000,
        verificationCodeExpiry: customConfig.verificationCodeExpiry || 600,
        maxMessageLength: customConfig.maxMessageLength || 2000,
        proxyUrl: customConfig.proxyUrl || "https://vercel-serverless-hrn.vercel.app/api/CORSproxy.js?url="
    };
    const AVATARS = ['./assets/avatars/1.webp', './assets/avatars/2.webp', './assets/avatars/3.webp', './assets/avatars/4.webp', './assets/avatars/5.webp'];
    const DB_NAME = 'HRN_LOCAL_DB';
    const DB_VERSION = 6;
    
    const state = {
        user: null,
        currentRoomId: null,
        chatChannel: null,
        presenceChannel: null,
        globalPresenceChannel: null,
        allRooms: [],
        vTimer: null,
        lastRenderedDateLabel: null,
        lastKnownOnlineCount: null,
        globalOnlineCount: 0,
        heartbeatInterval: null,
        uptimeInterval: null,
        sessionStartTime: null,
        isPresenceSubscribed: false,
        lastReconnectAttempt: 0,
        pending: null,
        lastCreated: null,
        lastCreatedPass: null,
        isMasterTab: false,
        tabId: sessionStorage.getItem('hrn_tab_id') || (sessionStorage.setItem('hrn_tab_id', crypto.randomUUID()), sessionStorage.getItem('hrn_tab_id')),
        processingAction: false,
        isLoadingHistory: false,
        oldestMessageTimestamp: null,
        hasMoreHistory: true,
        lastMessageTime: 0,
        isConnecting: false,
        isChatChannelReady: false,
        currentRoomAccessType: null,
        currentRoomData: null,
        selectedAllowedUsers: [],
        currentPickerContext: null,
        lastLobbyRefresh: 0,
        removePasswordFlag: false,
        longPressTimer: null,
        currentStep: {
            create: 1,
            edit: 1,
            reg: 1
        },
        selectedAvatar: null,
        createType: 'group',
        currentRoomPassword: null,
        reconnectTimer: null,
        isReconnecting: false,
        deleteConfirmTimeout: null,
        profileCache: {},
        editingMessage: null,
        contextTarget: null,
        carouselIndex: 0,
        connectionStrength: '4g',
        isBackgrounded: false,
        globalPresenceReady: false,
        connectionTimeoutTimer: null,
        presenceUpdateTimer: null,
        isNavigating: false,
        isOfflineMode: false,
        isProcessingQueue: false,
        isCapacityBlocked: false,
        authListener: null,
        localKey: null
    };

    let toastQueue = [];
    let toastVisible = false;
    const tabChannel = new BroadcastChannel('hrn_tab_sync');
    const db = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: true
        },
        realtime: {
            params: {
                eventsPerSecond: 10
            }
        }
    });

    const esc = t => {
        const p = document.createElement('p');
        p.textContent = t;
        return p.innerHTML;
    };
    const truncateText = (text, maxLength = 20) => !text ? "" : text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
    const $ = id => document.getElementById(id);
    const getTimeFromDate = (d) => new Date(d).toLocaleTimeString('en-GB', {
        hour: '2-digit',
        minute: '2-digit'
    });

    const getLocalKey = async () => {
        if (state.localKey) return state.localKey;
        let keyStr = sessionStorage.getItem('hrn_lk');
        if (keyStr) {
            const keyData = JSON.parse(keyStr);
            state.localKey = await crypto.subtle.importKey('jwk', keyData, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
        } else {
            state.localKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
            const exported = await crypto.subtle.exportKey('jwk', state.localKey);
            sessionStorage.setItem('hrn_lk', JSON.stringify(exported));
        }
        return state.localKey;
    };

    const encryptValue = async (data) => {
        const key = await getLocalKey();
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encoded = new TextEncoder().encode(JSON.stringify(data));
        const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoded);
        const combined = new Uint8Array(iv.length + ciphertext.byteLength);
        combined.set(iv, 0);
        combined.set(new Uint8Array(ciphertext), iv.length);
        return btoa(String.fromCharCode(...combined));
    };

    const decryptValue = async (encryptedStr) => {
        if (!encryptedStr) return null;
        try {
            const key = await getLocalKey();
            const binary = atob(encryptedStr);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const iv = bytes.slice(0, 12);
            const ciphertext = bytes.slice(12);
            const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
            return JSON.parse(new TextDecoder().decode(decrypted));
        } catch (e) {
            return null;
        }
    };

    const setAppMode = (offline) => {
        state.isOfflineMode = offline;
        updatePresenceUI();
        updateSendButtonState();
        setConnectionVisuals(offline ? 'offline' : 'connected');
    };

    const setConnectionVisuals = (status) => {
        const avatar = $('chat-avatar-display');
        if (!avatar) return;
        avatar.classList.remove('status-connected', 'status-connecting', 'status-offline');
        if (status === 'connected') avatar.classList.add('status-connected');
        else if (status === 'connecting') avatar.classList.add('status-connecting');
        else avatar.classList.add('status-offline');
        updateSendButtonState();
    };

    const updateSendButtonState = () => {
        const btn = $('send-btn');
        const input = $('chat-input');
        if (!btn || !input) return;
        if (state.isOfflineMode) {
            btn.disabled = true;
            btn.style.opacity = "0.5";
            input.disabled = true;
            input.placeholder = "Offline Mode (Read Only)";
        } else {
            const isReady = state.isChatChannelReady;
            if (isReady && !state.isCapacityBlocked) {
                btn.disabled = false;
                btn.style.opacity = "1";
                input.disabled = false;
                input.placeholder = "Message...";
            } else {
                btn.disabled = true;
                btn.style.opacity = "0.5";
                input.disabled = true;
                input.placeholder = "Connecting...";
            }
        }
    };

    const updatePresenceUI = () => {
        const roomCountEl = $('room-user-count');
        const infoRoomEl = $('info-room-count');
        const infoGlobalEl = $('info-global-count');
        if (state.isOfflineMode) {
            if (infoGlobalEl) infoGlobalEl.innerText = "Local";
            if (roomCountEl) roomCountEl.innerText = "-";
            if (infoRoomEl) infoRoomEl.innerText = "-";
            const dot = roomCountEl?.previousElementSibling;
            if (dot) dot.style.background = 'var(--text-mute)';
        } else {
            let count = state.lastKnownOnlineCount || 0;
            let displayRoomText = count;
            if (state.currentRoomData?.is_direct) {
                if (count === 1) displayRoomText = "Offline";
                else if (count === 2) displayRoomText = "Online";
                else displayRoomText = "-";
            }
            let displayGlobalCount = `${state.globalOnlineCount}/${CONFIG.maxUsers}`;
            if (infoGlobalEl) infoGlobalEl.innerText = displayGlobalCount;
            if (roomCountEl) roomCountEl.innerText = displayRoomText;
            if (infoRoomEl) infoRoomEl.innerText = displayRoomText;
            const dot = roomCountEl?.previousElementSibling;
            if (dot) dot.style.background = 'var(--success)';
        }
    };

    const schedulePresenceUpdate = () => {
        if (state.presenceUpdateTimer) clearTimeout(state.presenceUpdateTimer);
        state.presenceUpdateTimer = setTimeout(() => {
            updatePresenceUI();
            state.presenceUpdateTimer = null;
        }, 500);
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
        if (!loader) return;
        if (s) loader.classList.add('active');
        else loader.classList.remove('active');
        if (text) loaderText.innerText = text;
        else loaderText.innerText = "Loading...";
    };

    const safeAwait = async (promise) => {
        try {
            return [await promise, null];
        } catch (error) {
            return [null, error];
        }
    };

    const cacheAvatar = async (profile) => {
        if (!profile || !profile.avatar_url) return profile;
        try {
            const response = await fetch(CONFIG.proxyUrl + profile.avatar_url);
            if (!response.ok) throw new Error("Invalid image response");
            const blob = await response.blob();
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = async () => {
                    profile.cached_avatar = reader.result;
                    await localDB.put('profiles', profile);
                    state.profileCache[profile.id] = profile;
                    resolve(profile);
                };
                reader.onerror = () => resolve(profile);
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            return profile;
        }
    };

    const getProfile = async (userId) => {
        if (!userId) return null;
        if (state.profileCache[userId]) return state.profileCache[userId];
        let profile = await localDB.get('profiles', userId);
        if (!state.isOfflineMode) {
            try {
                const {
                    data: serverProfile,
                    error
                } = await db.from('profiles').select('id, full_name, avatar_url, updated_at').eq('id', userId).single();
                if (serverProfile) {
                    const localTime = profile?.updated_at ? new Date(profile.updated_at).getTime() : 0;
                    const serverTime = serverProfile.updated_at ? new Date(serverProfile.updated_at).getTime() : 0;
                    const needsUpdate = !profile || serverTime > localTime || profile.avatar_url !== serverProfile.avatar_url;
                    if (needsUpdate) {
                        const newProfileData = {
                            ...serverProfile
                        };
                        const urlChanged = !profile || profile.avatar_url !== serverProfile.avatar_url;
                        const needsImageCache = urlChanged || !profile.cached_avatar;
                        if (needsImageCache && serverProfile.avatar_url) {
                            await cacheAvatar(newProfileData);
                            profile = await localDB.get('profiles', userId);
                        } else {
                            if (profile?.cached_avatar) newProfileData.cached_avatar = profile.cached_avatar;
                            await localDB.put('profiles', newProfileData);
                            profile = newProfileData;
                        }
                    }
                }
            } catch (e) {}
        }
        if (profile) state.profileCache[userId] = profile;
        return profile;
    };

    const workerCode = `
        self.onmessage = async (e) => { 
            const { id, type, payload } = e.data; 
            const encoder = new TextEncoder(); 
            const decoder = new TextDecoder(); 
            self.keys = self.keys || {};
            
            try { 
                if (type === 'deriveKey') { 
                    const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(payload.password), { name: 'PBKDF2' }, false, ['deriveKey']); 
                    const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: encoder.encode(payload.salt), iterations: 300000, hash: 'SHA-256' }, keyMaterial, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']); 
                    self.keys[payload.keyId] = key; 
                    self.postMessage({ id, type: 'keyDerived', success: true }); 
                } else if (type === 'encrypt') { 
                    if (!self.keys[payload.keyId]) throw new Error("Key not derived"); 
                    const iv = crypto.getRandomValues(new Uint8Array(12)); 
                    const encoded = encoder.encode(payload.text); 
                    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, self.keys[payload.keyId], encoded); 
                    const combined = new Uint8Array(iv.length + ciphertext.byteLength); 
                    combined.set(iv, 0); 
                    combined.set(new Uint8Array(ciphertext), iv.length); 
                    const base64 = btoa(String.fromCharCode(...combined)); 
                    self.postMessage({ id, type: 'encrypted', result: base64 }); 
                } else if (type === 'decryptHistory') { 
                    if (!self.keys[payload.keyId]) throw new Error("Key not derived"); 
                    const results = []; 
                    for (const m of payload.messages) { 
                        try { 
                            if (m.content === '/') { 
                                results.push({ id: m.id, deleted: true, user_id: m.user_id, user_name: m.user_name, created_at: m.created_at, updated_at: m.updated_at }); 
                                continue; 
                            } 
                            const binary = atob(m.content); 
                            const bytes = new Uint8Array(binary.length); 
                            for(let i=0; i<binary.length; i++) bytes[i] = binary.charCodeAt(i); 
                            const iv = bytes.slice(0, 12); 
                            const ciphertext = bytes.slice(12); 
                            const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, self.keys[payload.keyId], ciphertext); 
                            const text = decoder.decode(decrypted); 
                            const parts = text.split('|'); 
                            results.push({ id: m.id, time: parts[0], text: parts.slice(1).join('|'), user_id: m.user_id, user_name: m.user_name, created_at: m.created_at, updated_at: m.updated_at }); 
                        } catch (err) { 
                            results.push({ id: m.id, error: true }); 
                        } 
                    } 
                    self.postMessage({ id, type: 'historyDecrypted', results }); 
                } else if (type === 'decryptSingle') { 
                    if (!self.keys[payload.keyId]) throw new Error("Key not derived"); 
                    if (payload.content === '/') { 
                        self.postMessage({ id, type: 'singleDecrypted', result: { deleted: true } }); 
                        return; 
                    } 
                    try { 
                        const binary = atob(payload.content); 
                        const bytes = new Uint8Array(binary.length); 
                        for(let i=0; i<binary.length; i++) bytes[i] = binary.charCodeAt(i); 
                        const iv = bytes.slice(0, 12); 
                        const ciphertext = bytes.slice(12); 
                        const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, self.keys[payload.keyId], ciphertext); 
                        const text = decoder.decode(decrypted); 
                        const parts = text.split('|'); 
                        self.postMessage({ id, type: 'singleDecrypted', result: { time: parts[0], text: parts.slice(1).join('|') } }); 
                    } catch(e) { 
                        self.postMessage({ id, type: 'singleDecrypted', error: e.message }); 
                    } 
                } 
            } catch (error) { 
                self.postMessage({ id, type: 'error', message: error.message }); 
            } 
        };
    `;
    const workerBlob = new Blob([workerCode], {
        type: 'application/javascript'
    });
    const cryptoWorker = new Worker(URL.createObjectURL(workerBlob));
    const pendingResolvers = {};
    cryptoWorker.onmessage = (e) => {
        const {
            id,
            type,
            result,
            error,
            results,
            success
        } = e.data;
        const key = id || type;
        if (pendingResolvers[key]) {
            if (error || results?.error) pendingResolvers[key].reject(error || "Decryption failed");
            else if (type === 'keyDerived') pendingResolvers[key].resolve(success);
            else pendingResolvers[key].resolve({
                type,
                result,
                results
            });
            delete pendingResolvers[key];
        }
    };

    const workerExec = (type, payload) => {
        return new Promise((resolve, reject) => {
            const id = crypto.randomUUID();
            pendingResolvers[id] = {
                resolve,
                reject
            };
            cryptoWorker.postMessage({
                id,
                type,
                payload
            });
        });
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

    const deriveKey = (pass, salt, keyId) => workerExec('deriveKey', {
        password: pass,
        salt: salt,
        keyId: keyId
    });

    const encryptMessage = async (text, keyId) => {
        const time = new Date().toLocaleTimeString('en-GB', {
            hour: '2-digit',
            minute: '2-digit'
        });
        const res = await workerExec('encrypt', {
            text: time + "|" + text,
            keyId: keyId
        });
        return res.result;
    };

    const getConnectionTimeout = () => {
        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        if (connection) {
            const type = connection.effectiveType;
            if (type === '4g') return 5000;
            if (type === '3g') return 10000;
            if (type === '2g') return 20000;
            if (type === 'slow-2g') return 30000;
        }
        return 8000;
    };

    const handleServerFull = async () => {
        if (state.isCapacityBlocked) return;
        state.isCapacityBlocked = true;
        await cleanupChannels(false);
        if (state.globalPresenceChannel) {
            state.globalPresenceChannel.unsubscribe();
            state.globalPresenceChannel = null;
        }
        const overlay = $('block-overlay');
        if (overlay) {
            overlay.innerHTML = `
                <i data-lucide="users" style="width:48px;height:48px;margin-bottom:24px;color:var(--warning)"></i>
                <h1 style="margin-bottom: 20px" class="title">Server Full</h1>
                <p class="subtitle" style="text-align:center">Max concurrent user count (${CONFIG.maxUsers}) was reached.<br>Please try again later.</p>
            `;
            overlay.classList.add('active');
        }
    };

    const cleanupChannels = async (keepGlobal = false) => {
        if (state.connectionTimeoutTimer) {
            clearTimeout(state.connectionTimeoutTimer);
            state.connectionTimeoutTimer = null;
        }
        if (state.reconnectTimer) {
            clearTimeout(state.reconnectTimer);
            state.reconnectTimer = null;
        }
        if (state.heartbeatInterval) {
            clearInterval(state.heartbeatInterval);
            state.heartbeatInterval = null;
        }
        if (state.presenceChannel) {
            state.presenceChannel.unsubscribe();
            state.presenceChannel = null;
            state.isPresenceSubscribed = false;
        }
        if (state.chatChannel) {
            state.chatChannel.unsubscribe();
            state.chatChannel = null;
        }
        if (!keepGlobal && state.globalPresenceChannel) {
            state.globalPresenceChannel.unsubscribe();
            state.globalPresenceChannel = null;
        }
        state.isChatChannelReady = false;
        state.isReconnecting = false;
        setConnectionVisuals('offline');
    };

    const queryOnlineCountImmediately = async () => {
        if (!state.presenceChannel) return;
        const presState = state.presenceChannel.presenceState();
        const allPresences = Object.values(presState).flat();
        const uniqueUserIds = new Set(allPresences.map(p => p.user_id));
        state.lastKnownOnlineCount = uniqueUserIds.size;
        schedulePresenceUpdate();
    };

    const setupGlobalPresence = async (userId) => {
        if (state.isOfflineMode || state.isCapacityBlocked) return;
        if (state.globalPresenceChannel) state.globalPresenceChannel.unsubscribe();
        state.globalPresenceChannel = db.channel('global-presence', {
            config: {
                presence: {
                    key: userId || `listener_${state.tabId}`
                }
            }
        });
        state.globalPresenceChannel.on('presence', {
            event: 'sync'
        }, async () => {
            const presState = state.globalPresenceChannel.presenceState();
            const users = [];
            Object.keys(presState).forEach(key => {
                presState[key].forEach(pres => {
                    users.push(pres);
                });
            });
            users.sort((a, b) => new Date(a.online_at) - new Date(b.online_at));
            state.globalOnlineCount = users.length;
            state.globalPresenceReady = true;
            schedulePresenceUpdate();
            if (state.user && !state.isOfflineMode && !state.isCapacityBlocked) {
                if (users.length > CONFIG.maxUsers) {
                    const myIndex = users.findIndex(u => u.user_id === state.user.id);
                    if (myIndex === -1 || myIndex >= CONFIG.maxUsers) handleServerFull();
                }
            }
        }).subscribe(async (status) => {
            if (status === 'SUBSCRIBED') {
                if (userId && state.isMasterTab) await state.globalPresenceChannel.track({
                    user_id: userId,
                    online_at: new Date().toISOString()
                });
            }
        });
    };

    const attemptHardReconnect = () => {
        if (!state.user || state.isOfflineMode) return;
        if (state.isCapacityBlocked) return;
        if (state.connectionTimeoutTimer) clearTimeout(state.connectionTimeoutTimer);
        if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
        state.reconnectTimer = null;
        cleanupChannels(true);
        state.isReconnecting = !!state.currentRoomId;
        setConnectionVisuals('connecting');
        if (state.currentRoomId) {
            const timeout = getConnectionTimeout();
            state.connectionTimeoutTimer = setTimeout(() => {
                state.isReconnecting = false;
                attemptHardReconnect();
            }, timeout);
            initRoomPresence(state.currentRoomId);
            setupChatChannel(state.currentRoomId);
        } else {
            setConnectionVisuals('connected');
        }
    };

    const attemptOfflineLogin = async (email, pass) => {
        const knownUser = await localDB.get('known_users', email);
        if (knownUser && knownUser.metadata) {
            const hashInput = await sha256(pass + email);
            if (knownUser.pass_hash && knownUser.pass_hash === hashInput) {
                state.user = {
                    id: knownUser.userId,
                    email: knownUser.email,
                    user_metadata: knownUser.metadata
                };
                return true;
            }
        }
        return false;
    };

    window.goOnline = async () => {
        state.isCapacityBlocked = false;
        const overlay = $('block-overlay');
        if (overlay) overlay.classList.remove('active');
        setAppMode(false);
        window.setLoading(true, "Connecting...");
        const storedEnc = localStorage.getItem('hrn_auth');
        if (storedEnc) {
            const creds = await decryptValue(storedEnc);
            if (creds && creds.e && creds.p) {
                const { error } = await db.auth.signInWithPassword({ email: creds.e, password: creds.p });
                if (!error) {
                    const { data: { user } } = await db.auth.getUser();
                    state.user = user;
                    await localDB.put('known_users', {
                        id: user.email,
                        pass_hash: await sha256(creds.p + user.email),
                        email: user.email,
                        metadata: user.user_metadata,
                        userId: user.id
                    });
                    if (state.user) setupGlobalPresence(state.user.id);
                    if (state.currentRoomId) attemptHardReconnect();
                    window.loadRooms();
                    window.setLoading(false);
                    window.toast("Back Online!");
                    return;
                }
            }
        }
        window.setLoading(false);
        window.nav('scr-login');
    };

    window.stayOffline = () => {
        const overlay = $('block-overlay');
        if (overlay) overlay.classList.remove('active');
        setAppMode(true);
        window.toast("Staying in Offline Mode.");
        if (state.user) window.loadRooms();
    };

    const handleReconnect = async () => {
        const overlay = $('reconnect-overlay');
        if (overlay) overlay.classList.add('active');
        const storedEnc = localStorage.getItem('hrn_auth');
        if (storedEnc) {
            const creds = await decryptValue(storedEnc);
            if (creds && creds.e && creds.p) {
                try {
                    const { error } = await db.auth.signInWithPassword({ email: creds.e, password: creds.p });
                    if (!error) {
                        const { data: { user } } = await db.auth.getUser();
                        state.user = user;
                        setAppMode(false);
                        state.isCapacityBlocked = false;
                        await localDB.put('known_users', {
                            id: user.email,
                            pass_hash: await sha256(creds.p + user.email),
                            email: user.email,
                            metadata: user.user_metadata,
                            userId: user.id
                        });
                        if (state.user) setupGlobalPresence(state.user.id);
                        if (state.currentRoomId) attemptHardReconnect();
                        window.loadRooms();
                        if (overlay) overlay.classList.remove('active');
                        window.toast("Synced successfully.");
                        return;
                    }
                } catch (e) {}
            }
        }
        if (overlay) overlay.classList.remove('active');
        window.toast("Connection error.");
    };

    const setupChatChannel = (id) => {
        if (state.isOfflineMode) return;
        if (state.chatChannel) state.chatChannel.unsubscribe();
        const isDirect = state.currentRoomData?.is_direct;
        state.chatChannel = db.channel(`room_chat_${id}`, {
            config: {
                broadcast: {
                    self: true
                }
            }
        });
        state.chatChannel.on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `room_id=eq.${id}`
        }, async (payload) => {
            const m = payload.new;
            if (m && state.currentRoomId) {
                try {
                    const decRes = await workerExec('decryptSingle', {
                        content: m.content,
                        keyId: id
                    });
                    if (decRes.result) {
                        const msgObj = {
                            ...m,
                            ...decRes.result,
                            room_id: m.room_id
                        };
                        const container = $('chat-messages');
                        const lastMsg = container.querySelector('.msg:last-of-type');
                        let prevMsg = null;
                        if (lastMsg) prevMsg = {
                            user_id: lastMsg.dataset.uid,
                            created_at: lastMsg.dataset.time
                        };
                        container.insertAdjacentHTML('beforeend', renderMsg(msgObj, prevMsg, isDirect));
                        container.scrollTop = container.scrollHeight;
                        checkChatEmpty();
                        await localDB.put('messages', msgObj);
                    }
                } catch (e) {}
            }
        }).on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'messages',
            filter: `room_id=eq.${id}`
        }, async (payload) => {
            const m = payload.new;
            const msgEl = document.querySelector(`.msg[data-id="${m.id}"]`);
            if (msgEl) {
                try {
                    const decRes = await workerExec('decryptSingle', {
                        content: m.content,
                        keyId: id
                    });
                    const deleted = m.content === '/';
                    if (deleted) {
                        msgEl.classList.add('msg-deleted');
                        const contentDiv = msgEl.querySelector('div:not(.msg-header)');
                        if (contentDiv) {
                            contentDiv.className = 'deleted-text';
                            contentDiv.innerText = "Message deleted.";
                        }
                        const timeSpan = msgEl.querySelector('.msg-time');
                        if (timeSpan) {
                            const editedTag = timeSpan.querySelector('.edited-tag');
                            if (editedTag) editedTag.remove();
                        }
                        msgEl.dataset.text = "";
                    } else if (decRes.result) {
                        const prevEl = msgEl.previousElementSibling;
                        let prevData = null;
                        if (prevEl && prevEl.classList.contains('msg')) prevData = {
                            user_id: prevEl.dataset.uid,
                            created_at: prevEl.dataset.time
                        };
                        msgEl.outerHTML = renderMsg({
                            ...m,
                            ...decRes.result,
                            room_id: m.room_id,
                            updated_at: m.updated_at
                        }, prevData, isDirect);
                    }
                    const cached = await localDB.get('messages', m.id);
                    if (cached) {
                        cached.deleted = deleted;
                        cached.text = decRes.result?.text;
                        await localDB.put('messages', cached);
                    }
                } catch (e) {}
            }
        }).subscribe((status) => {
            state.isChatChannelReady = (status === 'SUBSCRIBED');
            if (status === 'SUBSCRIBED') {
                if (state.connectionTimeoutTimer) {
                    clearTimeout(state.connectionTimeoutTimer);
                    state.connectionTimeoutTimer = null;
                }
                state.isReconnecting = false;
                if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
                setConnectionVisuals('connected');
            } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                if (state.connectionTimeoutTimer) {
                    clearTimeout(state.connectionTimeoutTimer);
                    state.connectionTimeoutTimer = null;
                }
                if (!state.isOfflineMode && !state.isCapacityBlocked) {
                    state.isChatChannelReady = false;
                    if (!state.isReconnecting) {
                        state.isReconnecting = true;
                        setConnectionVisuals('connecting');
                        state.reconnectTimer = setTimeout(attemptHardReconnect, 1000);
                    }
                }
            }
        });
    };

    const initRoomPresence = async (roomId) => {
        if (!state.user || state.isOfflineMode) return;
        if (state.presenceChannel) state.presenceChannel.unsubscribe();
        const myId = state.user.id;
        state.presenceChannel = db.channel(`room_presence:${roomId}`, {
            config: {
                presence: {
                    key: myId
                }
            }
        });
        state.presenceChannel.on('presence', {
            event: 'sync'
        }, () => {
            if (!state.presenceChannel) return;
            queryOnlineCountImmediately();
        }).subscribe(async (status, err) => {
            if (status === 'SUBSCRIBED') {
                if (!state.presenceChannel) return;
                state.isPresenceSubscribed = true;
                state.isReconnecting = false;
                queryOnlineCountImmediately();
                await state.presenceChannel.track({
                    user_id: myId,
                    online_at: new Date().toISOString()
                });
                queryOnlineCountImmediately();
                if (state.heartbeatInterval) clearInterval(state.heartbeatInterval);
                state.heartbeatInterval = setInterval(async () => {
                    if (state.presenceChannel && !state.isCapacityBlocked) await state.presenceChannel.track({
                        user_id: myId,
                        online_at: new Date().toISOString()
                    });
                }, CONFIG.presenceHeartbeatMs);
            } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                state.isPresenceSubscribed = false;
                if (!state.isOfflineMode && !state.isCapacityBlocked) {
                    state.isReconnecting = true;
                    setConnectionVisuals('connecting');
                    state.reconnectTimer = setTimeout(attemptHardReconnect, 1000);
                }
            }
        });
    };

    const monitorConnection = () => {
        const onlineHandler = () => {
            if (state.isOfflineMode) {
                window.goOnline();
            } else {
                setConnectionVisuals('connecting');
                if (state.currentRoomId) attemptHardReconnect();
                else setConnectionVisuals('connected');
            }
        };
        const offlineHandler = () => {
            setAppMode(true);
            if (state.connectionTimeoutTimer) clearTimeout(state.connectionTimeoutTimer);
            if (state.reconnectTimer) clearTimeout(state.reconnectTimer);
            state.isReconnecting = false;
        };
        window.addEventListener('online', onlineHandler);
        window.addEventListener('offline', offlineHandler);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                if (state.isCapacityBlocked) return;
                if (state.isOfflineMode) return;
                if (state.isMasterTab && !state.isChatChannelReady && state.currentRoomId) {
                    attemptHardReconnect();
                }
            }
        });
    };

    state.preventNextClose = false;
    const showContextMenu = (e, msgEl) => {
        if (!msgEl || !state.user) return;
        if (msgEl.classList.contains('msg-deleted')) return;
        e.preventDefault();
        const msgData = {
            id: msgEl.dataset.id,
            user_id: msgEl.dataset.uid,
            created_at: msgEl.dataset.time,
            text: msgEl.dataset.text
        };
        const menu = $('context-menu');
        const editBtn = $('ctx-edit');
        const deleteBtn = $('ctx-delete');
        const copyBtn = $('ctx-copy');
        const isOwner = msgData.user_id === state.user.id;
        const msgDate = new Date(msgData.created_at);
        const now = new Date();
        const diffMinutes = (now - msgDate) / 60000;
        const canEdit = isOwner && diffMinutes < 15;
        const canDelete = isOwner;
        editBtn.style.display = canEdit ? 'flex' : 'none';
        deleteBtn.style.display = canDelete ? 'flex' : 'none';
        copyBtn.style.display = 'flex';
        state.contextTarget = msgData;
        let x = e.clientX || e.touches?.[0]?.clientX;
        let y = e.clientY || e.touches?.[0]?.clientY;
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        setTimeout(() => {
            const rect = menu.getBoundingClientRect();
            if (rect.right > window.innerWidth) menu.style.left = `${window.innerWidth - rect.width - 10}px`;
            if (rect.bottom > window.innerHeight) menu.style.top = `${window.innerHeight - rect.height - 10}px`;
            menu.classList.add('active');
        }, 10);
    };

    const hideContextMenu = () => {
        const menu = $('context-menu');
        if (menu) menu.classList.remove('active');
        state.contextTarget = null;
    };

    $('ctx-edit').onclick = () => {
        if (!state.contextTarget) return;
        state.editingMessage = state.contextTarget;
        $('edit-msg-input').value = state.contextTarget.text;
        window.showOverlayView('edit-message');
        $('overlay-container').classList.add('active');
        hideContextMenu();
    };

    $('ctx-copy').onclick = () => {
        if (!state.contextTarget) return;
        navigator.clipboard.writeText(state.contextTarget.text);
        window.toast("Copied to clipboard.");
        hideContextMenu();
    };

    $('ctx-delete').onclick = async () => {
        if (!state.contextTarget || !state.user) return;
        const idToDelete = state.contextTarget.id;
        hideContextMenu();
        window.setLoading(true, "Deleting...");
        const {
            error
        } = await db.from('messages').update({
            content: '/'
        }).eq('id', idToDelete);
        if (error) window.toast("Failed to delete message.");
        window.setLoading(false);
    };

    window.saveEditMessage = async () => {
        if (!state.editingMessage) return;
        const v = $('edit-msg-input').value.trim();
        if (!v) return window.toast("Message cannot be empty.");
        const msgDate = new Date(state.editingMessage.created_at);
        const now = new Date();
        if ((now - msgDate) / 60000 >= 15) {
            window.toast("Edit time expired (15 min).");
            window.closeOverlay();
            state.editingMessage = null;
            return;
        }
        window.setLoading(true, "Saving...");
        try {
            const enc = await encryptMessage(v, state.currentRoomId);
            const {
                error
            } = await db.from('messages').update({
                content: enc
            }).eq('id', state.editingMessage.id);
            if (error) window.toast("Failed to edit message.");
            else window.toast("Message updated.");
        } catch (e) {
            window.toast("Encryption failed.");
        }
        state.editingMessage = null;
        window.setLoading(false);
        window.closeOverlay();
    };

    document.addEventListener('click', (e) => {
        if (state.preventNextClose) {
            state.preventNextClose = false;
            return;
        }
        hideContextMenu();
    });

    const chatContainer = $('chat-messages');
    chatContainer.addEventListener('touchstart', (e) => {
        const msg = e.target.closest('.msg');
        if (!msg) return;
        state.longPressTimer = setTimeout(() => {
            showContextMenu(e, msg);
            state.preventNextClose = true;
        }, 500);
    }, {
        passive: true
    });
    chatContainer.addEventListener('touchend', () => clearTimeout(state.longPressTimer));
    chatContainer.addEventListener('touchmove', () => clearTimeout(state.longPressTimer));
    chatContainer.addEventListener('contextmenu', (e) => {
        const msg = e.target.closest('.msg');
        if (msg) {
            e.preventDefault();
            showContextMenu(e, msg);
        }
    });

    const updateAccessSummary = (prefix) => {
        const summaryEl = $(`${prefix}-access-summary`);
        if (!summaryEl) return;
        const count = state.selectedAllowedUsers.length;
        const text = count === 0 ? "Public Room" : `${count} User${count > 1 ? 's' : ''}`;
        summaryEl.innerHTML = `<span class="c-main">${text}</span><i data-lucide="chevron-right" class="w-16 h-16"></i>`;
    };

    const updateStepUI = (context) => {
        const current = state.currentStep[context];
        const indicator = $(`${context}-step-indicator`);
        if (!indicator) return;
        indicator.querySelectorAll('.step-dot').forEach((dot, index) => {
            if (index < current) dot.classList.add('active');
            else dot.classList.remove('active');
        });
        if (context === 'reg') {
            $('reg-step-1').classList.toggle('active', current === 1);
            $('reg-step-2').classList.toggle('active', current === 2);
            $('reg-step-3').classList.toggle('active', current === 3);
            if (current === 3) initAvatarCarousel();
        } else {
            $(`${context}-step-1`).classList.toggle('active', current === 1);
            $(`${context}-step-2`).classList.toggle('active', current === 2);
        }
    };

    const initAvatarCarousel = () => {
        if (!state.selectedAvatar) state.selectedAvatar = AVATARS[0];
        updateCarouselPreview();
    };

    const updateCarouselPreview = () => {
        const preview = $('avatar-preview-el');
        if (state.selectedAvatar) preview.innerHTML = `<img src="${state.selectedAvatar}">`;
    };

    window.carouselNav = (direction) => {
        let index = AVATARS.indexOf(state.selectedAvatar);
        if (index === -1) index = 0;
        index += direction;
        if (index < 0) index = AVATARS.length - 1;
        if (index >= AVATARS.length) index = 0;
        state.selectedAvatar = AVATARS[index];
        $('r-avatar-url').value = '';
        updateCarouselPreview();
    };

    window.handleAvatarUpload = (event) => {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let w = img.width,
                        h = img.height;
                    const max = 250;
                    if (w > h) {
                        if (w > max) {
                            h *= max / w;
                            w = max;
                        }
                    } else {
                        if (h > max) {
                            w *= max / h;
                            h = max;
                        }
                    }
                    canvas.width = w;
                    canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, w, h);
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                    state.selectedAvatar = dataUrl;
                    AVATARS.push(dataUrl);
                    $('r-avatar-url').value = '';
                    updateCarouselPreview();
                    window.toast("Avatar uploaded.");
                };
                img.onerror = () => window.toast("Invalid image file.");
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }
    };

    window.selectCreateType = (type) => {
        state.createType = type;
        document.querySelectorAll('.type-card').forEach(el => el.classList.remove('selected'));
        $(`type-${type}`).classList.add('selected');
    };

    window.nextRegStep = () => {
        if (state.currentStep.reg === 1) {
            const em = $('r-email').value,
                p = $('r-pass').value;
            if (!em || p.length < 8) return window.toast("Email and valid password required.");
        }
        if (state.currentStep.reg === 2) {
            const n = $('r-name').value;
            if (!n) return window.toast("Name required.");
        }
        state.currentStep.reg++;
        updateStepUI('reg');
    };

    window.prevRegStep = () => {
        state.currentStep.reg--;
        updateStepUI('reg');
    };

    window.nextCreateStep = () => {
        state.currentStep.create = 2;
        updateStepUI('create');
        const groupFields = $('create-group-fields');
        const directFields = $('create-direct-fields');
        const accessSummary = $('create-access-summary');
        const titleEl = $('create-step2-title');
        const subEl = $('create-step2-sub');
        if (!groupFields || !directFields || !accessSummary || !titleEl || !subEl) return;
        if (state.createType === 'direct') {
            groupFields.classList.add('dn');
            directFields.classList.remove('dn');
            accessSummary.classList.add('dn');
            titleEl.innerText = "Direct Message";
            subEl.innerText = "Who are you messaging?";
        } else {
            groupFields.classList.remove('dn');
            directFields.classList.add('dn');
            accessSummary.classList.remove('dn');
            titleEl.innerText = "Setup";
            subEl.innerText = "Details";
        }
        updateAccessSummary('create');
    };

    window.prevCreateStep = () => {
        state.currentStep.create = 1;
        updateStepUI('create');
    };

    window.nextEditStep = () => {
        const name = $('edit-room-name').value.trim();
        if (!name) return window.toast("Name required.");
        state.currentStep.edit = 2;
        updateStepUI('edit');
        updateAccessSummary('edit');
    };

    window.prevEditStep = () => {
        state.currentStep.edit = 1;
        updateStepUI('edit');
    };

    window.openAccessManager = async (prefix) => {
        state.currentPickerContext = prefix;
        if (prefix === 'edit-room' && state.selectedAllowedUsers.length === 0 && state.currentRoomData) {
            const ids = state.currentRoomData.allowed_users;
            if (ids && !ids.includes('*')) {
                const {
                    data: profiles
                } = await db.from('profiles').select('id, full_name, avatar_url').in('id', ids);
                state.selectedAllowedUsers = ids.map(id => {
                    const p = profiles?.find(pro => pro.id === id);
                    return {
                        id: id,
                        name: p?.full_name || 'Unknown',
                        avatar: p?.avatar_url
                    };
                });
            }
        }
        renderPickerSelectedUsers();
        $('overlay-container').classList.add('active');
        window.showOverlayView('access-manager');
        $('picker-id-input').value = '';
        $('picker-id-input').focus();
    };

    window.closeAccessManager = () => {
        if (state.currentPickerContext === 'edit-room') window.showOverlayView('room-settings');
        else window.closeOverlay();
        updateAccessSummary(state.currentPickerContext);
    };

    const renderPickerSelectedUsers = () => {
        const container = $('picker-selected-list');
        const displayUsers = state.selectedAllowedUsers;
        if (displayUsers.length === 0) {
            container.innerHTML = `<div style="color:var(--text-mute);padding:20px 0;font-size:12px;text-align:center">No users selected.</div>`;
            $('picker-count').innerText = '0';
            return;
        }
        $('picker-count').innerText = displayUsers.length;
        container.innerHTML = displayUsers.map(u => `<div class="picker-user-card" style="display:flex;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)"><div style="width:28px;height:28px;border-radius:50%;background:#f2f2f7;overflow:hidden;margin-right:8px;display:flex;align-items:center;justify-content:center;color:var(--accent);font-weight:800;font-size:11px">${u.avatar ? `<img src="${u.avatar}">` : u.name.charAt(0)}</div><div style="flex:1;min-width:0"><div style="font-weight:700;font-size:12px">${esc(u.name)} ${u.id === state.user.id ? '<span style="color:var(--text-mute);font-weight:500">(You)</span>' : ''}</div><div style="font-size:9px;color:var(--text-mute);font-family:monospace">${u.id}</div></div><button class="picker-remove-btn" style="background:transparent;border:none;color:var(--danger);cursor:pointer;padding:8px" onclick="window.removePickerUser('${u.id}')"><i data-lucide="x" style="width:14px;height:14px"></i></button></div>`).join('');
    };

    window.removePickerUser = (id) => {
        state.selectedAllowedUsers = state.selectedAllowedUsers.filter(u => u.id !== id);
        renderPickerSelectedUsers();
    };

    window.addUserById = async () => {
        const input = $('picker-id-input');
        const id = input.value.trim();
        if (!id) return window.toast("Enter ID.");
        if (state.selectedAllowedUsers.find(u => u.id === id)) return window.toast("User already added.");
        window.setLoading(true, "Fetching...");
        const {
            data,
            error
        } = await db.from('profiles').select('id, full_name, avatar_url').eq('id', id).single();
        window.setLoading(false);
        if (error || !data) return window.toast("User not found.");
        state.selectedAllowedUsers.push({
            id: data.id,
            name: data.full_name,
            avatar: data.avatar_url
        });
        renderPickerSelectedUsers();
        input.value = '';
        window.toast("Added.");
    };

    const checkMaster = () => new Promise((resolve) => {
        let masterFound = false;
        const handler = (ev) => {
            if (ev.data.type === 'PONG_MASTER') masterFound = true;
        };
        tabChannel.addEventListener('message', handler);
        tabChannel.postMessage({
            type: 'PING_MASTER'
        });
        setTimeout(() => {
            tabChannel.removeEventListener('message', handler);
            resolve(masterFound);
        }, 300);
    });

    window.forceClaimMaster = () => {
        if (!state.isMasterTab) {
            state.isMasterTab = true;
            tabChannel.postMessage({
                type: 'CLAIM_MASTER',
                id: state.tabId
            });
            $('block-overlay').classList.remove('active');
            if (state.user) {
                setupGlobalPresence(state.user.id);
                if (state.currentRoomId) attemptHardReconnect();
            }
        }
    };

    tabChannel.onmessage = (ev) => {
        if (ev.data.type === 'CLAIM_MASTER' && ev.data.id !== state.tabId) {
            if (state.isMasterTab) {
                cleanupChannels();
                if (state.heartbeatInterval) clearInterval(state.heartbeatInterval);
                state.heartbeatInterval = null;
                state.isPresenceSubscribed = false;
                state.isMasterTab = false;
                setConnectionVisuals('offline');
                const overlay = $('block-overlay');
                overlay.innerHTML = `<i data-lucide="log-out" style="width:48px;height:48px;margin-bottom:24px;color:var(--danger)"></i><h1 class="title">Session Moved</h1><p class="subtitle" style="margin-bottom:48px">You switched to a new tab.</p><button class="btn btn-accent" onclick="window.forceClaimMaster()">Use Here</button>`;
                overlay.classList.add('active');
            }
        }
        if (ev.data.type === 'PING_MASTER') {
            if (state.isMasterTab) tabChannel.postMessage({
                type: 'PONG_MASTER'
            });
        }
    };

    const beforeUnloadHandler = () => tabChannel.postMessage({
        type: 'CLAIM_MASTER',
        id: state.tabId
    });
    window.addEventListener('beforeunload', beforeUnloadHandler);

    window.closeOverlay = () => {
        const oc = $('overlay-container');
        if (oc) oc.classList.remove('active');
    };

    window.showOverlayView = (viewId) => {
        const panel = document.querySelector('.panel-card');
        if (!panel) return;
        panel.querySelectorAll('.view-content').forEach(v => v.classList.remove('active'));
        const target = $(`view-${viewId}`);
        if (target) target.classList.add('active');
    };

    window.prepareAccountPage = async () => {
        if (!state.user) return;
        const {
            data: profile
        } = await db.from('profiles').select('avatar_url, full_name').eq('id', state.user.id).single();
        const name = profile?.full_name || state.user.user_metadata?.full_name || "User";
        const avatar = profile?.avatar_url || state.user.user_metadata?.avatar_url;
        $('acc-page-name').innerText = name;
        $('acc-page-type').innerText = "Full Account";
        $('acc-page-id').innerText = state.user.id;
        const avPrev = $('acc-page-avatar');
        if (avatar) avPrev.innerHTML = `<img src="${avatar}">`;
        else avPrev.innerText = name.charAt(0);
        $('acc-email-wrapper').style.display = 'block';
        $('acc-page-email').innerText = state.user.email || "Not set";
    };

    window.copyAccountId = () => {
        if (!state.user) return;
        navigator.clipboard.writeText(state.user.id);
        window.toast("ID Copied.");
    };

    window.copyInfoId = () => {
        if (!state.currentRoomId) return;
        navigator.clipboard.writeText(state.currentRoomId);
        window.toast("Room ID Copied.");
    };

    const updateLobbyAvatar = async () => {
        if (!state.user) return;
        const btn = $('lobby-avatar-btn');
        if (!btn) return;
        let avatar = state.user.user_metadata?.avatar_url;
        let name = state.user.user_metadata?.full_name;
        if (!avatar || !name) {
            const {
                data
            } = await db.from('profiles').select('avatar_url, full_name').eq('id', state.user.id).single();
            if (data) {
                avatar = data.avatar_url;
                name = data.full_name;
            }
        }
        const profile = await getProfile(state.user.id);
        if (profile && profile.cached_avatar) avatar = profile.cached_avatar;
        if (avatar) btn.innerHTML = `<img src="${avatar}">`;
        else btn.innerText = (name || "U").charAt(0);
    };

    const getDateLabel = (d) => {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        const diff = Math.round((today - target) / 86400000);
        if (diff === 0) return "Today";
        if (diff === 1) return "Yesterday";
        if (diff < 7) {
            return d.toLocaleDateString('en-GB', {
                weekday: 'long'
            });
        }
        const isSameYear = d.getFullYear() === now.getFullYear();
        return d.toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: isSameYear ? undefined : 'numeric'
        });
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

    const renderMsg = (m, prevMsg, isDirect, isOptimistic = false) => {
        if (!m) return "";
        const isDeleted = m.deleted === true;
        const isEdited = m.updated_at && !isDeleted && new Date(m.updated_at).getTime() > new Date(m.created_at).getTime() + 1000;
        let html = "";
        const msgDateObj = new Date(m.created_at);
        const currentLabel = getDateLabel(msgDateObj);
        const isGroupStart = !prevMsg || prevMsg.user_id !== m.user_id || getDateLabel(new Date(prevMsg.created_at)) !== currentLabel;
        if (isGroupStart && currentLabel !== state.lastRenderedDateLabel) {
            html += `<div class="date-divider"><span class="date-label">${currentLabel}</span></div>`;
            state.lastRenderedDateLabel = currentLabel;
        }
        const displayName = truncateText(m.user_name || 'User', 18);
        const msgClass = isOptimistic ? 'msg-optimistic' : (isGroupStart ? 'group-start' : 'msg-continuation');
        const sideClass = m.user_id === state.user?.id ? 'me' : 'not-me';
        const safeText = isDeleted ? '' : esc(m.text || '').replace(/"/g, '&quot;');
        const dataAttrs = `data-id="${m.id}" data-uid="${m.user_id}" data-time="${m.created_at}" data-text="${safeText}"`;
        const timeString = m.time || getTimeFromDate(m.created_at);
        html += `<div class="msg ${sideClass} ${msgClass} ${isDeleted ? 'msg-deleted' : ''} ${isOptimistic ? 'msg-pending' : ''} pop-in" ${dataAttrs}>`;
        if (isDeleted) html += `${isGroupStart && !isDirect ? `<div class="msg-header"><span class="msg-user">${esc(displayName)}</span></div>` : ''}<div class="deleted-text">Message deleted.</div><span class="msg-time">${timeString}</span>`;
        else {
            const processedText = processText(m.text);
            html += `${isGroupStart && !isDirect ? `<div class="msg-header"><span class="msg-user">${esc(displayName)}</span></div>` : ''}<div>${processedText}</div><span class="msg-time">${timeString}${isEdited ? '<span class="edited-tag">(Edited)</span>' : ''}</span>`;
        }
        html += `</div>`;
        return html;
    };

    const handleScroll = () => {
        const container = $('chat-messages');
        if (!container) return;
        if (container.scrollTop < 50 && !state.isLoadingHistory && state.hasMoreHistory) loadMoreHistory();
    };

    const loadMoreHistory = async () => {
        if (!state.oldestMessageTimestamp || !state.currentRoomId) return;
        state.isLoadingHistory = true;
        const container = $('chat-messages');
        const oldScrollHeight = container.scrollHeight;
        container.insertAdjacentHTML('afterbegin', '<div id="history-loader" style="text-align:center;padding:10px;font-size:11px;color:var(--text-mute)">Loading...</div>');
        const {
            data,
            error
        } = await db.from('messages').select('*').eq('room_id', state.currentRoomId).lt('created_at', state.oldestMessageTimestamp).order('created_at', {
            ascending: false
        }).limit(CONFIG.historyLoadLimit);
        const loader = $('history-loader');
        if (loader) loader.remove();
        if (error || !data || data.length === 0) {
            state.hasMoreHistory = false;
            state.isLoadingHistory = false;
            return;
        }
        data.reverse();
        try {
            const res = await workerExec('decryptHistory', {
                messages: data,
                keyId: state.currentRoomId
            });
            const validMsgs = res.results.filter(m => !m.error);
            if (validMsgs.length > 0) {
                state.oldestMessageTimestamp = validMsgs[0].created_at;
                let html = "",
                    prev = null;
                validMsgs.forEach(m => {
                    html += renderMsg(m, prev, state.currentRoomData?.is_direct);
                    prev = m;
                });
                container.insertAdjacentHTML('afterbegin', html);
                container.scrollTop = container.scrollHeight - oldScrollHeight;
                const messagesWithRoomId = validMsgs.map(m => ({
                    ...m,
                    room_id: state.currentRoomId
                }));
                await localDB.putAll('messages', messagesWithRoomId);
            }
        } catch (e) {}
        state.isLoadingHistory = false;
    };

    window.openRoomInfo = async () => {
        if (!state.currentRoomData) return;
        window.setLoading(true, "Loading info...");
        const room = state.currentRoomData;
        const delBtn = $('info-delete-btn');
        const creatorRow = $('info-creator-row');
        delBtn.style.display = 'none';
        delBtn.innerText = "Delete Chat";
        delBtn.classList.remove('active');
        if (state.deleteConfirmTimeout) clearTimeout(state.deleteConfirmTimeout);
        $('info-id').innerText = room.id;
        const date = new Date(room.created_at);
        $('info-date').innerText = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
        if (room.is_direct) {
            $('info-type').innerText = "Direct Message";
            creatorRow.style.display = 'none';
            const otherId = room.allowed_users?.find(id => id !== state.user.id);
            if (otherId) {
                const profile = await getProfile(otherId);
                if (profile) {
                    $('info-name').innerText = profile.full_name;
                    const avEl = $('info-avatar');
                    if (profile.cached_avatar || profile.avatar_url) avEl.innerHTML = `<img src="${profile.cached_avatar || profile.avatar_url}">`;
                    else avEl.innerText = (profile.full_name || 'U').charAt(0);
                } else {
                    $('info-name').innerText = 'User';
                }
            }
            delBtn.style.display = 'flex';
        } else {
            $('info-type').innerText = "Group Chat";
            $('info-name').innerText = room.name;
            const avEl = $('info-avatar');
            if (room.avatar_url) avEl.innerHTML = `<img src="${room.avatar_url}">`;
            else avEl.innerText = room.name.charAt(0);
            creatorRow.style.display = 'flex';
            if (room.created_by) {
                let profile = state.profileCache[room.created_by];
                if (!profile) {
                    const {
                        data
                    } = await db.from('profiles').select('full_name').eq('id', room.created_by).single();
                    profile = data;
                    if (data) state.profileCache[room.created_by] = data;
                }
                $('info-creator').innerText = profile?.full_name || 'Unknown';
            } else $('info-creator').innerText = 'Unknown';
            if (room.created_by === state.user.id) delBtn.style.display = 'flex';
        }
        updatePresenceUI();
        window.setLoading(false);
        $('overlay-container').classList.add('active');
        window.showOverlayView('room-info');
    };

    window.initiateDeleteRoom = () => {
        const btn = $('info-delete-btn');
        if (btn.classList.contains('active')) window.deleteRoom();
        else {
            btn.classList.add('active');
            btn.innerText = "Tap again to confirm";
            state.deleteConfirmTimeout = setTimeout(() => {
                btn.classList.remove('active');
                btn.innerText = "Delete Chat";
            }, 3000);
        }
    };

    window.openRoomSettings = async () => {
        window.closeOverlay();
        if (!state.currentRoomId || !state.currentRoomData || state.currentRoomData.created_by !== state.user.id) return window.toast("Not owner.");
        window.setLoading(true, "Loading...");
        const room = state.currentRoomData;
        state.currentStep.edit = 1;
        updateStepUI('edit');
        $('edit-room-name').value = room.name;
        $('edit-room-visible').checked = room.is_visible;
        $('edit-room-pass').value = '';
        const passStatusLabel = $('pass-status-label');
        const removePassBtn = $('btn-remove-pass');
        if (room.has_password) {
            passStatusLabel.innerText = "Active";
            passStatusLabel.style.color = "var(--success)";
            removePassBtn.style.display = 'block';
        } else {
            passStatusLabel.innerText = "Not Set";
            passStatusLabel.style.color = "var(--text-mute)";
            removePassBtn.style.display = 'none';
        }
        state.removePasswordFlag = false;
        state.selectedAllowedUsers = [];
        const ids = room.allowed_users;
        if (ids && !ids.includes('*')) {
            const {
                data: profiles
            } = await db.from('profiles').select('id, full_name, avatar_url').in('id', ids);
            state.selectedAllowedUsers = ids.map(id => {
                const p = profiles?.find(pro => pro.id === id);
                return {
                    id: id,
                    name: p?.full_name || 'Unknown',
                    avatar: p?.avatar_url
                };
            });
        }
        $('overlay-container').classList.add('active');
        window.showOverlayView('room-settings');
        window.setLoading(false);
    };

    window.prepareRemovePassword = () => {
        state.removePasswordFlag = true;
        $('pass-status-label').innerText = "Will be removed";
        $('pass-status-label').style.color = "var(--danger)";
        $('edit-room-pass').value = '';
        $('edit-room-pass').disabled = true;
    };

    window.saveRoomSettings = async (e) => {
        if (!e || !e.isTrusted) return;
        if (state.processingAction) return;
        state.processingAction = true;
        const name = $('edit-room-name').value.trim();
        const isVisible = $('edit-room-visible').checked;
        const newPass = $('edit-room-pass').value;
        let allowedUsers = state.selectedAllowedUsers.length > 0 ? state.selectedAllowedUsers.map(u => u.id) : ['*'];
        if (!allowedUsers.includes(state.user.id)) allowedUsers.push(state.user.id);
        if (!name) {
            window.toast("Name required.");
            state.processingAction = false;
            return;
        }
        const room = state.currentRoomData;
        const isChangingPass = newPass.length > 0;
        const isRemovingPass = state.removePasswordFlag;
        window.setLoading(true, "Saving...");
        const updates = {
            name,
            is_visible: isVisible,
            allowed_users: allowedUsers
        };
        if (isRemovingPass) updates.has_password = false;
        else if (isChangingPass) updates.has_password = true;
        const {
            error: updateError
        } = await db.from('rooms').update(updates).eq('id', state.currentRoomId);
        if (updateError) {
            window.toast("Failed to save changes.");
            window.setLoading(false);
            state.processingAction = false;
            return;
        }
        if (isRemovingPass) {
            await db.rpc('set_room_password', {
                p_room_id: state.currentRoomId,
                p_hash: null
            });
            state.currentRoomData.has_password = false;
        } else if (isChangingPass) {
            const roomSalt = state.currentRoomData.salt;
            const accessHash = await sha256(newPass + roomSalt);
            await db.rpc('set_room_password', {
                p_room_id: state.currentRoomId,
                p_hash: accessHash
            });
            state.currentRoomData.has_password = true;
        }
        const {
            data: updatedRoom
        } = await db.from('rooms').select('*').eq('id', state.currentRoomId).single();
        state.currentRoomData = updatedRoom;
        $('chat-title').innerText = updatedRoom.name;
        window.toast("Saved.");
        window.closeOverlay();
        state.processingAction = false;
        window.setLoading(false);
    };

    window.deleteRoom = async () => {
        if (!state.currentRoomId) return;
        window.setLoading(true, "Deleting...");
        const {
            error
        } = await db.from('rooms').delete().eq('id', state.currentRoomId);
        if (error) {
            window.toast("Failed to delete room.");
            window.setLoading(false);
            return;
        }
        window.toast("Deleted.");
        state.currentRoomId = null;
        state.currentRoomData = null;
        window.closeOverlay();
        window.nav('scr-lobby');
        window.loadRooms();
        window.setLoading(false);
    };

    window.openVault = async (id, n, rawPassword, roomSalt, cachedData = null) => {
        if (!state.user) return window.toast("Please login first.");
        if (state.isCapacityBlocked) return;
        window.setLoading(true, "Opening chat...");
        state.currentRoomPassword = rawPassword;
        if (state.chatChannel) state.chatChannel.unsubscribe();
        state.currentRoomId = id;
        state.lastRenderedDateLabel = null;
        state.oldestMessageTimestamp = null;
        state.hasMoreHistory = true;
        state.isLoadingHistory = false;
        const chatContainer = $('chat-messages');
        chatContainer.innerHTML = '';
        chatContainer.onscroll = handleScroll;
        let roomData = cachedData;
        if (!roomData) {
            roomData = await localDB.get('rooms', id);
        }
        if (!state.isOfflineMode) {
            try {
                const {
                    data: netRoom
                } = await db.from('rooms').select('*').eq('id', id).single();
                if (netRoom && netRoom.id) {
                    roomData = netRoom;
                    await localDB.put('rooms', roomData);
                }
            } catch (e) {}
        }
        if (!roomData) {
            if (id && n && roomSalt) {
                roomData = {
                    id,
                    name: n,
                    salt: roomSalt,
                    created_at: new Date().toISOString()
                };
            } else {
                window.setLoading(false);
                return window.toast("Room data not found.");
            }
        }
        state.currentRoomData = roomData;
        const isDirect = roomData?.is_direct;
        let displayTitle = roomData.name;
        let displayAvatar = roomData?.avatar_url;
        if (isDirect) {
            const otherUserId = roomData?.allowed_users?.find(uid => uid !== state.user.id);
            if (otherUserId) {
                const profile = await getProfile(otherUserId);
                if (profile) {
                    displayTitle = profile.full_name;
                    displayAvatar = profile.cached_avatar || profile.avatar_url;
                }
            }
        }
        $('chat-title').innerText = displayTitle;
        const avEl = $('chat-avatar-display');
        if (displayAvatar) avEl.innerHTML = `<img src="${displayAvatar}">`;
        else avEl.innerText = displayTitle.charAt(0).toUpperCase();
        const editBtn = $('info-edit-btn');
        if (!isDirect && roomData?.created_by === state.user.id) editBtn.style.display = 'flex';
        else editBtn.style.display = 'none';
        const keySource = rawPassword ? (rawPassword + id) : id;
        await deriveKey(keySource, roomData?.salt, id);
        let finalMessages = [];
        if (!state.isOfflineMode) {
            try {
                const {
                    data
                } = await db.from('messages').select('*').eq('room_id', id).order('created_at', {
                    ascending: false
                }).limit(CONFIG.maxMessages);
                if (data && data.length > 0) {
                    data.reverse();
                    try {
                        const res = await workerExec('decryptHistory', {
                            messages: data,
                            keyId: id
                        });
                        const validMsgs = res.results.filter(m => !m.error);
                        const messagesWithRoomId = validMsgs.map(m => ({
                            ...m,
                            room_id: id
                        }));
                        await localDB.clearRoomMessages(id);
                        await localDB.putAll('messages', messagesWithRoomId);
                        finalMessages = validMsgs;
                    } catch (e) {}
                }
            } catch (e) {}
        }
        if (finalMessages.length === 0) finalMessages = await localDB.getRoomMessages(id);
        window.nav('scr-chat');
        if (finalMessages.length > 0) {
            if (finalMessages.length > 0) state.oldestMessageTimestamp = finalMessages[0].created_at;
            let html = '',
                prev = null;
            finalMessages.forEach(m => {
                html += renderMsg(m, prev, isDirect);
                prev = m;
            });
            chatContainer.innerHTML = html;
        }
        checkChatEmpty();
        $('chat-input').style.display = 'block';
        $('send-btn').style.display = 'flex';
        if (state.isOfflineMode) {
            setConnectionVisuals('offline');
        } else {
            setConnectionVisuals('connecting');
            await initRoomPresence(id);
            await setupChatChannel(id);
        }
        setTimeout(() => {
            chatContainer.scrollTop = chatContainer.scrollHeight;
            window.setLoading(false);
        }, 100);
    };

    const applyRateLimit = () => {
        const now = Date.now();
        if (now - state.lastMessageTime < CONFIG.rateLimitMs) return false;
        return true;
    };

    window.sendMsg = async (e) => {
        if (!e || !e.isTrusted) return;
        if (!state.user || !state.currentRoomId || state.processingAction) return;
        if (state.isOfflineMode) return window.toast("Offline Mode: Cannot send.");
        if (!state.isChatChannelReady) return window.toast("Reconnecting...");
        if (state.isCapacityBlocked) return window.toast("Server Full.");
        if (!applyRateLimit()) return;
        const v = $('chat-input').value.trim();
        if (!v) return;
        if (v.length > CONFIG.maxMessageLength) {
            return window.toast(`Message too long (max ${CONFIG.maxMessageLength} chars).`);
        }
        state.processingAction = true;
        $('chat-input').value = '';
        state.lastMessageTime = Date.now();
        try {
            const enc = await encryptMessage(v, state.currentRoomId);
            const {
                data,
                error
            } = await db.from('messages').insert([{
                room_id: state.currentRoomId,
                user_id: state.user.id,
                user_name: state.user.user_metadata?.full_name,
                content: enc
            }]).select().single();
            if (error) window.toast("Failed to send message.");
        } catch (err) {
            window.toast("Encryption or Send failed.");
        }
        state.processingAction = false;
    };

    window.leaveChat = async () => {
        window.setLoading(true, "Leaving...");
        if (state.chatChannel) state.chatChannel.unsubscribe();
        state.chatChannel = null;
        state.currentRoomId = null;
        state.currentRoomData = null;
        if (state.presenceChannel) state.presenceChannel.unsubscribe();
        state.presenceChannel = null;
        state.isPresenceSubscribed = false;
        if (state.heartbeatInterval) clearInterval(state.heartbeatInterval);
        state.heartbeatInterval = null;
        setConnectionVisuals('offline');
        if ($('info-edit-btn')) $('info-edit-btn').style.display = 'none';
        window.nav('scr-lobby');
        window.loadRooms();
        window.setLoading(false);
    };

    window.handleLogin = async (e) => {
        if (!e || !e.isTrusted) return;
        if (state.processingAction) return;
        state.processingAction = true;
        const em = $('l-email').value,
            p = $('l-pass').value;
        if (!em || !p) {
            window.toast("Input missing.");
            state.processingAction = false;
            return;
        }
        window.setLoading(true, "Signing In...");
        if (!state.isOfflineMode) {
            const {
                error
            } = await db.auth.signInWithPassword({
                email: em,
                password: p
            });
            if (!error) {
                const {
                    data: {
                        user
                    }
                } = await db.auth.getUser();
                state.user = user;
                setAppMode(false);
                const hashInput = await sha256(p + em);
                await localDB.put('known_users', {
                    id: em,
                    pass_hash: hashInput,
                    email: em,
                    metadata: user.user_metadata,
                    userId: user.id
                });
                if (state.user) setupGlobalPresence(state.user.id);
                window.nav('scr-lobby');
                window.loadRooms();
                window.setLoading(false);
                state.processingAction = false;
                const encCreds = await encryptValue({ e: em, p: p });
                localStorage.setItem('hrn_auth', encCreds);
                return;
            }
        }
        const offlineOk = await attemptOfflineLogin(em, p);
        if (offlineOk) {
            setAppMode(true);
            window.nav('scr-lobby');
            window.loadRooms();
            window.setLoading(false);
            state.processingAction = false;
            window.toast("Logged in successfully (Offline).");
            const encCreds = await encryptValue({ e: em, p: p });
            localStorage.setItem('hrn_auth', encCreds);
            return;
        }
        window.toast("Login failed.");
        window.setLoading(false);
        state.processingAction = false;
    };

    window.handleRegister = async (e) => {
        if (!e || !e.isTrusted) return;
        if (state.processingAction) return;
        state.processingAction = true;
        const n = $('r-name').value,
            em = $('r-email').value.trim().toLowerCase(),
            p = $('r-pass').value;
        const customAvatar = $('r-avatar-url').value.trim();
        const avatarUrl = customAvatar || state.selectedAvatar;
        if (!n || !em || p.length < 8) {
            window.toast("Check inputs.");
            state.processingAction = false;
            return;
        }
        window.setLoading(true, "Sending Code...");
        try {
            const [r, err] = await safeAwait(fetch(CONFIG.mailApi, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    action: "send",
                    email: em
                })
            }));
            
            if (err || !r) {
                window.toast("Network error.");
                window.setLoading(false);
                state.processingAction = false;
                return;
            }

            if (r.status === 429) {
                window.toast("Rate limited. Please wait.");
                state.processingAction = false;
                window.setLoading(false);
                return;
            }
            
            const j = await r.json();
            if (r.ok && j.message === "Code sent.") {
                sessionStorage.setItem('temp_reg', JSON.stringify({
                    n,
                    em,
                    p,
                    avatar: avatarUrl
                }));
                window.nav('scr-verify');
                startVTimer();
                window.setLoading(false);
            } else {
                window.toast(j.message || "Failed to send code.");
                window.setLoading(false);
            }
        } catch (err) {
            window.toast("An unexpected error occurred.");
            window.setLoading(false);
        }
        state.processingAction = false;
    };

    const startVTimer = () => {
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
        if (!e || !e.isTrusted) return;
        if (state.processingAction) return;
        state.processingAction = true;
        const code = $('v-code').value,
            temp = JSON.parse(sessionStorage.getItem('temp_reg'));
        if (!temp) {
            window.toast("Session expired.");
            state.processingAction = false;
            return;
        }
        window.setLoading(true, "Verifying...");
        try {
            const r = await fetch(CONFIG.mailApi, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    action: "verify",
                    email: temp.em,
                    code: code
                })
            });
            if (r.status === 429) {
                window.toast("Rate limited.");
                state.processingAction = false;
                window.setLoading(false);
                return;
            }
            const j = await r.json();
            if (j.message === "Verified") await finishReg(temp);
            else {
                window.toast(j.message || "Wrong code.");
                window.setLoading(false);
            }
        } catch (err) {
            window.toast("Verification failed.");
            window.setLoading(false);
        }
        state.processingAction = false;
    };

    const finishReg = async (temp) => {
        const {
            error
        } = await db.auth.signUp({
            email: temp.em,
            password: temp.p,
            options: {
                data: {
                    full_name: temp.n,
                    avatar_url: temp.avatar
                }
            }
        });
        if (error) {
            window.toast(error.message);
            window.setLoading(false);
        } else {
            const encCreds = await encryptValue({ e: temp.em, p: temp.p });
            localStorage.setItem('hrn_auth', encCreds);
            window.nav('scr-lobby');
            window.loadRooms();
            window.setLoading(false);
        }
    };

    window.handleCreate = async (e) => {
        if (!e || !e.isTrusted) return;
        if (state.processingAction) return;
        state.processingAction = true;
        const isDirect = state.createType === 'direct';
        let n, isVisible = true,
            targetUser = null;
        let avatarUrl = null;
        let rawPass = null;
        if (isDirect) {
            targetUser = $('c-target-user').value.trim();
            if (!targetUser) {
                window.toast("User ID required.");
                state.processingAction = false;
                return;
            }
            const {
                data: profile,
                error
            } = await db.from('profiles').select('full_name').eq('id', targetUser).single();
            if (error || !profile) {
                window.toast("User not found.");
                state.processingAction = false;
                return;
            }
            n = "Direct Message";
            isVisible = true;
        } else {
            n = $('c-name').value.trim();
            avatarUrl = $('c-avatar').value.trim() || null;
            rawPass = $('c-pass').value;
            isVisible = $('c-visible').checked;
            if (!n) {
                window.toast("Name required.");
                state.processingAction = false;
                return;
            }
        }
        let allowedUsers = ['*'];
        if (isDirect) allowedUsers = [state.user.id, targetUser];
        else {
            if (state.selectedAllowedUsers.length > 0) {
                allowedUsers = state.selectedAllowedUsers.map(u => u.id);
                if (!allowedUsers.includes(state.user.id)) allowedUsers.push(state.user.id);
            }
        }
        window.setLoading(true, "Creating...");
        const roomSalt = generateSalt();
        const insertData = {
            name: n,
            avatar_url: avatarUrl,
            has_password: !!rawPass,
            is_visible: isVisible,
            salt: roomSalt,
            created_by: state.user.id,
            allowed_users: allowedUsers,
            is_direct: isDirect
        };
        const {
            data,
            error
        } = await db.from('rooms').insert([insertData]).select();
        if (error) {
            window.toast("Error: " + error.message);
            state.processingAction = false;
            window.setLoading(false);
            return;
        }
        if (data && data.length > 0) {
            const newRoom = data[0];
            if (rawPass) {
                const accessHash = await sha256(rawPass + roomSalt);
                await db.rpc('set_room_password', {
                    p_room_id: newRoom.id,
                    p_hash: accessHash
                });
            }
            await localDB.put('rooms', newRoom);
            state.lastCreated = newRoom;
            state.lastCreatedPass = rawPass;
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
        if (state.isOfflineMode) {
            window.toast("Attempting access...");
            window.openVault(state.pending.id, state.pending.name, inputPass, state.pending.salt, state.pending);
            return;
        }
        const inputHash = await sha256(inputPass + state.pending.salt);
        window.setLoading(true, "Verifying...");
        const {
            data
        } = await db.rpc('verify_room_password', {
            p_room_id: state.pending.id,
            p_hash: inputHash
        });
        window.setLoading(false);
        if (data === true) window.openVault(state.pending.id, state.pending.name, inputPass, state.pending.salt, state.pending);
        else window.toast("Access Denied.");
    };

    window.handleLogout = async (e) => {
        if (!e || !e.isTrusted) return;
        window.setLoading(true, "Leaving...");
        await cleanupChannels();
        localStorage.removeItem('hrn_auth');
        state.user = null;
        setAppMode(false);
        state.isCapacityBlocked = false;
        await db.auth.signOut();
        if (state.authListener) {
            state.authListener.unsubscribe();
            state.authListener = null;
        }
        window.nav('scr-start');
        window.setLoading(false);
    };

    window.copySId = () => {
        navigator.clipboard.writeText(state.lastCreated.id);
        window.toast("ID Copied.");
    };

    window.enterCreated = () => {
        window.openVault(state.lastCreated.id, state.lastCreated.name, state.lastCreatedPass, state.lastCreated.salt, state.lastCreated);
        state.lastCreatedPass = null;
    };

    const {
        data: {
            subscription
        }
    } = db.auth.onAuthStateChange(async (ev, ses) => {
        if (state.isOfflineMode && !ses) return;
        state.user = ses?.user;
        if (state.user && !state.isOfflineMode) setupGlobalPresence(state.user.id);
        const createBtn = $('icon-plus-lobby');
        if (createBtn) createBtn.style.display = 'flex';
        if (ev === 'SIGNED_OUT') {
            if (state.heartbeatInterval) clearInterval(state.heartbeatInterval);
            if (state.presenceChannel) state.presenceChannel.unsubscribe();
            if (state.chatChannel) state.chatChannel.unsubscribe();
            if (state.globalPresenceChannel) state.globalPresenceChannel.unsubscribe();
            window.nav('scr-start');
        }
    });
    state.authListener = subscription;

    window.nav = (id, direction = null) => {
        if (state.isNavigating) return;
        state.isNavigating = true;
        requestAnimationFrame(() => {
            const current = document.querySelector('.screen.active');
            const next = $(id);
            if (!next) {
                state.isNavigating = false;
                return;
            }
            if (id === 'scr-create') {
                state.currentStep.create = 1;
                state.selectedAllowedUsers = [];
                state.createType = 'group';
                updateStepUI('create');
                $('c-name').value = '';
                $('c-target-user').value = '';
                $('c-pass').value = '';
                $('c-avatar').value = '';
                document.querySelectorAll('.type-card').forEach(el => el.classList.remove('selected'));
                $('type-group').classList.add('selected');
            }
            if (id === 'scr-register') {
                state.currentStep.reg = 1;
                state.selectedAvatar = null;
                $('r-name').value = '';
                $('r-email').value = '';
                $('r-pass').value = '';
                $('r-avatar-url').value = '';
                updateStepUI('reg');
            }
            if (id === 'scr-account') window.prepareAccountPage();
            document.querySelectorAll('.screen').forEach(s => s.classList.remove('slide-left', 'slide-right'));
            if (direction === 'left') {
                if (current) current.classList.add('slide-left');
                next.classList.remove('slide-right');
            } else if (direction === 'right') {
                if (current) current.classList.add('slide-right');
                next.classList.remove('slide-left');
            } else {
                document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
            }
            document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
            next.classList.add('active');
            const createBtn = $('icon-plus-lobby');
            if (createBtn) createBtn.style.display = 'flex';
            if (id === 'scr-lobby') updateLobbyAvatar();
            setTimeout(() => {
                state.isNavigating = false;
            }, 400);
        });
    };

    window.refreshLobby = async () => {
        const now = Date.now();
        if (now - state.lastLobbyRefresh < 10000) return window.toast(`Wait ${Math.ceil((10000 - (now - state.lastLobbyRefresh)) / 1000)}s.`);
        state.lastLobbyRefresh = now;
        await window.loadRooms();
    };

    window.loadRooms = async () => {
        if (!state.user) return;
        const uid = state.user.id;
        const processRooms = async (rooms) => {
            const processed = [];
            const promises = rooms.map(async (r) => {
                if (!r || !r.id) return null;
                let name = r.name,
                    avatar = r.avatar_url;
                if (r.is_direct && r.allowed_users) {
                    const otherId = r.allowed_users.find(id => id !== uid);
                    if (otherId) {
                        const profile = await getProfile(otherId);
                        if (profile) {
                            name = profile.full_name;
                            avatar = profile.cached_avatar || profile.avatar_url;
                        }
                    }
                }
                return {
                    ...r,
                    display_name: name,
                    display_avatar: avatar
                };
            });
            return (await Promise.all(promises)).filter(Boolean);
        };

        const localRooms = await localDB.getAll('rooms');
        if (localRooms.length > 0) {
            state.allRooms = await processRooms(localRooms);
            window.filterRooms();
        }
        if (state.isOfflineMode) return;
        window.setLoading(true, "Syncing...");
        const {
            data: rooms,
            error
        } = await db.from('rooms').select('*').order('created_at', {
            ascending: false
        });
        if (error) {
            window.toast("Sync failed.");
            window.setLoading(false);
            return;
        }
        if (rooms && rooms.length > 0) {
            await localDB.clear('rooms');
            await localDB.putAll('rooms', rooms);
            state.allRooms = await processRooms(rooms);
            await localDB.saveUserTree(uid, rooms);
            window.filterRooms();
        }
        window.setLoading(false);
        updateLobbyAvatar();
    };

    window.filterRooms = () => {
        const q = $('search-bar').value.toLowerCase();
        const list = $('room-list');
        const uid = state.user?.id;
        const filtered = state.allRooms.filter(r => {
            if (!r.is_direct && !r.is_visible) return false;
            const name = r.display_name || r.name || '';
            if (!name.toLowerCase().includes(q)) return false;
            return true;
        });
        if (filtered.length === 0) list.innerHTML = `<div style="text-align:center;padding:40px 20px;color:var(--text-mute)"><i data-lucide="folder" style="width:40px;height:40px;margin-bottom:12px;color:#d1d1d6"></i><div style="font-size:14px;font-weight:700;color:var(--text-main)">No groups yet.</div></div>`;
        else list.innerHTML = filtered.map(r => `<div class="room-card" onclick="window.joinAttempt('${r.id}')"><div class="chat-avatar" style="width:36px;height:36px;margin-right:10px;font-size:13px">${r.display_avatar ? `<img src="${r.display_avatar}">` : (r.display_name||'G').charAt(0)}</div><span class="room-name">${esc(r.display_name)}</span><span class="room-icon">${r.is_direct ? '<i data-lucide="user" style="width:14px;height:14px"></i>' : ''}${r.has_password ? '<i data-lucide="lock" style="width:14px;height:14px"></i>' : ''}</span></div>`).join('');
    };

    window.joinAttempt = async (id) => {
        const meta = await localDB.get('rooms', id);
        const openLocal = async () => {
            if (meta && meta.id) {
                state.pending = {
                    id: meta.id,
                    name: meta.name,
                    salt: meta.salt
                };
                if (meta.has_password) {
                    window.nav('scr-gate');
                } else {
                    await window.openVault(meta.id, meta.name, null, meta.salt, meta);
                }
            } else {
                window.toast("Room not found in cache.");
            }
        };
        if (state.isOfflineMode) {
            await openLocal();
            return;
        }
        window.setLoading(true, "Accessing...");
        try {
            const {
                data: canAccess,
                error: rpcError
            } = await db.rpc('can_access_room', {
                p_room_id: id
            });
            if (rpcError) throw rpcError;
            if (!canAccess) throw new Error("Access denied.");
            const {
                data,
                error
            } = await db.from('rooms').select('*').eq('id', id).single();
            if (error) throw error;
            window.setLoading(false);
            if (data && data.id) await localDB.put('rooms', data);
            state.pending = {
                id: data.id,
                name: data.name,
                salt: data.salt
            };
            if (data.has_password) window.nav('scr-gate');
            else window.openVault(data.id, data.name, null, data.salt, data);
        } catch (e) {
            window.setLoading(false);
            setAppMode(true);
            await openLocal();
        }
    };

    window.joinPrivate = async () => {
        if (!state.user) return window.toast("Login required.");
        const id = $('join-id').value.trim();
        if (!id) return;
        if (state.isOfflineMode) {
            const meta = await localDB.get('rooms', id);
            if (meta) window.joinAttempt(id);
            else window.toast("Cannot join new rooms offline.");
            return;
        }
        window.setLoading(true, "Checking...");
        try {
            const {
                data: canAccess
            } = await db.rpc('can_access_room', {
                p_room_id: id
            });
            if (!canAccess) {
                window.setLoading(false);
                return window.toast("Access denied or not found.");
            }
            const {
                data
            } = await db.from('rooms').select('*').eq('id', id).single();
            window.setLoading(false);
            if (data) {
                await localDB.put('rooms', data);
                state.pending = {
                    id: data.id,
                    name: data.name,
                    salt: data.salt
                };
                if (data.has_password) window.nav('scr-gate');
                else window.openVault(data.id, data.name, null, data.salt, data);
            } else window.toast("Not found.");
        } catch (e) {
            window.setLoading(false);
            window.toast("Network error.");
        }
    };
    
    const localDB = {
        db: null,
        async init() {
            return new Promise((resolve, reject) => {
                const request = indexedDB.open(DB_NAME, DB_VERSION);
                request.onerror = (e) => reject(request.error);
                request.onsuccess = () => {
                    this.db = request.result;
                    resolve();
                };
                request.onupgradeneeded = (e) => {
                    const db = e.target.result;
                    const tx = e.target.transaction;
                    if (!db.objectStoreNames.contains('rooms')) db.createObjectStore('rooms', {
                        keyPath: 'id'
                    });
                    if (!db.objectStoreNames.contains('messages')) {
                        const ms = db.createObjectStore('messages', {
                            keyPath: 'id'
                        });
                        ms.createIndex('room_id', 'room_id', {
                            unique: false
                        });
                    } else {
                        const ms = tx.objectStore('messages');
                        if (!ms.indexNames.contains('room_id')) ms.createIndex('room_id', 'room_id', {
                            unique: false
                        });
                    }
                    if (!db.objectStoreNames.contains('profiles')) db.createObjectStore('profiles', {
                        keyPath: 'id'
                    });
                    if (!db.objectStoreNames.contains('keys')) db.createObjectStore('keys', {
                        keyPath: 'room_id'
                    });
                    if (!db.objectStoreNames.contains('known_users')) db.createObjectStore('known_users', {
                        keyPath: 'id'
                    });
                    if (!db.objectStoreNames.contains('user_tree')) db.createObjectStore('user_tree', {
                        keyPath: 'user_id'
                    });
                };
            });
        },
        async get(store, key) {
            return new Promise(async (res, rej) => {
                if (!this.db) return rej("DB not init");
                const tx = this.db.transaction(store, 'readonly');
                const req = tx.objectStore(store).get(key);
                req.onsuccess = async () => {
                    const result = req.result;
                    if (result && (store === 'rooms' || store === 'profiles' || store === 'known_users' || store === 'messages')) {
                        if (result.encryptedData) {
                            const decrypted = await decryptValue(result.encryptedData);
                            res(decrypted);
                        } else {
                            res(result);
                        }
                    } else {
                        res(result);
                    }
                };
                req.onerror = () => rej(req.error);
            });
        },
        async getAll(store) {
            return new Promise(async (res, rej) => {
                if (!this.db) return res([]);
                const tx = this.db.transaction(store, 'readonly');
                const req = tx.objectStore(store).getAll();
                req.onsuccess = async () => {
                    const results = req.result || [];
                    if (store === 'rooms' || store === 'profiles' || store === 'known_users' || store === 'messages') {
                        const decrypted = [];
                        for (const item of results) {
                            if (item.encryptedData) {
                                const d = await decryptValue(item.encryptedData);
                                if (d) decrypted.push({ id: item.id, ...d });
                            } else {
                                decrypted.push(item);
                            }
                        }
                        res(decrypted);
                    } else {
                        res(results);
                    }
                };
                req.onerror = () => rej(req.error);
            });
        },
        async put(store, val) {
            if (!val || !val.id) return;
            return new Promise(async (res, rej) => {
                if (!this.db) return rej("DB not init");
                const tx = this.db.transaction(store, 'readwrite');
                const os = tx.objectStore(store);
                
                let toStore = val;
                if (store === 'rooms' || store === 'profiles' || store === 'known_users' || store === 'messages') {
                    const { id, ...rest } = val;
                    const encryptedData = await encryptValue(rest);
                    toStore = { id, encryptedData };
                }
                
                const req = os.put(toStore);
                req.onsuccess = () => res();
                req.onerror = () => rej(req.error);
            });
        },
        async putAll(store, vals) {
            if (!vals || vals.length === 0) return;
            return new Promise(async (res, rej) => {
                if (!this.db) return rej("DB not init");
                const tx = this.db.transaction(store, 'readwrite');
                const os = tx.objectStore(store);
                
                const encrypteds = await Promise.all(vals.map(async v => {
                    if (!v || !v.id) return null;
                    if (store === 'rooms' || store === 'profiles' || store === 'known_users' || store === 'messages') {
                        const { id, ...rest } = v;
                        const encryptedData = await encryptValue(rest);
                        return { id, encryptedData };
                    }
                    return v;
                }));

                encrypteds.forEach(v => {
                    if (v) os.put(v);
                });
                tx.oncomplete = () => res();
                tx.onerror = () => rej(tx.error);
            });
        },
        async clear(store) {
            return new Promise((res, rej) => {
                if (!this.db) return res();
                const tx = this.db.transaction(store, 'readwrite');
                const req = tx.objectStore(store).clear();
                req.onsuccess = () => res();
                req.onerror = () => rej(req.error);
            });
        },
        async delete(store, key) {
            return new Promise((res, rej) => {
                if (!this.db) return res();
                const tx = this.db.transaction(store, 'readwrite');
                const req = tx.objectStore(store).delete(key);
                req.onsuccess = () => res();
                req.onerror = () => rej(req.error);
            });
        },
        async getRoomMessages(roomId) {
            const all = await this.getAll('messages');
            return all.filter(m => m.room_id === roomId).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        },
        async clearRoomMessages(roomId) {
            return new Promise((resolve, reject) => {
                if (!this.db) return reject();
                const tx = this.db.transaction('messages', 'readwrite');
                const store = tx.objectStore('messages');
                const index = store.index('room_id');
                const req = index.openCursor(IDBKeyRange.only(roomId));
                req.onsuccess = (e) => {
                    const cursor = e.target.result;
                    if (cursor) {
                        cursor.delete();
                        cursor.continue();
                    }
                };
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
            });
        },
        async saveUserTree(userId, rooms) {
            return this.put('user_tree', {
                user_id: userId,
                room_ids: rooms.map(r => r.id),
                timestamp: Date.now()
            });
        },
        async getUserTree(userId) {
            return this.get('user_tree', userId);
        }
    };

    const init = async () => {
        await localDB.init();
        monitorConnection();
        const hasMaster = await checkMaster();
        if (hasMaster) {
            state.isMasterTab = false;
            $('block-overlay').classList.add('active');
        } else {
            state.isMasterTab = true;
            tabChannel.postMessage({
                type: 'CLAIM_MASTER',
                id: state.tabId
            });
            if (navigator.onLine) setupGlobalPresence(null);
        }
        const storedEnc = localStorage.getItem('hrn_auth');
        if (storedEnc) {
            const creds = await decryptValue(storedEnc);
            if (creds && creds.e && creds.p) {
                window.setLoading(true, "Logging in...");
                if (navigator.onLine) {
                    const {
                        error
                    } = await db.auth.signInWithPassword({
                        email: creds.e,
                        password: creds.p
                    });
                    if (!error) {
                        const {
                            data: {
                                user
                            }
                        } = await db.auth.getUser();
                        state.user = user;
                        setAppMode(false);
                        const hashInput = await sha256(creds.p + creds.e);
                        await localDB.put('known_users', {
                            id: creds.e,
                            pass_hash: hashInput,
                            email: creds.e,
                            metadata: user.user_metadata,
                            userId: user.id
                        });
                        window.nav('scr-lobby');
                        window.loadRooms();
                        window.setLoading(false);
                        return;
                    }
                }
                const offlineOk = await attemptOfflineLogin(creds.e, creds.p);
                if (offlineOk) {
                    setAppMode(true);
                    window.nav('scr-lobby');
                    window.loadRooms();
                    window.setLoading(false);
                    window.toast("Offline login successful.");
                    return;
                }
            }
        }
        window.nav('scr-start');
        window.setLoading(false);
    };
    init();
}
