from typing import Optional
import uuid 
import json 
from datetime import datetime, timedelta, timezone
import redis.asyncio as redis
from back.db.config import REDIS_CLIENT_URL

redis_client = redis.from_url(REDIS_CLIENT_URL)

DRAFT_TTL = 60 * 60 * 24 * 30 

