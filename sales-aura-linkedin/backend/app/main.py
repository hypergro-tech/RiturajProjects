"""Main FastAPI application for Sales AURA"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import os

from app.api.routes import router
from app.models.database import init_db
from app.services.scheduler import scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifespan events for startup and shutdown"""
    # Startup
    print("Starting Sales AURA - LinkedIn Leads Agent...")

    # Initialize database
    print("Initializing database...")
    init_db()

    # Start scheduler
    print("Starting scheduler...")
    scheduler.start()

    yield

    # Shutdown
    print("Shutting down Sales AURA...")
    scheduler.stop()


# Create FastAPI app
app = FastAPI(
    title="Sales AURA - LinkedIn Leads",
    description="AI-powered LinkedIn lead generation for Hypergro.ai",
    version="1.0.0",
    lifespan=lifespan
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routes
app.include_router(router, prefix="/api")

# Serve static files (frontend)
frontend_path = os.path.join(os.path.dirname(__file__), "../../frontend")
if os.path.exists(frontend_path):
    app.mount("/", StaticFiles(directory=frontend_path, html=True), name="frontend")


@app.get("/health")
def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "Sales AURA - LinkedIn Leads",
        "scheduler_running": scheduler.is_running
    }


if __name__ == "__main__":
    import uvicorn
    from app.core.config import settings

    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=True
    )
