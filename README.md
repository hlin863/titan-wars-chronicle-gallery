# Titan Wars Illustrated Chronology

A small Python web application that reads the embedded illustrations from the 1850s manuscript, associates each image with its nearest chapter and date, and displays the illustrated chapters in chronological order.

## Features

- Extracts images directly from the DOCX file.
- Sorts illustrated chapters by year, then by their original document order.
- Year filters, chapter search, responsive layout, and full-screen image viewing.
- Keeps one persistent local image folder under `instance/gallery_media` instead of creating revision-specific cache folders.
- Synchronizes that folder incrementally when the manuscript changes: new images are added, unchanged images are left untouched, and removed manuscript images are deleted individually.
- Uses content-derived image filenames, so moving an illustration within the manuscript does not force unrelated image files to be renamed or rewritten.
- Includes a Prompt Studio backed by local Ollama models.
- Lets Prompt Studio users edit chapter paragraphs and save them directly to the
  selected Manuscript DOCX, with stale-edit protection when the file changes.

## Run on Windows

```powershell
cd titan_wars_gallery
py -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python app.py --docx "C:\path\to\Manuscript.docx"
```

If the local Python process has been stopping unexpectedly, use the supervised launcher instead:

```powershell
python run_gallery.py --docx "C:\path\to\Manuscript.docx"
```

The supervised launcher starts `app.py` with Python fault diagnostics enabled, prints the child process ID and exit code, and restarts the gallery automatically after an abnormal child-process exit. Press Ctrl+C to stop the supervisor normally.

Open `http://127.0.0.1:5000` in a browser. Prompt Studio is available at `http://127.0.0.1:5000/prompt-studio`.

## Run on macOS or Linux

```bash
cd titan_wars_gallery
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py --docx "/path/to/Manuscript.docx"
```

The supervised launcher is also available with `python3 run_gallery.py`.

## Using the included project manuscript

The default source in `app.py` is `files/Manuscript.docx`. You can point the application at another manuscript with `--docx` or the `TITAN_WARS_DOCX` environment variable.

## Refreshing after manuscript changes

The server watches the manuscript file for changes. It uses the file signature and SHA-256 digest only to decide whether a refresh is needed and to version browser image URLs.

When the manuscript changes, the application scans the embedded images and synchronizes `instance/gallery_media` file by file. The directory itself is not deleted during a refresh. Existing image files with matching content are kept in place, new images are written, and obsolete image files are removed individually. No hash-named revision cache directories or persistent manifest are created.
