"""Utilities for handling uploaded profile photos."""

from __future__ import annotations

import uuid
from pathlib import Path
from typing import Collection, Mapping

import aiofiles
from fastapi import HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError

MAX_PHOTO_SIZE = 5 * 1024 * 1024  # 5MB
CHUNK_SIZE = 1024 * 1024  # 1MB
PHOTO_TYPE_MAP: Mapping[str, str] = {
    "jpeg": "image/jpeg",
    "png": "image/png",
}
ALLOWED_PHOTO_TYPES: Collection[str] = frozenset(PHOTO_TYPE_MAP.values())


async def save_photo_upload(
    file: UploadFile,
    destination_dir: Path,
    *,
    chunk_size: int = CHUNK_SIZE,
    max_size: int = MAX_PHOTO_SIZE,
    allowed_content_types: Collection[str] = ALLOWED_PHOTO_TYPES,
    photo_type_map: Mapping[str, str] = PHOTO_TYPE_MAP,
) -> str:
    """Persist an uploaded image to ``destination_dir``.

    The uploaded file is streamed to disk to avoid loading large files into
    memory. Only PNG and JPEG images are accepted. The caller can override the
    chunk size, maximum file size, and allowed content types to customize the
    behaviour for a specific endpoint.
    """

    if file.content_type not in allowed_content_types:
        raise HTTPException(status_code=415, detail="Unsupported media type")

    destination_dir.mkdir(parents=True, exist_ok=True)
    suffix = Path(file.filename).suffix if file.filename else ""
    filename = f"{uuid.uuid4().hex}{suffix}"
    filepath = destination_dir / filename

    size = 0
    try:
        async with aiofiles.open(filepath, "wb") as buffer:
            while True:
                chunk = await file.read(chunk_size)
                if not chunk:
                    break
                size += len(chunk)
                if size > max_size:
                    raise HTTPException(
                        status_code=413, detail="Uploaded file too large"
                    )
                await buffer.write(chunk)
    except Exception:
        filepath.unlink(missing_ok=True)
        raise

    try:
        with Image.open(filepath) as img:
            detected_format = (img.format or "").lower()
            img.verify()
    except (UnidentifiedImageError, OSError):
        filepath.unlink(missing_ok=True)
        raise HTTPException(status_code=415, detail="Unsupported media type")

    detected_mime = photo_type_map.get(detected_format)
    if detected_mime not in allowed_content_types:
        filepath.unlink(missing_ok=True)
        raise HTTPException(status_code=415, detail="Unsupported media type")

    return filename
