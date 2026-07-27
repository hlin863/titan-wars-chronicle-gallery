from pathlib import Path
from app import extract_gallery, group_chapters, render_page

def test_gallery_extracts_and_renders():
    source = Path('/mnt/data/Manuscript(5).docx')
    _, images = extract_gallery(source)
    assert images
    years = [x.year for x in images]
    assert years == sorted(years)
    assert group_chapters(images)
    page = render_page(source, images)
    assert b'Illustrated Chronology' in page
    assert b'/media/' in page
