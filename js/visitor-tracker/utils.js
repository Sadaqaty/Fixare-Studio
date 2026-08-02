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

export async function fetchWithRetry(url, options = {}, maxRetries = 2, retryDelay = 800) {
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

/**
 * Generate a client-side browser fingerprint hash
 */
export function generateFingerprint() {
    try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 200;
        canvas.height = 50;
        if (ctx) {
            ctx.textBaseline = 'top';
            ctx.font = '14px Arial';
            ctx.fillStyle = '#f60';
            ctx.fillRect(125, 1, 62, 20);
            ctx.fillStyle = '#069';
            ctx.fillText('FixareStudio,v1!', 2, 15);
            ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
            ctx.fillText('FixareStudio,v1!', 4, 17);
        }

        const dataUrl = canvas.toDataURL();
        let hash = 0;
        for (let i = 0; i < dataUrl.length; i++) {
            const char = dataUrl.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0;
        }
        const str = [
            hash,
            navigator.userAgent,
            navigator.language,
            screen.width + 'x' + screen.height + 'x' + screen.colorDepth,
            new Date().getTimezoneOffset(),
            navigator.hardwareConcurrency || 'unk',
            navigator.deviceMemory || 'unk'
        ].join('||');

        let hash2 = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash2 = ((hash2 << 5) - hash2) + char;
            hash2 |= 0;
        }
        return 'fp_' + Math.abs(hash2).toString(36);
    } catch {
        return 'fp_fallback_' + Math.random().toString(36).substring(2, 10);
    }
}

/**
 * Capture detailed device and client capabilities
 */
export function getDeviceCapabilities() {
    let webglVendor = 'Unknown';
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (gl) {
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            if (debugInfo) {
                webglVendor = gl.getParameter(debugInfo.UNMASKED_RENDERER_STRING) || 'Unknown';
            }
        }
    } catch {}

    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

    return {
        touch_support: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
        hardware_concurrency: navigator.hardwareConcurrency || null,
        device_memory_gb: navigator.deviceMemory || null,
        webgl_gpu: webglVendor,
        color_scheme: window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
        connection_type: conn ? (conn.effectiveType || conn.type || 'unknown') : 'unknown',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown',
        pixel_ratio: window.devicePixelRatio || 1
    };
}

/**
 * Capture page performance timing metrics
 */
export function getPerformanceMetrics() {
    try {
        const perf = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
        if (perf) {
            return {
                page_load_ms: Math.round(perf.duration),
                ttfb_ms: Math.round(perf.responseStart - perf.requestStart),
                dom_interactive_ms: Math.round(perf.domInteractive - perf.startTime)
            };
        } else if (performance.timing) {
            const t = performance.timing;
            return {
                page_load_ms: t.loadEventEnd > 0 ? t.loadEventEnd - t.navigationStart : null,
                ttfb_ms: t.responseStart - t.requestStart,
                dom_interactive_ms: t.domInteractive - t.navigationStart
            };
        }
    } catch {}
    return { page_load_ms: null, ttfb_ms: null, dom_interactive_ms: null };
}

/**
 * Multi-provider geolocation resolution cascade
 */
export async function fetchGeolocationCascade() {
    const providers = [
        async () => {
            const res = await fetchWithRetry('https://ipapi.co/json/', {}, 1, 500);
            const data = await res.json();
            if (!data.ip) throw new Error('Invalid ipapi response');
            return {
                ip: data.ip,
                country: data.country_name || data.country || 'Unknown',
                city: data.city || 'Unknown',
                region: data.region || 'Unknown',
                latitude: data.latitude || null,
                longitude: data.longitude || null,
                org: data.org || data.asn || 'Unknown'
            };
        },
        async () => {
            const res = await fetchWithRetry('https://api.db-ip.com/v2/free/self', {}, 1, 500);
            const data = await res.json();
            if (!data.ipAddress) throw new Error('Invalid db-ip response');
            return {
                ip: data.ipAddress,
                country: data.countryName || 'Unknown',
                city: data.city || 'Unknown',
                region: data.stateProv || 'Unknown',
                latitude: null,
                longitude: null,
                org: 'Unknown'
            };
        }
    ];

    for (const provider of providers) {
        try {
            const result = await provider();
            if (result && result.ip) return result;
        } catch {}
    }

    return {
        ip: 'Unknown',
        country: 'Unknown',
        city: 'Unknown',
        region: 'Unknown',
        latitude: null,
        longitude: null,
        org: 'Unknown'
    };
}
