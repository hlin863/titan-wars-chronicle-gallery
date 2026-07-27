# Titan Wars Illustrated Chronology

A small Python web application that reads the embedded illustrations from the 1850s manuscript, associates each image with its nearest chapter and date, and displays the illustrated chapters in chronological order.

## Features

- Extracts images directly from the DOCX file.
- Sorts illustrated chapters by year, then by their original document order.
- Year filters, chapter search, responsive layout, and full-screen image viewing.
- Caches extracted media and metadata, so later launches are fast.
- Does not modify the manuscript.

## Run on Windows

```powershell
cd titan_wars_gallery
py -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python app.py --docx "C:\path\to\Manuscript.docx"
```

Open `http://127.0.0.1:5000` in a browser.

## Run on macOS or Linux

```bash
cd titan_wars_gallery
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python app.py --docx "/path/to/Manuscript.docx"
```

## Using the included project manuscript

The default source in `app.py` is `/mnt/data/Manuscript(5).docx`, which is suitable for this generated workspace. On another computer, set the `TITAN_WARS_DOCX` environment variable as shown above.

## Refreshing after manuscript changes

The cache key includes the manuscript file size and modification time. Saving a changed DOCX automatically creates a fresh extraction the next time the application starts. Cached files are stored under `instance/gallery_cache`.
