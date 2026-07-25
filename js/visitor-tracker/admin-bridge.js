/**
 * Admin Bridge - Replaces Telegram-based communication with Supabase
 * Enhanced visitor tracking with profiles, proper error handling, and retry logic
 */

import { fetchWithRetry, escape } from './utils.js';

export class AdminBridge {
    constructor(config, tracker, ui) {
        this.config = config;
        this.tracker = tracker;
        this.ui = ui;
        this._visitorId = this._getVisitorId();
        this._channel = null;
        this._initialized = false;
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

    async init() {
        if (this._initialized) return;
        const client = window.getVtSupabase ? window.getVtSupabase() : null;
        if (!client) {
            console.warn('[AdminBridge] Supabase not available');
            return;
        }

        // Upsert visitor with full profile data
        await this._upsertVisitor();

        // Subscribe to overlays for real-time commands
        this._subscribeToOverlays();

        // Subscribe to chat messages for admin replies
        this._subscribeToChat();

        // Track initial page view
        this.trackEvent('page_view', document.title);

        this._initialized = true;
    }

    async _upsertVisitor() {
        const client = window.getVtSupabase();
        if (!client) return;

        const visitorData = this._collectVisitorData();

        try {
            // Try upsert first
            const { error } = await client.from('visitors').upsert(visitorData, { onConflict: 'id' });
            if (error) {
                // If duplicate key, just update last visit
                if (error.code === '23505') {
                    try {
                        await client.from('visitors').update({
                            last_visit_at: new Date().toISOString(),
                            visit_count: visitorData.visit_count || 1,
                            last_page: visitorData.last_page,
                            is_online: true
                        }).eq('id', this._visitorId);
                    } catch {}
                } else {
                    console.warn('[AdminBridge] Visitor:', error.message);
                }
            }
        } catch (e) {
            console.warn('[AdminBridge] Visitor:', e.message);
        }
    }

    _collectVisitorData() {
        // Get visit count from localStorage
        let visitCount = parseInt(localStorage.getItem('vt_visit_count') || '0');
        if (!sessionStorage.getItem('vt_visit_incremented')) {
            visitCount++;
            localStorage.setItem('vt_visit_count', visitCount.toString());
            sessionStorage.setItem('vt_visit_incremented', 'true');
        }

        // Collect all available info without asking
        const data = {
            id: this._visitorId,
            name: this.tracker.visitor.name || localStorage.getItem('name') || 'Anonymous',
            ip: this.tracker.visitor.ip || 'Unknown',
            country: this.tracker.visitor.country || 'Unknown',
            city: this._getCity(),
            user_agent: navigator.userAgent,
            screen_width: window.screen.width,
            screen_height: window.screen.height,
            language: navigator.language,
            last_page: document.title,
            is_online: true,
            visit_count: visitCount,
            first_visit_at: localStorage.getItem('vt_first_visit') || new Date().toISOString(),
            last_visit_at: new Date().toISOString()
        };

        // Store first visit time
        if (!localStorage.getItem('vt_first_visit')) {
            localStorage.setItem('vt_first_visit', data.first_visit_at);
        }

        return data;
    }

    _getCity() {
        // Try to get city from geolocation if available
        try {
            const ipData = sessionStorage.getItem('ipData');
            if (ipData) {
                const parsed = JSON.parse(ipData);
                return parsed.city || parsed.country || 'Unknown';
            }
        } catch {}
        return 'Unknown';
    }

    async trackEvent(eventType, page, metadata = {}) {
        const client = window.getVtSupabase();
        if (!client) return;

        // Don't track if collection is disabled
        const settings = this._getSettings();
        if (settings && settings.disabled_events && settings.disabled_events.includes(eventType)) {
            return;
        }

        const eventData = {
            visitor_id: this._visitorId,
            event_type: eventType,
            page: page || document.title,
            url: window.location.href,
            referrer: document.referrer || null,
            metadata: metadata
        };

        // Try to insert, handle foreign key errors gracefully
        try {
            const { error } = await client.from('events').insert(eventData);
            if (error) {
                // If foreign key error, try without visitor_id
                if (error.code === '23503') {
                    delete eventData.visitor_id;
                    await client.from('events').insert(eventData);
                } else if (error.code !== '23505') {
                    console.warn('[AdminBridge] Event:', error.message);
                }
            }
        } catch (e) {
            if (e.code !== '23505' && e.code !== '23503') {
                console.warn('[AdminBridge] Event tracking:', e.message);
            }
        }
    }

    _getSettings() {
        try {
            const settings = localStorage.getItem('vt_settings');
            return settings ? JSON.parse(settings) : null;
        } catch {
            return null;
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
            }, () => {
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
            if (e.code !== '23505') {
                console.warn('[AdminBridge] Notification:', e.message);
            }
        }
    }

    async sendChatMessage(text) {
        const client = window.getVtSupabase();
        if (!client) return;

        // Check if chat is enabled
        const settings = this._getSettings();
        if (settings && settings.chat_enabled === false) return;

        const chatData = {
            visitor_id: this._visitorId,
            sender: 'visitor',
            message: text
        };

        try {
            const { error } = await client.from('chat_messages').insert(chatData);
            if (error) {
                // If foreign key error, try without visitor_id
                if (error.code === '23503') {
                    delete chatData.visitor_id;
                    await client.from('chat_messages').insert(chatData);
                } else if (error.code !== '23505') {
                    console.warn('[AdminBridge] Chat:', error.message);
                }
            }
        } catch (e) {
            if (e.code !== '23505' && e.code !== '23503') {
                console.warn('[AdminBridge] Chat send:', e.message);
            }
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
        } catch {}
    }

    async markVisitorOffline() {
        const client = window.getVtSupabase();
        if (!client) return;

        try {
            await client.from('visitors').update({
                is_online: false
            }).eq('id', this._visitorId);
        } catch {}
    }

    destroy() {
        if (this._channel) {
            const client = window.getVtSupabase();
            if (client) client.removeChannel(this._channel);
        }
        this.markVisitorOffline();
    }
}
