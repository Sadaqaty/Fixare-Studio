/**
 * VisitorTracker - Advanced Website Visitor Intelligence & Telegram Alerts
 * 
 * This script provides cross-page tracking, visit counting, IP/Country detection, 
 * and real-time Telegram notifications for any page where it is included.
 */

(function() {
    const VisitorTracker = {
        config: {
            token: '',
            chatIds: [],
            trackPageViews: true,
            socialProof: true,
            siteName: 'Fixare Studio'
        },
        visitor: {
            name: 'Anonymous',
            visits: 0,
            ip: 'Unknown',
            country: 'Unknown'
        },
        state: {
            lastUpdateId: parseInt(localStorage.getItem('vt_last_update_id') || '0'),
            isChatOpen: false,
            unreadCount: 0,
            pollTimer: null
        },

        /**
         * Initialize the tracker with configuration
         * @param {Object} options - Configuration options (token, chatIds, etc.)
         */
        init: async function(options) {
            this.config = { ...this.config, ...options };
            
            // 1. Manage Visit Count (Across all pages)
            this.loadVisitorData();

            // 2. Initial identification Load (Async IP/Country)
            this.fetchGeolocation(); 

            // 3. Automated Notifications
            if (this.config.trackPageViews && this.visitor.name !== 'Anonymous') {
                this.sendNotification('Returning Visitor Arrival');
            }

            // 4. Start Remote Control Sync (Adaptive)
            this.startPolling(30000); // Start slow

            // 5. Start Features
            this.showChat();
            if (this.config.socialProof) {
                this.startSocialProofEngine();
            }

            // Sync visitor state across tabs
            window.addEventListener('storage', () => this.loadVisitorData());
        },

        loadVisitorData: function() {
            this.visitor.name = localStorage.getItem('name') || 'Anonymous';
            if (!sessionStorage.getItem('visitIncremented')) {
                this.visitor.visits = parseInt(localStorage.getItem('visitCount') || '0') + 1;
                localStorage.setItem('visitCount', this.visitor.visits);
                sessionStorage.setItem('visitIncremented', 'true');
            } else {
                this.visitor.visits = parseInt(localStorage.getItem('visitCount') || '1');
            }
        },

        fetchGeolocation: async function() {
            const cached = sessionStorage.getItem('ipData');
            if (cached) {
                try {
                    const data = JSON.parse(cached);
                    this.visitor.ip = data.ip || 'Unknown';
                    this.visitor.country = data.country || 'Unknown';
                    return;
                } catch(e) {}
            }
            try {
                const res = await fetch('https://ipapi.co/json/');
                const data = await res.json();
                this.visitor.ip = data.ip || 'Unknown';
                this.visitor.country = data.country_name || 'Unknown';
                sessionStorage.setItem('ipData', JSON.stringify({ ip: this.visitor.ip, country: this.visitor.country }));
            } catch (e) { 
                console.error('[VisitorTracker] Geolocation Error:', e); 
            }
        },

        startPolling: function(ms) {
            if (this.state.pollTimer) clearInterval(this.state.pollTimer);
            this.pollRemoteControl(); // Immediate check
            this.state.pollTimer = setInterval(() => this.pollRemoteControl(), ms);
        },

        /**
         * Core Remote Control Engine: Fetches and processes commands from Telegram
         */
        pollRemoteControl: async function() {
            const { token } = this.config;
            if (!token) return;

            // Use lastUpdateId + 1 for reliability, or offset -10 for first run
            const offset = this.state.lastUpdateId > 0 ? this.state.lastUpdateId + 1 : -10;

            try {
                const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&limit=20`);
                const data = await res.json();
                
                if (data.ok && data.result.length > 0) {
                    // Process in chronological order
                    for (const update of data.result) {
                        this.state.lastUpdateId = update.update_id;
                        localStorage.setItem('vt_last_update_id', update.update_id);

                        const msg = update.message || update.edited_message || update.channel_post;
                        if (!msg || !msg.text) continue;

                        const text = msg.text.trim();
                        const msgId = msg.message_id;

                        // Helper to check for command (supports [TAG] or /tag)
                        const isCmd = (cmd) => text.startsWith(`[${cmd.toUpperCase()}]`) || text.startsWith(`/${cmd.toLowerCase()}`);
                        const getVal = (cmd) => text.replace(`[${cmd.toUpperCase()}]`, '').replace(`/${cmd.toLowerCase()}`, '').trim();

                        // 0. Global /clear
                        if (text === '/clear') {
                            ['vt-announcement', 'vt-promo', 'vt-poll', 'vt-hiring'].forEach(id => this.removeUI(id));
                            sessionStorage.setItem('vt_cleared', 'true');
                            continue;
                        }

                        // 0b. Talk Mode Toggle
                        if (text.startsWith('/talk')) {
                            const target = text.replace('/talk', '').trim();
                            if (!target || target.toLowerCase() === 'off') {
                                sessionStorage.removeItem('vt_talk_lock');
                                this.replyToTelegram(msg.chat.id, 'Talk Mode deactivated. 🔓');
                            } else {
                                sessionStorage.setItem('vt_talk_lock', target);
                                this.replyToTelegram(msg.chat.id, `Conversational lock active for [${target}]. All subsequent messages will be sent directly to them! 🔒💬`);
                                this.showToast(`Admin is now talking to ${target} via Talk Mode.`);
                            }
                            continue;
                        }

                        // drafting check: if we have a pending cmd, and this is NOT a new cmd, use this text
                        const pendingCmd = sessionStorage.getItem('vt_pending_cmd');
                        const talkLock = sessionStorage.getItem('vt_talk_lock');
                        const isNewCmd = text.startsWith('/') || text.startsWith('[');
                        
                        // 0c. Smart Reply Check (Native Telegram Reply)
                        if (msg.reply_to_message && msg.reply_to_message.text && !isNewCmd) {
                            const replyToText = msg.reply_to_message.text;
                            const nameMatch = replyToText.match(/from (.*?)\s\(/i); // Extracts "John" from "Message from John (US):"
                            if (nameMatch && nameMatch[1]) {
                                const targetName = nameMatch[1].trim();
                                if (this.visitor.name === targetName) {
                                    this.receiveChatReply(text, msgId);
                                }
                                continue;
                            }
                        }

                        // priority 1: Pending Commands (like /ann waiting for text)
                        if (pendingCmd && !isNewCmd) {
                            this.executeCommand(pendingCmd, text, msgId);
                            sessionStorage.removeItem('vt_pending_cmd');
                            continue;
                        }

                        // priority 2: Talk Lock (conversational mode)
                        if (talkLock && !isNewCmd) {
                            if (this.visitor.name === talkLock) {
                                this.receiveChatReply(text, msgId);
                            }
                            continue;
                        }

                        // 1-7. Commands
                        const supported = ['ann', 'promo', 'hire', 'poll', 'social'];
                        for (const cmd of supported) {
                            if (isCmd(cmd)) {
                                const val = getVal(cmd);
                                if (!val && cmd !== 'clear') {
                                    // Entering Drafting Mode
                                    sessionStorage.setItem('vt_pending_cmd', cmd);
                                    const prompt = this.getPromptFor(cmd);
                                    this.showToast(prompt);
                                    this.replyToTelegram(msg.chat.id, `Okay! ${prompt}`);
                                } else {
                                    this.executeCommand(cmd, val, msgId);
                                }
                                break;
                            }
                        }
                    }
                }
            } catch (e) {
                console.error('[VisitorTracker] Remote control sync failed:', e);
            }
        },

        getPromptFor: function(cmd) {
            const prompts = {
                ann: 'Please send the announcement text! 📢',
                promo: 'Please send the promo text (e.g. Code in [BRACKETS])! 🏷️',
                poll: 'Please send the poll (Question | Opt1 | Opt2)! 📊',
                social: 'Please send the social proof message! 🤝',
                redirect: 'Please send the destination URL! 🛸',
                hire: 'Type "show" or "hide" for the hiring badge! 💼',
                talk: 'Which user would you like to talk to? 🗣️'
            };
            return prompts[cmd] || `Waiting for ${cmd.toUpperCase()} content... 📥`;
        },

        replyToTelegram: async function(chatId, text) {
            const { token } = this.config;
            if (!token || !chatId) return;
            try {
                await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: chatId, text: text })
                });
            } catch (e) {
                console.error('[VisitorTracker] Failed to send Telegram reply:', e);
            }
        },

        /**
         * Route command to its handler
         */
        executeCommand: function(cmd, val, msgId) {
            switch(cmd) {
                case 'ann':
                    val.toLowerCase() === 'clear' ? this.removeUI('vt-announcement') : this.showAnnouncement(val, msgId);
                    break;
                case 'promo':
                    val.toLowerCase() === 'clear' ? this.removeUI('vt-promo') : this.showPromo(val, msgId);
                    break;
                case 'hire':
                    val.toLowerCase() === 'show' ? this.showHiringBadge() : this.removeUI('vt-hiring');
                    break;
                case 'poll':
                    val.toLowerCase() === 'clear' ? this.removeUI('vt-poll') : this.showPoll(val, msgId);
                    break;
                case 'social':
                    this.showSocialProof(val);
                    break;
                case 'redirect':
                    if (val && !sessionStorage.getItem(`redir_done_${msgId}`)) {
                        sessionStorage.setItem(`redir_done_${msgId}`, 'true');
                        window.location.href = val;
                    }
                    break;
            }
        },

        showPoll: function(content, msgId) {
            // Polls stay cleared if voted, but banners now reappear on load
            if (sessionStorage.getItem(`poll_done_${msgId}`)) return;
            if (document.getElementById('vt-poll')) return;

            const [question, ...options] = content.split('|').map(s => s.trim());
            const optionsHtml = options.map((opt, idx) => `
                <button onclick="VisitorTracker.submitVote('${this.escape(opt)}', ${msgId})" style="
                    background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2);
                    color: white; padding: 8px 12px; border-radius: 6px; cursor: pointer;
                    margin-top: 8px; width: 100%; text-align: left; transition: 0.2s;
                " onmouseover="this.style.background='rgba(255,255,255,0.2)'" onmouseout="this.style.background='rgba(255,255,255,0.1)'">
                    ${this.escape(opt)}
                </button>
            `).join('');

            this.injectUI('vt-poll', `
                <div style="width: 100%;">
                    <div style="font-weight: bold; margin-bottom: 10px; display: flex; justify-content: space-between;">
                        <span>📊 ${this.escape(question)}</span>
                        <span class="vt-close" onclick="VisitorTracker.removeUI('vt-poll')" style="margin-left: 0;">&times;</span>
                    </div>
                    ${optionsHtml}
                </div>
            `, `bottom: 20px; left: 20px; transform: none; width: 300px; animation: vt-slide-up 0.5s ease-out; flex-direction: column; align-items: flex-start;`);
        },

        submitVote: function(option, msgId) {
            this.trackAction('Poll Vote', `Voted "${option}" on unique poll ID ${msgId}`);
            sessionStorage.setItem(`poll_done_${msgId}`, 'true');
            this.removeUI('vt-poll');
            this.showToast('Thanks for your vote! 🗳️');
        },

        showChat: function() {
            if (document.getElementById('vt-chat-bubble')) return;
            
            const bubble = document.createElement('div');
            bubble.id = 'vt-chat-bubble';
            bubble.style.cssText = `
                position: fixed !important; bottom: 20px !important; right: 20px !important;
                width: 60px !important; height: 60px !important; border-radius: 50% !important;
                background: linear-gradient(135deg, #00d2ff, #3a7bd5) !important;
                display: flex !important; align-items: center !important; justify-content: center !important;
                color: white !important; font-size: 24px !important; cursor: pointer !important;
                z-index: 2147483646 !important; box-shadow: 0 5px 20px rgba(0,0,0,0.3) !important;
                transition: 0.3s !important;
            `;
            bubble.innerHTML = '💬';
            bubble.onclick = () => this.toggleChat();
            document.body.appendChild(bubble);

            const panel = document.createElement('div');
            panel.id = 'vt-chat-panel';
            panel.style.cssText = `
                position: fixed !important; bottom: 90px !important; right: 20px !important;
                width: 320px !important; height: 400px !important; 
                background: rgba(10, 10, 20, 0.95) !important;
                backdrop-filter: blur(20px) !important;
                border: 1px solid rgba(255,255,255,0.1) !important;
                border-radius: 16px !important; display: none !important;
                flex-direction: column !important; z-index: 2147483646 !important;
                box-shadow: 0 10px 40px rgba(0,0,0,0.5) !important;
                overflow: hidden !important; font-family: 'Inter', sans-serif !important;
            `;
            panel.innerHTML = `
                <div style="padding: 15px; background: rgba(255,255,255,0.05); border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <div style="width: 8px; height: 8px; border-radius: 50%; background: #00ff88;"></div>
                        <span style="font-weight: bold; color: white; font-size: 14px;">Support (<span id="vt-visitor-name">${this.escape(this.visitor.name)}</span>)</span>
                    </div>
                    <span onclick="VisitorTracker.toggleChat()" style="cursor: pointer; opacity: 0.6; font-size: 20px;">&times;</span>
                </div>
                <div id="vt-chat-msgs" style="flex: 1; padding: 15px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; color: white; font-size: 13px;">
                </div>
                <div id="vt-typing" style="padding: 0 15px 5px; font-size: 11px; color: #00d2ff; display: none;">Support is typing...</div>
                <div style="padding: 15px; display: flex; gap: 8px; background: rgba(0,0,0,0.2);">
                    <input id="vt-chat-input" type="text" placeholder="Type a message..." style="flex: 1; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; padding: 8px 15px; color: white; outline: none; font-size: 13px;">
                    <button onclick="VisitorTracker.sendChatMessage()" style="background: #00d2ff; border: none; border-radius: 50%; width: 32px; height: 32px; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; font-weight: bold;">></button>
                </div>
            `;
            document.body.appendChild(panel);

            // Restore History
            this.renderChatHistory();

            // Listener for Enter key
            setTimeout(() => {
                const input = document.getElementById('vt-chat-input');
                if (input) {
                    input.addEventListener('keypress', (e) => {
                        if (e.key === 'Enter') this.sendChatMessage();
                    });
                }
            }, 100);
        },

        renderChatHistory: function() {
            const history = JSON.parse(sessionStorage.getItem('vt_chat_history') || '[]');
            const msgsContainer = document.getElementById('vt-chat-msgs');
            if (msgsContainer) {
                msgsContainer.innerHTML = '';
                if (history.length === 0) {
                    this.addChatMessageToUI('Hi! How can we help you today?', 'support', false);
                } else {
                    history.forEach(m => this.addChatMessageToUI(m.text, m.type, false));
                }
                msgsContainer.scrollTop = msgsContainer.scrollHeight;
            }
        },

        addChatMessageToUI: function(text, type, save = true) {
            const msgs = document.getElementById('vt-chat-msgs');
            if (!msgs) return;

            const div = document.createElement('div');
            const isSupport = type === 'support';
            div.style.cssText = isSupport 
                ? 'background: rgba(255,255,255,0.1); padding: 8px 12px; border-radius: 12px 12px 12px 0; align-self: flex-start; border-left: 2px solid #00d2ff;' 
                : 'background: #00d2ff; padding: 8px 12px; border-radius: 12px 12px 0 12px; align-self: flex-end; color: white;';
            div.innerText = text;
            msgs.appendChild(div);
            msgs.scrollTop = msgs.scrollHeight;

            if (save) {
                const history = JSON.parse(sessionStorage.getItem('vt_chat_history') || '[]');
                history.push({ text, type });
                sessionStorage.setItem('vt_chat_history', JSON.stringify(history));
            }
        },

        toggleChat: function() {
            const container = document.getElementById('vt-chat-panel');
            this.state.isChatOpen = !this.state.isChatOpen;
            
            if (this.state.isChatOpen) {
                container.style.display = 'flex';
                this.state.unreadCount = 0;
                this.updateUnreadBadge();
                this.startPolling(5000); // Fast sync when chatting
            } else {
                container.style.display = 'none';
                this.startPolling(30000); // Slow sync when idle
            }
        },

        updateUnreadBadge: function() {
            const bubble = document.getElementById('vt-chat-bubble');
            let badge = document.getElementById('vt-unread-badge');
            
            if (this.state.unreadCount > 0 && !this.state.isChatOpen) {
                if (!badge) {
                    badge = document.createElement('div');
                    badge.id = 'vt-unread-badge';
                    badge.style = 'position:absolute; top:-5px; right:-5px; background:#ff4444; color:white; border-radius:10px; padding:2px 6px; font-size:10px; font-weight:bold; border:2px solid white;';
                    bubble.appendChild(badge);
                }
                badge.innerText = this.state.unreadCount;
            } else if (badge) {
                badge.remove();
            }
        },

        playBeep: function() {
            try {
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                if (ctx.state === 'suspended') ctx.resume();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(880, ctx.currentTime); // A5
                gain.gain.setValueAtTime(0, ctx.currentTime);
                gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.01);
                gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.2);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start();
                osc.stop(ctx.currentTime + 0.2);
            } catch(e) {}
        },

        sendChatMessage: function() {
            const input = document.getElementById('vt-chat-input');
            const text = input.value.trim();
            if (!text) return;

            this.addChatMessageToUI(text, 'visitor');
            this.sendNotification('Support Chat', `Message from ${this.visitor.name} (${this.visitor.country}): ${text}`);
            input.value = '';
        },

        receiveChatReply: function(text, msgId) {
            if (sessionStorage.getItem(`reply_seen_${msgId}`)) return;
            sessionStorage.setItem(`reply_seen_${msgId}`, 'true');

            // Simulate typing
            const typing = document.getElementById('vt-typing');
            if (typing) typing.style.display = 'block';

            setTimeout(() => {
                if (typing) typing.style.display = 'none';
                this.addChatMessageToUI(text, 'support');
                
                // Alert if closed
                const panel = document.getElementById('vt-chat-panel');
                if (panel && panel.style.display === 'none') {
                    this.showToast('New message from support! 💬');
                }
            }, 1000);
        },

        showToast: function(text) {
            const toast = document.createElement('div');
            toast.style.cssText = `
                position: fixed !important; bottom: 100px !important; right: 20px !important;
                background: rgba(0, 210, 255, 0.9) !important; color: white !important;
                padding: 10px 20px !important; border-radius: 30px !important;
                font-family: 'Inter', sans-serif !important; font-size: 13px !important;
                z-index: 2147483647 !important; box-shadow: 0 5px 15px rgba(0,0,0,0.2) !important;
                animation: vt-fade-in 0.3s ease-out !important;
            `;
            toast.innerText = text;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 4000);
        },

        showAnnouncement: function(text, msgId) {
            if (sessionStorage.getItem('vt_cleared')) return;
            if (document.getElementById('vt-announcement')) return;

            this.injectUI('vt-announcement', `
                <div style="flex: 1 !important;">🚀 <b>Announcement:</b> ${this.escape(text)}</div>
                <div class="vt-close" onclick="VisitorTracker.removeUI('vt-announcement')">&times;</div>
            `, `bottom: 20px; animation: vt-slide-up 0.5s ease-out;`);
        },

        showPromo: function(text, msgId) {
            if (sessionStorage.getItem('vt_cleared')) return;
            if (document.getElementById('vt-promo')) return;

            // Extract code if present in square brackets: [ANN] Use code [GALAXY20]
            const codeMatch = text.match(/\[(.*?)\]/);
            const code = codeMatch ? codeMatch[1] : null;
            const cleanText = text.replace(/\[.*?\]/, '').trim();

            this.injectUI('vt-promo', `
                <div style="flex: 1 !important;">🎁 <b>Offer:</b> ${this.escape(cleanText)} 
                    ${code ? `<span id="vt-code" style="background: rgba(255,255,255,0.2); border: 1px dashed white; padding: 2px 8px; border-radius: 4px; margin-left: 5px; cursor: pointer;" onclick="VisitorTracker.copyCode('${this.escape(code)}')">${this.escape(code)}</span>` : ''}
                </div>
                <div class="vt-close" onclick="VisitorTracker.dismissUI('vt-promo', ${msgId})">&times;</div>
            `, `bottom: 90px; background: rgba(0, 210, 255, 0.2) !important; border-color: #00d2ff !important; animation: vt-slide-up 0.5s ease-out;`);
        },

        copyCode: function(code) {
            navigator.clipboard.writeText(code);
            const el = document.getElementById('vt-code');
            const oldText = el.innerText;
            el.innerText = 'Copied!';
            setTimeout(() => el.innerText = oldText, 2000);
        },

        showSocialProof: function(text) {
            const toast = document.createElement('div');
            toast.style.cssText = `
                position: fixed !important; bottom: 20px !important; left: 20px !important;
                background: rgba(10, 10, 20, 0.9) !important; color: white !important;
                padding: 12px 20px !important; border-radius: 12px !important;
                font-family: 'Inter', sans-serif !important; font-size: 13px !important;
                z-index: 2147483647 !important; box-shadow: 0 10px 30px rgba(0,0,0,0.4) !important;
                border: 1px solid rgba(0, 255, 136, 0.3) !important;
                display: flex !important; align-items: center !important; gap: 10px !important;
                animation: vt-slide-up 0.5s ease-out !important;
            `;
            toast.innerHTML = `<span style="font-size: 18px;">🔥</span> <div>${this.escape(text)}</div>`;
            document.body.appendChild(toast);
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transition = '0.5s';
                setTimeout(() => toast.remove(), 500);
            }, 6000);
        },

        startSocialProofEngine: function() {
            const events = [
                "Someone from London just viewed the Careers page.",
                "A visitor from New York just joined the Galactic Port.",
                "15 people are currently viewing this page.",
                "New application received for the Creative Lead position!",
                "Someone just used the promo code GALAXY20.",
                "High activity detected from users in Japan. 🚀"
            ];
            
            const showRandom = () => {
                if (Math.random() > 0.7) { // 30% chance every 2 mins
                    const text = events[Math.floor(Math.random() * events.length)];
                    this.showSocialProof(text);
                }
            };

            setInterval(showRandom, 120000); // Check every 2 minutes
        },

        showHiringBadge: function() {
            if (document.getElementById('vt-hiring')) return;
            this.injectUI('vt-hiring', `
                <div style="font-weight: bold; color: #00ff88;">🚀 We're Hiring!</div>
                <a href="/careers" style="color: white; margin-left: 10px; text-decoration: underline; font-size: 12px;">View Roles</a>
            `, `top: 20px; right: 20px; left: auto; transform: none; width: auto; background: rgba(0, 255, 136, 0.1) !important; border-color: #00ff88 !important;`);
        },

        /**
         * Generic UI Injection Helper
         */
        injectUI: function(id, html, extraStyles = '') {
            const el = document.createElement('div');
            el.id = id;
            el.style.cssText = `
                position: fixed !important; bottom: 20px !important; left: 50% !important; 
                transform: translateX(-50%) !important;
                z-index: 2147483647 !important; width: 90% !important; max-width: 600px !important;
                padding: 16px 24px !important; border-radius: 12px !important;
                background: rgba(10, 10, 20, 0.85) !important; 
                backdrop-filter: blur(15px) !important; -webkit-backdrop-filter: blur(15px) !important;
                border: 1px solid rgba(255, 255, 255, 0.2) !important; color: white !important;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5) !important;
                font-family: 'Inter', sans-serif !important; font-size: 14px !important; line-height: 1.5 !important;
                display: flex !important; align-items: center !important; justify-content: space-between !important;
                box-sizing: border-box !important;
                ${extraStyles}
            `;
            el.innerHTML = html;
            document.body.appendChild(el);

            if (!document.getElementById('vt-base-styles')) {
                const style = document.createElement('style');
                style.id = 'vt-base-styles';
                style.innerHTML = `
                    @keyframes vt-slide-up { from { bottom: -100px; opacity: 0; } to { bottom: 20px; opacity: 1; } }
                    @keyframes vt-fade-in { from { opacity: 0; } to { opacity: 1; } }
                    .vt-close { cursor: pointer !important; margin-left: 15px !important; opacity: 0.6 !important; transition: 0.2s !important; font-size: 22px !important; line-height: 1 !important; }
                    .vt-close:hover { opacity: 1 !important; color: #ff4b2b !important; }
                `;
                document.head.appendChild(style);
            }
        },

        removeUI: function(id) {
            const el = document.getElementById(id);
            if (el) el.remove();
        },

        dismissUI: function(id, msgId) {
            sessionStorage.setItem(`${id}_dismissed_${msgId}`, 'true');
            this.removeUI(id);
        },

        /**
         * Legacy support / Convenience
         */
        dismissAnnouncement: function(msgId) { this.dismissUI('vt-announcement', msgId); },
        removeAnnouncement: function() { this.removeUI('vt-announcement'); },

        /**
         * Helper to escape HTML characters for Telegram
         */
        escape: function(str) {
            return String(str).replace(/[&<>"']/g, (tag) => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            }[tag] || tag));
        },

        /**
         * Get improved referrer information including UTM parameters
         */
        getReferrerInfo: function() {
            const ref = document.referrer || 'Direct';
            const params = new URLSearchParams(window.location.search);
            const utm = [];
            ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(p => {
                if (params.has(p)) utm.push(`${p.split('_')[1]}: ${params.get(p)}`);
            });
            return utm.length ? `${ref} [${utm.join(', ')}]` : ref;
        },

        /**
         * Send a Telegram notification to all configured recipients
         * @param {string} actionType - E.g., "Page View", "Form Submission"
         * @param {string} note - Optional additional details
         */
        sendNotification: async function(actionType = 'Action', note = '') {
            const { token, chatIds, siteName } = this.config;
            if (!token || !chatIds || chatIds.length === 0) return;

            const msg = `🚀 <b>${actionType}</b> (Visit #${this.visitor.visits})
📊 <b>Site:</b> ${this.escape(siteName)}
👤 <b>Name:</b> ${this.escape(this.visitor.name)}
🌐 <b>IP:</b> ${this.escape(this.visitor.ip)}
🌍 <b>Country:</b> ${this.escape(this.visitor.country)}
📄 <b>Page:</b> ${this.escape(document.title)}
🔗 <b>URL:</b> ${this.escape(window.location.href)}
🔙 <b>Referrer:</b> ${this.escape(this.getReferrerInfo())}
📱 <b>Device:</b> ${this.escape(navigator.userAgent)}
🎨 <b>Screen:</b> ${window.screen.width}x${window.screen.height}
🌍 <b>Lang:</b> ${navigator.language}${note ? `\n\n💬 <b>Note:</b> ${this.escape(note)}` : ''}`;

            const sendToRecipient = async (chatId) => {
                try {
                    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            chat_id: chatId,
                            text: msg,
                            parse_mode: 'HTML'
                        })
                    });
                } catch (error) {
                    console.error(`[VisitorTracker] Error sending to ${chatId}:`, error);
                }
            };

            // Send to all Chat IDs in parallel
            await Promise.all(chatIds.map(id => sendToRecipient(id)));
        },

        /**
         * Public method to track a custom interaction
         */
        trackAction: function(actionTag, additionalNote = '') {
            this.sendNotification(actionTag, additionalNote);
        },

        /**
         * Public method to update user name and sync with localStorage
         */
        identify: function(name) {
            const oldName = this.visitor.name;
            this.visitor.name = name;
            localStorage.setItem('name', name);
            
            // Update Chat Header if active
            const nameEl = document.getElementById('vt-visitor-name');
            if (nameEl) nameEl.innerText = this.escape(name);

            if (oldName === 'Anonymous') {
                this.sendNotification('New Visitor Identity Established');
            } else if (oldName !== name) {
                this.sendNotification('Visitor Identity Updated', `Name changed from ${oldName} to ${name}`);
            }
        }
    };

    // Expose to global scope
    window.VisitorTracker = VisitorTracker;
})();
