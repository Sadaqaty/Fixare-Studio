/**
 * Core tracking: visit counting, geolocation, identification
 */

import { storageGet, storageSet, fetchWithRetry } from './utils.js';

export class Tracker {
    constructor(config) {
        this.config = config;
        this.visitor = {
            name: 'Anonymous',
            visits: 0,
            ip: 'Unknown',
            country: 'Unknown'
        };
        this._listeners = [];
    }

    loadVisitorData() {
        this.visitor.name = localStorage.getItem('name') || 'Anonymous';
        if (!sessionStorage.getItem('visitIncremented')) {
            this.visitor.visits = parseInt(localStorage.getItem('visitCount') || '0') + 1;
            localStorage.setItem('visitCount', this.visitor.visits);
            sessionStorage.setItem('visitIncremented', 'true');
        } else {
            this.visitor.visits = parseInt(localStorage.getItem('visitCount') || '1');
        }
    }

    async fetchGeolocation() {
        const cached = sessionStorage.getItem('ipData');
        if (cached) {
            try {
                const data = JSON.parse(cached);
                this.visitor.ip = data.ip || 'Unknown';
                this.visitor.country = data.country || 'Unknown';
                return;
            } catch { /* re-fetch */ }
        }
        try {
            const res = await fetchWithRetry('https://ipapi.co/json/', {}, this.config.maxRetries, this.config.retryDelay);
            const data = await res.json();
            this.visitor.ip = data.ip || 'Unknown';
            this.visitor.country = data.country_name || 'Unknown';
            sessionStorage.setItem('ipData', JSON.stringify({ ip: this.visitor.ip, country: this.visitor.country }));
        } catch (e) {
            this._emit('error', { type: 'geolocation', error: e });
        }
    }

    identify(name) {
        const oldName = this.visitor.name;
        this.visitor.name = name;
        localStorage.setItem('name', name);
        this._emit('identify', { oldName, name });
        return { oldName, name };
    }

    trackAction(actionTag, note = '') {
        this._emit('track', { action: actionTag, note });
    }

    startSync() {
        const handler = () => this.loadVisitorData();
        window.addEventListener('storage', handler);
        this._listeners.push(() => window.removeEventListener('storage', handler));
    }

    destroy() {
        this._listeners.forEach(fn => fn());
        this._listeners = [];
    }

    _emit(event, data) {
        document.dispatchEvent(new CustomEvent(`vt:${event}`, { detail: data }));
        const hook = this.config.hooks?.[event === 'error' ? 'onError' : `on${event.charAt(0).toUpperCase() + event.slice(1)}`];
        if (hook) try { hook(data); } catch { /* hook error */ }
    }
}
