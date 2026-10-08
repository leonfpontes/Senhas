"""AM-15 — Lembretes e avisos por e-mail: regras puras, textos e ligações (sem banco).

O comportamento com Postgres real (quem recebe cada tipo, preferências, chave da casa, plano,
chave do piloto, uma vez só com duas rodadas ao mesmo tempo, resumo um por terreiro/dia,
descadastro, impersonação e isolamento) está em tests/integration_pg/test_am15_lembretes.py.
"""
import importlib.util
import inspect
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pytest

from src.core import public_links as pl
from src.core.tz import APP_TZ
from src.models import medium_lembretes as modelos
from src.services import medium_lembretes as lm
from src.services.email.templates import medium_lembretes as tpl

BACKEND_DIR = Path(__file__).resolve().parents[2]
REPO_DIR = BACKEND_DIR.parent
TERMOS_RELIGIOSOS = ("gira", "faxina", "cambone", "orixá", "caboclo", "amaci", "exu", "umbanda", "candomblé")


def _brt(d: date, hora: int, minuto: int = 0) -> datetime:
    return datetime(d.year, d.month, d.day, hora, minuto, tzinfo=APP_TZ).astimezone(timezone.utc)


# ── Migração, chave do agendador e registro ─────────────────────────────────


def test_migracao_081_encadeada_e_lista_de_tipos_congelada():
    spec = importlib.util.spec_from_file_location("m081", BACKEND_DIR / "alembic/versions/081_lembretes.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert (mod.revision, mod.down_revision) == ("081_lembretes", "080_escala_planos")
    assert mod.TIPOS == modelos.TIPOS_LEMBRETE
    assert set(modelos.PREFERENCIA_DO_TIPO) == set(modelos.TIPOS_LEMBRETE) - {modelos.TIPO_RESUMO_ADMIN}
    assert set(modelos.PREFERENCIA_DO_TIPO.values()) == set(modelos.PREFERENCIAS)
    assert set(lm.JANELAS) == set(modelos.TIPOS_LEMBRETE)


def test_chave_do_agendador_e_registro_no_lifespan():
    from src.services import scheduler_guard as sg

    assert sg.MEDIUM_LEMBRETE_LOCK_KEY == 0x6769726168756206
    chaves = {sg.TRIAL_LOCK_KEY, sg.BIRTHDAY_LOCK_KEY, sg.PRESENCA_LOCK_KEY, sg.MEDIUM_LEMBRETE_LOCK_KEY, 0x6769726168756201}
    assert len(chaves) == 5 and 0x6769726168756205 not in chaves  # 205 fica reservada
    main = (BACKEND_DIR / "src/main.py").read_text()
    assert "medium_lembrete_scheduler.start()" in main and "await medium_lembrete_scheduler.stop()" in main


def test_link_de_descadastro_tem_pagina_no_frontend():
    assert (REPO_DIR / "frontend/src/pages/descadastro/[token].tsx").exists()
    assert pl.descadastro_link("https://girahub.com.br/", "abc", "todos") == "https://girahub.com.br/descadastro/abc?tipo=todos"
    assert pl.area_medium_link("https://girahub.com.br", "/presencas") == "https://girahub.com.br/medium/presencas"


# ── Janelas em Brasília ─────────────────────────────────────────────────────


@pytest.mark.parametrize(
    "tipo, hora, aberta",
    [
        (modelos.TIPO_VESPERA, 17, False),
        (modelos.TIPO_VESPERA, 18, True),
        (modelos.TIPO_VESPERA, 21, True),
        (modelos.TIPO_VESPERA, 22, False),
        (modelos.TIPO_RESUMO_ADMIN, 7, False),
        (modelos.TIPO_RESUMO_ADMIN, 8, True),
        (modelos.TIPO_RESUMO_ADMIN, 12, False),
        (modelos.TIPO_MENSALIDADE_ANTES, 9, True),
        (modelos.TIPO_MENSALIDADE_DEPOIS, 20, False),
        (modelos.TIPO_CONFIRMACAO, 9, False),
        (modelos.TIPO_CONFIRMACAO, 10, True),
        (modelos.TIPO_AVISO, 3, False),
        (modelos.TIPO_AVISO, 7, True),
        (modelos.TIPO_CANCELADA, 23, False),
    ],
)
def test_janela_no_horario_de_brasilia(tipo, hora, aberta):
    assert lm.janela_aberta(tipo, _brt(date(2026, 10, 10), hora)) is aberta


def test_janela_usa_brasilia_e_nao_utc():
    # 21h UTC = 18h em Brasília: a véspera abre; 18h UTC = 15h em Brasília: ainda não.
    assert lm.janela_aberta(modelos.TIPO_VESPERA, datetime(2026, 10, 10, 21, 0, tzinfo=timezone.utc))
    assert not lm.janela_aberta(modelos.TIPO_VESPERA, datetime(2026, 10, 10, 18, 0, tzinfo=timezone.utc))


# ── Mensalidade (D-29) ──────────────────────────────────────────────────────


def test_dia_do_lembrete_da_mensalidade():
    venc = date(2026, 11, 10)
    assert lm.tipo_lembrete_mensalidade(date(2026, 11, 7), venc) == modelos.TIPO_MENSALIDADE_ANTES
    assert lm.tipo_lembrete_mensalidade(date(2026, 11, 13), venc) == modelos.TIPO_MENSALIDADE_DEPOIS
    assert lm.tipo_lembrete_mensalidade(date(2026, 11, 10), venc) is None  # no vencimento, não (D-29)
    assert lm.tipo_lembrete_mensalidade(date(2026, 11, 8), venc) is None


def test_meses_candidatos_cobrem_a_virada_do_mes():
    # Vence dia 1º: o D-3 cai no fim do mês anterior; vence dia 30: o D+3 cai no mês seguinte.
    assert date(2026, 11, 1) in lm.meses_candidatos(date(2026, 10, 29))
    assert date(2026, 10, 1) in lm.meses_candidatos(date(2026, 11, 2))
    assert lm.meses_candidatos(date(2026, 1, 15)) == [date(2025, 12, 1), date(2026, 1, 1), date(2026, 2, 1)]


@pytest.mark.parametrize(
    "status, lembra",
    [("pendente", True), ("atrasada", True), ("em_conferencia", False), ("nao_confirmada", False), ("paga", False), ("isento", False), (None, False)],
)
def test_so_mes_em_aberto_sem_comprovante_recebe(status, lembra):
    assert lm.mensalidade_pede_lembrete(status) is lembra


# ── Escala × atividade (plano) e preferências ───────────────────────────────


def test_o_que_e_escala_e_qual_plano_vale():
    assert lm.eh_escala("funcao", None, "manual")
    assert lm.eh_escala("rodizio", None, "manual")
    assert lm.eh_escala("manual", uuid.uuid4(), "manual")
    assert lm.eh_escala("grupo", None, "plano_escala")
    assert not lm.eh_escala("grupo", None, "manual")  # convocar grupo à mão é do Basic (AM-29)
    assert not lm.eh_escala("manual", None, "gira")
    assert lm.plano_permite(True, escalas=True, atividades_corrente=True)
    assert not lm.plano_permite(True, escalas=False, atividades_corrente=True)
    assert lm.plano_permite(False, escalas=False, atividades_corrente=True)
    assert not lm.plano_permite(False, escalas=False, atividades_corrente=False)


def test_preferencia_sem_linha_e_tudo_ligado():
    assert all(lm.preferencia_ligada(None, t) for t in modelos.PREFERENCIA_DO_TIPO)
    pref = modelos.MediumPreferencia(
        email_mensalidade=False, email_escalas=True, email_confirmacao=True, email_faltas=True, email_avisos=False
    )
    assert not lm.preferencia_ligada(pref, modelos.TIPO_PIX_ALTERADO)
    assert not lm.preferencia_ligada(pref, modelos.TIPO_AVISO)
    assert lm.preferencia_ligada(pref, modelos.TIPO_VESPERA)
    assert lm.preferencias_payload(None) == {p: True for p in modelos.PREFERENCIAS}


# ── Seleção das participações ───────────────────────────────────────────────


def _p(**kw) -> lm.ParticipacaoLembrete:
    agora = kw.pop("agora", datetime(2026, 10, 10, 15, tzinfo=timezone.utc))
    inicio = kw.pop("inicio", agora + timedelta(days=1))
    base = dict(
        medium_id=uuid.uuid4(),
        atividade_id=uuid.uuid4(),
        origem="atividade",
        ref_id=uuid.uuid4(),
        titulo="Reunião",
        inicio=inicio,
        fim=inicio + timedelta(hours=2),
        local=None,
        grupo=None,
        funcao=None,
        escala=False,
        convocado=True,
        resposta="sem_resposta",
        presenca="nao_registrada",
        tem_justificativa=False,
        dispensado_em=None,
        substituida=False,
        cancelada_em=None,
        cancelamento_motivo=None,
        pede_confirmacao=True,
        controla_presenca=True,
        criada_em=agora - timedelta(days=5),
        presenca_registrada_em=None,
    )
    base.update(kw)
    return lm.ParticipacaoLembrete(**base)


def test_vespera_so_amanha_e_so_quem_vai():
    hoje = date(2026, 10, 10)
    amanha_9h = _brt(hoje + timedelta(days=1), 9)
    assert lm.para_vespera(_p(inicio=amanha_9h), hoje + timedelta(days=1))
    assert lm.para_vespera(_p(inicio=amanha_9h, convocado=False, resposta="vou"), hoje + timedelta(days=1))
    assert not lm.para_vespera(_p(inicio=amanha_9h, convocado=False), hoje + timedelta(days=1))
    assert not lm.para_vespera(_p(inicio=amanha_9h, resposta="nao_vou"), hoje + timedelta(days=1))
    assert not lm.para_vespera(_p(inicio=amanha_9h, dispensado_em=amanha_9h), hoje + timedelta(days=1))
    assert not lm.para_vespera(_p(inicio=amanha_9h, cancelada_em=amanha_9h), hoje + timedelta(days=1))
    # 23h30 de amanhã em Brasília já é depois de amanhã em UTC: vale a data de Brasília.
    assert lm.para_vespera(_p(inicio=_brt(hoje + timedelta(days=1), 23, 30)), hoje + timedelta(days=1))


def test_confirmacao_d2():
    hoje = date(2026, 10, 10)
    agora = _brt(hoje, 11)
    dia = hoje + timedelta(days=2)
    inicio = _brt(dia, 19)
    assert lm.para_confirmacao(_p(inicio=inicio, agora=agora), dia, agora)
    assert not lm.para_confirmacao(_p(inicio=inicio, agora=agora, resposta="vou"), dia, agora)
    assert not lm.para_confirmacao(_p(inicio=inicio, agora=agora, pede_confirmacao=False), dia, agora)
    assert not lm.para_confirmacao(_p(inicio=inicio, agora=agora, convocado=False), dia, agora)
    assert not lm.para_confirmacao(_p(inicio=inicio, agora=agora, criada_em=agora - timedelta(hours=3)), dia, agora)


def test_escala_nova():
    hoje = date(2026, 10, 10)
    agora = _brt(hoje, 12)
    longe = _brt(hoje + timedelta(days=6), 9)
    nova = dict(agora=agora, inicio=longe, criada_em=agora - timedelta(hours=1))
    assert lm.para_escala_nova(_p(**nova), hoje, agora)
    assert not lm.para_escala_nova(_p(**{**nova, "criada_em": agora - timedelta(days=3)}), hoje, agora)
    assert not lm.para_escala_nova(_p(**{**nova, "inicio": _brt(hoje + timedelta(days=1), 9)}), hoje, agora)
    assert not lm.para_escala_nova(_p(**{**nova, "resposta": "vou"}), hoje, agora)
    assert not lm.para_escala_nova(_p(**{**nova, "convocado": False}), hoje, agora)


def test_falta_dentro_do_prazo_e_sem_motivo():
    hoje = date(2026, 10, 10)
    agora = _brt(hoje, 10)
    ontem = _brt(hoje - timedelta(days=1), 19)
    base = dict(agora=agora, inicio=ontem, presenca="ausente", presenca_registrada_em=agora - timedelta(hours=1))
    assert lm.para_falta(_p(**base), hoje, agora, 7) == (hoje - timedelta(days=1)) + timedelta(days=7)
    assert lm.para_falta(_p(**{**base, "tem_justificativa": True}), hoje, agora, 7) is None
    assert lm.para_falta(_p(**{**base, "presenca": "presente"}), hoje, agora, 7) is None
    assert lm.para_falta(_p(**{**base, "controla_presenca": False}), hoje, agora, 7) is None
    velha = _brt(hoje - timedelta(days=10), 19)
    assert lm.para_falta(_p(**{**base, "inicio": velha}), hoje, agora, 7) is None  # prazo passou


def test_cancelada_so_quem_estava_e_ainda_no_futuro():
    agora = datetime(2026, 10, 10, 15, tzinfo=timezone.utc)
    quando = agora - timedelta(hours=1)
    base = dict(agora=agora, inicio=agora + timedelta(days=2), cancelada_em=quando, dispensado_em=quando)
    assert lm.para_cancelada(_p(**base), agora)
    assert not lm.para_cancelada(_p(**{**base, "resposta": "nao_vou"}), agora)
    assert not lm.para_cancelada(_p(**{**base, "dispensado_em": quando - timedelta(days=1)}), agora)  # já fora antes
    assert not lm.para_cancelada(_p(**{**base, "cancelada_em": agora - timedelta(days=3), "dispensado_em": agora - timedelta(days=3)}), agora)
    assert not lm.para_cancelada(_p(**{**base, "inicio": agora - timedelta(hours=1)}), agora)


# ── Formatos ────────────────────────────────────────────────────────────────


def test_formatos_em_portugues():
    assert lm.quando_legivel(_brt(date(2026, 10, 10), 9)) == "sábado, 10/10, às 9h"
    assert lm.quando_legivel(_brt(date(2026, 10, 12), 19, 30)) == "segunda, 12/10, às 19h30"
    assert lm.valor_legivel(1234.5) == "R$ 1.234,50"
    assert lm.valor_legivel(0) is None and lm.valor_legivel(None) is None
    assert lm.mes_legivel(date(2026, 3, 1)) == "março de 2026"


# ── Textos: discretos, escapados, sem motivo de ausência ────────────────────

VISUAL = tpl.VisualTerreiro(nome="Casa <Luz>", cor="#123456")
LINKS = tpl.LinksDescadastro(tipo="https://x/descadastro/t?tipo=escalas", todos="https://x/descadastro/t?tipo=todos", rotulo_tipo="avisos de escala")
ITEM = tpl.ItemAtividade(
    titulo="Gira de Caboclos <script>alert(1)</script>",
    quando="sábado, 12/10, às 20h",
    local="Salão & quintal",
    grupo="G2",
    funcao="Cambone",
    link="https://x/medium/agenda/gira/1",
)


def _todos_os_conteudos():
    t = "Casa Luz"
    return [
        tpl.conteudo_mensalidade(terreiro=t, nome="Ana", depois=False, mes_label="outubro de 2026", valor="R$ 50,00", vencimento="10/10", link="l"),
        tpl.conteudo_mensalidade(terreiro=t, nome="Ana", depois=True, mes_label="outubro de 2026", valor=None, vencimento="10/10", link="l"),
        tpl.conteudo_pix_alterado(terreiro=t, nome="Ana", quando="08/10", link="l"),
        tpl.conteudo_escala_nova(terreiro=t, nome="Ana", itens=[ITEM, ITEM], link="l"),
        tpl.conteudo_vespera(terreiro=t, nome="Ana", item=ITEM, na_escala=True),
        tpl.conteudo_confirmacao(terreiro=t, nome="Ana", item=ITEM),
        tpl.conteudo_falta(terreiro=t, nome="Ana", item=ITEM, prazo="17/10", link="l"),
        tpl.conteudo_cancelada(terreiro=t, nome="Ana", item=ITEM, motivo="Chuva"),
        tpl.conteudo_aviso(terreiro=t, nome="Ana", titulo="Amaci de Oxalá", texto="Texto", link="l"),
        tpl.conteudo_resumo_admin(terreiro=t, comprovantes=2, ausencias=1, motivos=1, link_comprovantes="a", link_atividades="b"),
    ]


def test_assunto_e_previa_discretos():
    for c in _todos_os_conteudos():
        for texto in (c.assunto, c.preheader):
            baixo = texto.lower()
            assert not any(termo in baixo for termo in TERMOS_RELIGIOSOS), texto
            assert "Caboclos" not in texto and "Oxalá" not in texto
        assert c.assunto.startswith("Casa Luz") or c.assunto.endswith("Casa Luz")


def test_html_escapa_tudo_que_varia():
    html = tpl.render_html(tpl.conteudo_vespera(terreiro="Casa", nome="<b>Ana</b>", item=ITEM, na_escala=True), VISUAL, LINKS)
    assert "<script>" not in html and "&lt;script&gt;" in html
    assert "<b>Ana" not in html and "Casa &lt;Luz&gt;" in html
    assert "Salão &amp; quintal" in html
    aviso = tpl.render_html(
        tpl.conteudo_aviso(terreiro="Casa", nome="Ana", titulo="T", texto="Linha 1\n<img src=x onerror=1>\n\nParágrafo 2", link="l"),
        VISUAL,
        LINKS,
    )
    assert "<img" not in aviso and "&lt;img src=x onerror=1&gt;" in aviso and "Linha 1<br>" in aviso


def test_cor_do_terreiro_so_hex():
    html = tpl.render_html(tpl.conteudo_pix_alterado(terreiro="C", nome="A", quando="1", link="l"), tpl.VisualTerreiro(nome="C", cor="red;background:url(x)"), None)
    assert "url(x)" not in html and "#4f46e5" in html


def test_rodape_com_descadastro_do_tipo_e_de_todos():
    html = tpl.render_html(tpl.conteudo_vespera(terreiro="C", nome="Ana", item=ITEM, na_escala=True), VISUAL, LINKS)
    assert "tipo=escalas" in html and "tipo=todos" in html and "Perfil da Área" in html
    texto = tpl.render_texto(tpl.conteudo_vespera(terreiro="C", nome="Ana", item=ITEM, na_escala=True), VISUAL, LINKS)
    assert "tipo=todos" in texto
    sem = tpl.render_html(_todos_os_conteudos()[-1], VISUAL, None)
    assert "descadastro" not in sem


def test_falta_e_resumo_nunca_recebem_o_texto_do_motivo():
    # A assinatura não tem como receber o motivo: o e-mail só convida a contar pela Área.
    assert not {"justificativa", "motivo_ausencia"} & set(inspect.signature(tpl.conteudo_falta).parameters)
    assert not {"justificativa", "justificativas"} & set(inspect.signature(tpl.conteudo_resumo_admin).parameters)
    assert "saúde" in " ".join(tpl.conteudo_falta(terreiro="C", nome="A", item=ITEM, prazo="1", link="l").paragrafos)
    # A consulta das participações lê só se há motivo (IS NOT NULL), nunca o texto.
    fonte = inspect.getsource(lm.participacoes)
    assert "justificativa.is_not(None)" in fonte and "AtividadeParticipacao.justificativa," not in fonte


def test_vocabulario_do_glossario():
    textos = " ".join(
        " ".join([c.assunto, c.titulo, *c.paragrafos, c.botao_texto or ""]) for c in _todos_os_conteudos()
    ).lower()
    for evitar in ("convocad", "check-in", "justificativa obrigatória", "fatura", "boleto", "cobrança"):
        assert evitar not in textos
    assert "vou ou não vou" in textos and "conte o motivo" in textos and "pagar com pix" in textos


def test_pix_nunca_traz_a_chave():
    assert "chave" not in inspect.signature(tpl.conteudo_pix_alterado).parameters
