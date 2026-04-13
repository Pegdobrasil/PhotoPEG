from __future__ import annotations

import base64
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
from pydantic import BaseModel, Field
from rembg import new_session, remove

app = FastAPI(title="PhotoPEG Editor")

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
STORAGE_DIR = BASE_DIR / "storage"
BATCHES_DIR = STORAGE_DIR / "batches"
INDEX_FILE = STORAGE_DIR / "index.json"

STATIC_DIR.mkdir(exist_ok=True)
STORAGE_DIR.mkdir(exist_ok=True)
BATCHES_DIR.mkdir(exist_ok=True)

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/media", StaticFiles(directory=STORAGE_DIR), name="media")

bg_session = None
MAX_FILES_PER_BATCH = 50


class ReprocessPayload(BaseModel):
    margin_percent: int = Field(default=8, ge=0, le=30)
    zoom_percent: int = Field(default=100, ge=50, le=250)
    offset_x: int = Field(default=0, ge=-500, le=500)
    offset_y: int = Field(default=0, ge=-500, le=500)
    jpeg_quality: int = Field(default=95, ge=70, le=100)
    mask_data_url: str | None = None
    centralize: bool = False


class BatchReprocessPayload(BaseModel):
    image_ids: list[str] = Field(default_factory=list)
    margin_percent: int = Field(default=8, ge=0, le=30)
    zoom_percent: int = Field(default=100, ge=50, le=250)
    offset_x: int = Field(default=0, ge=-500, le=500)
    offset_y: int = Field(default=0, ge=-500, le=500)
    jpeg_quality: int = Field(default=95, ge=70, le=100)
    centralize: bool = False


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
    }


def get_bg_session():
    global bg_session
    if bg_session is None:
        bg_session = new_session("u2netp")
    return bg_session


def load_index() -> dict:
    if INDEX_FILE.exists():
        try:
            return json.loads(INDEX_FILE.read_text(encoding="utf-8"))
        except Exception:
            return {}
    return {}


def save_index(data: dict) -> None:
    INDEX_FILE.write_text(
        json.dumps(data, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def register_item(image_id: str, meta_path: Path) -> None:
    index_data = load_index()
    index_data[image_id] = str(meta_path.relative_to(BASE_DIR)).replace("\\", "/")
    save_index(index_data)


def get_meta_path(image_id: str) -> Path:
    index_data = load_index()
    rel = index_data.get(image_id)
    if not rel:
        raise HTTPException(status_code=404, detail="Imagem não encontrada.")
    meta_path = BASE_DIR / rel
    if not meta_path.exists():
        raise HTTPException(status_code=404, detail="Metadados não encontrados.")
    return meta_path


def read_meta(image_id: str) -> dict:
    meta_path = get_meta_path(image_id)
    return json.loads(meta_path.read_text(encoding="utf-8"))


def write_meta(meta: dict) -> None:
    meta_path = Path(meta["meta_path"])
    meta_path.write_text(
        json.dumps(meta, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def safe_stem(filename: str) -> str:
    stem = Path(filename).stem
    stem = re.sub(r"[^a-zA-Z0-9\-_]+", "-", stem).strip("-")
    return stem or "imagem"


def media_url(path: Path) -> str:
    rel = path.relative_to(STORAGE_DIR).as_posix()
    return f"/media/{rel}"


def decode_data_url(data_url: str) -> bytes:
    if not data_url.startswith("data:image"):
        raise ValueError("Formato de máscara inválido.")
    _, encoded = data_url.split(",", 1)
    return base64.b64decode(encoded)


def remove_background(raw_bytes: bytes) -> Image.Image:
    session = get_bg_session()
    result = remove(raw_bytes, session=session)
    return Image.open(BytesIO(result)).convert("RGBA")


def create_initial_mask_from_rgba(rgba_img: Image.Image) -> Image.Image:
    return rgba_img.getchannel("A").convert("L")


def apply_mask_to_isolated(isolated_rgba: Image.Image, mask_img: Image.Image) -> Image.Image:
    rgba = isolated_rgba.convert("RGBA").copy()
    alpha = mask_img.convert("L").resize(rgba.size, Image.LANCZOS)
    rgba.putalpha(alpha)
    return rgba


def compose_final_jpg(
    isolated_rgba: Image.Image,
    mask_img: Image.Image,
    output_size: int,
    margin_percent: int,
    zoom_percent: int,
    offset_x: int,
    offset_y: int,
    jpeg_quality: int,
) -> bytes:
    rgba = apply_mask_to_isolated(isolated_rgba, mask_img)

    bbox = rgba.getbbox()
    if bbox:
        rgba = rgba.crop(bbox)

    iw, ih = rgba.size
    if iw <= 0 or ih <= 0:
        raise ValueError("A imagem ficou vazia após a edição da máscara.")

    canvas = Image.new("RGB", (output_size, output_size), (255, 255, 255))

    margin_px = int(output_size * (margin_percent / 100))
    max_w = max(1, output_size - (margin_px * 2))
    max_h = max(1, output_size - (margin_px * 2))

    fit_scale = min(max_w / iw, max_h / ih)
    final_scale = fit_scale * (zoom_percent / 100.0)

    new_w = max(1, int(iw * final_scale))
    new_h = max(1, int(ih * final_scale))

    resized = rgba.resize((new_w, new_h), Image.LANCZOS)

    x = ((output_size - new_w) // 2) + offset_x
    y = ((output_size - new_h) // 2) + offset_y

    temp = Image.new("RGBA", (output_size, output_size), (255, 255, 255, 255))
    temp.paste(resized, (x, y), resized)

    output = BytesIO()
    temp.convert("RGB").save(output, format="JPEG", quality=jpeg_quality, optimize=True)
    output.seek(0)
    return output.read()


def build_public_item(meta: dict) -> dict:
    return {
        "image_id": meta["image_id"],
        "batch_id": meta["batch_id"],
        "filename": meta["filename"],
        "original_url": meta["original_url"],
        "isolated_url": meta["isolated_url"],
        "mask_url": meta["mask_url"],
        "preview_url": meta["preview_url"],
        "download_url": meta["download_url"],
        "params": meta["params"],
    }


def update_item_preview(
    meta: dict,
    *,
    margin_percent: int,
    zoom_percent: int,
    offset_x: int,
    offset_y: int,
    jpeg_quality: int,
    centralize: bool = False,
    mask_data_url: str | None = None,
) -> dict:
    meta_path = get_meta_path(meta["image_id"])
    item_dir = meta_path.parent

    isolated_path = item_dir / Path(meta["isolated_url"]).name
    mask_path = item_dir / Path(meta["mask_url"]).name
    preview_path = item_dir / Path(meta["preview_url"]).name

    isolated_rgba = Image.open(isolated_path).convert("RGBA")

    if mask_data_url:
        mask_bytes = decode_data_url(mask_data_url)
        mask_img = Image.open(BytesIO(mask_bytes)).convert("L").resize(
            isolated_rgba.size,
            Image.LANCZOS,
        )
        mask_img.save(mask_path)
    else:
        mask_img = Image.open(mask_path).convert("L")

    if centralize:
        offset_x = 0
        offset_y = 0

    edited_bytes = compose_final_jpg(
        isolated_rgba=isolated_rgba,
        mask_img=mask_img,
        output_size=1000,
        margin_percent=margin_percent,
        zoom_percent=zoom_percent,
        offset_x=offset_x,
        offset_y=offset_y,
        jpeg_quality=jpeg_quality,
    )
    preview_path.write_bytes(edited_bytes)

    meta["params"] = {
        "margin_percent": margin_percent,
        "zoom_percent": zoom_percent,
        "offset_x": offset_x,
        "offset_y": offset_y,
        "jpeg_quality": jpeg_quality,
    }
    write_meta(meta)
    return meta


@app.post("/api/process-preview")
async def process_preview(
    files: list[UploadFile] = File(...),
    margin_percent: int = Form(8),
    jpeg_quality: int = Form(95),
    zoom_percent: int = Form(100),
    offset_x: int = Form(0),
    offset_y: int = Form(0),
):
    try:
        if not files:
            return JSONResponse(
                status_code=400,
                content={"error": "Nenhum arquivo enviado."},
            )

        if len(files) > MAX_FILES_PER_BATCH:
            return JSONResponse(
                status_code=400,
                content={"error": f"Envie no máximo {MAX_FILES_PER_BATCH} imagens por vez."},
            )

        batch_id = uuid.uuid4().hex[:12]
        batch_dir = BATCHES_DIR / batch_id
        batch_dir.mkdir(parents=True, exist_ok=True)

        items = []
        valid_ext = {".jpg", ".jpeg", ".png", ".webp"}

        for file in files:
            ext = Path(file.filename).suffix.lower()
            if ext not in valid_ext:
                continue

            raw = await file.read()
            if not raw:
                continue

            print(f"Processando arquivo: {file.filename}")

            image_id = uuid.uuid4().hex[:12]
            item_dir = batch_dir / image_id
            item_dir.mkdir(parents=True, exist_ok=True)

            clean_name = safe_stem(file.filename)

            original_path = item_dir / f"{clean_name}{ext}"
            original_path.write_bytes(raw)

            isolated_rgba = remove_background(raw)
            print(f"Fundo removido: {file.filename}")

            isolated_path = item_dir / f"{clean_name}_isolated.png"
            isolated_rgba.save(isolated_path)

            mask_img = create_initial_mask_from_rgba(isolated_rgba)
            mask_path = item_dir / f"{clean_name}_mask.png"
            mask_img.save(mask_path)

            edited_bytes = compose_final_jpg(
                isolated_rgba=isolated_rgba,
                mask_img=mask_img,
                output_size=1000,
                margin_percent=margin_percent,
                zoom_percent=zoom_percent,
                offset_x=offset_x,
                offset_y=offset_y,
                jpeg_quality=jpeg_quality,
            )

            preview_path = item_dir / f"{clean_name}_1000x1000.jpg"
            preview_path.write_bytes(edited_bytes)
            print(f"Prévia final salva: {file.filename}")

            meta_path = item_dir / "meta.json"
            meta = {
                "meta_path": str(meta_path),
                "image_id": image_id,
                "batch_id": batch_id,
                "filename": file.filename,
                "original_url": media_url(original_path),
                "isolated_url": media_url(isolated_path),
                "mask_url": media_url(mask_path),
                "preview_url": media_url(preview_path),
                "download_url": f"/download/image/{image_id}",
                "params": {
                    "margin_percent": margin_percent,
                    "zoom_percent": zoom_percent,
                    "offset_x": offset_x,
                    "offset_y": offset_y,
                    "jpeg_quality": jpeg_quality,
                },
            }

            meta_path.write_text(
                json.dumps(meta, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            register_item(image_id, meta_path)
            items.append(build_public_item(meta))

        if not items:
            return JSONResponse(
                status_code=400,
                content={"error": "Nenhuma imagem válida foi processada."},
            )

        return {
            "success": True,
            "batch_id": batch_id,
            "zip_url": f"/download/zip/{batch_id}",
            "items": items,
        }

    except Exception as exc:
        print("Erro em /api/process-preview")
        print(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"error": f"Erro interno no processamento: {str(exc)}"},
        )


@app.post("/api/reprocess/{image_id}")
def reprocess_image(image_id: str, payload: ReprocessPayload):
    try:
        meta = read_meta(image_id)
        updated = update_item_preview(
            meta,
            margin_percent=payload.margin_percent,
            zoom_percent=payload.zoom_percent,
            offset_x=payload.offset_x,
            offset_y=payload.offset_y,
            jpeg_quality=payload.jpeg_quality,
            centralize=payload.centralize,
            mask_data_url=payload.mask_data_url,
        )
        return {"success": True, "item": build_public_item(updated)}
    except Exception as exc:
        print(f"Erro em /api/reprocess/{image_id}")
        print(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"error": f"Falha ao reprocessar a imagem: {str(exc)}"},
        )


@app.post("/api/reprocess-batch/{batch_id}")
def reprocess_batch(batch_id: str, payload: BatchReprocessPayload):
    try:
        batch_dir = BATCHES_DIR / batch_id
        if not batch_dir.exists():
            raise HTTPException(status_code=404, detail="Lote não encontrado.")

        target_ids = set(payload.image_ids)
        items = []

        for item_dir in sorted(batch_dir.iterdir()):
            if not item_dir.is_dir():
                continue

            meta_file = item_dir / "meta.json"
            if not meta_file.exists():
                continue

            meta = json.loads(meta_file.read_text(encoding="utf-8"))

            if target_ids and meta["image_id"] not in target_ids:
                continue

            updated = update_item_preview(
                meta,
                margin_percent=payload.margin_percent,
                zoom_percent=payload.zoom_percent,
                offset_x=payload.offset_x,
                offset_y=payload.offset_y,
                jpeg_quality=payload.jpeg_quality,
                centralize=payload.centralize,
                mask_data_url=None,
            )
            items.append(build_public_item(updated))

        return {"success": True, "items": items}
    except Exception as exc:
        print(f"Erro em /api/reprocess-batch/{batch_id}")
        print(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"error": f"Falha ao reprocessar o lote: {str(exc)}"},
        )


@app.get("/download/image/{image_id}")
def download_image(image_id: str):
    meta = read_meta(image_id)
    meta_path = get_meta_path(image_id)
    item_dir = meta_path.parent
    preview_path = item_dir / Path(meta["preview_url"]).name

    if not preview_path.exists():
        raise HTTPException(status_code=404, detail="Arquivo não encontrado.")

    base_name = safe_stem(meta["filename"])
    return FileResponse(
        path=preview_path,
        media_type="image/jpeg",
        filename=f"{base_name}_1000x1000.jpg",
    )


@app.get("/download/zip/{batch_id}")
def download_zip(batch_id: str):
    batch_dir = BATCHES_DIR / batch_id
    if not batch_dir.exists():
        raise HTTPException(status_code=404, detail="Lote não encontrado.")

    zip_path = batch_dir / f"{batch_id}.zip"

    with ZipFile(zip_path, "w", ZIP_DEFLATED) as zipf:
        for item_dir in sorted(batch_dir.iterdir()):
            if not item_dir.is_dir():
                continue

            meta_file = item_dir / "meta.json"
            if not meta_file.exists():
                continue

            meta = json.loads(meta_file.read_text(encoding="utf-8"))
            preview_path = item_dir / Path(meta["preview_url"]).name

            if preview_path.exists():
                name = f"{safe_stem(meta['filename'])}_1000x1000.jpg"
                zipf.write(preview_path, arcname=name)

    return FileResponse(
        path=zip_path,
        media_type="application/zip",
        filename=f"photopeg-lote-{batch_id}.zip",
    )
