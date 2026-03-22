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
            await this.fetchGeolocation();

            // 3. Automated Notifications
            if (this.config.trackPageViews) {
                if (this.visitor.name !== 'Anonymous') {
                    this.sendNotification('Returning Visitor Arrival');
                }
            }

            // 4. Check for Remote Announcements
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
                // Get only the latest message to avoid heavy processing
                const res = await fetch(`https://api.telegram.org/bot${token}/getUpdates?offset=-1&limit=1`);
                const data = await res.json();
                
                if (data.ok && data.result.length > 0) {
                    const latest = data.result[0].message;
                    if (!latest || !latest.text) return;

                    const text = latest.text.trim();
                    if (text.startsWith('[ANN]')) {
                        const content = text.replace('[ANN]', '').trim();
                        if (content.toLowerCase() === 'clear') {
                            this.removeAnnouncement();
                        } else if (content) {
                            this.showAnnouncement(content, latest.message_id);
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
            // Don't show if user dismissed THIS specific message already
            if (sessionStorage.getItem(`ann_dismissed_${msgId}`)) return;
            if (document.getElementById('vt-announcement')) return;

            const banner = document.createElement('div');
            banner.id = 'vt-announcement';
            banner.style.cssText = `
                position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
                z-index: 99999; width: 90%; max-width: 600px;
                padding: 16px 24px; border-radius: 12px;
                background: rgba(255, 255, 255, 0.1); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
                border: 1px solid rgba(255, 255, 255, 0.2); color: white;
                box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);
                font-family: 'Inter', sans-serif; font-size: 14px; line-height: 1.5;
                display: flex; align-items: center; justify-content: space-between;
                animation: vt-slide-down 0.5s ease-out;
            `;

            const style = document.createElement('style');
            style.innerHTML = `
                @keyframes vt-slide-down { from { top: -100px; opacity: 0; } to { top: 20px; opacity: 1; } }
                #vt-announcement b { color: #00d2ff; }
                .vt-close { cursor: pointer; margin-left: 15px; opacity: 0.6; transition: 0.2s; font-size: 20px; }
                .vt-close:hover { opacity: 1; color: #ff4b2b; }
            `;
            document.head.appendChild(style);

            banner.innerHTML = `
                <div>🚀 <b>Announcement:</b> ${this.escape(text)}</div>
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
