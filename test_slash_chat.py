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
    assert "const model = CHAT_MODEL" in script
    assert "modelSelect.value" not in script
    assert "http://127.0.0.1:11434" in script
    assert "/api/chat" in script
    assert "Current chapter text" in script
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


def test_slash_chat_does_not_call_manuscript_save_api():
    script = Path("static/slash_chat.js").read_text(encoding="utf-8")

    assert "/api/chapters/save" not in script
