/**
 * Default configuration and validation
 */

export const DEFAULT_CONFIG = {
    supabaseUrl: '',
    supabaseKey: '',
    trackPageViews: true,
    socialProof: true,
    siteName: 'VisitorTracker',
    geolocationProvider: 'ipapi',
    enableSocialProof: true,
    enableChat: true,
    enableNotifications: true,
    uiTheme: 'dark',
    position: 'bottom-right',
    maxRetries: 3,
    retryDelay: 1000,
    hooks: {
        onVisitorArrival: null,
        onChatMessage: null,
        onOverlay: null,
        onError: null,
    }
};

export function mergeConfig(defaults, overrides) {
    const merged = { ...defaults, ...overrides };
    merged.hooks = { ...defaults.hooks, ...(overrides.hooks || {}) };
    return merged;
}
