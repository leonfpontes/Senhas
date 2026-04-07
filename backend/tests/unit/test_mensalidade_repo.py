"""Unit tests for MensalidadeRepository."""
import pytest
from datetime import date, datetime, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

# Re-use fixed UUIDs from conftest
TENANT_ID = __import__('uuid').UUID("00000000-0000-0000-0000-000000000001")
TENANT_B_ID = __import__('uuid').UUID("00000000-0000-0000-0000-000000000002")
USER_ID = __import__('uuid').UUID("00000000-0000-0000-0000-000000000010")
MEDIUN_ID = __import__('uuid').UUID("00000000-0000-0000-0000-000000000050")

MES = date(2026, 4, 1)


def _mock_db():
    db = AsyncMock()
    db.execute = AsyncMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()
    db.add = MagicMock()
    return db


def _mock_result_scalar(value):
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    result.scalar_one.return_value = value
    result.scalar.return_value = value
    return result


def _mock_result_scalars(items):
    result = MagicMock()
    scalars = MagicMock()
    scalars.all.return_value = items
    result.scalars.return_value = scalars
    return result


def _mock_result_mappings(rows: list):
    """Mock for result.mappings().all()."""
    result = MagicMock()
    mappings = MagicMock()
    mappings.all.return_value = rows
    result.mappings.return_value = mappings
    return result


# ═══════════════════════════════════════════════════════════
# MensalidadeConfig
# ═══════════════════════════════════════════════════════════

class TestMensalidadeConfig:

    @pytest.fixture
    def repo(self):
        from src.repositories.mensalidade_repo import MensalidadeRepository
        db = _mock_db()
        return MensalidadeRepository(db), db

    @pytest.mark.asyncio
    async def test_get_config_found(self, repo):
        r, db = repo
        config = MagicMock()
        db.execute.return_value = _mock_result_scalar(config)
        result = await r.get_config(TENANT_ID)
        assert result is config

    @pytest.mark.asyncio
    async def test_get_config_none(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalar(None)
        result = await r.get_config(TENANT_ID)
        assert result is None

    @pytest.mark.asyncio
    async def test_upsert_config_creates_when_missing(self, repo):
        r, db = repo
        # get_config returns None → will create
        db.execute.return_value = _mock_result_scalar(None)
        result = await r.upsert_config(TENANT_ID, Decimal('50.00'), 10)
        db.add.assert_called_once()
        db.flush.assert_awaited()
        db.refresh.assert_awaited()

    @pytest.mark.asyncio
    async def test_upsert_config_updates_existing(self, repo):
        r, db = repo
        existing = MagicMock()
        db.execute.return_value = _mock_result_scalar(existing)
        result = await r.upsert_config(TENANT_ID, Decimal('75.00'), 15)
        # Should NOT call db.add — updates in place
        db.add.assert_not_called()
        assert existing.valor_mensal == Decimal('75.00')
        assert existing.dia_vencimento == 15


# ═══════════════════════════════════════════════════════════
# list_mes
# ═══════════════════════════════════════════════════════════

class TestListMes:

    @pytest.fixture
    def repo(self):
        from src.repositories.mensalidade_repo import MensalidadeRepository
        db = _mock_db()
        return MensalidadeRepository(db), db

    @pytest.mark.asyncio
    async def test_list_mes_returns_rows(self, repo):
        r, db = repo
        rows = [
            {"mediun_id": MEDIUN_ID, "mediun_nome": "João", "mensalidade_isento": False,
             "pagamento_id": None, "status": None, "data_pagamento": None,
             "valor_vigente": None, "valor_pago": None, "comprovante_filename": None,
             "observacao": None},
        ]
        db.execute.return_value = _mock_result_mappings(rows)
        result = await r.list_mes(TENANT_ID, MES)
        assert len(result) == 1
        assert result[0]["mediun_nome"] == "João"

    @pytest.mark.asyncio
    async def test_list_mes_empty_for_other_tenant(self, repo):
        """A tenant with no médiuns should return an empty list."""
        r, db = repo
        db.execute.return_value = _mock_result_mappings([])
        result = await r.list_mes(TENANT_B_ID, MES)
        assert result == []


# ═══════════════════════════════════════════════════════════
# registrar_pagamento
# ═══════════════════════════════════════════════════════════

class TestRegistrarPagamento:

    @pytest.fixture
    def repo(self):
        from src.repositories.mensalidade_repo import MensalidadeRepository
        db = _mock_db()
        return MensalidadeRepository(db), db

    @pytest.mark.asyncio
    async def test_registrar_cria_novo_quando_nao_existe(self, repo):
        from src.models.mensalidades import MensalidadeStatus
        r, db = repo
        # get_pagamento returns None → will create
        db.execute.return_value = _mock_result_scalar(None)
        result = await r.registrar_pagamento(
            tenant_id=TENANT_ID,
            mediun_id=MEDIUN_ID,
            mes_referencia=MES,
            status=MensalidadeStatus.PAGO,
            registrado_por=USER_ID,
            valor_vigente=Decimal('50.00'),
            valor_pago=Decimal('50.00'),
        )
        db.add.assert_called_once()
        db.flush.assert_awaited()

    @pytest.mark.asyncio
    async def test_registrar_atualiza_existente(self, repo):
        from src.models.mensalidades import MensalidadeStatus
        r, db = repo
        existing = MagicMock()
        db.execute.return_value = _mock_result_scalar(existing)
        await r.registrar_pagamento(
            tenant_id=TENANT_ID,
            mediun_id=MEDIUN_ID,
            mes_referencia=MES,
            status=MensalidadeStatus.PAGO,
            registrado_por=USER_ID,
        )
        # Should NOT create new — updates existing
        db.add.assert_not_called()
        assert existing.status == MensalidadeStatus.PAGO

    @pytest.mark.asyncio
    async def test_registrar_grava_valor_vigente(self, repo):
        """valor_vigente must be stored on the record, not re-fetched later."""
        from src.models.mensalidades import MensalidadeStatus
        r, db = repo
        db.execute.return_value = _mock_result_scalar(None)
        await r.registrar_pagamento(
            tenant_id=TENANT_ID,
            mediun_id=MEDIUN_ID,
            mes_referencia=MES,
            status=MensalidadeStatus.PAGO,
            registrado_por=USER_ID,
            valor_vigente=Decimal('99.99'),
        )
        # Confirm add was called (new record) — valor_vigente captured
        call_args = db.add.call_args[0][0]
        assert call_args.valor_vigente == Decimal('99.99')


# ═══════════════════════════════════════════════════════════
# delete_comprovante
# ═══════════════════════════════════════════════════════════

class TestComprovante:

    @pytest.fixture
    def repo(self):
        from src.repositories.mensalidade_repo import MensalidadeRepository
        db = _mock_db()
        return MensalidadeRepository(db), db

    @pytest.mark.asyncio
    async def test_delete_comprovante_limpa_binario(self, repo):
        r, db = repo
        pag = MagicMock()
        pag.comprovante_data = b"some_bytes"
        pag.comprovante_filename = "comprovante.pdf"
        pag.comprovante_mime = "application/pdf"
        pag.status = "PAGO"
        pag.valor_pago = Decimal('50.00')
        db.execute.return_value = _mock_result_scalar(pag)
        result = await r.delete_comprovante(TENANT_ID, uuid4())
        assert pag.comprovante_data is None
        assert pag.comprovante_filename is None
        assert pag.comprovante_mime is None

    @pytest.mark.asyncio
    async def test_delete_comprovante_mantem_status_e_valor(self, repo):
        r, db = repo
        pag = MagicMock()
        pag.status = "PAGO"
        pag.valor_pago = Decimal('50.00')
        db.execute.return_value = _mock_result_scalar(pag)
        await r.delete_comprovante(TENANT_ID, uuid4())
        # Status and valor_pago must not be touched
        assert pag.status == "PAGO"
        assert pag.valor_pago == Decimal('50.00')

    @pytest.mark.asyncio
    async def test_delete_comprovante_retorna_none_quando_nao_encontrado(self, repo):
        r, db = repo
        db.execute.return_value = _mock_result_scalar(None)
        result = await r.delete_comprovante(TENANT_ID, uuid4())
        assert result is None
