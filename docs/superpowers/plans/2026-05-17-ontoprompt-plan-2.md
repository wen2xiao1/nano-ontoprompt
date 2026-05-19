# OntoPrompt Implementation Plan — Part 2 (Slices 5–7)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Prerequisite: Part 1 must be complete.

**Goal:** File upload with MarkItDown conversion, Prompt CRUD with built-in templates, Model config management with connectivity test.

**Tech Stack additions:** MarkItDown, python-multipart, cryptography (Fernet)

---

## File Map (Part 2)

```
backend/
  app/
    models/
      prompt.py
      model_config.py
      uploaded_file.py
    schemas/
      prompt.py
      model_config.py
      file.py
    routers/
      files.py
      prompts.py
      models.py   (model_configs — avoid clash with pydantic)
    services/
      document_service.py
      encryption_service.py
  tests/
    test_files.py
    test_prompts.py
    test_models.py
frontend/
  src/
    api/
      prompts.ts
      models.ts
      files.ts
    types/
      prompt.ts
      model.ts
    pages/
      ontologies/create/
        OntologyCreatePage.tsx
        StepUpload.tsx
        StepPromptModel.tsx
        StepProgress.tsx   (stub — wired in Part 3)
      prompts/
        PromptListPage.tsx
        PromptCreatePage.tsx
        PromptDetailPage.tsx
      models/
        ModelsPage.tsx
```

---

## Task 6: File Upload + MarkItDown

**Files:**
- Create: `backend/app/models/uploaded_file.py`
- Create: `backend/app/schemas/file.py`
- Create: `backend/app/services/document_service.py`
- Create: `backend/app/routers/files.py`
- Create: `backend/tests/test_files.py`
- Create: `frontend/src/components/FileDropzone.tsx`
- Create: `frontend/src/api/files.ts`
- Create: `frontend/src/pages/ontologies/create/StepUpload.tsx`

- [ ] **Step 6.1: Add MarkItDown to requirements.txt**

```
markitdown[all]==0.1.0
```

Then run: `pip install -r requirements.txt`

- [ ] **Step 6.2: Create backend/app/models/uploaded_file.py**

```python
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey, Text, Integer
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class UploadedFile(Base):
    __tablename__ = "uploaded_files"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    ontology_id: Mapped[str] = mapped_column(String, ForeignKey("ontology_projects.id", ondelete="CASCADE"))
    filename: Mapped[str] = mapped_column(String(500))
    file_path: Mapped[str] = mapped_column(String(1000))
    file_size: Mapped[int] = mapped_column(Integer)
    mime_type: Mapped[str] = mapped_column(String(200))
    converted_md: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
```

- [ ] **Step 6.3: Create backend/app/services/document_service.py**

```python
import os, shutil
from pathlib import Path
from app.config import settings

ALLOWED_EXTENSIONS = {".md",".pdf",".doc",".docx",".xls",".xlsx",".csv",".ppt",".pptx",".png",".jpg",".jpeg"}
MAX_TOTAL_SIZE = 100 * 1024 * 1024  # 100MB

def save_upload(file_bytes: bytes, filename: str, ontology_id: str) -> str:
    dest_dir = Path(settings.uploads_dir) / "documents" / ontology_id
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / filename
    dest.write_bytes(file_bytes)
    return str(dest)

def convert_to_markdown(file_path: str) -> str:
    ext = Path(file_path).suffix.lower()
    if ext == ".md":
        return Path(file_path).read_text(encoding="utf-8", errors="replace")
    try:
        from markitdown import MarkItDown
        md = MarkItDown()
        result = md.convert(file_path)
        return result.text_content
    except Exception as e:
        return f"[Conversion failed: {e}]"

def validate_extension(filename: str) -> bool:
    return Path(filename).suffix.lower() in ALLOWED_EXTENSIONS
```

- [ ] **Step 6.4: Create backend/app/schemas/file.py**

```python
from pydantic import BaseModel
from datetime import datetime

class FileOut(BaseModel):
    id: str
    ontology_id: str
    filename: str
    file_size: int
    mime_type: str
    created_at: datetime
    model_config = {"from_attributes": True}
```

- [ ] **Step 6.5: Create backend/app/routers/files.py**

```python
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from app.deps import get_db, get_current_user
from app.models.uploaded_file import UploadedFile
from app.models.ontology import OntologyProject
from app.schemas.file import FileOut
from app.services.document_service import save_upload, convert_to_markdown, validate_extension
import uuid

router = APIRouter()

@router.post("/{ontology_id}/files", status_code=201)
async def upload_file(
    ontology_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _=Depends(get_current_user)
):
    if not db.query(OntologyProject).filter(OntologyProject.id == ontology_id).first():
        raise HTTPException(404, "Ontology not found")
    if not validate_extension(file.filename):
        raise HTTPException(400, f"File type not supported: {file.filename}")

    content = await file.read()
    if len(content) > 100 * 1024 * 1024:
        raise HTTPException(400, "File exceeds 100MB limit")

    file_path = save_upload(content, file.filename, ontology_id)
    converted = convert_to_markdown(file_path)

    record = UploadedFile(
        id=str(uuid.uuid4()), ontology_id=ontology_id,
        filename=file.filename, file_path=file_path,
        file_size=len(content), mime_type=file.content_type or "application/octet-stream",
        converted_md=converted,
    )
    db.add(record); db.commit(); db.refresh(record)
    return {"data": FileOut.model_validate(record)}

@router.get("/{ontology_id}/files")
def list_files(ontology_id: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    files = db.query(UploadedFile).filter(UploadedFile.ontology_id == ontology_id).all()
    return {"data": [FileOut.model_validate(f) for f in files]}

@router.delete("/{ontology_id}/files/{file_id}", status_code=204)
def delete_file(ontology_id: str, file_id: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    f = db.query(UploadedFile).filter(UploadedFile.id == file_id, UploadedFile.ontology_id == ontology_id).first()
    if not f: raise HTTPException(404, "File not found")
    import os
    if os.path.exists(f.file_path): os.remove(f.file_path)
    db.delete(f); db.commit()
```

- [ ] **Step 6.6: Register files router in main.py**

```python
# In app/main.py, add:
from app.routers import files
app.include_router(files.router, prefix="/api/v1/ontologies", tags=["files"])
```

- [ ] **Step 6.7: Write file upload tests**

```python
# backend/tests/test_files.py
import io
from app.models.ontology import OntologyProject

def test_upload_markdown(client, auth_headers, db, admin_user):
    p = OntologyProject(name="Test", domain="供应链", created_by=admin_user.id)
    db.add(p); db.commit()
    content = b"# Supply Chain\n\nHuaqiang Electronics supplies Chip A."
    r = client.post(f"/api/v1/ontologies/{p.id}/files",
                    files={"file": ("test.md", io.BytesIO(content), "text/markdown")},
                    headers=auth_headers)
    assert r.status_code == 201
    assert r.json()["data"]["filename"] == "test.md"

def test_upload_unsupported_type(client, auth_headers, db, admin_user):
    p = OntologyProject(name="Test2", domain="采购", created_by=admin_user.id)
    db.add(p); db.commit()
    r = client.post(f"/api/v1/ontologies/{p.id}/files",
                    files={"file": ("file.exe", io.BytesIO(b"data"), "application/x-executable")},
                    headers=auth_headers)
    assert r.status_code == 400

def test_list_files(client, auth_headers, db, admin_user):
    p = OntologyProject(name="Test3", domain="财务", created_by=admin_user.id)
    db.add(p); db.commit()
    client.post(f"/api/v1/ontologies/{p.id}/files",
                files={"file": ("a.md", io.BytesIO(b"content"), "text/markdown")},
                headers=auth_headers)
    r = client.get(f"/api/v1/ontologies/{p.id}/files", headers=auth_headers)
    assert len(r.json()["data"]) == 1
```

- [ ] **Step 6.8: Create frontend/src/components/FileDropzone.tsx**

```tsx
import { useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, X } from 'lucide-react'

const ACCEPTED = {
  'text/markdown': ['.md'],
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'text/csv': ['.csv'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg'],
}

interface Props {
  files: File[]
  onAdd: (files: File[]) => void
  onRemove: (index: number) => void
}

export default function FileDropzone({ files, onAdd, onRemove }: Props) {
  const onDrop = useCallback((accepted: File[]) => onAdd(accepted), [onAdd])
  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop, accept: ACCEPTED })

  return (
    <div>
      <div {...getRootProps()} className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
        ${isDragActive ? 'border-black bg-gray-50' : 'border-gray-300 hover:border-gray-400'}`}>
        <input {...getInputProps()} />
        <Upload className="mx-auto mb-2 text-gray-400" size={32} />
        <p className="text-sm text-gray-500">拖拽文件到此处，或点击上传</p>
        <p className="text-xs text-gray-400 mt-1">支持 MD · PDF · DOCX · XLSX · CSV · PPTX · PNG · JPG</p>
      </div>
      {files.length > 0 && (
        <ul className="mt-3 space-y-1">
          {files.map((f, i) => (
            <li key={i} className="flex items-center justify-between text-sm bg-gray-50 rounded px-3 py-2">
              <span>{f.name} <span className="text-gray-400 ml-2">{(f.size/1024).toFixed(0)} KB</span></span>
              <button onClick={() => onRemove(i)}><X size={14} className="text-gray-400 hover:text-red-500" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 6.9: Create frontend/src/pages/ontologies/create/StepUpload.tsx**

```tsx
import { useState } from 'react'
import FileDropzone from '@/components/FileDropzone'
import { ontologyApi } from '@/api/ontologies'

interface Props { ontologyId: string; onNext: () => void }

export default function StepUpload({ ontologyId, onNext }: Props) {
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const totalSize = files.reduce((s, f) => s + f.size, 0)

  const handleNext = async () => {
    if (files.length === 0) { setError('请至少上传一个文件'); return }
    if (totalSize > 100 * 1024 * 1024) { setError('总大小超过 100MB 限制'); return }
    setUploading(true); setError('')
    try {
      for (const file of files) {
        const fd = new FormData(); fd.append('file', file)
        await fetch(`/api/v1/ontologies/${ontologyId}/files`, {
          method: 'POST', body: fd,
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        })
      }
      onNext()
    } catch { setError('上传失败，请重试') }
    finally { setUploading(false) }
  }

  return (
    <div className="space-y-4">
      <h3 className="font-medium">① 数据导入</h3>
      <FileDropzone files={files}
        onAdd={newFiles => setFiles(prev => [...prev, ...newFiles])}
        onRemove={i => setFiles(prev => prev.filter((_, idx) => idx !== i))} />
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <p className="text-xs text-gray-400">总大小: {(totalSize/1024/1024).toFixed(1)} MB / 100 MB</p>
      <div className="flex justify-end">
        <button onClick={handleNext} disabled={uploading}
          className="bg-black text-white px-6 py-2 rounded-lg text-sm disabled:opacity-50">
          {uploading ? '上传中...' : '下一步'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 6.10: Run tests**

```bash
cd backend && pytest tests/test_files.py -v
# Expected: 3 passed
```

- [ ] **Step 6.11: Commit**

```bash
git add . && git commit -m "feat: file upload — MarkItDown conversion, multipart API, dropzone UI"
```

---

## Task 7: Prompt Management

**Files:**
- Create: `backend/app/models/prompt.py`
- Create: `backend/app/schemas/prompt.py`
- Create: `backend/app/routers/prompts.py`
- Create: `backend/tests/test_prompts.py`
- Create: `frontend/src/types/prompt.ts`
- Create: `frontend/src/api/prompts.ts`
- Create: `frontend/src/pages/prompts/PromptListPage.tsx`
- Create: `frontend/src/pages/prompts/PromptCreatePage.tsx`
- Create: `frontend/src/pages/prompts/PromptDetailPage.tsx`

- [ ] **Step 7.1: Create backend/app/models/prompt.py**

```python
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class Prompt(Base):
    __tablename__ = "prompts"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    domain: Mapped[str] = mapped_column(String(100), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    version: Mapped[int] = mapped_column(default=1)
    created_by: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
```

- [ ] **Step 7.2: Create backend/app/schemas/prompt.py**

```python
from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class PromptCreate(BaseModel):
    name: str
    domain: str
    content: str

class PromptUpdate(BaseModel):
    name: Optional[str] = None
    domain: Optional[str] = None
    content: Optional[str] = None

class PromptOut(BaseModel):
    id: str; name: str; domain: str; content: str
    version: int; created_by: Optional[str]; created_at: datetime; updated_at: datetime
    model_config = {"from_attributes": True}
```

- [ ] **Step 7.3: Create seed data for built-in prompts**

Create `backend/app/services/prompt_seed.py`:

```python
BUILTIN_PROMPTS = [
    {
        "name": "基础抽取",
        "domain": "其他",
        "content": """System: 你是一个本体专家。从以下文本中提取实体和关系。只提取文本中明确提到的内容。

User: 文本：{input_text}

请以以下 JSON 格式输出：
{
  "entities": [{"name_cn": "", "name_en": "", "type": "", "description": "", "properties": {}}],
  "relations": [{"source": "", "target": "", "type": "", "properties": {}}],
  "logic_rules": [{"name_cn": "", "name_en": "", "description": "", "formula": ""}],
  "actions": [{"name_cn": "", "name_en": "", "description": "", "execution_rule": "", "function_code": ""}]
}""",
    },
    {
        "name": "供应链 Ontology 抽取",
        "domain": "供应链",
        "content": """System: 你是一个供应链领域本体专家。从文本中提取供应商、物料、订单、生产线等实体，以及供应、消耗、生产等关系。

User: 文本：{input_text}

以 JSON 格式输出，包含 entities, relations, logic_rules, actions 字段。""",
    },
    {
        "name": "组织架构抽取",
        "domain": "其他",
        "content": """System: 你是组织架构本体专家。提取部门、员工、团队实体，以及汇报、管理等层级关系。

User: 文本：{input_text}

以 JSON 格式输出，包含 entities, relations, logic_rules, actions 字段。""",
    },
    {
        "name": "产品目录抽取",
        "domain": "科技",
        "content": """System: 你是产品目录本体专家。提取产品、分类、规格属性等实体，以及分类归属关系。

User: 文本：{input_text}

以 JSON 格式输出，包含 entities, relations, logic_rules, actions 字段。""",
    },
    {
        "name": "合同条款抽取",
        "domain": "法律",
        "content": """System: 你是合同法律本体专家。提取合同主体、义务、权利、期限等实体及其关系。

User: 文本：{input_text}

以 JSON 格式输出，包含 entities, relations, logic_rules, actions 字段。""",
    },
    {
        "name": "学术论文抽取",
        "domain": "教育",
        "content": """System: 你是学术知识本体专家。提取研究问题、方法、数据集、结论等实体及引用关系。

User: 文本：{input_text}

以 JSON 格式输出，包含 entities, relations, logic_rules, actions 字段。""",
    },
]

def seed_prompts(db):
    from app.models.prompt import Prompt
    if db.query(Prompt).count() == 0:
        import uuid
        from datetime import datetime, timezone
        for p in BUILTIN_PROMPTS:
            db.add(Prompt(id=str(uuid.uuid4()), created_by=None, **p))
        db.commit()
```

- [ ] **Step 7.4: Call seed in main.py startup**

```python
# In app/main.py, add startup event:
from app.database import SessionLocal
from app.services.auth_service import seed_admin
from app.services.prompt_seed import seed_prompts

@app.on_event("startup")
def startup():
    db = SessionLocal()
    try:
        seed_admin(db)
        seed_prompts(db)
    finally:
        db.close()
```

- [ ] **Step 7.5: Create backend/app/routers/prompts.py**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.deps import get_db, get_current_user
from app.models.prompt import Prompt
from app.models.user import User
from app.schemas.prompt import PromptCreate, PromptUpdate, PromptOut
import uuid

router = APIRouter()

@router.get("")
def list_prompts(domain: str = None, page: int = 1, page_size: int = 20,
                 db: Session = Depends(get_db), _=Depends(get_current_user)):
    q = db.query(Prompt)
    if domain: q = q.filter(Prompt.domain == domain)
    total = q.count()
    items = q.order_by(Prompt.updated_at.desc()).offset((page-1)*page_size).limit(page_size).all()
    return {"data": {"items": [PromptOut.model_validate(p) for p in items], "total": total, "page": page, "page_size": page_size}}

@router.get("/by-domain/{domain}")
def prompts_by_domain(domain: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    items = db.query(Prompt).filter(Prompt.domain == domain).all()
    return {"data": [PromptOut.model_validate(p) for p in items]}

@router.post("", status_code=201)
def create_prompt(body: PromptCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    p = Prompt(id=str(uuid.uuid4()), created_by=current_user.id, **body.model_dump())
    db.add(p); db.commit(); db.refresh(p)
    return {"data": PromptOut.model_validate(p)}

@router.get("/{prompt_id}")
def get_prompt(prompt_id: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    p = db.query(Prompt).filter(Prompt.id == prompt_id).first()
    if not p: raise HTTPException(404, "Not found")
    return {"data": PromptOut.model_validate(p)}

@router.put("/{prompt_id}")
def update_prompt(prompt_id: str, body: PromptUpdate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    p = db.query(Prompt).filter(Prompt.id == prompt_id).first()
    if not p: raise HTTPException(404, "Not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(p, k, v)
    p.version += 1
    db.commit(); db.refresh(p)
    return {"data": PromptOut.model_validate(p)}

@router.delete("/{prompt_id}", status_code=204)
def delete_prompt(prompt_id: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    p = db.query(Prompt).filter(Prompt.id == prompt_id).first()
    if not p: raise HTTPException(404, "Not found")
    db.delete(p); db.commit()
```

- [ ] **Step 7.6: Write prompt tests**

```python
# backend/tests/test_prompts.py
def test_create_prompt(client, auth_headers):
    r = client.post("/api/v1/prompts",
                    json={"name": "Test Prompt", "domain": "供应链",
                          "content": "System: expert\nUser: {input_text}"},
                    headers=auth_headers)
    assert r.status_code == 201

def test_update_increments_version(client, auth_headers):
    r = client.post("/api/v1/prompts",
                    json={"name": "V Prompt", "domain": "采购", "content": "v1"},
                    headers=auth_headers)
    pid = r.json()["data"]["id"]
    r2 = client.put(f"/api/v1/prompts/{pid}", json={"content": "v2"}, headers=auth_headers)
    assert r2.json()["data"]["version"] == 2

def test_filter_by_domain(client, auth_headers):
    client.post("/api/v1/prompts", json={"name": "SC", "domain": "供应链", "content": "x"}, headers=auth_headers)
    client.post("/api/v1/prompts", json={"name": "Fin", "domain": "财务", "content": "x"}, headers=auth_headers)
    r = client.get("/api/v1/prompts?domain=供应链", headers=auth_headers)
    assert all(p["domain"] == "供应链" for p in r.json()["data"]["items"])

def test_delete_prompt(client, auth_headers):
    r = client.post("/api/v1/prompts", json={"name": "Del", "domain": "其他", "content": "x"}, headers=auth_headers)
    pid = r.json()["data"]["id"]
    assert client.delete(f"/api/v1/prompts/{pid}", headers=auth_headers).status_code == 204
```

- [ ] **Step 7.7: Create frontend prompt pages**

`frontend/src/types/prompt.ts`:
```typescript
export interface Prompt {
  id: string; name: string; domain: string; content: string
  version: number; created_by: string | null; updated_at: string
}
```

`frontend/src/api/prompts.ts`:
```typescript
import { apiClient } from './client'
import type { Prompt } from '@/types/prompt'

export const promptApi = {
  list: (params?: { domain?: string; page?: number }) =>
    apiClient.get<{ items: Prompt[]; total: number }>('/prompts', { params }),
  create: (body: Pick<Prompt, 'name' | 'domain' | 'content'>) =>
    apiClient.post<Prompt>('/prompts', body),
  get: (id: string) => apiClient.get<Prompt>(`/prompts/${id}`),
  update: (id: string, body: Partial<Pick<Prompt, 'name' | 'domain' | 'content'>>) =>
    apiClient.put<Prompt>(`/prompts/${id}`, body),
  delete: (id: string) => apiClient.delete(`/prompts/${id}`),
  byDomain: (domain: string) => apiClient.get<Prompt[]>(`/prompts/by-domain/${domain}`),
}
```

- [ ] **Step 7.8: Create PromptListPage.tsx**

```tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { promptApi } from '@/api/prompts'
import ConfirmDialog from '@/components/ConfirmDialog'
import { DOMAINS } from '@/types/ontology'

export default function PromptListPage() {
  const [domain, setDomain] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const qc = useQueryClient()
  const navigate = useNavigate()

  const { data } = useQuery({
    queryKey: ['prompts', domain],
    queryFn: () => promptApi.list({ domain: domain || undefined }),
  })
  const deleteMut = useMutation({
    mutationFn: (id: string) => promptApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['prompts'] }); setDeleteTarget(null) },
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Prompt 管理</h2>
        <button onClick={() => navigate('/prompts/create')} className="bg-black text-white px-4 py-2 rounded-lg text-sm">
          创建 Prompt
        </button>
      </div>
      <div className="flex gap-3 mb-4">
        <select value={domain} onChange={e => setDomain(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">全部业务域</option>
          {DOMAINS.map(d => <option key={d}>{d}</option>)}
        </select>
      </div>
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>{['ID','名称','业务域','版本','更新时间','操作'].map(h => (
              <th key={h} className="px-4 py-3 text-left text-gray-500 font-medium">{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {data?.items?.map(p => (
              <tr key={p.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs text-gray-400">{p.id.slice(0,8)}</td>
                <td className="px-4 py-3 font-medium">{p.name}</td>
                <td className="px-4 py-3 text-gray-500">{p.domain}</td>
                <td className="px-4 py-3 text-gray-500">v{p.version}</td>
                <td className="px-4 py-3 text-gray-500">{new Date(p.updated_at).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <button onClick={() => navigate(`/prompts/${p.id}`)} className="text-blue-600 hover:underline mr-3">查看/编辑</button>
                  <button onClick={() => setDeleteTarget({ id: p.id, name: p.name })} className="text-red-600 hover:underline">删除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data?.items?.length && <p className="text-center text-gray-400 py-8">暂无 Prompt</p>}
      </div>
      <ConfirmDialog open={!!deleteTarget} title="确认删除"
        message={`确定要删除 Prompt「${deleteTarget?.name}」吗？此操作不可撤销。`}
        onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)} />
    </div>
  )
}
```

- [ ] **Step 7.9: Create PromptDetailPage.tsx**

```tsx
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { promptApi } from '@/api/prompts'
import { useState, useEffect } from 'react'
import { DOMAINS } from '@/types/ontology'

export default function PromptDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate(); const qc = useQueryClient()
  const { data: prompt } = useQuery({ queryKey: ['prompt', id], queryFn: () => promptApi.get(id!) })
  const [content, setContent] = useState('')
  const [name, setName] = useState('')
  const [domain, setDomain] = useState('')

  useEffect(() => {
    if (prompt) { setContent((prompt as any).content); setName((prompt as any).name); setDomain((prompt as any).domain) }
  }, [prompt])

  const saveMut = useMutation({
    mutationFn: () => promptApi.update(id!, { content, name, domain }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['prompt', id] }),
  })

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Prompt 详情</h2>
        <button onClick={() => navigate('/prompts')} className="text-sm text-gray-500 hover:underline">返回列表</button>
      </div>
      <div className="bg-white rounded-lg shadow p-6 space-y-4">
        <div><label className="text-sm font-medium text-gray-600">名称</label>
          <input value={name} onChange={e => setName(e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" /></div>
        <div><label className="text-sm font-medium text-gray-600">业务域</label>
          <select value={domain} onChange={e => setDomain(e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm">
            {DOMAINS.map(d => <option key={d}>{d}</option>)}
          </select></div>
        <div><label className="text-sm font-medium text-gray-600">Prompt 内容</label>
          <textarea value={content} onChange={e => setContent(e.target.value)} rows={16}
            className="mt-1 w-full border rounded-lg px-3 py-2 text-sm font-mono" /></div>
        <p className="text-xs text-gray-400">版本: v{(prompt as any)?.version}</p>
        <div className="flex gap-3">
          <button onClick={() => saveMut.mutate()} className="bg-black text-white px-4 py-2 rounded-lg text-sm">保存</button>
          <button onClick={() => navigate('/prompts')} className="border px-4 py-2 rounded-lg text-sm">返回列表</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 7.10: Run tests**

```bash
cd backend && pytest tests/test_prompts.py -v
# Expected: 4 passed
```

- [ ] **Step 7.11: Commit**

```bash
git add . && git commit -m "feat: prompt management — CRUD, 6 built-in templates seeded, list/detail pages"
```

---

## Task 8: Model Management

**Files:**
- Create: `backend/app/models/model_config.py`
- Create: `backend/app/services/encryption_service.py`
- Create: `backend/app/schemas/model_config.py`
- Create: `backend/app/routers/model_configs.py`
- Create: `backend/tests/test_models.py`
- Create: `frontend/src/types/model.ts`
- Create: `frontend/src/api/models.ts`
- Create: `frontend/src/pages/models/ModelsPage.tsx`

- [ ] **Step 8.1: Create backend/app/services/encryption_service.py**

```python
import os, base64
from cryptography.fernet import Fernet
from app.config import settings

def _get_fernet() -> Fernet:
    key = settings.encryption_key
    if not key:
        key = base64.urlsafe_b64encode(os.urandom(32)).decode()
    return Fernet(key.encode() if isinstance(key, str) else key)

def encrypt(value: str) -> str:
    return _get_fernet().encrypt(value.encode()).decode()

def decrypt(token: str) -> str:
    return _get_fernet().decrypt(token.encode()).decode()

def mask(value: str) -> str:
    if len(value) <= 8: return "****"
    return value[:4] + "****" + value[-4:]
```

- [ ] **Step 8.2: Create backend/app/models/model_config.py**

```python
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class ModelConfig(Base):
    __tablename__ = "model_configs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    api_base: Mapped[str] = mapped_column(String(500), nullable=False)
    api_key_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    provider: Mapped[str] = mapped_column(String(50), default="openai")  # openai|anthropic|compatible
    models_json: Mapped[str] = mapped_column(Text, default="[]")  # JSON array stored as text
    created_by: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
```

- [ ] **Step 8.3: Create backend/app/schemas/model_config.py**

```python
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List

class ModelConfigCreate(BaseModel):
    name: str
    api_base: str
    api_key: str
    provider: str = "openai"
    models: List[str] = []

class ModelConfigUpdate(BaseModel):
    name: Optional[str] = None
    api_base: Optional[str] = None
    api_key: Optional[str] = None
    provider: Optional[str] = None
    models: Optional[List[str]] = None

class ModelConfigOut(BaseModel):
    id: str; name: str; api_base: str; api_key_masked: str
    provider: str; models: List[str]; created_at: datetime

    model_config = {"from_attributes": False}
```

- [ ] **Step 8.4: Create backend/app/routers/model_configs.py**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import json, httpx
from app.deps import get_db, get_current_user
from app.models.model_config import ModelConfig
from app.models.user import User
from app.schemas.model_config import ModelConfigCreate, ModelConfigUpdate, ModelConfigOut
from app.services.encryption_service import encrypt, decrypt, mask
import uuid

router = APIRouter()

def _to_out(m: ModelConfig) -> ModelConfigOut:
    return ModelConfigOut(
        id=m.id, name=m.name, api_base=m.api_base,
        api_key_masked=mask(decrypt(m.api_key_encrypted)),
        provider=m.provider, models=json.loads(m.models_json),
        created_at=m.created_at,
    )

@router.get("")
def list_models(db: Session = Depends(get_db), _=Depends(get_current_user)):
    return {"data": [_to_out(m) for m in db.query(ModelConfig).all()]}

@router.post("", status_code=201)
def create_model(body: ModelConfigCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    m = ModelConfig(id=str(uuid.uuid4()), name=body.name, api_base=body.api_base,
                    api_key_encrypted=encrypt(body.api_key), provider=body.provider,
                    models_json=json.dumps(body.models), created_by=current_user.id)
    db.add(m); db.commit(); db.refresh(m)
    return {"data": _to_out(m)}

@router.put("/{model_id}")
def update_model(model_id: str, body: ModelConfigUpdate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    m = db.query(ModelConfig).filter(ModelConfig.id == model_id).first()
    if not m: raise HTTPException(404, "Not found")
    if body.name: m.name = body.name
    if body.api_base: m.api_base = body.api_base
    if body.api_key: m.api_key_encrypted = encrypt(body.api_key)
    if body.provider: m.provider = body.provider
    if body.models is not None: m.models_json = json.dumps(body.models)
    db.commit(); db.refresh(m)
    return {"data": _to_out(m)}

@router.delete("/{model_id}", status_code=204)
def delete_model(model_id: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    m = db.query(ModelConfig).filter(ModelConfig.id == model_id).first()
    if not m: raise HTTPException(404, "Not found")
    db.delete(m); db.commit()

@router.post("/{model_id}/test")
def test_connectivity(model_id: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    m = db.query(ModelConfig).filter(ModelConfig.id == model_id).first()
    if not m: raise HTTPException(404, "Not found")
    api_key = decrypt(m.api_key_encrypted)
    models = json.loads(m.models_json)
    model_name = models[0] if models else "gpt-4o"
    try:
        if m.provider == "anthropic":
            import anthropic
            client = anthropic.Anthropic(api_key=api_key, base_url=m.api_base)
            client.messages.create(model=model_name, max_tokens=10, messages=[{"role":"user","content":"hi"}])
        else:
            from openai import OpenAI
            client = OpenAI(api_key=api_key, base_url=m.api_base)
            client.chat.completions.create(model=model_name, max_tokens=10, messages=[{"role":"user","content":"hi"}])
        return {"data": {"success": True, "message": "连接成功"}}
    except Exception as e:
        return {"data": {"success": False, "message": str(e)}}
```

- [ ] **Step 8.5: Register model_configs router in main.py**

```python
from app.routers import model_configs
app.include_router(model_configs.router, prefix="/api/v1/models", tags=["models"])
```

- [ ] **Step 8.6: Write model tests**

```python
# backend/tests/test_models.py
def test_create_model(client, auth_headers):
    r = client.post("/api/v1/models",
                    json={"name": "GPT-4o", "api_base": "https://api.openai.com/v1",
                          "api_key": "sk-test-key", "provider": "openai", "models": ["gpt-4o"]},
                    headers=auth_headers)
    assert r.status_code == 201
    assert "****" in r.json()["data"]["api_key_masked"]  # key is masked

def test_api_key_encrypted(client, auth_headers, db):
    client.post("/api/v1/models",
                json={"name": "Test", "api_base": "http://localhost", "api_key": "secret-key",
                      "provider": "openai", "models": []}, headers=auth_headers)
    from app.models.model_config import ModelConfig
    m = db.query(ModelConfig).first()
    assert m.api_key_encrypted != "secret-key"  # stored encrypted

def test_delete_model(client, auth_headers):
    r = client.post("/api/v1/models",
                    json={"name": "Del", "api_base": "http://x", "api_key": "k",
                          "provider": "openai", "models": []}, headers=auth_headers)
    mid = r.json()["data"]["id"]
    assert client.delete(f"/api/v1/models/{mid}", headers=auth_headers).status_code == 204
```

- [ ] **Step 8.7: Create frontend models page**

`frontend/src/types/model.ts`:
```typescript
export interface ModelConfig {
  id: string; name: string; api_base: string; api_key_masked: string
  provider: 'openai' | 'anthropic' | 'compatible'; models: string[]
}
export interface ModelConfigInput {
  name: string; api_base: string; api_key: string; provider: string; models: string[]
}
```

`frontend/src/api/models.ts`:
```typescript
import { apiClient } from './client'
import type { ModelConfig, ModelConfigInput } from '@/types/model'
export const modelApi = {
  list: () => apiClient.get<ModelConfig[]>('/models'),
  create: (body: ModelConfigInput) => apiClient.post<ModelConfig>('/models', body),
  update: (id: string, body: Partial<ModelConfigInput>) => apiClient.put<ModelConfig>(`/models/${id}`, body),
  delete: (id: string) => apiClient.delete(`/models/${id}`),
  test: (id: string) => apiClient.post<{ success: boolean; message: string }>(`/models/${id}/test`),
}
```

- [ ] **Step 8.8: Create frontend/src/pages/models/ModelsPage.tsx**

```tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { modelApi } from '@/api/models'
import type { ModelConfigInput } from '@/types/model'
import { CheckCircle, XCircle, Plus } from 'lucide-react'

const DEFAULT_INPUT: ModelConfigInput = { name: '', api_base: '', api_key: '', provider: 'openai', models: [] }

export default function ModelsPage() {
  const qc = useQueryClient()
  const [form, setForm] = useState<ModelConfigInput>(DEFAULT_INPUT)
  const [showAdd, setShowAdd] = useState(false)
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string }>>({})

  const { data: models } = useQuery({ queryKey: ['models'], queryFn: () => modelApi.list() })
  const createMut = useMutation({ mutationFn: () => modelApi.create(form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['models'] }); setShowAdd(false); setForm(DEFAULT_INPUT) } })
  const deleteMut = useMutation({ mutationFn: (id: string) => modelApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['models'] }) })
  const testMut = useMutation({
    mutationFn: (id: string) => modelApi.test(id),
    onSuccess: (res: any, id) => setTestResults(prev => ({ ...prev, [id]: res }))
  })

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">模型管理 / Models</h2>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-black text-white px-4 py-2 rounded-lg text-sm">
          <Plus size={14} /> 添加模型
        </button>
      </div>

      <div className="space-y-4">
        {(models as any)?.map((m: any) => (
          <div key={m.id} className="bg-white rounded-lg shadow p-5">
            <div className="grid grid-cols-2 gap-3 text-sm mb-4">
              <div><span className="text-gray-500">名称: </span><span className="font-medium">{m.name}</span></div>
              <div><span className="text-gray-500">Provider: </span><span>{m.provider}</span></div>
              <div><span className="text-gray-500">API 地址: </span><span className="font-mono text-xs">{m.api_base}</span></div>
              <div><span className="text-gray-500">API Key: </span><span className="font-mono text-xs">{m.api_key_masked}</span></div>
              <div><span className="text-gray-500">模型: </span><span>{m.models.join(', ')}</span></div>
            </div>
            {testResults[m.id] && (
              <div className={`flex items-center gap-2 text-sm mb-3 ${testResults[m.id].success ? 'text-green-600' : 'text-red-600'}`}>
                {testResults[m.id].success ? <CheckCircle size={14} /> : <XCircle size={14} />}
                {testResults[m.id].message}
              </div>
            )}
            <div className="flex gap-2">
              <button onClick={() => testMut.mutate(m.id)} className="border px-3 py-1.5 rounded text-sm">测试连通性</button>
              <button onClick={() => deleteMut.mutate(m.id)} className="text-red-600 px-3 py-1.5 rounded text-sm border border-red-200">删除</button>
            </div>
          </div>
        ))}
        {!(models as any)?.length && <p className="text-center text-gray-400 py-8">暂无模型配置</p>}
      </div>

      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-[480px]">
            <h3 className="font-semibold mb-4">添加模型</h3>
            {[['名称', 'name', 'text'], ['API 地址', 'api_base', 'text'], ['API Key', 'api_key', 'password']].map(([label, field, type]) => (
              <div key={field} className="mb-3">
                <label className="text-sm text-gray-600">{label}</label>
                <input type={type} value={(form as any)[field]}
                  onChange={e => setForm(prev => ({ ...prev, [field]: e.target.value }))}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
            ))}
            <div className="mb-3">
              <label className="text-sm text-gray-600">Provider</label>
              <select value={form.provider} onChange={e => setForm(prev => ({ ...prev, provider: e.target.value }))}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm">
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="compatible">OpenAI-Compatible</option>
              </select>
            </div>
            <div className="mb-4">
              <label className="text-sm text-gray-600">模型列表（逗号分隔）</label>
              <input value={form.models.join(',')}
                onChange={e => setForm(prev => ({ ...prev, models: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
                placeholder="gpt-4o, gpt-4o-mini"
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowAdd(false)} className="border px-4 py-2 rounded-lg text-sm">取消</button>
              <button onClick={() => createMut.mutate()} className="bg-black text-white px-4 py-2 rounded-lg text-sm">保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 8.9: Run tests**

```bash
cd backend && pytest tests/test_models.py -v
# Expected: 3 passed
```

- [ ] **Step 8.10: Commit**

```bash
git add . && git commit -m "feat: model management — AES-encrypted API keys, connectivity test, models page"
```

---

**End of Part 2.** Continue with Part 3 for LLM Extraction Engine, Graph Visualization, and Entity/Logic/Action CRUD.
