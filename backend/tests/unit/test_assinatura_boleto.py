"""$-04 — assinatura do plano paga por fatura (boleto): chamadas à Stripe (mockadas) e
regras puras. O efeito no banco/webhooks está em tests/integration_pg/test_stripe_webhook.py
e tests/integration_pg/test_admin_billing_stripe.py."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import stripe
from fastapi import HTTPException

from src.models.subscriptions import PlanType


class TestInvoicePaymentMethodTypes:
    def test_padrao_e_boleto(self, monkeypatch):
        from src.services import stripe_service

        monkeypatch.setattr(stripe_service.settings, "STRIPE_INVOICE_PAYMENT_METHODS", "boleto")
        assert stripe_service.invoice_payment_method_types() == ["boleto"]

    def test_lista_com_espacos_e_maiusculas(self, monkeypatch):
        from src.services import stripe_service

        monkeypatch.setattr(stripe_service.settings, "STRIPE_INVOICE_PAYMENT_METHODS", " Boleto , pix ,")
        assert stripe_service.invoice_payment_method_types() == ["boleto", "pix"]

    def test_vazio_cai_no_boleto(self, monkeypatch):
        from src.services import stripe_service

        monkeypatch.setattr(stripe_service.settings, "STRIPE_INVOICE_PAYMENT_METHODS", "")
        assert stripe_service.invoice_payment_method_types() == ["boleto"]


class TestStripeServiceCalls:
    async def test_checkout_do_cartao_fica_so_no_cartao(self, monkeypatch):
        """Ativar o Boleto na conta não pode fazê-lo aparecer no Checkout do cartão."""
        from src.services import stripe_service

        monkeypatch.setattr(stripe_service, "_price_id_for_plan", lambda plan: "price_pro")
        session = MagicMock(url="https://checkout.stripe.com/x")
        with patch.object(stripe.checkout.Session, "create", return_value=session) as create:
            url = await stripe_service.create_checkout_session("cus_1", "pro", "tenant-1", trial_period_days=10)

        assert url == "https://checkout.stripe.com/x"
        kwargs = create.call_args.kwargs
        assert kwargs["payment_method_types"] == ["card"]
        assert kwargs["mode"] == "subscription"
        assert kwargs["subscription_data"]["trial_period_days"] == 10

    async def test_assinatura_por_fatura_send_invoice(self, monkeypatch):
        from src.services import stripe_service

        monkeypatch.setattr(stripe_service, "_price_id_for_plan", lambda plan: "price_pro")
        monkeypatch.setattr(stripe_service.settings, "STRIPE_INVOICE_PAYMENT_METHODS", "boleto")
        monkeypatch.setattr(stripe_service.settings, "STRIPE_INVOICE_DAYS_UNTIL_DUE", 5)
        created = stripe.Subscription.construct_from({"id": "sub_1", "status": "active"}, "sk_test")
        with patch.object(stripe.Subscription, "create", return_value=created) as create:
            result = await stripe_service.create_invoice_subscription("cus_1", "pro", "tenant-1")

        assert result["id"] == "sub_1"
        kwargs = create.call_args.kwargs
        assert kwargs["collection_method"] == "send_invoice"
        assert kwargs["days_until_due"] == 5
        assert kwargs["payment_settings"] == {"payment_method_types": ["boleto"]}
        assert kwargs["metadata"]["tenant_id"] == "tenant-1"
        assert kwargs["expand"] == ["latest_invoice"]
        assert "trial_period_days" not in kwargs

    async def test_assinatura_por_fatura_preserva_dias_de_teste(self, monkeypatch):
        from src.services import stripe_service

        monkeypatch.setattr(stripe_service, "_price_id_for_plan", lambda plan: "price_pro")
        created = stripe.Subscription.construct_from({"id": "sub_1", "status": "trialing"}, "sk_test")
        with patch.object(stripe.Subscription, "create", return_value=created) as create:
            await stripe_service.create_invoice_subscription("cus_1", "pro", "tenant-1", trial_period_days=12)
        assert create.call_args.kwargs["trial_period_days"] == 12

    async def test_plano_sem_price_id_e_valueerror(self, monkeypatch):
        from src.services import stripe_service

        monkeypatch.setattr(stripe_service, "_price_id_for_plan", lambda plan: "")
        with pytest.raises(ValueError):
            await stripe_service.create_invoice_subscription("cus_1", "pro", "tenant-1")

    async def test_desistir_cancela_e_anula_fatura_mesmo_se_anular_falhar(self):
        from src.services import stripe_service

        with patch.object(stripe.Subscription, "cancel") as cancel, patch.object(
            stripe.Invoice, "void_invoice", side_effect=stripe.error.InvalidRequestError("already paid", param=None)
        ) as void:
            await stripe_service.cancel_pending_invoice_subscription("sub_1", "in_1")
        cancel.assert_called_once_with("sub_1")
        void.assert_called_once_with("in_1")


class TestWebhookHelpers:
    def test_assinatura_da_fatura_api_nova_e_antiga(self):
        from src.api.v1.webhooks import _invoice_subscription_id

        nova = {"parent": {"type": "subscription_details", "subscription_details": {"subscription": "sub_new"}}}
        antiga = {"subscription": "sub_old"}
        expandida = {"parent": {"subscription_details": {"subscription": {"id": "sub_exp"}}}}
        assert _invoice_subscription_id(nova) == "sub_new"
        assert _invoice_subscription_id(antiga) == "sub_old"
        assert _invoice_subscription_id(expandida) == "sub_exp"
        assert _invoice_subscription_id({"parent": None}) is None

    async def test_payment_failed_de_boleto_nao_toca_no_banco(self):
        from src.api.v1.webhooks import _handle_payment_failed

        db = AsyncMock()
        await _handle_payment_failed({"id": "in_1", "customer": "cus_1", "collection_method": "send_invoice"}, db)
        db.execute.assert_not_called()
        db.commit.assert_not_called()

    async def test_invoice_paid_do_cartao_e_ignorado(self):
        from src.api.v1.webhooks import _handle_invoice_paid

        db = AsyncMock()
        await _handle_invoice_paid({"id": "in_1", "customer": "cus_1", "collection_method": "charge_automatically"}, db)
        db.execute.assert_not_called()


class TestEndpointRules:
    def test_detecta_forma_de_pagamento_nao_ativada(self):
        from src.api.v1.admin.billing_stripe import _is_payment_method_not_enabled

        by_param = stripe.error.InvalidRequestError("invalid", param="payment_settings[payment_method_types][0]")
        by_msg = stripe.error.InvalidRequestError("The payment method type provided: boleto is invalid.", param=None)
        other = stripe.error.InvalidRequestError("No such price", param="items[0][price]")
        assert _is_payment_method_not_enabled(by_param)
        assert _is_payment_method_not_enabled(by_msg)
        assert not _is_payment_method_not_enabled(other)
        assert not _is_payment_method_not_enabled(ValueError("x"))

    @patch("src.api.v1.admin.billing_stripe.SubscriptionRepository")
    async def test_checkout_do_cartao_recusado_com_boleto_pendente(self, MockRepo):
        from src.api.v1.admin.billing_stripe import CreateCheckoutRequest, create_checkout_session
        from tests.unit.test_admin_billing_stripe import _admin_user, _make_sub

        repo = AsyncMock()
        repo.get_by_tenant.return_value = _make_sub(
            plan=PlanType.FREE, stripe_subscription_id=None, pending_stripe_subscription_id="sub_bol"
        )
        MockRepo.return_value = repo

        with pytest.raises(HTTPException) as exc:
            await create_checkout_session(CreateCheckoutRequest(plan="pro"), _admin_user(), AsyncMock())
        assert exc.value.status_code == 409
