from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="PERSONA_", extra="ignore")

    database_url: str = "postgresql+psycopg://persona_lens@127.0.0.1:55432/persona_lens"
    encryption_key: str = ""
    cookie_secure: bool = False
    allowed_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173", "http://127.0.0.1:4173"]
    dgx_allowed_base_urls: list[str] = []
    # Explicit opt-in for isolated, fake-key testing. Never changes production provider URLs.
    mock_provider_base_url: str = ""
    parquet_path: str = ""
    openai_inference_enabled: bool = False
    openai_max_people: int = Field(default=10000, ge=10, le=10000)
    openai_max_responses: int = Field(default=10000000, ge=1, le=10000000)
    openai_max_output_tokens: int = Field(default=2048, ge=256, le=8192)
    openai_timeout_seconds: float = Field(default=90, ge=1, le=180)


settings = Settings()
