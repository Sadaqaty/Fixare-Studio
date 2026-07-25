/**
 * Admin Bridge - Replaces Telegram-based communication with Supabase
 * Handles: overlay sync, chat messaging, event tracking, visitor reporting
 */

import { fetchWithRetry, escape } from './utils.js';

export class AdminBridge {
    constructor(config, tracker, ui) {
        this.config = config;
        this.tracker = tracker;
        this.ui = ui;
        this._visitorId = this._getVisitorId();
        this._channel = null;
        this._pollTimer = null;
    }

    _getVisitorId() {
        let id = localStorage.getItem('vt_visitor_id');
        if (!id) {
            // Generate a proper UUID v4
            id = crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
            localStorage.setItem('vt_visitor_id', id);
        }
        return id;
    }

    async init() {
        const client = window.getVtSupabase ? window.getVtSupabase() : null;
        if (!client) {
            console.warn('[AdminBridge] Supabase not available');
            return;
        }

        // Upsert visitor record
        await this._upsertVisitor();

        // Subscribe to overlays for real-time commands
        this._subscribeToOverlays();

        // Subscribe to chat messages for admin replies
        this._subscribeToChat();
    }

    async _upsertVisitor() {
        const client = window.getVtSupabase();
        if (!client) return;

        try {
            await client.from('visitors').upsert({
                id: this._visitorId,
                name: this.tracker.visitor.name,
                ip: this.tracker.visitor.ip,
                country: this.tracker.visitor.country,
                user_agent: navigator.userAgent,
                screen_width: window.screen.width,
                screen_height: window.screen.height,
                language: navigator.language,
                last_page: document.title,
                is_online: true,
                last_visit_at: new Date().toISOString()
            }, { onConflict: 'id' });
        } catch (e) {
            console.error('[AdminBridge] Visitor upsert error:', e);
        }
    }

    async trackEvent(eventType, page, metadata = {}) {
        const client = window.getVtSupabase();
        if (!client) return;

        try {
            await client.from('events').insert({
                visitor_id: this._visitorId,
                event_type: eventType,
                page: page || document.title,
                url: window.location.href,
                referrer: document.referrer || null,
                metadata: metadata
            });
        } catch (e) {
            console.error('[AdminBridge] Event tracking error:', e);
        }
    }

    _subscribeToOverlays() {
        const client = window.getVtSupabase();
        if (!client) return;

        this._channel = client
            .channel('vt-overlays-' + this._visitorId)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'site_overlays'
            }, (payload) => {
                this._executeOverlay(payload.new);
            })
            .on('postgres_changes', {
                event: 'DELETE',
                schema: 'public',
                table: 'site_overlays'
            }, (payload) => {
                // Clear related UI
                this.ui.removeUI('vt-announcement');
                this.ui.removeUI('vt-promo');
                this.ui.removeUI('vt-poll');
                this.ui.removeUI('vt-badge');
                this.ui.removeUI('vt-countdown');
                this.ui.removeUI('vt-broadcast');
            })
            .subscribe();
    }

    _executeOverlay(overlay) {
        if (!overlay.is_active) return;

        switch (overlay.type) {
            case 'announcement':
                this.ui.showAnnouncement(overlay.content, overlay.id);
                break;
            case 'promo':
                this.ui.showPromo(overlay.content, overlay.id);
                break;
            case 'poll':
                this.ui.showPoll(overlay.content, overlay.id);
                break;
            case 'badge':
                this.ui.showCustomBadge(overlay.content);
                break;
            case 'countdown': {
                const opts = overlay.options || {};
                this.ui.showCountdown(opts.seconds || 60, overlay.content);
                break;
            }
            case 'broadcast':
                this.ui.showBroadcastMessage(overlay.content);
                break;
            case 'social_proof':
                this.ui.showSocialProof(overlay.content);
                break;
        }
    }

    _subscribeToChat() {
        const client = window.getVtSupabase();
        if (!client) return;

        client
            .channel('vt-chat-' + this._visitorId)
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'chat_messages',
                filter: `visitor_id=eq.${this._visitorId}`
            }, (payload) => {
                const msg = payload.new;
                if (msg.sender === 'admin' || msg.sender === 'support') {
                    this.ui.receiveChatReply(msg.message, msg.id);
                }
            })
            .subscribe();
    }

    async sendNotification(actionType = 'Action', note = '') {
        const client = window.getVtSupabase();
        if (!client) return;

        const v = this.tracker.visitor;
        try {
            await client.from('events').insert({
                visitor_id: this._visitorId,
                event_type: actionType.toLowerCase().replace(/\s+/g, '_'),
                page: document.title,
                url: window.location.href,
                referrer: document.referrer || null,
                metadata: {
                    name: v.name,
                    ip: v.ip,
                    country: v.country,
                    visits: v.visits,
                    note: note || undefined
                }
            });
        } catch (e) {
            console.error('[AdminBridge] Notification error:', e);
        }
    }

    async sendChatMessage(text) {
        const client = window.getVtSupabase();
        if (!client) return;

        try {
            await client.from('chat_messages').insert({
                visitor_id: this._visitorId,
                sender: 'visitor',
                message: text
            });
        } catch (e) {
            console.error('[AdminBridge] Chat send error:', e);
        }
    }

    async markVisitorOnline() {
        const client = window.getVtSupabase();
        if (!client) return;

        try {
            await client.from('visitors').update({
                is_online: true,
                last_visit_at: new Date().toISOString()
            }).eq('id', this._visitorId);
        } catch (e) { /* ignore */ }
    }

    async markVisitorOffline() {
        const client = window.getVtSupabase();
        if (!client) return;

        try {
            await client.from('visitors').update({
                is_online: false
            }).eq('id', this._visitorId);
        } catch (e) { /* ignore */ }
    }

    destroy() {
        if (this._channel) {
            const client = window.getVtSupabase();
            if (client) client.removeChannel(this._channel);
        }
        // Mark offline on page unload
        this.markVisitorOffline();
    }
}
