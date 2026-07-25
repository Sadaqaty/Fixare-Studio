/**
 * Utility helpers for VisitorTracker
 */

export function escape(str) {
    return String(str).replace(/[&<>"']/g, (tag) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[tag] || tag));
}

export function getReferrerInfo() {
    const ref = document.referrer || 'Direct';
    const params = new URLSearchParams(window.location.search);
    const utm = [];
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(p => {
        if (params.has(p)) utm.push(`${p.split('_')[1]}: ${params.get(p)}`);
    });
    return utm.length ? `${ref} [${utm.join(', ')}]` : ref;
}

const STORAGE_PREFIX = 'vt_';

export function storageGet(key, storage = localStorage) {
    try {
        return storage.getItem(STORAGE_PREFIX + key);
    } catch { return null; }
}

export function storageSet(key, value, storage = localStorage) {
    try {
        storage.setItem(STORAGE_PREFIX + key, value);
    } catch { /* quota exceeded */ }
}

export function storageRemove(key, storage = localStorage) {
    try {
        storage.removeItem(STORAGE_PREFIX + key);
    } catch { /* noop */ }
}

export async function fetchWithRetry(url, options = {}, maxRetries = 3, retryDelay = 1000) {
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const res = await fetch(url, options);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res;
        } catch (e) {
            lastError = e;
            if (attempt < maxRetries) {
                await new Promise(r => setTimeout(r, retryDelay * Math.pow(2, attempt)));
            }
        }
    }
    throw lastError;
}
