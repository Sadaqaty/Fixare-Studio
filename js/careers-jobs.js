/**
 * Careers Page - Dynamic Job Listings from Supabase
 * Fetches open positions and renders them matching the website's nomination-item style
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

    function formatType(type) {
        const types = {
            'full-time': 'Full-Time',
            'part-time': 'Part-Time',
            'contract': 'Contract',
            'internship': 'Internship',
            'freelance': 'Freelance'
        };
        return types[type] || type;
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
                    <div style="text-align:center; padding:80px 20px; max-width:600px; margin:0 auto;">
                        <div style="font-size:64px; margin-bottom:20px; opacity:0.15;">&#128269;</div>
                        <h3 style="font-family:'DDT',sans-serif; font-size:1.4rem; text-transform:uppercase; letter-spacing:4px; color:#154359; margin-bottom:12px;">No Open Positions</h3>
                        <p style="color:#666; max-width:400px; margin:0 auto; line-height:1.8; font-size:15px;">We don't have any open positions at the moment. Check back later or send your resume to <a href="mailto:hr@fixare.studio" style="color:#0b6376; text-decoration:underline;">hr@fixare.studio</a></p>
                    </div>
                `;
                return;
            }

            // Build alternating left/right layout like the projects section
            const leftItems = positions.filter((_, i) => i % 2 === 0);
            const rightItems = positions.filter((_, i) => i % 2 === 1);

            container.innerHTML = `
                <div style="display:flex; justify-content:center; gap:40px; width:100%; max-width:1400px; flex-wrap:wrap;">
                    <div style="display:flex; flex-direction:column; gap:16px; flex:1; min-width:280px; max-width:500px;">
                        ${leftItems.map((pos, idx) => renderJobCard(pos, idx * 2)).join('')}
                    </div>
                    <div style="display:flex; flex-direction:column; gap:16px; flex:1; min-width:280px; max-width:500px; margin-top:80px;">
                        ${rightItems.map((pos, idx) => renderJobCard(pos, idx * 2 + 1)).join('')}
                    </div>
                </div>
            `;
        } catch (e) {
            console.error('[CareersJobs] Error loading jobs:', e);
            const container = document.getElementById('job-listings-container');
            if (container) {
                container.innerHTML = `
                    <div style="text-align:center; padding:40px; color:#999;">
                        Unable to load positions. Please try again later.
                    </div>
                `;
            }
        }
    }

    function renderJobCard(pos, idx) {
        const applyUrl = pos.apply_url || 'mailto:hr@fixare.studio?subject=Application for ' + encodeURIComponent(pos.title);
        const typeLabel = formatType(pos.type);
        const tags = [];
        if (pos.type) tags.push(typeLabel);
        if (pos.location) tags.push(pos.location);
        if (pos.department) tags.push(pos.department);

        return `
            <a href="${escapeAttr(applyUrl)}" target="_blank" class="nomination-item w-inline-block" style="text-decoration:none; animation: fadeInUp 0.5s ease-out ${idx * 0.1}s both; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:80px; padding:20px 16px;">
                <div class="nomination big" style="text-align:center; width:auto; max-width:100%;">${escapeHtml(pos.title)}</div>
                ${tags.length > 0 ? `
                    <div style="display:flex; gap:6px; margin-top:8px; flex-wrap:wrap; justify-content:center;">
                        ${tags.map(tag => `<span style="font-size:10px; padding:3px 10px; background:rgba(11,99,118,0.08); color:#0b6376; border-radius:12px; text-transform:uppercase; letter-spacing:1px; font-family:'Inter Tight',sans-serif; border:1px solid rgba(11,99,118,0.15);">${escapeHtml(tag)}</span>`).join('')}
                    </div>
                ` : ''}
            </a>
        `;
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
