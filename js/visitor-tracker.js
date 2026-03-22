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
            siteName: 'Fixare Studio'
        },
        visitor: {
            name: 'Anonymous',
            visits: 0,
            ip: 'Unknown',
            country: 'Unknown'
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
            this.fetchGeolocation(); // Don't await, let it run in background

            // 3. Automated Notifications
            if (this.config.trackPageViews && this.visitor.name !== 'Anonymous') {
                this.sendNotification('Returning Visitor Arrival');
            }

            // 4. Check for Remote Announcements (Independent)
            this.checkAnnouncements();
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

        /**
         * Fetch latest messages from Telegram to check for [ANN] commands
         */
        checkAnnouncements: async function() {
            const { token } = this.config;
            if (!token) return;

            try {
                // Fetch last 10 updates to find the latest [ANN] command even if other messages followed
                const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=-10&limit=10`);
                const data = await res.json();
                
                if (data.ok && data.result.length > 0) {
                    // Iterate backwards (newest first)
                    for (let i = data.result.length - 1; i >= 0; i--) {
                        const update = data.result[i];
                        const msg = update.message || update.edited_message || update.channel_post;
                        
                        if (msg && msg.text) {
                            const text = msg.text.trim();
                            if (text.startsWith('[ANN]')) {
                                const content = text.replace('[ANN]', '').trim();
                                if (content.toLowerCase() === 'clear') {
                                    this.removeAnnouncement();
                                    return; // Found 'clear', stop searching
                                } else if (content) {
                                    this.showAnnouncement(content, msg.message_id);
                                    return; // Found latest announcement, stop searching
                                }
                            }
                        }
                    }
                }
            } catch (e) {
                console.error('[VisitorTracker] Announcement check failed:', e);
            }
        },

        /**
         * Inject a modern announcement banner into the DOM
         */
        showAnnouncement: function(text, msgId) {
            if (sessionStorage.getItem(`ann_dismissed_${msgId}`)) return;
            if (document.getElementById('vt-announcement')) return;

            const banner = document.createElement('div');
            banner.id = 'vt-announcement';
            banner.style.cssText = `
                position: fixed !important; top: 20px !important; left: 50% !important; 
                transform: translateX(-50%) !important;
                z-index: 2147483647 !important; width: 90% !important; max-width: 600px !important;
                padding: 16px 24px !important; border-radius: 12px !important;
                background: rgba(10, 10, 20, 0.85) !important; 
                backdrop-filter: blur(15px) !important; -webkit-backdrop-filter: blur(15px) !important;
                border: 1px solid rgba(255, 255, 255, 0.2) !important; color: white !important;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5) !important;
                font-family: 'Inter', sans-serif !important; font-size: 14px !important; line-height: 1.5 !important;
                display: flex !important; align-items: center !important; justify-content: space-between !important;
                animation: vt-slide-down 0.5s ease-out !important;
                box-sizing: border-box !important;
            `;

            const style = document.createElement('style');
            style.innerHTML = `
                @keyframes vt-slide-down { from { top: -100px; opacity: 0; } to { top: 20px; opacity: 1; } }
                #vt-announcement b { color: #00d2ff !important; font-weight: 700 !important; }
                .vt-close { cursor: pointer !important; margin-left: 15px !important; opacity: 0.6 !important; transition: 0.2s !important; font-size: 22px !important; line-height: 1 !important; }
                .vt-close:hover { opacity: 1 !important; color: #ff4b2b !important; }
            `;
            document.head.appendChild(style);

            banner.innerHTML = `
                <div style="flex: 1 !important;">🚀 <b>Announcement:</b> ${this.escape(text)}</div>
                <div class="vt-close" onclick="VisitorTracker.dismissAnnouncement(${msgId})">&times;</div>
            `;
            document.body.appendChild(banner);
        },

        dismissAnnouncement: function(msgId) {
            this.removeAnnouncement();
            sessionStorage.setItem(`ann_dismissed_${msgId}`, 'true');
        },

        removeAnnouncement: function() {
            const el = document.getElementById('vt-announcement');
            if (el) el.remove();
        },

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
