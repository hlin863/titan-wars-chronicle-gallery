from __future__ import annotations

import argparse
import hashlib
import html
import json
import mimetypes
import os
import re
import shutil
from dataclasses import asdict, dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Iterable
from urllib.parse import unquote, urlparse

from docx import Document
from docx.document import Document as _Document
from docx.oxml.ns import qn
from docx.table import Table
from docx.text.paragraph import Paragraph

BASE_DIR = Path(__file__).resolve().parent
DEFAULT_DOCX = Path(os.environ.get("TITAN_WARS_DOCX", "files/Manuscript.docx"))
CACHE_ROOT = BASE_DIR / "instance" / "gallery_cache"
YEAR_RE = re.compile(r"(?<!\d)(17\d{2}|18\d{2}|19\d{2}|20\d{2})(?!\d)")


@dataclass
class GalleryImage:
    id: str
    file_name: str
    year: int
    chapter: str
    part: str
    context: str
    document_order: int
    alt_text: str


def iter_blocks(parent: _Document) -> Iterable[Paragraph | Table]:
    for child in parent.element.body.iterchildren():
        if child.tag == qn("w:p"):
            yield Paragraph(child, parent)
        elif child.tag == qn("w:tbl"):
            yield Table(child, parent)


def compact_text(text: str) -> str:
    text = " ".join(text.replace("\xa0", " ").split())
    for repeats in (3, 2):
        if text and len(text) % repeats == 0:
            piece = text[: len(text) // repeats]
            if piece * repeats == text:
                return piece.strip()
    return text


def safe_slug(value: str) -> str:
    value = re.sub(r"[^a-zA-Z0-9_-]+", "-", value).strip("-")
    return value[:70] or "image"


def paragraph_images(paragraph: Paragraph):
    results = []
    for drawing in paragraph._p.xpath(".//w:drawing"):
        blips = drawing.xpath(".//a:blip")
        if not blips:
            continue
        rel_id = blips[0].get(qn("r:embed"))
        if not rel_id:
            continue
        doc_props = drawing.xpath(".//wp:docPr")
        alt = ""
        if doc_props:
            alt = doc_props[0].get("descr") or doc_props[0].get("title") or ""
        results.append((rel_id, compact_text(alt)))
    return results


def cache_key(docx_path: Path) -> str:
    stat = docx_path.stat()
    raw = f"{docx_path.resolve()}:{stat.st_size}:{stat.st_mtime_ns}".encode()
    return hashlib.sha256(raw).hexdigest()[:16]


def extract_gallery(docx_path: Path) -> tuple[Path, list[GalleryImage]]:
    if not docx_path.exists():
        raise FileNotFoundError(f"Manuscript not found: {docx_path}")

    cache_dir = CACHE_ROOT / cache_key(docx_path)
    media_dir = cache_dir / "media"
    manifest_path = cache_dir / "manifest.json"
    if manifest_path.exists():
        data = json.loads(manifest_path.read_text(encoding="utf-8"))
        return media_dir, [GalleryImage(**item) for item in data]

    if cache_dir.exists():
        shutil.rmtree(cache_dir)
    media_dir.mkdir(parents=True, exist_ok=True)

    doc = Document(docx_path)
    images: list[GalleryImage] = []
    current_part = "The 1850s Manuscript"
    current_chapter = "Opening"
    current_year: int | None = None
    lines_since_heading = 0
    recent_lines: list[str] = []
    order = 0

    for block in iter_blocks(doc):
        if not isinstance(block, Paragraph):
            continue
        text = compact_text(block.text)
        style = (block.style.name or "").lower()
        if text:
            if style.startswith("heading 1"):
                current_part = text
            elif style.startswith("heading 2"):
                current_chapter = text
                current_year = None
                lines_since_heading = 0
            else:
                lines_since_heading += 1
            # A chapter date is normally a short line immediately below its heading.
            # Body-text years often refer to memories or future events and should not
            # re-date the illustration that follows.
            years = [int(x) for x in YEAR_RE.findall(text)]
            if years and len(text) <= 140 and lines_since_heading <= 10:
                current_year = years[-1]
            recent_lines.append(text)
            recent_lines = recent_lines[-8:]

        for rel_id, alt in paragraph_images(block):
            image_part = doc.part.related_parts[rel_id]
            suffix = Path(str(image_part.partname)).suffix.lower() or ".png"
            if suffix not in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".tif", ".tiff"}:
                suffix = ".png"
            order += 1
            year = current_year or 0
            file_name = f"{order:03d}-{year or 'undated'}-{safe_slug(current_chapter)}{suffix}"
            (media_dir / file_name).write_bytes(image_part.blob)
            context_candidates = [line for line in reversed(recent_lines) if line != current_chapter]
            context = next((line for line in context_candidates if len(line) <= 130), "")
            images.append(GalleryImage(
                id=f"image-{order}", file_name=file_name, year=year,
                chapter=current_chapter, part=current_part, context=context,
                document_order=order, alt_text=alt or f"Illustration from {current_chapter}",
            ))

    images.sort(key=lambda item: (item.year if item.year else 9999, item.document_order))
    manifest_path.write_text(json.dumps([asdict(x) for x in images], ensure_ascii=False, indent=2), encoding="utf-8")
    return media_dir, images


def group_chapters(images: list[GalleryImage]):
    groups, index = [], {}
    for image in images:
        key = (image.year, image.part, image.chapter)
        if key not in index:
            index[key] = {"year": image.year, "part": image.part, "chapter": image.chapter, "context": image.context, "images": []}
            groups.append(index[key])
        index[key]["images"].append(image)
    return groups


def e(value) -> str:
    return html.escape(str(value), quote=True)


def render_page(source: Path, images: list[GalleryImage]) -> bytes:
    groups = group_chapters(images)
    years = sorted({x.year for x in images if x.year})
    year_buttons = "".join(f'<button class="year-pill" data-year="{y}">{y}</button>' for y in years)
    chapters = []
    for group in groups:
        frames = []
        for image in group["images"]:
            url = f"/media/{e(image.file_name)}"
            frames.append(f'''<button class="image-frame" type="button" data-full="{url}" data-alt="{e(image.alt_text)}" data-title="{e(group['chapter'])}" aria-label="Open illustration from {e(group['chapter'])}"><img src="{url}" alt="{e(image.alt_text)}" loading="lazy"><span class="zoom-label">View image</span></button>''')
        search_text = f"{group['chapter']} {group['part']} {group['context']} {group['year']}".lower()
        context = f'<div class="context">{e(group["context"])}</div>' if group["context"] else ""
        chapters.append(f'''<article class="chapter" data-year="{group['year']}" data-search="{e(search_text)}"><div class="timeline-marker"><span>{group['year'] or '—'}</span></div><div class="chapter-card"><div class="chapter-heading"><p>{e(group['part'])}</p><h2>{e(group['chapter'])}</h2>{context}</div><div class="image-grid count-{len(frames)}">{''.join(frames)}</div></div></article>''')

    template = (BASE_DIR / "templates" / "index.html").read_text(encoding="utf-8")
    replacements = {
        "{{MANUSCRIPT_NAME}}": e(source.stem),
        "{{IMAGE_COUNT}}": str(len(images)),
        "{{CHAPTER_COUNT}}": str(len(groups)),
        "{{YEAR_BUTTONS}}": year_buttons,
        "{{CHAPTERS}}": "".join(chapters),
    }
    for token, value in replacements.items():
        template = template.replace(token, value)
    return template.encode("utf-8")


class GalleryServer:
    def __init__(self, docx_path: Path):
        self.source = docx_path
        self.media_dir, self.images = extract_gallery(docx_path)
        self.index_html = render_page(docx_path, self.images)

    def handler_class(self):
        server_state = self
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                path = unquote(urlparse(self.path).path)
                if path == "/":
                    self.send_content(server_state.index_html, "text/html; charset=utf-8")
                elif path == "/health":
                    payload = json.dumps({"status": "ok", "images": len(server_state.images), "chapters": len(group_chapters(server_state.images))}).encode()
                    self.send_content(payload, "application/json")
                elif path.startswith("/media/"):
                    self.send_file(server_state.media_dir, path[len("/media/"):])
                elif path.startswith("/static/"):
                    self.send_file(BASE_DIR / "static", path[len("/static/"):])
                else:
                    self.send_error(404)

            def send_content(self, payload: bytes, content_type: str):
                self.send_response(200)
                self.send_header("Content-Type", content_type)
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

            def send_file(self, root: Path, relative: str):
                target = (root / relative).resolve()
                try:
                    target.relative_to(root.resolve())
                except ValueError:
                    self.send_error(403); return
                if not target.is_file():
                    self.send_error(404); return
                payload = target.read_bytes()
                mime = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
                self.send_content(payload, mime)

            def log_message(self, fmt, *args):
                print(f"[{self.log_date_time_string()}] {fmt % args}")
        return Handler


def main():
    parser = argparse.ArgumentParser(description="Display manuscript illustrations as a chronological web gallery.")
    parser.add_argument("--docx", type=Path, default=DEFAULT_DOCX, help="Path to the manuscript DOCX")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", "5000")))
    args = parser.parse_args()
    gallery = GalleryServer(args.docx)
    server = ThreadingHTTPServer((args.host, args.port), gallery.handler_class())
    print(f"Titan Wars gallery: http://{args.host}:{args.port}")
    print(f"Loaded {len(gallery.images)} images from {args.docx}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping gallery.")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
