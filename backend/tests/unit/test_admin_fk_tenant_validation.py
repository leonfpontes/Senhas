"""Regressão: FKs recebidos no body precisam pertencer ao tenant do usuário.

Encontrado durante o Q-02 (auditor de tenant_id): contas a pagar/receber aceitavam
`categoria_id`/`conta_bancaria_id` e itens de estoque aceitavam `grupo_id` de OUTRO tenant
sem validação — o lançamento/item passava a apontar para o registro alheio e a resposta
devolvia o nome dele (`categoria_nome`, `conta_bancaria_nome`, `grupo_nome`).
"""
import uuid
from datetime import date
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException
from sqlalchemy.dialects import postgresql

from src.api.v1.admin import contas_financeiras as cf
from src.api.v1.admin import estoque as est
from tests.conftest import TENANT_ID, USER_ID

FOREIGN_ID = uuid.UUID("00000000-0000-0000-0000-0000000000f1")
CONTA_ID = uuid.UUID("00000000-0000-0000-0000-0000000000c1")
ITEM_ID = uuid.UUID("00000000-0000-0000-0000-0000000000e1")


def _user():
    user = MagicMock()
    user.id = USER_ID
    user.tenant_id = TENANT_ID
    return user


def _result(value):
    r = MagicMock()
    r.scalar_one_or_none.return_value = value
    return r


def _assert_filtra_por_tenant(stmt, tabela: str):
    compiled = stmt.compile(dialect=postgresql.dialect())
    assert f"{tabela}.tenant_id" in str(compiled)
    assert TENANT_ID in compiled.params.values()


# ─── Contas a pagar/receber ─────────────────────────────────────────────────────────


async def test_create_conta_rejeita_categoria_de_outro_tenant():
    db = AsyncMock()
    db.add = MagicMock()
    db.execute.return_value = _result(None)
    body = cf.ContaFinanceiraCreate(
        tipo="pagar", descricao="Luz", valor=10, data_vencimento=date(2026, 10, 5),
        categoria_id=FOREIGN_ID,
    )
    with pytest.raises(HTTPException) as exc:
        await cf.create_conta(body, _user(), db)
    assert exc.value.status_code == 422
    db.add.assert_not_called()
    _assert_filtra_por_tenant(db.execute.call_args[0][0], "categorias_financeiras")


async def test_update_conta_rejeita_conta_bancaria_de_outro_tenant():
    db = AsyncMock()
    conta = MagicMock()
    conta.conta_bancaria_id = None
    db.execute.side_effect = [_result(conta), _result(None)]
    body = cf.ContaFinanceiraUpdate(conta_bancaria_id=FOREIGN_ID)
    with pytest.raises(HTTPException) as exc:
        await cf.update_conta(CONTA_ID, body, _user(), db)
    assert exc.value.status_code == 422
    assert conta.conta_bancaria_id is None  # nada foi gravado
    db.commit.assert_not_called()
    _assert_filtra_por_tenant(db.execute.call_args[0][0], "contas_bancarias")


async def test_dar_baixa_rejeita_conta_bancaria_de_outro_tenant():
    db = AsyncMock()
    conta = MagicMock()
    conta.status = "pendente"
    db.execute.side_effect = [_result(conta), _result(None)]
    body = cf.BaixaRequest(
        data_pagamento=date(2026, 10, 5), valor_pago=10, conta_bancaria_id=FOREIGN_ID
    )
    with pytest.raises(HTTPException) as exc:
        await cf.dar_baixa(CONTA_ID, body, _user(), db)
    assert exc.value.status_code == 422
    assert conta.status == "pendente"
    db.commit.assert_not_called()


async def test_validacao_aceita_referencias_do_proprio_tenant_e_ignora_none():
    db = AsyncMock()
    db.execute.return_value = _result(FOREIGN_ID)
    await cf._validar_referencias_do_tenant(db, TENANT_ID, FOREIGN_ID, FOREIGN_ID)
    assert db.execute.await_count == 2

    db.execute.reset_mock()
    await cf._validar_referencias_do_tenant(db, TENANT_ID, None, None)
    db.execute.assert_not_called()


# ─── Estoque ────────────────────────────────────────────────────────────────────────


@patch.object(est, "EstoqueItemRepository")
async def test_create_item_rejeita_grupo_de_outro_tenant(MockRepo):
    db = AsyncMock()
    db.execute.return_value = _result(None)
    body = est.ItemCreate(nome="Vela", grupo_id=FOREIGN_ID)
    with pytest.raises(HTTPException) as exc:
        await est.create_item(body, _user(), db)
    assert exc.value.status_code == 422
    MockRepo.return_value.create_item.assert_not_called()
    _assert_filtra_por_tenant(db.execute.call_args[0][0], "estoque_grupos")


@patch.object(est, "EstoqueItemRepository")
async def test_update_item_rejeita_grupo_de_outro_tenant(MockRepo):
    db = AsyncMock()
    db.execute.return_value = _result(None)
    MockRepo.return_value.update_item = AsyncMock()
    body = est.ItemUpdate(grupo_id=FOREIGN_ID)
    with pytest.raises(HTTPException) as exc:
        await est.update_item(ITEM_ID, body, _user(), db)
    assert exc.value.status_code == 422
    MockRepo.return_value.update_item.assert_not_called()


@patch.object(est, "EstoqueItemRepository")
async def test_update_item_sem_grupo_nao_consulta(MockRepo):
    db = AsyncMock()
    MockRepo.return_value.update_item = AsyncMock(return_value=None)
    with pytest.raises(HTTPException) as exc:
        await est.update_item(ITEM_ID, est.ItemUpdate(nome="Vela"), _user(), db)
    assert exc.value.status_code == 404  # item inexistente, fluxo normal
    db.execute.assert_not_called()
