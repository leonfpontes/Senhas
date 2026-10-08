"""AM-15 — Lembretes e avisos por e-mail da Área do Médium com Postgres real.

O agendador é chamado direto (`processar_terreiro`/`processar_todos`) com um `agora` escolhido em
Brasília e um `enviar` que só guarda as mensagens — nenhum e-mail sai de verdade. Cobre:

- cada tipo escolhe as pessoas certas (mensalidade D-3/D+3, PIX, véspera, D-2, escala nova, falta,
  aviso, cancelamento, resumo do admin) e respeita janela, preferência do médium, chave da casa,
  plano (`escalas` × `atividades_corrente`) e chave do piloto;
- uma vez só: duas rodadas ao mesmo tempo (duas sessões) não duplicam; o resumo sai um por terreiro
  por dia;
- link de descadastro funciona (consultar/desligar um tipo/todos; token inválido → 404);
- preferências na Área: GET/PUT, recusa sob impersonação, campo desconhecido → 422;
- isolamento entre terreiros; o texto do motivo de ausência nunca vai em e-mail; assunto discreto.
"""
from __future__ import annotations

import asyncio
import re
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import delete, func, select, update

from src.core.tz import APP_TZ
from src.models import (
    Atividade,
    AtividadeParticipacao,
    AtividadeTipo,
    Comunicado,
    CorrenteGrupo,
    CorrenteGrupoMembro,
    FuncaoCorrente,
    Gira,
    Medium,
    MediumLembreteEnviado,
    MediumPreferencia,
    MensalidadeConfig,
    MensalidadePagamento,
    TenantConfig,
)
from src.models.mensalidades import MensalidadeStatus
from src.models.subscriptions import PlanType
from src.models.users import UserRole
from src.security.jwt import create_access_token
from src.services.atividades import atividade_da_gira, ensure_default_atividade_tipos
from src.services.medium_lembrete_scheduler import MediumLembreteScheduler, processar_terreiro, processar_todos

from .factories import create_tenant, create_user

MEDIUM = "/api/v1/medium"
PUBLIC = "/api/v1/public/avisos-email"
CONFIG = "/api/v1/admin/config/area-medium"
AVISOS = "/api/v1/admin/comunicados"
TERMOS_RELIGIOSOS = ("gira", "faxina", "cambone", "orixá", "caboclo", "terreiro de", "amaci", "corrente")


def _brt(dia: date, hora: int, minuto: int = 0) -> datetime:
    return datetime(dia.year, dia.month, dia.day, hora, minuto, tzinfo=APP_TZ).astimezone(timezone.utc)


def _hoje() -> date:
    return datetime.now(APP_TZ).date()


class Caixa:
    """O `enviar` dos testes: guarda as mensagens (nunca manda e-mail)."""

    def __init__(self) -> None:
        self.mensagens: list = []

    async def __call__(self, mensagem) -> None:
        self.mensagens.append(mensagem)

    def para(self, email: str) -> list:
        return [m for m in self.mensagens if m.to_email == email]

    def assuntos(self, email: str) -> list[str]:
        return [m.subject for m in self.para(email)]


async def _terreiro(db, nome="Casa Luz", plan=PlanType.PRO, liberada=True):
    tenant = await create_tenant(db, name=nome, plan=plan, area_medium_liberada=liberada)
    admin = await create_user(db, tenant, UserRole.ADMIN, name="dirigente")
    await ensure_default_atividade_tipos(db, tenant.id)
    await db.commit()
    return tenant, admin


async def _medium(db, tenant, nome, *, com_area=True, isento=False, atendimento=True):
    actor = None
    user_id = None
    if com_area:
        actor = await create_user(db, tenant, UserRole.MEDIUM, name=nome.split()[0].lower())
        user_id = actor.user.id
    medium = Medium(
        tenant_id=tenant.id, nome=nome, is_atendimento=atendimento, user_id=user_id, mensalidade_isento=isento
    )
    db.add(medium)
    await db.commit()
    return actor, medium


async def _tipo(db, tenant, nome) -> AtividadeTipo:
    return (
        await db.execute(select(AtividadeTipo).where(AtividadeTipo.tenant_id == tenant.id, AtividadeTipo.nome == nome))
    ).scalar_one()


async def _funcao(db, tenant, nome) -> FuncaoCorrente:
    """Funções sugeridas já nascem com o terreiro (ensure_default_atividade_tipos)."""
    return (
        await db.execute(select(FuncaoCorrente).where(FuncaoCorrente.tenant_id == tenant.id, FuncaoCorrente.nome == nome))
    ).scalar_one()


async def _atividade(db, tenant, tipo_nome, titulo, inicio, **kw) -> Atividade:
    tipo = await _tipo(db, tenant, tipo_nome)
    atividade = Atividade(tenant_id=tenant.id, tipo_id=tipo.id, titulo=titulo, inicio=inicio, **kw)
    db.add(atividade)
    await db.commit()
    return atividade


async def _participa(db, tenant, atividade_id, medium, **kw) -> AtividadeParticipacao:
    kw.setdefault("convocado", True)
    kw.setdefault("origem", "manual")
    p = AtividadeParticipacao(tenant_id=tenant.id, atividade_id=atividade_id, medium_id=medium.id, **kw)
    db.add(p)
    await db.commit()
    return p


async def _envelhecer(db, participacao, horas):
    await db.execute(
        update(AtividadeParticipacao)
        .where(AtividadeParticipacao.id == participacao.id)
        .values(created_at=datetime.now(timezone.utc) - timedelta(hours=horas))
    )
    await db.commit()


async def _mensalidade(db, tenant, dia_vencimento=10, valor="50.00", **kw):
    config = MensalidadeConfig(
        tenant_id=tenant.id, valor_mensal=Decimal(valor), dia_vencimento=dia_vencimento, ativo=True, **kw
    )
    db.add(config)
    await db.commit()
    return config


def _email(actor) -> str:
    return actor.user.email


def _sem_termo_religioso(texto: str) -> bool:
    baixo = texto.lower()
    return not any(t in baixo for t in TERMOS_RELIGIOSOS)


async def _marcas(tenant_id, tipo=None) -> int:
    from src.core.database import AsyncSessionLocal

    async with AsyncSessionLocal() as fresh:
        stmt = select(func.count()).select_from(MediumLembreteEnviado).where(MediumLembreteEnviado.tenant_id == tenant_id)
        if tipo:
            stmt = stmt.where(MediumLembreteEnviado.tipo == tipo)
        return (await fresh.execute(stmt)).scalar_one()


# ── Mensalidade (D-29) ──────────────────────────────────────────────────────


async def test_mensalidade_3_dias_antes_e_depois_so_para_quem_esta_em_aberto(db):
    tenant, _ = await _terreiro(db, plan=PlanType.BASIC)
    await _mensalidade(db, tenant, dia_vencimento=10)
    ana, _ = await _medium(db, tenant, "Ana Paula")
    bia, bia_m = await _medium(db, tenant, "Bia Souza")
    caio, _ = await _medium(db, tenant, "Caio Lima", isento=True)
    duda, duda_m = await _medium(db, tenant, "Duda Reis")
    eva, eva_m = await _medium(db, tenant, "Eva Melo")
    await _medium(db, tenant, "Sem Acesso", com_area=False)
    mes = date(2026, 11, 1)
    db.add_all(
        [
            # Bia mandou comprovante (em conferência) → não recebe.
            MensalidadePagamento(
                tenant_id=tenant.id,
                mediun_id=bia_m.id,
                mes_referencia=mes,
                status=MensalidadeStatus.PENDENTE,
                comprovante_enviado_em=datetime.now(timezone.utc),
                comprovante_filename="c.pdf",
            ),
            # Duda pagou → não recebe.
            MensalidadePagamento(tenant_id=tenant.id, mediun_id=duda_m.id, mes_referencia=mes, status=MensalidadeStatus.PAGO),
            MediumPreferencia(tenant_id=tenant.id, medium_id=eva_m.id, token_descadastro="tok-eva", email_mensalidade=False),
        ]
    )
    await db.commit()

    # Fora da janela (7 h): nada.
    caixa = Caixa()
    assert await processar_terreiro(tenant.id, _brt(date(2026, 11, 7), 7), caixa) == 0
    # D-3 (07/11, vence 10/11), 13 h (o resumo do admin, das 8 às 12 h, não entra aqui).
    assert await processar_terreiro(tenant.id, _brt(date(2026, 11, 7), 13), caixa) == 1
    assert [m.to_email for m in caixa.mensagens] == [_email(ana)]
    msg = caixa.mensagens[0]
    assert msg.subject == "Casa Luz: sua mensalidade vence em 3 dias"
    assert "R$ 50,00" in msg.html_body and "10/11" in msg.html_body and "novembro de 2026" in msg.html_body
    assert "/medium/mensalidade?pagar=1" in msg.html_body and "/descadastro/" in msg.html_body
    # Rodada seguinte no mesmo dia: já foi.
    assert await processar_terreiro(tenant.id, _brt(date(2026, 11, 7), 15), caixa) == 0
    # D+3 (13/11): atrasada, sem comprovante → "lembrete da mensalidade", tom gentil.
    caixa2 = Caixa()
    assert await processar_terreiro(tenant.id, _brt(date(2026, 11, 13), 13, 15), caixa2) == 1
    assert caixa2.mensagens[0].to_email == _email(ana)
    assert caixa2.mensagens[0].subject == "Casa Luz: lembrete da mensalidade"
    assert "fale com a casa" in caixa2.mensagens[0].html_body
    # Outro dia qualquer: nada.
    assert await processar_terreiro(tenant.id, _brt(date(2026, 11, 11), 13), Caixa()) == 0
    for m in caixa.mensagens + caixa2.mensagens:
        assert _sem_termo_religioso(m.subject)
    assert _email(bia) not in [m.to_email for m in caixa.mensagens]
    assert {_email(caio), _email(duda), _email(eva)}.isdisjoint(m.to_email for m in caixa.mensagens + caixa2.mensagens)


async def test_casa_desliga_lembrete_da_mensalidade_pela_configuracao(client, db):
    tenant, admin = await _terreiro(db, plan=PlanType.BASIC)
    await _mensalidade(db, tenant, dia_vencimento=10)
    await _medium(db, tenant, "Ana Paula")
    resp = await client.get(CONFIG, headers=admin.headers)
    assert resp.status_code == 200 and resp.json()["lembretes"] == {"mensalidade": True}
    resp = await client.put(CONFIG, headers=admin.headers, json={"lembretes": {"mensalidade": False}})
    assert resp.status_code == 200 and resp.json()["lembretes"]["mensalidade"] is False
    assert await processar_terreiro(tenant.id, _brt(date(2026, 11, 7), 10), Caixa()) == 0
    await client.put(CONFIG, headers=admin.headers, json={"lembretes": {"mensalidade": True}})
    assert await processar_terreiro(tenant.id, _brt(date(2026, 11, 7), 10), Caixa()) == 1


@pytest.mark.parametrize("plan, liberada", [(PlanType.BASIC, False), (PlanType.FREE, True)])
async def test_sem_chave_do_piloto_ou_sem_plano_nada_sai(db, plan, liberada):
    tenant, _ = await _terreiro(db, plan=plan, liberada=liberada)
    await _mensalidade(db, tenant, dia_vencimento=10)
    await _medium(db, tenant, "Ana Paula")
    caixa = Caixa()
    assert await processar_terreiro(tenant.id, _brt(date(2026, 11, 7), 10), caixa) == 0
    assert await processar_todos(_brt(date(2026, 11, 7), 10), caixa) == 0
    assert caixa.mensagens == []


async def test_area_desligada_pela_casa_nada_sai(db):
    tenant, _ = await _terreiro(db, plan=PlanType.BASIC)
    await _mensalidade(db, tenant, dia_vencimento=10)
    await _medium(db, tenant, "Ana Paula")
    await db.execute(update(TenantConfig).where(TenantConfig.tenant_id == tenant.id).values(area_medium_ativa=False))
    await db.commit()
    assert await processar_terreiro(tenant.id, _brt(date(2026, 11, 7), 10), Caixa()) == 0


# ── Uma vez só, mesmo com duas rodadas ao mesmo tempo ───────────────────────


async def test_duas_rodadas_ao_mesmo_tempo_mandam_uma_vez_so(db):
    tenant, _ = await _terreiro(db, plan=PlanType.BASIC)
    await _mensalidade(db, tenant, dia_vencimento=10)
    atores = [await _medium(db, tenant, f"Pessoa {i} Silva") for i in range(6)]
    agora = _brt(date(2026, 11, 7), 10)
    caixa_a, caixa_b = Caixa(), Caixa()
    # Duas sessões, sem o advisory lock: só o índice único segura.
    total = await asyncio.gather(
        processar_terreiro(tenant.id, agora, caixa_a),
        processar_terreiro(tenant.id, agora, caixa_b),
        processar_terreiro(tenant.id, agora, caixa_b),
    )
    assert sum(total) == 6
    enviados = [m.to_email for m in caixa_a.mensagens + caixa_b.mensagens]
    assert sorted(enviados) == sorted(_email(a) for a, _ in atores)
    assert await _marcas(tenant.id) == 6
    # E o advisory lock deixa uma rodada só passar quando os dois "workers" rodam juntos.
    s1, s2 = MediumLembreteScheduler(), MediumLembreteScheduler()
    r = await asyncio.gather(s1.rodada(agora, Caixa()), s2.rodada(agora, Caixa()))
    assert r == [0, 0]  # nada novo, e nenhuma duplicidade


# ── Véspera, D-2, escala nova e plano ───────────────────────────────────────


async def test_vespera_avisa_quem_esta_na_escala_com_grupo_e_funcao(db):
    tenant, _ = await _terreiro(db, plan=PlanType.PRO)
    hoje = _hoje()
    amanha = hoje + timedelta(days=1)
    ana, ana_m = await _medium(db, tenant, "Ana Paula")
    bia, bia_m = await _medium(db, tenant, "Bia Souza")
    caio, caio_m = await _medium(db, tenant, "Caio Lima")
    duda, duda_m = await _medium(db, tenant, "Duda Reis")
    grupo = CorrenteGrupo(tenant_id=tenant.id, nome="G2", cor="petroleo")
    db.add(grupo)
    await db.commit()
    funcao = await _funcao(db, tenant, "Cambone")
    faxina = await _atividade(db, tenant, "Faxina", "Faxina · G2", _brt(amanha, 9), local="Salão")
    await _participa(db, tenant, faxina.id, ana_m, origem="grupo", grupo_id=grupo.id)
    await _participa(db, tenant, faxina.id, bia_m, resposta="nao_vou")  # não vai → sem lembrete
    gira = Gira(tenant_id=tenant.id, nome="Gira de Caboclos", data_inicio=_brt(amanha, 20), is_active=True)
    db.add(gira)
    await db.commit()
    ancora = await atividade_da_gira(db, tenant.id, gira.id)
    await db.commit()
    await _participa(db, tenant, ancora.id, caio_m, origem="funcao", funcao_id=funcao.id)
    await _participa(db, tenant, ancora.id, duda_m, convocado=False, resposta="vou", origem="elegivel")

    assert await processar_terreiro(tenant.id, _brt(hoje, 17, 50), Caixa()) == 0  # antes das 18 h
    caixa = Caixa()
    await processar_terreiro(tenant.id, _brt(hoje, 18, 5), caixa)
    assert caixa.assuntos(_email(ana)) == ["Casa Luz: lembrete para amanhã"]
    html_ana = caixa.para(_email(ana))[0].html_body
    assert "Faxina · G2" in html_ana and "Seu grupo" in html_ana and "G2" in html_ana and "às 9h" in html_ana
    assert "Salão" in html_ana and "Amanhã você está na escala" in html_ana
    assert caixa.para(_email(bia)) == []
    html_caio = caixa.para(_email(caio))[0].html_body
    assert "Sua função" in html_caio and "Cambone" in html_caio and f"/medium/agenda/gira/{gira.id}" in html_caio
    assert "Lembrete para amanhã" in caixa.para(_email(duda))[0].html_body
    for m in caixa.mensagens:
        assert _sem_termo_religioso(m.subject)
    assert await processar_terreiro(tenant.id, _brt(hoje, 19), Caixa()) == 0


async def test_escala_por_funcao_so_com_o_plano_escalas(db):
    tenant, _ = await _terreiro(db, plan=PlanType.BASIC)
    hoje = _hoje()
    ana, ana_m = await _medium(db, tenant, "Ana Paula")
    bia, bia_m = await _medium(db, tenant, "Bia Souza")
    funcao = await _funcao(db, tenant, "Porteiro")
    reuniao = await _atividade(db, tenant, "Reunião", "Reunião geral", _brt(hoje + timedelta(days=1), 19))
    await _participa(db, tenant, reuniao.id, ana_m)  # convocação manual: atividades_corrente (Basic)
    await _participa(db, tenant, reuniao.id, bia_m, origem="funcao", funcao_id=funcao.id)  # escala: Pro
    caixa = Caixa()
    await processar_terreiro(tenant.id, _brt(hoje, 18, 30), caixa)
    assert len(caixa.para(_email(ana))) == 1
    assert caixa.para(_email(bia)) == []


async def test_d2_pede_vou_nao_vou_a_quem_nao_respondeu(db):
    tenant, _ = await _terreiro(db, plan=PlanType.BASIC)
    hoje = _hoje()
    ana, ana_m = await _medium(db, tenant, "Ana Paula")
    bia, bia_m = await _medium(db, tenant, "Bia Souza")
    caio, caio_m = await _medium(db, tenant, "Caio Lima")
    reuniao = await _atividade(db, tenant, "Reunião", "Reunião geral", _brt(hoje + timedelta(days=2), 19))
    p_ana = await _participa(db, tenant, reuniao.id, ana_m)
    p_bia = await _participa(db, tenant, reuniao.id, bia_m, resposta="vou")
    await _envelhecer(db, p_ana, 72)
    await _envelhecer(db, p_bia, 72)
    # Caio entrou na escala agora: recebe "você está na escala", não o D-2 no mesmo dia.
    await _participa(db, tenant, reuniao.id, caio_m)
    caixa = Caixa()
    await processar_terreiro(tenant.id, _brt(hoje, 11), caixa)
    assert caixa.assuntos(_email(ana)) == ["Casa Luz: responda se você vai"]
    assert "Vou ou Não vou" in caixa.para(_email(ana))[0].html_body
    assert caixa.para(_email(bia)) == []
    assert caixa.assuntos(_email(caio)) == ["Casa Luz: você está na escala"]
    # Tipo que não pede resposta: sem D-2.
    await db.execute(update(AtividadeTipo).where(AtividadeTipo.id == reuniao.tipo_id).values(pede_confirmacao=False))
    await db.execute(delete(MediumLembreteEnviado))  # zera as marcas
    await db.commit()
    assert caixa.para(_email(ana))  # já recebeu antes
    nova = Caixa()
    await processar_terreiro(tenant.id, _brt(hoje, 12), nova)
    assert nova.para(_email(ana)) == []


async def test_escala_nova_junta_os_dias_num_e_mail_so(db):
    tenant, _ = await _terreiro(db, plan=PlanType.BASIC)
    hoje = _hoje()
    ana, ana_m = await _medium(db, tenant, "Ana Paula")
    a1 = await _atividade(db, tenant, "Organização interna", "Arrumar o bazar", _brt(hoje + timedelta(days=5), 9))
    a2 = await _atividade(db, tenant, "Organização interna", "Arrumar a cozinha", _brt(hoje + timedelta(days=12), 9))
    await _participa(db, tenant, a1.id, ana_m)
    await _participa(db, tenant, a2.id, ana_m)
    caixa = Caixa()
    assert await processar_terreiro(tenant.id, _brt(hoje, 6, 30), caixa) == 0  # madrugada não
    await processar_terreiro(tenant.id, _brt(hoje, 12), caixa)
    assert caixa.assuntos(_email(ana)) == ["Casa Luz: você está na escala"]
    html = caixa.para(_email(ana))[0].html_body
    assert "Arrumar o bazar" in html and "Arrumar a cozinha" in html and "2 dias" in html
    assert await processar_terreiro(tenant.id, _brt(hoje, 12, 15), Caixa()) == 0


# ── Ausência: convite para contar o motivo (sem o texto do motivo) ──────────


async def test_falta_convida_a_contar_o_motivo_sem_o_texto(db):
    tenant, admin = await _terreiro(db, plan=PlanType.BASIC)
    hoje = _hoje()
    ana, ana_m = await _medium(db, tenant, "Ana Paula")
    bia, bia_m = await _medium(db, tenant, "Bia Souza")
    ontem = await _atividade(db, tenant, "Reunião", "Reunião geral", _brt(hoje - timedelta(days=1), 19))
    agora = _brt(hoje, 10)
    registrada = agora - timedelta(hours=2)
    await _participa(db, tenant, ontem.id, ana_m, presenca="ausente", presenca_registrada_em=registrada)
    await _participa(
        db,
        tenant,
        ontem.id,
        bia_m,
        presenca="ausente",
        presenca_registrada_em=registrada,
        justificativa="Consulta no cardiologista",
        justificativa_em=registrada,
    )
    caixa = Caixa()
    await processar_terreiro(tenant.id, agora, caixa)
    assert caixa.assuntos(_email(ana)) == ["Casa Luz: sentimos sua falta"]
    corpo = caixa.para(_email(ana))[0].html_body
    assert "conte o motivo" in corpo.lower() and "/medium/presencas" in corpo and "Reunião geral" in corpo
    assert caixa.para(_email(bia)) == []
    # Resumo do admin (8 h do dia seguinte) conta o motivo novo, sem o texto.
    resumo = Caixa()
    await processar_terreiro(tenant.id, _brt(hoje, 8, 30), resumo)
    todos = caixa.mensagens + resumo.mensagens
    assert all("cardiologista" not in (m.html_body + (m.text_body or "") + m.subject) for m in todos)


# ── Aviso com "Avisar por e-mail também" ────────────────────────────────────


async def test_aviso_por_email_vai_ao_publico_com_area(client, db):
    tenant, admin = await _terreiro(db, plan=PlanType.BASIC)
    hoje = _hoje()
    ana, ana_m = await _medium(db, tenant, "Ana Paula")
    bia, bia_m = await _medium(db, tenant, "Bia Souza")
    caio, caio_m = await _medium(db, tenant, "Caio Lima")
    await _medium(db, tenant, "Sem Acesso", com_area=False)
    grupo = CorrenteGrupo(tenant_id=tenant.id, nome="G1", cor="ambar")
    db.add(grupo)
    await db.flush()
    db.add_all(
        [
            CorrenteGrupoMembro(tenant_id=tenant.id, grupo_id=grupo.id, medium_id=ana_m.id),
            CorrenteGrupoMembro(tenant_id=tenant.id, grupo_id=grupo.id, medium_id=caio_m.id),
            MediumPreferencia(tenant_id=tenant.id, medium_id=caio_m.id, token_descadastro="tok-caio", email_avisos=False),
        ]
    )
    await db.commit()
    resp = await client.post(
        AVISOS,
        headers=admin.headers,
        json={
            "titulo": "Mutirão de sábado",
            "corpo": "Tragam luvas.\n\nCafé às 8h & <b>pão</b>.",
            "publico": "grupos",
            "grupo_ids": [str(grupo.id)],
            "avisar_email": True,
        },
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["avisar_email"] is True
    aviso_id = resp.json()["id"]
    sem_email = await client.post(AVISOS, headers=admin.headers, json={"titulo": "Outro", "corpo": "Sem e-mail"})
    assert sem_email.json()["avisar_email"] is False
    agora = _brt(hoje, 12)
    await db.execute(
        update(Comunicado)
        .where(Comunicado.tenant_id == tenant.id)
        .values(publicar_em=agora - timedelta(hours=1), avisar_email_em=agora - timedelta(hours=1))
    )
    await db.commit()
    caixa = Caixa()
    await processar_terreiro(tenant.id, agora, caixa)
    assert [m.to_email for m in caixa.mensagens] == [_email(ana)]
    msg = caixa.mensagens[0]
    assert msg.subject == "Casa Luz: novo aviso da casa" and "Mutirão" not in msg.subject
    assert "Mutirão de sábado" in msg.html_body and "Tragam luvas." in msg.html_body
    assert "<b>" not in msg.html_body and "&amp;" in msg.html_body
    assert f"/medium/avisos/{aviso_id}" in msg.html_body
    assert await processar_terreiro(tenant.id, agora + timedelta(minutes=15), Caixa()) == 0

    # Ligar e desligar "avisar" antes da rodada seguinte: nada sai.
    resp = await client.put(f"{AVISOS}/{sem_email.json()['id']}", headers=admin.headers, json={"avisar_email": True})
    assert resp.status_code == 200 and resp.json()["avisar_email"] is True
    await client.put(f"{AVISOS}/{sem_email.json()['id']}", headers=admin.headers, json={"avisar_email": False})
    nada = Caixa()
    await processar_terreiro(tenant.id, agora + timedelta(minutes=30), nada)
    assert [m for m in nada.mensagens if "aviso" in m.subject] == []


async def test_modulo_de_avisos_desligado_nao_manda_aviso(client, db):
    tenant, admin = await _terreiro(db, plan=PlanType.BASIC)
    ana, _ = await _medium(db, tenant, "Ana Paula")
    resp = await client.post(AVISOS, headers=admin.headers, json={"titulo": "T", "corpo": "C", "avisar_email": True})
    assert resp.status_code == 201
    agora = _brt(_hoje(), 12)
    await db.execute(update(Comunicado).values(publicar_em=agora - timedelta(hours=1), avisar_email_em=None))
    await db.execute(update(TenantConfig).where(TenantConfig.tenant_id == tenant.id).values(area_medium_avisos=False))
    await db.commit()
    assert await processar_terreiro(tenant.id, agora, Caixa()) == 0


# ── Cancelamento e troca da chave PIX ───────────────────────────────────────


async def test_cancelamento_avisa_quem_estava_na_escala(client, db):
    tenant, admin = await _terreiro(db, plan=PlanType.BASIC)
    hoje = _hoje()
    ana, ana_m = await _medium(db, tenant, "Ana Paula")
    bia, bia_m = await _medium(db, tenant, "Bia Souza")
    atividade = await _atividade(db, tenant, "Reunião", "Reunião de pais", _brt(hoje + timedelta(days=3), 19))
    await _participa(db, tenant, atividade.id, ana_m)
    await _participa(db, tenant, atividade.id, bia_m, resposta="nao_vou")
    resp = await client.post(
        f"/api/v1/admin/atividades/{atividade.id}/cancelar", headers=admin.headers, json={"motivo": "Chuva forte"}
    )
    assert resp.status_code == 200, resp.text
    agora = _brt(hoje, 13)
    quando = agora - timedelta(hours=1)
    await db.execute(update(Atividade).where(Atividade.id == atividade.id).values(cancelada_em=quando))
    await db.execute(
        update(AtividadeParticipacao).where(AtividadeParticipacao.atividade_id == atividade.id).values(dispensado_em=quando)
    )
    await db.commit()
    caixa = Caixa()
    await processar_terreiro(tenant.id, agora, caixa)
    assert caixa.assuntos(_email(ana)) == ["Casa Luz: uma atividade foi cancelada"]
    assert "Chuva forte" in caixa.para(_email(ana))[0].html_body
    assert caixa.para(_email(bia)) == []


async def test_troca_da_chave_pix_avisa_sem_mostrar_a_chave(db):
    tenant, _ = await _terreiro(db, plan=PlanType.BASIC)
    ana, _ = await _medium(db, tenant, "Ana Paula")
    caio, _ = await _medium(db, tenant, "Caio Lima", isento=True)
    agora = _brt(_hoje(), 14)
    # Valor zerado: só o aviso da chave entra em jogo (nenhum lembrete de vencimento no dia do teste).
    await _mensalidade(
        db, tenant, valor="0.00", pix_tipo="email", pix_chave="tesouraria@casa.org", pix_alterado_em=agora - timedelta(hours=3)
    )
    caixa = Caixa()
    await processar_terreiro(tenant.id, agora, caixa)
    assert caixa.assuntos(_email(ana)) == ["Casa Luz: a chave PIX da mensalidade mudou"]
    assert all("tesouraria" not in (m.html_body + (m.text_body or "")) for m in caixa.mensagens)
    assert caixa.para(_email(caio)) == []
    assert await processar_terreiro(tenant.id, agora + timedelta(hours=1), Caixa()) == 0


# ── Resumo diário do admin ──────────────────────────────────────────────────


async def test_resumo_do_admin_um_por_terreiro_por_dia(db):
    tenant, admin = await _terreiro(db, plan=PlanType.BASIC)
    admin2 = await create_user(db, tenant, UserRole.ADMIN, name="tesoureira")
    operador = await create_user(db, tenant, UserRole.OPERATOR, name="porteiro")
    hoje = _hoje()
    agora = _brt(hoje, 8, 20)
    await _mensalidade(db, tenant, dia_vencimento=25)
    _, ana_m = await _medium(db, tenant, "Ana Paula")
    _, bia_m = await _medium(db, tenant, "Bia Souza")
    db.add(
        MensalidadePagamento(
            tenant_id=tenant.id,
            mediun_id=ana_m.id,
            mes_referencia=hoje.replace(day=1),
            status=MensalidadeStatus.PENDENTE,
            comprovante_enviado_em=agora - timedelta(hours=5),
            comprovante_filename="c.jpg",
        )
    )
    reuniao = await _atividade(db, tenant, "Reunião", "Reunião geral", _brt(hoje + timedelta(days=4), 19))
    passada = await _atividade(db, tenant, "Reunião", "Reunião antiga", _brt(hoje - timedelta(days=2), 19))
    await _participa(db, tenant, reuniao.id, ana_m, resposta="nao_vou", respondido_em=agora - timedelta(hours=3))
    await _participa(
        db,
        tenant,
        passada.id,
        bia_m,
        presenca="ausente",
        presenca_registrada_em=agora - timedelta(days=1),
        justificativa="Internação do meu pai",
        justificativa_em=agora - timedelta(hours=2),
    )
    caixa_a, caixa_b = Caixa(), Caixa()
    await asyncio.gather(processar_terreiro(tenant.id, agora, caixa_a), processar_terreiro(tenant.id, agora, caixa_b))
    resumos = [m for m in caixa_a.mensagens + caixa_b.mensagens if m.subject.startswith("Resumo do dia")]
    assert sorted(m.to_email for m in resumos) == sorted([admin.user.email, admin2.user.email])
    assert operador.user.email not in [m.to_email for m in resumos]
    html = resumos[0].html_body
    assert "Comprovantes para conferir" in html and "Ausências avisadas" in html and "Motivos novos" in html
    assert "Internação" not in html and "Ana Paula" not in html and "Bia Souza" not in html
    assert "/admin/financeiro/mensalidades" in html
    assert await _marcas(tenant.id, "resumo_admin") == 1
    # Mesma data, outra rodada: não repete.
    later = Caixa()
    await processar_terreiro(tenant.id, agora + timedelta(hours=1), later)
    assert [m for m in later.mensagens if m.subject.startswith("Resumo do dia")] == []


async def test_resumo_sem_nada_nao_sai(db):
    tenant, _ = await _terreiro(db, plan=PlanType.BASIC)
    await _medium(db, tenant, "Ana Paula")
    caixa = Caixa()
    await processar_terreiro(tenant.id, _brt(_hoje(), 8, 30), caixa)
    assert [m for m in caixa.mensagens if m.subject.startswith("Resumo do dia")] == []


# ── Descadastro pelo link e preferências na Área ────────────────────────────


async def test_link_de_descadastro_desliga_um_tipo_ou_todos(client, db):
    tenant, _ = await _terreiro(db, plan=PlanType.BASIC)
    await _mensalidade(db, tenant, dia_vencimento=10)
    ana, ana_m = await _medium(db, tenant, "Ana Paula")
    caixa = Caixa()
    await processar_terreiro(tenant.id, _brt(date(2026, 11, 7), 10), caixa)
    html = caixa.mensagens[0].html_body
    token = re.search(r"/descadastro/([A-Za-z0-9_\-]+)\?tipo=mensalidade", html).group(1)
    assert f"/descadastro/{token}?tipo=todos" in html

    r = await client.post(f"{PUBLIC}/consultar", json={"token": token})
    assert r.status_code == 200 and r.json()["terreiro_nome"] == "Casa Luz"
    assert all(r.json()["preferencias"].values())
    r = await client.post(f"{PUBLIC}/desligar", json={"token": token, "tipo": "mensalidade"})
    assert r.status_code == 200 and r.json()["preferencias"]["mensalidade"] is False
    assert r.json()["preferencias"]["avisos"] is True
    # D+3 não sai mais.
    assert await processar_terreiro(tenant.id, _brt(date(2026, 11, 13), 10), Caixa()) == 0
    r = await client.post(f"{PUBLIC}/desligar", json={"token": token, "tipo": "todos"})
    assert not any(r.json()["preferencias"].values())
    # A Área mostra o que o link desligou.
    me = await client.get(f"{MEDIUM}/preferencias", headers=ana.headers)
    assert not any(me.json()["preferencias"].values())
    assert (await client.post(f"{PUBLIC}/desligar", json={"token": "nao-existe", "tipo": "todos"})).status_code == 404
    assert (await client.post(f"{PUBLIC}/consultar", json={"token": "nao-existe"})).status_code == 404
    assert (await client.post(f"{PUBLIC}/desligar", json={"token": token, "tipo": "outro"})).status_code == 422


async def test_preferencias_na_area_e_impersonacao(client, db):
    tenant, _ = await _terreiro(db, plan=PlanType.BASIC)
    await _mensalidade(db, tenant)
    ana, ana_m = await _medium(db, tenant, "Ana Paula")
    caio, _ = await _medium(db, tenant, "Caio Lima", isento=True)
    r = await client.get(f"{MEDIUM}/preferencias", headers=ana.headers)
    assert r.status_code == 200
    assert all(r.json()["preferencias"].values())
    assert r.json()["disponiveis"] == ["mensalidade", "escalas", "confirmacao", "faltas", "avisos"]
    assert "mensalidade" not in (await client.get(f"{MEDIUM}/preferencias", headers=caio.headers)).json()["disponiveis"]

    r = await client.put(f"{MEDIUM}/preferencias", headers=ana.headers, json={"avisos": False, "faltas": False})
    assert r.status_code == 200
    assert r.json()["preferencias"] == {
        "mensalidade": True,
        "escalas": True,
        "confirmacao": True,
        "faltas": False,
        "avisos": False,
    }
    assert (await client.put(f"{MEDIUM}/preferencias", headers=ana.headers, json={"token_descadastro": "x"})).status_code == 422

    token = create_access_token(ana.user.id, tenant.id, "medium", impersonated_by=uuid.uuid4())
    h = {"Authorization": f"Bearer {token}"}
    assert (await client.get(f"{MEDIUM}/preferencias", headers=h)).status_code == 200
    assert (await client.put(f"{MEDIUM}/preferencias", headers=h, json={"avisos": True})).status_code == 403
    pref = (await db.execute(select(MediumPreferencia).where(MediumPreferencia.medium_id == ana_m.id))).scalar_one()
    await db.refresh(pref)
    assert pref.email_avisos is False


async def test_isolamento_entre_terreiros(client, db):
    t1, admin1 = await _terreiro(db, nome="Casa Luz", plan=PlanType.BASIC)
    t2, admin2 = await _terreiro(db, nome="Casa Mar", plan=PlanType.BASIC)
    await _mensalidade(db, t1, dia_vencimento=10)
    ana, ana_m = await _medium(db, t1, "Ana Paula")
    zeca, zeca_m = await _medium(db, t2, "Zeca Lopes")
    r = await client.post(AVISOS, headers=admin1.headers, json={"titulo": "Só da Luz", "corpo": "Texto", "avisar_email": True})
    assert r.status_code == 201
    agora = _brt(date(2026, 11, 7), 10)
    await db.execute(update(Comunicado).values(publicar_em=agora - timedelta(hours=1), avisar_email_em=None))
    await db.commit()
    caixa = Caixa()
    await processar_todos(agora, caixa)
    assert caixa.para(_email(zeca)) == []
    assert sorted(caixa.assuntos(_email(ana))) == ["Casa Luz: novo aviso da casa", "Casa Luz: sua mensalidade vence em 3 dias"]
    # O médium de um terreiro mexe só nas próprias preferências.
    await client.put(f"{MEDIUM}/preferencias", headers=zeca.headers, json={"avisos": False})
    prefs = (await db.execute(select(MediumPreferencia).where(MediumPreferencia.tenant_id == t1.id))).scalars().all()
    assert all(p.medium_id == ana_m.id for p in prefs)
    assert all(p.email_avisos for p in prefs)
    # O admin do outro terreiro não vê o aviso.
    assert (await client.get(AVISOS, headers=admin2.headers)).json() == []
