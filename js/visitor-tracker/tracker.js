/**
 * Core tracking: visit counting, geolocation, identification, & client-side metrics
 */

import {
    storageGet,
    storageSet,
    fetchGeolocationCascade,
    generateFingerprint,
    getDeviceCapabilities,
    getPerformanceMetrics
} from './utils.js';

export class Tracker {
    constructor(config) {
        this.config = config;
        this.visitor = {
            name: 'Anonymous',
            visits: 0,
            ip: 'Unknown',
            country: 'Unknown',
            city: 'Unknown',
            latitude: null,
            longitude: null,
            fingerprint: generateFingerprint(),
            capabilities: getDeviceCapabilities(),
            performance: getPerformanceMetrics()
        };
        this.maxScrollDepth = 0;
        this.activeTimeSeconds = 0;
        this.isIdle = false;
        this._idleTimer = null;
        this._listeners = [];
    }

    loadVisitorData() {
        this.visitor.name = localStorage.getItem('name') || 'Anonymous';
        if (!sessionStorage.getItem('visitIncremented')) {
            this.visitor.visits = parseInt(localStorage.getItem('visitCount') || '0') + 1;
            localStorage.setItem('visitCount', this.visitor.visits.toString());
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
                this.visitor.city = data.city || 'Unknown';
                this.visitor.latitude = data.latitude || null;
                this.visitor.longitude = data.longitude || null;
                return;
            } catch { /* re-fetch */ }
        }
        try {
            const data = await fetchGeolocationCascade();
            this.visitor.ip = data.ip;
            this.visitor.country = data.country;
            this.visitor.city = data.city;
            this.visitor.latitude = data.latitude;
            this.visitor.longitude = data.longitude;

            sessionStorage.setItem('ipData', JSON.stringify({
                ip: data.ip,
                country: data.country,
                city: data.city,
                latitude: data.latitude,
                longitude: data.longitude
            }));
        } catch (e) {
            this._emit('error', { type: 'geolocation', error: e });
        }
    }

    startRealtimeEngagementTracking() {
        // Active time counter (every 1 second when tab is active and not idle)
        const timeInterval = setInterval(() => {
            if (!document.hidden && !this.isIdle) {
                this.activeTimeSeconds++;
            }
        }, 1000);
        this._listeners.push(() => clearInterval(timeInterval));

        // Idle Detector (30s inactivity)
        const resetIdle = () => {
            if (this.isIdle) {
                this.isIdle = false;
                this._emit('track', { action: 'user_active', note: 'Resumed activity' });
            }
            if (this._idleTimer) clearTimeout(this._idleTimer);
            this._idleTimer = setTimeout(() => {
                this.isIdle = true;
                this._emit('track', { action: 'user_idle', note: 'Inactivity detected' });
            }, 30000);
        };

        ['mousemove', 'keydown', 'scroll', 'touchstart', 'click'].forEach(evt => {
            window.addEventListener(evt, resetIdle, { passive: true });
            this._listeners.push(() => window.removeEventListener(evt, resetIdle));
        });
        resetIdle();

        // Scroll depth milestones tracking (25%, 50%, 75%, 90%)
        const milestones = [25, 50, 75, 90];
        const trackedMilestones = new Set();

        const handleScroll = () => {
            const winScroll = window.scrollY || document.documentElement.scrollTop;
            const height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
            if (height <= 0) return;
            const scrolledPct = Math.min(100, Math.round((winScroll / height) * 100));

            if (scrolledPct > this.maxScrollDepth) {
                this.maxScrollDepth = scrolledPct;
            }

            milestones.forEach(m => {
                if (scrolledPct >= m && !trackedMilestones.has(m)) {
                    trackedMilestones.add(m);
                    this._emit('track', { action: 'scroll_depth', note: `Reached ${m}% page depth` });
                }
            });
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        this._listeners.push(() => window.removeEventListener('scroll', handleScroll));

        // Auto Click & Outbound Link Tracker
        const handleClick = (e) => {
            const target = e.target.closest('a, button, input[type="submit"], .btn, .nav-link');
            if (target) {
                const text = target.innerText?.trim() || target.value || target.alt || target.getAttribute('aria-label') || 'Element';
                const href = target.getAttribute('href') || target.action || '';
                const isOutbound = href.startsWith('http') && !href.includes(window.location.hostname);
                
                this.trackAction(isOutbound ? 'outbound_click' : 'element_click', `Clicked "${text.substring(0, 40)}"${href ? ' -> ' + href : ''}`);
            }
        };

        document.addEventListener('click', handleClick, { capture: true });
        this._listeners.push(() => document.removeEventListener('click', handleClick, { capture: true }));
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
        if (this._idleTimer) clearTimeout(this._idleTimer);
    }

    _emit(event, data) {
        document.dispatchEvent(new CustomEvent(`vt:${event}`, { detail: data }));
        const hook = this.config.hooks?.[event === 'error' ? 'onError' : `on${event.charAt(0).toUpperCase() + event.slice(1)}`];
        if (hook) try { hook(data); } catch { /* hook error */ }
    }
}

