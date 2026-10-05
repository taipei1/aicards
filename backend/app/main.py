from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from sqlalchemy import text

from app.config import settings
from app.database import engine, Base
from app.routers import cards, reviews, obsidian, stats, tts, groq
from app.routers import settings as settings_router
from app.routers import auth
from app.routers import translate

# The embeddings column needs pgvector, so the extension must exist BEFORE
# create_all — otherwise a fresh database fails to create note_embeddings.
def _ensure_vector_extension() -> None:
    try:
        with engine.begin() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
    except Exception as e:
        print(f"Warning: could not ensure pgvector extension: {e}")


_ensure_vector_extension()

# Create tables on startup
Base.metadata.create_all(bind=engine)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    print("🚀 SRS Application starting...")
    _ensure_vector_extension()
    yield
    # Shutdown
    print("🛑 SRS Application shutting down...")

app = FastAPI(
    title="SRS Application API",
    version="0.1.0",
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
AUTH_FREE_PREFIXES = ("/api/auth", "/docs", "/redoc")
AUTH_FREE_PATHS = {"/", "/openapi.json"}

@app.middleware("http")
async def auth_gate(request, call_next):
    """Single shared-password gate: everything under /api/* needs a live
    bearer token, except /api/auth/* and /."""
    path = request.url.path
    if settings.app_password_hash and request.method not in ("OPTIONS",):
        allowed = path in AUTH_FREE_PATHS or any(
            path.startswith(p) for p in AUTH_FREE_PREFIXES
        )
        if not allowed:
            if not auth.token_is_valid(request):
                from starlette.responses import JSONResponse
                return JSONResponse({"detail": "Not authenticated"}, status_code=401)
    return await call_next(request)


app.include_router(cards.router, prefix="/api/cards", tags=["cards"])
app.include_router(reviews.router, prefix="/api/reviews", tags=["reviews"])
app.include_router(obsidian.router, prefix="/api/obsidian", tags=["obsidian"])
app.include_router(stats.router, prefix="/api/stats", tags=["stats"])
app.include_router(tts.router, prefix="", tags=["tts"])
app.include_router(groq.router, prefix="/api/groq", tags=["groq"])
app.include_router(translate.router, prefix="/api/translate", tags=["translate"])
app.include_router(settings_router.router, prefix="/api/settings", tags=["settings"])
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])


@app.get("/")
def read_root():
    return {"message": "SRS API is running"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )
