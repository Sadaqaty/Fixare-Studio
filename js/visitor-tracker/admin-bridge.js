import { fetchWithRetry, escape } from './utils.js';

export class AdminBridge {
    constructor(config, tracker, ui) {
        this.config = config;
        this.tracker = tracker;
        this.ui = ui;
        this._visitorId = this._getVisitorId();
        this._channel = null;
        this._initialized = false;
        this._heartbeatTimer = null;
    }

    _getVisitorId() {
        let id = localStorage.getItem('vt_visitor_id');
        if (!id) {
            id = crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
            localStorage.setItem('vt_visitor_id', id);
        }
        return id;
    }

    _getVisitorName() {
        // Read name from multiple sources, prioritizing localStorage
        const localName = localStorage.getItem('name');
        const trackerName = this.tracker?.visitor?.name;
        return localName || trackerName || 'Anonymous';
    }

    async init() {
        if (this._initialized) return;
        const client = window.getVtSupabase ? window.getVtSupabase() : null;
        if (!client) {
            console.warn('[AdminBridge] Supabase not available');
            return;
        }

        await this._upsertVisitor();
        this._subscribeToOverlays();
        this._subscribeToChat();
        this.trackEvent('page_view', document.title);

        // Load existing active overlays
        await this._loadActiveOverlays();

        // Start heartbeat to keep visitor online
        this._startHeartbeat();

        // Listen for tab close or window unload to set visitor offline promptly
        window.addEventListener('pagehide', () => {
            this.markVisitorOffline();
        });

        document.addEventListener('visibilitychange', () => {
            this._updateHeartbeat();
        });

        // Listen for name changes
        window.addEventListener('storage', (e) => {
            if (e.key === 'name' && e.newValue) {
                this._updateVisitorName(e.newValue);
            }
        });

        this._initialized = true;
    }

    _startHeartbeat() {
        // Update last_visit_at & engagement metrics every 15 seconds for realtime tracking
        this._heartbeatTimer = setInterval(() => {
            this._updateHeartbeat();
        }, 15000);
    }

    async _updateHeartbeat() {
        const client = window.getVtSupabase();
        if (!client) return;
        try {
            await client.from('visitors').update({
                last_visit_at: new Date().toISOString(),
                is_online: !document.hidden && !this.tracker.isIdle,
                last_page: document.title,
                metadata: {
                    active_time_s: this.tracker.activeTimeSeconds,
                    max_scroll_pct: this.tracker.maxScrollDepth,
                    is_idle: this.tracker.isIdle,
                    url: window.location.href
                }
            }).eq('id', this._visitorId);
        } catch {}
    }

    async _updateVisitorName(name) {
        const client = window.getVtSupabase();
        if (!client) return;
        try {
            await client.from('visitors').update({ name }).eq('id', this._visitorId);
        } catch {}
    }

    async _upsertVisitor() {
        const client = window.getVtSupabase();
        if (!client) return;

        const visitorData = this._collectVisitorData();

        try {
            const { error } = await client.from('visitors').upsert(visitorData, { onConflict: 'id' });
            if (error) {
                if (error.code === '23505') {
                    try {
                        await client.from('visitors').update({
                            name: visitorData.name,
                            last_visit_at: new Date().toISOString(),
                            visit_count: visitorData.visit_count || 1,
                            last_page: visitorData.last_page,
                            is_online: true,
                            metadata: visitorData.metadata
                        }).eq('id', this._visitorId);
                    } catch {}
                }
            }
        } catch {}
    }

    _collectVisitorData() {
        let visitCount = parseInt(localStorage.getItem('vt_visit_count') || '0');
        if (!sessionStorage.getItem('vt_visit_incremented')) {
            visitCount++;
            localStorage.setItem('vt_visit_count', visitCount.toString());
            sessionStorage.setItem('vt_visit_incremented', 'true');
        }

        return {
            id: this._visitorId,
            name: this._getVisitorName(),
            ip: this.tracker.visitor.ip || 'Unknown',
            country: this.tracker.visitor.country || 'Unknown',
            city: this.tracker.visitor.city || this._getCity(),
            latitude: this.tracker.visitor.latitude || this._getCoords().lat,
            longitude: this.tracker.visitor.longitude || this._getCoords().lng,
            user_agent: navigator.userAgent,
            screen_width: window.screen.width,
            screen_height: window.screen.height,
            language: navigator.language,
            last_page: document.title,
            is_online: true,
            visit_count: visitCount,
            first_visit_at: localStorage.getItem('vt_first_visit') || new Date().toISOString(),
            last_visit_at: new Date().toISOString(),
            metadata: {
                fingerprint: this.tracker.visitor.fingerprint,
                capabilities: this.tracker.visitor.capabilities,
                performance: this.tracker.visitor.performance,
                referrer: document.referrer || 'Direct',
                url: window.location.href
            }
        };
    }

    _getCity() {
        try {
            const ipData = sessionStorage.getItem('ipData');
            if (ipData) {
                const parsed = JSON.parse(ipData);
                return parsed.city || parsed.country || 'Unknown';
            }
        } catch {}
        return 'Unknown';
    }

    _getCoords() {
        try {
            const ipData = sessionStorage.getItem('ipData');
            if (ipData) {
                const parsed = JSON.parse(ipData);
                return { lat: parsed.latitude || null, lng: parsed.longitude || null };
            }
        } catch {}
        return { lat: null, lng: null };
    }

    async trackEvent(eventType, page, metadata = {}) {
        const client = window.getVtSupabase();
        if (!client) return;

        const eventData = {
            visitor_id: this._visitorId,
            event_type: eventType,
            page: page || document.title,
            url: window.location.href,
            referrer: document.referrer || null,
            metadata: metadata
        };

        try {
            const { error } = await client.from('events').insert(eventData);
            if (error && error.code === '23503') {
                delete eventData.visitor_id;
                await client.from('events').insert(eventData);
            }
        } catch {}
    }

    _subscribeToOverlays() {
        const client = window.getVtSupabase();
        if (!client) return;

        this._channel = client
            .channel('vt-overlays-' + this._visitorId)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'site_overlays' }, (payload) => {
                this._executeOverlay(payload.new);
            })
            .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'site_overlays' }, () => {
                ['vt-announcement', 'vt-promo', 'vt-poll', 'vt-badge', 'vt-countdown', 'vt-broadcast'].forEach(id => this.ui.removeUI(id));
            })
            .subscribe();
    }

    async _loadActiveOverlays() {
        const client = window.getVtSupabase();
        if (!client) return;

        try {
            const { data: overlays, error } = await client
                .from('site_overlays')
                .select('*')
                .eq('is_active', true);

            if (error || !overlays) return;

            // Display each active overlay
            for (const overlay of overlays) {
                this._executeOverlay(overlay);
            }
        } catch {}
    }

    _executeOverlay(overlay) {
        if (!overlay.is_active) return;
        switch (overlay.type) {
            case 'announcement': this.ui.showAnnouncement(overlay.content, overlay.id); break;
            case 'promo': this.ui.showPromo(overlay.content, overlay.id); break;
            case 'poll': this.ui.showPoll(overlay.content, overlay.id); break;
            case 'badge': this.ui.showCustomBadge(overlay.content); break;
            case 'countdown': this.ui.showCountdown(overlay.options?.seconds || 60, overlay.content); break;
            case 'broadcast': this.ui.showBroadcastMessage(overlay.content); break;
            case 'social_proof': this.ui.showSocialProof(overlay.content); break;
            case 'popup': this.ui.showPopup(overlay.title || 'Notice', overlay.content, overlay.options?.type || 'info', overlay.id); break;
            case 'banner': this.ui.showAnnouncement(overlay.content, overlay.id); break;
            case 'toast': this.ui.showToast(overlay.content); break;
        }
    }

    _subscribeToChat() {
        const client = window.getVtSupabase();
        if (!client) return;

        client
            .channel('vt-chat-' + this._visitorId)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `visitor_id=eq.${this._visitorId}` }, (payload) => {
                if (payload.new.sender === 'admin' || payload.new.sender === 'support') {
                    this.ui.receiveChatReply(payload.new.message, payload.new.id);
                }
            })
            .subscribe();
    }

    async sendNotification(actionType = 'Action', note = '') {
        const client = window.getVtSupabase();
        if (!client) return;

        try {
            await client.from('events').insert({
                visitor_id: this._visitorId,
                event_type: actionType.toLowerCase().replace(/\s+/g, '_'),
                page: document.title,
                url: window.location.href,
                referrer: document.referrer || null,
                metadata: { name: this._getVisitorName(), note: note || undefined }
            });
        } catch {}
    }

    async sendChatMessage(text) {
        const client = window.getVtSupabase();
        if (!client) return;

        const chatData = { visitor_id: this._visitorId, sender: 'visitor', message: text };
        try {
            const { error } = await client.from('chat_messages').insert(chatData);
            if (error && error.code === '23503') {
                delete chatData.visitor_id;
                await client.from('chat_messages').insert(chatData);
            }
        } catch {}
    }

    async markVisitorOnline() {
        const client = window.getVtSupabase();
        if (!client) return;
        try {
            await client.from('visitors').update({ is_online: true, last_visit_at: new Date().toISOString() }).eq('id', this._visitorId);
        } catch {}
    }

    async markVisitorOffline() {
        const client = window.getVtSupabase();
        if (!client) return;
        try {
            await client.from('visitors').update({ is_online: false }).eq('id', this._visitorId);
        } catch {}
    }

    destroy() {
        if (this._heartbeatTimer) clearInterval(this._heartbeatTimer);
        if (this._channel) {
            const client = window.getVtSupabase();
            if (client) client.removeChannel(this._channel);
        }
        this.markVisitorOffline();
    }
}
