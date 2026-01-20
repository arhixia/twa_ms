import asyncio
from PIL import Image
from io import BytesIO
import hashlib
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from back.db.database import SessionLocal, get_db
from back.db.models import TaskAttachment
from back.utils.selectel import get_s3_client
from datetime import datetime, timezone


SUPPORTED_IMAGE_MIME_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/tiff",
    "image/heif",
    "image/heic",
}


THUMB_WIDTH = 320


async def validate_and_process_attachment(attachment_id: int):
    async with SessionLocal() as db:
        async with db.begin():
            att = (
                await db.execute(
                    select(TaskAttachment).where(TaskAttachment.id == attachment_id)
                )
            ).scalars().first()

            if not att:
                print(f"[PROCESS] attachment {attachment_id} not found")
                return

            print(f"[PROCESS] start {att.storage_key}")
            s3 = get_s3_client()

            # ---------- 1. HEAD ----------
            try:
                meta = await s3.head_object(att.storage_key)
            except Exception as e:
                att.error_text = f"head_object failed: {e}"
                att.processed = False
                return

            ctype = meta.get("ContentType") or att.mime_type
            if ctype not in SUPPORTED_IMAGE_MIME_TYPES:
                att.error_text = f"unsupported content-type: {ctype}"
                att.processed = False
                return

            # ---------- 2. DOWNLOAD ----------
            try:
                async with s3.get_client() as client:
                    resp = await client.get_object(
                        Bucket=s3.bucket_name,
                        Key=att.storage_key
                    )
                    data = await resp["Body"].read()
            except Exception as e:
                att.error_text = f"download failed: {e}"
                att.processed = False
                return

            # ---------- 3. CHECKSUM ----------
            att.checksum = hashlib.sha256(data).hexdigest()
            att.size = len(data)

            # ---------- 4. THUMB ----------
            thumb_key = None
            try:
                im = Image.open(BytesIO(data))

                if im.mode != "RGB":
                    im = im.convert("RGB")

                im.thumbnail((THUMB_WIDTH, THUMB_WIDTH))

                buf = BytesIO()
                im.save(buf, "WEBP", quality=80)
                buf.seek(0)

                thumb_key = f"{att.storage_key}.thumb.webp"

                await s3.put_object(
                    thumb_key,
                    buf.read(),
                    content_type="image/webp",
                    content_disposition="inline",
                )

                # 🔒 гарантия существования
                await s3.head_object(thumb_key)

                att.thumb_key = thumb_key
                print(f"[PROCESS] thumb ok {thumb_key}")

            except Exception as e:
                # ⚠️ ВАЖНО: thumb не удался, но файл валиден
                att.thumb_key = None
                att.error_text = f"thumbnail failed: {e}"
                print(f"[PROCESS] thumb failed: {e}")

            # ---------- 5. FINAL ----------
            att.processed = True
            if not att.error_text:
                att.error_text = None

            print(
                f"[PROCESS] done id={att.id} "
                f"processed={att.processed} "
                f"thumb={'yes' if att.thumb_key else 'no'}"
            )


            


async def delete_object_from_s3(storage_key: str, thumb_key: str = None):
    s3 = get_s3_client()
    try:
        await s3.delete_object(storage_key)
        print(f"[S3_DELETE] Main object deleted: {storage_key}")
    except Exception as e:
        print(f"[S3_DELETE_ERROR] Failed to delete main object {storage_key}: {e}")

    if thumb_key:
        try:
            await s3.delete_object(thumb_key)
            print(f"[S3_DELETE] Thumbnail deleted: {thumb_key}")
        except Exception as e:
            print(f"[S3_DELETE_ERROR] Failed to delete thumbnail {thumb_key}: {e}")
