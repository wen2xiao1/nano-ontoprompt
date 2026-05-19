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
    # Import all models
    from app.models import user, ontology, file, prompt, model_config, entity
    from app.models import logic, action, relation, extraction_task, rules_config
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
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()

@pytest.fixture
def admin_user(db):
    user = User(id=str(uuid.uuid4()), username="admin", email="admin@test.com",
                password_hash=hash_password("admin123"), role="admin")
    db.add(user); db.commit(); db.refresh(user)
    return user

@pytest.fixture
def editor_user(db):
    user = User(id=str(uuid.uuid4()), username="editor", email="editor@test.com",
                password_hash=hash_password("editor123"), role="editor")
    db.add(user); db.commit(); db.refresh(user)
    return user

@pytest.fixture
def admin_token(client, admin_user):
    r = client.post("/api/v1/auth/login", json={"username": "admin", "password": "admin123"})
    return r.json()["data"]["access_token"]

@pytest.fixture
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}

@pytest.fixture
def ontology(client, auth_headers, db):
    r = client.post("/api/v1/ontologies", json={"name": "测试本体", "domain": "供应链"}, headers=auth_headers)
    return r.json()["data"]
