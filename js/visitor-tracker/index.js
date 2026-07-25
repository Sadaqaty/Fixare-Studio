/**
 * VisitorTracker - Modular Website Visitor Intelligence & Telegram Alerts
 *
 * Usage:
 *   import { VisitorTracker } from './js/visitor-tracker/index.js';
 *   const tracker = new VisitorTracker({ token: '...', chatIds: [...] });
 *   tracker.init();
 */

import { DEFAULT_CONFIG, mergeConfig } from './config.js';
import { Tracker } from './tracker.js';
import { TelegramBridge } from './telegram.js';
import { UI } from './ui.js';
import { SocialProofEngine } from './social-proof.js';
import { getReferrerInfo } from './utils.js';

export class VisitorTracker {
    constructor(options = {}) {
        this.config = mergeConfig(DEFAULT_CONFIG, options);
        this.tracker = new Tracker(this.config);
        this.ui = new UI(this.config, this.tracker, null);
        this.telegram = new TelegramBridge(this.config, this.tracker, this.ui);
        this.ui.telegram = this.telegram;
        this.socialProof = new SocialProofEngine(this.config, this.ui);
        this.socialProof.tracker = this.tracker;
        this._initialized = false;
    }

    async init() {
        if (this._initialized) return;
        this._initialized = true;

        this.tracker.loadVisitorData();
        this.tracker.startSync();
        this.tracker.getReferrerInfo = getReferrerInfo;

        this.tracker.fetchGeolocation();

        if (this.config.trackPageViews && this.tracker.visitor.name !== 'Anonymous') {
            this.telegram.sendNotification('Returning Visitor Arrival');
        }

        this.telegram.startPolling(this.config.pollingInterval);

        if (this.config.enableChat) {
            this.ui.showChat();
        }
        if (this.config.enableSocialProof) {
            this.socialProof.start();
        }

        document.addEventListener('vt:identify', (e) => {
            const nameEl = document.getElementById('vt-visitor-name');
            if (nameEl) nameEl.innerText = e.detail.name;

            if (e.detail.oldName === 'Anonymous') {
                this.telegram.sendNotification('New Visitor Identity Established');
            } else if (e.detail.oldName !== e.detail.name) {
                this.telegram.sendNotification('Visitor Identity Updated', `Name changed from ${e.detail.oldName} to ${e.detail.name}`);
            }
        });

        document.addEventListener('vt:track', (e) => {
            this.telegram.sendNotification(e.detail.action, e.detail.note);
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
        this.telegram.stopPolling();
        this.tracker.destroy();
        this._initialized = false;
    }
}

export { Tracker, TelegramBridge, UI, SocialProofEngine };
export default VisitorTracker;
