from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class FileOut(BaseModel):
    id: str
    ontology_id: str
    filename: str
    file_size: int
    mime_type: Optional[str]
    created_at: datetime
    model_config = {"from_attributes": True}
