from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List

class ModelConfigCreate(BaseModel):
    name: str
    provider: str  # openai|anthropic|compatible
    api_key: Optional[str] = None
    api_base: Optional[str] = None
    models: List[str] = []

class ModelConfigUpdate(BaseModel):
    name: Optional[str] = None
    api_key: Optional[str] = None
    api_base: Optional[str] = None
    models: Optional[List[str]] = None

class ModelConfigOut(BaseModel):
    id: str
    name: str
    provider: str
    api_base: Optional[str]
    models: List[str]
    created_by: str
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}
