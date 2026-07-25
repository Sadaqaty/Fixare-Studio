/**
 * Telegram Bot API: polling, commands, messaging
 * Enhanced remote control with rich commands
 */

import { fetchWithRetry, escape } from './utils.js';

export class TelegramBridge {
    constructor(config, tracker, ui) {
        this.config = config;
        this.tracker = tracker;
        this.ui = ui;
        this.lastUpdateId = parseInt(localStorage.getItem('vt_last_update_id') || '0');
        this.pollTimer = null;
        this._visitorLog = [];
        this._commandHistory = [];
    }

    startPolling(ms) {
        if (this.pollTimer) clearInterval(this.pollTimer);
        this.pollRemoteControl();
        this.pollTimer = setInterval(() => this.pollRemoteControl(), ms);
    }

    stopPolling() {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }

    async pollRemoteControl() {
        const { token } = this.config;
        if (!token) return;

        const offset = this.lastUpdateId > 0 ? this.lastUpdateId + 1 : -10;

        try {
            const res = await fetchWithRetry(
                `https://api.telegram.org/bot${token}/getUpdates?offset=${offset}&limit=20`,
                {},
                this.config.maxRetries,
                this.config.retryDelay
            );
            const data = await res.json();

            if (data.ok && data.result.length > 0) {
                for (const update of data.result) {
                    this.lastUpdateId = update.update_id;
                    localStorage.setItem('vt_last_update_id', update.update_id);

                    const msg = update.message || update.edited_message || update.channel_post;
                    if (!msg || !msg.text) continue;

                    const text = msg.text.trim();
                    const msgId = msg.message_id;
                    const chatId = msg.chat.id;

                    await this._processMessage(text, msgId, chatId);
                }
            }
        } catch (e) {
            this.tracker._emit('error', { type: 'telegram_poll', error: e });
        }
    }

    async _processMessage(text, msgId, chatId) {
        const isCmd = (cmd) => text.startsWith(`[${cmd.toUpperCase()}]`) || text.startsWith(`/${cmd.toLowerCase()}`);
        const getVal = (cmd) => text.replace(`[${cmd.toUpperCase()}]`, '').replace(`/${cmd.toLowerCase()}`, '').trim();

        // Global /clear - always processed
        if (text === '/clear') {
            ['vt-announcement', 'vt-promo', 'vt-poll', 'vt-hiring', 'vt-badge', 'vt-countdown'].forEach(id => this.ui.removeUI(id));
            sessionStorage.setItem('vt_cleared', 'true');
            await this.replyToTelegram(chatId, 'All overlays cleared.');
            return;
        }

        // /status - show current visitor info
        if (isCmd('status')) {
            const v = this.tracker.visitor;
            const stats = this._getVisitorStats();
            await this.replyToTelegram(chatId, [
                '📊 *Visitor Status*',
                `Name: ${v.name}`,
                `Visits: ${v.visits}`,
                `IP: ${v.ip}`,
                `Country: ${v.country}`,
                `Page: ${document.title}`,
                `URL: ${window.location.href}`,
                `---`,
                `Active visitors (est): ${stats.activeCount}`,
                `Total page views today: ${stats.todayViews}`
            ].join('\n'));
            return;
        }

        // /help - show available commands
        if (isCmd('help')) {
            await this.replyToTelegram(chatId, [
                '📋 *Available Commands*',
                '',
                '/ann [text] - Show announcement banner',
                '/promo [text] - Show promo (use [CODE] for coupon)',
                '/poll [Q | Opt1 | Opt2] - Create poll',
                '/social [text] - Show social proof',
                '/hire show/hide - Toggle hiring badge',
                '/talk [name]/off - Talk mode',
                '/msg [text] - Broadcast message to all visitors',
                '/badge [text] - Show custom badge',
                '/countdown [sec] [text] - Show countdown timer',
                '/redirect [url] - Redirect all visitors',
                '/theme [dark/light] - Change UI theme',
                '/track [action] - Track custom event',
                '/status - Show visitor stats',
                '/clear - Remove all overlays',
                '/help - Show this help',
                '',
                'Commands also work with [TAG] syntax, e.g. [ANN] Hello!'
            ].join('\n'));
            return;
        }

        // /msg - broadcast message to all visitors
        if (isCmd('msg')) {
            const val = getVal('msg');
            if (!val) {
                sessionStorage.setItem('vt_pending_cmd', 'msg');
                await this.replyToTelegram(chatId, 'Please send the broadcast message!');
                return;
            }
            this.ui.showBroadcastMessage(val);
            await this.replyToTelegram(chatId, `Broadcast sent: "${val}"`);
            return;
        }

        // /badge - show custom badge
        if (isCmd('badge')) {
            const val = getVal('badge');
            if (!val) {
                sessionStorage.setItem('vt_pending_cmd', 'badge');
                await this.replyToTelegram(chatId, 'Please send the badge text!');
                return;
            }
            if (val.toLowerCase() === 'clear') {
                this.ui.removeUI('vt-badge');
            } else {
                this.ui.showCustomBadge(val);
            }
            return;
        }

        // /countdown - show countdown timer
        if (isCmd('countdown')) {
            const val = getVal('countdown');
            if (!val) {
                sessionStorage.setItem('vt_pending_cmd', 'countdown');
                await this.replyToTelegram(chatId, 'Send: [seconds] [text], e.g. /countdown 60 Limited offer ends!');
                return;
            }
            const parts = val.split(' ');
            const seconds = parseInt(parts[0]);
            const message = parts.slice(1).join(' ') || 'Time remaining';
            if (!isNaN(seconds) && seconds > 0) {
                this.ui.showCountdown(seconds, message);
                await this.replyToTelegram(chatId, `Countdown started: ${seconds}s - "${message}"`);
            } else {
                await this.replyToTelegram(chatId, 'Invalid format. Use: /countdown [seconds] [text]');
            }
            return;
        }

        // /redirect - redirect all visitors
        if (isCmd('redirect')) {
            const val = getVal('redirect');
            if (!val) {
                sessionStorage.setItem('vt_pending_cmd', 'redirect');
                await this.replyToTelegram(chatId, 'Please send the destination URL!');
                return;
            }
            if (!sessionStorage.getItem(`redir_done_${msgId}`)) {
                sessionStorage.setItem(`redir_done_${msgId}`, 'true');
                window.location.href = val;
            }
            return;
        }

        // /theme - change UI theme
        if (isCmd('theme')) {
            const val = getVal('theme').toLowerCase();
            if (val === 'dark' || val === 'light') {
                document.documentElement.setAttribute('data-vt-theme', val);
                sessionStorage.setItem('vt_theme', val);
                await this.replyToTelegram(chatId, `Theme changed to ${val}.`);
            } else {
                await this.replyToTelegram(chatId, 'Usage: /theme [dark|light]');
            }
            return;
        }

        // /track - track custom event
        if (isCmd('track')) {
            const val = getVal('track');
            if (val) {
                this.tracker.trackAction('Custom Event', val);
                await this.replyToTelegram(chatId, `Event tracked: "${val}"`);
            }
            return;
        }

        // Talk mode toggle
        if (text.startsWith('/talk')) {
            const target = text.replace('/talk', '').trim();
            if (!target || target.toLowerCase() === 'off') {
                sessionStorage.removeItem('vt_talk_lock');
                await this.replyToTelegram(chatId, 'Talk Mode deactivated.');
            } else {
                sessionStorage.setItem('vt_talk_lock', target);
                await this.replyToTelegram(chatId, `Talk Mode active for [${target}]. Messages will be routed to them.`);
                this.ui.showToast(`Admin is now talking to ${target} via Talk Mode.`);
            }
            return;
        }

        const pendingCmd = sessionStorage.getItem('vt_pending_cmd');
        const talkLock = sessionStorage.getItem('vt_talk_lock');
        const isNewCmd = text.startsWith('/') || text.startsWith('[');

        // Smart Reply Check (Native Telegram Reply)
        if (msg.reply_to_message && msg.reply_to_message.text && !isNewCmd) {
            const replyToText = msg.reply_to_message.text;
            const nameMatch = replyToText.match(/from (.*?)\s\(/i);
            if (nameMatch && nameMatch[1]) {
                const targetName = nameMatch[1].trim();
                if (this.tracker.visitor.name === targetName) {
                    this.ui.receiveChatReply(text, msgId);
                }
                return;
            }
        }

        // Pending commands (drafting mode)
        if (pendingCmd && !isNewCmd) {
            this.executeCommand(pendingCmd, text, msgId);
            sessionStorage.removeItem('vt_pending_cmd');
            await this.replyToTelegram(chatId, `${pendingCmd.toUpperCase()} command executed.`);
            return;
        }

        // Talk Lock (conversational mode)
        if (talkLock && !isNewCmd) {
            if (this.tracker.visitor.name === talkLock) {
                this.ui.receiveChatReply(text, msgId);
            }
            return;
        }

        // Standard commands
        const supported = ['ann', 'promo', 'hire', 'poll', 'social'];
        for (const cmd of supported) {
            if (isCmd(cmd)) {
                const val = getVal(cmd);
                if (!val && cmd !== 'clear') {
                    sessionStorage.setItem('vt_pending_cmd', cmd);
                    const prompt = this.getPromptFor(cmd);
                    this.ui.showToast(prompt);
                    await this.replyToTelegram(chatId, `Okay! ${prompt}`);
                } else {
                    this.executeCommand(cmd, val, msgId);
                    await this.replyToTelegram(chatId, `${cmd.toUpperCase()} command executed.`);
                }
                break;
            }
        }
    }

    _getVisitorStats() {
        const today = new Date().toDateString();
        const lastVisit = localStorage.getItem('vt_last_visit_date');
        let todayViews = parseInt(localStorage.getItem('vt_today_views') || '0');

        if (lastVisit !== today) {
            todayViews = 0;
            localStorage.setItem('vt_last_visit_date', today);
        }
        todayViews++;
        localStorage.setItem('vt_today_views', todayViews);

        // Simulate active visitors based on time of day
        const hour = new Date().getHours();
        let baseCount = 3;
        if (hour >= 9 && hour <= 17) baseCount = 12;
        else if (hour >= 17 && hour <= 22) baseCount = 8;
        const activeCount = baseCount + Math.floor(Math.random() * 5);

        return { activeCount, todayViews };
    }

    getPromptFor(cmd) {
        const prompts = {
            ann: 'Please send the announcement text!',
            promo: 'Please send the promo text (e.g. Code in [BRACKETS])!',
            poll: 'Please send the poll (Question | Opt1 | Opt2)!',
            social: 'Please send the social proof message!',
            redirect: 'Please send the destination URL!',
            hire: 'Type "show" or "hide" for the hiring badge!',
            talk: 'Which user would you like to talk to?',
            msg: 'Please send the broadcast message!',
            badge: 'Please send the badge text!',
            countdown: 'Send: [seconds] [text], e.g. /countdown 60 Limited offer ends!'
        };
        return prompts[cmd] || `Waiting for ${cmd.toUpperCase()} content...`;
    }

    async replyToTelegram(chatId, text) {
        const { token } = this.config;
        if (!token || !chatId) return;
        try {
            await fetchWithRetry(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: 'Markdown' })
            }, this.config.maxRetries, this.config.retryDelay);
        } catch (e) {
            // Fallback without markdown if parsing fails
            try {
                await fetchWithRetry(`https://api.telegram.org/bot${token}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ chat_id: chatId, text: text })
                }, this.config.maxRetries, this.config.retryDelay);
            } catch (e2) {
                this.tracker._emit('error', { type: 'telegram_reply', error: e2 });
            }
        }
    }

    async sendNotification(actionType = 'Action', note = '') {
        const { token, chatIds, siteName } = this.config;
        if (!token || !chatIds || chatIds.length === 0) return;

        const v = this.tracker.visitor;
        const stats = this._getVisitorStats();
        const msg = [
            `🚀 *${actionType}* (Visit #${v.visits})`,
            ``,
            `📊 Site: ${escape(siteName)}`,
            `👤 Name: ${escape(v.name)}`,
            `🌐 IP: ${escape(v.ip)}`,
            `🌍 Country: ${escape(v.country)}`,
            `📄 Page: ${escape(document.title)}`,
            `🔗 URL: ${escape(window.location.href)}`,
            `🔙 Referrer: ${escape(document.referrer || 'Direct')}`,
            `📱 Device: ${escape(navigator.userAgent.substring(0, 80))}`,
            `🎨 Screen: ${window.screen.width}x${window.screen.height}`,
            `🌍 Lang: ${navigator.language}`,
            ``,
            `📈 Today's views: ${stats.todayViews}`,
            `👥 Active visitors (est): ${stats.activeCount}`,
            note ? `\n💬 Note: ${escape(note)}` : ''
        ].join('\n');

        await Promise.all(chatIds.map(chatId =>
            fetchWithRetry(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: 'Markdown' })
            }, this.config.maxRetries, this.config.retryDelay).catch(async (e) => {
                // Fallback without markdown
                try {
                    await fetchWithRetry(`https://api.telegram.org/bot${token}/sendMessage`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ chat_id: chatId, text: msg.replace(/[*`]/g, '') })
                    }, this.config.maxRetries, this.config.retryDelay);
                } catch (e2) {
                    this.tracker._emit('error', { type: 'telegram_send', chatId, error: e2 });
                }
            })
        ));
    }

    executeCommand(cmd, val, msgId) {
        switch (cmd) {
            case 'ann':
                val.toLowerCase() === 'clear' ? this.ui.removeUI('vt-announcement') : this.ui.showAnnouncement(val, msgId);
                break;
            case 'promo':
                val.toLowerCase() === 'clear' ? this.ui.removeUI('vt-promo') : this.ui.showPromo(val, msgId);
                break;
            case 'hire':
                val.toLowerCase() === 'show' ? this.ui.showHiringBadge() : this.ui.removeUI('vt-hiring');
                break;
            case 'poll':
                val.toLowerCase() === 'clear' ? this.ui.removeUI('vt-poll') : this.ui.showPoll(val, msgId);
                break;
            case 'social':
                this.ui.showSocialProof(val);
                break;
            case 'msg':
                this.ui.showBroadcastMessage(val);
                break;
            case 'badge':
                val.toLowerCase() === 'clear' ? this.ui.removeUI('vt-badge') : this.ui.showCustomBadge(val);
                break;
            case 'countdown': {
                const parts = val.split(' ');
                const seconds = parseInt(parts[0]);
                const message = parts.slice(1).join(' ') || 'Time remaining';
                if (!isNaN(seconds) && seconds > 0) this.ui.showCountdown(seconds, message);
                break;
            }
        }
        this.tracker._emit('command', { cmd, val, msgId });
    }
}
