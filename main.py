from __future__ import annotations

import json
import re
import traceback
import uuid
from io import BytesIO
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image
from rembg import new_session, remove

app = FastAPI(title="PhotoPEG Studio")

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
STORAGE_DIR = BASE_DIR / "storage"
BATCHES_DIR = STORAGE_DIR / "batches"

STATIC_DIR.mkdir(exist_ok=True)
STORAGE_DIR.mkdir(exist_ok=True)
BATCHES_DIR.mkdir(exist_ok=True)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/media", StaticFiles(directory=STORAGE_DIR), name="media")

MAX_FILES_PER_BATCH = 50
OUTPUT_SIZE = 1000
DEFAULT_MARGIN_PERCENT = 8
DEFAULT_JPEG_QUALITY = 95

bg_session = None


@app.get("/", response_class=HTMLResponse)
def home():
    index_path = STATIC_DIR / "index.html"
    if not index_path.exists():
        return HTMLResponse(
            "<h1>Arquivo static/index.html não encontrado.</h1>",
            status_code=500,
        )
    return index_path.read_text(encoding="utf-8")


@app.get("/health")
def health():
    return {
        "status": "ok",
        "session_loaded": bg_session is not None,
        "max_files_per_batch": MAX_FILES_PER_BATCH,
        "output_size": OUTPUT_SIZE,
        "output_format": "jpg",
        "background": "white",
    }


def get_bg_session():
    global bg_session
    if bg_session is None:
        bg_session = new_session("u2netp")
    return bg_session


def safe_stem(filename: str) -> str:
    stem = Path(filename).stem
    stem = re.sub(r"[^a-zA-Z0-9\-_]+", "-", stem).strip("-")
    return stem or "imagem"


def remove_background(raw_bytes: bytes) -> Image.Image:
    session = get_bg_session()
    result = remove(raw_bytes, session=session)
    return Image.open(BytesIO(result)).convert("RGBA")


def compose_final_jpg(
    isolated_rgba: Image.Image,
    output_size: int = OUTPUT_SIZE,
    margin_percent: int = DEFAULT_MARGIN_PERCENT,
    jpeg_quality: int = DEFAULT_JPEG_QUALITY,
) -> bytes:
    bbox = isolated_rgba.getbbox()
    if bbox:
        isolated_rgba = isolated_rgba.crop(bbox)

    iw, ih = isolated_rgba.size
    if iw <= 0 or ih <= 0:
        raise ValueError("A imagem ficou vazia após a remoção de fundo.")

    margin_px = int(output_size * (margin_percent / 100))
    max_w = max(1, output_size - (margin_px * 2))
    max_h = max(1, output_size - (margin_px * 2))

    fit_scale = min(max_w / iw, max_h / ih)
    new_w = max(1, int(iw * fit_scale))
    new_h = max(1, int(ih * fit_scale))

    resized = isolated_rgba.resize((new_w, new_h), Image.LANCZOS)

    x = (output_size - new_w) // 2
    y = (output_size - new_h) // 2

    temp = Image.new("RGBA", (output_size, output_size), (255, 255, 255, 255))
    temp.paste(resized, (x, y), resized)

    output = BytesIO()
    temp.convert("RGB").save(output, format="JPEG", quality=jpeg_quality, optimize=True)
    output.seek(0)
    return output.read()


def media_url(path: Path) -> str:
    rel = path.relative_to(STORAGE_DIR).as_posix()
    return f"/media/{rel}"


@app.post("/api/process-batch")
async def process_batch(
    files: list[UploadFile] = File(...),
    margin_percent: int = Form(DEFAULT_MARGIN_PERCENT),
    jpeg_quality: int = Form(DEFAULT_JPEG_QUALITY),
):
    try:
        if not files:
            return JSONResponse(status_code=400, content={"error": "Nenhum arquivo enviado."})

        if len(files) > MAX_FILES_PER_BATCH:
            return JSONResponse(
                status_code=400,
                content={"error": f"Envie no máximo {MAX_FILES_PER_BATCH} imagens por vez."},
            )

        batch_id = uuid.uuid4().hex[:12]
        batch_dir = BATCHES_DIR / batch_id
        batch_dir.mkdir(parents=True, exist_ok=True)

        valid_ext = {".jpg", ".jpeg", ".png", ".webp"}
        processed_items = []

        for file in files:
            ext = Path(file.filename).suffix.lower()
            if ext not in valid_ext:
                continue

            raw = await file.read()
            if not raw:
                continue

            print(f"Processando arquivo: {file.filename}")

            clean_name = safe_stem(file.filename)
            image_id = uuid.uuid4().hex[:10]
            item_dir = batch_dir / image_id
            item_dir.mkdir(parents=True, exist_ok=True)

            final_jpg = compose_final_jpg(
                isolated_rgba=remove_background(raw),
                output_size=OUTPUT_SIZE,
                margin_percent=margin_percent,
                jpeg_quality=jpeg_quality,
            )

            output_filename = f"{clean_name}_1000x1000.jpg"
            output_path = item_dir / output_filename
            output_path.write_bytes(final_jpg)

            processed_items.append(
                {
                    "image_id": image_id,
                    "filename": file.filename,
                    "output_filename": output_filename,
                    "preview_url": media_url(output_path),
                    "download_url": f"/download/image/{batch_id}/{image_id}",
                }
            )

            print(f"Arquivo final gerado: {output_filename}")

        if not processed_items:
            return JSONResponse(
                status_code=400,
                content={"error": "Nenhuma imagem válida foi processada."},
            )

        meta = {
            "batch_id": batch_id,
            "count": len(processed_items),
            "items": processed_items,
        }
        (batch_dir / "batch.json").write_text(
            json.dumps(meta, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        return {
            "success": True,
            "batch_id": batch_id,
            "count": len(processed_items),
            "zip_url": f"/download/zip/{batch_id}",
            "items": processed_items,
        }

    except Exception as exc:
        print("Erro em /api/process-batch")
        print(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"error": f"Erro interno no processamento: {str(exc)}"},
        )


@app.get("/download/image/{batch_id}/{image_id}")
def download_image(batch_id: str, image_id: str):
    batch_dir = BATCHES_DIR / batch_id
    if not batch_dir.exists():
        raise HTTPException(status_code=404, detail="Lote não encontrado.")

    item_dir = batch_dir / image_id
    if not item_dir.exists():
        raise HTTPException(status_code=404, detail="Imagem não encontrada.")

    jpg_files = list(item_dir.glob("*.jpg"))
    if not jpg_files:
        raise HTTPException(status_code=404, detail="Arquivo JPG não encontrado.")

    file_path = jpg_files[0]
    return FileResponse(
        path=file_path,
        media_type="image/jpeg",
        filename=file_path.name,
    )


@app.get("/download/zip/{batch_id}")
def download_zip(batch_id: str):
    batch_dir = BATCHES_DIR / batch_id
    if not batch_dir.exists():
        raise HTTPException(status_code=404, detail="Lote não encontrado.")

    zip_path = batch_dir / f"photopeg-lote-{batch_id}.zip"

    with ZipFile(zip_path, "w", ZIP_DEFLATED) as zipf:
        for item_dir in sorted(batch_dir.iterdir()):
            if not item_dir.is_dir():
                continue
            for jpg in item_dir.glob("*.jpg"):
                zipf.write(jpg, arcname=jpg.name)

    return FileResponse(
        path=zip_path,
        media_type="application/zip",
        filename=f"photopeg-lote-{batch_id}.zip",
    )
