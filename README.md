# nano-ontoprompt

**[中文文档](./README_zh.md)**

A lightweight, LLM-powered platform for building domain ontologies from unstructured documents. Upload your PDFs, Word files, or spreadsheets, configure a prompt and model, and let the LLM extract a structured knowledge graph — complete with entities, logic rules, and actions.

---

## What is an Ontology?

An ontology is a formal representation of knowledge in a specific domain — a shared vocabulary of concepts and the relationships between them. Think of it as the structured backbone that turns raw text into machine-readable, queryable knowledge.

In nano-ontoprompt, every ontology is made of three building blocks:

| Building Block | What it captures | Example |
|---|---|---|
| **Entity** | A key concept in the domain, with Chinese/English names, type, description, and a confidence score | `供应商 / Supplier`, type: `Organization` |
| **Logic Rule** | A formal constraint or relationship between entities, optionally expressed as a formula | `∀ order → has_supplier` |
| **Action** | An executable rule that can be triggered based on the ontology's state | `Notify procurement when stock < threshold` |

Entities are linked through relations (edges in the knowledge graph). The graph view lets you visually explore how concepts connect across an entire domain.

**Typical use cases:**
- Supply chain knowledge modeling
- Medical / clinical concept extraction
- Financial compliance rule extraction
- Legal document structuring
- Any domain where you need to turn text corpora into structured knowledge

---

## Features

- **LLM extraction** — drive extraction with any OpenAI, Anthropic, or OpenAI-compatible model
- **Prompt management** — create, version, and reuse domain-specific extraction prompts; one-click template generation
- **Multi-format upload** — PDF, DOCX, XLSX, CSV, PPTX, PNG, JPG, MD, TXT
- **Knowledge graph** — interactive Cytoscape.js visualization of entity relationships
- **Quality report** — post-extraction P0 validation with severity levels (FATAL / ERROR / WARNING / INFO)
- **Export** — JSON, YAML, CSV, Turtle (RDF), HTML
- **Extraction rules** — client-side constraints appended to prompts (min confidence, multi-document validation, etc.)
- **Multi-language UI** — English / Chinese toggle
- **User management** — JWT auth, admin/user roles

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, react-i18next |
| Backend | FastAPI, SQLAlchemy, SQLite / PostgreSQL |
| Task queue | Celery + Redis |
| LLM clients | OpenAI SDK, Anthropic SDK |
| Graph | Cytoscape.js |
| Export | rdflib (Turtle/RDF), PyYAML |

---

## Quick Start

### Option 1 — Docker Compose (recommended)

```bash
git clone https://github.com/jingw2/nano-ontoprompt.git
cd nano-ontoprompt
cp .env.example .env          # edit API keys and secrets
docker compose up --build
```

Open [http://localhost:5173](http://localhost:5173). Default credentials: `admin / changeme123`.

### Option 2 — Manual setup

**Prerequisites:** Python 3.11+, Node.js 18+, Redis

```bash
git clone https://github.com/jingw2/nano-ontoprompt.git
cd nano-ontoprompt
```

**Backend**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**Celery worker** (separate terminal, same venv)

```bash
cd backend
celery -A app.tasks.extraction worker --loglevel=info
```

**Frontend**

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## Usage

### 1. Add a model

Go to **Models → Add Model**. Enter your provider (OpenAI / Anthropic / compatible), API key, base URL, and the specific model names you want to use.

### 2. Create a prompt

Go to **Prompts → Create Prompt**. Pick a domain, click **Auto-fill Template** to load a built-in extraction prompt, then customise it for your needs.

### 3. Create an ontology

Go to **Ontologies → Create Ontology**. Give it a name and domain.

### 4. Upload documents

Open the ontology → **Files** tab. Drag and drop your source documents (PDF, DOCX, XLSX, etc.).

### 5. Run LLM extraction

Open the ontology → **Info** tab. Select the prompt and model, then click **Start Extraction**. A progress bar tracks each stage (queued → loading files → LLM extraction → validating → saving). A quality report appears on completion.

### 6. Explore the knowledge graph

Open the ontology → **Graph** tab. Nodes are entities; edges are relations extracted by the LLM.

### 7. Review and edit

- **Entities** tab — browse, add, or delete entities
- **Logic Rules** tab — view and manage formal rules
- **Actions** tab — view and manage executable actions

### 8. Export

In the **Info** tab, download the ontology in JSON, YAML, CSV, Turtle (RDF), or HTML format.

---

## Project Structure

```
nano-ontoprompt/
├── backend/
│   ├── app/
│   │   ├── api/           # REST API endpoints
│   │   ├── models/        # SQLAlchemy ORM models
│   │   ├── tasks/         # Celery extraction tasks + LLM orchestration
│   │   └── utils/         # Export (JSON/YAML/CSV/TTL/HTML)
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── pages/         # Route-level components (overview, ontologies, prompts…)
│       ├── components/    # Shared UI (ConfidenceBar, StatusBadge, KnowledgeGraph…)
│       ├── api/           # Axios API client
│       └── i18n/          # en.json / zh.json translations
├── docker-compose.yml
└── uploads/               # Uploaded document storage (gitignored)
```

---

## Environment Variables

Create a `.env` file in the project root (or in `backend/`):

```env
DATABASE_URL=sqlite:///./ontoprompt.db
REDIS_URL=redis://localhost:6379/0
SECRET_KEY=change-me-in-production
ENCRYPTION_KEY=                         # optional: encrypt stored API keys
FIRST_ADMIN_USER=admin
FIRST_ADMIN_PASSWORD=changeme123
```

---

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=jingw2/nano-ontoprompt&type=Date)](https://star-history.com/#jingw2/nano-ontoprompt&Date)

---

## License

MIT
