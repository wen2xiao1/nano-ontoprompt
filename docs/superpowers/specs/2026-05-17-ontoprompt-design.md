# OntoPrompt — Design Spec

> Date: 2026-05-17 | Status: Approved

---

## 1. Product Summary

**OntoPrompt** is a full-stack web application that lets non-technical users build ontologies from documents using LLM prompts. Users upload files, select a prompt template, execute LLM extraction, then visualize and edit the resulting knowledge graph.

Core flow: Upload → Select Prompt → Execute LLM → Visualize Graph → Edit → Export

---

## 2. Scope

Full scope as described in `nano-ontoprompt-requirements.md`. Local development target (`docker-compose up`). No cloud deployment needed.

**Issues resolved from the original requirements:**

| # | Issue | Resolution |
|---|-------|-----------|
| 1 | Missing `logic` table in DB schema | Added `logic_rules` table, parallel to `entities` and `actions` |
| 2 | 3-step vs 4-step wizard confusion | Naming = modal dialog; wizard = 3 steps inside the create page |
| 3 | API Key in localStorage vs DB | API keys stored **encrypted in DB** (AES-256 via Fernet) |
| 4 | Celery/Redis "optional" | Marked as **required** — async task architecture depends on it |
| 5 | Redundant `check-name` endpoint | Removed — `POST /api/ontologies` returns `409` on duplicate |
| 6 | SLA levels reference live operations | Replaced with **confidence rules only** in Settings |
| 7 | TTL export unspecified | Implemented via `rdflib`, entity → OWL class mapping |

---

## 3. Architecture

### 3.1 Monorepo Layout

```
ontoprompt/
├── frontend/          # React 18 + Vite + TypeScript
├── backend/           # Python FastAPI
├── test_data/         # All test fixtures
├── docs/
├── docker-compose.yml
└── .env.example
```

### 3.2 Tech Stack

**Frontend:**
| Concern | Library |
|---------|---------|
| Framework | React 18 + Vite + TypeScript |
| Routing | React Router v6 |
| UI | Shadcn/ui + Tailwind CSS |
| Graph | Cytoscape.js (lazy-loaded) |
| State | Zustand (auth + ui stores) |
| Server state | TanStack Query |
| Forms | React Hook Form |
| File upload | react-dropzone |
| i18n | react-i18next (zh + en) |
| Testing | Vitest + React Testing Library + Playwright (E2E) |

**Backend:**
| Concern | Library |
|---------|---------|
| API | FastAPI |
| ORM | SQLAlchemy 2.0 + Alembic |
| DB (dev) | SQLite |
| DB (prod) | PostgreSQL |
| Auth | python-jose (JWT) + passlib + bcrypt |
| Encryption | cryptography (Fernet / AES-256) |
| Task queue | Celery + Redis (required) |
| Doc parsing | MarkItDown |
| LLM | OpenAI SDK + Anthropic SDK |
| Export | rdflib (TTL), PyYAML |
| Testing | pytest + httpx |

**Infrastructure (docker-compose):**
- `frontend` — Vite dev server
- `backend` — Uvicorn (FastAPI)
- `celery_worker` — Celery worker
- `db` — PostgreSQL
- `redis` — Redis

---

## 4. Data Model

All PKs are UUIDs. Timestamps are UTC.

```
users
  id, username (unique), email (unique), password_hash,
  role (admin|editor|viewer), is_active, created_at, updated_at

ontology_projects
  id, name, domain, description, version (e.g. "v1.2"),
  status (draft|creating|created|archived),
  created_by (FK→users), created_at, updated_at

uploaded_files
  id, ontology_id (FK), filename, file_path, file_size,
  mime_type, converted_md (text), created_at

extraction_tasks
  id, ontology_id (FK), prompt_id (FK), model_id (FK),
  status (queued|running|completed|failed),
  parameters (JSON), progress (JSON), error (text),
  created_at, updated_at

entities
  id, ontology_id (FK), name_cn, name_en, type,
  description, properties (JSON), confidence, version,
  created_at, updated_at

logic_rules
  id, ontology_id (FK), name_cn, name_en, description,
  formula (text), confidence, version, created_at, updated_at

actions
  id, ontology_id (FK), name_cn, name_en, description,
  execution_rule (text), function_code (text),
  linked_entities (JSON array of entity ids),
  linked_logic_ids (JSON array of logic_rule ids),
  confidence, version, created_at, updated_at

relations
  id, ontology_id (FK), source_entity (FK→entities),
  target_entity (FK→entities), type, properties (JSON),
  confidence, created_at, updated_at

prompts
  id, name, domain, content (text), version,
  created_by (FK→users), created_at, updated_at

model_configs
  id, name, api_base, api_key_encrypted, provider
  (openai|anthropic|compatible), models (JSON array),
  created_by (FK→users), created_at, updated_at

rules_config
  id, rule_key, rule_value, rule_label_cn, rule_label_en,
  editable (bool), created_at, updated_at
  — seeded with 8 confidence rules on first run
```

---

## 5. API Design

**Base URL:** `http://localhost:8000/api/v1`
**Auth:** Bearer JWT on all endpoints except `/auth/login` and `/auth/register`

**Response envelope:**
```json
{ "data": {...}, "message": "ok" }
{ "error": "ERROR_CODE", "message": "human readable", "details": {...} }
```

**Pagination:** `?page=1&page_size=20` → `{ items[], total, page, page_size }`

### Endpoints

```
Auth
  POST   /auth/login
  POST   /auth/register
  GET    /auth/profile
  PUT    /auth/password

Users (admin only)
  GET/POST          /users
  GET/PUT/DELETE    /users/:id

Overview
  GET    /overview/stats

Ontology
  GET/POST          /ontologies          (409 on duplicate name)
  GET/PUT/DELETE    /ontologies/:id

Files
  POST/GET          /ontologies/:id/files
  DELETE            /ontologies/:id/files/:fid

Execution
  POST   /ontologies/:id/execute         → 202 + task_id
  GET    /ontologies/:id/execute/status?task_id=

Graph
  GET    /ontologies/:id/graph           → { nodes[], edges[], meta }

Entities
  GET/POST          /ontologies/:id/entities
  GET/PUT/DELETE    /ontologies/:id/entities/:eid

Logic Rules
  GET/POST          /ontologies/:id/logic
  GET/PUT/DELETE    /ontologies/:id/logic/:lid

Actions
  GET/POST          /ontologies/:id/actions
  GET/PUT/DELETE    /ontologies/:id/actions/:aid

Prompts
  GET/POST          /prompts
  GET/PUT/DELETE    /prompts/:id
  GET               /prompts/by-domain/:domain

Models
  GET/POST          /models
  GET/PUT/DELETE    /models/:id
  POST              /models/:id/test

Settings
  GET/PUT           /settings/rules

Export
  GET    /ontologies/:id/export?format=json|yaml|csv|ttl|html
```

---

## 6. Frontend Architecture

### Routes

```
/login                    LoginPage (public)
/register                 RegisterPage (public)
/                         → redirect /overview
/overview                 OverviewPage
/ontologies               OntologyListPage
/ontologies/create        OntologyCreatePage (3-step wizard)
/ontologies/:id           OntologyDetailPage (4 sub-tabs)
/prompts                  PromptListPage
/prompts/create           PromptCreatePage
/prompts/:id              PromptDetailPage
/models                   ModelsPage
/settings                 SettingsPage (2 sub-tabs)
```

### Directory Structure

```
frontend/src/
├── api/           TanStack Query hooks + axios client
├── components/    Shared: ConfidenceBar, StatusBadge, ConfirmDialog,
│                          FileDropzone, EntityTypeIcon
├── pages/         One folder per route
├── stores/        authStore, uiStore (Zustand)
├── i18n/          zh.json, en.json
├── lib/           utils, constants, cytoscape config
└── types/         TypeScript interfaces mirroring API schemas
```

### State

- `authStore`: current user, JWT token, login/logout actions
- `uiStore`: language (zh|en), theme (light|dark)
- All server state via TanStack Query — no Redux

### Graph (Cytoscape.js)

- Lazy-loaded on Graph sub-tab only
- Default: force-directed layout
- Node click → floating info panel
- Edge drag between nodes → create relation dialog
- Right-click → context menu (delete, lock, focus neighbors)
- Confidence < 0.7 → dashed edge style

---

## 7. Backend Architecture

### Directory Structure

```
backend/app/
├── main.py          FastAPI app + CORS + router registration
├── config.py        Settings from env vars (pydantic-settings)
├── database.py      SQLAlchemy engine + session factory
├── deps.py          get_db, get_current_user, require_admin
├── models/          ORM models (one file per table group)
├── schemas/         Pydantic request/response models
├── routers/         One router per feature slice (14 routers)
├── services/        Business logic
│   ├── auth_service.py
│   ├── llm_service.py        OpenAI + Anthropic + compatible
│   ├── document_service.py   MarkItDown wrapper
│   ├── extraction_service.py Celery task logic
│   └── export_service.py
└── tasks/
    └── extraction.py         Celery task definition
```

### LLM Abstraction

`llm_service.extract_ontology(text, prompt_content, model_config)`:
- OpenAI / compatible: `response_format={"type": "json_object"}`
- Anthropic: JSON prefill technique
- Returns parsed `{entities, relations, logic_rules, actions}` dict
- On JSON parse failure: retry up to `retry_count` times, then raise

### File Processing

- MarkItDown runs **at upload time** (sync), result stored in `uploaded_files.converted_md`
- Celery task reads pre-converted Markdown — no file I/O during extraction

### Security

- JWT: `python-jose`, signed with `SECRET_KEY` env var, 24h expiry
- Passwords: `passlib` + `bcrypt`
- API keys: `cryptography.Fernet`, key from `ENCRYPTION_KEY` env var
- CORS: restricted to `http://localhost:5173` (Vite dev server)

### Environment Variables

```
DATABASE_URL=sqlite:///./ontoprompt.db
REDIS_URL=redis://redis:6379/0
SECRET_KEY=<random 32+ chars>
ENCRYPTION_KEY=<Fernet key>
FIRST_ADMIN_USER=admin
FIRST_ADMIN_PASSWORD=changeme
```

---

## 8. Implementation Order (Vertical Slices)

| # | Slice | Verify |
|---|-------|--------|
| 1 | Project scaffold + Docker Compose | `docker-compose up` → all services healthy |
| 2 | Auth (login/register/JWT/roles/user mgmt) | Login returns JWT, protected routes return 401 |
| 3 | Overview page | Stats cards show counts |
| 4 | Ontology list + CRUD | Create/list/delete work, duplicate → 409 |
| 5 | File upload (MarkItDown) | All 8 file types accepted, converted_md populated |
| 6 | Prompt management | CRUD + domain filter + built-in templates seeded |
| 7 | Model management | Add/test/delete model configs |
| 8 | LLM extraction engine | Celery task queued, progress polled, results written |
| 9 | Graph visualization | Cytoscape renders nodes+edges, interactions work |
| 10 | Entity / Logic / Action CRUD | All 3 sub-tabs: list + edit detail form |
| 11 | Settings | Confidence rules editable, account management |
| 12 | Export | JSON/YAML/CSV/TTL/HTML download |
| 13 | i18n | zh↔en toggle, all pages |
| 14 | Test data + full test suite | All pytest + Playwright tests pass |

---

## 9. Test Data

```
test_data/
├── documents/
│   ├── supply_chain.md, org_chart.docx, annual_report.pdf
│   ├── product_catalog.xlsx, supplier_list.csv, process_deck.pptx
│   ├── scanned_invoice.png, scanned_contract.jpg
├── api/
│   ├── auth/         (login_admin, login_editor, login_wrong_password,
│   │                  register_new_user, register_duplicate)
│   ├── ontologies/   (create_valid, create_duplicate, create_invalid_domain,
│   │                  update_metadata)
│   ├── entities/     (create_supplier, create_material, update, delete)
│   ├── logic/        (create_rule, update_rule)
│   ├── actions/      (create_action, update_action)
│   ├── prompts/      (create, update, filter_by_domain)
│   ├── models/       (openai, anthropic, compatible/ollama, connectivity)
│   ├── execution/    (execute_request, status_polling)
│   └── llm_responses/ (valid_extraction, partial_extraction, invalid_json)
├── db/
│   └── seed.sql      (users ×3, ontologies ×3, entities ×8, relations ×5,
│                      logic_rules ×3, actions ×3, prompts ×6, models ×3,
│                      extraction_tasks ×2, rules_config ×8)
└── frontend/
    ├── mock_graph_data.json
    ├── mock_stats.json
    └── e2e/
        ├── auth.spec.ts, ontology_create.spec.ts, ontology_detail.spec.ts
        ├── ontology_list.spec.ts, prompt_crud.spec.ts, models.spec.ts
        ├── settings.spec.ts, export.spec.ts, graph_interaction.spec.ts
        └── i18n.spec.ts
```

---

## 10. CLAUDE.md Constraints

- No speculative features — implement exactly what is described
- Minimum code — no abstractions for single-use cases
- Surgical changes — touch only what the current slice requires
- Goal-driven — each slice has a clear verify criterion before moving on
