/**
 * Careers Page - Dynamic Position Loading from Supabase
 * Fetches open positions and renders them on the careers page
 */

(function() {
    const CAREERS_CONFIG = {
        supabaseUrl: 'https://nwtrcdehilebjafrdyay.supabase.co',
        supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im53dHJjZGVoaWxlYmphZnJkeWF5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5NjU0MzMsImV4cCI6MjEwMDU0MTQzM30.vGXBpayxlG8_Smsdg8XVS06e1QoJoX2yNT5bSl7eiLQ'
    };

    let client = null;

    async function init() {
        if (typeof window.supabase === 'undefined') return;
        client = window.supabase.createClient(CAREERS_CONFIG.supabaseUrl, CAREERS_CONFIG.supabaseKey);
        await loadPositions();
        subscribeToChanges();
    }

    async function loadPositions() {
        try {
            const { data: positions, error } = await client
                .from('positions')
                .select('*')
                .eq('is_open', true)
                .order('display_order', { ascending: true });

            if (error) throw error;

            const container = document.getElementById('positions-container');
            if (!container) return;

            if (!positions || positions.length === 0) {
                container.innerHTML = `
                    <div class="positions-empty">
                        <div class="positions-empty-icon">&#128269;</div>
                        <h3>No Open Positions</h3>
                        <p>We don't have any open positions at the moment. Check back later or send your resume to hr@fixare.studio</p>
                    </div>
                `;
                return;
            }

            container.innerHTML = positions.map((pos, idx) => `
                <div class="position-card ${idx % 2 === 0 ? 'left' : 'right'}" style="animation-delay: ${idx * 0.1}s">
                    <div class="position-header">
                        <h3 class="position-title">${escapeHtml(pos.title)}</h3>
                        <div class="position-badges">
                            <span class="position-badge type">${escapeHtml(pos.type)}</span>
                            <span class="position-badge location">${escapeHtml(pos.location || 'Remote')}</span>
                            ${pos.department ? `<span class="position-badge dept">${escapeHtml(pos.department)}</span>` : ''}
                        </div>
                    </div>
                    ${pos.description ? `<p class="position-desc">${escapeHtml(pos.description)}</p>` : ''}
                    ${pos.requirements ? `<div class="position-reqs"><strong>Requirements:</strong> ${escapeHtml(pos.requirements)}</div>` : ''}
                    <div class="position-footer">
                        ${pos.apply_url ? `<a href="${escapeHtml(pos.apply_url)}" target="_blank" class="position-apply-btn">Apply Now</a>` : `<a href="mailto:hr@fixare.studio?subject=Application for ${encodeURIComponent(pos.title)}" class="position-apply-btn">Apply Now</a>`}
                    </div>
                </div>
            `).join('');
        } catch (e) {
            console.error('Error loading positions:', e);
        }
    }

    function subscribeToChanges() {
        if (!client) return;
        client.channel('positions-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'positions' }, () => {
                loadPositions();
            })
            .subscribe();
    }

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
