# OntoPrompt Implementation Plan — Part 1 (Slices 1–4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the full project, implement JWT auth, overview stats, and ontology list/CRUD.

**Architecture:** Monorepo — `frontend/` (React 18 + Vite + TypeScript + Shadcn/ui) and `backend/` (FastAPI + SQLAlchemy + SQLite dev). Docker Compose runs postgres, redis, celery_worker, backend, frontend.

**Tech Stack:** React 18, Vite, TypeScript, Shadcn/ui, Tailwind, Zustand, TanStack Query | FastAPI, SQLAlchemy 2.0, Alembic, python-jose, passlib, bcrypt, pytest, httpx

**Parts:**
- Part 1 (this file): Slices 1–4 — Scaffold, Auth, Overview, Ontology CRUD
- Part 2: Slices 5–7 — File Upload, Prompt Management, Model Management
- Part 3: Slices 8–10 — LLM Extraction, Graph Visualization, Entity/Logic/Action CRUD
- Part 4: Slices 11–14 — Settings, Export, i18n, Test Data + Full Test Suite

---

## File Map (Part 1)

```
ontoprompt/
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── alembic/env.py
│   ├── alembic/versions/001_initial_schema.py
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── deps.py
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   ├── user.py
│   │   │   └── ontology.py
│   │   ├── schemas/
│   │   │   ├── auth.py
│   │   │   ├── user.py
│   │   │   └── ontology.py
│   │   ├── routers/
│   │   │   ├── auth.py
│   │   │   ├── users.py
│   │   │   ├── overview.py
│   │   │   └── ontologies.py
│   │   └── services/
│   │       └── auth_service.py
│   └── tests/
│       ├── conftest.py
│       ├── test_auth.py
│       ├── test_overview.py
│       └── test_ontologies.py
└── frontend/
    ├── package.json
    ├── vite.config.ts
    ├── tailwind.config.ts
    ├── tsconfig.json
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── api/
        │   ├── client.ts
        │   ├── auth.ts
        │   └── ontologies.ts
        ├── components/
        │   ├── Layout.tsx
        │   ├── StatusBadge.tsx
        │   └── ConfirmDialog.tsx
        ├── pages/
        │   ├── login/LoginPage.tsx
        │   ├── register/RegisterPage.tsx
        │   ├── overview/OverviewPage.tsx
        │   └── ontologies/
        │       └── list/OntologyListPage.tsx
        ├── stores/
        │   └── authStore.ts
        └── types/
            ├── auth.ts
            └── ontology.ts
```

---

## Task 1: Project Scaffold + Docker Compose

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`
- Create: `backend/requirements.txt`
- Create: `backend/app/main.py`
- Create: `backend/app/config.py`
- Create: `backend/app/database.py`
- Create: `frontend/package.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`

- [ ] **Step 1.1: Create docker-compose.yml**

```yaml
# docker-compose.yml
version: "3.9"
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: ontoprompt
      POSTGRES_USER: ontoprompt
      POSTGRES_PASSWORD: ontoprompt
    ports: ["5432:5432"]
    volumes: [postgres_data:/var/lib/postgresql/data]

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  backend:
    build: ./backend
    ports: ["8000:8000"]
    env_file: .env
    depends_on: [db, redis]
    volumes: [./backend:/app, ./uploads:/uploads]
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

  celery_worker:
    build: ./backend
    env_file: .env
    depends_on: [db, redis]
    volumes: [./backend:/app, ./uploads:/uploads]
    command: celery -A app.tasks.extraction worker --loglevel=info

  frontend:
    build: ./frontend
    ports: ["5173:5173"]
    volumes: [./frontend:/app, /app/node_modules]
    command: npm run dev -- --host

volumes:
  postgres_data:
```

- [ ] **Step 1.2: Create .env.example**

```
DATABASE_URL=postgresql://ontoprompt:ontoprompt@db:5432/ontoprompt
REDIS_URL=redis://redis:6379/0
SECRET_KEY=change-me-to-a-random-32-char-string
ENCRYPTION_KEY=
FIRST_ADMIN_USER=admin
FIRST_ADMIN_PASSWORD=changeme123
UPLOADS_DIR=/uploads
```

- [ ] **Step 1.3: Create backend/requirements.txt**

```
fastapi==0.115.0
uvicorn[standard]==0.30.6
sqlalchemy==2.0.35
alembic==1.13.3
psycopg2-binary==2.9.9
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
python-multipart==0.0.12
cryptography==43.0.1
celery==5.4.0
redis==5.1.1
httpx==0.27.2
pydantic-settings==2.5.2
pytest==8.3.3
pytest-asyncio==0.24.0
```

- [ ] **Step 1.4: Create backend/app/config.py**

```python
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str = "sqlite:///./ontoprompt.db"
    redis_url: str = "redis://localhost:6379/0"
    secret_key: str = "dev-secret-key"
    encryption_key: str = ""
    first_admin_user: str = "admin"
    first_admin_password: str = "changeme123"
    uploads_dir: str = "./uploads"
    access_token_expire_minutes: int = 1440  # 24h

    class Config:
        env_file = ".env"

settings = Settings()
```

- [ ] **Step 1.5: Create backend/app/database.py**

```python
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from app.config import settings

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if "sqlite" in settings.database_url else {},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

class Base(DeclarativeBase):
    pass
```

- [ ] **Step 1.6: Create backend/app/main.py**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers import auth, users, overview, ontologies

app = FastAPI(title="OntoPrompt API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/v1/users", tags=["users"])
app.include_router(overview.router, prefix="/api/v1/overview", tags=["overview"])
app.include_router(ontologies.router, prefix="/api/v1/ontologies", tags=["ontologies"])

@app.get("/health")
def health():
    return {"status": "ok"}
```

- [ ] **Step 1.7: Scaffold frontend with Vite**

```bash
cd frontend
npm create vite@latest . -- --template react-ts
npm install
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
npm install @tanstack/react-query axios zustand react-router-dom react-hook-form
npm install lucide-react class-variance-authority clsx tailwind-merge
npx shadcn@latest init
```

- [ ] **Step 1.8: Create frontend/vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: { aliases: { '@': path.resolve(__dirname, './src') } },
  server: {
    host: true,
    proxy: { '/api': 'http://backend:8000' }
  }
})
```

- [ ] **Step 1.9: Verify scaffold**

```bash
cd backend && pip install -r requirements.txt && python -c "from app.main import app; print('OK')"
cd frontend && npm run build  # should complete without errors
```

- [ ] **Step 1.10: Commit**

```bash
git init && git add . && git commit -m "feat: project scaffold — docker-compose, FastAPI skeleton, Vite frontend"
```

---

## Task 2: Auth Backend

**Files:**
- Create: `backend/app/models/user.py`
- Create: `backend/app/schemas/auth.py`
- Create: `backend/app/schemas/user.py`
- Create: `backend/app/services/auth_service.py`
- Create: `backend/app/routers/auth.py`
- Create: `backend/app/routers/users.py`
- Create: `backend/app/deps.py`
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_auth.py`

- [ ] **Step 2.1: Create backend/app/models/user.py**

```python
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String(20), default="viewer")  # admin|editor|viewer
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
```

- [ ] **Step 2.2: Create backend/app/schemas/auth.py**

```python
from pydantic import BaseModel, EmailStr

class LoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

class RegisterRequest(BaseModel):
    username: str
    email: EmailStr
    password: str

class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str
```

- [ ] **Step 2.3: Create backend/app/schemas/user.py**

```python
from pydantic import BaseModel, EmailStr
from datetime import datetime
from typing import Optional

class UserOut(BaseModel):
    id: str
    username: str
    email: str
    role: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}

class UserCreate(BaseModel):
    username: str
    email: EmailStr
    password: str
    role: str = "viewer"

class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None
```

- [ ] **Step 2.4: Create backend/app/services/auth_service.py**

```python
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from app.models.user import User
from app.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def hash_password(password: str) -> str:
    return pwd_context.hash(password)

def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)

def create_access_token(data: dict) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    return jwt.encode({**data, "exp": expire}, settings.secret_key, algorithm="HS256")

def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.secret_key, algorithms=["HS256"])

def authenticate_user(db: Session, username: str, password: str) -> User | None:
    user = db.query(User).filter(User.username == username, User.is_active == True).first()
    if user and verify_password(password, user.password_hash):
        return user
    return None

def get_user_by_id(db: Session, user_id: str) -> User | None:
    return db.query(User).filter(User.id == user_id).first()

def seed_admin(db: Session):
    if db.query(User).filter(User.role == "admin").count() == 0:
        admin = User(
            username=settings.first_admin_user,
            email=f"{settings.first_admin_user}@ontoprompt.local",
            password_hash=hash_password(settings.first_admin_password),
            role="admin",
        )
        db.add(admin)
        db.commit()
```

- [ ] **Step 2.5: Create backend/app/deps.py**

```python
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from jose import JWTError
from app.database import SessionLocal
from app.services.auth_service import decode_token, get_user_by_id
from app.models.user import User

bearer = HTTPBearer()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    try:
        payload = decode_token(credentials.credentials)
        user = get_user_by_id(db, payload["sub"])
        if not user or not user.is_active:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        return user
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin required")
    return current_user
```

- [ ] **Step 2.6: Create backend/app/routers/auth.py**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.deps import get_db, get_current_user
from app.schemas.auth import LoginRequest, TokenResponse, RegisterRequest, PasswordChangeRequest
from app.schemas.user import UserOut
from app.services.auth_service import authenticate_user, create_access_token, hash_password, verify_password
from app.models.user import User
import uuid

router = APIRouter()

@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)):
    user = authenticate_user(db, body.username, body.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = create_access_token({"sub": user.id, "role": user.role})
    return TokenResponse(access_token=token)

@router.post("/register", response_model=UserOut, status_code=201)
def register(body: RegisterRequest, db: Session = Depends(get_db)):
    if db.query(User).filter((User.username == body.username) | (User.email == body.email)).first():
        raise HTTPException(status_code=409, detail="Username or email already exists")
    user = User(
        id=str(uuid.uuid4()),
        username=body.username,
        email=body.email,
        password_hash=hash_password(body.password),
        role="viewer",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@router.get("/profile", response_model=UserOut)
def profile(current_user: User = Depends(get_current_user)):
    return current_user

@router.put("/password")
def change_password(body: PasswordChangeRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password incorrect")
    current_user.password_hash = hash_password(body.new_password)
    db.commit()
    return {"message": "Password updated"}
```

- [ ] **Step 2.7: Create backend/app/routers/users.py**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.deps import get_db, require_admin
from app.schemas.user import UserOut, UserCreate, UserUpdate
from app.services.auth_service import hash_password
from app.models.user import User
import uuid

router = APIRouter()

@router.get("", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), _=Depends(require_admin)):
    return db.query(User).all()

@router.post("", response_model=UserOut, status_code=201)
def create_user(body: UserCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    if db.query(User).filter((User.username == body.username) | (User.email == body.email)).first():
        raise HTTPException(status_code=409, detail="Username or email already exists")
    user = User(id=str(uuid.uuid4()), username=body.username, email=body.email,
                password_hash=hash_password(body.password), role=body.role)
    db.add(user); db.commit(); db.refresh(user)
    return user

@router.put("/{user_id}", response_model=UserOut)
def update_user(user_id: str, body: UserUpdate, db: Session = Depends(get_db), _=Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(user, k, v)
    db.commit(); db.refresh(user)
    return user
```

- [ ] **Step 2.8: Create backend/tests/conftest.py**

```python
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app
from app.database import Base
from app.deps import get_db
from app.services.auth_service import hash_password
from app.models.user import User
import uuid

TEST_DB = "sqlite:///./test.db"
engine = create_engine(TEST_DB, connect_args={"check_same_thread": False})
TestSession = sessionmaker(bind=engine)

@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)

@pytest.fixture
def db():
    session = TestSession()
    try:
        yield session
    finally:
        session.close()

@pytest.fixture
def client(db):
    def override_get_db():
        yield db
    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()

@pytest.fixture
def admin_user(db):
    user = User(id=str(uuid.uuid4()), username="admin", email="admin@test.com",
                password_hash=hash_password("admin123"), role="admin")
    db.add(user); db.commit(); db.refresh(user)
    return user

@pytest.fixture
def admin_token(client, admin_user):
    r = client.post("/api/v1/auth/login", json={"username": "admin", "password": "admin123"})
    return r.json()["access_token"]

@pytest.fixture
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}
```

- [ ] **Step 2.9: Write failing auth tests**

```python
# backend/tests/test_auth.py
def test_login_success(client, admin_user):
    r = client.post("/api/v1/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200
    assert "access_token" in r.json()

def test_login_wrong_password(client, admin_user):
    r = client.post("/api/v1/auth/login", json={"username": "admin", "password": "wrong"})
    assert r.status_code == 401

def test_register(client):
    r = client.post("/api/v1/auth/register",
                    json={"username": "newuser", "email": "new@test.com", "password": "pass123"})
    assert r.status_code == 201
    assert r.json()["data"]["username"] == "newuser"

def test_register_duplicate(client, admin_user):
    r = client.post("/api/v1/auth/register",
                    json={"username": "admin", "email": "other@test.com", "password": "pass123"})
    assert r.status_code == 409

def test_profile_requires_auth(client):
    r = client.get("/api/v1/auth/profile")
    assert r.status_code == 403

def test_profile_with_token(client, auth_headers):
    r = client.get("/api/v1/auth/profile", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["data"]["username"] == "admin"
```

- [ ] **Step 2.10: Run tests — expect failures (routes not wired)**

```bash
cd backend && pytest tests/test_auth.py -v
```

- [ ] **Step 2.11: Wire up Alembic + create tables**

```bash
cd backend
alembic init alembic
# Edit alembic/env.py: import Base from app.database, set target_metadata = Base.metadata
alembic revision --autogenerate -m "initial schema"
alembic upgrade head
```

- [ ] **Step 2.12: Run tests — expect pass**

```bash
cd backend && pytest tests/test_auth.py -v
# Expected: 6 passed
```

- [ ] **Step 2.13: Commit**

```bash
git add backend/ && git commit -m "feat: auth backend — JWT login/register/profile, user CRUD, role deps"
```

---

## Task 3: Auth Frontend

**Files:**
- Create: `frontend/src/types/auth.ts`
- Create: `frontend/src/stores/authStore.ts`
- Create: `frontend/src/api/client.ts`
- Create: `frontend/src/api/auth.ts`
- Create: `frontend/src/components/Layout.tsx`
- Create: `frontend/src/pages/login/LoginPage.tsx`
- Create: `frontend/src/pages/register/RegisterPage.tsx`
- Create: `frontend/src/App.tsx`

- [ ] **Step 3.1: Create frontend/src/types/auth.ts**

```typescript
export interface User {
  id: string
  username: string
  email: string
  role: 'admin' | 'editor' | 'viewer'
  is_active: boolean
  created_at: string
}

export interface TokenResponse {
  access_token: string
  token_type: string
}
```

- [ ] **Step 3.2: Create frontend/src/api/client.ts**

```typescript
import axios from 'axios'

export const apiClient = axios.create({ baseURL: '/api/v1' })

apiClient.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

apiClient.interceptors.response.use(
  res => res.data.data ?? res.data,
  err => Promise.reject(err.response?.data ?? err)
)
```

- [ ] **Step 3.3: Create frontend/src/stores/authStore.ts**

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '@/types/auth'

interface AuthState {
  user: User | null
  token: string | null
  setAuth: (user: User, token: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    set => ({
      user: null,
      token: null,
      setAuth: (user, token) => {
        localStorage.setItem('token', token)
        set({ user, token })
      },
      logout: () => {
        localStorage.removeItem('token')
        set({ user: null, token: null })
      },
    }),
    { name: 'auth-store' }
  )
)
```

- [ ] **Step 3.4: Create frontend/src/api/auth.ts**

```typescript
import { apiClient } from './client'
import type { User, TokenResponse } from '@/types/auth'

export const authApi = {
  login: (username: string, password: string) =>
    apiClient.post<TokenResponse>('/auth/login', { username, password }),
  register: (username: string, email: string, password: string) =>
    apiClient.post<User>('/auth/register', { username, email, password }),
  profile: () => apiClient.get<User>('/auth/profile'),
}
```

- [ ] **Step 3.5: Create frontend/src/pages/login/LoginPage.tsx**

```tsx
import { useForm } from 'react-hook-form'
import { useNavigate, Link } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { authApi } from '@/api/auth'
import { useState } from 'react'

export default function LoginPage() {
  const { register, handleSubmit } = useForm<{ username: string; password: string }>()
  const setAuth = useAuthStore(s => s.setAuth)
  const navigate = useNavigate()
  const [error, setError] = useState('')

  const onSubmit = async (data: { username: string; password: string }) => {
    try {
      const res = await authApi.login(data.username, data.password)
      const profile = await authApi.profile()
      setAuth(profile as any, (res as any).access_token)
      navigate('/')
    } catch {
      setError('用户名或密码错误')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-full max-w-sm bg-white rounded-lg shadow p-8">
        <h1 className="text-2xl font-semibold mb-6">OntoPrompt</h1>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <input {...register('username')} placeholder="用户名" className="w-full border rounded-lg px-3 py-2" />
          <input {...register('password')} type="password" placeholder="密码" className="w-full border rounded-lg px-3 py-2" />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button type="submit" className="w-full bg-black text-white rounded-lg py-2">登录</button>
        </form>
        <p className="mt-4 text-sm text-center">
          没有账号? <Link to="/register" className="underline">注册</Link>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 3.6: Create frontend/src/components/Layout.tsx**

```tsx
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/stores/authStore'
import { LayoutDashboard, Network, FileText, Cpu, Settings, LogOut } from 'lucide-react'

const navItems = [
  { to: '/overview', icon: LayoutDashboard, label: '概览' },
  { to: '/ontologies', icon: Network, label: 'Ontology' },
  { to: '/prompts', icon: FileText, label: 'Prompt' },
  { to: '/models', icon: Cpu, label: 'Models' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export default function Layout({ children }: { children: React.ReactNode }) {
  const logout = useAuthStore(s => s.logout)
  const navigate = useNavigate()
  const location = useLocation()

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-56 bg-white border-r flex flex-col">
        <div className="p-4 border-b">
          <h1 className="font-bold text-lg">OntoPrompt</h1>
        </div>
        <nav className="flex-1 p-2 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <Link key={to} to={to}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors
                ${location.pathname.startsWith(to) ? 'bg-black text-white' : 'hover:bg-gray-100'}`}>
              <Icon size={16} /> {label}
            </Link>
          ))}
        </nav>
        <button onClick={() => { logout(); navigate('/login') }}
          className="flex items-center gap-2 p-4 text-sm text-gray-500 hover:text-black">
          <LogOut size={16} /> 退出
        </button>
      </aside>
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  )
}
```

- [ ] **Step 3.7: Create frontend/src/App.tsx**

```tsx
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from '@/stores/authStore'
import Layout from '@/components/Layout'
import LoginPage from '@/pages/login/LoginPage'
import RegisterPage from '@/pages/register/RegisterPage'
import OverviewPage from '@/pages/overview/OverviewPage'
import OntologyListPage from '@/pages/ontologies/list/OntologyListPage'

const qc = new QueryClient()

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore(s => s.token)
  return token ? <Layout>{children}</Layout> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/" element={<Navigate to="/overview" replace />} />
          <Route path="/overview" element={<ProtectedRoute><OverviewPage /></ProtectedRoute>} />
          <Route path="/ontologies" element={<ProtectedRoute><OntologyListPage /></ProtectedRoute>} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
```

- [ ] **Step 3.8: Commit**

```bash
git add frontend/ && git commit -m "feat: auth frontend — login page, register page, protected routes, sidebar layout"
```

---

## Task 4: Overview Page

**Files:**
- Create: `backend/app/routers/overview.py`
- Create: `backend/app/models/ontology.py` (partial — just the table for counting)
- Create: `backend/tests/test_overview.py`
- Create: `frontend/src/pages/overview/OverviewPage.tsx`

- [ ] **Step 4.1: Create backend/app/models/ontology.py** (entities/relations/logic/actions tables added later in Task 9)

```python
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

class OntologyProject(Base):
    __tablename__ = "ontology_projects"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    domain: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    version: Mapped[str] = mapped_column(String(20), default="v0.1")
    status: Mapped[str] = mapped_column(String(20), default="draft")
    created_by: Mapped[str] = mapped_column(String, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
```

- [ ] **Step 4.2: Create backend/app/routers/overview.py**

```python
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.deps import get_db, get_current_user
from app.models.ontology import OntologyProject

router = APIRouter()

@router.get("/stats")
def get_stats(db: Session = Depends(get_db), _=Depends(get_current_user)):
    from app.models.entity import Entity
    from app.models.logic import LogicRule
    from app.models.action import Action
    return {
        "data": {
            "ontology_count": db.query(OntologyProject).count(),
            "entity_count": db.query(Entity).count() if _table_exists(db, "entities") else 0,
            "logic_count": db.query(LogicRule).count() if _table_exists(db, "logic_rules") else 0,
            "action_count": db.query(Action).count() if _table_exists(db, "actions") else 0,
        }
    }

def _table_exists(db, name):
    try:
        db.execute(__import__("sqlalchemy").text(f"SELECT 1 FROM {name} LIMIT 1"))
        return True
    except Exception:
        return False
```

- [ ] **Step 4.3: Write overview tests**

```python
# backend/tests/test_overview.py
def test_stats_requires_auth(client):
    r = client.get("/api/v1/overview/stats")
    assert r.status_code == 403

def test_stats_returns_counts(client, auth_headers, db):
    from app.models.ontology import OntologyProject
    p = OntologyProject(name="Test", domain="供应链", created_by=db.query(__import__("app.models.user", fromlist=["User"]).User).first().id)
    db.add(p); db.commit()
    r = client.get("/api/v1/overview/stats", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["ontology_count"] == 1
```

- [ ] **Step 4.4: Create frontend/src/pages/overview/OverviewPage.tsx**

```tsx
import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/api/client'

interface Stats { ontology_count: number; entity_count: number; logic_count: number; action_count: number }

const cards = [
  { key: 'ontology_count', label: 'Ontology 总数' },
  { key: 'entity_count', label: '实体总数' },
  { key: 'logic_count', label: 'Logic 总数' },
  { key: 'action_count', label: 'Action 总数' },
]

export default function OverviewPage() {
  const { data } = useQuery<Stats>({
    queryKey: ['stats'],
    queryFn: () => apiClient.get('/overview/stats') as any,
  })

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">概览 / Overview</h2>
      <div className="grid grid-cols-4 gap-4">
        {cards.map(({ key, label }) => (
          <div key={key} className="bg-white rounded-lg shadow p-6">
            <p className="text-sm text-gray-500">{label}</p>
            <p className="text-3xl font-bold mt-2">{data?.[key as keyof Stats] ?? '—'}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4.5: Run backend tests**

```bash
cd backend && pytest tests/test_overview.py -v
# Expected: 2 passed
```

- [ ] **Step 4.6: Commit**

```bash
git add . && git commit -m "feat: overview page — stats cards backend + frontend"
```

---

## Task 5: Ontology List + CRUD

**Files:**
- Create: `backend/app/schemas/ontology.py`
- Create: `backend/app/routers/ontologies.py`
- Create: `backend/tests/test_ontologies.py`
- Create: `frontend/src/types/ontology.ts`
- Create: `frontend/src/api/ontologies.ts`
- Create: `frontend/src/components/StatusBadge.tsx`
- Create: `frontend/src/components/ConfirmDialog.tsx`
- Create: `frontend/src/pages/ontologies/list/OntologyListPage.tsx`

- [ ] **Step 5.1: Create backend/app/schemas/ontology.py**

```python
from pydantic import BaseModel, field_validator
from datetime import datetime
from typing import Optional

VALID_DOMAINS = ["供应链","采购","财务","医疗","金融","法律","教育","科技","制造","能源","其他"]

class OntologyCreate(BaseModel):
    name: str
    domain: str
    description: Optional[str] = None

    @field_validator("domain")
    @classmethod
    def validate_domain(cls, v):
        if v not in VALID_DOMAINS:
            raise ValueError(f"Domain must be one of: {VALID_DOMAINS}")
        return v

class OntologyOut(BaseModel):
    id: str
    name: str
    domain: str
    description: Optional[str]
    version: str
    status: str
    created_by: str
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}

class OntologyListItem(BaseModel):
    id: str
    name: str
    domain: str
    version: str
    status: str
    created_by: str
    updated_at: datetime
    model_config = {"from_attributes": True}
```

- [ ] **Step 5.2: Create backend/app/routers/ontologies.py**

```python
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.deps import get_db, get_current_user
from app.models.ontology import OntologyProject
from app.models.user import User
from app.schemas.ontology import OntologyCreate, OntologyOut, OntologyListItem
from datetime import datetime
from typing import Optional
import uuid

router = APIRouter()

@router.get("", response_model=dict)
def list_ontologies(
    name: Optional[str] = None,
    ontology_id: Optional[str] = None,
    page: int = 1, page_size: int = 20,
    db: Session = Depends(get_db), _=Depends(get_current_user)
):
    q = db.query(OntologyProject)
    if name: q = q.filter(OntologyProject.name.ilike(f"%{name}%"))
    if ontology_id: q = q.filter(OntologyProject.id.ilike(f"%{ontology_id}%"))
    total = q.count()
    items = q.order_by(OntologyProject.updated_at.desc()).offset((page-1)*page_size).limit(page_size).all()
    return {"data": {"items": [OntologyListItem.model_validate(i) for i in items], "total": total, "page": page, "page_size": page_size}}

@router.post("", status_code=201)
def create_ontology(body: OntologyCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    existing = db.query(OntologyProject).filter(OntologyProject.name.ilike(body.name)).first()
    if existing:
        raise HTTPException(status_code=409, detail={"error": "DUPLICATE_NAME", "message": f"Ontology 名称「{body.name}」已存在", "existing_id": existing.id})
    project = OntologyProject(id=str(uuid.uuid4()), name=body.name, domain=body.domain,
                               description=body.description, created_by=current_user.id)
    db.add(project); db.commit(); db.refresh(project)
    return {"data": OntologyOut.model_validate(project)}

@router.get("/{ontology_id}")
def get_ontology(ontology_id: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    p = db.query(OntologyProject).filter(OntologyProject.id == ontology_id).first()
    if not p: raise HTTPException(404, "Not found")
    return {"data": OntologyOut.model_validate(p)}

@router.delete("/{ontology_id}", status_code=204)
def delete_ontology(ontology_id: str, db: Session = Depends(get_db), _=Depends(get_current_user)):
    p = db.query(OntologyProject).filter(OntologyProject.id == ontology_id).first()
    if not p: raise HTTPException(404, "Not found")
    db.delete(p); db.commit()
```

- [ ] **Step 5.3: Write ontology tests**

```python
# backend/tests/test_ontologies.py
def test_create_ontology(client, auth_headers):
    r = client.post("/api/v1/ontologies",
                    json={"name": "供应链测试", "domain": "供应链"},
                    headers=auth_headers)
    assert r.status_code == 201
    assert r.json()["data"]["name"] == "供应链测试"

def test_duplicate_name_returns_409(client, auth_headers):
    client.post("/api/v1/ontologies", json={"name": "供应链测试", "domain": "供应链"}, headers=auth_headers)
    r = client.post("/api/v1/ontologies", json={"name": "供应链测试", "domain": "供应链"}, headers=auth_headers)
    assert r.status_code == 409

def test_invalid_domain_returns_422(client, auth_headers):
    r = client.post("/api/v1/ontologies", json={"name": "Test", "domain": "invalid"}, headers=auth_headers)
    assert r.status_code == 422

def test_list_ontologies(client, auth_headers):
    client.post("/api/v1/ontologies", json={"name": "A", "domain": "供应链"}, headers=auth_headers)
    client.post("/api/v1/ontologies", json={"name": "B", "domain": "采购"}, headers=auth_headers)
    r = client.get("/api/v1/ontologies", headers=auth_headers)
    assert r.json()["data"]["total"] == 2

def test_delete_ontology(client, auth_headers):
    r = client.post("/api/v1/ontologies", json={"name": "Del", "domain": "财务"}, headers=auth_headers)
    oid = r.json()["data"]["id"]
    r2 = client.delete(f"/api/v1/ontologies/{oid}", headers=auth_headers)
    assert r2.status_code == 204
```

- [ ] **Step 5.4: Create frontend/src/types/ontology.ts**

```typescript
export type OntologyStatus = 'draft' | 'creating' | 'created' | 'archived'

export interface OntologyListItem {
  id: string; name: string; domain: string
  version: string; status: OntologyStatus
  created_by: string; updated_at: string
}

export const DOMAINS = ['供应链','采购','财务','医疗','金融','法律','教育','科技','制造','能源','其他']
```

- [ ] **Step 5.5: Create frontend/src/components/StatusBadge.tsx**

```tsx
const COLOR: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-600',
  creating: 'bg-blue-100 text-blue-700',
  created: 'bg-green-100 text-green-700',
  archived: 'bg-yellow-100 text-yellow-700',
}
const LABEL: Record<string, string> = {
  draft: '草稿', creating: '创建中', created: '已创建', archived: '已归档'
}

export default function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${COLOR[status] ?? 'bg-gray-100'}`}>
      {LABEL[status] ?? status}
    </span>
  )
}
```

- [ ] **Step 5.6: Create frontend/src/components/ConfirmDialog.tsx**

```tsx
interface Props { open: boolean; title: string; message: string; onConfirm: () => void; onCancel: () => void }

export default function ConfirmDialog({ open, title, message, onConfirm, onCancel }: Props) {
  if (!open) return null
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg p-6 w-96">
        <h3 className="font-semibold text-lg mb-2">{title}</h3>
        <p className="text-gray-600 text-sm mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-4 py-2 border rounded-lg text-sm">取消</button>
          <button onClick={onConfirm} className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm">确认删除</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5.7: Create frontend/src/api/ontologies.ts**

```typescript
import { apiClient } from './client'
import type { OntologyListItem } from '@/types/ontology'

export const ontologyApi = {
  list: (params?: { name?: string; page?: number; page_size?: number }) =>
    apiClient.get<{ items: OntologyListItem[]; total: number }>('/ontologies', { params }),
  create: (body: { name: string; domain: string; description?: string }) =>
    apiClient.post<OntologyListItem>('/ontologies', body),
  get: (id: string) => apiClient.get<OntologyListItem>(`/ontologies/${id}`),
  delete: (id: string) => apiClient.delete(`/ontologies/${id}`),
}
```

- [ ] **Step 5.8: Create OntologyListPage.tsx**

```tsx
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ontologyApi } from '@/api/ontologies'
import StatusBadge from '@/components/StatusBadge'
import ConfirmDialog from '@/components/ConfirmDialog'
import { DOMAINS } from '@/types/ontology'

export default function OntologyListPage() {
  const [nameFilter, setNameFilter] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDomain, setNewDomain] = useState(DOMAINS[0])
  const qc = useQueryClient()
  const navigate = useNavigate()

  const { data } = useQuery({
    queryKey: ['ontologies', nameFilter],
    queryFn: () => ontologyApi.list({ name: nameFilter || undefined }),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => ontologyApi.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ontologies'] }); setDeleteTarget(null) },
  })

  const createMut = useMutation({
    mutationFn: () => ontologyApi.create({ name: newName, domain: newDomain }),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ['ontologies'] })
      setShowCreate(false)
      navigate(`/ontologies/${res.id}/create`)
    },
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold">Ontology 管理</h2>
        <button onClick={() => setShowCreate(true)} className="bg-black text-white px-4 py-2 rounded-lg text-sm">
          创建 Ontology
        </button>
      </div>

      <div className="flex gap-3 mb-4">
        <input value={nameFilter} onChange={e => setNameFilter(e.target.value)}
          placeholder="按名称筛选" className="border rounded-lg px-3 py-2 text-sm w-64" />
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>{['ID','名称','版本','状态','更新时间','操作'].map(h => (
              <th key={h} className="px-4 py-3 text-left text-gray-500 font-medium">{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {data?.items?.map(o => (
              <tr key={o.id} className="border-b hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs text-gray-400">{o.id.slice(0,8)}</td>
                <td className="px-4 py-3 font-medium">{o.name}</td>
                <td className="px-4 py-3 text-gray-500">{o.version}</td>
                <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                <td className="px-4 py-3 text-gray-500">{new Date(o.updated_at).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <button onClick={() => navigate(`/ontologies/${o.id}`)} className="text-blue-600 hover:underline mr-3">查看</button>
                  <button onClick={() => setDeleteTarget({ id: o.id, name: o.name })} className="text-red-600 hover:underline">删除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data?.items?.length && <p className="text-center text-gray-400 py-8">暂无 Ontology</p>}
      </div>

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-96">
            <h3 className="font-semibold mb-4">创建 Ontology</h3>
            <input value={newName} onChange={e => setNewName(e.target.value)}
              placeholder="Ontology 名称 *" className="w-full border rounded-lg px-3 py-2 mb-3 text-sm" />
            <select value={newDomain} onChange={e => setNewDomain(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 mb-4 text-sm">
              {DOMAINS.map(d => <option key={d}>{d}</option>)}
            </select>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowCreate(false)} className="px-4 py-2 border rounded-lg text-sm">取消</button>
              <button onClick={() => createMut.mutate()} disabled={!newName}
                className="px-4 py-2 bg-black text-white rounded-lg text-sm disabled:opacity-50">确认</button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="确认删除"
        message={`确定要删除 Ontology「${deleteTarget?.name}」吗？此操作不可撤销。`}
        onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
```

- [ ] **Step 5.9: Run all backend tests**

```bash
cd backend && pytest tests/ -v
# Expected: all pass
```

- [ ] **Step 5.10: Commit**

```bash
git add . && git commit -m "feat: ontology list CRUD — backend API, frontend list page, create modal, delete confirm"
```

---

**End of Part 1.** Continue with Part 2 for File Upload, Prompt Management, and Model Management.
