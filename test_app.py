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
