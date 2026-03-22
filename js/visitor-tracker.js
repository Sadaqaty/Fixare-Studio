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
                // Determine if it should notify right away
                // Rule: Notify if Returning user or if specific events occur.
                // For new users, we wait for action or identification to avoid spam
                if (this.visitor.name !== 'Anonymous') {
                    this.sendNotification('Returning Visitor Arrival');
                } else if (this.visitor.visits === 1) {
                    // This is the very first visit to the site
                    // User requested NOT sending "Initial" unless skip/start, 
                    // but for cross-page tracking we might want to know they landed.
                    // I'll skip "Initial" as per latest request.
                }
            }
        },

        loadVisitorData: function() {
            // Use same keys as previous implementation for compatibility
            this.visitor.name = localStorage.getItem('name') || 'Anonymous';
            
            // Use a local flag to increment visits only once per window session if desired,
            // but the user asked for "every time", so we'll do it on every script load/init.
            // To prevent double counting on simple page reloads in quick succession, we can use sessionStorage.
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
                // Using ipapi.co as it was reliable in the previous step
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
