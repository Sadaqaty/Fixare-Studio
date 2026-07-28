/**
 * All DOM injection: chat, toasts, banners, badges, popups
 * Uses proper assets from the assets/ folder
 * Popup dismissal persistence: dismissed popups stored in localStorage with timestamps
 * Only one popup displayed at a time across all pages
 */

import { escape } from './utils.js';

// Popup dismissal duration: 2 hours in milliseconds
const POPUP_DISMISS_DURATION = 2 * 60 * 60 * 1000;

export class UI {
    constructor(config, tracker, telegram) {
        this.config = config;
        this.tracker = tracker;
        this.telegram = telegram;
        this.isChatOpen = false;
        this.unreadCount = 0;
        this._stylesInjected = false;
    }

    // ======== POPUP DISMISSAL MANAGEMENT ========

    _isPopupDismissed(popupId) {
        try {
            const dismissed = JSON.parse(localStorage.getItem('vt_dismissed_popups') || '{}');
            const dismissedAt = dismissed[popupId];
            if (!dismissedAt) return false;
            // Check if within dismissal window (2 hours)
            return (Date.now() - dismissedAt) < POPUP_DISMISS_DURATION;
        } catch { return false; }
    }

    _dismissPopup(popupId) {
        try {
            const dismissed = JSON.parse(localStorage.getItem('vt_dismissed_popups') || '{}');
            dismissed[popupId] = Date.now();
            localStorage.setItem('vt_dismissed_popups', JSON.stringify(dismissed));
        } catch { /* ignore */ }
    }

    _isAnyPopupVisible() {
        return document.getElementById('vt-popup') !== null;
    }

    _cleanupExpiredDismissals() {
        try {
            const dismissed = JSON.parse(localStorage.getItem('vt_dismissed_popups') || '{}');
            const now = Date.now();
            let changed = false;
            for (const [key, timestamp] of Object.entries(dismissed)) {
                if (now - timestamp > POPUP_DISMISS_DURATION) {
                    delete dismissed[key];
                    changed = true;
                }
            }
            if (changed) localStorage.setItem('vt_dismissed_popups', JSON.stringify(dismissed));
        } catch { /* ignore */ }
    }

    _injectBaseStyles() {
        if (this._stylesInjected) return;
        const style = document.createElement('style');
        style.id = 'vt-base-styles';
        style.innerHTML = `
            @keyframes vt-slide-up { from { bottom: -100px; opacity: 0; } to { bottom: 20px; opacity: 1; } }
            @keyframes vt-fade-in { from { opacity: 0; } to { opacity: 1; } }
            @keyframes vt-glow { 0%, 100% { box-shadow: 0 0 10px rgba(0,210,255,0.3); } 50% { box-shadow: 0 0 25px rgba(0,210,255,0.6); } }
            .vt-close { cursor: pointer !important; margin-left: 15px !important; opacity: 0.6 !important; transition: 0.2s !important; font-size: 22px !important; line-height: 1 !important; }
            .vt-close:hover { opacity: 1 !important; color: #ff4b2b !important; }
        `;
        document.head.appendChild(style);
        this._stylesInjected = true;
    }

    injectUI(id, html, extraStyles = '') {
        this._injectBaseStyles();
        const el = document.createElement('div');
        el.id = id;
        el.style.cssText = `
            position: fixed !important; bottom: 20px !important; left: 50% !important;
            transform: translateX(-50%) !important;
            z-index: 2147483647 !important; width: 90% !important; max-width: 600px !important;
            padding: 16px 24px !important; border-radius: 12px !important;
            background: rgba(2, 12, 27, 0.9) !important;
            backdrop-filter: blur(15px) !important; -webkit-backdrop-filter: blur(15px) !important;
            border: 1px solid rgba(0, 210, 255, 0.3) !important; color: white !important;
            box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5), 0 0 15px rgba(0, 210, 255, 0.1) !important;
            font-family: 'Inter Tight', sans-serif !important; font-size: 14px !important; line-height: 1.5 !important;
            display: flex !important; align-items: center !important; justify-content: space-between !important;
            box-sizing: border-box !important;
            ${extraStyles}
        `;
        el.innerHTML = html;
        document.body.appendChild(el);
    }

    removeUI(id) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    dismissUI(id, msgId) {
        sessionStorage.setItem(`vt_${id}_dismissed_${msgId}`, 'true');
        this.removeUI(id);
    }

    // ======== POPUPS & OVERLAYS ========

    showPopup(title, message, type = 'info', popupId = null) {
        // Generate a popup ID if not provided
        const id = popupId || `popup_${btoa(title).substring(0, 10)}`;

        // Check if this popup was dismissed recently
        if (this._isPopupDismissed(id)) return;

        // Only show one popup at a time
        if (this._isAnyPopupVisible()) return;

        // Clean up expired dismissals
        this._cleanupExpiredDismissals();

        const colors = {
            info: { bg: 'rgba(0, 210, 255, 0.1)', border: '#00d2ff', icon: '&#9432;' },
            success: { bg: 'rgba(0, 255, 136, 0.1)', border: '#00ff88', icon: '&#10003;' },
            warning: { bg: 'rgba(255, 170, 0, 0.1)', border: '#ffaa00', icon: '&#9888;' },
            promo: { bg: 'rgba(255, 68, 68, 0.1)', border: '#ff4444', icon: '&#127873;' }
        };
        const c = colors[type] || colors.info;

        const el = document.createElement('div');
        el.id = 'vt-popup';
        el.style.cssText = `
            position: fixed !important; inset: 0 !important;
            background: rgba(0, 0, 0, 0.6) !important;
            backdrop-filter: blur(5px) !important;
            z-index: 2147483646 !important;
            display: flex !important; align-items: center !important; justify-content: center !important;
            animation: vt-fade-in 0.3s ease-out !important;
        `;

        el.innerHTML = `
            <div style="position: relative; max-width: 500px; width: 90%; animation: vt-slide-up 0.4s ease-out;">
                <img src="assets/popup-item-bg.svg" style="width: 100%; height: auto; position: absolute; top: 0; left: 0; opacity: 0.3;" alt="">
                <div style="position: relative; z-index: 1; padding: 40px 30px; text-align: center;">
                    <div style="width: 50px; height: 50px; border-radius: 50%; background: ${c.bg}; border: 2px solid ${c.border}; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; font-size: 24px;">${c.icon}</div>
                    <h3 style="font-family: 'DDT', sans-serif; font-size: 18px; text-transform: uppercase; letter-spacing: 3px; color: ${c.border}; margin-bottom: 12px;">${escape(title)}</h3>
                    <p style="color: rgba(255,255,255,0.8); font-size: 14px; line-height: 1.6; margin-bottom: 24px;">${escape(message)}</p>
                    <button onclick="document.getElementById('vt-popup').remove(); window.__vt_dismissPopup && window.__vt_dismissPopup();" style="background: ${c.border}; color: #020c1b; border: none; padding: 10px 28px; font-family: 'Inter Tight', sans-serif; font-size: 12px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; cursor: pointer; clip-path: polygon(8% 0, 100% 0, 92% 100%, 0 100%);">CLOSE</button>
                </div>
            </div>
        `;

        el.addEventListener('click', (e) => {
            if (e.target === el) {
                el.remove();
                window.__vt_dismissPopup && window.__vt_dismissPopup();
            }
        });

        // Store dismiss function globally for the close button
        const currentId = id;
        window.__vt_dismissPopup = () => this._dismissPopup(currentId);

        document.body.appendChild(el);
    }

    // ======== OVERLAYS ========

    showAnnouncement(text, msgId) {
        if (sessionStorage.getItem('vt_cleared')) return;
        if (document.getElementById('vt-announcement')) return;

        this.injectUI('vt-announcement', `
            <div style="flex: 1 !important; display: flex !important; align-items: center !important; gap: 12px !important;">
                <img src="assets/enter-icon.svg" style="width: 24px; height: 24px; opacity: 0.8;" alt="">
                <div><b>Announcement:</b> ${escape(text)}</div>
            </div>
            <div class="vt-close" onclick="document.getElementById('vt-announcement').remove()">&times;</div>
        `, `bottom: 20px; animation: vt-slide-up 0.5s ease-out;`);

        // Auto-dismiss after 30 seconds
        setTimeout(() => {
            const el = document.getElementById('vt-announcement');
            if (el) { el.style.opacity = '0'; el.style.transition = 'opacity 0.5s'; setTimeout(() => el.remove(), 500); }
        }, 30000);
    }

    showPromo(text, msgId) {
        if (sessionStorage.getItem('vt_cleared')) return;
        if (document.getElementById('vt-promo')) return;

        const codeMatch = text.match(/\[(.*?)\]/);
        const code = codeMatch ? codeMatch[1] : null;
        const cleanText = text.replace(/\[.*?\]/, '').trim();

        this.injectUI('vt-promo', `
            <div style="flex: 1 !important; display: flex !important; align-items: center !important; gap: 12px !important;">
                <img src="assets/enter-icon.svg" style="width: 24px; height: 24px; opacity: 0.8;" alt="">
                <div>
                    <b>Special Offer:</b> ${escape(cleanText)}
                    ${code ? `<span id="vt-code" style="background: rgba(255,255,255,0.15); border: 1px dashed rgba(255,255,255,0.3); padding: 3px 10px; border-radius: 4px; margin-left: 8px; cursor: pointer; font-weight: bold; letter-spacing: 1px;">${escape(code)}</span>` : ''}
                </div>
            </div>
            <div class="vt-close" onclick="document.dispatchEvent(new CustomEvent('vt:dismiss-promo', {detail:${msgId}}))">&times;</div>
        `, `bottom: 90px; background: rgba(255, 68, 68, 0.15) !important; border-color: #ff4444 !important; animation: vt-slide-up 0.5s ease-out;`);

        if (code) {
            setTimeout(() => {
                const codeEl = document.getElementById('vt-code');
                if (codeEl) codeEl.addEventListener('click', () => this._copyCode(code));
            }, 100);
        }

        // Auto-dismiss after 20 seconds
        setTimeout(() => {
            const el = document.getElementById('vt-promo');
            if (el) { el.style.opacity = '0'; el.style.transition = 'opacity 0.5s'; setTimeout(() => el.remove(), 500); }
        }, 20000);
    }

    _copyCode(code) {
        navigator.clipboard.writeText(code).catch(() => {});
        const el = document.getElementById('vt-code');
        if (el) {
            const oldText = el.innerText;
            el.innerText = 'Copied!';
            setTimeout(() => el.innerText = oldText, 2000);
        }
    }

    showSocialProof(text) {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed !important; bottom: 20px !important; left: 20px !important;
            background: rgba(2, 12, 27, 0.9) !important; color: white !important;
            padding: 12px 20px !important; border-radius: 12px !important;
            font-family: 'Inter Tight', sans-serif !important; font-size: 13px !important;
            z-index: 2147483647 !important; box-shadow: 0 10px 30px rgba(0,0,0,0.4), 0 0 10px rgba(0,255,136,0.1) !important;
            border: 1px solid rgba(0, 255, 136, 0.3) !important;
            display: flex !important; align-items: center !important; gap: 10px !important;
            animation: vt-slide-up 0.5s ease-out !important;
        `;
        toast.innerHTML = `<span style="font-size: 16px;">&#128293;</span> <div>${escape(text)}</div>`;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = '0.5s';
            setTimeout(() => toast.remove(), 500);
        }, 6000);
    }

    showHiringBadge() {
        if (document.getElementById('vt-hiring')) return;
        this.injectUI('vt-hiring', `
            <div style="font-weight: bold; color: #00ff88; display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 16px;">&#128640;</span> We're Hiring!
            </div>
            <a href="/careers" style="color: white; margin-left: 10px; text-decoration: underline; font-size: 12px;">View Roles</a>
        `, `top: 20px; right: 20px; left: auto; transform: none; width: auto; background: rgba(0, 255, 136, 0.1) !important; border-color: #00ff88 !important; animation: vt-fade-in 0.3s ease-out;`);
    }

    showPoll(content, msgId) {
        if (sessionStorage.getItem(`vt_poll_done_${msgId}`)) return;
        if (document.getElementById('vt-poll')) return;

        const [question, ...options] = content.split('|').map(s => s.trim());
        const optionsHtml = options.map(opt => `
            <button class="vt-poll-btn" data-option="${escape(opt)}" data-msgid="${msgId}" style="
                background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15);
                color: white; padding: 10px 14px; border-radius: 8px; cursor: pointer;
                margin-top: 8px; width: 100%; text-align: left; transition: all 0.2s;
                font-family: 'Inter Tight', sans-serif; font-size: 13px;
            ">
                ${escape(opt)}
            </button>
        `).join('');

        this.injectUI('vt-poll', `
            <div style="width: 100%;">
                <div style="font-weight: bold; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
                    <span style="display: flex; align-items: center; gap: 8px;"><span style="font-size: 16px;">&#128202;</span> ${escape(question)}</span>
                    <span class="vt-close" onclick="document.getElementById('vt-poll').remove()" style="margin-left: 0;">&times;</span>
                </div>
                ${optionsHtml}
            </div>
        `, `bottom: 20px; left: 20px; transform: none; width: 300px; animation: vt-slide-up 0.5s ease-out; flex-direction: column; align-items: flex-start;`);

        setTimeout(() => {
            document.querySelectorAll('.vt-poll-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const option = btn.dataset.option;
                    const mid = parseInt(btn.dataset.msgid);
                    this.tracker.trackAction('Poll Vote', `Voted "${option}" on poll ID ${mid}`);
                    sessionStorage.setItem(`vt_poll_done_${mid}`, 'true');
                    this.removeUI('vt-poll');
                    this.showToast('Thanks for your vote!');
                });
                btn.addEventListener('mouseover', () => { btn.style.background = 'rgba(255,255,255,0.15)'; btn.style.borderColor = 'rgba(255,255,255,0.3)'; });
                btn.addEventListener('mouseout', () => { btn.style.background = 'rgba(255,255,255,0.08)'; btn.style.borderColor = 'rgba(255,255,255,0.15)'; });
            });
        }, 100);
    }

    showBroadcastMessage(text) {
        if (sessionStorage.getItem('vt_cleared')) return;
        if (document.getElementById('vt-broadcast')) return;

        this.injectUI('vt-broadcast', `
            <div style="flex: 1 !important; display: flex !important; align-items: center !important; gap: 12px !important;">
                <img src="assets/enter-icon.svg" style="width: 24px; height: 24px; opacity: 0.8;" alt="">
                <div>${escape(text)}</div>
            </div>
            <div class="vt-close" onclick="document.getElementById('vt-broadcast').remove()">&times;</div>
        `, `bottom: 20px; background: rgba(0, 210, 255, 0.15) !important; border-color: #00d2ff !important; animation: vt-slide-up 0.5s ease-out;`);

        setTimeout(() => {
            const el = document.getElementById('vt-broadcast');
            if (el) { el.style.opacity = '0'; el.style.transition = 'opacity 0.5s'; setTimeout(() => el.remove(), 500); }
        }, 15000);
    }

    showCustomBadge(text) {
        if (document.getElementById('vt-badge')) return;
        this.injectUI('vt-badge', `
            <div style="font-weight: bold; color: #00d2ff; display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 16px;">&#9889;</span> ${escape(text)}
            </div>
        `, `top: 20px; right: 20px; left: auto; transform: none; width: auto; background: rgba(0, 210, 255, 0.1) !important; border-color: #00d2ff !important; animation: vt-fade-in 0.3s ease-out;`);
    }

    showCountdown(seconds, message) {
        if (document.getElementById('vt-countdown')) return;

        const el = document.createElement('div');
        el.id = 'vt-countdown';
        el.style.cssText = `
            position: fixed !important; top: 50% !important; left: 50% !important;
            transform: translate(-50%, -50%) !important;
            z-index: 2147483647 !important; width: 90% !important; max-width: 500px !important;
            background: rgba(2, 12, 27, 0.95) !important;
            backdrop-filter: blur(20px) !important;
            border: 2px solid #00d2ff !important; color: white !important;
            text-align: center !important; overflow: hidden !important;
            font-family: 'Inter Tight', sans-serif !important;
            animation: vt-fade-in 0.3s ease-out !important;
        `;

        const endTime = Date.now() + (seconds * 1000);
        const updateTimer = () => {
            const remaining = Math.max(0, Math.ceil((endTime - Date.now()) / 1000));
            if (remaining <= 0) { el.remove(); return; }
            const mins = Math.floor(remaining / 60);
            const secs = remaining % 60;
            const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

            el.innerHTML = `
                <img src="assets/popup-item-bg.svg" style="width: 100%; height: 100%; position: absolute; top: 0; left: 0; opacity: 0.15;" alt="">
                <div style="position: relative; z-index: 1; padding: 40px;">
                    <div style="font-size: 12px; color: #00d2ff; letter-spacing: 3px; margin-bottom: 15px; text-transform: uppercase;">${escape(message)}</div>
                    <div style="font-size: 64px; font-weight: 900; color: white; text-shadow: 0 0 30px rgba(0, 210, 255, 0.5);">${timeStr}</div>
                    <div style="margin-top: 20px;">
                        <div style="height: 4px; background: rgba(0, 210, 255, 0.2); border-radius: 2px; overflow: hidden;">
                            <div style="height: 100%; background: linear-gradient(90deg, #00d2ff, #3a7bd5); width: ${(remaining / seconds) * 100}%; transition: width 1s linear;"></div>
                        </div>
                    </div>
                    <div class="vt-close" onclick="document.getElementById('vt-countdown').remove()" style="position: absolute; top: 15px; right: 20px;">&times;</div>
                </div>
            `;
        };

        document.body.appendChild(el);
        updateTimer();
        const timer = setInterval(() => {
            updateTimer();
            if (Date.now() >= endTime) clearInterval(timer);
        }, 1000);
    }

    // ======== CHAT ========

    showChat() {
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
        bubble.innerHTML = '&#128172;';
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
            overflow: hidden !important; font-family: 'Inter Tight', sans-serif !important;
        `;
        panel.innerHTML = `
            <div style="padding: 16px; background: rgba(255,255,255,0.05); border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="width: 8px; height: 8px; border-radius: 50%; background: #00ff88;"></div>
                    <span style="font-weight: bold; color: white; font-size: 14px;">Support (<span id="vt-visitor-name">${escape(this.tracker.visitor.name)}</span>)</span>
                </div>
                <span onclick="document.dispatchEvent(new CustomEvent('vt:toggle-chat'))" style="cursor: pointer; opacity: 0.6; font-size: 20px; color: white;">&times;</span>
            </div>
            <div id="vt-chat-msgs" style="flex: 1; padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; color: white; font-size: 13px;"></div>
            <div id="vt-typing" style="padding: 0 16px 5px; font-size: 11px; color: #00d2ff; display: none;">Support is typing...</div>
            <div id="vt-chat-input-area" style="padding: 12px 16px; display: flex; gap: 8px; background: rgba(0,0,0,0.2);">
                <input id="vt-chat-input" type="text" placeholder="Type a message..." style="flex: 1; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; padding: 10px 16px; color: white; outline: none; font-size: 13px;">
                <button id="vt-chat-send" style="background: #00d2ff; border: none; border-radius: 50%; width: 36px; height: 36px; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 16px;">&gt;</button>
            </div>
        `;
        document.body.appendChild(panel);

        this._renderChatHistory();

        setTimeout(() => {
            const input = document.getElementById('vt-chat-input');
            const sendBtn = document.getElementById('vt-chat-send');
            if (input) input.addEventListener('keypress', (e) => { if (e.key === 'Enter') this.sendChatMessage(); });
            if (sendBtn) sendBtn.addEventListener('click', () => this.sendChatMessage());
            document.addEventListener('vt:toggle-chat', () => this.toggleChat());
        }, 100);
    }

    _renderChatHistory() {
        const history = JSON.parse(sessionStorage.getItem('vt_chat_history') || '[]');
        const msgsContainer = document.getElementById('vt-chat-msgs');
        if (msgsContainer) {
            msgsContainer.innerHTML = '';
            if (history.length === 0) {
                this._addChatMessage('Hi! How can we help you today?', 'support', false);
            } else {
                history.forEach(m => this._addChatMessage(m.text, m.type, false));
            }
            msgsContainer.scrollTop = msgsContainer.scrollHeight;
        }
    }

    _addChatMessage(text, type, save = true) {
        const msgs = document.getElementById('vt-chat-msgs');
        if (!msgs) return;

        const div = document.createElement('div');
        const isSupport = type === 'support';
        div.style.cssText = isSupport
            ? 'background: rgba(255,255,255,0.1); padding: 10px 14px; border-radius: 12px 12px 12px 0; align-self: flex-start; border-left: 2px solid #00d2ff; max-width: 85%;'
            : 'background: #00d2ff; padding: 10px 14px; border-radius: 12px 12px 0 12px; align-self: flex-end; color: white; max-width: 85%;';
        div.innerText = text;
        msgs.appendChild(div);
        msgs.scrollTop = msgs.scrollHeight;

        if (save) {
            const history = JSON.parse(sessionStorage.getItem('vt_chat_history') || '[]');
            history.push({ text, type });
            sessionStorage.setItem('vt_chat_history', JSON.stringify(history));
        }
    }

    toggleChat() {
        const container = document.getElementById('vt-chat-panel');
        this.isChatOpen = !this.isChatOpen;

        if (this.isChatOpen) {
            container.style.display = 'flex';
            this.unreadCount = 0;
            this._updateUnreadBadge();
        } else {
            container.style.display = 'none';
        }
    }

    _updateUnreadBadge() {
        const bubble = document.getElementById('vt-chat-bubble');
        let badge = document.getElementById('vt-unread-badge');

        if (this.unreadCount > 0 && !this.isChatOpen) {
            if (!badge) {
                badge = document.createElement('div');
                badge.id = 'vt-unread-badge';
                badge.style = 'position:absolute; top:-5px; right:-5px; background:#ff4444; color:white; border-radius:10px; padding:2px 6px; font-size:10px; font-weight:bold; border:2px solid white;';
                bubble.appendChild(badge);
            }
            badge.innerText = this.unreadCount;
        } else if (badge) {
            badge.remove();
        }
    }

    sendChatMessage() {
        const input = document.getElementById('vt-chat-input');
        const text = input.value.trim();
        if (!text) return;

        this._addChatMessage(text, 'visitor');
        if (this.telegram.sendChatMessage) {
            this.telegram.sendChatMessage(text);
        } else {
            this.telegram.sendNotification('Support Chat', `Message from ${this.tracker.visitor.name} (${this.tracker.visitor.country}): ${text}`);
        }
        input.value = '';
    }

    receiveChatReply(text, msgId) {
        if (sessionStorage.getItem(`vt_reply_seen_${msgId}`)) return;
        sessionStorage.setItem(`vt_reply_seen_${msgId}`, 'true');

        const typing = document.getElementById('vt-typing');
        if (typing) typing.style.display = 'block';

        setTimeout(() => {
            if (typing) typing.style.display = 'none';
            this._addChatMessage(text, 'support');

            const panel = document.getElementById('vt-chat-panel');
            if (panel && panel.style.display === 'none') {
                this.showToast('New message from support!');
                this.unreadCount++;
                this._updateUnreadBadge();
            }
        }, 1000);
    }

    showToast(text) {
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed !important; bottom: 100px !important; right: 20px !important;
            background: rgba(0, 210, 255, 0.9) !important; color: white !important;
            padding: 12px 20px !important; border-radius: 30px !important;
            font-family: 'Inter Tight', sans-serif !important; font-size: 13px !important;
            z-index: 2147483647 !important; box-shadow: 0 5px 15px rgba(0,0,0,0.2) !important;
            animation: vt-fade-in 0.3s ease-out !important;
        `;
        toast.innerText = text;
        document.body.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; setTimeout(() => toast.remove(), 300); }, 4000);
    }
}
