"""FastAPI Application Entry Point.

Re-exports the fully configured app from src.main (with all routers,
middleware, and exception handlers).
"""
from src.main import app  # noqa: F401

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
