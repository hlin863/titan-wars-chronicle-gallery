import json
import threading
from pathlib import Path
from urllib.request import urlopen

from docx import Document

from app import GalleryImage, GalleryServer, ManuscriptChapter, group_chapters, render_page


def test_gallery_renders_lightbox_and_primary_navigation():
    source = Path("Manuscript.docx")
    images = [
        GalleryImage(
            id=f"image-{index}",
            file_name=f"illustration-{index}.png",
            year=1850 + index,
            chapter=f"Chapter {index}",
            part="Part I",
            context="A scene",
            document_order=index,
            alt_text=f"Illustration {index}",
        )
        for index in range(1, 4)
    ]

    assert group_chapters(images)
    page = render_page(source, images, "test-version").decode("utf-8")

    assert "Illustrated chronology" in page
    assert page.count('class="image-frame"') == 3
    assert 'id="lightbox-previous"' in page
    assert 'id="lightbox-next"' in page
    assert 'id="lightbox-position"' in page
    assert "/media/illustration-1.png?v=test-version" in page
    assert 'href="/"' in page
    assert 'href="/prompt-studio"' in page
    assert 'aria-current="page"' in page


def test_prompt_studio_template_has_return_navigation():
    page = Path("templates/prompt_studio.html").read_text(encoding="utf-8")

    assert "Prompt Studio" in page
    assert 'href="/"' in page
    assert 'href="/prompt-studio"' in page
    assert 'aria-label="Primary navigation"' in page
    assert 'aria-current="page"' in page


def test_manuscript_chapter_text_joins_paragraphs():
    chapter = ManuscriptChapter(
        id="chapter-1",
        title="Arrival",
        part="Part I",
        year=1856,
        metadata_lines=["London, 1856"],
        paragraphs=["First.", "Second."],
        document_order=1,
    )

    assert chapter.text == "First.\n\nSecond."


def test_generate_prompt_builds_non_streaming_ollama_chat(monkeypatch):
    import app

    request = {}

    def fake_request(endpoint, payload):
        request.update(endpoint=endpoint, payload=payload)
        return {
            "model": "gemma3:4b",
            "message": {"content": "A grounded visual prompt."},
            "prompt_eval_count": 42,
            "eval_count": 8,
        }

    monkeypatch.setattr(app, "ollama_request", fake_request)
    result = app.generate_prompt_with_ollama(
        model="gemma3:4b",
        chapter_title="Arrival",
        part="Part I",
        year=1856,
        metadata_lines=["London"],
        selected_text="A sufficiently long selected passage.",
        continuity_notes="Keep the blue coat.",
        style_direction="Candlelight.",
    )

    assert request["endpoint"] == "/api/chat"
    assert request["payload"]["stream"] is False
    assert request["payload"]["model"] == "gemma3:4b"
    assert result["prompt"] == "A grounded visual prompt."


def test_prompt_studio_and_chapter_api_are_served(tmp_path):
    manuscript = tmp_path / "Manuscript.docx"
    document = Document()
    document.add_heading("Part I", level=1)
    document.add_heading("The Test Chapter", level=2)
    document.add_paragraph("London, 1856")
    document.add_paragraph("A chapter paragraph long enough to load in the reader.")
    document.save(manuscript)

    gallery = GalleryServer(manuscript)

    from http.server import ThreadingHTTPServer

    server = ThreadingHTTPServer(("127.0.0.1", 0), gallery.handler_class())
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()

    try:
        base_url = f"http://127.0.0.1:{server.server_port}"

        with urlopen(f"{base_url}/prompt-studio") as response:
            studio_page = response.read().decode("utf-8")
            assert response.status == 200
            assert "Prompt Studio" in studio_page
            assert 'href="/"' in studio_page

        with urlopen(f"{base_url}/api/chapters") as response:
            payload = json.loads(response.read().decode("utf-8"))
            assert response.status == 200
            assert payload["ok"] is True
            assert payload["chapters"][0]["title"] == "The Test Chapter"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
