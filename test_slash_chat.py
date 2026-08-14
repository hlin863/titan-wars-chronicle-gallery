from pathlib import Path


def test_prompt_studio_loads_slash_chat_assets():
    page = Path("templates/prompt_studio.html").read_text(encoding="utf-8")

    assert '/static/slash_chat.css' in page
    assert '/static/slash_chat.js' in page
    assert 'Type <strong>/</strong>' in page


def test_slash_chat_uses_deepseek_r1_14b_and_chapter_context():
    script = Path("static/slash_chat.js").read_text(encoding="utf-8")

    assert "event.key !== '/'" in script
    assert "Ask DeepSeek" in script
    assert "const CHAT_MODEL = 'deepseek-r1:14b'" in script
    assert "modelSelect.value" not in script
    assert "http://127.0.0.1:11434" in script
    assert "/api/chat" in script
    assert "Current chapter excerpt" in script
    assert "Highlighted passage" in script
    assert "stream: false" in script
    assert "do not imply that you edited or saved the manuscript" in script


def test_slash_chat_handles_ollama_memory_pressure():
    script = Path("static/slash_chat.js").read_text(encoding="utf-8")

    assert "const CHAT_NUM_CTX = 2048" in script
    assert "/api/ps" in script
    assert "keep_alive: 0" in script
    assert "num_ctx: CHAT_NUM_CTX" in script
    assert "num_gpu: 0" in script
    assert "isCudaOutOfMemory" in script
    assert "Retrying on CPU" in script


def test_slash_chat_reserves_more_output_space_without_overflowing_context():
    script = Path("static/slash_chat.js").read_text(encoding="utf-8")

    assert "const CHAT_NUM_PREDICT = 720" in script
    assert "const CHAT_PROMPT_CHAR_BUDGET = 3200" in script
    assert "const CHAT_RETRY_CHAR_BUDGET = 2200" in script
    assert "const CHAT_HISTORY_MESSAGES = 4" in script
    assert "function truncateText" in script
    assert "function buildBoundedMessages" in script
    assert "isContextTooLarge" in script
    assert "Retrying with a tighter excerpt" in script
    assert "num_predict: numPredict" in script


def test_slash_chat_full_chapter_summary_uses_chunk_and_synthesis_passes():
    script = Path("static/slash_chat.js").read_text(encoding="utf-8")

    assert "const SUMMARY_CHUNK_CHARS = 3000" in script
    assert "const SUMMARY_CHUNK_PREDICT = 180" in script
    assert "const SUMMARY_SYNTHESIS_PREDICT = 720" in script
    assert "function isSummaryRequest" in script
    assert "function chapterChunks" in script
    assert "async function summariseFullChapter" in script
    assert "Reading chapter section" in script
    assert "Building the full chapter summary" in script
    assert "Section notes" in script


def test_slash_chat_renders_assistant_markdown_safely():
    script = Path("static/slash_chat.js").read_text(encoding="utf-8")
    styles = Path("static/slash_chat.css").read_text(encoding="utf-8")

    assert "function escapeHtml" in script
    assert "function inlineMarkdown" in script
    assert "function renderAssistantMarkdown" in script
    assert "message.innerHTML = renderAssistantMarkdown(text)" in script
    assert ".llama-chat-message.assistant h3" in styles
    assert ".llama-chat-message.assistant ul" in styles
    assert ".llama-chat-message.assistant code" in styles


def test_slash_chat_does_not_call_manuscript_save_api():
    script = Path("static/slash_chat.js").read_text(encoding="utf-8")

    assert "/api/chapters/save" not in script
