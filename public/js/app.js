/**
 * Notion MCP Chatbot — Frontend Application
 * Supports structured data rendering via Components.js
 */
(function () {
  const messagesEl = document.getElementById('messages');
  const welcomeEl = document.getElementById('welcome');
  const inputEl = document.getElementById('message-input');
  const sendBtn = document.getElementById('send-btn');
  const newChatBtn = document.getElementById('new-chat-btn');
  const botNameEl = document.getElementById('bot-name');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const logoIcon = document.getElementById('logo-icon');
  const welcomeIcon = document.getElementById('welcome-icon');

  let sessionId = sessionStorage.getItem('chatSessionId') || null;
  let isLoading = false;
  let botDisplayName = 'Notion Assistant';

  // --- Init ---
  async function init() {
    try {
      const res = await fetch('/api/config');
      const config = await res.json();
      if (config.botName) {
        botDisplayName = config.botName;
        botNameEl.textContent = config.botName;
        document.title = config.botName;
        const initial = config.botName.charAt(0).toUpperCase();
        logoIcon.textContent = initial;
        welcomeIcon.textContent = initial;
      }
    } catch {}

    try {
      const res = await fetch('/api/health');
      const health = await res.json();
      if (health.status === 'ok') {
        statusDot.classList.remove('offline');
        statusText.textContent = 'Connected';
      } else {
        statusDot.classList.add('offline');
        statusText.textContent = 'Degraded';
      }
    } catch {
      statusDot.classList.add('offline');
      statusText.textContent = 'Offline';
    }

    // Load dashboard on welcome screen
    try {
      const res = await fetch('/api/dashboard');
      const dashData = await res.json();
      renderDashboard(dashData);
    } catch {}
  }

  function renderDashboard(data) {
    const container = document.getElementById('welcome-databases');
    if (!container) return;
    if (typeof Components !== 'undefined') {
      container.innerHTML = Components.dashboard(data);
    }
  }

  init();

  // --- Send ---
  async function sendMessage(text) {
    if (!text.trim() || isLoading) return;

    if (welcomeEl) welcomeEl.style.display = 'none';

    appendMessage('user', text);
    inputEl.value = '';
    inputEl.style.height = 'auto';
    updateSendButton();

    const typingEl = appendTyping();
    isLoading = true;
    updateSendButton();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, sessionId }),
      });
      const data = await res.json();
      typingEl.remove();

      if (res.ok) {
        sessionId = data.sessionId;
        sessionStorage.setItem('chatSessionId', sessionId);
        appendMessage('assistant', data.response, data.structured, data.suggestions);
      } else {
        appendMessage('error', data.error || 'Something went wrong. Please try again.');
      }
    } catch {
      typingEl.remove();
      appendMessage('error', 'Network error. Make sure the server is running.');
    }

    isLoading = false;
    updateSendButton();
    inputEl.focus();
  }

  // Make sendMessage available globally for Components.js onclick handlers
  window.sendAction = function(action) {
    inputEl.value = action;
    sendMessage(action);
  };

  // --- DOM ---
  function appendMessage(role, content, structured, suggestions) {
    const msg = document.createElement('div');
    msg.className = `message ${role}`;

    const inner = document.createElement('div');
    inner.className = 'message-inner';

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    if (role === 'user') {
      avatar.textContent = 'Y';
    } else if (role === 'error') {
      avatar.textContent = '!';
    } else {
      avatar.textContent = botDisplayName.charAt(0).toUpperCase();
    }

    const body = document.createElement('div');
    body.className = 'message-body';

    const sender = document.createElement('div');
    sender.className = 'message-sender';
    sender.textContent = role === 'user' ? 'You' : role === 'error' ? 'Error' : botDisplayName;

    const contentEl = document.createElement('div');
    contentEl.className = 'message-content';

    if (role === 'user') {
      contentEl.textContent = content;
    } else {
      // Render markdown text
      contentEl.innerHTML = window.renderMarkdown(content);

      // Render rich components if structured data exists
      if (structured && typeof Components !== 'undefined') {
        const richHtml = Components.render(structured, suggestions);
        if (richHtml) {
          const richEl = document.createElement('div');
          richEl.className = 'rich-content';
          richEl.innerHTML = richHtml;
          contentEl.appendChild(richEl);
        }
      } else if (suggestions && suggestions.length > 0 && typeof Components !== 'undefined') {
        // Just render suggestion chips
        const chipsHtml = Components.suggestionChips(suggestions);
        if (chipsHtml) {
          const chipsEl = document.createElement('div');
          chipsEl.className = 'rich-content';
          chipsEl.innerHTML = chipsHtml;
          contentEl.appendChild(chipsEl);
        }
      }
    }

    body.appendChild(sender);
    body.appendChild(contentEl);
    inner.appendChild(avatar);
    inner.appendChild(body);
    msg.appendChild(inner);
    messagesEl.appendChild(msg);
    scrollToBottom();
    return msg;
  }

  function appendTyping() {
    const msg = document.createElement('div');
    msg.className = 'message assistant';

    const inner = document.createElement('div');
    inner.className = 'message-inner';

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.textContent = botDisplayName.charAt(0).toUpperCase();

    const body = document.createElement('div');
    body.className = 'message-body';

    const sender = document.createElement('div');
    sender.className = 'message-sender';
    sender.textContent = botDisplayName;

    const dots = document.createElement('div');
    dots.className = 'message-content';
    dots.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';

    body.appendChild(sender);
    body.appendChild(dots);
    inner.appendChild(avatar);
    inner.appendChild(body);
    msg.appendChild(inner);
    messagesEl.appendChild(msg);
    scrollToBottom();
    return msg;
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    });
  }

  function updateSendButton() {
    sendBtn.disabled = isLoading || !inputEl.value.trim();
  }

  function escHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // --- New chat ---
  function resetChat() {
    if (sessionId) {
      fetch(`/api/chat/${sessionId}`, { method: 'DELETE' }).catch(() => {});
    }
    sessionId = null;
    sessionStorage.removeItem('chatSessionId');
    messagesEl.querySelectorAll('.message').forEach(m => m.remove());
    if (welcomeEl) welcomeEl.style.display = '';
    inputEl.value = '';
    updateSendButton();
    inputEl.focus();
  }

  // --- Events ---
  sendBtn.addEventListener('click', () => sendMessage(inputEl.value));

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputEl.value);
    }
  });

  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 140) + 'px';
    updateSendButton();
  });

  newChatBtn.addEventListener('click', resetChat);

  document.querySelectorAll('.suggestion').forEach(btn => {
    btn.addEventListener('click', () => sendMessage(btn.dataset.msg));
  });
})();
