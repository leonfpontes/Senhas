"""AM-27 — regras puras da troca de escala e do abono (sem banco) e o desenho das rotas."""
import importlib.util
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest

from src.core.errors import ValidationError
from src.models import atividades as modelos
from src.models import medium_lembretes as modelos_lembretes
from src.services import medium_lembretes as lm
from src.services.assiduidade import (
    CAT_AUSENTE,
    CAT_AUSENTE_JUSTIFICADO,
    CAT_DISPENSADO,
    CAT_SUBSTITUIDO,
    Contagem,
    categoria,
)
from src.services.email.templates import medium_lembretes as tpl
from src.services.medium_inicio import montar_pendencias
from src.services.presenca import justificativa_vale, situacao
from src.services.trocas_escala import (
    MSG_CANCELADA,
    MSG_COMECOU,
    MSG_ENCERRADA,
    MSG_FORA_DA_ESCALA,
    MSG_GIRA_SEM_FUNCAO,
    MSG_SEM_ESCALA,
    aguardando,
    limpar_recado,
    motivo_sem_troca,
    primeiro_nome,
    status_ao_aceitar,
    substituto_visivel,
    tem_escala,
)

BACKEND_DIR = Path(__file__).resolve().parents[2]
AGORA = datetime(2026, 10, 8, 15, 0, tzinfo=timezone.utc)


def _motivo(**kw):
    base = dict(
        tem_linha=True,
        convocado=True,
        dispensado=False,
        substituida=False,
        convocacao_padrao="so_escalados",
        funcao_id=None,
        gira=False,
        cancelada=False,
        encerrada=False,
        agora=AGORA,
        inicio=AGORA + timedelta(days=2),
    )
    base.update(kw)
    return motivo_sem_troca(**base)


# ── Migração ────────────────────────────────────────────────────────────────


def test_migracao_086_encadeada_com_as_listas_do_modelo():
    spec = importlib.util.spec_from_file_location("m082", BACKEND_DIR / "alembic/versions/086_trocas_escala.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    assert (mod.revision, mod.down_revision) == ("086_trocas_escala", "085_assinatura_boleto")
    assert mod.ORIGENS == modelos.ORIGENS_PARTICIPACAO
    assert mod.STATUS == modelos.STATUS_TROCA
    assert mod.FECHADA_POR == modelos.FECHADA_POR
    assert mod.TIPOS == modelos_lembretes.TIPOS_LEMBRETE
    for tipo in mod.TIPOS_TROCA:
        assert modelos_lembretes.PREFERENCIA_DO_TIPO[tipo] == modelos_lembretes.PREF_ESCALAS
        assert tipo in lm.JANELAS


# ── O que dá para trocar ────────────────────────────────────────────────────


def test_faxina_e_funcao_na_gira_tem_troca():
    assert _motivo() is None
    assert _motivo(convocacao_padrao="todos_elegiveis", funcao_id=uuid.uuid4(), gira=True) is None
    assert tem_escala("todos_elegiveis", uuid.uuid4()) and tem_escala("so_escalados", None)
    assert not tem_escala("todos_elegiveis", None)


@pytest.mark.parametrize(
    "kw, msg",
    [
        ({"tem_linha": False}, MSG_FORA_DA_ESCALA),
        ({"convocado": False}, MSG_FORA_DA_ESCALA),
        ({"dispensado": True}, MSG_FORA_DA_ESCALA),
        ({"substituida": True}, MSG_FORA_DA_ESCALA),
        ({"convocacao_padrao": "todos_elegiveis"}, MSG_SEM_ESCALA),
        ({"convocacao_padrao": "todos_elegiveis", "gira": True}, MSG_GIRA_SEM_FUNCAO),
        ({"convocacao_padrao": "todos_elegiveis", "gira": True, "tem_linha": False}, MSG_GIRA_SEM_FUNCAO),
        ({"cancelada": True}, MSG_CANCELADA),
        ({"encerrada": True}, MSG_ENCERRADA),
        ({"inicio": AGORA}, MSG_COMECOU),
        ({"inicio": AGORA - timedelta(minutes=1)}, MSG_COMECOU),
    ],
)
def test_motivos_para_nao_trocar(kw, msg):
    assert _motivo(**kw) == msg


def test_fluxo_e_quem_precisa_agir():
    assert status_ao_aceitar(True) == "aceito" and status_ao_aceitar(False) == "aprovado"
    colega = uuid.uuid4()
    assert aguardando("pedido", colega) == "colega"
    assert aguardando("pedido", None) == "direcao"
    assert aguardando("aceito", colega) == "direcao"
    for fechada in ("aprovado", "recusado", "cancelado"):
        assert aguardando(fechada, colega) is None


def test_d07_nome_so_o_primeiro_e_com_opt_in():
    assert primeiro_nome("  Ana   Paula Souza ") == "Ana" and primeiro_nome("") is None and primeiro_nome(None) is None
    # Escolhido da lista (opt-in na hora do pedido) → aparece; indicado pela direção só com opt-in.
    assert substituto_visivel(indicado_pela_direcao=False, mostra_nome=False)
    assert not substituto_visivel(indicado_pela_direcao=True, mostra_nome=False)
    assert substituto_visivel(indicado_pela_direcao=True, mostra_nome=True)


def test_recado_texto_simples_e_curto():
    assert limpar_recado("  <b>Viagem</b>  ") == "Viagem"
    assert limpar_recado("   ") is None and limpar_recado(None) is None
    assert limpar_recado("a" * modelos.RECADO_MAX) == "a" * modelos.RECADO_MAX
    with pytest.raises(ValidationError):
        limpar_recado("a" * (modelos.RECADO_MAX + 1))


# ── Abono e assiduidade ─────────────────────────────────────────────────────


def test_justificativa_recusada_vira_falta_sem_justificativa():
    assert justificativa_vale("Plantão", None) and justificativa_vale("Plantão", "aceita")
    assert not justificativa_vale("Plantão", "recusada") and not justificativa_vale("  ", None)
    assert situacao(convocado=True, presenca="ausente", justificativa="Plantão") == "ausente_justificado"
    assert (
        situacao(convocado=True, presenca="ausente", justificativa="Plantão", justificativa_recusada=True) == "ausente"
    )
    # Antes da atividade continua "avisou que não vai" — a avaliação pesa na falta.
    assert (
        situacao(convocado=True, resposta="nao_vou", justificativa="Plantão", justificativa_recusada=True)
        == "ausencia_avisada"
    )


def test_substituicao_conta_a_parte_e_nao_e_falta():
    fatos = dict(convocado=True, cancelada=False, dispensado=False, encerrada=True, iniciou=True, presenca="ausente")
    assert categoria(**fatos, substituido=True) == CAT_SUBSTITUIDO
    assert categoria(**{**fatos, "cancelada": True}, substituido=True) == CAT_DISPENSADO
    assert categoria(**{**fatos, "dispensado": True}) == CAT_DISPENSADO
    assert categoria(**fatos, tem_justificativa=True) == CAT_AUSENTE_JUSTIFICADO
    assert categoria(**fatos, tem_justificativa=False) == CAT_AUSENTE
    c = Contagem()
    c.somar(CAT_SUBSTITUIDO)
    c.somar(CAT_AUSENTE)
    assert (c.substituidos, c.convocacoes, c.percentual) == (1, 1, 0)
    assert c.como_dict()["substituidos"] == 1


def test_pendencia_de_troca_logo_depois_da_escala():
    from datetime import date

    itens = montar_pendencias(
        hoje=date(2026, 10, 8), mensalidade=None, avisos_nao_lidos=2, escalas_a_responder=1, trocas_a_responder=3
    )
    assert [p["tipo"] for p in itens] == ["escala", "troca", "aviso"]
    assert itens[1]["quantidade"] == 3
    assert montar_pendencias(hoje=date(2026, 10, 8), mensalidade=None) == []


# ── E-mails ─────────────────────────────────────────────────────────────────


def test_eventos_de_email_da_troca():
    assert lm.eventos_da_troca("pedido", None, True, True) == [(lm.TIPO_TROCA_PEDIDA, "substituto", "")]
    assert lm.eventos_da_troca("pedido", None, False, True) == []  # a direção escolhe: ninguém recebe ainda
    assert lm.eventos_da_troca("pedido", None, True, False) == []  # não vale mais
    assert lm.eventos_da_troca("aceito", None, True, True) == [(lm.TIPO_TROCA_RESPOSTA, "solicitante", ":aceito")]
    assert lm.eventos_da_troca("recusado", "substituto", True, False) == [
        (lm.TIPO_TROCA_RESPOSTA, "solicitante", ":recusado_colega")
    ]
    assert lm.eventos_da_troca("recusado", "direcao", True, False) == [
        (lm.TIPO_TROCA_RESPOSTA, "solicitante", ":recusado_direcao")
    ]
    assert lm.eventos_da_troca("cancelado", "solicitante", True, False) == []
    assert lm.eventos_da_troca("cancelado", "direcao", True, False) == [
        (lm.TIPO_TROCA_RESPOSTA, "solicitante", ":cancelado_direcao")
    ]
    assert lm.eventos_da_troca("aprovado", "direcao", True, False) == [
        (lm.TIPO_TROCA_APROVADA, "solicitante", ""),
        (lm.TIPO_TROCA_APROVADA, "substituto", ""),
    ]


def test_emails_da_troca_discretos():
    item = tpl.ItemAtividade(titulo="Gira de Caboclos", quando="sábado, 10/10, às 20h", funcao="Cambone", link="https://x/y")
    conteudos = [
        tpl.conteudo_troca_pedida(terreiro="Casa", nome="Beto Lima", colega="Ana", item=item, recado="Viagem"),
        tpl.conteudo_troca_resposta(terreiro="Casa", nome="Ana", colega="Beto", item=item, resultado="aceito"),
        tpl.conteudo_troca_aprovada(terreiro="Casa", nome="Ana", colega=None, item=item, foi_quem_pediu=True),
        tpl.conteudo_troca_aprovada(terreiro="Casa", nome="Beto", colega="Ana", item=item, foi_quem_pediu=False),
    ]
    for c in conteudos:
        assunto = (c.assunto + " " + c.preheader).lower()
        assert not any(t in assunto for t in ("gira", "cambone", "caboclo", "corrente", "convocad"))
    assert "Ana perguntou" in conteudos[0].paragrafos[1] and ("Recado", "Viagem") in conteudos[0].detalhes
    assert "um colega da corrente vai no seu lugar" in conteudos[2].paragrafos[1]
    assert "no lugar de Ana" in conteudos[3].paragrafos[1]


# ── Rotas ───────────────────────────────────────────────────────────────────


def test_rotas_admin_das_trocas_com_plano_escalas_e_grupo():
    from src.api.v1.admin.atividades_trocas import router
    from tests.plan_gate_helpers import plan_gate_features

    assert router.prefix == "/api/v1/admin/atividades"
    assert plan_gate_features(router) == ["area_medium", "atividades_corrente", "escalas"]
    rotas = {(m, r.path) for r in router.routes for m in r.methods}
    base = "/api/v1/admin/atividades/trocas"
    assert rotas == {
        ("GET", base),
        ("GET", f"{base}/{{troca_id}}/substitutos"),
        ("POST", f"{base}/{{troca_id}}/aprovar"),
        ("POST", f"{base}/{{troca_id}}/recusar"),
        ("POST", f"{base}/{{troca_id}}/cancelar"),
    }


def test_trocas_antes_do_get_por_id_das_atividades():
    from fastapi.routing import APIRoute, iter_route_contexts

    from src.main import create_app

    caminhos = [
        ctx.path for ctx in iter_route_contexts(create_app().routes) if isinstance(ctx.original_route, APIRoute)
    ]
    assert caminhos.index("/api/v1/admin/atividades/trocas") < caminhos.index("/api/v1/admin/atividades/{atividade_id}")


def test_rotas_da_area_com_plano_e_escritas_sem_impersonacao():
    from src.api.dependencies import require_not_impersonated
    from src.api.v1.medium.trocas import router

    rotas = {(m, r.path): r for r in router.routes for m in r.methods}
    assert set(rotas) == {
        ("GET", "/trocas"),
        ("GET", "/atividades/{origem}/{ref_id}/troca"),
        ("POST", "/atividades/{origem}/{ref_id}/troca"),
        ("POST", "/trocas/{troca_id}/aceitar"),
        ("POST", "/trocas/{troca_id}/recusar"),
        ("POST", "/trocas/{troca_id}/cancelar"),
    }
    for (metodo, caminho), rota in rotas.items():
        deps = [d.dependency for d in rota.dependencies]
        planos = {getattr(d, "plan_feature", None) for d in deps}
        assert {"atividades_corrente", "escalas"} <= planos, caminho
        assert (require_not_impersonated in deps) == (metodo == "POST"), caminho
