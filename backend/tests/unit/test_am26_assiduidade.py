"""AM-26 — Relatório de assiduidade: regras de agregação, período, guards e plano (sem banco).

O comportamento HTTP com Postgres real (números por médium e por grupo num cenário semeado,
filtros, `agrupar=grupo` sem o plano Pro, justificativa só no detalhe, ids de outro terreiro e
chave do piloto) está em tests/integration_pg/test_am26_assiduidade.py.
"""
from datetime import date

import pytest

from src.models import PermissionFeature
from src.services import assiduidade as svc
from src.services.medium_agenda import PeriodoInvalido
from src.services.presenca import percentual

# ── Categoria de cada linha ─────────────────────────────────────────────────

ENCERRADA = {"convocado": True, "cancelada": False, "dispensado": False, "encerrada": True, "iniciou": True}


@pytest.mark.parametrize(
    "kw, esperado",
    [
        # Chamada encerrada: presente, ausente com e sem motivo.
        ({**ENCERRADA, "presenca": "presente"}, "presente"),
        ({**ENCERRADA, "presenca": "presente", "resposta": "nao_vou"}, "presente"),
        ({**ENCERRADA, "presenca": "ausente"}, "ausente"),
        ({**ENCERRADA, "presenca": "ausente", "tem_justificativa": True}, "ausente_justificado"),
        ({**ENCERRADA, "presenca": "ausente", "resposta": "nao_vou", "tem_justificativa": True}, "ausente_justificado"),
        # Confiança: o "vou" vale presente quando a atividade terminou (o encerramento grava,
        # e uma presença limpa depois numa correção continua contando).
        ({**ENCERRADA, "resposta": "vou", "confianca_terminou": True}, "presente"),
        ({**ENCERRADA, "resposta": "vou", "presenca": "ausente", "confianca_terminou": True}, "ausente"),
        # Fora da confiança, "vou" sem presença com a chamada encerrada é ausência.
        ({**ENCERRADA, "resposta": "vou"}, "ausente"),
        ({**ENCERRADA, "resposta": "nao_vou", "tem_justificativa": True}, "ausente_justificado"),
        # Sem chamada encerrada: não entra no percentual.
        ({**ENCERRADA, "encerrada": False, "presenca": "presente"}, "sem_chamada"),
        ({**ENCERRADA, "encerrada": False, "presenca": "ausente"}, "sem_chamada"),
        ({**ENCERRADA, "encerrada": False, "iniciou": False, "resposta": "vou"}, "futura"),
        # Dispensado, substituído (vem como dispensado) e atividade cancelada.
        ({**ENCERRADA, "dispensado": True, "presenca": "ausente"}, "dispensado"),
        ({**ENCERRADA, "cancelada": True, "presenca": "presente"}, "dispensado"),
        ({**ENCERRADA, "cancelada": True, "encerrada": False}, "dispensado"),
        # Avulso ("Adicionar quem veio", sem estar na escala): não é convocação.
        ({**ENCERRADA, "convocado": False, "presenca": "presente"}, "avulso"),
        ({**ENCERRADA, "convocado": False, "encerrada": False, "presenca": "presente"}, "avulso"),
        ({**ENCERRADA, "convocado": False}, "ignorada"),
        ({**ENCERRADA, "convocado": False, "cancelada": True, "presenca": "presente"}, "dispensado"),
    ],
)
def test_categoria_da_linha(kw, esperado):
    assert svc.categoria(**kw) == esperado


def _contagem(*categorias):
    c = svc.Contagem()
    for cat in categorias:
        c.somar(cat)
    return c


def test_percentual_so_com_chamada_encerrada_sem_dispensados_nem_avulsos():
    c = _contagem(
        "presente", "presente", "presente",
        "ausente_justificado", "ausente",
        "sem_chamada", "sem_chamada",
        "dispensado", "avulso", "futura", "ignorada",
    )
    assert (c.convocacoes, c.presencas, c.ausencias_justificadas, c.ausencias_sem_justificativa) == (5, 3, 1, 1)
    assert (c.sem_chamada, c.dispensados, c.avulsos) == (2, 1, 1)
    assert c.convocacoes == c.presencas + c.ausencias_justificadas + c.ausencias_sem_justificativa
    assert c.percentual == 60 == percentual(3, 5)  # mesma conta do "Minhas presenças" da Área
    assert c.como_dict()["percentual"] == 60


def test_sem_convocacao_nao_tem_percentual_e_contagem_vazia():
    assert svc.Contagem().percentual is None and svc.Contagem().vazia
    so_sem_chamada = _contagem("sem_chamada")
    assert so_sem_chamada.percentual is None and not so_sem_chamada.vazia
    assert _contagem("futura", "ignorada").vazia


def test_somar_em_lote_e_juntar():
    a = svc.Contagem()
    a.somar("presente", 4)
    a.somar("ausente", 1)
    b = _contagem("ausente_justificado", "avulso")
    a.juntar(b)
    assert (a.convocacoes, a.presencas, a.avulsos, a.percentual) == (6, 4, 1, 67)


def test_percentual_arredonda():
    assert _contagem("presente", "ausente", "ausente").percentual == 33
    assert _contagem("presente", "presente", "ausente").percentual == 67


# ── Período ─────────────────────────────────────────────────────────────────

HOJE = date(2026, 10, 8)


def test_periodo_padrao_e_o_mes():
    assert svc.periodo_do_relatorio(HOJE, None, None) == (date(2026, 10, 1), date(2026, 10, 31))
    assert svc.periodo_do_relatorio(HOJE, date(2026, 2, 10), None) == (date(2026, 2, 10), date(2026, 2, 28))


def test_periodo_ano_inteiro_cabe_e_mais_que_um_ano_nao():
    assert svc.periodo_do_relatorio(HOJE, date(2028, 1, 1), date(2028, 12, 31)) == (date(2028, 1, 1), date(2028, 12, 31))
    with pytest.raises(PeriodoInvalido, match="um ano"):
        svc.periodo_do_relatorio(HOJE, date(2026, 1, 1), date(2027, 1, 3))
    with pytest.raises(PeriodoInvalido, match="depois da inicial"):
        svc.periodo_do_relatorio(HOJE, date(2026, 10, 8), date(2026, 10, 1))


# ── Guards, plano, rotas e LGPD ─────────────────────────────────────────────


def _guards(dependencies) -> set:
    out = set()
    for d in dependencies:
        cells = [c.cell_contents for c in (getattr(d.dependency, "__closure__", None) or ())]
        feats = [c for c in cells if isinstance(c, PermissionFeature)]
        acoes = [c for c in cells if isinstance(c, str)]
        if feats:
            out.add((frozenset(feats), acoes[0] if acoes else None))
    return out


def test_rotas_com_escalas_view_e_planos_do_router():
    from src.api.v1.admin.atividades_assiduidade import router
    from tests.plan_gate_helpers import plan_gate_features

    base = "/api/v1/admin/atividades"
    assert router.prefix == base
    assert plan_gate_features(router) == ["area_medium", "atividades_corrente"]
    vistos = {(m, r.path): _guards(r.dependencies) for r in router.routes for m in r.methods}
    escalas_view = {(frozenset({PermissionFeature.ESCALAS}), "view")}
    assert vistos == {
        ("GET", f"{base}/assiduidade"): escalas_view,
        ("GET", f"{base}/assiduidade/medium/{{medium_id}}"): escalas_view,
    }


def test_por_grupo_exige_o_plano_escalas_no_codigo():
    import inspect

    from src.api.v1.admin import atividades_assiduidade as mod

    fonte = inspect.getsource(mod.relatorio_de_assiduidade)
    assert 'check_plan_feature(current_user, db, "escalas")' in fonte
    assert fonte.index("check_plan_feature") < fonte.index("_periodo(")  # antes de qualquer consulta


def test_assiduidade_vem_antes_do_detalhe_da_atividade():
    """`/assiduidade` não pode cair no `GET /{atividade_id}` (422 de UUID)."""
    from fastapi.routing import APIRoute, iter_route_contexts

    from src.main import create_app

    ordem = [
        ctx.path
        for ctx in iter_route_contexts(create_app().routes)
        if isinstance(ctx.original_route, APIRoute) and "GET" in ctx.original_route.methods
    ]
    assert ordem.index("/api/v1/admin/atividades/assiduidade") < ordem.index("/api/v1/admin/atividades/{atividade_id}")


def test_agregado_nunca_tem_texto_de_justificativa():
    """O agregado é o que vai para o PDF: só contagens (§6.8). O texto só no detalhe da tela."""
    from src.api.v1.admin import atividades_assiduidade as mod

    for modelo in (mod.AssiduidadeResponse, mod.LinhaAssiduidade, mod.Numeros):
        assert "justificativa" not in modelo.model_fields, modelo
    assert "justificativa" in mod.ItemDetalheResponse.model_fields
