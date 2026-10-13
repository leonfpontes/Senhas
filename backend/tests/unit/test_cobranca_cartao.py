"""Regras puras da tolerância do cartão (migração 094, services/cobranca_cartao.py)."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from src.models.subscriptions import SubscriptionStatus
from src.services import cobranca_cartao as cc
from src.services import scheduler_guard as sg
from src.services.email.templates.cartao_pagamento_pendente import render_cartao_pagamento_pendente_email

AGORA = datetime(2026, 10, 13, 12, 0, tzinfo=timezone.utc)


def _sub(status=SubscriptionStatus.ACTIVE, desde=None, invoice=None):
    return SimpleNamespace(status=status, pagamento_pendente_desde=desde, pagamento_pendente_invoice_id=invoice)


def test_cobra_no_cartao():
    assert cc.cobra_no_cartao("charge_automatically")
    assert cc.cobra_no_cartao(None)  # assinatura antiga = cartão
    assert not cc.cobra_no_cartao("send_invoice")
    assert not cc.cobra_no_cartao("pix_mensal")


def test_em_tolerancia_so_com_plano_ativo():
    assert cc.em_tolerancia(_sub(desde=AGORA))
    assert not cc.em_tolerancia(_sub())
    assert not cc.em_tolerancia(_sub(status=SubscriptionStatus.SUSPENDED, desde=AGORA))
    assert not cc.em_tolerancia(None)


def test_tolerancia_vence_em_10_dias():
    assert not cc.tolerancia_vencida(_sub(desde=AGORA - timedelta(days=9, hours=23)), AGORA)
    assert cc.tolerancia_vencida(_sub(desde=AGORA - timedelta(days=10)), AGORA)
    assert not cc.tolerancia_vencida(_sub(status=SubscriptionStatus.SUSPENDED, desde=AGORA - timedelta(days=30)), AGORA)


def test_marcar_guarda_a_primeira_recusa_e_limpar_zera():
    sub = _sub()
    cc.marcar_pendente(sub, "in_1", AGORA)
    cc.marcar_pendente(sub, "in_2", AGORA + timedelta(days=3))
    assert sub.pagamento_pendente_desde == AGORA
    assert sub.pagamento_pendente_invoice_id == "in_2"
    assert cc.escopo_aviso(sub) == "in_2"
    assert cc.limpar_pendente(sub) is True
    assert sub.pagamento_pendente_desde is None and sub.pagamento_pendente_invoice_id is None
    assert cc.limpar_pendente(sub) is False


def test_escopo_sem_fatura_usa_a_data():
    assert cc.escopo_aviso(_sub(desde=AGORA)) == AGORA.isoformat()


def test_chave_de_lock_propria():
    chaves = {sg.TRIAL_LOCK_KEY, sg.BIRTHDAY_LOCK_KEY, sg.PRESENCA_LOCK_KEY, sg.MEDIUM_LEMBRETE_LOCK_KEY,
              sg.PIX_MENSAL_LOCK_KEY, sg.COBRANCA_CARTAO_LOCK_KEY, 0x6769726168756201}
    assert sg.COBRANCA_CARTAO_LOCK_KEY == 0x6769726168756208
    assert len(chaves) == 7 and 0x6769726168756205 not in chaves  # 205 segue reservada


def test_template_escapa_e_diferencia_os_dois_avisos():
    falha = render_cartao_pagamento_pendente_email("<b>Ana</b>", "Pro", "https://x/admin/billing", desde="10/10/2026")
    assert "&lt;b&gt;Ana&lt;/b&gt;" in falha
    assert "continua funcionando" in falha and "10/10/2026" in falha and "Atualizar cartão" in falha
    suspenso = render_cartao_pagamento_pendente_email("Ana", "Pro", "https://x/admin/billing", suspenso=True)
    assert "suspenso por falta de pagamento" in suspenso
