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
    
    # FSRS defaults
    fsrs_default_stability: float = 1.0
    fsrs_default_difficulty: float = 5.0
    
    class Config:
        env_file = "../.env"

settings = Settings()
