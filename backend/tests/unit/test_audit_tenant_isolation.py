"""Testes do auditor de isolamento de tenant (scripts/audit_tenant_isolation.py, item Q-02).

Os snippets sintéticos são gravados em tmp_path e auditados com o mesmo código que roda no CI.
O teste de mutação (exigido pelo aceite do Q-02) pega um arquivo admin real, remove um filtro
de tenant em memória e confirma que o auditor passa a acusar a query.
"""
import importlib.util
import re
import textwrap
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[2]
SCRIPT = BACKEND_DIR / "scripts" / "audit_tenant_isolation.py"

_spec = importlib.util.spec_from_file_location("audit_tenant_isolation", SCRIPT)
audit = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(audit)

TENANT_MODELS = {"Gira", "Ticket"}

HEADER = """\
from sqlalchemy import select, update, delete, func, and_
from src.models import Gira, Ticket, Tenant
"""


def _audit(tmp_path: Path, body: str, exempt=None, name: str = "fake_admin.py"):
    path = tmp_path / name
    path.write_text(HEADER + textwrap.dedent(body))
    violations, checked = audit.find_unfiltered_queries(
        path, TENANT_MODELS, exempt_queries=exempt if exempt is not None else {}
    )
    return violations, checked


# ─── Descoberta de modelos ──────────────────────────────────────────────────────────


def test_discover_models_detecta_classes_com_tenant_id(tmp_path):
    (tmp_path / "x.py").write_text(
        textwrap.dedent(
            """
            class ComTenant(Base):
                tenant_id: Mapped[uuid.UUID] = mapped_column(UUID)

            class SemTenant(Base):
                id: Mapped[uuid.UUID] = mapped_column(UUID)

            class Legado(Base):
                tenant_id = Column(UUID)
            """
        )
    )
    assert audit.discover_tenant_models(tmp_path) == {"ComTenant", "Legado"}


def test_discover_models_reais_inclui_principais_e_exclui_tenant():
    models = audit.discover_tenant_models()
    assert {"Gira", "Ticket", "User", "Medium", "ContaFinanceira"} <= models
    assert "Tenant" not in models  # a própria tabela de tenants não tem tenant_id


# ─── Queries sintéticas ─────────────────────────────────────────────────────────────


def test_select_filtrado_passa(tmp_path):
    violations, checked = _audit(
        tmp_path,
        """
        async def ep(db, current_user, gira_id):
            stmt = select(Gira).where(Gira.id == gira_id, Gira.tenant_id == current_user.tenant_id)
            return (await db.execute(stmt)).scalar_one_or_none()
        """,
    )
    assert checked == 1
    assert violations == []


def test_select_sem_filtro_em_modelo_tenant_falha(tmp_path):
    violations, _ = _audit(
        tmp_path,
        """
        async def ep(db, current_user, gira_id):
            stmt = select(Gira).where(Gira.id == gira_id)
            return (await db.execute(stmt)).scalar_one_or_none()
        """,
    )
    assert violations == [(5, "ep", "Gira")]


def test_select_em_modelo_sem_tenant_id_passa(tmp_path):
    violations, checked = _audit(
        tmp_path,
        """
        async def ep(db, current_user):
            return await db.execute(select(Tenant.slug).where(Tenant.id == current_user.tenant_id))
        """,
    )
    assert checked == 0
    assert violations == []


def test_filter_by_tenant_id_passa(tmp_path):
    violations, _ = _audit(
        tmp_path,
        """
        async def ep(db, tenant_id):
            return await db.execute(select(Ticket).filter_by(tenant_id=tenant_id))
        """,
    )
    assert violations == []


def test_lista_de_condicoes_passa(tmp_path):
    violations, _ = _audit(
        tmp_path,
        """
        async def ep(db, current_user, status=None):
            conditions = [Ticket.deleted_at.is_(None)]
            conditions.append(Ticket.tenant_id == current_user.tenant_id)
            if status:
                conditions.append(Ticket.status == status)
            return await db.execute(select(func.count(Ticket.id)).where(and_(*conditions)))
        """,
    )
    assert violations == []


def test_stmt_estendido_depois_passa(tmp_path):
    violations, _ = _audit(
        tmp_path,
        """
        async def ep(db, current_user, ativo=None):
            stmt = select(Gira).where(Gira.tenant_id == current_user.tenant_id)
            if ativo is not None:
                stmt = stmt.where(Gira.is_active == ativo)
            stmt = stmt.order_by(Gira.data_inicio)
            return await db.execute(stmt)
        """,
    )
    assert violations == []


def test_reusar_nome_stmt_nao_empresta_filtro(tmp_path):
    """`stmt` reatribuído a outra query filtrada não "cobre" a primeira, sem filtro."""
    violations, _ = _audit(
        tmp_path,
        """
        async def ep(db, current_user, gira_id):
            stmt = select(Ticket).where(Ticket.gira_id == gira_id)
            tickets = (await db.execute(stmt)).scalars().all()
            stmt = select(Gira).where(Gira.tenant_id == current_user.tenant_id)
            giras = (await db.execute(stmt)).scalars().all()
            return tickets, giras
        """,
    )
    assert [(v[1], v[2]) for v in violations] == [("ep", "Ticket")]


def test_comparacao_entre_colunas_nao_conta_como_filtro(tmp_path):
    violations, _ = _audit(
        tmp_path,
        """
        async def ep(db):
            return await db.execute(select(Ticket).join(Gira).where(Gira.tenant_id == Ticket.tenant_id))
        """,
    )
    assert len(violations) == 1


def test_select_from_count_e_update_delete(tmp_path):
    violations, checked = _audit(
        tmp_path,
        """
        async def ep(db, tid, gira_id):
            await db.execute(select(func.count()).select_from(Gira).where(Gira.tenant_id == tid))
            await db.execute(update(Ticket).where(Ticket.gira_id == gira_id).values(status="x"))
            await db.execute(delete(Ticket).where(Ticket.tenant_id == tid))
        """,
    )
    assert checked == 3
    assert [(v[1], v[2]) for v in violations] == [("ep", "Ticket")]
    assert violations[0][0] == 6  # o update sem filtro


def test_db_delete_de_objeto_nao_e_query(tmp_path):
    violations, checked = _audit(
        tmp_path,
        """
        async def ep(db, obj, data):
            data.update({"a": Gira})
            await db.delete(obj)
        """,
    )
    assert checked == 0
    assert violations == []


def test_filtro_via_pai_carregado_na_mesma_funcao_passa(tmp_path):
    violations, _ = _audit(
        tmp_path,
        """
        async def ep(db, current_user, gira_id):
            gira = (await db.execute(
                select(Gira).where(Gira.id == gira_id, Gira.tenant_id == current_user.tenant_id)
            )).scalar_one()
            return await db.execute(select(Ticket).where(Ticket.gira_id == gira.id))
        """,
    )
    assert violations == []


def test_alias_de_import_e_resolvido(tmp_path):
    path = tmp_path / "alias.py"
    path.write_text(
        textwrap.dedent(
            """
            async def ep(db, gira_id):
                from sqlalchemy import select as sa_select
                from src.models.giras import Gira as GiraModel
                return await db.execute(sa_select(GiraModel).where(GiraModel.id == gira_id))
            """
        )
    )
    violations, _ = audit.find_unfiltered_queries(path, TENANT_MODELS, exempt_queries={})
    assert [(v[1], v[2]) for v in violations] == [("ep", "GiraModel")]


def test_session_get_sem_checagem_falha_e_com_checagem_passa(tmp_path):
    violations, checked = _audit(
        tmp_path,
        """
        async def sem_check(db, gira_id):
            return await db.get(Gira, gira_id)

        async def com_check(db, current_user, gira_id):
            gira = await db.get(Gira, gira_id)
            if gira is None or gira.tenant_id != current_user.tenant_id:
                raise NotFound()
            return gira
        """,
    )
    assert checked == 2
    assert [(v[1], v[2]) for v in violations] == [("sem_check", "Gira")]


def test_excecao_justificada_silencia_a_funcao(tmp_path):
    body = """
    async def visao_plataforma(db):
        return await db.execute(select(Gira))
    """
    violations, _ = _audit(tmp_path, body)
    assert len(violations) == 1
    violations, checked = _audit(
        tmp_path, body, exempt={("fake_admin.py", "visao_plataforma"): "cross-tenant"}
    )
    assert checked == 1
    assert violations == []


def test_toda_excecao_tem_justificativa():
    for key, reason in {**audit.EXEMPT_FILES, **audit.EXEMPT_QUERIES}.items():
        assert isinstance(reason, str) and len(reason.strip()) > 10, key


# ─── Código real ────────────────────────────────────────────────────────────────────


def test_codigo_atual_passa_no_auditor():
    assert audit.main() == 0


@pytest.mark.parametrize(
    "filename, filtro",
    [
        # create_gira: contagem mensal de giras pro limite do plano
        ("giras_crud.py", "Gira.tenant_id == current_user.tenant_id,\n                Gira.created_at"),
        # list_categorias: listagem de categorias financeiras (1ª ocorrência no arquivo)
        ("contas_financeiras.py", None),
    ],
)
def test_mutacao_remover_filtro_de_tenant_quebra_o_auditor(tmp_path, filename, filtro):
    """Aceite do Q-02: tirar um filtro de tenant de propósito de um arquivo admin real
    faz o auditor falhar."""
    real = audit.ADMIN_DIR / filename
    source = real.read_text()
    models = audit.discover_tenant_models()
    baseline, _ = audit.find_unfiltered_queries(real, models, source=source)
    assert baseline == []

    if filtro is None:
        # remove a primeira ocorrência de `<Modelo>.tenant_id == current_user.tenant_id,`
        mutated, n = re.subn(
            r"\n\s*\w+\.tenant_id == current_user\.tenant_id,", "", source, count=1
        )
    else:
        assert filtro in source, "filtro do teste não existe mais no arquivo — atualize o teste"
        mutated = source.replace(filtro, "Gira.created_at", 1)
        n = 1
    assert n == 1 and mutated != source

    copy = tmp_path / filename
    copy.write_text(mutated)
    violations, _ = audit.find_unfiltered_queries(copy, models)
    assert violations, "auditor não detectou a remoção do filtro de tenant"
