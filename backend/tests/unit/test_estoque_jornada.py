"""Jornada Estoque — correções verificadas (2026-10-06).

- Export CSV gated também no backend por `export_csv` (antes só o botão escondia).
- `ItemUpdate.estoque_minimo` não aceita negativo (o create já validava).
- Editar grupo consegue LIMPAR a descrição (null explícito era ignorado).
- Listagens com ordem determinística (paginação por offset sem repetir/pular).
"""
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from pydantic import ValidationError

from tests.plan_gate_helpers import plan_gate_features


def test_csv_de_posicao_exige_export_csv_alem_do_estoque():
    from src.api.v1.admin.estoque import router

    # (a rota também herda as dependencies do router — por isso set, não lista)
    assert set(plan_gate_features(router, "/relatorio/posicao/csv")) == {"estoque_controle", "export_csv"}
    # A tela de posição (sem CSV) continua só com o gate do módulo.
    assert set(plan_gate_features(router, "/relatorio/posicao")) == {"estoque_controle"}


def test_item_update_rejeita_estoque_minimo_negativo():
    from src.api.v1.admin.estoque import ItemUpdate

    with pytest.raises(ValidationError):
        ItemUpdate(estoque_minimo=-1)
    assert ItemUpdate(estoque_minimo=0).estoque_minimo == 0
    assert ItemUpdate().estoque_minimo is None


def _repo_com_grupo(grupo):
    from src.repositories.estoque_repo import EstoqueGrupoRepository

    db = AsyncMock()
    db.add = MagicMock()
    repo = EstoqueGrupoRepository(db)
    repo.get_by_id = AsyncMock(return_value=grupo)
    return repo


@pytest.mark.asyncio
async def test_update_grupo_null_explicito_limpa_descricao():
    grupo = MagicMock(nome="Velas", descricao="Velas de sete dias")
    repo = _repo_com_grupo(grupo)

    await repo.update_grupo(uuid4(), uuid4(), descricao=None)
    assert grupo.descricao is None
    assert grupo.nome == "Velas"


@pytest.mark.asyncio
async def test_update_grupo_campo_omitido_fica_como_esta():
    grupo = MagicMock(nome="Velas", descricao="Velas de sete dias")
    repo = _repo_com_grupo(grupo)

    await repo.update_grupo(uuid4(), uuid4(), nome="  Velas brancas ")
    assert grupo.nome == "Velas brancas"
    assert grupo.descricao == "Velas de sete dias"


@pytest.mark.asyncio
async def test_endpoint_update_grupo_repassa_so_campos_enviados():
    from src.api.v1.admin import estoque as est

    grupo = MagicMock(id=uuid4(), nome="Velas", descricao=None)
    repo = MagicMock()
    repo.update_grupo = AsyncMock(return_value=grupo)
    db = AsyncMock()
    user = MagicMock(tenant_id=uuid4(), id=uuid4())

    with pytest.MonkeyPatch.context() as mp:
        mp.setattr(est, "EstoqueGrupoRepository", lambda _db: repo)
        mp.setattr(est, "AuditService", lambda _db: AsyncMock())
        await est.update_grupo(grupo.id, est.GrupoUpdate.model_validate({"descricao": None}), user, db)

    kwargs = repo.update_grupo.await_args.kwargs
    assert kwargs["descricao"] is None
    assert "nome" not in kwargs


def _compiled_order_by(stmt) -> str:
    sql = str(stmt.compile(compile_kwargs={"literal_binds": False}))
    return sql.split("ORDER BY", 1)[1]


@pytest.mark.asyncio
async def test_listagens_tem_desempate_por_id():
    from src.repositories.estoque_repo import EstoqueItemRepository, EstoqueMovimentacaoRepository

    db = AsyncMock()
    result = MagicMock()
    result.scalars.return_value.all.return_value = []
    db.execute = AsyncMock(return_value=result)

    await EstoqueItemRepository(db).list_all(uuid4())
    assert "estoque_itens.id" in _compiled_order_by(db.execute.await_args.args[0])

    await EstoqueMovimentacaoRepository(db).list_filtered(uuid4())
    assert "estoque_movimentacoes.id" in _compiled_order_by(db.execute.await_args.args[0])
