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

    model_config = {"env_file": ".env"}

settings = Settings()
