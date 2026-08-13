from __future__ import annotations

import os
import re
import tempfile
from copy import deepcopy
from difflib import SequenceMatcher
from pathlib import Path

from docx import Document
from docx.oxml import OxmlElement
from docx.text.paragraph import Paragraph

import app


def _chapter_editable_paragraphs(document, chapter_order: int) -> list[Paragraph]:
    blocks = list(app.iter_blocks(document))
    heading_count = 0
    start_index: int | None = None
    end_index = len(blocks)

    for index, block in enumerate(blocks):
        if not isinstance(block, Paragraph):
            continue
        style = (block.style.name or "").lower()
        text = app.compact_text(block.text)
        if style.startswith("heading 2") and text:
            heading_count += 1
            if heading_count == chapter_order:
                start_index = index + 1
            elif start_index is not None:
                end_index = index
                break
        elif start_index is not None and style.startswith("heading 1") and text:
            end_index = index
            break

    if start_index is None:
        raise ValueError("The selected chapter no longer exists in the manuscript.")

    return [
        block
        for block in blocks[start_index:end_index]
        if isinstance(block, Paragraph) and app.compact_text(block.text)
    ]


def _new_paragraph_like(reference: Paragraph, text: str, *, before: bool) -> Paragraph:
    new_p = OxmlElement("w:p")
    if reference._p.pPr is not None:
        new_p.append(deepcopy(reference._p.pPr))

    if before:
        reference._p.addprevious(new_p)
    else:
        reference._p.addnext(new_p)

    paragraph = Paragraph(new_p, reference._parent)
    run = paragraph.add_run(text)
    if reference.runs and reference.runs[0]._r.rPr is not None:
        run._r.insert(0, deepcopy(reference.runs[0]._r.rPr))
    return paragraph


def update_manuscript_chapter_with_inserts(
    docx_path: Path, chapter_id: str, paragraphs: list[str]
):
    match = re.fullmatch(r"chapter-(\d+)-.+", chapter_id)
    if not match:
        raise ValueError("The chapter identifier is invalid.")
    chapter_order = int(match.group(1))
    if not paragraphs:
        raise ValueError("A chapter must contain at least one paragraph.")
    if any(not isinstance(item, str) for item in paragraphs):
        raise ValueError("Chapter paragraphs must be text.")

    normalized = [item.replace("\r\n", "\n").replace("\r", "\n") for item in paragraphs]
    if any("\n" in item for item in normalized):
        raise ValueError("Each chapter paragraph must be submitted separately.")
    if any(not item.strip() for item in normalized):
        raise ValueError("New paragraphs cannot be empty. Add text before saving.")
    if sum(len(item) for item in normalized) > app.MAX_CHAPTER_LENGTH:
        raise ValueError(f"Chapter exceeds the {app.MAX_CHAPTER_LENGTH:,}-character limit.")

    document = Document(docx_path)
    editable = _chapter_editable_paragraphs(document, chapter_order)
    if not editable:
        raise ValueError("The selected chapter has no editable text paragraphs.")

    old_texts = [paragraph.text for paragraph in editable]
    matcher = SequenceMatcher(a=old_texts, b=normalized, autojunk=False)
    offset = 0

    for tag, old_start, old_end, new_start, new_end in matcher.get_opcodes():
        if tag == "equal":
            continue

        if tag == "replace":
            old_count = old_end - old_start
            new_count = new_end - new_start
            common = min(old_count, new_count)
            for index in range(common):
                app.replace_paragraph_text_preserving_runs(
                    editable[old_start + index], normalized[new_start + index]
                )
            if new_count > old_count:
                insert_at = old_start + common
                for text in normalized[new_start + common:new_end]:
                    if insert_at < len(editable):
                        created = _new_paragraph_like(editable[insert_at], text, before=True)
                    else:
                        created = _new_paragraph_like(editable[-1], text, before=False)
                    editable.insert(insert_at, created)
                    insert_at += 1
            elif old_count > new_count:
                for paragraph in editable[old_start + common:old_end]:
                    paragraph._p.getparent().remove(paragraph._p)

        elif tag == "insert":
            insert_at = old_start
            for text in normalized[new_start:new_end]:
                if insert_at < len(editable):
                    created = _new_paragraph_like(editable[insert_at], text, before=True)
                else:
                    created = _new_paragraph_like(editable[-1], text, before=False)
                editable.insert(insert_at, created)
                insert_at += 1

        elif tag == "delete":
            for paragraph in editable[old_start:old_end]:
                paragraph._p.getparent().remove(paragraph._p)

    docx_path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_name = tempfile.mkstemp(
        prefix=f".{docx_path.stem}-", suffix=".docx", dir=docx_path.parent
    )
    os.close(fd)
    temporary_path = Path(temporary_name)
    try:
        document.save(temporary_path)
        os.replace(temporary_path, docx_path)
    finally:
        temporary_path.unlink(missing_ok=True)

    updated = app.extract_chapters(docx_path)
    if chapter_order > len(updated):
        raise RuntimeError("The saved chapter could not be reloaded.")
    return updated[chapter_order - 1]


def install() -> None:
    app.update_manuscript_chapter = update_manuscript_chapter_with_inserts
