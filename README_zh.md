# nano-ontoprompt

**[English Documentation](./README.md)**

一个轻量级、由大语言模型驱动的领域本体构建平台。上传 PDF、Word 或表格文件，配置提示词和模型，让 LLM 自动从文档中提取结构化知识图谱——包含实体、逻辑规则和动作。

---

## 什么是本体（Ontology）？

本体是对特定领域知识的形式化表示——一套关于概念及其相互关系的共享词汇表。可以把它理解为将原始文本转化为机器可读、可查询知识的结构化骨架。

在 nano-ontoprompt 中，每个本体由三个基本构件组成：

| 构件 | 捕获的内容 | 示例 |
|---|---|---|
| **实体（Entity）** | 领域内的核心概念，包含中英文名称、类型、描述和置信度分数 | `供应商 / Supplier`，类型：`Organization` |
| **逻辑规则（Logic Rule）** | 实体间的形式化约束或关系，可选用公式表达 | `∀ order → has_supplier` |
| **动作（Action）** | 可基于本体状态触发的可执行规则 | `库存低于阈值时通知采购部门` |

实体通过关系（知识图谱中的边）相互连接。图谱视图让你可以直观地探索整个领域内各概念之间的关联。

**典型应用场景：**
- 供应链知识建模
- 医疗/临床概念提取
- 金融合规规则提取
- 法律文档结构化
- 任何需要将文本语料转化为结构化知识的领域

---

## 功能特性

- **LLM 提取** — 支持 OpenAI、Anthropic 或任意兼容 OpenAI 接口的模型驱动提取
- **提示词管理** — 创建、版本化和复用领域专属提取提示词；一键生成模板
- **多格式上传** — 支持 PDF、DOCX、XLSX、CSV、PPTX、PNG、JPG、MD、TXT
- **知识图谱** — 基于 Cytoscape.js 的实体关系可视化交互图
- **质量报告** — 提取后的 P0 级验证，包含严重等级划分（FATAL / ERROR / WARNING / INFO）
- **多格式导出** — JSON、YAML、CSV、Turtle (RDF)、HTML
- **提取规则** — 客户端约束指令，自动追加到提示词末尾（最低置信度、多文档验证等）
- **中英双语 UI** — 支持语言切换
- **用户管理** — JWT 认证，管理员/普通用户角色

---

## 技术栈

| 层次 | 技术 |
|---|---|
| 前端 | React 18、TypeScript、Vite、Tailwind CSS、react-i18next |
| 后端 | FastAPI、SQLAlchemy、SQLite / PostgreSQL |
| 任务队列 | Celery + Redis |
| LLM 客户端 | OpenAI SDK、Anthropic SDK |
| 图谱可视化 | Cytoscape.js |
| 导出 | rdflib（Turtle/RDF）、PyYAML |

---

## 快速开始

### 方式一 — Docker Compose（推荐）

```bash
git clone https://github.com/jingw2/nano-ontoprompt.git
cd nano-ontoprompt
cp .env.example .env          # 编辑 API 密钥和密钥配置
docker compose up --build
```

打开 [http://localhost:5173](http://localhost:5173)。默认账户：`admin / changeme123`。

### 方式二 — 手动安装

**前置条件：** Python 3.11+、Node.js 18+、Redis

```bash
git clone https://github.com/jingw2/nano-ontoprompt.git
cd nano-ontoprompt
```

**后端**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

**Celery Worker**（新终端，同一虚拟环境）

```bash
cd backend
celery -A app.tasks.extraction worker --loglevel=info
```

**前端**

```bash
cd frontend
npm install
npm run dev
```

打开 [http://localhost:5173](http://localhost:5173)。

---

## 使用流程

### 1. 添加模型

进入 **Models → 添加模型**，填写 Provider（OpenAI / Anthropic / 兼容接口）、API Key、Base URL 以及具体模型名称。

### 2. 创建提示词

进入 **Prompts → 创建 Prompt**，选择领域，点击**一键生成模板**加载内置提取提示词，然后按需调整。

### 3. 创建本体

进入 **Ontologies → 创建本体**，填写名称和业务域。

### 4. 上传文档

打开本体 → **Files** 标签页，拖拽上传源文档（PDF、DOCX、XLSX 等）。

### 5. 运行 LLM 提取

打开本体 → **Info** 标签页，选择提示词和模型，点击**开始提取**。进度条实时显示各阶段（排队 → 加载文件 → LLM 提取 → 验证 → 保存）。提取完成后会展示质量报告。

### 6. 探索知识图谱

打开本体 → **Graph** 标签页。节点为实体，边为 LLM 提取的关系。

### 7. 审查与编辑

- **Entities** 标签页 — 浏览、添加或删除实体
- **Logic Rules** 标签页 — 查看和管理形式化规则
- **Actions** 标签页 — 查看和管理可执行动作

### 8. 导出

在 **Info** 标签页，下载 JSON、YAML、CSV、Turtle (RDF) 或 HTML 格式的本体文件。

---

## 项目结构

```
nano-ontoprompt/
├── backend/
│   ├── app/
│   │   ├── api/           # REST API 接口
│   │   ├── models/        # SQLAlchemy ORM 模型
│   │   ├── tasks/         # Celery 提取任务 + LLM 编排
│   │   └── utils/         # 导出工具（JSON/YAML/CSV/TTL/HTML）
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── pages/         # 路由级组件（总览、本体、提示词……）
│       ├── components/    # 共享 UI 组件（ConfidenceBar、StatusBadge、知识图谱……）
│       ├── api/           # Axios API 客户端
│       └── i18n/          # en.json / zh.json 翻译文件
├── docker-compose.yml
└── uploads/               # 上传文档存储目录（已 gitignore）
```

---

## 环境变量

在项目根目录（或 `backend/` 目录）创建 `.env` 文件：

```env
DATABASE_URL=sqlite:///./ontoprompt.db
REDIS_URL=redis://localhost:6379/0
SECRET_KEY=生产环境请修改此值
ENCRYPTION_KEY=                         # 可选：用于加密存储的 API 密钥
FIRST_ADMIN_USER=admin
FIRST_ADMIN_PASSWORD=changeme123
```

---

## Star 历史

[![Star History Chart](https://api.star-history.com/svg?repos=jingw2/nano-ontoprompt&type=Date)](https://star-history.com/#jingw2/nano-ontoprompt&Date)

---

## 开源协议

MIT
