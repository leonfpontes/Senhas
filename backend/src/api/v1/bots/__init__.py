"""Rotas de leitura para os bots internos (token próprio, sem login de usuário)."""
from src.api.v1.bots.crescimento import router as crescimento_router

__all__ = ["crescimento_router"]
