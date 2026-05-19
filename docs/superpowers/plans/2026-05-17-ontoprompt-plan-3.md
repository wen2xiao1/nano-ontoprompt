# OntoPrompt Implementation Plan — Part 3 (Slices 8–10)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Prerequisite: Parts 1 & 2 must be complete.

**Goal:** LLM extraction async engine with Celery, Cytoscape.js graph visualization, and full Entity/Logic/Action CRUD sub-tabs.

**Tech Stack additions:** Celery, Redis, OpenAI SDK, Anthropic SDK, Cytoscape.js, rdflib (stub for Part 4)

---

## File Map (Part 3)

```
backend/
  app/
    models/
      entity.py
      relation.py
      logic.py
      action.py
      extraction_task.py
    schemas/
      entity.py
      relation.py
      logic.py
      action.py
      execution.py
    routers/
      execution.py
      entities.py
      relations.py
      logic.py
      actions.py
    services/
      llm_service.py
      extraction_service.py
    tasks/
      __init__.py
      extraction.py
  tests/
    test_execution.py
    test_entities.py
    test_logic.py
    test_actions.py
frontend/
  src/
    api/
      execution.ts
      graph.ts
      entities.ts
      logic.ts
      actions.ts
    types/
      entity.ts
      graph.ts
    pages/
      ontologies/
        create/
          OntologyCreatePage.tsx   (wire all 3 steps)
          StepPromptModel.tsx
          StepProgress.tsx
        detail/
          OntologyDetailPage.tsx
          GraphTab.tsx
          EntityTab.tsx
          LogicTab.tsx
          ActionTab.tsx
    components/
      ConfidenceBar.tsx
```

---

## Task 9: LLM Extraction Engine

**Files:**
- Create: `backend/app/models/entity.py`, `relation.py`, `logic.py`, `action.py`, `extraction_task.py`
- Create: `backend/app/services/llm_service.py`
- Create: `backend/app/services/extraction_service.py`
- Create: `backend/app/tasks/__init__.py`
- Create: `backend/app/tasks/extraction.py`
- Create: `backend/app/routers/execution.py`
- Create: `backend/celeryconfig.py`
- Create: `backend/tests/test_execution.py`

- [ ] **Step 9.1: Create ORM models for ontology content**

`backend/app/models/entity.py`:
```python
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey, Text, Float
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class Entity(Base):
    __tablename__ = "entities"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    ontology_id: Mapped[str] = mapped_column(String, ForeignKey("ontology_projects.id", ondelete="CASCADE"))
    name_cn: Mapped[str] = mapped_column(String(500))
    name_en: Mapped[str] = mapped_column(String(500), nullable=True)
    type: Mapped[str] = mapped_column(String(100), default="Entity")
    description: Mapped[str] = mapped_column(Text, nullable=True)
    properties_json: Mapped[str] = mapped_column(Text, default="{}")
    confidence: Mapped[float] = mapped_column(Float, default=0.6)
    version: Mapped[int] = mapped_column(default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
```

`backend/app/models/relation.py`:
```python
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey, Text, Float
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class Relation(Base):
    __tablename__ = "relations"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    ontology_id: Mapped[str] = mapped_column(String, ForeignKey("ontology_projects.id", ondelete="CASCADE"))
    source_entity_id: Mapped[str] = mapped_column(String, ForeignKey("entities.id", ondelete="CASCADE"))
    target_entity_id: Mapped[str] = mapped_column(String, ForeignKey("entities.id", ondelete="CASCADE"))
    type: Mapped[str] = mapped_column(String(200))
    properties_json: Mapped[str] = mapped_column(Text, default="{}")
    confidence: Mapped[float] = mapped_column(Float, default=0.6)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
```

`backend/app/models/logic.py`:
```python
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey, Text, Float, Integer
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class LogicRule(Base):
    __tablename__ = "logic_rules"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    ontology_id: Mapped[str] = mapped_column(String, ForeignKey("ontology_projects.id", ondelete="CASCADE"))
    name_cn: Mapped[str] = mapped_column(String(500))
    name_en: Mapped[str] = mapped_column(String(500), nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    formula: Mapped[str] = mapped_column(Text, nullable=True)
    confidence: Mapped[float] = mapped_column(Float, default=0.6)
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
```

`backend/app/models/action.py`:
```python
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey, Text, Float, Integer
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class Action(Base):
    __tablename__ = "actions"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    ontology_id: Mapped[str] = mapped_column(String, ForeignKey("ontology_projects.id", ondelete="CASCADE"))
    name_cn: Mapped[str] = mapped_column(String(500))
    name_en: Mapped[str] = mapped_column(String(500), nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    execution_rule: Mapped[str] = mapped_column(Text, nullable=True)
    function_code: Mapped[str] = mapped_column(Text, nullable=True)
    linked_entities_json: Mapped[str] = mapped_column(Text, default="[]")
    linked_logic_ids_json: Mapped[str] = mapped_column(Text, default="[]")
    confidence: Mapped[float] = mapped_column(Float, default=0.6)
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
```

`backend/app/models/extraction_task.py`:
```python
import uuid, json
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class ExtractionTask(Base):
    __tablename__ = "extraction_tasks"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    ontology_id: Mapped[str] = mapped_column(String, ForeignKey("ontology_projects.id", ondelete="CASCADE"))
    prompt_id: Mapped[str] = mapped_column(String, ForeignKey("prompts.id"), nullable=True)
    model_id: Mapped[str] = mapped_column(String, ForeignKey("model_configs.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="queued")
    parameters_json: Mapped[str] = mapped_column(Text, default="{}")
    progress_json: Mapped[str] = mapped_column(Text, default="{}")
    error: Mapped[str] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
```

- [ ] **Step 9.2: Create backend/app/services/llm_service.py**

```python
import json
from app.models.model_config import ModelConfig
from app.services.encryption_service import decrypt

RETRY_PROMPT_SUFFIX = "\n\nIMPORTANT: Return ONLY valid JSON. No markdown, no explanation."

def extract_ontology(text: str, prompt_content: str, model_config: ModelConfig,
                     temperature: float = 0.1, max_tokens: int = 8192,
                     timeout: int = 120, retry_count: int = 2) -> dict:
    api_key = decrypt(model_config.api_key_encrypted)
    import json
    models = json.loads(model_config.models_json)
    model_name = models[0] if models else "gpt-4o"
    full_prompt = prompt_content.replace("{input_text}", text) + RETRY_PROMPT_SUFFIX

    for attempt in range(retry_count + 1):
        raw = _call_llm(model_config.provider, api_key, model_config.api_base,
                        model_name, full_prompt, temperature, max_tokens, timeout)
        try:
            result = _parse_json(raw)
            return result
        except ValueError:
            if attempt == retry_count:
                raise ValueError(f"LLM returned invalid JSON after {retry_count + 1} attempts. Last response: {raw[:200]}")
    return {}

def _call_llm(provider: str, api_key: str, base_url: str, model: str,
              prompt: str, temperature: float, max_tokens: int, timeout: int) -> str:
    if provider == "anthropic":
        import anthropic
        client = anthropic.Anthropic(api_key=api_key, base_url=base_url)
        msg = client.messages.create(
            model=model, max_tokens=max_tokens, temperature=temperature,
            messages=[{"role": "user", "content": prompt}]
        )
        return msg.content[0].text
    else:  # openai or compatible
        from openai import OpenAI
        client = OpenAI(api_key=api_key, base_url=base_url, timeout=timeout)
        resp = client.chat.completions.create(
            model=model, max_tokens=max_tokens, temperature=temperature,
            response_format={"type": "json_object"},
            messages=[{"role": "user", "content": prompt}]
        )
        return resp.choices[0].message.content

def _parse_json(raw: str) -> dict:
    text = raw.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"): text = text[4:]
    data = json.loads(text)
    for key in ("entities", "relations", "logic_rules", "actions"):
        if key not in data:
            data[key] = []
    return data
```

- [ ] **Step 9.3: Create backend/celeryconfig.py**

```python
from app.config import settings
broker_url = settings.redis_url
result_backend = settings.redis_url
task_serializer = "json"
result_serializer = "json"
accept_content = ["json"]
timezone = "UTC"
```

- [ ] **Step 9.4: Create backend/app/tasks/__init__.py**

```python
from celery import Celery
from app.config import settings

celery_app = Celery("ontoprompt")
celery_app.config_from_object("celeryconfig")
celery_app.autodiscover_tasks(["app.tasks"])
```

- [ ] **Step 9.5: Create backend/app/services/extraction_service.py**

```python
import json, uuid
from sqlalchemy.orm import Session
from app.models.entity import Entity
from app.models.relation import Relation
from app.models.logic import LogicRule
from app.models.action import Action
from app.models.ontology import OntologyProject
from app.models.uploaded_file import UploadedFile
from app.models.extraction_task import ExtractionTask
from app.models.prompt import Prompt
from app.models.model_config import ModelConfig
from app.services.llm_service import extract_ontology

STEPS = ["queued","reading_files","markitdown_conversion","merging_text","llm_call","parsing_output","writing_results","completed"]

def _update_progress(db: Session, task: ExtractionTask, step: str, pct: int, extra: dict = None):
    idx = STEPS.index(step) if step in STEPS else 0
    progress = {"step": step, "step_index": idx, "total_steps": 7, "percentage": pct}
    if extra: progress.update(extra)
    task.progress_json = json.dumps(progress)
    task.status = "running" if step not in ("completed", "failed") else step
    db.commit()

def run_extraction(db: Session, task_id: str):
    task = db.query(ExtractionTask).filter(ExtractionTask.id == task_id).first()
    if not task: return

    try:
        params = json.loads(task.parameters_json)
        prompt = db.query(Prompt).filter(Prompt.id == task.prompt_id).first()
        model_cfg = db.query(ModelConfig).filter(ModelConfig.id == task.model_id).first()
        if not prompt or not model_cfg:
            raise ValueError("Prompt or model config not found")

        _update_progress(db, task, "reading_files", 10)
        files = db.query(UploadedFile).filter(UploadedFile.ontology_id == task.ontology_id).all()
        if not files: raise ValueError("No files uploaded")

        _update_progress(db, task, "markitdown_conversion", 25)
        texts = [f.converted_md or "" for f in files]

        _update_progress(db, task, "merging_text", 40)
        combined = "\n\n---\n\n".join(texts)

        _update_progress(db, task, "llm_call", 55, {"files_total": len(files)})
        result = extract_ontology(
            text=combined, prompt_content=prompt.content, model_config=model_cfg,
            temperature=params.get("temperature", 0.1),
            max_tokens=params.get("max_tokens", 8192),
            timeout=params.get("timeout_seconds", 120),
            retry_count=params.get("retry_count", 2),
        )

        _update_progress(db, task, "parsing_output", 75)
        oid = task.ontology_id
        _write_results(db, oid, result)

        _update_progress(db, task, "writing_results", 90)
        project = db.query(OntologyProject).filter(OntologyProject.id == oid).first()
        if project:
            project.status = "created"
            db.commit()

        task.status = "completed"
        task.progress_json = json.dumps({"step": "completed", "step_index": 7, "total_steps": 7, "percentage": 100})
        db.commit()

    except Exception as e:
        task.status = "failed"
        task.error = str(e)
        task.progress_json = json.dumps({"step": "failed", "percentage": 0, "error_detail": str(e)})
        db.commit()

def _write_results(db: Session, ontology_id: str, result: dict):
    name_to_id = {}
    for e in result.get("entities", []):
        eid = str(uuid.uuid4())
        name_to_id[e.get("name_cn", "") or e.get("name_en", "")] = eid
        db.add(Entity(id=eid, ontology_id=ontology_id,
                      name_cn=e.get("name_cn", ""), name_en=e.get("name_en", ""),
                      type=e.get("type", "Entity"), description=e.get("description", ""),
                      properties_json=json.dumps(e.get("properties", {})),
                      confidence=e.get("confidence", 0.6)))
    db.flush()

    for r in result.get("relations", []):
        src_id = name_to_id.get(r.get("source", ""))
        tgt_id = name_to_id.get(r.get("target", ""))
        if src_id and tgt_id:
            db.add(Relation(id=str(uuid.uuid4()), ontology_id=ontology_id,
                            source_entity_id=src_id, target_entity_id=tgt_id,
                            type=r.get("type", "related_to"),
                            properties_json=json.dumps(r.get("properties", {})),
                            confidence=r.get("confidence", 0.6)))

    for lr in result.get("logic_rules", []):
        db.add(LogicRule(id=str(uuid.uuid4()), ontology_id=ontology_id,
                         name_cn=lr.get("name_cn", ""), name_en=lr.get("name_en", ""),
                         description=lr.get("description", ""), formula=lr.get("formula", ""),
                         confidence=lr.get("confidence", 0.6)))

    for a in result.get("actions", []):
        db.add(Action(id=str(uuid.uuid4()), ontology_id=ontology_id,
                      name_cn=a.get("name_cn", ""), name_en=a.get("name_en", ""),
                      description=a.get("description", ""),
                      execution_rule=a.get("execution_rule", ""),
                      function_code=a.get("function_code", ""),
                      confidence=a.get("confidence", 0.6)))
    db.commit()
```

- [ ] **Step 9.6: Create backend/app/tasks/extraction.py**

```python
from app.tasks import celery_app
from app.database import SessionLocal
from app.services.extraction_service import run_extraction

@celery_app.task(name="extraction.run")
def run_extraction_task(task_id: str):
    db = SessionLocal()
    try:
        run_extraction(db, task_id)
    finally:
        db.close()
```

- [ ] **Step 9.7: Create backend/app/routers/execution.py**

```python
import json, uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.deps import get_db, get_current_user
from app.models.extraction_task import ExtractionTask
from app.models.ontology import OntologyProject
from app.models.uploaded_file import UploadedFile

router = APIRouter()

@router.post("/{ontology_id}/execute", status_code=202)
def start_extraction(ontology_id: str, body: dict, db: Session = Depends(get_db), _=Depends(get_current_user)):
    project = db.query(OntologyProject).filter(OntologyProject.id == ontology_id).first()
    if not project: raise HTTPException(404, "Ontology not found")
    if not db.query(UploadedFile).filter(UploadedFile.ontology_id == ontology_id).count():
        raise HTTPException(400, {"error": "NO_FILES", "message": "Ontology 没有上传任何文件"})
    running = db.query(ExtractionTask).filter(ExtractionTask.ontology_id == ontology_id, ExtractionTask.status == "running").first()
    if running:
        raise HTTPException(400, {"error": "ALREADY_RUNNING", "message": "已有抽取任务在运行"})

    task = ExtractionTask(
        id=str(uuid.uuid4()), ontology_id=ontology_id,
        prompt_id=body.get("prompt_id"), model_id=body.get("model_id"),
        status="queued",
        parameters_json=json.dumps(body.get("parameters", {})),
        progress_json=json.dumps({"step": "queued", "step_index": 0, "total_steps": 7, "percentage": 0}),
    )
    db.add(task)
    project.status = "creating"
    db.commit()

    # Dispatch Celery task (or run inline if Celery not available)
    try:
        from app.tasks.extraction import run_extraction_task
        run_extraction_task.delay(task.id)
    except Exception:
        from app.services.extraction_service import run_extraction
        run_extraction(db, task.id)

    return {"data": {"task_id": task.id, "status": "queued",
                     "polling_endpoint": f"/api/v1/ontologies/{ontology_id}/execute/status?task_id={task.id}"}}

@router.get("/{ontology_id}/execute/status")
def get_status(ontology_id: str, task_id: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    task = db.query(ExtractionTask).filter(ExtractionTask.id == task_id).first()
    if not task: raise HTTPException(404, "Task not found")
    progress = json.loads(task.progress_json)
    result = {"task_id": task.id, "status": task.status, "progress": progress}
    if task.status == "failed" and task.error:
        result["error"] = {"message": task.error}
    return {"data": result}
```

- [ ] **Step 9.8: Write execution tests**

```python
# backend/tests/test_execution.py
import io
from unittest.mock import patch
from app.models.ontology import OntologyProject
from app.models.uploaded_file import UploadedFile

MOCK_LLM_RESULT = {
    "entities": [{"name_cn": "华强电子", "name_en": "Huaqiang", "type": "Supplier", "description": "", "properties": {}, "confidence": 0.9}],
    "relations": [],
    "logic_rules": [],
    "actions": []
}

def test_execute_no_files(client, auth_headers, db, admin_user):
    p = OntologyProject(name="Exec Test", domain="供应链", created_by=admin_user.id)
    db.add(p); db.commit()
    r = client.post(f"/api/v1/ontologies/{p.id}/execute",
                    json={"prompt_id": "p1", "model_id": "m1"}, headers=auth_headers)
    assert r.status_code == 400

def test_execute_queues_task(client, auth_headers, db, admin_user):
    p = OntologyProject(name="Exec2", domain="采购", created_by=admin_user.id)
    db.add(p); db.commit()
    f = UploadedFile(ontology_id=p.id, filename="a.md", file_path="/tmp/a.md",
                     file_size=100, mime_type="text/markdown", converted_md="Test content")
    db.add(f); db.commit()

    with patch("app.services.llm_service.extract_ontology", return_value=MOCK_LLM_RESULT):
        r = client.post(f"/api/v1/ontologies/{p.id}/execute",
                        json={"prompt_id": "pid", "model_id": "mid"}, headers=auth_headers)
    assert r.status_code == 202
    task_id = r.json()["data"]["task_id"]

    r2 = client.get(f"/api/v1/ontologies/{p.id}/execute/status?task_id={task_id}", headers=auth_headers)
    assert r2.status_code == 200
    assert r2.json()["data"]["status"] in ("queued", "running", "completed")
```

- [ ] **Step 9.9: Run tests**

```bash
cd backend && pytest tests/test_execution.py -v
# Expected: 2 passed (mocked LLM)
```

- [ ] **Step 9.10: Commit**

```bash
git add . && git commit -m "feat: LLM extraction engine — Celery task, 7-step progress, entity/relation/logic/action write"
```

---

## Task 10: Graph Visualization

**Files:**
- Create: `backend/app/routers/graph.py`
- Create: `frontend/src/types/graph.ts`
- Create: `frontend/src/api/graph.ts`
- Create: `frontend/src/lib/cytoscapeConfig.ts`
- Create: `frontend/src/pages/ontologies/detail/GraphTab.tsx`

- [ ] **Step 10.1: Create backend/app/routers/graph.py**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import json
from app.deps import get_db, get_current_user
from app.models.entity import Entity
from app.models.relation import Relation

router = APIRouter()

ENTITY_COLORS = {
    "Supplier": "#4CAF50", "Material": "#2196F3", "Order": "#FF9800",
    "ProductionLine": "#9C27B0", "Customer": "#F44336",
    "Department": "#795548", "Employee": "#607D8B", "Entity": "#9E9E9E",
}

@router.get("/{ontology_id}/graph")
def get_graph(ontology_id: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    entities = db.query(Entity).filter(Entity.ontology_id == ontology_id).all()
    relations = db.query(Relation).filter(Relation.ontology_id == ontology_id).all()

    nodes = [
        {
            "id": e.id, "label": e.name_cn or e.name_en,
            "type": e.type, "color": ENTITY_COLORS.get(e.type, "#9E9E9E"),
            "confidence": e.confidence,
            "property_summary": json.loads(e.properties_json or "{}"),
        }
        for e in entities
    ]
    edges = [
        {
            "id": r.id, "source": r.source_entity_id, "target": r.target_entity_id,
            "label": r.type, "confidence": r.confidence,
            "properties": json.loads(r.properties_json or "{}"),
        }
        for r in relations
    ]
    return {"data": {
        "nodes": nodes, "edges": edges,
        "meta": {"ontology_id": ontology_id, "node_count": len(nodes), "edge_count": len(edges), "layout_hint": "force-directed"}
    }}
```

- [ ] **Step 10.2: Register graph router in main.py**

```python
from app.routers import graph
app.include_router(graph.router, prefix="/api/v1/ontologies", tags=["graph"])
```

- [ ] **Step 10.3: Install Cytoscape.js in frontend**

```bash
cd frontend && npm install cytoscape cytoscape-layout-utilities
npm install -D @types/cytoscape
```

- [ ] **Step 10.4: Create frontend/src/types/graph.ts**

```typescript
export interface GraphNode {
  id: string; label: string; type: string; color: string
  confidence: number; property_summary: Record<string, unknown>
}
export interface GraphEdge {
  id: string; source: string; target: string; label: string
  confidence: number; properties: Record<string, unknown>
}
export interface GraphData { nodes: GraphNode[]; edges: GraphEdge[]; meta: { node_count: number; edge_count: number } }
```

- [ ] **Step 10.5: Create frontend/src/lib/cytoscapeConfig.ts**

```typescript
export const cytoscapeStylesheet: cytoscape.Stylesheet[] = [
  {
    selector: 'node',
    style: {
      'label': 'data(label)',
      'background-color': 'data(color)',
      'color': '#fff',
      'text-valign': 'center',
      'text-halign': 'center',
      'font-size': '11px',
      'width': 60, 'height': 60,
      'text-wrap': 'wrap',
      'text-max-width': '80px',
      'border-width': 2,
      'border-color': '#fff',
    }
  },
  {
    selector: 'node[confidence < 0.7]',
    style: { 'border-style': 'dashed', 'border-color': '#aaa', 'opacity': 0.75 }
  },
  {
    selector: 'edge',
    style: {
      'label': 'data(label)',
      'curve-style': 'bezier',
      'target-arrow-shape': 'triangle',
      'arrow-scale': 1.2,
      'line-color': '#aaa',
      'target-arrow-color': '#aaa',
      'font-size': '9px',
      'color': '#555',
      'text-rotation': 'autorotate',
    }
  },
  {
    selector: 'edge[confidence < 0.7]',
    style: { 'line-style': 'dashed', 'opacity': 0.6 }
  },
  { selector: ':selected', style: { 'border-color': '#000', 'border-width': 3 } }
]
```

- [ ] **Step 10.6: Create frontend/src/api/graph.ts**

```typescript
import { apiClient } from './client'
import type { GraphData } from '@/types/graph'
export const graphApi = {
  get: (ontologyId: string) => apiClient.get<GraphData>(`/ontologies/${ontologyId}/graph`),
}
```

- [ ] **Step 10.7: Create frontend/src/pages/ontologies/detail/GraphTab.tsx**

```tsx
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import cytoscape from 'cytoscape'
import { graphApi } from '@/api/graph'
import { cytoscapeStylesheet } from '@/lib/cytoscapeConfig'
import type { GraphNode, GraphEdge } from '@/types/graph'

interface Props { ontologyId: string }

export default function GraphTab({ ontologyId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cyRef = useRef<cytoscape.Core | null>(null)
  const [selected, setSelected] = useState<GraphNode | GraphEdge | null>(null)

  const { data } = useQuery({
    queryKey: ['graph', ontologyId],
    queryFn: () => graphApi.get(ontologyId),
  })

  useEffect(() => {
    if (!containerRef.current || !data) return
    if (cyRef.current) cyRef.current.destroy()

    const elements = [
      ...(data as any).nodes.map((n: GraphNode) => ({ data: n })),
      ...(data as any).edges.map((e: GraphEdge) => ({
        data: { id: e.id, source: e.source, target: e.target, label: e.label, confidence: e.confidence }
      })),
    ]

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: cytoscapeStylesheet,
      layout: { name: 'cose', animate: true, randomize: false },
      wheelSensitivity: 0.3,
    })

    cy.on('tap', 'node', e => setSelected(e.target.data()))
    cy.on('tap', 'edge', e => setSelected(e.target.data()))
    cy.on('tap', e => { if (e.target === cy) setSelected(null) })
    cyRef.current = cy

    return () => { cy.destroy(); cyRef.current = null }
  }, [data])

  return (
    <div className="flex gap-4 h-[600px]">
      <div ref={containerRef} className="flex-1 border rounded-lg bg-white" />
      {selected && (
        <div className="w-64 bg-white border rounded-lg p-4 text-sm overflow-auto">
          <h4 className="font-semibold mb-3">
            {'type' in selected && (selected as GraphNode).color ? '实体信息' : '关系信息'}
          </h4>
          {Object.entries(selected).map(([k, v]) => (
            <div key={k} className="mb-1">
              <span className="text-gray-500">{k}: </span>
              <span>{typeof v === 'object' ? JSON.stringify(v) : String(v)}</span>
            </div>
          ))}
        </div>
      )}
      {(!data || (data as any).nodes?.length === 0) && (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          暂无图谱数据，请先执行 LLM 抽取
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 10.8: Commit**

```bash
git add . && git commit -m "feat: graph visualization — Cytoscape.js force-directed, node/edge info panel, confidence styling"
```

---

## Task 11: Entity / Logic / Action CRUD Sub-tabs

**Files:**
- Create: `backend/app/schemas/entity.py`, `logic.py`, `action.py`
- Create: `backend/app/routers/entities.py`, `logic.py`, `actions.py`
- Create: `backend/tests/test_entities.py`, `test_logic.py`, `test_actions.py`
- Create: `frontend/src/components/ConfidenceBar.tsx`
- Create: `frontend/src/pages/ontologies/detail/EntityTab.tsx`
- Create: `frontend/src/pages/ontologies/detail/LogicTab.tsx`
- Create: `frontend/src/pages/ontologies/detail/ActionTab.tsx`
- Create: `frontend/src/pages/ontologies/detail/OntologyDetailPage.tsx`

- [ ] **Step 11.1: Create backend schemas**

`backend/app/schemas/entity.py`:
```python
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, Dict, Any

class EntityCreate(BaseModel):
    name_cn: str; name_en: str = ""; type: str = "Entity"
    description: str = ""; properties: Dict[str, Any] = {}; confidence: float = 0.6

class EntityUpdate(BaseModel):
    name_cn: Optional[str] = None; name_en: Optional[str] = None
    type: Optional[str] = None; description: Optional[str] = None
    properties: Optional[Dict[str, Any]] = None; confidence: Optional[float] = None

class EntityOut(BaseModel):
    id: str; ontology_id: str; name_cn: str; name_en: Optional[str]
    type: str; description: Optional[str]; properties: Dict[str, Any]
    confidence: float; version: int; created_at: datetime; updated_at: datetime
    model_config = {"from_attributes": False}
```

`backend/app/schemas/logic.py`:
```python
from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class LogicCreate(BaseModel):
    name_cn: str; name_en: str = ""; description: str = ""
    formula: str = ""; confidence: float = 0.6

class LogicUpdate(BaseModel):
    name_cn: Optional[str] = None; name_en: Optional[str] = None
    description: Optional[str] = None; formula: Optional[str] = None
    confidence: Optional[float] = None

class LogicOut(BaseModel):
    id: str; ontology_id: str; name_cn: str; name_en: Optional[str]
    description: Optional[str]; formula: Optional[str]
    confidence: float; version: int; created_at: datetime; updated_at: datetime
    model_config = {"from_attributes": False}
```

`backend/app/schemas/action.py`:
```python
from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List

class ActionCreate(BaseModel):
    name_cn: str; name_en: str = ""; description: str = ""
    execution_rule: str = ""; function_code: str = ""
    linked_entities: List[str] = []; linked_logic_ids: List[str] = []
    confidence: float = 0.6

class ActionUpdate(BaseModel):
    name_cn: Optional[str] = None; name_en: Optional[str] = None
    description: Optional[str] = None; execution_rule: Optional[str] = None
    function_code: Optional[str] = None
    linked_entities: Optional[List[str]] = None
    linked_logic_ids: Optional[List[str]] = None
    confidence: Optional[float] = None

class ActionOut(BaseModel):
    id: str; ontology_id: str; name_cn: str; name_en: Optional[str]
    description: Optional[str]; execution_rule: Optional[str]; function_code: Optional[str]
    linked_entities: List[str]; linked_logic_ids: List[str]
    confidence: float; version: int; created_at: datetime; updated_at: datetime
    model_config = {"from_attributes": False}
```

- [ ] **Step 11.2: Create CRUD routers (entity, logic, action)**

`backend/app/routers/entities.py`:
```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
import json, uuid
from app.deps import get_db, get_current_user
from app.models.entity import Entity
from app.schemas.entity import EntityCreate, EntityUpdate, EntityOut

router = APIRouter()

def _to_out(e: Entity) -> EntityOut:
    return EntityOut(id=e.id, ontology_id=e.ontology_id, name_cn=e.name_cn, name_en=e.name_en,
                     type=e.type, description=e.description,
                     properties=json.loads(e.properties_json or "{}"),
                     confidence=e.confidence, version=e.version,
                     created_at=e.created_at, updated_at=e.updated_at)

@router.get("/{ontology_id}/entities")
def list_entities(ontology_id: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    return {"data": [_to_out(e) for e in db.query(Entity).filter(Entity.ontology_id == ontology_id).all()]}

@router.post("/{ontology_id}/entities", status_code=201)
def create_entity(ontology_id: str, body: EntityCreate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    e = Entity(id=str(uuid.uuid4()), ontology_id=ontology_id, name_cn=body.name_cn, name_en=body.name_en,
               type=body.type, description=body.description, properties_json=json.dumps(body.properties),
               confidence=body.confidence)
    db.add(e); db.commit(); db.refresh(e)
    return {"data": _to_out(e)}

@router.get("/{ontology_id}/entities/{entity_id}")
def get_entity(ontology_id: str, entity_id: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    e = db.query(Entity).filter(Entity.id == entity_id, Entity.ontology_id == ontology_id).first()
    if not e: raise HTTPException(404, "Not found")
    return {"data": _to_out(e)}

@router.put("/{ontology_id}/entities/{entity_id}")
def update_entity(ontology_id: str, entity_id: str, body: EntityUpdate,
                  db: Session = Depends(get_db), _=Depends(get_current_user)):
    e = db.query(Entity).filter(Entity.id == entity_id, Entity.ontology_id == ontology_id).first()
    if not e: raise HTTPException(404, "Not found")
    if body.name_cn is not None: e.name_cn = body.name_cn
    if body.name_en is not None: e.name_en = body.name_en
    if body.type is not None: e.type = body.type
    if body.description is not None: e.description = body.description
    if body.properties is not None: e.properties_json = json.dumps(body.properties)
    if body.confidence is not None: e.confidence = body.confidence
    e.version += 1; db.commit(); db.refresh(e)
    return {"data": _to_out(e)}

@router.delete("/{ontology_id}/entities/{entity_id}", status_code=204)
def delete_entity(ontology_id: str, entity_id: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    e = db.query(Entity).filter(Entity.id == entity_id, Entity.ontology_id == ontology_id).first()
    if not e: raise HTTPException(404, "Not found")
    db.delete(e); db.commit()
```

Copy the same pattern for `backend/app/routers/logic.py` (using `LogicRule` model and `LogicCreate/Update/Out`) and `backend/app/routers/actions.py` (using `Action` model and `ActionCreate/Update/Out`). The pattern is identical — just change the model, schema, and field mappings.

- [ ] **Step 11.3: Register routers in main.py**

```python
from app.routers import entities, logic, actions, graph, execution
app.include_router(entities.router, prefix="/api/v1/ontologies", tags=["entities"])
app.include_router(logic.router, prefix="/api/v1/ontologies", tags=["logic"])
app.include_router(actions.router, prefix="/api/v1/ontologies", tags=["actions"])
app.include_router(execution.router, prefix="/api/v1/ontologies", tags=["execution"])
```

- [ ] **Step 11.4: Write entity tests**

```python
# backend/tests/test_entities.py
from app.models.ontology import OntologyProject

def test_entity_crud(client, auth_headers, db, admin_user):
    p = OntologyProject(name="E Test", domain="供应链", created_by=admin_user.id)
    db.add(p); db.commit()

    # Create
    r = client.post(f"/api/v1/ontologies/{p.id}/entities",
                    json={"name_cn": "华强电子", "name_en": "Huaqiang", "type": "Supplier",
                          "description": "A supplier", "properties": {"region": "深圳"}, "confidence": 0.9},
                    headers=auth_headers)
    assert r.status_code == 201
    eid = r.json()["data"]["id"]

    # List
    r2 = client.get(f"/api/v1/ontologies/{p.id}/entities", headers=auth_headers)
    assert len(r2.json()["data"]) == 1

    # Update
    r3 = client.put(f"/api/v1/ontologies/{p.id}/entities/{eid}",
                    json={"name_cn": "华强电子（更新）"}, headers=auth_headers)
    assert r3.json()["data"]["name_cn"] == "华强电子（更新）"
    assert r3.json()["data"]["version"] == 2

    # Delete
    assert client.delete(f"/api/v1/ontologies/{p.id}/entities/{eid}", headers=auth_headers).status_code == 204
```

- [ ] **Step 11.5: Create frontend/src/components/ConfidenceBar.tsx**

```tsx
export default function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100)
  const color = value >= 0.85 ? 'bg-green-500' : value >= 0.6 ? 'bg-yellow-500' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-200 rounded-full h-1.5">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-8">{pct}%</span>
    </div>
  )
}
```

- [ ] **Step 11.6: Create EntityTab.tsx**

```tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/api/client'
import ConfidenceBar from '@/components/ConfidenceBar'

interface Props { ontologyId: string }

export default function EntityTab({ ontologyId }: Props) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState<any | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ name_cn: '', name_en: '', type: 'Entity', description: '', confidence: 0.6 })

  const { data: entities } = useQuery({
    queryKey: ['entities', ontologyId],
    queryFn: () => apiClient.get(`/ontologies/${ontologyId}/entities`),
  })

  const createMut = useMutation({
    mutationFn: () => apiClient.post(`/ontologies/${ontologyId}/entities`, form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['entities', ontologyId] }); setShowCreate(false) }
  })
  const updateMut = useMutation({
    mutationFn: (data: any) => apiClient.put(`/ontologies/${ontologyId}/entities/${editing.id}`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['entities', ontologyId] }); setEditing(null) }
  })
  const deleteMut = useMutation({
    mutationFn: (id: string) => apiClient.delete(`/ontologies/${ontologyId}/entities/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['entities', ontologyId] })
  })

  const items: any[] = (entities as any) || []

  return (
    <div>
      <div className="flex justify-between mb-4">
        <h3 className="font-medium">实体列表</h3>
        <button onClick={() => setShowCreate(true)} className="bg-black text-white px-3 py-1.5 rounded text-sm">新增实体</button>
      </div>
      <table className="w-full text-sm bg-white rounded-lg shadow overflow-hidden">
        <thead className="bg-gray-50 border-b">
          <tr>{['中文名','英文名','类型','置信度','操作'].map(h => (
            <th key={h} className="px-4 py-3 text-left text-gray-500 font-medium">{h}</th>
          ))}</tr>
        </thead>
        <tbody>
          {items.map((e: any) => (
            <tr key={e.id} className="border-b hover:bg-gray-50">
              <td className="px-4 py-3 font-medium">{e.name_cn}</td>
              <td className="px-4 py-3 text-gray-500">{e.name_en}</td>
              <td className="px-4 py-3"><span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs">{e.type}</span></td>
              <td className="px-4 py-3 w-32"><ConfidenceBar value={e.confidence} /></td>
              <td className="px-4 py-3">
                <button onClick={() => setEditing(e)} className="text-blue-600 hover:underline mr-2">编辑</button>
                <button onClick={() => deleteMut.mutate(e.id)} className="text-red-600 hover:underline">删除</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && <p className="text-center text-gray-400 py-8">暂无实体</p>}

      {(showCreate || editing) && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-[480px]">
            <h3 className="font-semibold mb-4">{editing ? '编辑实体' : '新增实体'}</h3>
            {[['中文名', 'name_cn'], ['英文名', 'name_en'], ['类型', 'type'], ['描述', 'description']].map(([label, field]) => (
              <div key={field} className="mb-3">
                <label className="text-sm text-gray-600">{label}</label>
                <input value={editing ? editing[field] : (form as any)[field]}
                  onChange={e => editing
                    ? setEditing((prev: any) => ({ ...prev, [field]: e.target.value }))
                    : setForm(prev => ({ ...prev, [field]: e.target.value }))}
                  className="mt-1 w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
            ))}
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => { setShowCreate(false); setEditing(null) }} className="border px-4 py-2 rounded-lg text-sm">取消</button>
              <button onClick={() => editing ? updateMut.mutate(editing) : createMut.mutate()}
                className="bg-black text-white px-4 py-2 rounded-lg text-sm">保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 11.7: Create LogicTab.tsx and ActionTab.tsx** (same pattern as EntityTab — change API endpoint and fields)

`LogicTab.tsx` fields: `name_cn`, `name_en`, `description`, `formula`. API: `/ontologies/${id}/logic`.

`ActionTab.tsx` fields: `name_cn`, `name_en`, `description`, `execution_rule`, `function_code` (textarea). API: `/ontologies/${id}/actions`.

- [ ] **Step 11.8: Create OntologyDetailPage.tsx**

```tsx
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ontologyApi } from '@/api/ontologies'
import GraphTab from './GraphTab'
import EntityTab from './EntityTab'
import LogicTab from './LogicTab'
import ActionTab from './ActionTab'

const TABS = [
  { key: 'graph', label: '图谱可视化' },
  { key: 'entity', label: '实体(Entity)' },
  { key: 'logic', label: '逻辑(Logic)' },
  { key: 'action', label: '行动(Action)' },
]

export default function OntologyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [tab, setTab] = useState('graph')
  const { data: ontology } = useQuery({ queryKey: ['ontology', id], queryFn: () => ontologyApi.get(id!) })

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold">{(ontology as any)?.name}</h2>
          <span className="text-sm text-gray-500">{(ontology as any)?.version}</span>
        </div>
        <button onClick={() => navigate('/ontologies')} className="text-sm text-gray-500 hover:underline">
          返回 Ontology 列表
        </button>
      </div>

      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-md text-sm transition-colors
              ${tab === t.key ? 'bg-white shadow text-black' : 'text-gray-600 hover:text-black'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'graph' && <GraphTab ontologyId={id!} />}
      {tab === 'entity' && <EntityTab ontologyId={id!} />}
      {tab === 'logic' && <LogicTab ontologyId={id!} />}
      {tab === 'action' && <ActionTab ontologyId={id!} />}
    </div>
  )
}
```

- [ ] **Step 11.9: Wire OntologyCreatePage.tsx with all 3 steps**

```tsx
// frontend/src/pages/ontologies/create/OntologyCreatePage.tsx
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import StepUpload from './StepUpload'
import StepPromptModel from './StepPromptModel'
import StepProgress from './StepProgress'

export default function OntologyCreatePage() {
  const { id } = useParams<{ id: string }>()
  const [step, setStep] = useState(0)
  const [taskId, setTaskId] = useState('')

  return (
    <div className="max-w-2xl">
      <h2 className="text-xl font-semibold mb-6">创建 Ontology</h2>
      <div className="flex gap-2 mb-8">
        {['数据导入', 'Prompt & 模型', '构建进度'].map((s, i) => (
          <div key={s} className={`flex items-center gap-2 text-sm ${i <= step ? 'text-black' : 'text-gray-400'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs
              ${i < step ? 'bg-black text-white' : i === step ? 'border-2 border-black' : 'border-2 border-gray-300'}`}>
              {i + 1}
            </span>
            {s}
            {i < 2 && <span className="text-gray-300">→</span>}
          </div>
        ))}
      </div>
      <div className="bg-white rounded-lg shadow p-6">
        {step === 0 && <StepUpload ontologyId={id!} onNext={() => setStep(1)} />}
        {step === 1 && <StepPromptModel ontologyId={id!} onNext={(tid) => { setTaskId(tid); setStep(2) }} onBack={() => setStep(0)} />}
        {step === 2 && <StepProgress ontologyId={id!} taskId={taskId} />}
      </div>
    </div>
  )
}
```

- [ ] **Step 11.10: Create StepPromptModel.tsx**

```tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { promptApi } from '@/api/prompts'
import { modelApi } from '@/api/models'
import { apiClient } from '@/api/client'

interface Props { ontologyId: string; onNext: (taskId: string) => void; onBack: () => void }

export default function StepPromptModel({ ontologyId, onNext, onBack }: Props) {
  const [promptId, setPromptId] = useState('')
  const [modelId, setModelId] = useState('')
  const [error, setError] = useState('')

  const { data: prompts } = useQuery({ queryKey: ['prompts'], queryFn: () => promptApi.list() })
  const { data: models } = useQuery({ queryKey: ['models'], queryFn: () => modelApi.list() })

  const handleExecute = async () => {
    if (!promptId || !modelId) { setError('请选择 Prompt 和模型'); return }
    try {
      const res: any = await apiClient.post(`/ontologies/${ontologyId}/execute`, {
        prompt_id: promptId, model_id: modelId,
        parameters: { temperature: 0.1, max_tokens: 8192, timeout_seconds: 120, retry_count: 2 }
      })
      onNext(res.task_id)
    } catch (e: any) { setError(e.message || '启动失败') }
  }

  return (
    <div className="space-y-4">
      <h3 className="font-medium">② Prompt 与模型选择</h3>
      <div>
        <label className="text-sm text-gray-600">Prompt 模板</label>
        <select value={promptId} onChange={e => setPromptId(e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm">
          <option value="">请选择 Prompt</option>
          {(prompts as any)?.items?.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div>
        <label className="text-sm text-gray-600">LLM 模型</label>
        <select value={modelId} onChange={e => setModelId(e.target.value)} className="mt-1 w-full border rounded-lg px-3 py-2 text-sm">
          <option value="">请选择模型</option>
          {(models as any)?.map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        {!(models as any)?.length && <p className="text-xs text-amber-600 mt-1">⚠ 当前未配置任何模型，请先前往「模型管理」配置</p>}
      </div>
      {error && <p className="text-red-500 text-sm">{error}</p>}
      <div className="flex justify-between">
        <button onClick={onBack} className="border px-4 py-2 rounded-lg text-sm">上一步</button>
        <button onClick={handleExecute} className="bg-black text-white px-6 py-2 rounded-lg text-sm">确定</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 11.11: Create StepProgress.tsx**

```tsx
import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '@/api/client'

interface Props { ontologyId: string; taskId: string }

export default function StepProgress({ ontologyId, taskId }: Props) {
  const navigate = useNavigate()
  const { data, refetch } = useQuery({
    queryKey: ['task-status', taskId],
    queryFn: () => apiClient.get(`/ontologies/${ontologyId}/execute/status?task_id=${taskId}`),
    refetchInterval: (data: any) => ['completed', 'failed'].includes(data?.status) ? false : 2000,
  })

  const status = (data as any)?.status
  const progress = (data as any)?.progress

  return (
    <div className="space-y-4">
      <h3 className="font-medium">③ 构建进度</h3>
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex justify-between text-sm mb-2">
          <span>{progress?.step || 'queued'}</span>
          <span>{progress?.percentage ?? 0}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div className="bg-black h-2 rounded-full transition-all" style={{ width: `${progress?.percentage ?? 0}%` }} />
        </div>
        {status === 'completed' && <p className="text-green-600 mt-2 text-sm">✅ 抽取完成！</p>}
        {status === 'failed' && <p className="text-red-600 mt-2 text-sm">❌ 抽取失败: {(data as any)?.error?.message}</p>}
      </div>
      <div className="flex justify-between">
        <button onClick={() => navigate('/ontologies')} className="border px-4 py-2 rounded-lg text-sm">回到 Ontology 列表</button>
        {status === 'completed' && (
          <button onClick={() => navigate(`/ontologies/${ontologyId}`)} className="bg-black text-white px-4 py-2 rounded-lg text-sm">
            查看结果
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 11.12: Add detail and create routes to App.tsx**

```tsx
// Add to App.tsx routes:
import OntologyDetailPage from '@/pages/ontologies/detail/OntologyDetailPage'
import OntologyCreatePage from '@/pages/ontologies/create/OntologyCreatePage'
import PromptListPage from '@/pages/prompts/PromptListPage'
import PromptDetailPage from '@/pages/prompts/PromptDetailPage'
import PromptCreatePage from '@/pages/prompts/PromptCreatePage'
import ModelsPage from '@/pages/models/ModelsPage'

// Inside Routes:
<Route path="/ontologies/:id" element={<ProtectedRoute><OntologyDetailPage /></ProtectedRoute>} />
<Route path="/ontologies/:id/create" element={<ProtectedRoute><OntologyCreatePage /></ProtectedRoute>} />
<Route path="/prompts" element={<ProtectedRoute><PromptListPage /></ProtectedRoute>} />
<Route path="/prompts/create" element={<ProtectedRoute><PromptCreatePage /></ProtectedRoute>} />
<Route path="/prompts/:id" element={<ProtectedRoute><PromptDetailPage /></ProtectedRoute>} />
<Route path="/models" element={<ProtectedRoute><ModelsPage /></ProtectedRoute>} />
```

- [ ] **Step 11.13: Run all backend tests**

```bash
cd backend && pytest tests/ -v
# Expected: all tests pass
```

- [ ] **Step 11.14: Commit**

```bash
git add . && git commit -m "feat: entity/logic/action CRUD sub-tabs, ontology detail 4-tab page, create wizard complete"
```

---

**End of Part 3.** Continue with Part 4 for Settings, Export, i18n, and full test suite.
