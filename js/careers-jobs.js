/**
 * Careers Page - Dynamic Job Listings from Supabase
 * Fetches open positions and renders them as styled cards
 */
(function() {
    const CONFIG = {
        url: 'https://nwtrcdehilebjafrdyay.supabase.co',
        key: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53dHJjZGVoaWxlYmphZnJkeWF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5NjU0MzMsImV4cCI6MjEwMDU0MTQzM30.vGXBpayxlG8_Smsdg8XVS06e1QoJoX2yNT5bSl7eiLQ'
    };

    let client = null;

    function init() {
        if (typeof window.supabase === 'undefined') {
            console.warn('[CareersJobs] Supabase not loaded');
            return;
        }
        client = window.supabase.createClient(CONFIG.url, CONFIG.key);
        loadJobs();
        subscribeToChanges();
    }

    async function loadJobs() {
        try {
            const { data: positions, error } = await client
                .from('positions')
                .select('*')
                .eq('is_open', true)
                .order('display_order', { ascending: true });

            if (error) throw error;

            const container = document.getElementById('job-listings-container');
            if (!container) return;

            if (!positions || positions.length === 0) {
                container.innerHTML = `
                    <div style="text-align:center; padding:60px 20px;">
                        <div style="font-size:48px; margin-bottom:16px; opacity:0.3;">&#128269;</div>
                        <h3 style="font-family:'DDT',sans-serif; font-size:1.5rem; text-transform:uppercase; letter-spacing:3px; color:#154359; margin-bottom:12px;">No Open Positions</h3>
                        <p style="color:#666; max-width:500px; margin:0 auto; line-height:1.7;">We don't have any open positions at the moment. Check back later or send your resume to <a href="mailto:hr@fixare.studio" style="color:#0b6376;">hr@fixare.studio</a></p>
                    </div>
                `;
                return;
            }

            container.innerHTML = positions.map((pos, idx) => `
                <div class="nomination-item w-inline-block job-card" style="animation-delay: ${idx * 0.1}s" onclick="window.open('${escapeAttr(pos.apply_url || 'mailto:hr@fixare.studio?subject=Application for ' + encodeURIComponent(pos.title))}', '_blank')">
                    <div class="nomination big">${escapeHtml(pos.title)}</div>
                    <div style="display:flex; gap:6px; margin-top:6px; flex-wrap:wrap; justify-content:center;">
                        <span style="font-size:10px; padding:2px 8px; background:rgba(11,99,118,0.1); color:#0b6376; border-radius:12px; text-transform:uppercase; letter-spacing:1px;">${escapeHtml(pos.type)}</span>
                        <span style="font-size:10px; padding:2px 8px; background:rgba(21,67,89,0.1); color:#154359; border-radius:12px; text-transform:uppercase; letter-spacing:1px;">${escapeHtml(pos.location || 'Remote')}</span>
                        ${pos.department ? `<span style="font-size:10px; padding:2px 8px; background:rgba(0,210,255,0.1); color:#0b6376; border-radius:12px; text-transform:uppercase; letter-spacing:1px;">${escapeHtml(pos.department)}</span>` : ''}
                    </div>
                </div>
            `).join('');
        } catch (e) {
            console.error('[CareersJobs] Error loading jobs:', e);
        }
    }

    function subscribeToChanges() {
        if (!client) return;
        client.channel('positions-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'positions' }, () => {
                loadJobs();
            })
            .subscribe();
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function escapeAttr(str) {
        if (!str) return '';
        return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
