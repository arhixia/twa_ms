from contextlib import asynccontextmanager
from pathlib import Path
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from aiobotocore.session import get_session
from back.db.config import ACCESS_KEY_S3, SECRET_KEY_S3, ENDPOINT_URL_S3, BUCKET_NAME_S3
import asyncio 
from uuid import uuid4

DEFAULT_PART_SIZE = 50 * 1024 * 1024  # 50 MiB
ALLOWED_IMAGE_MIMES = {"image/jpeg", "image/png", "image/webp"}


class S3Client:
    def __init__(
        self,
        access_key: str,
        secret_key: str,
        endpoint_url: str,
        bucket_name: str,
        region_name: Optional[str] = None,
        part_size: int = DEFAULT_PART_SIZE,
    ):
        self.access_key = access_key
        self.secret_key = secret_key
        self.endpoint_url = endpoint_url
        self.bucket_name = bucket_name
        self.region_name = region_name
        self.part_size = int(part_size)
        self.session = get_session()

    @asynccontextmanager
    async def get_client(self):
        # передаём aws_access_key_id и aws_secret_access_key явно, endpoint_url отдельно
        async with self.session.create_client(
            "s3",
            aws_access_key_id=self.access_key,
            aws_secret_access_key=self.secret_key,
            endpoint_url=self.endpoint_url,
            region_name=self.region_name,
        ) as client:
            yield client

    # ========== Simple upload (put_object) - fallback для небольших файлов ==========
    async def put_object(
    self,
    key: str,
    data: bytes,
    content_type: Optional[str] = None,
    content_disposition: Optional[str] = None,
) -> Dict[str, Any]:
        async with self.get_client() as client:
            params = {
                "Bucket": self.bucket_name,
                "Key": key,
                "Body": data,
            }

            # выставляем правильные типы
            if content_type:
                params["ContentType"] = content_type

            # для изображений — показывать inline, а не attachment
            if content_disposition:
                params["ContentDisposition"] = content_disposition
            elif content_type and content_type.startswith("image/"):
                params["ContentDisposition"] = "inline"

            resp = await client.put_object(**params)
            return resp

    # ========== Create multipart upload ==========
    async def create_multipart_upload(self, key: str, content_type: Optional[str] = None) -> str:
        async with self.get_client() as client:
            params = {"Bucket": self.bucket_name, "Key": key}
            if content_type:
                params["ContentType"] = content_type
            resp = await client.create_multipart_upload(**params)
            upload_id = resp.get("UploadId")
            return upload_id

    # ========== Generate presigned URL for a given operation ==========
    async def _generate_presigned_url(self, client, method_name: str, params: dict, expires_in: int = 900) -> str:
        # aiobotocore client.generate_presigned_url может быть coroutine — await it
        url = client.generate_presigned_url(ClientMethod=method_name, Params=params, ExpiresIn=expires_in)
        if asyncio.iscoroutine(url):
            url = await url
        return url

    # ========== Generate presigned URL for a specific part upload ==========
    async def presign_part_upload(self, key: str, upload_id: str, part_number: int, expires: int = 900) -> str:
        async with self.get_client() as client:
            params = {"Bucket": self.bucket_name, "Key": key, "UploadId": upload_id, "PartNumber": part_number}
            url = await self._generate_presigned_url(client, "upload_part", params, expires)
            return url

    # ========== Complete multipart upload ==========
    async def complete_multipart_upload(self, key: str, upload_id: str, parts: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        parts: list of {"PartNumber": int, "ETag": str}
        """
        async with self.get_client() as client:
            multipart = {"Parts": [{"ETag": p["ETag"], "PartNumber": int(p["PartNumber"])} for p in parts]}
            resp = await client.complete_multipart_upload(
                Bucket=self.bucket_name,
                Key=key,
                MultipartUpload=multipart,
                UploadId=upload_id,
            )
            return resp

    # ========== Abort multipart upload ==========
    async def abort_multipart_upload(self, key: str, upload_id: str) -> None:
        async with self.get_client() as client:
            await client.abort_multipart_upload(Bucket=self.bucket_name, Key=key, UploadId=upload_id)

    # ========== Head object (get metadata) ==========
    async def head_object(self, key: str) -> Dict[str, Any]:
        async with self.get_client() as client:
            resp = await client.head_object(Bucket=self.bucket_name, Key=key)
            return resp

    # ========== Generate presigned GET URL ==========
    async def presign_get(self, key: str, expires: int = 3600) -> str:
        async with self.get_client() as client:
            params = {"Bucket": self.bucket_name, "Key": key}
            url = await self._generate_presigned_url(client, "get_object", params, expires)
            return url

    # ========== Delete object ==========
    async def delete_object(self, key: str) -> Dict[str, Any]:
        async with self.get_client() as client:
            resp = await client.delete_object(Bucket=self.bucket_name, Key=key)
            return resp

    # ========== Helpers for client-side multipart presign response ==========
    def compute_parts(self, total_size: int) -> Dict[str, Any]:
        """
        Compute number of parts given total_size and self.part_size.
        Returns dict: { "part_size": int, "parts_count": int, "parts": [1..N] }
        """
        if total_size <= 0:
            raise ValueError("total_size must be > 0")
        parts_count = (total_size + self.part_size - 1) // self.part_size
        return {"part_size": self.part_size, "parts_count": int(parts_count), "parts": list(range(1, int(parts_count) + 1))}

    def key_for_task(self, task_id: int, original_filename: str) -> str:
        """
        Ключ для вложения задачи: tasks/{task_id}/{YYYY}/{MM}/{DD}/{uuid4}{ext}
        """
    
        now = datetime.now(timezone.utc)
        ext = Path(original_filename).suffix or ""
        key = f"tasks/{task_id}/{now.year:04d}/{now.month:02d}/{now.day:02d}/{uuid4().hex}{ext}"
        return key

    def key_for_report_attachment(self, task_id: int, report_id: int, original_filename: str) -> str:
        """
        Ключ для вложения отчёта: reports/{task_id}/{report_id}/{uuid4}{ext}
        """
       
        now = datetime.now(timezone.utc)
        ext = Path(original_filename).suffix or ""
        key = f"reports/{task_id}/{report_id}/{uuid4().hex}{ext}"
        return key


# ========== Factory for app usage ==========
_default_s3_client: Optional[S3Client] = None


def get_s3_client() -> S3Client:
    global _default_s3_client
    if _default_s3_client is None:
        _default_s3_client = S3Client(
            access_key=ACCESS_KEY_S3,
            secret_key=SECRET_KEY_S3,
            endpoint_url=ENDPOINT_URL_S3,  
            bucket_name=BUCKET_NAME_S3,    
            region_name="ru-1",  
            part_size=DEFAULT_PART_SIZE,
        )
    return _default_s3_client




