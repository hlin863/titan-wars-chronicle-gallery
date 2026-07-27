document.addEventListener('DOMContentLoaded', () => {
  const chapterList = document.querySelector('#chapter-list');
  const chapterSearch = document.querySelector('#chapter-search');
  const chapterPart = document.querySelector('#chapter-part');
  const chapterTitle = document.querySelector('#chapter-title');
  const chapterMeta = document.querySelector('#chapter-meta');
  const chapterText = document.querySelector('#chapter-text');
  const modelSelect = document.querySelector('#model-select');
  const ollamaStatus = document.querySelector('#ollama-status');
  const selectionState = document.querySelector('#selection-state');
  const captureSelection = document.querySelector('#capture-selection');
  const selectedText = document.querySelector('#selected-text');
  const continuityNotes = document.querySelector('#continuity-notes');
  const styleDirection = document.querySelector('#style-direction');
  const generatePrompt = document.querySelector('#generate-prompt');
  const generatedPrompt = document.querySelector('#generated-prompt');
  const generationStatus = document.querySelector('#generation-status');
  const generationMetrics = document.querySelector('#generation-metrics');
  const copyPrompt = document.querySelector('#copy-prompt');
  const clearPrompt = document.querySelector('#clear-prompt');

  let chapters = [];
  let activeChapter = null;
  let highlightedText = '';

  function escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  async function getJson(url) {
    const response = await fetch(url, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || data.ok === false) {
      throw new Error(data.error || `Request failed: ${response.status}`);
    }
    return data;
  }

  async function postJson(url, payload) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok || data.ok === false) {
      throw new Error(data.error || `Request failed: ${response.status}`);
    }
    return data;
  }

  function renderChapterList() {
    const query = chapterSearch.value.trim().toLowerCase();
    const visible = chapters.filter(chapter => {
      const searchText = [
        chapter.title,
        chapter.part,
        chapter.year,
        ...(chapter.metadata_lines || []),
      ].join(' ').toLowerCase();
      return !query || searchText.includes(query);
    });

    chapterList.innerHTML = '';
    visible.forEach(chapter => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'chapter-item';
      if (chapter.id === activeChapter?.id) button.classList.add('active');
      button.innerHTML = `
        <strong>${escapeHtml(chapter.title)}</strong>
        <span>${escapeHtml(chapter.year || 'Undated')} · ${escapeHtml(chapter.part)}</span>
      `;
      button.addEventListener('click', () => selectChapter(chapter));
      chapterList.appendChild(button);
    });

    if (!visible.length) {
      chapterList.innerHTML = '<p class="empty-state">No chapters match this search.</p>';
    }
  }

  function selectChapter(chapter) {
    activeChapter = chapter;
    highlightedText = '';
    chapterPart.textContent = chapter.part;
    chapterTitle.textContent = chapter.title;
    chapterMeta.textContent = [
      chapter.year || '',
      ...(chapter.metadata_lines || []).slice(0, 3),
    ].filter(Boolean).join(' · ');
    chapterText.innerHTML = (chapter.paragraphs || [])
      .map(paragraph => `<p>${escapeHtml(paragraph)}</p>`)
      .join('');
    selectionState.textContent = 'No passage selected';
    captureSelection.disabled = true;
    renderChapterList();
  }

  function updateSelection() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const anchorInside = chapterText.contains(selection.anchorNode);
    const focusInside = chapterText.contains(selection.focusNode);
    highlightedText = anchorInside && focusInside ? selection.toString().trim() : '';
    captureSelection.disabled = highlightedText.length === 0;
    selectionState.textContent = highlightedText
      ? `${highlightedText.length.toLocaleString()} characters selected`
      : 'No passage selected';
  }

  async function loadChapters() {
    const data = await getJson('/api/chapters');
    chapters = data.chapters || [];
    renderChapterList();
    if (chapters.length) selectChapter(chapters[0]);
  }

  async function loadModels() {
    try {
      const data = await getJson('/api/ollama/models');
      modelSelect.innerHTML = '';
      data.models.forEach(model => {
        const option = document.createElement('option');
        option.value = model.name;
        const details = [model.parameter_size, model.quantization].filter(Boolean).join(' · ');
        option.textContent = details ? `${model.name} — ${details}` : model.name;
        modelSelect.appendChild(option);
      });
      if (!data.models.length) throw new Error('Ollama is running, but no local models were found.');
      const preferred = [...modelSelect.options].find(option => option.value === data.default_model);
      if (preferred) modelSelect.value = preferred.value;
      ollamaStatus.dataset.state = 'connected';
      ollamaStatus.title = 'Ollama connected';
    } catch (error) {
      modelSelect.innerHTML = '<option>Ollama unavailable</option>';
      modelSelect.disabled = true;
      generatePrompt.disabled = true;
      ollamaStatus.dataset.state = 'error';
      ollamaStatus.title = error.message;
      generationStatus.textContent = error.message;
    }
  }

  chapterText.addEventListener('mouseup', updateSelection);
  chapterText.addEventListener('keyup', updateSelection);
  captureSelection.addEventListener('click', () => {
    selectedText.value = highlightedText;
    generationStatus.textContent = 'Highlighted passage copied into the prompt request.';
  });
  chapterSearch.addEventListener('input', renderChapterList);

  generatePrompt.addEventListener('click', async () => {
    const source = selectedText.value.trim();
    if (!activeChapter) {
      generationStatus.textContent = 'Select a chapter first.';
      return;
    }
    if (source.length < 20) {
      generationStatus.textContent = 'Select or paste at least 20 characters.';
      return;
    }

    generatePrompt.disabled = true;
    generationStatus.textContent = `Generating with ${modelSelect.value}…`;
    generationMetrics.textContent = '';
    try {
      const result = await postJson('/api/ollama/write-prompt', {
        model: modelSelect.value,
        chapter_title: activeChapter.title,
        part: activeChapter.part,
        year: activeChapter.year,
        metadata_lines: activeChapter.metadata_lines,
        selected_text: source,
        continuity_notes: continuityNotes.value.trim(),
        style_direction: styleDirection.value.trim(),
      });
      generatedPrompt.value = result.prompt;
      generationStatus.textContent = `Prompt generated with ${result.model}.`;
      const duration = result.duration_ns
        ? `${(result.duration_ns / 1_000_000_000).toFixed(1)} seconds`
        : '';
      generationMetrics.textContent = [
        result.prompt_tokens ? `${result.prompt_tokens} input tokens` : '',
        result.output_tokens ? `${result.output_tokens} output tokens` : '',
        duration,
      ].filter(Boolean).join(' · ');
    } catch (error) {
      generationStatus.textContent = error.message;
    } finally {
      generatePrompt.disabled = false;
    }
  });

  copyPrompt.addEventListener('click', async () => {
    const prompt = generatedPrompt.value.trim();
    if (!prompt) {
      generationStatus.textContent = 'There is no prompt to copy.';
      return;
    }
    try {
      await navigator.clipboard.writeText(prompt);
      generationStatus.textContent = 'Prompt copied.';
    } catch {
      generatedPrompt.select();
      document.execCommand('copy');
      generationStatus.textContent = 'Prompt copied.';
    }
  });

  clearPrompt.addEventListener('click', () => {
    generatedPrompt.value = '';
    generationMetrics.textContent = '';
  });

  Promise.all([loadChapters(), loadModels()]).catch(error => {
    generationStatus.textContent = error.message;
  });
});