from pydantic_settings import BaseSettings
from typing import List

class Settings(BaseSettings):
    # Database
    database_url: str
    database_echo: bool = False
    
    # Google APIs
    google_api_key: str
    google_tts_credentials_path: str = "./credentials.json"
    
    # Application
    environment: str = "development"
    cors_origins: List[str] = ["http://localhost:3000", "http://localhost:5173"]
    
    # Obsidian
    obsidian_folder_path: str = "../obsidian-test"
    
    # Groq (legacy, kept for env compat — LLM calls go via OmniRoute gateway now)
    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"

    # OmniRoute LLM gateway (OpenAI-compatible). All LLM chat/embedding
    # requests go through it. api_key can also be set via Settings UI
    # (stored in DB, overrides env).
    omnirouter_base_url: str = "http://host.docker.internal:20128/v1"
    omnirouter_api_key: str = ""
    omnirouter_chat_model: str = "tokenharbor/deepseek-v4.1-flash:free"
    omnirouter_embedding_model: str = "openrouter/openai/text-embedding-3-small"

    # App password gate (single shared password, empty = no auth)
    app_password_hash: str = ""
    
    # CouchDB (Self-hosted LiveSync)
    couchdb_username: str = "admin"
    couchdb_password: str = ""
    
    # FSRS defaults
    fsrs_default_stability: float = 1.0
    fsrs_default_difficulty: float = 5.0
    
    class Config:
        env_file = "../.env"

settings = Settings()
