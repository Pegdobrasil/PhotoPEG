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
from pydantic import BaseModel
from rembg import new_session, remove

app = FastAPI(title="PhotoPEG Studio PRO")

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
DEFAULT_OUTPUT_WIDTH = 1000
DEFAULT_OUTPUT_HEIGHT = 1000
DEFAULT_MARGIN_PERCENT = 8
DEFAULT_JPEG_QUALITY = 95

bg_session = None


class SaveEditedPayload(BaseModel):
    data_url: str


class RenameImagePayload(BaseModel):
    new_name: str


@app.on_event("startup")
def warmup_model():
    try:
        get_bg_session()
        print("Modelo rembg carregado no startup.")
    except Exception as exc:
        print(f"Falha ao aquecer rembg: {exc}")


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


def safe_stem(filename: str) -> str:
    stem = Path(filename).stem
    stem = re.sub(r"[^a-zA-Z0-9\-_]+", "-", stem).strip("-")
    return stem or "imagem"


def safe_filename_base(name: str) -> str:
    name = re.sub(r"\.[a-zA-Z0-9]+$", "", (name or "").strip())
    name = re.sub(r"[^a-zA-Z0-9\-_ ]+", "", name)
    name = re.sub(r"\s+", "-", name).strip("-_ ")
    return name or "imagem"


def media_url(path: Path) -> str:
    rel = path.relative_to(STORAGE_DIR).as_posix()
    return f"/media/{rel}"


def remove_background(raw_bytes: bytes) -> Image.Image:
    session = get_bg_session()
    result = remove(raw_bytes, session=session)
    return Image.open(BytesIO(result)).convert("RGBA")


def normalize_output_options(
    output_format: str,
    background_mode: str,
    output_width: int,
    output_height: int,
) -> tuple[str, str, int, int]:
    output_format = (output_format or "jpg").lower().strip()
    background_mode = (background_mode or "white").lower().strip()

    if output_format not in {"jpg", "png"}:
        output_format = "jpg"

    if background_mode not in {"white", "transparent"}:
        background_mode = "white"

    if output_format == "jpg":
        background_mode = "white"

    output_width = max(100, min(5000, int(output_width)))
    output_height = max(100, min(5000, int(output_height)))

    return output_format, background_mode, output_width, output_height


def compose_output_image(
    isolated_rgba: Image.Image,
    output_width: int,
    output_height: int,
    margin_percent: int,
    output_format: str,
    background_mode: str,
    jpeg_quality: int = DEFAULT_JPEG_QUALITY,
) -> tuple[bytes, str, str]:
    bbox = isolated_rgba.getbbox()
    if bbox:
        isolated_rgba = isolated_rgba.crop(bbox)

    iw, ih = isolated_rgba.size
    if iw <= 0 or ih <= 0:
        raise ValueError("A imagem ficou vazia após a remoção de fundo.")

    margin_x = int(output_width * (margin_percent / 100))
    margin_y = int(output_height * (margin_percent / 100))

    max_w = max(1, output_width - (margin_x * 2))
    max_h = max(1, output_height - (margin_y * 2))

    fit_scale = min(max_w / iw, max_h / ih)
    new_w = max(1, int(iw * fit_scale))
    new_h = max(1, int(ih * fit_scale))

    resized = isolated_rgba.resize((new_w, new_h), Image.LANCZOS)

    x = (output_width - new_w) // 2
    y = (output_height - new_h) // 2

    if background_mode == "transparent" and output_format == "png":
        canvas = Image.new("RGBA", (output_width, output_height), (255, 255, 255, 0))
        canvas.paste(resized, (x, y), resized)

        output = BytesIO()
        canvas.save(output, format="PNG", optimize=True)
        output.seek(0)
        return output.read(), "png", "image/png"

    canvas = Image.new("RGBA", (output_width, output_height), (255, 255, 255, 255))
    canvas.paste(resized, (x, y), resized)

    if output_format == "png":
        output = BytesIO()
        canvas.save(output, format="PNG", optimize=True)
        output.seek(0)
        return output.read(), "png", "image/png"

    output = BytesIO()
    canvas.convert("RGB").save(output, format="JPEG", quality=jpeg_quality, optimize=True)
    output.seek(0)

    return output.read(), "jpg", "image/jpeg"


def decode_data_url(data_url: str) -> bytes:
    if "," not in data_url:
        raise ValueError("Data URL inválida.")
    _, encoded = data_url.split(",", 1)
    return base64.b64decode(encoded)


def load_batch_meta(batch_dir: Path) -> dict:
    meta_path = batch_dir / "batch.json"
    if not meta_path.exists():
        return {}
    return json.loads(meta_path.read_text(encoding="utf-8"))


def save_batch_meta(batch_dir: Path, meta: dict) -> None:
    meta_path = batch_dir / "batch.json"
    meta_path.write_text(
        json.dumps(meta, ensure_ascii=False, indent=2),
        encoding="utf-8"
    )


def image_bytes_to_pil(raw: bytes) -> Image.Image:
    return Image.open(BytesIO(raw))


def pil_to_bytes(img: Image.Image, suffix: str) -> tuple[bytes, str]:
    out = BytesIO()
    suffix = suffix.lower()

    if suffix == ".png":
        img.save(out, format="PNG", optimize=True)
        return out.getvalue(), "image/png"

    img.convert("RGB").save(out, format="JPEG", quality=95, optimize=True)
    return out.getvalue(), "image/jpeg"


@app.post("/api/process-batch")
async def process_batch(
    files: list[UploadFile] = File(...),
    margin_percent: int = Form(DEFAULT_MARGIN_PERCENT),
    jpeg_quality: int = Form(DEFAULT_JPEG_QUALITY),
    output_format: str = Form("jpg"),
    background_mode: str = Form("white"),
    output_width: int = Form(DEFAULT_OUTPUT_WIDTH),
    output_height: int = Form(DEFAULT_OUTPUT_HEIGHT),
):
    try:
        if not files:
            return JSONResponse(status_code=400, content={"error": "Nenhum arquivo enviado."})

        if len(files) > MAX_FILES_PER_BATCH:
            return JSONResponse(
                status_code=400,
                content={"error": f"Envie no máximo {MAX_FILES_PER_BATCH} imagens por vez."},
            )

        output_format, background_mode, output_width, output_height = normalize_output_options(
            output_format=output_format,
            background_mode=background_mode,
            output_width=output_width,
            output_height=output_height,
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

            original_base_name = safe_stem(file.filename)
            image_id = uuid.uuid4().hex[:10]
            item_dir = batch_dir / image_id
            item_dir.mkdir(parents=True, exist_ok=True)

            original_path = item_dir / f"{original_base_name}_original{ext if ext != '.webp' else '.png'}"
            if ext == ".webp":
                original_img = image_bytes_to_pil(raw).convert("RGBA")
                original_img.save(original_path.with_suffix(".png"))
                original_path = original_path.with_suffix(".png")
            else:
                original_path.write_bytes(raw)

            isolated_rgba = remove_background(raw)

            isolated_path = item_dir / f"{original_base_name}_isolated.png"
            isolated_rgba.save(isolated_path)

            alpha_mask = isolated_rgba.getchannel("A").convert("L")
            mask_path = item_dir / f"{original_base_name}_mask.png"
            alpha_mask.save(mask_path)

            final_bytes, final_ext, media_type = compose_output_image(
                isolated_rgba=isolated_rgba,
                output_width=output_width,
                output_height=output_height,
                margin_percent=margin_percent,
                output_format=output_format,
                background_mode=background_mode,
                jpeg_quality=jpeg_quality,
            )

            output_filename = f"{original_base_name}_{output_width}x{output_height}.{final_ext}"
            output_path = item_dir / output_filename
            output_path.write_bytes(final_bytes)

            processed_items.append(
                {
                    "image_id": image_id,
                    "filename": file.filename,
                    "display_name": output_filename,
                    "output_filename": output_filename,
                    "preview_url": media_url(output_path),
                    "download_url": f"/download/image/{batch_id}/{image_id}",
                    "original_url": media_url(original_path),
                    "isolated_url": media_url(isolated_path),
                    "mask_url": media_url(mask_path),
                    "save_url": f"/api/save-edited/{batch_id}/{image_id}",
                    "rename_url": f"/api/rename-image/{batch_id}/{image_id}",
                    "output_format": final_ext,
                    "background_mode": background_mode,
                    "output_width": output_width,
                    "output_height": output_height,
                    "media_type": media_type,
                }
            )

        if not processed_items:
            return JSONResponse(
                status_code=400,
                content={"error": "Nenhuma imagem válida foi processada."},
            )

        meta = {
            "batch_id": batch_id,
            "count": len(processed_items),
            "items": processed_items,
            "output_format": output_format,
            "background_mode": background_mode,
            "output_width": output_width,
            "output_height": output_height,
        }
        save_batch_meta(batch_dir, meta)

        return {
            "success": True,
            "batch_id": batch_id,
            "count": len(processed_items),
            "items": processed_items,
            "output_format": output_format,
            "background_mode": background_mode,
            "output_width": output_width,
            "output_height": output_height,
        }

    except Exception as exc:
        print("Erro em /api/process-batch")
        print(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"error": f"Erro interno no processamento: {str(exc)}"},
        )


@app.post("/api/save-edited/{batch_id}/{image_id}")
async def save_edited(batch_id: str, image_id: str, payload: SaveEditedPayload):
    try:
        batch_dir = BATCHES_DIR / batch_id
        if not batch_dir.exists():
            raise HTTPException(status_code=404, detail="Lote não encontrado.")

        item_dir = batch_dir / image_id
        if not item_dir.exists():
            raise HTTPException(status_code=404, detail="Imagem não encontrada.")

        existing_files = (
            list(item_dir.glob("*.jpg"))
            + list(item_dir.glob("*.jpeg"))
            + list(item_dir.glob("*.png"))
        )

        final_candidates = [
            f for f in existing_files
            if "_isolated" not in f.name and "_mask" not in f.name and "_original" not in f.name
        ]
        if not final_candidates:
            raise HTTPException(status_code=404, detail="Arquivo final não encontrado.")

        file_path = final_candidates[0]
        raw = decode_data_url(payload.data_url)
        ext = file_path.suffix.lower()

        img = Image.open(BytesIO(raw))
        out_bytes, media_type = pil_to_bytes(img.convert("RGBA" if ext == ".png" else "RGB"), ext)
        file_path.write_bytes(out_bytes)

        return {
            "success": True,
            "preview_url": media_url(file_path),
            "download_url": f"/download/image/{batch_id}/{image_id}",
            "media_type": media_type,
        }

    except Exception as exc:
        print("Erro em /api/save-edited")
        print(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"error": f"Falha ao salvar a imagem editada: {str(exc)}"},
        )


@app.post("/api/rename-image/{batch_id}/{image_id}")
async def rename_image(batch_id: str, image_id: str, payload: RenameImagePayload):
    try:
        batch_dir = BATCHES_DIR / batch_id
        if not batch_dir.exists():
            raise HTTPException(status_code=404, detail="Lote não encontrado.")

        item_dir = batch_dir / image_id
        if not item_dir.exists():
            raise HTTPException(status_code=404, detail="Imagem não encontrada.")

        files = list(item_dir.glob("*.jpg")) + list(item_dir.glob("*.jpeg")) + list(item_dir.glob("*.png"))
        final_files = [f for f in files if "_isolated" not in f.name and "_mask" not in f.name and "_original" not in f.name]

        if not final_files:
            raise HTTPException(status_code=404, detail="Arquivo final não encontrado.")

        old_file = final_files[0]
        ext = old_file.suffix.lower()
        base_name = safe_filename_base(payload.new_name)
        new_file_name = f"{base_name}{ext}"
        new_file = item_dir / new_file_name

        if old_file.name != new_file.name:
            old_file.rename(new_file)

        meta = load_batch_meta(batch_dir)
        items = meta.get("items", [])
        for item in items:
            if item.get("image_id") == image_id:
                item["display_name"] = new_file_name
                item["output_filename"] = new_file_name
                item["preview_url"] = media_url(new_file)
                item["download_url"] = f"/download/image/{batch_id}/{image_id}"
                break
        if meta:
            save_batch_meta(batch_dir, meta)

        return {
            "success": True,
            "display_name": new_file_name,
            "output_filename": new_file_name,
            "preview_url": media_url(new_file),
            "download_url": f"/download/image/{batch_id}/{image_id}",
        }

    except Exception as exc:
        print("Erro em /api/rename-image")
        print(traceback.format_exc())
        return JSONResponse(
            status_code=500,
            content={"error": f"Falha ao renomear o arquivo: {str(exc)}"},
        )


@app.get("/download/image/{batch_id}/{image_id}")
def download_image(batch_id: str, image_id: str):
    batch_dir = BATCHES_DIR / batch_id
    if not batch_dir.exists():
        raise HTTPException(status_code=404, detail="Lote não encontrado.")

    item_dir = batch_dir / image_id
    if not item_dir.exists():
        raise HTTPException(status_code=404, detail="Imagem não encontrada.")

    files = list(item_dir.glob("*.jpg")) + list(item_dir.glob("*.jpeg")) + list(item_dir.glob("*.png"))
    final_files = [f for f in files if "_isolated" not in f.name and "_mask" not in f.name and "_original" not in f.name]

    if not final_files:
        raise HTTPException(status_code=404, detail="Arquivo final não encontrado.")

    file_path = final_files[0]
    ext = file_path.suffix.lower()
    media_type = "image/png" if ext == ".png" else "image/jpeg"

    return FileResponse(
        path=file_path,
        media_type=media_type,
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
            files = list(item_dir.glob("*.jpg")) + list(item_dir.glob("*.jpeg")) + list(item_dir.glob("*.png"))
            final_files = [f for f in files if "_isolated" not in f.name and "_mask" not in f.name and "_original" not in f.name]
            for final_file in final_files:
                zipf.write(final_file, arcname=final_file.name)

    return FileResponse(
        path=zip_path,
        media_type="application/zip",
        filename=f"photopeg-lote-{batch_id}.zip",
    )
