"""Grupo 5 do Q-01 — migrações num banco zerado.

O fixture de sessão `migrated_db` já faz DROP SCHEMA + `alembic upgrade head`
(o caso que quebrou na 044b em instalação nova). Aqui conferimos o resultado
e as constraints que seguram incidentes reais. Também garantimos que os
modelos SQLAlchemy descrevem exatamente o schema migrado (`alembic check`).
"""
import subprocess
import sys

from sqlalchemy import text

from .conftest import BACKEND_DIR


def test_alembic_tem_uma_unica_head():
    out = subprocess.run(
        [sys.executable, "-m", "alembic", "heads"], cwd=BACKEND_DIR, capture_output=True, text=True, check=True
    ).stdout
    heads = [line for line in out.splitlines() if "(head)" in line]
    assert len(heads) == 1, out


async def test_banco_zerado_chega_na_head(migrated_db):
    from src.core.database import engine

    out = subprocess.run(
        [sys.executable, "-m", "alembic", "heads"], cwd=BACKEND_DIR, capture_output=True, text=True, check=True
    ).stdout
    head = out.split()[0]
    async with engine.connect() as conn:
        version = (await conn.execute(text("SELECT version_num FROM alembic_version"))).scalar_one()
    assert version == head


async def test_tabelas_principais_existem(table_names):
    for table in ("tenants", "users", "giras", "tickets", "consulentes", "senha_controls", "subscriptions",
                  "permission_groups", "group_permissions", "user_group_memberships", "stripe_events_processed",
                  "tenant_configs", "audit_logs"):
        assert table in table_names, table


async def test_constraints_que_seguram_incidentes(migrated_db):
    """Índices únicos criados por migração (declarados também nos modelos desde 2026-10-05)."""
    from src.core.database import engine

    async with engine.connect() as conn:
        indexes = {
            r[0]
            for r in await conn.execute(text("SELECT indexname FROM pg_indexes WHERE schemaname = 'public'"))
        }
        uniques = {
            r[0]
            for r in await conn.execute(
                text("SELECT conname FROM pg_constraint WHERE contype = 'u' AND connamespace = 'public'::regnamespace")
            )
        }
    # Consulente duplicado por e-mail no mesmo tenant (migração 052).
    assert "uq_consulentes_tenant_email_active" in indexes
    # Evento Stripe processado uma vez só (idempotência do webhook).
    assert any("event_id" in name or "stripe_events" in name for name in indexes | uniques)
    # Uma senha ativa por consulente/gira/tipo (migração 056, Q-03).
    assert "uq_tickets_gira_consulente_ativo" in indexes
    # Um grupo padrão "Acesso total" por tenant (migração 057, Q-05).
    assert "uq_permission_groups_tenant_default" in indexes


def test_modelos_batem_com_schema_migrado(migrated_db):
    """`alembic check` sem diferenças: o schema migrado (fonte da verdade, é o
    que existe em produção) e os modelos em src/models/ estão alinhados.
    Se falhar, ajuste o MODELO para refletir a migração — ou, se o banco
    estiver errado, crie uma migração nova."""
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "check"], cwd=BACKEND_DIR, capture_output=True, text=True
    )
    assert result.returncode == 0, f"alembic check detectou drift:\n{result.stdout}\n{result.stderr}"


async def test_app_autenticado_responde_com_banco_real(client, db):
    """Fumaça da infraestrutura: JWT → middleware → Depends → Postgres."""
    from .factories import create_tenant, create_user

    tenant = await create_tenant(db)
    admin = await create_user(db, tenant)
    resp = await client.get("/api/v1/admin/giras", headers=admin.headers)
    assert resp.status_code == 200, resp.text
