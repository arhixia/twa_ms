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

THUMB_WIDTH = 320


async def validate_and_process_attachment(attachment_id: int):
    async with SessionLocal() as db:  # ✅ Так правильно
        async with db.begin():
            att = (await db.execute(
                select(TaskAttachment).where(TaskAttachment.id == attachment_id)
            )).scalars().first()
            if not att:
                return
            s3 = get_s3_client()

            # head
            try:
                meta = await s3.head_object(att.storage_key)
            except Exception as e:
                att.error_text = f"S3 head failed: {e}"
                await db.flush()
                return

            # check content-type
            ctype = meta.get("ContentType") or att.mime_type
            if ctype not in ("image/jpeg", "image/png", "image/webp", "image/jpg"):
                att.error_text = f"Invalid content type: {ctype}"
                await db.flush()
                return

            # download object
            try:
                async with s3.get_client() as client:
                    resp = await client.get_object(Bucket=s3.bucket_name, Key=att.storage_key)
                    body_stream = resp["Body"]
                    data = await body_stream.read()
            except Exception as e:
                att.error_text = f"S3 get failed: {e}"
                await db.flush()
                return

            # compute checksum
            sha = hashlib.sha256()
            sha.update(data)
            att.checksum = sha.hexdigest()
            att.size = len(data)

            # generate thumbnail
            try:
                im = Image.open(BytesIO(data))
                # конвертация только если нужно
                if im.mode in ("RGBA", "LA", "P"):
                    im = im.convert("RGB")
                im.thumbnail((320, 320))
                buf = BytesIO()
                im.save(buf, format="WEBP", quality=80)
                buf.seek(0)
                thumb_bytes = buf.read()
                thumb_key = att.storage_key + ".thumb.webp"
                await s3.put_object(
                    thumb_key,
                    thumb_bytes,
                    content_type="image/webp",
                    content_disposition="inline"
                )
                att.thumb_key = thumb_key
            except Exception as e:
                att.error_text = f"Thumb generation failed: {e}"

            att.processed = True
            att.error_text = att.error_text or None
            await db.flush()


async def delete_object_from_s3(storage_key: str):
    s3 = get_s3_client()
    try:
        await s3.delete_object(storage_key)
    except Exception:
        # логировать, но не бросать
        pass
