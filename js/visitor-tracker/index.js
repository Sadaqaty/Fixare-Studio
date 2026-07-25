/**
 * VisitorTracker - Modular Website Visitor Intelligence & Admin Panel Integration
 *
 * Usage:
 *   import { VisitorTracker } from './js/visitor-tracker/index.js';
 *   const tracker = new VisitorTracker({ supabaseUrl: '...', supabaseKey: '...' });
 *   tracker.init();
 */

import { DEFAULT_CONFIG, mergeConfig } from './config.js';
import { Tracker } from './tracker.js';
import { AdminBridge } from './admin-bridge.js';
import { UI } from './ui.js';
import { SocialProofEngine } from './social-proof.js';
import { getReferrerInfo } from './utils.js';

export class VisitorTracker {
    constructor(options = {}) {
        this.config = mergeConfig(DEFAULT_CONFIG, options);
        this.tracker = new Tracker(this.config);
        this.ui = new UI(this.config, this.tracker, null);
        this.admin = new AdminBridge(this.config, this.tracker, this.ui);
        this.ui.telegram = this.admin;
        this.socialProof = new SocialProofEngine(this.config, this.ui);
        this.socialProof.tracker = this.tracker;
        this._initialized = false;

        // Mark visitor offline on page unload
        window.addEventListener('beforeunload', () => this.admin.markVisitorOffline());
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                this.admin.markVisitorOffline();
            } else {
                this.admin.markVisitorOnline();
            }
        });
    }

    async init() {
        if (this._initialized) return;
        this._initialized = true;

        this.tracker.loadVisitorData();
        this.tracker.startSync();
        this.tracker.getReferrerInfo = getReferrerInfo;

        await this.tracker.fetchGeolocation();

        // Initialize Supabase bridge
        await this.admin.init();

        // Track page view
        this.admin.trackEvent('page_view', document.title);

        if (this.config.trackPageViews && this.tracker.visitor.name !== 'Anonymous') {
            this.admin.sendNotification('Returning Visitor Arrival');
        }

        if (this.config.enableChat) {
            this.ui.showChat();
        }
        if (this.config.enableSocialProof) {
            this.socialProof.start();
        }

        document.addEventListener('vt:identify', (e) => {
            const nameEl = document.getElementById('vt-visitor-name');
            if (nameEl) nameEl.innerText = e.detail.name;

            this.admin.trackEvent('identity', document.title, { name: e.detail.name });

            if (e.detail.oldName === 'Anonymous') {
                this.admin.sendNotification('New Visitor Identity Established');
            } else if (e.detail.oldName !== e.detail.name) {
                this.admin.sendNotification('Visitor Identity Updated', `Name changed from ${e.detail.oldName} to ${e.detail.name}`);
            }
        });

        document.addEventListener('vt:track', (e) => {
            this.admin.sendNotification(e.detail.action, e.detail.note);
        });

        document.addEventListener('vt:dismiss-promo', (e) => {
            this.ui.dismissUI('vt-promo', e.detail);
        });
    }

    identify(name) {
        return this.tracker.identify(name);
    }

    track(action, note = '') {
        this.tracker.trackAction(action, note);
    }

    sendChat(message) {
        const input = document.getElementById('vt-chat-input');
        if (input) {
            input.value = message;
            this.ui.sendChatMessage();
        }
    }

    destroy() {
        this.socialProof.stop();
        this.admin.destroy();
        this.tracker.destroy();
        this._initialized = false;
    }
}

export { Tracker, AdminBridge, UI, SocialProofEngine };
export default VisitorTracker;
