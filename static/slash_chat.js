document.addEventListener('DOMContentLoaded', () => {
  const chapterText = document.querySelector('#chapter-text');
  const chapterTitle = document.querySelector('#chapter-title');
  const chapterPart = document.querySelector('#chapter-part');
  const chapterMeta = document.querySelector('#chapter-meta');
  if (!chapterText) return;

  const CHAT_MODEL = 'deepseek-r1:14b';

  const state = {
    messages: [],
    selectedContext: '',
    busy: false,
  };

  const commandMenu = document.createElement('div');
  commandMenu.className = 'slash-command-menu';
  commandMenu.hidden = true;
  commandMenu.setAttribute('role', 'menu');
  commandMenu.innerHTML = `
    <p class="slash-command-kicker">Commands</p>
    <button class="slash-command-item" type="button" role="menuitem" data-command="ask-deepseek">
      <span class="slash-command-icon">✦</span>
      <span class="slash-command-copy">
        <strong>Ask DeepSeek</strong>
        <span>Chat with DeepSeek R1 14B about this chapter</span>
      </span>
      <span class="slash-command-key">Enter</span>
    </button>
  `;
  document.body.appendChild(commandMenu);

  const chatShell = document.createElement('div');
  chatShell.className = 'llama-chat-shell';
  chatShell.hidden = true;
  chatShell.innerHTML = `
    <section class="llama-chat" role="dialog" aria-modal="true" aria-labelledby="llama-chat-title">
      <header class="llama-chat-header">
        <div class="llama-chat-heading">
          <strong id="llama-chat-title">✦ Ask DeepSeek</strong>
          <span id="llama-chat-subtitle"></span>
        </div>
        <div class="llama-chat-header-actions">
          <button class="llama-chat-reset" type="button">New chat</button>
          <button class="llama-chat-close" type="button" aria-label="Close DeepSeek chat">×</button>
        </div>
      </header>
      <div class="llama-chat-messages" aria-live="polite"></div>
      <form class="llama-chat-composer">
        <p class="llama-chat-context"></p>
        <div class="llama-chat-input-row">
          <textarea class="llama-chat-input" rows="2" placeholder="Ask about this chapter…" aria-label="Message to local DeepSeek model"></textarea>
          <button class="llama-chat-send" type="submit">Ask</button>
        </div>
      </form>
    </section>
  `;
  document.body.appendChild(chatShell);

  const chatMessages = chatShell.querySelector('.llama-chat-messages');
  const chatInput = chatShell.querySelector('.llama-chat-input');
  const chatSend = chatShell.querySelector('.llama-chat-send');
  const chatSubtitle = chatShell.querySelector('#llama-chat-subtitle');
  const chatContext = chatShell.querySelector('.llama-chat-context');
  const closeChat = chatShell.querySelector('.llama-chat-close');
  const resetChat = chatShell.querySelector('.llama-chat-reset');
  const composer = chatShell.querySelector('.llama-chat-composer');
  const askDeepSeekCommand = commandMenu.querySelector('[data-command="ask-deepseek"]');

  function currentSelection() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return '';
    if (!chapterText.contains(selection.anchorNode) || !chapterText.contains(selection.focusNode)) return '';
    return selection.toString().trim();
  }

  function currentChapterText() {
    return [...chapterText.querySelectorAll(':scope > p')]
      .map(paragraph => paragraph.textContent || '')
      .join('\n\n')
      .trim();
  }

  function chapterDescriptor() {
    return [
      chapterTitle?.textContent?.trim(),
      chapterMeta?.textContent?.trim(),
    ].filter(Boolean).join(' · ');
  }

  function hideCommandMenu() {
    commandMenu.hidden = true;
  }

  function showCommandMenu() {
    const selection = window.getSelection();
    let rect = null;
    if (selection && selection.rangeCount) {
      rect = selection.getRangeAt(0).getBoundingClientRect();
    }
    const x = rect?.left || Math.max(16, window.innerWidth / 2 - 170);
    const y = rect?.bottom || Math.max(16, window.innerHeight / 2 - 70);
    const menuWidth = 360;
    const menuHeight = 110;
    commandMenu.style.left = `${Math.max(12, Math.min(x, window.innerWidth - menuWidth - 12))}px`;
    commandMenu.style.top = `${Math.max(12, Math.min(y + 8, window.innerHeight - menuHeight - 12))}px`;
    commandMenu.hidden = false;
    askDeepSeekCommand.focus();
  }

  function appendMessage(role, text) {
    const message = document.createElement('div');
    message.className = `llama-chat-message ${role}`;
    message.textContent = text;
    chatMessages.appendChild(message);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return message;
  }

  function resetConversation(renderWelcome = true) {
    state.messages = [];
    chatMessages.innerHTML = '';
    if (renderWelcome) {
      appendMessage(
        'assistant',
        'Ask me anything about the current chapter. I will use the manuscript text and any highlighted passage as context.'
      );
    }
  }

  function openChat() {
    hideCommandMenu();
    state.selectedContext = currentSelection();
    chatSubtitle.textContent = `${CHAT_MODEL} · ${chapterDescriptor() || 'Current chapter'}`;
    chatContext.textContent = state.selectedContext
      ? `Using highlighted passage (${state.selectedContext.length.toLocaleString()} characters) plus the current chapter.`
      : 'Using the current chapter as context.';
    if (!state.messages.length && !chatMessages.children.length) resetConversation(true);
    chatShell.hidden = false;
    window.setTimeout(() => chatInput.focus(), 0);
  }

  function closeChatPanel() {
    chatShell.hidden = true;
    chatInput.value = '';
  }

  function systemMessage() {
    const chapter = currentChapterText();
    const selection = state.selectedContext;
    return [
      'You are a local manuscript assistant for Titan Wars, a historical alternate-history and Victorian gothic novel.',
      'Answer the user using the supplied chapter as the primary source. Be concise but useful.',
      'Do not claim facts that are absent from the supplied text. Clearly mark inference as inference.',
      'You are advisory only: do not imply that you edited or saved the manuscript.',
      '',
      `Part: ${chapterPart?.textContent?.trim() || 'Unknown'}`,
      `Chapter: ${chapterTitle?.textContent?.trim() || 'Unknown'}`,
      `Metadata: ${chapterMeta?.textContent?.trim() || 'None'}`,
      selection ? `Highlighted passage:\n${selection}` : 'Highlighted passage: none',
      '',
      `Current chapter text:\n${chapter}`,
    ].join('\n');
  }

  async function sendMessage(text) {
    if (state.busy || !text.trim()) return;
    const model = CHAT_MODEL;

    const userText = text.trim();
    state.messages.push({ role: 'user', content: userText });
    appendMessage('user', userText);
    chatInput.value = '';
    state.busy = true;
    chatSend.disabled = true;
    const pending = appendMessage('status', `Thinking with ${model}…`);

    try {
      const response = await fetch('http://127.0.0.1:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          stream: false,
          messages: [
            { role: 'system', content: systemMessage() },
            ...state.messages,
          ],
          keep_alive: '10m',
        }),
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || `Ollama returned ${response.status}`);
      }
      const data = await response.json();
      const answer = data?.message?.content?.trim();
      if (!answer) throw new Error('Ollama returned an empty response.');
      state.messages.push({ role: 'assistant', content: answer });
      pending.remove();
      appendMessage('assistant', answer);
    } catch (error) {
      pending.textContent = `Local DeepSeek chat failed: ${error.message}`;
    } finally {
      state.busy = false;
      chatSend.disabled = false;
      chatInput.focus();
    }
  }

  chapterText.addEventListener('keydown', event => {
    if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.matches('p[contenteditable="true"]')) return;
    event.preventDefault();
    showCommandMenu();
  }, true);

  askDeepSeekCommand.addEventListener('click', openChat);
  askDeepSeekCommand.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      hideCommandMenu();
    }
  });

  document.addEventListener('mousedown', event => {
    if (!commandMenu.hidden && !commandMenu.contains(event.target)) hideCommandMenu();
  });

  closeChat.addEventListener('click', closeChatPanel);
  resetChat.addEventListener('click', () => {
    resetConversation(true);
    state.selectedContext = currentSelection();
    chatInput.focus();
  });
  chatShell.addEventListener('mousedown', event => {
    if (event.target === chatShell) closeChatPanel();
  });
  composer.addEventListener('submit', event => {
    event.preventDefault();
    sendMessage(chatInput.value);
  });
  chatInput.addEventListener('keydown', event => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      composer.requestSubmit();
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (!commandMenu.hidden) {
      hideCommandMenu();
      return;
    }
    if (!chatShell.hidden) closeChatPanel();
  });
});
