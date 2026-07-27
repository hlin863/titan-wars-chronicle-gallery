from pathlib import Path

from app import GalleryImage, group_chapters, render_page


def test_gallery_renders_lightbox_navigation():
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
    page = render_page(source, images).decode("utf-8")

    assert "Illustrated Chronology" in page
    assert page.count('class="image-frame"') == 3
    assert 'id="lightbox-previous"' in page
    assert 'id="lightbox-next"' in page
    assert 'id="lightbox-position"' in page
    assert "/media/illustration-1.png" in page


def test_manuscript_chapter_text_joins_paragraphs():
    from app import ManuscriptChapter

    chapter = ManuscriptChapter(
        id="chapter-1", title="Arrival", part="Part I", year=1856,
        metadata_lines=["London, 1856"], paragraphs=["First.", "Second."],
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
        model="gemma3:4b", chapter_title="Arrival", part="Part I", year=1856,
        metadata_lines=["London"], selected_text="A sufficiently long selected passage.",
        continuity_notes="Keep the blue coat.", style_direction="Candlelight.",
    )

    assert request["endpoint"] == "/api/chat"
    assert request["payload"]["stream"] is False
    assert request["payload"]["model"] == "gemma3:4b"
    assert result["prompt"] == "A grounded visual prompt."
