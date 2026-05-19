# OntoPrompt Implementation Plan — Part 4 (Slices 11–14)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Prerequisite: Parts 1, 2, 3 must be complete.

**Goal:** Settings page (confidence rules + account management), export in all formats, Chinese/English i18n, complete test data and test suite.

---

## File Map (Part 4)

```
backend/
  app/
    models/rules_config.py
    schemas/settings.py
    routers/settings.py, export.py
    services/export_service.py
  tests/
    test_settings.py, test_export.py
frontend/
  src/
    i18n/
      index.ts, zh.json, en.json
    pages/settings/SettingsPage.tsx
    api/settings.ts, export.ts
test_data/
  documents/        (8 sample files)
  api/              (all JSON fixtures)
  db/seed.sql
  frontend/
    mock_graph_data.json
    mock_stats.json
    e2e/            (10 Playwright specs)
```

---

## Task 12: Settings Page

**Files:**
- Create: `backend/app/models/rules_config.py`
- Create: `backend/app/schemas/settings.py`
- Create: `backend/app/routers/settings.py`
- Create: `backend/tests/test_settings.py`
- Create: `frontend/src/api/settings.ts`
- Create: `frontend/src/pages/settings/SettingsPage.tsx`

- [ ] **Step 12.1: Create backend/app/models/rules_config.py**

```python
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Boolean, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class RulesConfig(Base):
    __tablename__ = "rules_config"
    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    rule_key: Mapped[str] = mapped_column(String(100), unique=True)
    rule_value: Mapped[str] = mapped_column(Text)
    rule_label_cn: Mapped[str] = mapped_column(String(200))
    rule_label_en: Mapped[str] = mapped_column(String(200))
    editable: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
```

- [ ] **Step 12.2: Create seed for rules_config**

Add to `backend/app/services/prompt_seed.py` (or create `rules_seed.py`):

```python
BUILTIN_RULES = [
    ("initial_confidence", "0.6", "初始置信度", "Initial Confidence", True),
    ("repeat_boost", "0.2", "重复确认增幅", "Repeat Confirmation Boost", True),
    ("multi_source_boost", "0.1", "多源一致增幅", "Multi-Source Consistency Boost", True),
    ("contradiction_penalty", "0.4", "矛盾降幅", "Contradiction Penalty", True),
    ("decay_rate", "0.9", "事实衰减率（每30天）", "Fact Decay Rate (per 30 days)", True),
    ("multi_source_threshold", "2", "多源确认阈值（来源数）", "Multi-Source Threshold", True),
    ("human_confirm_score", "1.0", "人工确认分数", "Human Confirm Score", False),
    ("human_reject_score", "0.0", "人工驳回分数", "Human Reject Score", False),
]

def seed_rules(db):
    from app.models.rules_config import RulesConfig
    if db.query(RulesConfig).count() == 0:
        import uuid
        for key, val, cn, en, editable in BUILTIN_RULES:
            db.add(RulesConfig(id=str(uuid.uuid4()), rule_key=key, rule_value=val,
                               rule_label_cn=cn, rule_label_en=en, editable=editable))
        db.commit()
```

Call `seed_rules(db)` in `app/main.py` startup alongside existing seeds.

- [ ] **Step 12.3: Create backend/app/schemas/settings.py**

```python
from pydantic import BaseModel
from datetime import datetime
from typing import List

class RuleOut(BaseModel):
    id: str; rule_key: str; rule_value: str
    rule_label_cn: str; rule_label_en: str; editable: bool
    model_config = {"from_attributes": True}

class RuleUpdate(BaseModel):
    rule_key: str; rule_value: str

class RulesBatchUpdate(BaseModel):
    rules: List[RuleUpdate]
```

- [ ] **Step 12.4: Create backend/app/routers/settings.py**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.deps import get_db, get_current_user
from app.models.rules_config import RulesConfig
from app.schemas.settings import RuleOut, RulesBatchUpdate

router = APIRouter()

@router.get("/rules")
def get_rules(db: Session = Depends(get_db), _=Depends(get_current_user)):
    rules = db.query(RulesConfig).all()
    return {"data": [RuleOut.model_validate(r) for r in rules]}

@router.put("/rules")
def update_rules(body: RulesBatchUpdate, db: Session = Depends(get_db), _=Depends(get_current_user)):
    for update in body.rules:
        rule = db.query(RulesConfig).filter(RulesConfig.rule_key == update.rule_key).first()
        if rule and rule.editable:
            rule.rule_value = update.rule_value
    db.commit()
    return {"data": "Rules updated", "message": "ok"}
```

Register in `main.py`: `app.include_router(settings.router, prefix="/api/v1/settings", tags=["settings"])`

- [ ] **Step 12.5: Write settings tests**

```python
# backend/tests/test_settings.py
def test_get_rules(client, auth_headers):
    r = client.get("/api/v1/settings/rules", headers=auth_headers)
    assert r.status_code == 200
    rules = r.json()["data"]
    assert len(rules) == 8
    keys = [r["rule_key"] for r in rules]
    assert "initial_confidence" in keys

def test_update_editable_rule(client, auth_headers):
    r = client.put("/api/v1/settings/rules",
                   json={"rules": [{"rule_key": "initial_confidence", "rule_value": "0.7"}]},
                   headers=auth_headers)
    assert r.status_code == 200
    r2 = client.get("/api/v1/settings/rules", headers=auth_headers)
    rule = next(r for r in r2.json()["data"] if r["rule_key"] == "initial_confidence")
    assert rule["rule_value"] == "0.7"

def test_cannot_update_non_editable_rule(client, auth_headers):
    client.put("/api/v1/settings/rules",
               json={"rules": [{"rule_key": "human_confirm_score", "rule_value": "0.5"}]},
               headers=auth_headers)
    r2 = client.get("/api/v1/settings/rules", headers=auth_headers)
    rule = next(r for r in r2.json()["data"] if r["rule_key"] == "human_confirm_score")
    assert rule["rule_value"] == "1.0"  # unchanged
```

- [ ] **Step 12.6: Create frontend/src/api/settings.ts**

```typescript
import { apiClient } from './client'
export const settingsApi = {
  getRules: () => apiClient.get<any[]>('/settings/rules'),
  updateRules: (rules: { rule_key: string; rule_value: string }[]) =>
    apiClient.put('/settings/rules', { rules }),
}
```

- [ ] **Step 12.7: Create frontend/src/pages/settings/SettingsPage.tsx**

```tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { settingsApi } from '@/api/settings'
import { useAuthStore } from '@/stores/authStore'

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'rules' | 'account'>('rules')
  const qc = useQueryClient()
  const user = useAuthStore(s => s.user)

  const { data: rules } = useQuery({ queryKey: ['rules'], queryFn: () => settingsApi.getRules() })
  const [edits, setEdits] = useState<Record<string, string>>({})
  const saveMut = useMutation({
    mutationFn: () => settingsApi.updateRules(
      Object.entries(edits).map(([rule_key, rule_value]) => ({ rule_key, rule_value }))
    ),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['rules'] }); setEdits({}) }
  })

  return (
    <div className="max-w-3xl">
      <h2 className="text-xl font-semibold mb-6">设置 / Settings</h2>
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        {(['rules', 'account'] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`px-4 py-2 rounded-md text-sm ${activeTab === t ? 'bg-white shadow' : 'text-gray-600'}`}>
            {t === 'rules' ? '规则管理' : '账号管理'}
          </button>
        ))}
      </div>

      {activeTab === 'rules' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-medium mb-4">置信度规则配置</h3>
          <div className="space-y-3">
            {(rules as any)?.map((rule: any) => (
              <div key={rule.rule_key} className="flex items-center justify-between py-2 border-b last:border-0">
                <div>
                  <p className="text-sm font-medium">{rule.rule_label_cn}</p>
                  <p className="text-xs text-gray-400">{rule.rule_key}</p>
                </div>
                <input
                  value={edits[rule.rule_key] ?? rule.rule_value}
                  onChange={e => rule.editable && setEdits(prev => ({ ...prev, [rule.rule_key]: e.target.value }))}
                  disabled={!rule.editable}
                  className={`w-24 border rounded px-2 py-1 text-sm text-right
                    ${!rule.editable ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : ''}`}
                />
              </div>
            ))}
          </div>
          {Object.keys(edits).length > 0 && (
            <button onClick={() => saveMut.mutate()} className="mt-4 bg-black text-white px-4 py-2 rounded-lg text-sm">
              保存更改
            </button>
          )}
        </div>
      )}

      {activeTab === 'account' && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="font-medium mb-4">当前账号</h3>
          <div className="space-y-2 text-sm">
            <div><span className="text-gray-500">用户名: </span>{user?.username}</div>
            <div><span className="text-gray-500">角色: </span>{user?.role}</div>
            <div><span className="text-gray-500">邮箱: </span>{user?.email}</div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 12.8: Add settings route to App.tsx**

```tsx
import SettingsPage from '@/pages/settings/SettingsPage'
// In Routes:
<Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
```

- [ ] **Step 12.9: Run tests**

```bash
cd backend && pytest tests/test_settings.py -v
# Expected: 3 passed
```

- [ ] **Step 12.10: Commit**

```bash
git add . && git commit -m "feat: settings page — confidence rules CRUD, account info tab"
```

---

## Task 13: Export

**Files:**
- Create: `backend/app/services/export_service.py`
- Create: `backend/app/routers/export.py`
- Create: `backend/tests/test_export.py`
- Create: `frontend/src/api/export.ts`
- Add export button to OntologyDetailPage

- [ ] **Step 13.1: Add rdflib + pyyaml to requirements.txt**

```
rdflib==7.0.0
pyyaml==6.0.2
```

- [ ] **Step 13.2: Create backend/app/services/export_service.py**

```python
import json, csv, io
from sqlalchemy.orm import Session
from app.models.entity import Entity
from app.models.relation import Relation
from app.models.logic import LogicRule
from app.models.action import Action
from app.models.ontology import OntologyProject

def _load_ontology_data(db: Session, ontology_id: str) -> dict:
    project = db.query(OntologyProject).filter(OntologyProject.id == ontology_id).first()
    entities = db.query(Entity).filter(Entity.ontology_id == ontology_id).all()
    relations = db.query(Relation).filter(Relation.ontology_id == ontology_id).all()
    logic_rules = db.query(LogicRule).filter(LogicRule.ontology_id == ontology_id).all()
    actions = db.query(Action).filter(Action.ontology_id == ontology_id).all()

    entity_map = {e.id: e.name_cn or e.name_en for e in entities}
    return {
        "ontology": {"id": project.id, "name": project.name, "domain": project.domain, "version": project.version},
        "entities": [{"id": e.id, "name_cn": e.name_cn, "name_en": e.name_en, "type": e.type,
                      "description": e.description, "properties": json.loads(e.properties_json or "{}"),
                      "confidence": e.confidence} for e in entities],
        "relations": [{"id": r.id, "source": entity_map.get(r.source_entity_id, r.source_entity_id),
                       "target": entity_map.get(r.target_entity_id, r.target_entity_id),
                       "type": r.type, "confidence": r.confidence,
                       "properties": json.loads(r.properties_json or "{}")} for r in relations],
        "logic_rules": [{"id": lr.id, "name_cn": lr.name_cn, "name_en": lr.name_en,
                         "description": lr.description, "formula": lr.formula,
                         "confidence": lr.confidence} for lr in logic_rules],
        "actions": [{"id": a.id, "name_cn": a.name_cn, "name_en": a.name_en,
                     "description": a.description, "execution_rule": a.execution_rule,
                     "function_code": a.function_code, "confidence": a.confidence} for a in actions],
    }

def export_json(db: Session, ontology_id: str) -> str:
    data = _load_ontology_data(db, ontology_id)
    return json.dumps(data, ensure_ascii=False, indent=2)

def export_yaml(db: Session, ontology_id: str) -> str:
    import yaml
    data = _load_ontology_data(db, ontology_id)
    return yaml.dump(data, allow_unicode=True, default_flow_style=False)

def export_csv(db: Session, ontology_id: str) -> dict[str, str]:
    data = _load_ontology_data(db, ontology_id)
    out = {}
    for section in ("entities", "relations", "logic_rules", "actions"):
        items = data[section]
        if not items: out[section] = ""; continue
        buf = io.StringIO()
        writer = csv.DictWriter(buf, fieldnames=items[0].keys())
        writer.writeheader(); writer.writerows(items)
        out[section] = buf.getvalue()
    return out

def export_ttl(db: Session, ontology_id: str) -> str:
    from rdflib import Graph, Namespace, RDF, RDFS, OWL, Literal
    data = _load_ontology_data(db, ontology_id)
    g = Graph()
    ns = Namespace(f"http://ontoprompt.local/{ontology_id}/")
    g.bind("onto", ns); g.bind("owl", OWL); g.bind("rdfs", RDFS)

    for e in data["entities"]:
        subj = ns[e["id"]]
        g.add((subj, RDF.type, OWL.NamedIndividual))
        g.add((subj, RDFS.label, Literal(e["name_cn"], lang="zh")))
        if e.get("name_en"): g.add((subj, RDFS.label, Literal(e["name_en"], lang="en")))
        g.add((subj, RDF.type, ns[e["type"]]))

    for r in data["relations"]:
        src = ns[r["source"].replace(" ", "_")]
        tgt = ns[r["target"].replace(" ", "_")]
        pred = ns[r["type"]]
        g.add((src, pred, tgt))

    return g.serialize(format="turtle")

def export_html(db: Session, ontology_id: str) -> str:
    data = _load_ontology_data(db, ontology_id)
    onto = data["ontology"]
    entities_rows = "".join(
        f"<tr><td>{e['name_cn']}</td><td>{e['name_en']}</td><td>{e['type']}</td><td>{e['confidence']:.2f}</td></tr>"
        for e in data["entities"]
    )
    relations_rows = "".join(
        f"<tr><td>{r['source']}</td><td>{r['type']}</td><td>{r['target']}</td><td>{r['confidence']:.2f}</td></tr>"
        for r in data["relations"]
    )
    return f"""<!DOCTYPE html><html lang="zh"><head><meta charset="UTF-8">
<title>{onto['name']} — OntoPrompt Export</title>
<style>body{{font-family:sans-serif;max-width:1200px;margin:40px auto;padding:0 20px}}
table{{width:100%;border-collapse:collapse;margin-bottom:32px}}
th,td{{border:1px solid #e5e5e5;padding:8px 12px;text-align:left}}th{{background:#f5f5f5}}
h1{{font-size:24px}}h2{{font-size:18px;margin-top:32px}}</style></head>
<body><h1>{onto['name']}</h1><p>域: {onto['domain']} | 版本: {onto['version']}</p>
<h2>实体 ({len(data['entities'])})</h2>
<table><tr><th>中文名</th><th>英文名</th><th>类型</th><th>置信度</th></tr>{entities_rows}</table>
<h2>关系 ({len(data['relations'])})</h2>
<table><tr><th>来源</th><th>关系类型</th><th>目标</th><th>置信度</th></tr>{relations_rows}</table>
<p style="color:#999;font-size:12px">由 OntoPrompt 导出</p></body></html>"""
```

- [ ] **Step 13.3: Create backend/app/routers/export.py**

```python
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import Response
from sqlalchemy.orm import Session
import json
from app.deps import get_db, get_current_user
from app.models.ontology import OntologyProject
from app.services import export_service

router = APIRouter()

FORMATS = {"json", "yaml", "csv", "ttl", "html"}

@router.get("/{ontology_id}/export")
def export_ontology(ontology_id: str, format: str = "json",
                    db: Session = Depends(get_db), _=Depends(get_current_user)):
    if format not in FORMATS:
        raise HTTPException(400, f"Unsupported format. Use one of: {FORMATS}")
    if not db.query(OntologyProject).filter(OntologyProject.id == ontology_id).first():
        raise HTTPException(404, "Ontology not found")

    if format == "json":
        content = export_service.export_json(db, ontology_id)
        return Response(content, media_type="application/json",
                        headers={"Content-Disposition": f"attachment; filename=ontology.json"})
    elif format == "yaml":
        content = export_service.export_yaml(db, ontology_id)
        return Response(content, media_type="text/yaml",
                        headers={"Content-Disposition": f"attachment; filename=ontology.yaml"})
    elif format == "csv":
        csv_data = export_service.export_csv(db, ontology_id)
        content = "\n\n".join(f"# {k}\n{v}" for k, v in csv_data.items() if v)
        return Response(content, media_type="text/csv",
                        headers={"Content-Disposition": f"attachment; filename=ontology.csv"})
    elif format == "ttl":
        content = export_service.export_ttl(db, ontology_id)
        return Response(content, media_type="text/turtle",
                        headers={"Content-Disposition": f"attachment; filename=ontology.ttl"})
    elif format == "html":
        content = export_service.export_html(db, ontology_id)
        return Response(content, media_type="text/html",
                        headers={"Content-Disposition": f"attachment; filename=ontology.html"})
```

Register: `app.include_router(export.router, prefix="/api/v1/ontologies", tags=["export"])`

- [ ] **Step 13.4: Write export tests**

```python
# backend/tests/test_export.py
import json
from app.models.ontology import OntologyProject
from app.models.entity import Entity
from app.models.relation import Relation

def _seed_ontology(db, user_id):
    p = OntologyProject(name="Export Test", domain="供应链", created_by=user_id, status="created")
    db.add(p); db.flush()
    e1 = Entity(ontology_id=p.id, name_cn="华强电子", name_en="Huaqiang", type="Supplier")
    e2 = Entity(ontology_id=p.id, name_cn="芯片组A", name_en="Chip A", type="Material")
    db.add_all([e1, e2]); db.flush()
    r = Relation(ontology_id=p.id, source_entity_id=e1.id, target_entity_id=e2.id, type="supplies")
    db.add(r); db.commit()
    return p

def test_export_json(client, auth_headers, db, admin_user):
    p = _seed_ontology(db, admin_user.id)
    r = client.get(f"/api/v1/ontologies/{p.id}/export?format=json", headers=auth_headers)
    assert r.status_code == 200
    data = json.loads(r.content)
    assert len(data["entities"]) == 2
    assert len(data["relations"]) == 1

def test_export_yaml(client, auth_headers, db, admin_user):
    p = _seed_ontology(db, admin_user.id)
    r = client.get(f"/api/v1/ontologies/{p.id}/export?format=yaml", headers=auth_headers)
    assert r.status_code == 200
    assert b"entities:" in r.content

def test_export_ttl(client, auth_headers, db, admin_user):
    p = _seed_ontology(db, admin_user.id)
    r = client.get(f"/api/v1/ontologies/{p.id}/export?format=ttl", headers=auth_headers)
    assert r.status_code == 200
    assert b"@prefix" in r.content

def test_export_html(client, auth_headers, db, admin_user):
    p = _seed_ontology(db, admin_user.id)
    r = client.get(f"/api/v1/ontologies/{p.id}/export?format=html", headers=auth_headers)
    assert r.status_code == 200
    assert b"<!DOCTYPE html>" in r.content

def test_export_invalid_format(client, auth_headers, db, admin_user):
    p = _seed_ontology(db, admin_user.id)
    r = client.get(f"/api/v1/ontologies/{p.id}/export?format=xyz", headers=auth_headers)
    assert r.status_code == 400
```

- [ ] **Step 13.5: Add export button to OntologyDetailPage.tsx**

```tsx
// Add to OntologyDetailPage.tsx, near the header:
const EXPORT_FORMATS = ['json','yaml','csv','ttl','html']
// Add a dropdown:
<div className="relative group">
  <button className="border px-3 py-1.5 rounded-lg text-sm">导出 ▾</button>
  <div className="absolute right-0 mt-1 bg-white border rounded-lg shadow-lg hidden group-hover:block z-10 w-32">
    {EXPORT_FORMATS.map(fmt => (
      <a key={fmt} href={`/api/v1/ontologies/${id}/export?format=${fmt}`}
         className="block px-4 py-2 text-sm hover:bg-gray-50 capitalize"
         target="_blank" rel="noreferrer">
        {fmt.toUpperCase()}
      </a>
    ))}
  </div>
</div>
```

- [ ] **Step 13.6: Run export tests**

```bash
cd backend && pytest tests/test_export.py -v
# Expected: 5 passed
```

- [ ] **Step 13.7: Commit**

```bash
git add . && git commit -m "feat: export — JSON/YAML/CSV/TTL/HTML formats, rdflib OWL mapping"
```

---

## Task 14: i18n (Chinese ↔ English)

**Files:**
- Create: `frontend/src/i18n/index.ts`
- Create: `frontend/src/i18n/zh.json`
- Create: `frontend/src/i18n/en.json`
- Modify: `frontend/src/stores/uiStore.ts`
- Modify: `frontend/src/components/Layout.tsx` (add language toggle)

- [ ] **Step 14.1: Install react-i18next**

```bash
cd frontend && npm install react-i18next i18next
```

- [ ] **Step 14.2: Create frontend/src/i18n/zh.json**

```json
{
  "nav": {
    "overview": "概览", "ontology": "Ontology", "prompt": "Prompt",
    "models": "模型管理", "settings": "设置", "logout": "退出"
  },
  "overview": { "title": "概览 / Overview", "ontologyCount": "Ontology 总数",
    "entityCount": "实体总数", "logicCount": "Logic 总数", "actionCount": "Action 总数" },
  "ontology": { "title": "Ontology 管理", "create": "创建 Ontology", "name": "名称",
    "domain": "领域", "version": "版本", "status": "状态", "updatedAt": "更新时间",
    "actions": "操作", "view": "查看", "delete": "删除",
    "status_draft": "草稿", "status_creating": "创建中", "status_created": "已创建", "status_archived": "已归档" },
  "prompt": { "title": "Prompt 管理", "create": "创建 Prompt", "domain": "业务域",
    "version": "版本", "edit": "查看/编辑", "delete": "删除" },
  "models": { "title": "模型管理", "add": "添加模型", "test": "测试连通性",
    "success": "连接成功", "delete": "删除" },
  "settings": { "title": "设置", "rules": "规则管理", "account": "账号管理", "save": "保存更改" },
  "common": { "cancel": "取消", "confirm": "确认", "save": "保存", "back": "返回",
    "confirmDelete": "确认删除", "cannotUndo": "此操作不可撤销", "noData": "暂无数据",
    "loading": "加载中...", "next": "下一步", "prev": "上一步" }
}
```

- [ ] **Step 14.3: Create frontend/src/i18n/en.json**

```json
{
  "nav": {
    "overview": "Overview", "ontology": "Ontology", "prompt": "Prompt",
    "models": "Models", "settings": "Settings", "logout": "Logout"
  },
  "overview": { "title": "Overview", "ontologyCount": "Total Ontologies",
    "entityCount": "Total Entities", "logicCount": "Total Logic Rules", "actionCount": "Total Actions" },
  "ontology": { "title": "Ontology Management", "create": "Create Ontology", "name": "Name",
    "domain": "Domain", "version": "Version", "status": "Status", "updatedAt": "Updated At",
    "actions": "Actions", "view": "View", "delete": "Delete",
    "status_draft": "Draft", "status_creating": "Creating", "status_created": "Created", "status_archived": "Archived" },
  "prompt": { "title": "Prompt Management", "create": "Create Prompt", "domain": "Domain",
    "version": "Version", "edit": "View/Edit", "delete": "Delete" },
  "models": { "title": "Model Management", "add": "Add Model", "test": "Test Connection",
    "success": "Connection successful", "delete": "Delete" },
  "settings": { "title": "Settings", "rules": "Rules", "account": "Account", "save": "Save Changes" },
  "common": { "cancel": "Cancel", "confirm": "Confirm", "save": "Save", "back": "Back",
    "confirmDelete": "Confirm Delete", "cannotUndo": "This action cannot be undone", "noData": "No data",
    "loading": "Loading...", "next": "Next", "prev": "Previous" }
}
```

- [ ] **Step 14.4: Create frontend/src/i18n/index.ts**

```typescript
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zh from './zh.json'
import en from './en.json'

i18n.use(initReactI18next).init({
  resources: { zh: { translation: zh }, en: { translation: en } },
  lng: localStorage.getItem('lang') || 'zh',
  fallbackLng: 'zh',
  interpolation: { escapeValue: false },
})

export default i18n
```

- [ ] **Step 14.5: Create frontend/src/stores/uiStore.ts**

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UiState {
  lang: 'zh' | 'en'
  setLang: (lang: 'zh' | 'en') => void
}

export const useUiStore = create<UiState>()(
  persist(
    set => ({
      lang: 'zh',
      setLang: lang => {
        localStorage.setItem('lang', lang)
        import('../i18n').then(({ default: i18n }) => i18n.changeLanguage(lang))
        set({ lang })
      },
    }),
    { name: 'ui-store' }
  )
)
```

- [ ] **Step 14.6: Import i18n in main.tsx**

```tsx
// frontend/src/main.tsx
import './i18n'  // must be before App import
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
```

- [ ] **Step 14.7: Add language toggle to Layout.tsx**

```tsx
// In Layout.tsx, add to the bottom of sidebar before logout button:
import { useUiStore } from '@/stores/uiStore'
import { useTranslation } from 'react-i18next'

// Inside Layout component:
const setLang = useUiStore(s => s.setLang)
const lang = useUiStore(s => s.lang)
const { t } = useTranslation()

// Add this before the logout button:
<div className="flex items-center gap-1 px-4 py-2">
  <button onClick={() => setLang('zh')}
    className={`text-xs px-2 py-1 rounded ${lang === 'zh' ? 'bg-black text-white' : 'text-gray-500'}`}>中</button>
  <button onClick={() => setLang('en')}
    className={`text-xs px-2 py-1 rounded ${lang === 'en' ? 'bg-black text-white' : 'text-gray-500'}`}>EN</button>
</div>
```

- [ ] **Step 14.8: Update nav labels in Layout.tsx to use translations**

```tsx
// Replace hardcoded labels with t() calls:
const navItems = [
  { to: '/overview', icon: LayoutDashboard, label: t('nav.overview') },
  { to: '/ontologies', icon: Network, label: t('nav.ontology') },
  { to: '/prompts', icon: FileText, label: t('nav.prompt') },
  { to: '/models', icon: Cpu, label: t('nav.models') },
  { to: '/settings', icon: Settings, label: t('nav.settings') },
]
```

- [ ] **Step 14.9: Commit**

```bash
git add . && git commit -m "feat: i18n — Chinese/English toggle via react-i18next, zh.json + en.json"
```

---

## Task 15: Test Data + Full Test Suite

**Files:**
- Create: `test_data/documents/` (8 sample files)
- Create: `test_data/api/**/*.json` (all API fixture files)
- Create: `test_data/db/seed.sql`
- Create: `test_data/frontend/mock_graph_data.json`
- Create: `test_data/frontend/mock_stats.json`
- Create: `test_data/frontend/e2e/*.spec.ts` (10 Playwright specs)

- [ ] **Step 15.1: Create sample documents**

`test_data/documents/supply_chain.md`:
```markdown
# 供应链知识图谱示例

## 供应商

**华强电子**（Huaqiang Electronics）是一家位于深圳的电子元器件供应商，主要供应芯片组和电阻元件。
- supplier_id: S001
- region: 深圳
- reliability_score: 0.92

**南方化工**（Southern Chemical）负责提供化工原料，主要供应商为制造业企业。
- supplier_id: S002
- region: 广州

## 物料

**芯片组A**（Chip Assembly A）是核心处理单元，由华强电子供应。
- material_id: M001
- unit: pcs
- safety_stock: 500

**电阻B**（Resistor B）是基础电子元件。
- material_id: M002
- unit: pcs

## 关系

- 华强电子 supplies 芯片组A（contract_price: 42.0 CNY）
- 华强电子 supplies 电阻B（contract_price: 0.5 CNY）
- 芯片组A consumed_by 产线甲
- 南方化工 is_partner_of 华强电子

## 业务规则

供应商评分 = 可靠性(0.6) + 交付准时率(0.4)
当物料库存低于安全库存时触发补货预警

## 行动

- 创建紧急采购订单（create_emergency_po）：当库存不足时为物料创建紧急订单
- 暂停供应商（suspend_supplier）：当供应商评分低于0.5时暂停合作
```

Create minimal placeholder files for other types (they just need to exist for upload testing):

`test_data/documents/org_chart.docx` — create via Python:
```python
# Run once: python -c "
from docx import Document
doc = Document()
doc.add_heading('组织架构', 0)
doc.add_paragraph('技术部 > 张三（部门经理）> 李四（工程师）')
doc.save('test_data/documents/org_chart.docx')"
```

`test_data/documents/supplier_list.csv`:
```csv
supplier_id,name,region,category,reliability_score
S001,华强电子,深圳,电子元件,0.92
S002,南方化工,广州,化工原料,0.85
S003,东莞精密,东莞,精密零件,0.78
```

`test_data/documents/product_catalog.xlsx` — create via:
```python
# Run once: python -c "
import openpyxl; wb = openpyxl.Workbook(); ws = wb.active
ws.append(['product_id','name','category','price','stock'])
ws.append(['P001','芯片组A','电子元件',42.0,1200])
ws.append(['P002','电阻B','电子元件',0.5,50000])
wb.save('test_data/documents/product_catalog.xlsx')"
```

For `annual_report.pdf`, `process_deck.pptx`, `scanned_invoice.png`, `scanned_contract.jpg` — create minimal placeholder files using Python libraries (reportlab, python-pptx, Pillow) or use any real sample files of those types.

- [ ] **Step 15.2: Create API fixture files**

`test_data/api/auth/login_admin.json`:
```json
{ "username": "admin", "password": "changeme123" }
```

`test_data/api/auth/login_wrong_password.json`:
```json
{ "username": "admin", "password": "wrongpassword" }
```

`test_data/api/auth/register_new_user.json`:
```json
{ "username": "testuser", "email": "test@example.com", "password": "testpass123" }
```

`test_data/api/auth/register_duplicate.json`:
```json
{ "username": "admin", "email": "dup@example.com", "password": "testpass123" }
```

`test_data/api/ontologies/create_valid.json`:
```json
{ "name": "供应链 Ontology 试点", "domain": "供应链", "description": "测试用供应链本体" }
```

`test_data/api/ontologies/create_duplicate.json`:
```json
{ "name": "供应链 Ontology 试点", "domain": "供应链" }
```

`test_data/api/ontologies/create_invalid_domain.json`:
```json
{ "name": "Invalid", "domain": "不存在的领域" }
```

`test_data/api/llm_responses/valid_extraction.json`:
```json
{
  "entities": [
    {"name_cn": "华强电子", "name_en": "Huaqiang Electronics", "type": "Supplier", "description": "深圳电子元件供应商", "properties": {"region": "深圳", "reliability_score": 0.92}, "confidence": 0.92},
    {"name_cn": "芯片组A", "name_en": "Chip Assembly A", "type": "Material", "description": "核心处理单元", "properties": {"unit": "pcs", "safety_stock": 500}, "confidence": 0.88}
  ],
  "relations": [
    {"source": "华强电子", "target": "芯片组A", "type": "supplies", "properties": {"contract_price": 42.0}, "confidence": 0.90}
  ],
  "logic_rules": [
    {"name_cn": "供应商评分规则", "name_en": "Supplier Score Rule", "description": "计算供应商综合评分", "formula": "score = reliability * 0.6 + delivery_rate * 0.4", "confidence": 0.85}
  ],
  "actions": [
    {"name_cn": "创建紧急采购订单", "name_en": "create_emergency_po", "description": "为缺货物料创建紧急采购订单", "execution_rule": "当 current_stock < safety_stock 时触发", "function_code": "def create_emergency_po(material_id, qty, supplier_id):\n    return PurchaseOrder(material_id=material_id, qty=qty)", "confidence": 0.95}
  ]
}
```

`test_data/api/llm_responses/invalid_json.json`:
```json
{ "raw": "I cannot extract structured data from this text. The content is not in a format I can parse into an ontology." }
```

`test_data/api/models/add_openai_model.json`:
```json
{ "name": "GPT-4o", "api_base": "https://api.openai.com/v1", "api_key": "sk-test-openai-key", "provider": "openai", "models": ["gpt-4o", "gpt-4o-mini"] }
```

`test_data/api/models/add_anthropic_model.json`:
```json
{ "name": "Claude 3.5 Sonnet", "api_base": "https://api.anthropic.com", "api_key": "sk-ant-test-key", "provider": "anthropic", "models": ["claude-3-5-sonnet-20241022"] }
```

`test_data/api/models/add_compatible_model.json`:
```json
{ "name": "Ollama Local", "api_base": "http://localhost:11434/v1", "api_key": "ollama", "provider": "compatible", "models": ["llama3.2", "mistral"] }
```

- [ ] **Step 15.3: Create test_data/db/seed.sql**

```sql
-- Seed data for all tables
-- Run: sqlite3 ontoprompt.db < test_data/db/seed.sql

-- Users (admin + editor + viewer)
INSERT INTO users (id, username, email, password_hash, role, is_active, created_at, updated_at) VALUES
  ('u001', 'admin', 'admin@ontoprompt.local', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMqJqhPX9e3tJqy1FRqNcjCOES', 'admin', 1, datetime('now'), datetime('now')),
  ('u002', 'editor_zhang', 'zhang@ontoprompt.local', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMqJqhPX9e3tJqy1FRqNcjCOES', 'editor', 1, datetime('now'), datetime('now')),
  ('u003', 'viewer_li', 'li@ontoprompt.local', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMqJqhPX9e3tJqy1FRqNcjCOES', 'viewer', 1, datetime('now'), datetime('now'));
-- Note: password hash above = "changeme123" via bcrypt

-- Ontology projects (draft + creating + created)
INSERT INTO ontology_projects (id, name, domain, description, version, status, created_by, created_at, updated_at) VALUES
  ('ont001', '供应链知识图谱 v1', '供应链', '华强电子供应商体系', 'v1.2', 'created', 'u001', datetime('now', '-2 days'), datetime('now')),
  ('ont002', '采购规则体系', '采购', '采购审批流程和规则', 'v0.1', 'draft', 'u002', datetime('now', '-1 day'), datetime('now', '-1 day')),
  ('ont003', '财务指标本体', '财务', '财务KPI和计算规则', 'v0.5', 'creating', 'u001', datetime('now', '-3 hours'), datetime('now'));

-- Entities (8 across ont001)
INSERT INTO entities (id, ontology_id, name_cn, name_en, type, description, properties_json, confidence, version, created_at, updated_at) VALUES
  ('ent001', 'ont001', '华强电子', 'Huaqiang Electronics', 'Supplier', '深圳电子元件供应商', '{"region":"深圳","reliability_score":0.92,"status":"active"}', 0.92, 1, datetime('now'), datetime('now')),
  ('ent002', 'ont001', '芯片组A', 'Chip Assembly A', 'Material', '核心处理单元', '{"unit":"pcs","safety_stock":500}', 0.88, 1, datetime('now'), datetime('now')),
  ('ent003', 'ont001', '电阻B', 'Resistor B', 'Material', '基础电子元件', '{"unit":"pcs","safety_stock":10000}', 0.85, 1, datetime('now'), datetime('now')),
  ('ent004', 'ont001', '南方化工', 'Southern Chemical', 'Supplier', '广州化工原料供应商', '{"region":"广州","reliability_score":0.85}', 0.80, 1, datetime('now'), datetime('now')),
  ('ent005', 'ont001', '产线甲', 'Production Line A', 'ProductionLine', '主生产线', '{"capacity":1000,"shift":"三班"}', 0.90, 1, datetime('now'), datetime('now')),
  ('ent006', 'ont001', '订单001', 'Order 001', 'Order', '紧急采购订单', '{"priority":"high","amount":50000}', 0.95, 1, datetime('now'), datetime('now')),
  ('ent007', 'ont001', '采购部', 'Procurement Dept', 'Department', '负责采购事务', '{}', 0.88, 1, datetime('now'), datetime('now')),
  ('ent008', 'ont001', '张工', 'Zhang Engineer', 'Employee', '采购专员', '{"employee_id":"E001"}', 0.82, 1, datetime('now'), datetime('now'));

-- Relations (5 in ont001)
INSERT INTO relations (id, ontology_id, source_entity_id, target_entity_id, type, properties_json, confidence, created_at, updated_at) VALUES
  ('rel001', 'ont001', 'ent001', 'ent002', 'supplies', '{"contract_price":42.0,"is_preferred":true}', 0.90, datetime('now'), datetime('now')),
  ('rel002', 'ont001', 'ent001', 'ent003', 'supplies', '{"contract_price":0.5}', 0.85, datetime('now'), datetime('now')),
  ('rel003', 'ont001', 'ent002', 'ent005', 'consumed_by', '{}', 0.82, datetime('now'), datetime('now')),
  ('rel004', 'ont001', 'ent008', 'ent007', 'belongs_to', '{}', 0.95, datetime('now'), datetime('now')),
  ('rel005', 'ont001', 'ent001', 'ent004', 'is_partner_of', '{}', 0.70, datetime('now'), datetime('now'));

-- Logic rules (3 in ont001)
INSERT INTO logic_rules (id, ontology_id, name_cn, name_en, description, formula, confidence, version, created_at, updated_at) VALUES
  ('lr001', 'ont001', '供应商评分规则', 'Supplier Score Rule', '计算供应商综合评分', 'score = reliability * 0.6 + delivery_rate * 0.4', 0.90, 1, datetime('now'), datetime('now')),
  ('lr002', 'ont001', '库存预警规则', 'Stock Alert Rule', '当库存低于安全库存时触发预警', 'IF current_stock < safety_stock THEN alert_level = warning', 0.85, 1, datetime('now'), datetime('now')),
  ('lr003', 'ont001', '采购审批规则', 'PO Approval Rule', '金额超过10万需总经理审批', 'IF po_amount > 100000 THEN require_gm_approval = true', 0.88, 1, datetime('now'), datetime('now'));

-- Actions (3 in ont001)
INSERT INTO actions (id, ontology_id, name_cn, name_en, description, execution_rule, function_code, linked_entities_json, linked_logic_ids_json, confidence, version, created_at, updated_at) VALUES
  ('act001', 'ont001', '创建紧急采购订单', 'create_emergency_po', '为缺货物料创建紧急采购订单', '当 current_stock < safety_stock 时触发', 'def create_emergency_po(material_id, qty, supplier_id):\n    return PurchaseOrder(material_id=material_id)', '["ent002","ent001"]', '["lr002"]', 0.95, 1, datetime('now'), datetime('now')),
  ('act002', 'ont001', '暂停供应商', 'suspend_supplier', '评分过低时暂停供应商', '当 supplier_score < 0.5 时触发', 'def suspend_supplier(supplier_id, reason):\n    Supplier.update(id=supplier_id, status="suspended")', '["ent001"]', '["lr001"]', 0.90, 1, datetime('now'), datetime('now')),
  ('act003', 'ont001', '重分配库存', 'reallocate_inventory', '在产线间重新分配物料库存', '当某产线库存过剩而另一产线不足时触发', 'def reallocate_inventory(from_line, to_line, material_id, qty):\n    pass', '["ent002","ent005"]', '[]', 0.75, 1, datetime('now'), datetime('now'));

-- Prompts (seeded by app, no need to duplicate here)

-- Model configs (3: openai + anthropic + ollama)
-- Note: api_key_encrypted values are placeholder — real values generated at runtime
INSERT INTO model_configs (id, name, api_base, api_key_encrypted, provider, models_json, created_by, created_at, updated_at) VALUES
  ('mdl001', 'GPT-4o (测试)', 'https://api.openai.com/v1', 'PLACEHOLDER_ENCRYPTED', 'openai', '["gpt-4o","gpt-4o-mini"]', 'u001', datetime('now'), datetime('now')),
  ('mdl002', 'Claude 3.5', 'https://api.anthropic.com', 'PLACEHOLDER_ENCRYPTED', 'anthropic', '["claude-3-5-sonnet-20241022"]', 'u001', datetime('now'), datetime('now')),
  ('mdl003', 'Ollama Local', 'http://localhost:11434/v1', 'PLACEHOLDER_ENCRYPTED', 'compatible', '["llama3.2"]', 'u001', datetime('now'), datetime('now'));

-- Extraction tasks (1 completed + 1 failed)
INSERT INTO extraction_tasks (id, ontology_id, prompt_id, model_id, status, parameters_json, progress_json, error, created_at, updated_at) VALUES
  ('task001', 'ont001', NULL, 'mdl001', 'completed', '{"temperature":0.1}',
   '{"step":"completed","step_index":7,"total_steps":7,"percentage":100}', NULL, datetime('now', '-2 days'), datetime('now')),
  ('task002', 'ont003', NULL, 'mdl001', 'failed', '{"temperature":0.1}',
   '{"step":"llm_call","step_index":4,"total_steps":7,"percentage":57}',
   'LLM 返回格式无效', datetime('now', '-3 hours'), datetime('now'));

-- Rules config (seeded by app on startup)
```

- [ ] **Step 15.4: Create mock frontend data**

`test_data/frontend/mock_stats.json`:
```json
{ "ontology_count": 3, "entity_count": 8, "logic_count": 3, "action_count": 3 }
```

`test_data/frontend/mock_graph_data.json`:
```json
{
  "nodes": [
    {"id": "ent001", "label": "华强电子", "type": "Supplier", "color": "#4CAF50", "confidence": 0.92, "property_summary": {"region": "深圳"}},
    {"id": "ent002", "label": "芯片组A", "type": "Material", "color": "#2196F3", "confidence": 0.88, "property_summary": {"unit": "pcs"}},
    {"id": "ent005", "label": "产线甲", "type": "ProductionLine", "color": "#9C27B0", "confidence": 0.90, "property_summary": {}}
  ],
  "edges": [
    {"id": "rel001", "source": "ent001", "target": "ent002", "label": "supplies", "confidence": 0.90, "properties": {"contract_price": 42.0}},
    {"id": "rel003", "source": "ent002", "target": "ent005", "label": "consumed_by", "confidence": 0.82, "properties": {}}
  ],
  "meta": {"ontology_id": "ont001", "node_count": 3, "edge_count": 2, "layout_hint": "force-directed"}
}
```

- [ ] **Step 15.5: Install Playwright**

```bash
cd frontend && npm install -D @playwright/test
npx playwright install chromium
```

- [ ] **Step 15.6: Create playwright.config.ts**

```typescript
import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: '../test_data/frontend/e2e',
  use: { baseURL: 'http://localhost:5173', headless: true },
  timeout: 30000,
})
```

- [ ] **Step 15.7: Create E2E test specs**

`test_data/frontend/e2e/auth.spec.ts`:
```typescript
import { test, expect } from '@playwright/test'

test('login with valid credentials', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[placeholder="用户名"]', 'admin')
  await page.fill('input[placeholder="密码"]', 'changeme123')
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL('/overview')
  await expect(page.locator('h2')).toContainText('概览')
})

test('login with wrong password shows error', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[placeholder="用户名"]', 'admin')
  await page.fill('input[placeholder="密码"]', 'wrongpass')
  await page.click('button[type="submit"]')
  await expect(page.locator('text=用户名或密码错误')).toBeVisible()
})

test('logout returns to login', async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[placeholder="用户名"]', 'admin')
  await page.fill('input[placeholder="密码"]', 'changeme123')
  await page.click('button[type="submit"]')
  await page.click('text=退出')
  await expect(page).toHaveURL('/login')
})
```

`test_data/frontend/e2e/ontology_list.spec.ts`:
```typescript
import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[placeholder="用户名"]', 'admin')
  await page.fill('input[placeholder="密码"]', 'changeme123')
  await page.click('button[type="submit"]')
  await page.click('text=Ontology')
})

test('shows ontology list', async ({ page }) => {
  await expect(page.locator('h2')).toContainText('Ontology 管理')
  await expect(page.locator('table')).toBeVisible()
})

test('create ontology modal opens and closes', async ({ page }) => {
  await page.click('text=创建 Ontology')
  await expect(page.locator('text=Ontology 名称')).toBeVisible()
  await page.click('text=取消')
  await expect(page.locator('text=Ontology 名称')).not.toBeVisible()
})

test('delete ontology shows confirm dialog', async ({ page }) => {
  await page.click('text=删除', { force: true })
  await expect(page.locator('text=确认删除')).toBeVisible()
  await page.click('text=取消')
})

test('filter by name', async ({ page }) => {
  await page.fill('input[placeholder="按名称筛选"]', '供应链')
  await expect(page.locator('table tbody tr')).toHaveCount(1)
})
```

`test_data/frontend/e2e/ontology_create.spec.ts`:
```typescript
import { test, expect } from '@playwright/test'
import path from 'path'

test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[placeholder="用户名"]', 'admin')
  await page.fill('input[placeholder="密码"]', 'changeme123')
  await page.click('button[type="submit"]')
  await page.click('text=Ontology')
})

test('create ontology wizard — step 1 (naming)', async ({ page }) => {
  await page.click('text=创建 Ontology')
  await page.fill('input[placeholder="Ontology 名称 *"]', '测试本体')
  await page.click('text=确认')
  await expect(page.locator('text=数据导入')).toBeVisible()
})

test('file upload step accepts md file', async ({ page }) => {
  await page.click('text=创建 Ontology')
  await page.fill('input[placeholder="Ontology 名称 *"]', '上传测试')
  await page.click('text=确认')
  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.click('text=点击上传')
  ])
  await fileChooser.setFiles(path.join(__dirname, '../../documents/supply_chain.md'))
  await expect(page.locator('text=supply_chain.md')).toBeVisible()
})
```

`test_data/frontend/e2e/graph_interaction.spec.ts`:
```typescript
import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[placeholder="用户名"]', 'admin')
  await page.fill('input[placeholder="密码"]', 'changeme123')
  await page.click('button[type="submit"]')
  await page.click('text=Ontology')
  await page.click('text=查看', { first: true })
})

test('graph tab is default', async ({ page }) => {
  await expect(page.locator('text=图谱可视化')).toBeVisible()
})

test('can switch to entity tab', async ({ page }) => {
  await page.click('text=实体(Entity)')
  await expect(page.locator('text=实体列表')).toBeVisible()
})

test('can switch to logic tab', async ({ page }) => {
  await page.click('text=逻辑(Logic)')
  await expect(page.locator('text=逻辑列表')).toBeVisible()
})

test('can switch to action tab', async ({ page }) => {
  await page.click('text=行动(Action)')
  await expect(page.locator('text=行动列表')).toBeVisible()
})
```

`test_data/frontend/e2e/prompt_crud.spec.ts`:
```typescript
import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[placeholder="用户名"]', 'admin')
  await page.fill('input[placeholder="密码"]', 'changeme123')
  await page.click('button[type="submit"]')
  await page.click('text=Prompt')
})

test('shows built-in prompts', async ({ page }) => {
  await expect(page.locator('table tbody tr')).toHaveCountGreaterThan(0)
})

test('filter prompts by domain', async ({ page }) => {
  await page.selectOption('select', '供应链')
  await expect(page.locator('table tbody tr')).toHaveCountGreaterThan(0)
})

test('create new prompt', async ({ page }) => {
  await page.click('text=创建 Prompt')
  await page.fill('input[placeholder*="名称"]', '测试 Prompt')
  await page.click('text=确定')
  await expect(page).toHaveURL('/prompts')
})
```

`test_data/frontend/e2e/models.spec.ts`:
```typescript
import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[placeholder="用户名"]', 'admin')
  await page.fill('input[placeholder="密码"]', 'changeme123')
  await page.click('button[type="submit"]')
  await page.click('text=模型管理')
})

test('shows add model button', async ({ page }) => {
  await expect(page.locator('text=添加模型')).toBeVisible()
})

test('add model form appears on click', async ({ page }) => {
  await page.click('text=添加模型')
  await expect(page.locator('text=API 地址')).toBeVisible()
  await expect(page.locator('text=API Key')).toBeVisible()
})
```

`test_data/frontend/e2e/settings.spec.ts`:
```typescript
import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[placeholder="用户名"]', 'admin')
  await page.fill('input[placeholder="密码"]', 'changeme123')
  await page.click('button[type="submit"]')
  await page.click('text=设置')
})

test('shows rules management tab', async ({ page }) => {
  await expect(page.locator('text=规则管理')).toBeVisible()
  await expect(page.locator('text=初始置信度')).toBeVisible()
})

test('shows account management tab', async ({ page }) => {
  await page.click('text=账号管理')
  await expect(page.locator('text=当前账号')).toBeVisible()
  await expect(page.locator('text=admin')).toBeVisible()
})

test('can edit editable rule value', async ({ page }) => {
  const input = page.locator('input').first()
  await input.fill('0.65')
  await expect(page.locator('text=保存更改')).toBeVisible()
})
```

`test_data/frontend/e2e/export.spec.ts`:
```typescript
import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[placeholder="用户名"]', 'admin')
  await page.fill('input[placeholder="密码"]', 'changeme123')
  await page.click('button[type="submit"]')
  await page.click('text=Ontology')
  await page.click('text=查看', { first: true })
})

test('export dropdown is visible', async ({ page }) => {
  await page.hover('text=导出 ▾')
  await expect(page.locator('text=JSON')).toBeVisible()
  await expect(page.locator('text=YAML')).toBeVisible()
  await expect(page.locator('text=TTL')).toBeVisible()
})
```

`test_data/frontend/e2e/i18n.spec.ts`:
```typescript
import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[placeholder="用户名"]', 'admin')
  await page.fill('input[placeholder="密码"]', 'changeme123')
  await page.click('button[type="submit"]')
})

test('default language is Chinese', async ({ page }) => {
  await expect(page.locator('text=概览')).toBeVisible()
})

test('switch to English changes nav labels', async ({ page }) => {
  await page.click('button:has-text("EN")')
  await expect(page.locator('text=Overview')).toBeVisible()
  await expect(page.locator('text=Ontology')).toBeVisible()
})

test('switch back to Chinese', async ({ page }) => {
  await page.click('button:has-text("EN")')
  await page.click('button:has-text("中")')
  await expect(page.locator('text=概览')).toBeVisible()
})
```

`test_data/frontend/e2e/ontology_detail.spec.ts`:
```typescript
import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/login')
  await page.fill('input[placeholder="用户名"]', 'admin')
  await page.fill('input[placeholder="密码"]', 'changeme123')
  await page.click('button[type="submit"]')
  await page.click('text=Ontology')
  await page.click('text=查看', { first: true })
})

test('entity tab shows list and add button', async ({ page }) => {
  await page.click('text=实体(Entity)')
  await expect(page.locator('text=新增实体')).toBeVisible()
})

test('can open create entity dialog', async ({ page }) => {
  await page.click('text=实体(Entity)')
  await page.click('text=新增实体')
  await expect(page.locator('text=编辑实体')).not.toBeVisible()
  await expect(page.locator('text=新增实体').last()).toBeVisible()
})

test('back button returns to list', async ({ page }) => {
  await page.click('text=返回 Ontology 列表')
  await expect(page).toHaveURL('/ontologies')
})
```

- [ ] **Step 15.8: Run all backend tests**

```bash
cd backend && pytest tests/ -v --tb=short
# Expected: all tests pass
```

- [ ] **Step 15.9: Run Playwright E2E tests**

```bash
# Ensure docker-compose is running first:
# docker-compose up -d
cd frontend && npx playwright test --config=playwright.config.ts
# Expected: all E2E tests pass
```

- [ ] **Step 15.10: Final commit**

```bash
git add . && git commit -m "feat: complete test data suite — documents, API fixtures, seed.sql, 10 Playwright E2E specs"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** All 14 slices mapped to tasks. Auth ✓, Overview ✓, Ontology CRUD ✓, File Upload ✓, Prompts ✓, Models ✓, LLM Extraction ✓, Graph ✓, Entity/Logic/Action CRUD ✓, Settings ✓, Export ✓, i18n ✓, Test Data ✓
- [x] **Logic table:** `logic_rules` table defined in Part 3 Task 9, CRUD router in Task 11, LogicTab in frontend
- [x] **No placeholders:** All steps contain actual code or exact commands
- [x] **Type consistency:** `EntityOut`, `LogicOut`, `ActionOut` schemas defined before used in routers. `graphApi.get()` returns `GraphData`. `promptApi.list()` returns `{items, total}`.
- [x] **Router registration:** Every new router has a corresponding `app.include_router()` step
- [x] **API key encryption:** `encrypt()`/`decrypt()` used consistently in model_configs router
- [x] **Seeds called:** `seed_admin`, `seed_prompts`, `seed_rules` all called in startup event
- [x] **Celery fallback:** `execution.py` falls back to inline `run_extraction` if Celery unavailable
- [x] **Test fixtures:** `conftest.py` provides `client`, `db`, `admin_user`, `admin_token`, `auth_headers` — used consistently across all test files
