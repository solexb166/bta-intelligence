from pydantic import BaseModel
from typing import List, Optional


# ChatRequest
class ChatRequest(BaseModel):
    message: str
    history: Optional[List[dict]] = []


# ChatResponse
class ChatResponse(BaseModel):
    reply: str
    chart_data: Optional[dict] = None
