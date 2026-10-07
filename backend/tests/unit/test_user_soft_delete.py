"""Excluir um usuário corta o acesso na hora (desativa e revoga as sessões)."""
from datetime import datetime, timezone

from src.models.users import User, UserRole


def test_soft_delete_desativa_e_revoga_sessoes():
    user = User(email="x@example.com", username="x", password_hash="h", role=UserRole.OPERATOR, is_active=True)
    antes = datetime.now(timezone.utc)

    user.soft_delete()

    assert user.deleted_at is not None and user.deleted_at >= antes
    assert user.is_active is False
    assert user.sessions_revoked_at is not None and user.sessions_revoked_at >= antes
