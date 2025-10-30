from typing import Optional
import uuid 
import json 
from datetime import datetime, timedelta, timezone
import redis.asyncio as redis

redis_client = redis.from_url("redis://localhost:6379/0")

DRAFT_TTL = 60 * 60 * 24 * 30 # 30 дней

def make_draft_key(user_id: int, draft_id: str) -> str:
    return f"draft:task:{user_id}:{draft_id}"


async def save_draft(user_id: int,payload: dict,draft_id: Optional[str] =None) -> str:
    did = draft_id or str(uuid.uuid4())
    key = make_draft_key(user_id, did)
    payload_copy = payload.copy()
    payload_copy["_saved_at"] = datetime.now(timezone.utc).isoformat()
    await redis_client.set(key, json.dumps(payload_copy), ex=DRAFT_TTL)
    return did
    


async def get_draft(user_id: int, draft_id: str) -> Optional[dict]:
    key = make_draft_key(user_id, draft_id)
    raw = await redis_client.get(key)
    if not raw:
        return None
    return json.loads(raw)


async def delete_draft(user_id: int, draft_id: str) -> bool:
    key = make_draft_key(user_id, draft_id)
    return await redis_client.delete(key) == 1


