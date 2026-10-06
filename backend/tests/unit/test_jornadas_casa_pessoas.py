"""Unit tests — jornadas "Casa e pessoas" (médiuns, associados, mensalidades).

A cobertura ponta a ponta com Postgres está em
tests/integration_pg/test_jornadas_casa_pessoas.py; aqui ficam as regras
puras (serviço de espelho, repositórios, permissão) com banco mockado.
"""
from datetime import date, datetime
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID

import pytest

TENANT_ID = UUID("00000000-0000-0000-0000-000000000001")
USER_ID = UUID("00000000-0000-0000-0000-000000000010")
PESSOA_ID = UUID("00000000-0000-0000-0000-000000000050")


def _db_returning(*results):
    db = AsyncMock()
    db.add = MagicMock()
    db.execute = AsyncMock(side_effect=list(results))
    return db


def _scalar(value):
    r = MagicMock()
    r.scalar_one_or_none.return_value = value
    return r


def _scalars(items):
    r = MagicMock()
    r.scalars.return_value.all.return_value = items
    return r


def _conta(ref, status="pendente"):
    c = MagicMock()
    c.external_ref = ref
    c.status = status
    c.categoria_id = "cat"
    return c


# ── mensalidade_contas_service ────────────────────────────────────────────────

class TestSyncPagamento:
    @pytest.mark.asyncio
    async def test_pago_grava_valor_pago_do_formulario(self):
        from src.services.mensalidade_contas_service import sync_pagamento

        conta = _conta("mensalidade:mediun:x:2026-03")
        db = _db_returning(_scalar(conta), _scalar(MagicMock(id="cat")))
        await sync_pagamento(
            db=db, tenant_id=TENANT_ID, tipo_pessoa="mediun", pessoa_id=PESSOA_ID, pessoa_nome="Pai",
            mes_date=date(2026, 3, 1), status_mensalidade="PAGO", valor=Decimal("100"),
            valor_pago=Decimal("80"), data_pagamento=datetime(2026, 3, 5), dia_vencimento=10, criado_por=USER_ID,
        )
        assert conta.status == "pago"
        assert conta.valor == Decimal("100")
        assert conta.valor_pago == Decimal("80")
        assert conta.data_pagamento == date(2026, 3, 5)

    @pytest.mark.asyncio
    async def test_pago_sem_valor_informado_usa_valor_vigente(self):
        from src.services.mensalidade_contas_service import sync_pagamento

        db = _db_returning(_scalar(None), _scalar(MagicMock(id="cat")))
        await sync_pagamento(
            db=db, tenant_id=TENANT_ID, tipo_pessoa="associado", pessoa_id=PESSOA_ID, pessoa_nome="Ana",
            mes_date=date(2026, 3, 1), status_mensalidade="PAGO", valor=Decimal("50"),
            data_pagamento=None, dia_vencimento=10, criado_por=USER_ID,
        )
        nova = db.add.call_args_list[-1][0][0]
        assert nova.valor_pago == Decimal("50")
        assert nova.external_ref == f"mensalidade:associado:{PESSOA_ID}:2026-03"

    @pytest.mark.asyncio
    async def test_isento_cancela_conta_existente(self):
        from src.services.mensalidade_contas_service import sync_pagamento

        conta = _conta("mensalidade:mediun:x:2026-03", status="pago")
        db = _db_returning(_scalar(conta))
        await sync_pagamento(
            db=db, tenant_id=TENANT_ID, tipo_pessoa="mediun", pessoa_id=PESSOA_ID, pessoa_nome="Pai",
            mes_date=date(2026, 3, 1), status_mensalidade="ISENTO", valor=Decimal("100"),
            data_pagamento=None, dia_vencimento=10, criado_por=USER_ID,
        )
        assert conta.status == "cancelado"
        assert conta.valor_pago is None
        db.add.assert_not_called()

    @pytest.mark.asyncio
    async def test_isento_sem_conta_nao_cria_nada(self):
        from src.services.mensalidade_contas_service import sync_pagamento

        db = _db_returning(_scalar(None))
        await sync_pagamento(
            db=db, tenant_id=TENANT_ID, tipo_pessoa="mediun", pessoa_id=PESSOA_ID, pessoa_nome="Pai",
            mes_date=date(2026, 3, 1), status_mensalidade="ISENTO", valor=Decimal("100"),
            data_pagamento=None, dia_vencimento=10, criado_por=USER_ID,
        )
        db.add.assert_not_called()

    @pytest.mark.asyncio
    async def test_pendente_vencido_usa_data_de_brasilia(self):
        from src.services import mensalidade_contas_service as svc

        conta = _conta("mensalidade:mediun:x:2026-03")
        db = _db_returning(_scalar(conta), _scalar(MagicMock(id="cat")))
        with patch.object(svc, "today_local", return_value=date(2026, 3, 10)):
            await svc.sync_pagamento(
                db=db, tenant_id=TENANT_ID, tipo_pessoa="mediun", pessoa_id=PESSOA_ID, pessoa_nome="Pai",
                mes_date=date(2026, 3, 1), status_mensalidade="PENDENTE", valor=Decimal("100"),
                data_pagamento=None, dia_vencimento=10, criado_por=USER_ID,
            )
        assert conta.status == "pendente"  # vence hoje: ainda não venceu


class TestCancelarContasFuturas:
    @pytest.mark.asyncio
    async def test_cancela_so_meses_depois_da_referencia(self):
        from src.services.mensalidade_contas_service import cancelar_contas_futuras_pendentes

        prefix = f"mensalidade:mediun:{PESSOA_ID}:"
        mes_atual = _conta(prefix + "2026-10")
        seguinte = _conta(prefix + "2026-11", status="vencido")
        db = _db_returning(_scalars([mes_atual, seguinte]))
        n = await cancelar_contas_futuras_pendentes(
            db=db, tenant_id=TENANT_ID, tipo_pessoa="mediun", pessoa_id=PESSOA_ID, referencia=date(2026, 10, 6)
        )
        assert n == 1
        assert mes_atual.status == "pendente"
        assert seguinte.status == "cancelado"

    def test_espelho_detectado_pelo_external_ref(self):
        from src.services.mensalidade_contas_service import is_conta_espelho_mensalidade

        assert is_conta_espelho_mensalidade("mensalidade:mediun:x:2026-01")
        assert not is_conta_espelho_mensalidade(None)
        assert not is_conta_espelho_mensalidade("curso:x")
        assert not is_conta_espelho_mensalidade(MagicMock())


class TestTodayLocal:
    def test_usa_fuso_de_sao_paulo(self):
        from src.core import tz

        fake_now = MagicMock()
        fake_now.date.return_value = date(2026, 10, 5)
        with patch.object(tz, "datetime") as mock_dt:
            mock_dt.now.return_value = fake_now
            assert tz.today_local() == date(2026, 10, 5)
            mock_dt.now.assert_called_once_with(tz=tz.APP_TZ)


# ── repositórios de mensalidade ───────────────────────────────────────────────

@pytest.mark.parametrize(
    "repo_path, id_kw",
    [
        ("src.repositories.mensalidade_repo.MensalidadeRepository", "mediun_id"),
        ("src.repositories.associado_mensalidade_repo.AssociadoMensalidadeRepository", "associado_id"),
    ],
)
class TestRegistrarPagamentoExistente:
    def _repo(self, repo_path, existing):
        import importlib

        mod, cls = repo_path.rsplit(".", 1)
        db = _db_returning(_scalar(existing))
        db.flush = AsyncMock()
        db.refresh = AsyncMock()
        return getattr(importlib.import_module(mod), cls)(db)

    @pytest.mark.asyncio
    async def test_mantem_valor_vigente_e_observacao_quando_nao_enviada(self, repo_path, id_kw):
        from src.models.mensalidades import MensalidadeStatus

        existing = MagicMock(valor_vigente=Decimal("100"), observacao="combinado")
        repo = self._repo(repo_path, existing)
        await repo.registrar_pagamento(
            tenant_id=TENANT_ID, mes_referencia=date(2026, 3, 1), status=MensalidadeStatus.PAGO,
            registrado_por=USER_ID, valor_vigente=Decimal("150"), valor_pago=Decimal("100"),
            **{id_kw: PESSOA_ID},
        )
        assert existing.valor_vigente == Decimal("100")
        assert existing.observacao == "combinado"

    @pytest.mark.asyncio
    async def test_observacao_none_enviada_limpa(self, repo_path, id_kw):
        from src.models.mensalidades import MensalidadeStatus

        existing = MagicMock(valor_vigente=None, observacao="antiga")
        repo = self._repo(repo_path, existing)
        await repo.registrar_pagamento(
            tenant_id=TENANT_ID, mes_referencia=date(2026, 3, 1), status=MensalidadeStatus.PAGO,
            registrado_por=USER_ID, valor_vigente=Decimal("150"), observacao=None, **{id_kw: PESSOA_ID},
        )
        assert existing.observacao is None
        assert existing.valor_vigente == Decimal("150")  # sem valor anterior: captura


# ── endpoint: observação só vai ao repositório se veio no formulário ─────────

class TestObservacaoKwargs:
    @pytest.mark.asyncio
    async def test_form_sem_campo_nao_repassa(self):
        from src.api.v1.admin.mensalidades import _observacao_kwargs

        req = MagicMock()
        req.form = AsyncMock(return_value={"status": "PAGO"})
        assert await _observacao_kwargs(req, None) == {}

    @pytest.mark.asyncio
    async def test_form_com_campo_vazio_limpa(self):
        from src.api.v1.admin.mensalidades import _observacao_kwargs

        req = MagicMock()
        req.form = AsyncMock(return_value={"status": "PAGO", "observacao": "  "})
        assert await _observacao_kwargs(req, None) == {"observacao": None}

    @pytest.mark.asyncio
    async def test_chamada_direta_sem_request(self):
        from src.api.v1.admin.mensalidades import _observacao_kwargs

        assert await _observacao_kwargs(None, None) == {}
        assert await _observacao_kwargs(None, "x") == {"observacao": "x"}


# ── permissão: médiuns consultáveis fora do plano (P-09) ──────────────────────

class TestMediunsViewSemGateDePlano:
    def _service(self, plan_enabled: bool, perms: dict):
        from src.services.permission_service import PermissionService

        svc = PermissionService(AsyncMock())
        svc.is_feature_enabled_for_plan = AsyncMock(return_value=plan_enabled)
        svc.permission_group_repo = MagicMock()
        svc.permission_group_repo.get_user_groups = AsyncMock(return_value=["g"])
        svc.permission_group_repo.get_user_permissions = AsyncMock(return_value=perms)
        return svc

    def _operator(self):
        user = MagicMock()
        user.is_admin = False
        user.tenant_id = TENANT_ID
        return user

    @pytest.mark.asyncio
    async def test_view_de_mediuns_ignora_plano(self):
        from src.models import PermissionFeature

        perms = {"view": True, "insert": True, "edit": True, "delete": True}
        svc = self._service(plan_enabled=False, perms=perms)
        assert await svc.check_permission(self._operator(), PermissionFeature.MEDIUNS, "view") is True
        assert await svc.check_permission(self._operator(), PermissionFeature.MEDIUNS, "insert") is False

    @pytest.mark.asyncio
    async def test_outras_features_seguem_com_gate_no_view(self):
        from src.models import PermissionFeature

        svc = self._service(plan_enabled=False, perms={"view": True})
        assert await svc.check_permission(self._operator(), PermissionFeature.ESTOQUE, "view") is False


# ── médiuns: null limpa; isento e limite na reativação ───────────────────────

class TestUpdateMedium:
    def _medium(self, **kw):
        m = MagicMock()
        m.id = PESSOA_ID
        m.nome = "Pai"
        m.is_atendimento = True
        m.is_active = True
        m.mensalidade_isento = False
        m.data_entrada = None
        m.data_saida = None
        m.data_nascimento = date(1980, 1, 1)
        m.telefone = "11999990000"
        m.email = "pai@example.com"
        for f in ("observacoes", "cep", "logradouro", "numero", "bairro", "cidade"):
            setattr(m, f, "valor")
        for k, v in kw.items():
            setattr(m, k, v)
        return m

    def _user(self):
        u = MagicMock()
        u.is_operator_or_admin = True
        u.tenant_id = TENANT_ID
        u.id = USER_ID
        return u

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.mediuns.AuditService")
    @patch("src.api.v1.admin.mediuns.MediumRepository")
    async def test_null_limpa_campos_e_ausente_nao_muda(self, MockRepo, MockAudit):
        from src.api.v1.admin.mediuns import MediumUpdate, update_medium

        m = self._medium()
        MockRepo.return_value.get = AsyncMock(return_value=m)
        MockAudit.return_value = AsyncMock()
        data = MediumUpdate(telefone=None, email=None, data_nascimento=None)
        await update_medium(PESSOA_ID, data, self._user(), AsyncMock())
        assert m.telefone is None and m.email is None and m.data_nascimento is None
        assert m.cidade == "valor"  # não enviado: intacto

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.mediuns._cancelar_contas_futuras", new_callable=AsyncMock)
    @patch("src.api.v1.admin.mediuns.AuditService")
    @patch("src.api.v1.admin.mediuns.MediumRepository")
    async def test_inativar_cancela_contas_futuras_pela_data_de_saida(self, MockRepo, MockAudit, mock_cancel):
        from src.api.v1.admin.mediuns import MediumUpdate, update_medium

        m = self._medium()
        MockRepo.return_value.get = AsyncMock(return_value=m)
        MockAudit.return_value = AsyncMock()
        data = MediumUpdate(is_active=False, data_saida=date(2026, 10, 6))
        await update_medium(PESSOA_ID, data, self._user(), AsyncMock())
        mock_cancel.assert_awaited_once()
        assert mock_cancel.await_args.args[3] == date(2026, 10, 6)

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.mediuns._checar_limite_mediuns", new_callable=AsyncMock)
    @patch("src.api.v1.admin.mediuns.AuditService")
    @patch("src.api.v1.admin.mediuns.MediumRepository")
    async def test_reativar_checa_limite(self, MockRepo, MockAudit, mock_limite):
        from fastapi import HTTPException
        from src.api.v1.admin.mediuns import MediumUpdate, update_medium

        m = self._medium(is_active=False)
        MockRepo.return_value.get = AsyncMock(return_value=m)
        mock_limite.side_effect = HTTPException(status_code=422, detail="Limite")
        with pytest.raises(HTTPException) as exc:
            await update_medium(PESSOA_ID, MediumUpdate(is_active=True), self._user(), AsyncMock())
        assert exc.value.status_code == 422
        assert m.is_active is False

    def test_escrita_de_medium_tem_gate_de_plano_e_leitura_nao(self):
        from src.api.v1.admin.mediuns import router
        from tests.plan_gate_helpers import plan_gate_features

        assert plan_gate_features(router, "", "POST") == ["mediuns"]
        assert plan_gate_features(router, "/{medium_id}", "PATCH") == ["mediuns"]
        assert plan_gate_features(router, "/{medium_id}", "DELETE") == ["mediuns"]
        assert plan_gate_features(router, "", "GET") == []


# ── associados ────────────────────────────────────────────────────────────────

class TestAssociados:
    def test_modulo_inteiro_tem_gate_de_plano(self):
        from src.api.v1.admin.associados import router
        from tests.plan_gate_helpers import plan_gate_features

        assert plan_gate_features(router) == ["associados"]

    def test_telefone_normalizado_para_digitos(self):
        from src.repositories.associado_repo import AssociadoRepository

        assert AssociadoRepository.normalize_telefone("(21) 3333-4444") == "2133334444"
        assert AssociadoRepository.normalize_telefone("") is None
        assert AssociadoRepository.normalize_telefone(None) is None

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.associados.AuditService")
    @patch("src.api.v1.admin.associados.AssociadoRepository")
    async def test_telefone_null_enviado_limpa(self, MockRepo, MockAudit):
        from src.api.v1.admin.associados import AssociadoUpdate, update_associado

        assoc = MagicMock(id=PESSOA_ID, nome="A", email="a@example.com", telefone="11", mensalidade_isento=False)
        assoc.created_at = datetime(2026, 1, 1)
        repo = MockRepo.return_value
        repo.get_by_id = AsyncMock(return_value=assoc)
        repo.update_associado = AsyncMock(return_value=assoc)
        MockAudit.return_value = AsyncMock()
        user = MagicMock(is_operator_or_admin=True, tenant_id=TENANT_ID, id=USER_ID)

        await update_associado(AssociadoUpdate(telefone=None), PESSOA_ID, user, AsyncMock())
        assert repo.update_associado.await_args.kwargs["telefone"] is None

        await update_associado(AssociadoUpdate(nome="B"), PESSOA_ID, user, AsyncMock())
        assert repo.update_associado.await_args.kwargs["telefone"] is Ellipsis

    def test_email_unico_so_entre_ativos_no_modelo(self):
        from src.models.associados import Associado

        idx = next(i for i in Associado.__table__.indexes if i.name == "uq_associados_tenant_email_ativo")
        assert idx.unique
        assert "deleted_at IS NULL" in str(idx.dialect_options["postgresql"]["where"])
