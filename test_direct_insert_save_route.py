import inspect

import app


def test_save_route_calls_insertion_aware_writer_directly():
    source = inspect.getsource(app.GalleryServer.handler_class)

    assert "from paragraph_editing import update_manuscript_chapter_with_inserts" in source
    assert "chapter = update_manuscript_chapter_with_inserts(" in source
