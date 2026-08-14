document.addEventListener('DOMContentLoaded', () => {
  const chapterText = document.querySelector('#chapter-text');
  const chapterTitle = document.querySelector('#chapter-title');
  const chapterPart = document.querySelector('#chapter-part');
  const chapterMeta = document.querySelector('#chapter-meta');
  if (!chapterText) return;

  const OLLAMA_BASE_URL = 'http://127.0.0.1:11434';
  const CHAT_MODEL = 'deepseek-r1:14b';
  const CHAT_NUM_CTX = 2048;
  const CHAT_NUM_PREDICT = 384;
  const CHAT_PROMPT_CHAR_BUDGET = 4200;
  const CHAT_RETRY_CHAR_BUDGET = 2800;
  const CHAT_HISTORY_MESSAGES = 4;

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

  function truncateText(text, maxChars) {
    const value = String(text || '').trim();
    if (value.length <= maxChars) return value;
    if (maxChars <= 80) return value.slice(0, Math.max(0, maxChars));
    const marker = '\n…[context trimmed]…\n';
    const available = maxChars - marker.length;
    const startLength = Math.ceil(available * 0.65);
    const endLength = available - startLength;
    return `${value.slice(0, startLength)}${marker}${value.slice(-endLength)}`;
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
      ? `Using highlighted passage (${state.selectedContext.length.toLocaleString()} characters) plus a bounded chapter excerpt.`
      : 'Using a bounded excerpt of the current chapter as context.';
    if (!state.messages.length && !chatMessages.children.length) resetConversation(true);
    chatShell.hidden = false;
    window.setTimeout(() => chatInput.focus(), 0);
  }

  function closeChatPanel() {
    chatShell.hidden = true;
    chatInput.value = '';
  }

  function systemMessage(maxChars) {
    const selection = state.selectedContext;
    const chapter = currentChapterText();
    const fixed = [
      'You are a local manuscript assistant for Titan Wars, a historical alternate-history and Victorian gothic novel.',
      'Answer using the supplied manuscript context as the primary source. Be concise but useful.',
      'Do not claim facts absent from the supplied text. Clearly mark inference as inference.',
      'You are advisory only: do not imply that you edited or saved the manuscript.',
      '',
      `Part: ${chapterPart?.textContent?.trim() || 'Unknown'}`,
      `Chapter: ${chapterTitle?.textContent?.trim() || 'Unknown'}`,
      `Metadata: ${chapterMeta?.textContent?.trim() || 'None'}`,
    ].join('\n');

    const remaining = Math.max(600, maxChars - fixed.length - 80);
    const selectionBudget = selection ? Math.min(1400, Math.floor(remaining * 0.48)) : 0;
    const chapterBudget = Math.max(500, remaining - selectionBudget);
    const sections = [fixed];

    if (selection) {
      sections.push(`Highlighted passage:\n${truncateText(selection, selectionBudget)}`);
    } else {
      sections.push('Highlighted passage: none');
    }
    sections.push(`Current chapter excerpt:\n${truncateText(chapter, chapterBudget)}`);
    return truncateText(sections.join('\n\n'), maxChars);
  }

  function buildBoundedMessages(charBudget = CHAT_PROMPT_CHAR_BUDGET) {
    const recent = state.messages.slice(-CHAT_HISTORY_MESSAGES).map(message => ({
      role: message.role,
      content: truncateText(message.content, message.role === 'user' ? 900 : 700),
    }));

    const historyChars = recent.reduce((total, message) => total + message.content.length, 0);
    const systemBudget = Math.max(1600, charBudget - historyChars - 120);
    return [
      { role: 'system', content: systemMessage(systemBudget) },
      ...recent,
    ];
  }

  async function unloadOtherOllamaModels() {
    try {
      const response = await fetch(`${OLLAMA_BASE_URL}/api/ps`);
      if (!response.ok) return;
      const data = await response.json();
      const models = Array.isArray(data?.models) ? data.models : [];
      for (const loaded of models) {
        const name = loaded?.name || loaded?.model;
        if (!name || name === CHAT_MODEL) continue;
        await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: name, prompt: '', stream: false, keep_alive: 0 }),
        });
      }
    } catch (error) {
      console.warn('Could not unload other Ollama models before chat:', error);
    }
  }

  async function requestDeepSeek(messages, forceCpu = false) {
    return fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: CHAT_MODEL,
        stream: false,
        messages,
        keep_alive: '10m',
        options: {
          num_ctx: CHAT_NUM_CTX,
          num_predict: CHAT_NUM_PREDICT,
          ...(forceCpu ? { num_gpu: 0 } : {}),
        },
      }),
    });
  }

  async function responseError(response) {
    const detail = await response.text();
    return detail || `Ollama returned ${response.status}`;
  }

  function isCudaOutOfMemory(message) {
    const normalized = String(message || '').toLowerCase();
    return normalized.includes('out of memory') && (
      normalized.includes('cuda') ||
      normalized.includes('llama-server') ||
      normalized.includes('vram')
    );
  }

  function isContextTooLarge(message) {
    const normalized = String(message || '').toLowerCase();
    return normalized.includes('exceeds the available context size') ||
      normalized.includes('exceed_context_size_error') ||
      normalized.includes('n_ctx');
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
    const pending = appendMessage('status', `Preparing ${model}…`);

    try {
      pending.textContent = 'Freeing Ollama memory…';
      await unloadOtherOllamaModels();

      let messages = buildBoundedMessages();
      pending.textContent = `Thinking with ${model}…`;
      let response = await requestDeepSeek(messages, false);

      if (!response.ok) {
        let detail = await responseError(response);

        if (isContextTooLarge(detail)) {
          pending.textContent = 'Chapter context is large. Retrying with a tighter excerpt…';
          messages = buildBoundedMessages(CHAT_RETRY_CHAR_BUDGET);
          response = await requestDeepSeek(messages, false);
          if (!response.ok) detail = await responseError(response);
          else detail = '';
        }

        if (!response.ok && isCudaOutOfMemory(detail)) {
          pending.textContent = `${model} does not fit in available VRAM. Retrying on CPU…`;
          response = await requestDeepSeek(messages, true);
          if (!response.ok) detail = await responseError(response);
          else detail = '';
        }

        if (!response.ok) throw new Error(detail);
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
