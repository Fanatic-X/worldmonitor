import { t } from '@/services/i18n';
import { escapeHtml, unsafeRawHtml } from '@/utils/sanitize';
import { setTrustedHtml } from '@/utils/dom-utils';
import { OllamaClient, type OllamaMessage } from '@/services/ollama-client';
import { marked } from 'marked';

let _activeModalOverlay: HTMLElement | null = null;
let _ollamaClient: OllamaClient | null = null;
let _chatHistory: OllamaMessage[] = [];

// Inject global styles for the modal if not present
function injectModalStyles() {
  if (document.getElementById('awm-styles')) return;
  const style = document.createElement('style');
  style.id = 'awm-styles';
  style.textContent = `
    @keyframes awm-fade-in {
      from { opacity: 0; transform: scale(0.95) translateY(10px); }
      to { opacity: 1; transform: scale(1) translateY(0); }
    }
    @keyframes awm-pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .awm-overlay {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.6);
      backdrop-filter: blur(4px);
      z-index: 999999;
      display: flex; align-items: center; justify-content: center;
      padding: 20px;
    }
    .awm-modal {
      width: 100%; max-width: 700px; height: 85vh;
      background: rgba(17, 24, 39, 0.85);
      backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.05) inset;
      border-radius: 16px;
      display: flex; flex-direction: column;
      animation: awm-fade-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      overflow: hidden;
      color: #f3f4f6;
      font-family: var(--font-sans, system-ui, sans-serif);
    }
    .awm-header {
      padding: 16px 20px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      display: flex; justify-content: space-between; align-items: center;
      background: rgba(255, 255, 255, 0.02);
    }
    .awm-title {
      font-weight: 600; font-size: 1.1rem;
      display: flex; align-items: center; gap: 8px;
    }
    .awm-close {
      background: transparent; border: none; color: #9ca3af;
      font-size: 1.2rem; cursor: pointer; padding: 4px; border-radius: 6px;
      transition: background 0.2s, color 0.2s;
    }
    .awm-close:hover { background: rgba(255,255,255,0.1); color: #fff; }
    
    .awm-messages {
      flex: 1; overflow-y: auto; padding: 20px;
      display: flex; flex-direction: column; gap: 16px;
      scroll-behavior: smooth;
    }
    
    .awm-bubble {
      max-width: 85%; padding: 12px 16px; border-radius: 12px;
      font-size: 0.95rem; line-height: 1.5;
      word-wrap: break-word;
    }
    .awm-bubble-user {
      align-self: flex-end;
      background: var(--accent-color, #3b82f6);
      color: #ffffff;
      border-bottom-right-radius: 4px;
      box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
    }
    .awm-bubble-ai {
      align-self: flex-start;
      background: rgba(255, 255, 255, 0.06);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-bottom-left-radius: 4px;
      color: #e5e7eb;
    }
    
    .awm-bubble-ai p { margin: 0 0 10px 0; }
    .awm-bubble-ai p:last-child { margin-bottom: 0; }
    .awm-bubble-ai a { color: #60a5fa; text-decoration: none; }
    .awm-bubble-ai a:hover { text-decoration: underline; }
    .awm-bubble-ai code { background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 0.9em; }
    .awm-bubble-ai pre { background: rgba(0,0,0,0.4); padding: 12px; border-radius: 8px; overflow-x: auto; border: 1px solid rgba(255,255,255,0.05); }
    .awm-bubble-ai pre code { background: transparent; padding: 0; }
    .awm-bubble-ai table { border-collapse: collapse; width: 100%; margin-bottom: 10px; }
    .awm-bubble-ai th, .awm-bubble-ai td { border: 1px solid rgba(255,255,255,0.1); padding: 6px 10px; }
    .awm-bubble-ai th { background: rgba(255,255,255,0.05); }
    
    .awm-tool-badge {
      align-self: center;
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.2);
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.8rem;
      font-family: monospace;
      display: flex; align-items: center; gap: 6px;
      margin: 8px 0;
    }
    .awm-tool-badge.thinking {
      color: #94a3b8; background: rgba(148, 163, 184, 0.1); border-color: rgba(148, 163, 184, 0.2);
      animation: awm-pulse 1.5s infinite;
    }
    
    .awm-input-area {
      padding: 16px 20px;
      background: rgba(0, 0, 0, 0.2);
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      display: flex; gap: 12px; align-items: flex-end;
    }
    .awm-textarea {
      flex: 1; resize: none; border-radius: 12px; padding: 12px 14px;
      background: rgba(255, 255, 255, 0.05);
      color: #fff;
      border: 1px solid rgba(255, 255, 255, 0.1);
      font-family: inherit; font-size: 0.95rem; line-height: 1.4;
      transition: border-color 0.2s, background 0.2s;
      max-height: 120px;
    }
    .awm-textarea:focus {
      outline: none; border-color: var(--accent-color, #3b82f6);
      background: rgba(255, 255, 255, 0.08);
    }
    .awm-send-btn {
      background: var(--accent-color, #3b82f6);
      color: #fff; border: none; border-radius: 12px;
      padding: 12px 20px; font-weight: 600; cursor: pointer;
      transition: opacity 0.2s, transform 0.1s;
      height: 45px; display: flex; align-items: center; justify-content: center;
    }
    .awm-send-btn:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
    .awm-send-btn:disabled { opacity: 0.5; cursor: not-allowed; filter: grayscale(1); }
  `;
  document.head.appendChild(style);
}

export function openAskWorldMonitorModal(): void {
  closeAskWorldMonitorModal();
  injectModalStyles();

  _ollamaClient = new OllamaClient();

  if (_chatHistory.length === 0) {
    _chatHistory = [
      {
        role: 'system',
        content: "Du bist der WorldMonitor AI Analyst. Du hast Zugriff auf verschiedene Daten-Tools. Nutze diese, um Fragen zu globalen Ereignissen, Finanzen, Konflikten und Naturkatastrophen zu beantworten. Halte deine Antworten präzise, faktenbasiert und stütze dich auf die Tool-Ergebnisse. WICHTIG: Antworte IMMER und AUSSCHLIESSLICH auf Deutsch! Gib sauberes Markdown aus."
      }
    ];
  }

  const overlay = document.createElement('div');
  overlay.className = 'awm-overlay';
  overlay.id = 'askWorldMonitorOverlay';

  const modal = document.createElement('div');
  modal.className = 'awm-modal';

  setTrustedHtml(modal, unsafeRawHtml(`
    <div class="awm-header">
      <div class="awm-title">
        <span style="font-size:1.3rem">🤖</span> WorldMonitor AI Analyst
      </div>
      <button class="awm-close" aria-label="${escapeHtml(t('common.close'))}">✕</button>
    </div>
    <div id="awm-messages" class="awm-messages"></div>
    <div class="awm-input-area">
      <textarea id="awm-input" class="awm-textarea" placeholder="Frage nach geopolitischen Ereignissen, Flügen, News..." rows="1"></textarea>
      <button id="awm-send" class="awm-send-btn">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
      </button>
    </div>
  `, 'Modal structure'));

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  _activeModalOverlay = overlay;

  const closeBtn = modal.querySelector('.awm-close');
  closeBtn?.addEventListener('click', closeAskWorldMonitorModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeAskWorldMonitorModal(); });

  const inputEl = modal.querySelector<HTMLTextAreaElement>('#awm-input')!;
  const sendBtn = modal.querySelector<HTMLButtonElement>('#awm-send')!;
  const messagesEl = modal.querySelector<HTMLDivElement>('#awm-messages')!;

  // Auto-resize textarea
  inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
  });

  const renderMessages = (statusMsg?: string) => {
    messagesEl.innerHTML = '';
    
    // Render History
    for (let i = 0; i < _chatHistory.length; i++) {
      const msg = _chatHistory[i];
      if (msg.role === 'system') continue;
      
      // If it's a tool call response from history, we can show a badge if the preceding message was a tool call
      if (msg.role === 'tool') continue; // Hide raw tool outputs
      
      // If assistant message HAS tool_calls (this requires updating OllamaClient to store tool_calls in history, but for now we just skip)
      if (msg.role === 'assistant' && !msg.content) continue; // Skip empty tool-calling assistant messages

      const wrapper = document.createElement('div');
      wrapper.className = `awm-bubble ${msg.role === 'user' ? 'awm-bubble-user' : 'awm-bubble-ai'}`;
      
      if (msg.role === 'user') {
        wrapper.textContent = msg.content;
      } else {
        setTrustedHtml(wrapper, unsafeRawHtml(marked.parse(msg.content) as string, 'Markdown response'));
      }
      messagesEl.appendChild(wrapper);
    }
    
    // Render current status (Thinking / Tool usage)
    if (statusMsg) {
      const statusBadge = document.createElement('div');
      statusBadge.className = 'awm-tool-badge ' + (statusMsg.includes('Tool') ? '' : 'thinking');
      
      const icon = statusMsg.includes('Tool') ? '🔧' : '⏳';
      statusBadge.textContent = `${icon} ${statusMsg}`;
      messagesEl.appendChild(statusBadge);
    }
    
    // Smooth scroll to bottom
    requestAnimationFrame(() => {
      messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });
    });
  };

  renderMessages();

  const handleSend = async () => {
    const text = inputEl.value.trim();
    if (!text) return;
    
    inputEl.value = '';
    inputEl.style.height = 'auto';
    _chatHistory.push({ role: 'user', content: text });
    renderMessages('LLM überlegt...');
    
    sendBtn.disabled = true;
    inputEl.disabled = true;

    try {
      const generator = _ollamaClient!.chatStream(_chatHistory, (status) => {
        renderMessages(status);
      });

      let finalResponse = '';
      for await (const chunk of generator) {
        finalResponse += chunk;
        // Optional: If we streamed tokens, we could render them live here.
        // Currently chatStream yields the full text at the end.
      }

      _chatHistory.push({ role: 'assistant', content: finalResponse });
    } catch (e) {
      _chatHistory.push({ role: 'assistant', content: `**Error:** ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      sendBtn.disabled = false;
      inputEl.disabled = false;
      inputEl.focus();
      renderMessages(); // Final render without status
    }
  };

  sendBtn.addEventListener('click', handleSend);
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  inputEl.focus();
}

export function closeAskWorldMonitorModal(): void {
  if (_activeModalOverlay) {
    _activeModalOverlay.remove();
    _activeModalOverlay = null;
  }
}

