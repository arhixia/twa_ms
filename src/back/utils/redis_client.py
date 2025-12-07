from typing import Optional
import uuid 
import json 
from datetime import datetime, timedelta, timezone
import redis.asyncio as redis

redis_client = redis.from_url("redis://localhost:6379/0")

DRAFT_TTL = 60 * 60 * 24 * 30 



