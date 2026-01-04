from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    # API Keys
    openai_api_key: str
    rapidapi_key: Optional[str] = None

    # LinkedIn Credentials
    linkedin_email: Optional[str] = None
    linkedin_password: Optional[str] = None

    # Database
    database_url: str = "sqlite:///./sales_aura.db"

    # Application Settings
    search_interval_hours: int = 1
    max_results_per_search: int = 50
    min_relevance_score: float = 0.6

    # Server
    host: str = "0.0.0.0"
    port: int = 8000

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
