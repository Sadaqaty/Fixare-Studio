/**
 * Fixare Chat Widget - Reusable standalone chat component
 * Drop into any site to add real-time chat via Supabase.
 *
 * Usage:
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 *   <script src="chat-widget.js"></script>
 *   <script>
 *     FixareChat.init({
 *       supabaseUrl: 'YOUR_URL',
 *       supabaseKey: 'YOUR_KEY',
 *       position: 'bottom-right',
 *       theme: 'dark',
 *       primaryColor: '#00d2ff',
 *       greeting: 'Hi! How can we help you?'
 *     });
 *   </script>
 */
const FixareChat = {
  _config: {
    supabaseUrl: '',
    supabaseKey: '',
    position: 'bottom-right',
    theme: 'dark',
    primaryColor: '#00d2ff',
    greeting: 'Hi! How can we help you?',
    visitorName: null
  },
  _supabase: null,
  _visitorId: null,
  _isOpen: false,
  _channel: null,
  _stylesInjected: false,

  init(options = {}) {
    this._config = { ...this._config, ...options };
    if (!this._config.supabaseUrl || !this._config.supabaseKey) {
      console.error('[FixareChat] supabaseUrl and supabaseKey are required');
      return;
    }

    this._supabase = window.supabase.createClient(this._config.supabaseUrl, this._config.supabaseKey);
    this._visitorId = this._getVisitorId();
    this._config.visitorName = localStorage.getItem('fixare_chat_name') || null;

    this._injectStyles();
    this._renderWidget();
    this._subscribeToMessages();

    // Track page view
    this._trackEvent('page_view', window.location.pathname);
  },

  _getVisitorId() {
    let id = localStorage.getItem('fixare_chat_visitor_id');
    if (!id) {
      // Generate a proper UUID v4
      id = crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
      localStorage.setItem('fixare_chat_visitor_id', id);
    }
    return id;
  },

  _injectStyles() {
    if (this._stylesInjected) return;
    const style = document.createElement('style');
    style.textContent = `
      .fc-bubble { position: fixed; ${this._config.position === 'bottom-left' ? 'left: 20px' : 'right: 20px'}; bottom: 20px; width: 60px; height: 60px; border-radius: 50%; background: linear-gradient(135deg, ${this._config.primaryColor}, #3a7bd5); display: flex; align-items: center; justify-content: center; color: white; font-size: 24px; cursor: pointer; z-index: 2147483646; box-shadow: 0 5px 20px rgba(0,0,0,0.3); transition: transform 0.3s; }
      .fc-bubble:hover { transform: scale(1.1); }
      .fc-panel { position: fixed; ${this._config.position === 'bottom-left' ? 'left: 20px' : 'right: 20px'}; bottom: 90px; width: 360px; height: 500px; background: rgba(10, 10, 20, 0.95); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.1); border-radius: 16px; display: none; flex-direction: column; z-index: 2147483646; box-shadow: 0 10px 40px rgba(0,0,0,0.5); overflow: hidden; font-family: 'Inter Tight', sans-serif; }
      .fc-header { padding: 16px; background: rgba(255,255,255,0.05); border-bottom: 1px solid rgba(255,255,255,0.1); display: flex; justify-content: space-between; align-items: center; }
      .fc-header-left { display: flex; align-items: center; gap: 10px; }
      .fc-status-dot { width: 8px; height: 8px; border-radius: 50%; background: #00ff88; }
      .fc-header-title { font-weight: bold; color: white; font-size: 14px; }
      .fc-close { cursor: pointer; opacity: 0.6; font-size: 20px; color: white; }
      .fc-close:hover { opacity: 1; }
      .fc-messages { flex: 1; padding: 16px; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
      .fc-msg { max-width: 80%; padding: 10px 14px; border-radius: 12px; font-size: 13px; line-height: 1.4; color: white; word-wrap: break-word; }
      .fc-msg.visitor { align-self: flex-end; background: ${this._config.primaryColor}; border-radius: 12px 12px 0 12px; }
      .fc-msg.support { align-self: flex-start; background: rgba(255,255,255,0.1); border-radius: 12px 12px 12px 0; border-left: 2px solid ${this._config.primaryColor}; }
      .fc-typing { padding: 0 16px 4px; font-size: 11px; color: ${this._config.primaryColor}; display: none; }
      .fc-input-area { padding: 12px 16px; display: flex; gap: 8px; background: rgba(0,0,0,0.2); }
      .fc-input { flex: 1; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.1); border-radius: 20px; padding: 10px 16px; color: white; outline: none; font-size: 13px; font-family: inherit; }
      .fc-input::placeholder { color: rgba(255,255,255,0.4); }
      .fc-send { background: ${this._config.primaryColor}; border: none; border-radius: 50%; width: 36px; height: 36px; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 16px; }
      .fc-send:hover { filter: brightness(1.2); }
      .fc-badge { position: absolute; top: -5px; right: -5px; background: #ff4444; color: white; border-radius: 10px; padding: 2px 6px; font-size: 10px; font-weight: bold; border: 2px solid white; display: none; }
      .fc-name-prompt { padding: 20px; display: flex; flex-direction: column; gap: 12px; align-items: center; justify-content: center; flex: 1; }
      .fc-name-prompt input { width: 100%; background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; padding: 12px; color: white; text-align: center; font-size: 14px; outline: none; }
      .fc-name-prompt button { background: ${this._config.primaryColor}; color: #020c1b; border: none; border-radius: 8px; padding: 12px 24px; font-weight: 700; cursor: pointer; width: 100%; }
      @keyframes fc-fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    `;
    document.head.appendChild(style);
    this._stylesInjected = true;
  },

  _renderWidget() {
    const bubble = document.createElement('div');
    bubble.className = 'fc-bubble';
    bubble.innerHTML = '&#128172;';
    bubble.onclick = () => this.toggle();
    document.body.appendChild(bubble);

    const panel = document.createElement('div');
    panel.className = 'fc-panel';
    panel.id = 'fc-panel';
    panel.innerHTML = `
      <div class="fc-header">
        <div class="fc-header-left">
          <div class="fc-status-dot"></div>
          <span class="fc-header-title">Support${this._config.visitorName ? ' (' + this._config.visitorName + ')' : ''}</span>
        </div>
        <span class="fc-close" id="fc-close">&times;</span>
      </div>
      <div class="fc-messages" id="fc-messages"></div>
      <div class="fc-typing" id="fc-typing">Support is typing...</div>
      <div class="fc-input-area" id="fc-input-area" style="display:none;">
        <input class="fc-input" id="fc-input" type="text" placeholder="Type a message...">
        <button class="fc-send" id="fc-send">&gt;</button>
      </div>
      <div class="fc-name-prompt" id="fc-name-prompt">
        <div style="color:${this._config.primaryColor}; font-size:12px; letter-spacing:2px; text-transform:uppercase;">Enter your details to start chatting</div>
        <input type="text" id="fc-name-input" placeholder="Your name" required>
        <input type="email" id="fc-email-input" placeholder="Your email (optional)">
        <button id="fc-name-submit">Continue</button>
      </div>
    `;
    document.body.appendChild(panel);

    document.getElementById('fc-close').onclick = () => this.toggle();
    document.getElementById('fc-send').onclick = () => this._sendMessage();
    document.getElementById('fc-input').onkeypress = (e) => { if (e.key === 'Enter') this._sendMessage(); };
    document.getElementById('fc-name-submit').onclick = () => this._submitName();
    document.getElementById('fc-name-input').onkeypress = (e) => { if (e.key === 'Enter') this._submitName(); };

    this._loadHistory();
  },

  _submitName() {
    const name = document.getElementById('fc-name-input').value.trim();
    if (!name) return;
    this._config.visitorName = name;
    localStorage.setItem('fixare_chat_name', name);

    // Save email if provided
    const emailInput = document.getElementById('fc-email-input');
    const email = emailInput ? emailInput.value.trim() : '';
    if (email) {
      localStorage.setItem('fixare_chat_email', email);
    }

    document.getElementById('fc-name-prompt').style.display = 'none';
    document.getElementById('fc-input-area').style.display = 'flex';
    document.querySelector('.fc-header-title').textContent = `Support (${name})`;

    this._trackEvent('identity', name);
  },

  toggle() {
    this._isOpen = !this._isOpen;
    const panel = document.getElementById('fc-panel');
    panel.style.display = this._isOpen ? 'flex' : 'none';

    if (this._isOpen) {
      if (!this._config.visitorName) {
        document.getElementById('fc-name-prompt').style.display = 'flex';
        document.getElementById('fc-input-area').style.display = 'none';
      } else {
        document.getElementById('fc-input-area').style.display = 'flex';
      }
      // Mark messages as read
      this._markAsRead();
    }
  },

  async _loadHistory() {
    try {
      const { data } = await this._supabase
        .from('chat_messages')
        .select('*')
        .eq('visitor_id', this._visitorId)
        .order('created_at', { ascending: true })
        .limit(50);

      const container = document.getElementById('fc-messages');
      if (data && data.length > 0) {
        data.forEach(m => this._addMessageToUI(m.message, m.sender, false));
      } else {
        this._addMessageToUI(this._config.greeting, 'support', false);
      }
      container.scrollTop = container.scrollHeight;
    } catch (e) {
      console.error('[FixareChat] Load history error:', e);
    }
  },

  _addMessageToUI(text, sender, save = true) {
    const container = document.getElementById('fc-messages');
    const div = document.createElement('div');
    div.className = `fc-msg ${sender}`;
    div.textContent = text;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  },

  async _sendMessage() {
    const input = document.getElementById('fc-input');
    const text = input.value.trim();
    if (!text) return;

    input.value = '';
    this._addMessageToUI(text, 'visitor');

    // Upsert visitor record
    try {
      await this._supabase.from('visitors').upsert({
        id: this._visitorId,
        name: this._config.visitorName || 'Anonymous',
        last_page: window.location.pathname
      }, { onConflict: 'id' });
    } catch (e) { /* ignore */ }

    // Insert chat message (handle foreign key gracefully)
    const chatData = {
      visitor_id: this._visitorId,
      sender: 'visitor',
      message: text
    };
    try {
      const { error } = await this._supabase.from('chat_messages').insert(chatData);
      if (error && error.code === '23503') {
        // Foreign key error - insert without visitor_id
        delete chatData.visitor_id;
        await this._supabase.from('chat_messages').insert(chatData);
      }
    } catch (e) {
      console.error('[FixareChat] Send error:', e);
    }
  },

  _subscribeToMessages() {
    this._channel = this._supabase
      .channel('fc-chat-' + this._visitorId)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `visitor_id=eq.${this._visitorId}`
      }, (payload) => {
        const msg = payload.new;
        if (msg.sender === 'support' || msg.sender === 'admin') {
          // Show typing indicator briefly
          const typing = document.getElementById('fc-typing');
          typing.style.display = 'block';
          setTimeout(() => {
            typing.style.display = 'none';
            this._addMessageToUI(msg.message, 'support');
            if (!this._isOpen) {
              // Show unread badge
              const badge = document.querySelector('.fc-badge');
              if (badge) {
                let count = parseInt(badge.textContent || '0') + 1;
                badge.textContent = count;
                badge.style.display = 'block';
              }
            }
          }, 800);
        }
      })
      .subscribe();
  },

  async _markAsRead() {
    try {
      await this._supabase
        .from('chat_messages')
        .update({ read: true })
        .eq('visitor_id', this._visitorId)
        .eq('sender', 'visitor')
        .eq('read', false);

      const badge = document.querySelector('.fc-badge');
      if (badge) badge.style.display = 'none';
    } catch (e) { /* ignore */ }
  },

  async _trackEvent(type, page) {
    try {
      await this._supabase.from('events').insert({
        visitor_id: this._visitorId,
        event_type: type,
        page: page || window.location.pathname,
        url: window.location.href,
        referrer: document.referrer || null
      });
    } catch (e) { /* ignore */ }
  }
};

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FixareChat;
}
