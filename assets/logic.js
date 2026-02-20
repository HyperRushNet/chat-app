// GH: HyperRushNet // 2026 // MIT License // index.html

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

export function startChatApp(customConfig = {}) {
    const CONFIG = {
        supabaseUrl: customConfig.supabaseUrl || "https://jnhsuniduzvhkpexorqk.supabase.co",
        supabaseKey: customConfig.supabaseKey || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpuaHN1bmlkdXp2aGtwZXhvcnFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE1NjAxMDYsImV4cCI6MjA4NzEzNjEwNn0.9I5bbqskCgksUaNWYlFFo0-6Odht28pOMdxTGZECahY",
        mailApi: customConfig.mailApi || "https://vercel-serverless-gray-sigma.vercel.app/api/mailAPI",
        maxUsers: customConfig.maxUsers || 475,
        maxMessages: customConfig.maxMessages || 15,
        historyLoadLimit: customConfig.historyLoadLimit || 10,
        rateLimitMs: customConfig.rateLimitMs || 1000,
        presenceHeartbeatMs: customConfig.presenceHeartbeatMs || 10000,
        reconnectDebounceMs: customConfig.reconnectDebounceMs || 3000,
        verificationCodeExpiry: customConfig.verificationCodeExpiry || 600,
    };

    const AVATARS = [
        'https://cdn-icons-png.flaticon.com/512/6997/6997676.png','https://cdn-icons-png.flaticon.com/512/236/236831.png','https://cdn-icons-png.freepik.com/256/6997/6997667.png?semt=ais_white_label','https://cdn-icons-png.flaticon.com/512/6997/6997668.png','https://img.freepik.com/free-photo/sunset-time-tropical-beach-sea-with-coconut-palm-tree_74190-1075.jpg?semt=ais_user_personalization&w=740&q=80','https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTECqduTKufgQgmfy7ZUMpWOrFXNyHpNWQvPA&s'
    ];

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
        currentPickerContext: null,
        lastLobbyRefresh: 0,
        removePasswordFlag: false,
        longPressTimer: null,
        currentStep: { create: 1, edit: 1, reg: 1 },
        selectedAvatar: null,
        createType: 'group'
    };

    const FLAG_LOGOUT = 'hrn_flag_force_logout';

    let toastQueue = [];
    let toastVisible = false;

    const tabChannel = new BroadcastChannel('hrn_tab_sync');

    const db = createClient(CONFIG.supabaseUrl, CONFIG.supabaseKey, {
        auth: { persistSession: true, autoRefreshToken: true },
        realtime: { params: { eventsPerSecond: 10 } }
    });

    const esc = t => {
        const p = document.createElement('p');
        p.textContent = t;
        return p.innerHTML;
    };

    const truncateText = (text, maxLength = 20) => {
        if (!text) return "";
        return text.length > maxLength ? text.substring(0, maxLength) + "..." : text;
    };

    const $ = id => document.getElementById(id);

    const updateOnlineDisplay = (count) => {
        if (typeof count === 'number') state.lastKnownOnlineCount = count;
        const displayCount = (typeof count === 'number') ? count : '--';
        document.querySelectorAll('.live-count').forEach(el => {
            if (el.innerText !== displayCount.toString()) el.innerText = displayCount;
        });
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

    const updateAccessSummary = (prefix) => {
        const summaryEl = $(`${prefix}-access-summary`);
        if (!summaryEl) return;
        const count = state.selectedAllowedUsers.length;
        const text = count === 0 ? "Public Room" : `${count} User${count > 1 ? 's' : ''}`;
        summaryEl.innerHTML = `<span class="c-main">${text}</span><i data-lucide="chevron-right" class="w-16 h-16"></i>`;
        lucide.createIcons();
    };

    const updateStepUI = (context) => {
        const current = state.currentStep[context];
        const indicator = $(`${context}-step-indicator`);
        if(!indicator) return;

        indicator.querySelectorAll('.step-dot').forEach((dot, index) => {
            if(index < current) dot.classList.add('active');
            else dot.classList.remove('active');
        });

        $(`${context}-step-1`).classList.toggle('active', current === 1);
        $(`${context}-step-2`).classList.toggle('active', current === 2);

        if(context === 'reg') {
            $('reg-step-1').classList.toggle('active', current === 1);
            $('reg-step-2').classList.toggle('active', current === 2);
            if(current === 2) initAvatarGrid();
        }

        lucide.createIcons();
    };

    const initAvatarGrid = () => {
        const grid = $('avatar-grid');
        if(!grid || grid.children.length > 0) return;
        grid.innerHTML = AVATARS.map((url, i) => `
        <div class="avatar-option ${state.selectedAvatar === url ? 'selected' : ''}" onclick="window.selectAvatar('${url}', this)">
        <img src="${url}" alt="Avatar">
        </div>
        `).join('');
    };

    window.selectAvatar = (url, el) => {
        state.selectedAvatar = url;
        $('r-avatar-url').value = '';
        document.querySelectorAll('.avatar-option').forEach(el => el.classList.remove('selected'));
        el.classList.add('selected');
    };

    window.selectCreateType = (type) => {
        state.createType = type;
        document.querySelectorAll('.type-card').forEach(el => el.classList.remove('selected'));
        $(`type-${type}`).classList.add('selected');
    };

    window.nextRegStep = () => {
        const n = $('r-name').value, em = $('r-email').value, p = $('r-pass').value;
        if(!n || !em || p.length < 8) return window.toast("Complete fields (min 8 chars password)");
        state.currentStep.reg = 2;
        updateStepUI('reg');
    };

    window.prevRegStep = () => {
        state.currentStep.reg = 1;
        updateStepUI('reg');
    };

    window.nextCreateStep = () => {
        state.currentStep.create = 2;
        updateStepUI('create');

        if(state.createType === 'direct') {
            $('create-group-fields').classList.add('dn');
            $('create-direct-fields').classList.remove('dn');
            $('create-access-summary').classList.add('dn');
            $('create-step2-title').innerText = "Direct Message";
            $('create-step2-sub').innerText = "Who are you messaging?";
        } else {
            $('create-group-fields').classList.remove('dn');
            $('create-direct-fields').classList.add('dn');
            $('create-access-summary').classList.remove('dn');
            $('create-step2-title').innerText = "Setup";
            $('create-step2-sub').innerText = "Details";
        }

        updateAccessSummary('create');
    };

    window.prevCreateStep = () => {
        state.currentStep.create = 1;
        updateStepUI('create');
    };

    window.nextEditStep = () => {
        const name = $('edit-room-name').value.trim();
        if(!name) return window.toast("Name required");
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
                const { data: profiles } = await db.from('profiles').select('id, full_name, avatar_url').in('id', ids);
                state.selectedAllowedUsers = ids.map(id => {
                    const p = profiles?.find(pro => pro.id === id);
                    return { id: id, name: p?.full_name || 'Unknown', avatar: p?.avatar_url };
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
            container.innerHTML = `<div style="color:var(--text-mute);padding:20px 0;font-size:12px;text-align:center">No users selected.</div>`;
            $('picker-count').innerText = '0';
            return;
        }

        $('picker-count').innerText = displayUsers.length;

        container.innerHTML = displayUsers.map(u => `
        <div class="picker-user-card" style="display:flex;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
        <div style="width:28px;height:28px;border-radius:50%;background:#f2f2f7;overflow:hidden;margin-right:8px;display:flex;align-items:center;justify-content:center;color:var(--accent);font-weight:800;font-size:11px">${u.avatar ? `<img src="${u.avatar}" style="width:100%;height:100%;object-fit:cover">` : u.name.charAt(0)}</div>
        <div style="flex:1;min-width:0">
        <div style="font-weight:700;font-size:12px">${esc(u.name)} ${u.id === state.user.id ? '<span style="color:var(--text-mute);font-weight:500">(You)</span>' : ''}</div>
        <div style="font-size:9px;color:var(--text-mute);font-family:monospace">${u.id}</div>
        </div>
        <button class="picker-remove-btn" style="background:transparent;border:none;color:var(--danger);cursor:pointer;padding:8px" onclick="window.removePickerUser('${u.id}')">
        <i data-lucide="x" style="width:14px;height:14px"></i>
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
        if (!id) return window.toast("Enter ID");

        if (state.selectedAllowedUsers.find(u => u.id === id)) return window.toast("User already added");

        window.setLoading(true, "Fetching...");
        const { data, error } = await db.from('profiles').select('id, full_name, avatar_url').eq('id', id).single();
        window.setLoading(false);

        if (error || !data) return window.toast("User not found");

        state.selectedAllowedUsers.push({ id: data.id, name: data.full_name, avatar: data.avatar_url });
        renderPickerSelectedUsers();
        input.value = '';
        window.toast("Added");
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
            if (state.isMasterTab) tabChannel.postMessage({ type: 'PONG_MASTER' });
        }
    };

    window.addEventListener('beforeunload', () => tabChannel.postMessage({ type: 'CLAIM_MASTER', id: state.tabId }));

    const checkMaster = () => {
        return new Promise((resolve) => {
            let masterFound = false;
            const handler = (ev) => { if (ev.data.type === 'PONG_MASTER') masterFound = true; };
            tabChannel.addEventListener('message', handler);
            tabChannel.postMessage({ type: 'PING_MASTER' });
            setTimeout(() => { tabChannel.removeEventListener('message', handler); resolve(masterFound); }, 300);
        });
    };

    window.closeOverlay = () => $('overlay-container').classList.remove('active');
    window.showOverlayView = (viewId) => {
        const panel = document.querySelector('.panel-card');
        if(!panel) return;
        panel.querySelectorAll('.view-content').forEach(v => v.classList.remove('active'));
        const target = $(`view-${viewId}`);
        if(target) { target.classList.add('active'); lucide.createIcons(); }
    };
    
    window.prepareAccountPage = async () => {
        if(!state.user) return;
        
        const { data: profile } = await db.from('profiles').select('avatar_url, full_name').eq('id', state.user.id).single();
        
        const name = profile?.full_name || state.user.user_metadata?.full_name || "User";
        const avatar = profile?.avatar_url || state.user.user_metadata?.avatar_url;
        
        $('acc-page-name').innerText = name;
        $('acc-page-type').innerText = "Full Account";
        $('acc-page-id').innerText = state.user.id;
        
        const avPrev = $('acc-page-avatar');
        if(avatar) { avPrev.innerHTML = `<img src="${avatar}">`; }
        else { avPrev.innerText = name.charAt(0); }

        const emailWrapper = $('acc-email-wrapper');
        emailWrapper.style.display = 'block';
        $('acc-page-email').innerText = state.user.email || "Not set";
        
        lucide.createIcons();
    };

    window.copyAccountId = () => {
        if(!state.user) return;
        navigator.clipboard.writeText(state.user.id);
        window.toast("ID Copied");
    };

    const updateLobbyAvatar = async () => {
        if(!state.user) return;
        const btn = $('lobby-avatar-btn');
        if(!btn) return;
        
        let avatar = state.user.user_metadata?.avatar_url;
        let name = state.user.user_metadata?.full_name;
        
        if(!avatar || !name) {
             const { data } = await db.from('profiles').select('avatar_url, full_name').eq('id', state.user.id).single();
             if(data) {
                 avatar = data.avatar_url;
                 name = data.full_name;
             }
        }
        
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

    const showTooltip = (e, content) => {
        const tooltip = $('context-tooltip');
        tooltip.innerHTML = content;
        tooltip.classList.add('active');
        let x = e.clientX || e.touches?.[0]?.clientX;
        let y = e.clientY || e.touches?.[0]?.clientY;
        tooltip.style.left = `${x}px`;
        tooltip.style.top = `${y - 40}px`;
        if (tooltip.offsetLeft < 10) tooltip.style.left = '10px';
        if (tooltip.offsetTop < 10) tooltip.style.top = `${y + 10}px`;
    };

    const hideTooltip = () => $('context-tooltip').classList.remove('active');

    const renderMsg = (m, prevMsg, isDirect) => {
        let html = "";
        const msgDateObj = new Date(m.created_at);
        const currentLabel = getDateLabel(msgDateObj);
        const isGroupStart = !prevMsg || prevMsg.user_id !== m.user_id || getDateLabel(new Date(prevMsg.created_at)) !== currentLabel;

        if (isGroupStart && currentLabel !== state.lastRenderedDateLabel) {
            html += `<div class="date-divider"><span class="date-label">${currentLabel}</span></div>`;
            state.lastRenderedDateLabel = currentLabel;
        }

        const displayName = truncateText(m.user_name || 'User', 18);
        const processedText = processText(m.text);
        const msgClass = isGroupStart ? 'group-start' : 'msg-continuation';
        const sideClass = m.user_id === state.user?.id ? 'me' : 'not-me';
        const fullDate = msgDateObj.toLocaleString('en-GB', { dateStyle: 'full', timeStyle: 'short' });
        const tooltipContent = `<b>${esc(m.user_name || 'User')}</b><br>${fullDate}`;

        html += `
        <div class="msg ${sideClass} ${msgClass}" data-time="${m.created_at}" data-tooltip="${esc(tooltipContent)}" oncontextmenu="event.preventDefault(); showTooltip(event, this.dataset.tooltip)" ontouchstart="window.startMsgTimer(event, this)" ontouchend="window.clearMsgTimer()" ontouchmove="window.clearMsgTimer()">
        ${isGroupStart && !isDirect ? `<div class="msg-header"><span class="msg-user">${esc(displayName)}</span></div>` : ''}
        <div>${processedText}</div>
        <span class="msg-time">${esc(m.time)}</span>
        </div>`;
        return html;
    };

    window.startMsgTimer = (e, el) => { state.longPressTimer = setTimeout(() => showTooltip(e, el.dataset.tooltip), 500); };
    window.clearMsgTimer = () => { if(state.longPressTimer) clearTimeout(state.longPressTimer); state.longPressTimer = null; };

    document.addEventListener('click', hideTooltip);

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
        const { data, error } = await db.from('messages').select('*').eq('room_id', state.currentRoomId).lt('created_at', state.oldestMessageTimestamp).order('created_at', { ascending: false }).limit(CONFIG.historyLoadLimit);
        $('history-loader')?.remove();
        if (error || !data || data.length === 0) { state.hasMoreHistory = false; state.isLoadingHistory = false; return; }
        data.reverse();
        pendingCallbacks['historyDecrypted'] = async (res) => {
            const validMsgs = res.results.filter(m => !m.error);
            if (validMsgs.length > 0) {
                state.oldestMessageTimestamp = validMsgs[0].created_at;
                let html = "", prev = null;
                validMsgs.forEach(m => { html += renderMsg(m, prev, state.currentRoomData?.is_direct); prev = m; });
                container.insertAdjacentHTML('afterbegin', html);
                container.scrollTop = container.scrollHeight - oldScrollHeight;
            }
            state.isLoadingHistory = false;
        };
        cryptoWorker.postMessage({ type: 'decryptHistory', payload: { messages: data } });
    };

    window.openVault = async (id, n, rawPassword, roomSalt) => {
        if (!state.user) return window.toast("Please login first");
        window.setLoading(true, "Decrypting...");
        if (state.chatChannel) state.chatChannel.unsubscribe();
        state.currentRoomId = id;
        state.lastRenderedDateLabel = null;
        state.oldestMessageTimestamp = null;
        state.hasMoreHistory = true;
        state.isLoadingHistory = false;

        $('chat-messages').innerHTML = '<div id="chat-empty-state" style="inset:0;z-index:5;background:var(--bg);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 20px;width:100%"><i data-lucide="message-circle" style="width:40px;height:40px;color:#d1d1d6;margin-bottom:12px"></i><div style="font-size:14px;font-weight:700;color:var(--text-main)">No messages yet</div></div>';
        $('chat-messages').onscroll = handleScroll;

        const keySource = rawPassword ? (rawPassword + id) : id;
        try { await deriveKey(keySource, roomSalt); }
        catch(e) { window.setLoading(false); return window.toast("Key derivation failed"); }

        const { data: room } = await db.from('rooms').select('*').eq('id', id).single();
        state.currentRoomData = room;

        const isDirect = room.is_direct;
        let displayTitle = n;
        let displayAvatar = room.avatar_url;

        if (isDirect) {
            const otherUserId = room.allowed_users?.find(uid => uid !== state.user.id);
            if (otherUserId) {
                const { data: profile } = await db.from('profiles').select('full_name, avatar_url').eq('id', otherUserId).single();
                if (profile) { displayTitle = profile.full_name; displayAvatar = profile.avatar_url; }
            }
        }

        $('chat-title').innerText = displayTitle;
        const avEl = $('chat-avatar-display');
        if (displayAvatar) avEl.innerHTML = `<img src="${displayAvatar}">`;
        else avEl.innerText = displayTitle.charAt(0).toUpperCase();

        const isOwner = room && room.created_by === state.user.id;
        // Hide settings icon for DMs even if owner
        if ($('room-settings-icon')) $('room-settings-icon').style.display = (isOwner && !isDirect) ? 'block' : 'none';

        window.setLoading(true, "Fetching History...");
        const { data } = await db.from('messages').select('*').eq('room_id', id).order('created_at', { ascending: false }).limit(CONFIG.maxMessages);
        
        $('chat-input').style.display = 'block';
        $('send-btn').style.display = 'flex';
        window.nav('scr-chat');

        if (data && data.length > 0) {
            data.reverse();
            if (data.length > 0) state.oldestMessageTimestamp = data[0].created_at;
            window.setLoading(true, "Decrypting...");
            pendingCallbacks['historyDecrypted'] = async (res) => {
                const b = $('chat-messages');
                b.innerHTML = '';
                let prev = null;
                res.results.forEach(m => { if(!m.error) { b.insertAdjacentHTML('beforeend', renderMsg(m, prev, isDirect)); prev = m; } });
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

        state.chatChannel = db.channel(`room_chat_${id}`, { config: { broadcast: { self: true } } });
        state.chatChannel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${id}` }, async (payload) => {
            const m = payload.new;
            if (m && state.currentRoomId) {
                pendingCallbacks['singleDecrypted'] = async (decRes) => {
                    if(decRes.result) {
                        const msgObj = { ...m, time: decRes.result.time, text: decRes.result.text };
                        const container = $('chat-messages');
                        const lastMsg = container.querySelector('.msg:last-of-type');
                        let prevMsg = null;
                        if(lastMsg) prevMsg = { user_id: lastMsg.classList.contains('me') ? state.user.id : 'other', created_at: lastMsg.dataset.time };
                        container.insertAdjacentHTML('beforeend', renderMsg(msgObj, prevMsg, isDirect));
                        container.scrollTop = container.scrollHeight;
                        checkChatEmpty();
                    }
                };
                cryptoWorker.postMessage({ type: 'decryptSingle', payload: { content: m.content } });
            }
        }).subscribe((status) => state.isChatChannelReady = (status === 'SUBSCRIBED'));
    };

    const applyRateLimit = () => {
        const now = Date.now();
        if (now - state.lastMessageTime < CONFIG.rateLimitMs) {
            const wait = CONFIG.rateLimitMs - (now - state.lastMessageTime);
            $('chat-input-area').classList.add('rate-limited');
            setTimeout(() => $('chat-input-area').classList.remove('rate-limited'), wait);
            return false;
        }
        return true;
    };

    window.sendMsg = async (e) => {
        if (!e || !e.isTrusted) return;
        if (!state.user || !state.currentRoomId || state.processingAction || !state.isChatChannelReady) return;
        if (!applyRateLimit()) return;
        state.processingAction = true;
        const v = $('chat-input').value.trim();
        if(!v) { state.processingAction = false; return; }
        $('chat-input').value = '';
        state.lastMessageTime = Date.now();
        try {
            const enc = await encryptMessage(v);
            await db.from('messages').insert([{ room_id: state.currentRoomId, user_id: state.user.id, user_name: state.user.user_metadata?.full_name, content: enc }]);
        } catch(e) { window.toast("Failed to send"); }
        state.processingAction = false;
    };

    window.leaveChat = async () => {
        window.setLoading(true, "Leaving...");
        if(state.chatChannel) state.chatChannel.unsubscribe();
        state.chatChannel = null; state.currentRoomId = null; state.currentRoomData = null;
        if ($('room-settings-icon')) $('room-settings-icon').style.display = 'none';
        window.nav('scr-lobby');
        window.loadRooms();
        window.setLoading(false);
    };

    window.handleLogin = async (e) => {
        if (!e || !e.isTrusted) return;
        if(state.processingAction) return;
        state.processingAction = true;
        const em = $('l-email').value, p = $('l-pass').value;
        if(!em || !p) { window.toast("Input missing"); state.processingAction = false; return; }
        window.setLoading(true, "Signing In...");
        localStorage.removeItem(FLAG_LOGOUT);
        const {error} = await db.auth.signInWithPassword({email:em, password:p});
        if(error) { window.toast(error.message); window.setLoading(false); }
        else await initPresence(true);
        state.processingAction = false;
    };

    window.handleRegister = async (e) => {
        if (!e || !e.isTrusted) return;
        if(state.processingAction) return;
        state.processingAction = true;
        const n=$('r-name').value, em=$('r-email').value.trim().toLowerCase(), p=$('r-pass').value;
        const customAvatar = $('r-avatar-url').value.trim();
        const avatarUrl = customAvatar || state.selectedAvatar;
        if(!n || !em || p.length < 8) { window.toast("Check inputs"); state.processingAction = false; return; }
        window.setLoading(true, "Sending Code...");
        const [r, err] = await safeAwait(fetch(CONFIG.mailApi, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send", email: em }) }));
        if(r) {
            if(r.status === 429) { window.toast("Rate limited"); state.processingAction = false; window.setLoading(false); return; }
            const j = await r.json();
            if(j.message === "Code sent") { sessionStorage.setItem('temp_reg', JSON.stringify({n, em, p, avatar: avatarUrl})); window.nav('scr-verify'); startVTimer(); window.setLoading(false); }
            else { window.toast(j.message || "Error"); window.setLoading(false); }
        } else { window.toast("Network error"); window.setLoading(false); }
        state.processingAction = false;
    };

    const startVTimer = () => {
        let left = CONFIG.verificationCodeExpiry;
        if(state.vTimer) clearInterval(state.vTimer);
        state.vTimer = setInterval(() => { left--; $('v-timer').innerText = `${Math.floor(left/60)}:${(left%60).toString().padStart(2,'0')}`; if(left<=0) { clearInterval(state.vTimer); window.nav('scr-register'); } }, 1000);
    };

    window.handleVerify = async (e) => {
        if (!e || !e.isTrusted) return;
        if(state.processingAction) return;
        state.processingAction = true;
        const code = $('v-code').value, temp = JSON.parse(sessionStorage.getItem('temp_reg'));
        if(!temp) { window.toast("Session expired"); state.processingAction = false; return; }
        window.setLoading(true, "Verifying...");
        const r = await fetch(CONFIG.mailApi, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify", email: temp.em, code: code }) });
        if (r.status === 429) { window.toast("Rate limited"); state.processingAction = false; window.setLoading(false); return; }
        const j = await r.json();
        if(j.message === "Verified") {
            localStorage.removeItem(FLAG_LOGOUT);
            const { error } = await db.auth.signUp({ email: temp.em, password: temp.p, options: { data: { full_name: temp.n, avatar_url: temp.avatar } } });
            if(error) { window.toast(error.message); window.setLoading(false); }
            else await initPresence(true);
        } else { window.toast(j.message || "Wrong code"); window.setLoading(false); }
        state.processingAction = false;
    };

    window.handleCreate = async (e) => {
        if (!e || !e.isTrusted) return;
        if(state.serverFull) return window.toast("Network full");
        if(state.processingAction) return;
        state.processingAction = true;

        const isDirect = state.createType === 'direct';
        let n, isP = false, targetUser = null;
        let avatarUrl = null;
        let rawPass = null;

        if(isDirect) {
            targetUser = $('c-target-user').value.trim();
            if(!targetUser) { window.toast("User ID required"); state.processingAction = false; return; }
            const { data: profile, error } = await db.from('profiles').select('full_name').eq('id', targetUser).single();
            if(error || !profile) { window.toast("User not found"); state.processingAction = false; return; }
            n = `DM ${profile.full_name}`;
            isP = true;
        } else {
            n = $('c-name').value.trim();
            avatarUrl = $('c-avatar').value.trim() || null;
            rawPass = $('c-pass').value;
            isP = $('c-private').checked;
            if(!n) { window.toast("Name required"); state.processingAction = false; return; }
        }

        let allowedUsers = ['*'];
        if (isDirect) {
            allowedUsers = [state.user.id, targetUser];
        } else {
            if (state.selectedAllowedUsers.length > 0) {
                allowedUsers = state.selectedAllowedUsers.map(u => u.id);
                if (!allowedUsers.includes(state.user.id)) allowedUsers.push(state.user.id);
            } else if (isP) {
                allowedUsers = [state.user.id];
            }
        }

        window.setLoading(true, "Creating...");
        const roomSalt = generateSalt();
        const insertData = {
            name: n,
            avatar_url: avatarUrl,
            has_password: !!rawPass,
            is_private: isP,
            salt: roomSalt,
            created_by: state.user.id,
            allowed_users: allowedUsers,
            is_direct: isDirect
        };

        const {data, error} = await db.from('rooms').insert([insertData]).select();

        if(error) { window.toast("Error: " + error.message); state.processingAction = false; window.setLoading(false); return; }

        if(data && data.length > 0) {
            const newRoom = data[0];

            if (rawPass) {
                const accessHash = await sha256(rawPass + roomSalt);
                const { error: passError } = await db.rpc('set_room_password', { p_room_id: newRoom.id, p_hash: accessHash });
                if (passError) window.toast("Password set failed, but room created.");
            }

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
        const inputHash = await sha256(inputPass + state.pending.salt);
        window.setLoading(true, "Verifying...");
        const { data } = await db.rpc('verify_room_password', { p_room_id: state.pending.id, p_hash: inputHash });
        window.setLoading(false);
        if(data === true) window.openVault(state.pending.id, state.pending.name, inputPass, state.pending.salt);
        else window.toast("Access Denied");
    };

    window.handleLogout = async (e) => {
        if (!e || !e.isTrusted) return;
        window.setLoading(true, "Leaving...");
        if (state.heartbeatInterval) clearInterval(state.heartbeatInterval);
        if (state.presenceChannel) state.presenceChannel.unsubscribe();
        if (state.chatChannel) state.chatChannel.unsubscribe();

        localStorage.setItem(FLAG_LOGOUT, 'true'); 
        state.user = null;
        await db.auth.signOut(); 
        window.nav('scr-start');
        window.setLoading(false);
    };

    window.copyId = () => {
        navigator.clipboard.writeText(state.currentRoomId);
        const copyIcon = $('icon-copy-chat'); const checkIcon = $('icon-check-chat');
        copyIcon.style.display = 'none'; checkIcon.style.display = 'block';
        setTimeout(() => { copyIcon.style.display = 'block'; checkIcon.style.display = 'none'; }, 2000);
    };

    window.copySId = () => { navigator.clipboard.writeText(state.lastCreated.id); window.toast("ID Copied"); };
    window.enterCreated = () => { window.openVault(state.lastCreated.id, state.lastCreated.name, state.lastCreatedPass, state.lastCreated.salt); state.lastCreatedPass = null; };

    let touchStartX = 0, touchEndX = 0;
    document.addEventListener('touchstart', e => touchStartX = e.changedTouches[0].screenX, false);
    document.addEventListener('touchend', e => {
        touchEndX = e.changedTouches[0].screenX;
    }, false);

    window.addEventListener('online', () => { $('offline-screen').classList.remove('active'); window.toast("Back online"); if(state.user && state.isMasterTab) initPresence(true); });
    window.addEventListener('offline', () => { $('offline-screen').classList.add('active'); updateOnlineDisplay(null); window.toast("Connection lost"); });

    db.auth.onAuthStateChange(async (ev, ses) => {
        const isFlaggedLogout = localStorage.getItem(FLAG_LOGOUT) === 'true';
        if (isFlaggedLogout) { state.user = null; return; }

        state.user = ses?.user;
        const createBtn = $('icon-plus-lobby');
        const activeScreenId = document.querySelector('.screen.active')?.id;
        if (createBtn) createBtn.style.display = 'flex';
        
        if (ev === 'SIGNED_IN') {
            if(state.user) {
                const authScreens = ['scr-start', 'scr-login', 'scr-register', 'scr-verify'];
                if (authScreens.includes(activeScreenId)) { window.nav('scr-lobby'); window.loadRooms(); window.forceClaimMaster(); }
                updateLobbyAvatar();
            }
        }
        if (ev === 'SIGNED_OUT') {
            if (state.heartbeatInterval) clearInterval(state.heartbeatInterval);
            if (state.presenceChannel) state.presenceChannel.unsubscribe();
            if (state.chatChannel) state.chatChannel.unsubscribe();
            localStorage.removeItem(FLAG_LOGOUT); window.nav('scr-start');
        }
    });

    window.openRoomSettings = async () => {
        if (!state.currentRoomId || !state.currentRoomData || state.currentRoomData.created_by !== state.user.id) return window.toast("Not owner");
        if (state.currentRoomData.is_direct) return window.toast("Cannot edit DMs");
        
        window.setLoading(true, "Loading...");
        const room = state.currentRoomData;

        state.currentStep.edit = 1; updateStepUI('edit');
        $('edit-room-name').value = room.name;
        $('edit-room-private').checked = room.is_private;
        $('edit-room-pass').value = '';

        const passStatusLabel = $('pass-status-label'); const removePassBtn = $('btn-remove-pass');
        if (room.has_password) { passStatusLabel.innerText = "Active"; passStatusLabel.style.color = "var(--success)"; removePassBtn.style.display = 'block'; }
        else { passStatusLabel.innerText = "Not Set"; passStatusLabel.style.color = "var(--text-mute)"; removePassBtn.style.display = 'none'; }
        state.removePasswordFlag = false;

        state.selectedAllowedUsers = [];
        const ids = room.allowed_users;
        if (ids && !ids.includes('*')) {
            const { data: profiles } = await db.from('profiles').select('id, full_name, avatar_url').in('id', ids);
            state.selectedAllowedUsers = ids.map(id => { const p = profiles?.find(pro => pro.id === id); return { id: id, name: p?.full_name || 'Unknown', avatar: p?.avatar_url }; });
        }
        $('overlay-container').classList.add('active'); window.showOverlayView('room-settings');
        window.setLoading(false);
    };

    window.prepareRemovePassword = () => { state.removePasswordFlag = true; $('pass-status-label').innerText = "Will be removed"; $('pass-status-label').style.color = "var(--danger)"; $('edit-room-pass').value = ''; $('edit-room-pass').disabled = true; };
    window.undoRemovePassword = () => { state.removePasswordFlag = false; $('pass-status-label').innerText = "Active"; $('pass-status-label').style.color = "var(--success)"; $('edit-room-pass').disabled = false; };

    window.saveRoomSettings = async (e) => {
        if (!e || !e.isTrusted) return;
        if (state.processingAction) return;
        state.processingAction = true;
        const name = $('edit-room-name').value.trim(); const isPrivate = $('edit-room-private').checked; const newPass = $('edit-room-pass').value;
        let allowedUsers = state.selectedAllowedUsers.length > 0 ? state.selectedAllowedUsers.map(u => u.id) : ['*'];
        if (!allowedUsers.includes(state.user.id)) allowedUsers.push(state.user.id);
        if (!name) { window.toast("Name required"); state.processingAction = false; return; }

        const room = state.currentRoomData;
        const isChangingPass = newPass.length > 0;
        const isRemovingPass = state.removePasswordFlag;
        if ((room.has_password && isRemovingPass) || (room.has_password && isChangingPass) || (!room.has_password && isChangingPass)) {
            if (!confirm("Changing password changes encryption key. Old messages become unreadable. Continue?")) { state.processingAction = false; return; }
        }

        window.setLoading(true, "Saving...");
        const updates = { name, is_private: isPrivate, allowed_users: allowedUsers };
        if (isRemovingPass) updates.has_password = false;
        else if (isChangingPass) updates.has_password = true;

        const { error: updateError } = await db.from('rooms').update(updates).eq('id', state.currentRoomId);
        if (updateError) { window.toast("Failed: " + updateError.message); window.setLoading(false); state.processingAction = false; return; }

        if (isRemovingPass) { await db.rpc('set_room_password', { p_room_id: state.currentRoomId, p_hash: null }); state.currentRoomData.has_password = false; }
        else if (isChangingPass) {
            const roomSalt = state.currentRoomData.salt;
            const accessHash = await sha256(newPass + roomSalt);
            const { error: passError } = await db.rpc('set_room_password', { p_room_id: state.currentRoomId, p_hash: accessHash });
            if (passError) window.toast("Password update failed"); else state.currentRoomData.has_password = true;
        }

        const { data: updatedRoom } = await db.from('rooms').select('*').eq('id', state.currentRoomId).single();
        state.currentRoomData = updatedRoom;
        $('chat-title').innerText = updatedRoom.name;

        window.toast("Saved"); window.closeOverlay(); state.processingAction = false; window.setLoading(false);
    };

    window.deleteRoom = async (e) => {
        if (!e || !e.isTrusted) return;
        if (!state.currentRoomId || !state.currentRoomData || state.currentRoomData.created_by !== state.user.id) return window.toast("Unauthorized");
        if (!confirm("Delete this room?")) return;
        if (!confirm("ALL MESSAGES LOST. Proceed?")) return;
        window.setLoading(true, "Deleting...");
        const { error } = await db.from('rooms').delete().eq('id', state.currentRoomId);
        if (error) { window.toast("Failed: " + error.message); window.setLoading(false); return; }
        window.toast("Deleted"); state.currentRoomId = null; state.currentRoomData = null;
        window.closeOverlay(); window.nav('scr-lobby'); window.loadRooms(); window.setLoading(false);
    };

    window.nav = (id, direction = null) => {
        const current = document.querySelector('.screen.active');
        const next = $(id);
        if(!next) return;
        if(id === 'scr-create') { state.currentStep.create = 1; state.selectedAllowedUsers = []; state.createType = 'group'; updateStepUI('create'); $('c-name').value = ''; $('c-target-user').value = ''; $('c-pass').value = ''; $('c-avatar').value = ''; document.querySelectorAll('.type-card').forEach(el => el.classList.remove('selected')); $('type-group').classList.add('selected'); }
        if(id === 'scr-register') { state.currentStep.reg = 1; updateStepUI('reg'); }
        if(id === 'scr-account') { window.prepareAccountPage(); }
        
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('slide-left', 'slide-right'));
        if(direction === 'left') { current.classList.add('slide-left'); next.classList.remove('slide-right'); }
        else if(direction === 'right') { current.classList.add('slide-right'); next.classList.remove('slide-left'); }
        else document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        next.classList.add('active');
        lucide.createIcons();
        const createBtn = $('icon-plus-lobby');
        if (createBtn) createBtn.style.display = 'flex';
        
        if(id === 'scr-lobby') updateLobbyAvatar();
    };

    window.refreshLobby = async () => {
        const now = Date.now();
        if (now - state.lastLobbyRefresh < 10000) return window.toast(`Wait ${Math.ceil((10000 - (now - state.lastLobbyRefresh)) / 1000)}s`);
        state.lastLobbyRefresh = now; window.toast("Refreshing..."); await window.loadRooms();
    };

    window.loadRooms = async () => {
        if(!state.user) return;
        window.setLoading(true, "Fetching...");
        const { data: rooms, error } = await db.from('rooms').select('*').order('created_at', { ascending: false });
        if (error) { window.toast("Failed to load rooms"); window.setLoading(false); return; }
        state.allRooms = rooms || [];
        window.filterRooms(); window.setLoading(false);
        updateLobbyAvatar();
    };

    window.filterRooms = async () => {
        const q = $('search-bar').value.toLowerCase();
        const list = $('room-list');
        const uid = state.user?.id;

        const filtered = state.allRooms.filter(r => {
            const matchSearch = r.name.toLowerCase().includes(q);
            if (!matchSearch) return false;
            if (r.is_private && r.created_by !== uid && !(r.allowed_users?.includes(uid))) return false;
            return true;
        });

        if (filtered.length === 0) {
            list.innerHTML = `<div style="text-align:center;padding:40px 20px;color:var(--text-mute)"><i data-lucide="folder" style="width:40px;height:40px;margin-bottom:12px;color:#d1d1d6"></i><div style="font-size:14px;font-weight:700;color:var(--text-main)">No groups yet</div></div>`;
        } else {
            const roomsWithMeta = await Promise.all(filtered.map(async r => {
                if(r.is_direct && r.allowed_users) {
                    const otherId = r.allowed_users.find(id => id !== uid);
                    if(otherId) { const { data } = await db.from('profiles').select('full_name, avatar_url').eq('id', otherId).single(); return { ...r, display_name: data?.full_name || 'User', display_avatar: data?.avatar_url }; }
                }
                return { ...r, display_name: r.name, display_avatar: r.avatar_url };
            }));

            list.innerHTML = roomsWithMeta.map(r => `
            <div class="room-card" onclick="window.joinAttempt('${r.id}')">
            <div class="chat-avatar" style="width:36px;height:36px;margin-right:10px;font-size:13px">${r.display_avatar ? `<img src="${r.display_avatar}">` : (r.display_name||'G').charAt(0)}</div>
            <span class="room-name">${esc(r.display_name)}</span>
            <span class="room-icon">
            ${r.is_direct ? '<i data-lucide="user" style="width:14px;height:14px"></i>' : ''}
            ${r.has_password ? '<i data-lucide="lock" style="width:14px;height:14px"></i>' : ''}
            </span>
            </div>
            `).join('');
        }
        lucide.createIcons();
    };

    window.joinAttempt = async (id) => {
        if(state.serverFull) return window.toast("Network full");
        window.setLoading(true, "Checking...");
        const { data: canAccess } = await db.rpc('can_access_room', { p_room_id: id });
        if (!canAccess) { window.setLoading(false); return window.toast("Access denied"); }
        const { data, error } = await db.from('rooms').select('*').eq('id', id).single();
        window.setLoading(false);
        if (error || !data) return window.toast("Not found");
        state.pending = { id: data.id, name: data.name, salt: data.salt }; state.currentRoomData = data;
        if (data.has_password) window.nav('scr-gate');
        else window.openVault(data.id, data.name, null, data.salt);
    };

    window.openJoinModal = () => {
        const overlay = $('join-modal-overlay');
        overlay.classList.add('active');
        $('join-id-modal').focus();
    };

    window.closeJoinModal = () => {
        $('join-modal-overlay').classList.remove('active');
    };

    window.confirmJoin = async () => {
        const id = $('join-id-modal').value.trim();
        if(!id) return window.toast("Enter ID");
        window.closeJoinModal();
        
        if(state.serverFull) return window.toast("Network full");
        if(!state.user) return window.toast("Login required");
        
        window.setLoading(true, "Checking...");
        const { data: canAccess } = await db.rpc('can_access_room', { p_room_id: id });
        if (!canAccess) { window.setLoading(false); return window.toast("Access denied or not found"); }
        const { data } = await db.from('rooms').select('*').eq('id',id).single();
        window.setLoading(false);
        if(data) {
            state.pending = { id: data.id, name: data.name, salt: data.salt }; state.currentRoomData = data;
            if(data.has_password) window.nav('scr-gate');
            else window.openVault(data.id, data.name, null, data.salt);
        } else window.toast("Not found");
    };

    window.openFabMenu = () => {
        $('fab-menu-overlay').classList.add('active');
    };

    window.closeFabMenu = () => {
        $('fab-menu-overlay').classList.remove('active');
    };

    const init = async () => {
        if (!navigator.onLine) { $('offline-screen').classList.add('active'); return; }
        const isHardLoggedOut = localStorage.getItem(FLAG_LOGOUT) === 'true';
        if (isHardLoggedOut) { state.user = null; window.nav('scr-start'); window.setLoading(false); monitorConnection(); return; }

        const [userRes, userErr] = await safeAwait(db.auth.getUser());
        
        if (userErr) { 
            console.error("Session validation failed:", userErr);
            await db.auth.signOut(); 
            window.nav('scr-start'); 
            window.setLoading(false); 
            monitorConnection(); 
            return; 
        }
        
        const user = userRes?.data?.user;

        if (user) {
            state.user = user;
            const masterExists = await checkMaster();
            if (masterExists) {
                const overlay = $('block-overlay'); overlay.classList.add('active'); lucide.createIcons();
                window.nav('scr-lobby'); window.loadRooms();
            } else {
                window.forceClaimMaster(); window.nav('scr-lobby'); window.loadRooms();
            }
        }
        lucide.createIcons(); window.setLoading(false); monitorConnection();
    };

    init();
}
