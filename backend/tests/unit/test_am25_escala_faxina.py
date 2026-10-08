"""AM-25 — Escala de faxina: regras puras do planejador, guards, plano e migração (sem banco).

O comportamento HTTP com Postgres real (rascunho invisível ao médium, publicar e convocar,
republicar com diff, idempotência, concorrência, atualizar convocações só no futuro, isolamento
entre terreiros, plano e chave do piloto) está em tests/integration_pg/test_am25_escala_faxina.py.
"""
import importlib.util
import uuid
from datetime import date, datetime, time, timezone
from pathlib import Path

import pytest

from src.core.errors import ValidationError
from src.models import PermissionFeature
from src.models import atividades as modelos
from src.services import escala_planos as svc
from src.services.escala_planos import DiaPlano, Publicado

BACKEND_DIR = Path(__file__).resolve().parents[2]
G1, G2, G3, G4 = (uuid.UUID(int=i) for i in (1, 2, 3, 4))
NOVE = time(9, 0)
DOZE = time(12, 0)


def _dia(d: date, g: uuid.UUID, hi: time = NOVE, hf: time | None = DOZE) -> DiaPlano:
    return DiaPlano(d, g, hi, hf)


def _pub(d: date, g: uuid.UUID, hi: time = NOVE, hf: time | None = DOZE, **kw) -> Publicado:
    return Publicado(d, g, kw.pop("atividade_id", uuid.uuid4()), hi, hf, **kw)


def _resumo(dias) -> dict:
    out: dict = {}
    for d in dias:
        out.setdefault(d.grupo_id, []).append(d.data.day)
    return out


# ── Migração e modelo ───────────────────────────────────────────────────────


def _migracao(nome: str):
    spec = importlib.util.spec_from_file_location(nome, BACKEND_DIR / f"alembic/versions/{nome}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_migracao_080_depois_da_079_com_os_status_do_modelo():
    mig = _migracao("080_escala_planos")
    assert (mig.revision, mig.down_revision) == ("080_escala_planos", "079_presenca")
    assert mig.STATUS == modelos.STATUS_PLANO == ("rascunho", "publicado")


def test_unicidades_do_plano_e_do_dia():
    plano = {c.name for c in modelos.EscalaPlano.__table__.constraints}
    dias = {c.name for c in modelos.EscalaPlanoDia.__table__.constraints}
    assert "uq_escala_planos_tenant_tipo_mes" in plano
    assert "uq_escala_plano_dias_plano_data_grupo" in dias
    fk = next(iter(modelos.EscalaPlanoDia.__table__.c.atividade_id.foreign_keys))
    assert (fk.column.table.name, fk.ondelete) == ("atividades", "SET NULL")
    # Sem ciclo de FKs: a atividade só guarda o id do dia como referência.
    assert not modelos.Atividade.__table__.c.escala_plano_dia_id.foreign_keys


# ── Mês e datas ─────────────────────────────────────────────────────────────


def test_mes_de_texto():
    assert svc.mes_de_texto("2026-11") == date(2026, 11, 1)
    for ruim in ("2026-13", "2026-1", "26-11", "novembro", "", "1999-12"):
        with pytest.raises(ValidationError):
            svc.mes_de_texto(ruim)
    assert svc.mes_anterior(date(2026, 1, 1)) == date(2025, 12, 1)
    assert svc.mes_texto(date(2026, 3, 1)) == "2026-03"


def test_dia_da_semana_como_no_navegador_e_ocorrencia():
    assert svc.dia_semana(date(2026, 11, 1)) == 0  # domingo
    assert svc.dia_semana(date(2026, 11, 7)) == 6  # sábado
    assert [svc.ocorrencia(date(2026, 10, d)) for d in (3, 10, 17, 24, 31)] == [1, 2, 3, 4, 5]
    assert svc.enesimo_dia_semana(date(2026, 11, 1), 6, 1) == date(2026, 11, 7)
    assert svc.enesimo_dia_semana(date(2026, 11, 1), 6, 4) == date(2026, 11, 28)
    assert svc.enesimo_dia_semana(date(2026, 11, 1), 6, 5) is None  # novembro/2026 tem 4 sábados


def test_hora_fim_padrao_pela_duracao_no_mesmo_dia():
    assert svc.hora_fim_padrao(NOVE, 180) == DOZE
    assert svc.hora_fim_padrao(NOVE, None) is None
    assert svc.hora_fim_padrao(time(22, 0), 180) is None  # passaria da meia-noite


def test_inicio_e_horario_em_brasilia():
    inicio, fim = svc.inicio_fim(date(2026, 11, 7), NOVE, DOZE)
    assert inicio.astimezone(timezone.utc) == datetime(2026, 11, 7, 12, 0, tzinfo=timezone.utc)
    assert svc.horario_local(inicio, fim) == (NOVE, DOZE)
    assert svc.horario_local(inicio, None) == (NOVE, None)


def test_titulo_e_ordem_natural():
    assert svc.titulo_da_atividade("Faxina", "G2") == "Faxina · G2"
    assert len(svc.titulo_da_atividade("x" * 100, "y" * 60)) == modelos.TITULO_MAX
    assert sorted(["G10", "G2", "g1", "Ogãs"], key=svc.ordem_natural) == ["g1", "G2", "G10", "Ogãs"]


# ── Copiar do mês anterior ──────────────────────────────────────────────────


def test_copiar_pela_ordem_do_sabado_sem_o_quinto():
    # Outubro/2026 tem 5 sábados (3, 10, 17, 24, 31); novembro só 4 (7, 14, 21, 28).
    outubro = [
        _dia(date(2026, 10, 3), G1),
        _dia(date(2026, 10, 10), G2),
        _dia(date(2026, 10, 17), G1, time(8, 0), time(11, 0)),
        _dia(date(2026, 10, 24), G2),
        _dia(date(2026, 10, 31), G3),
    ]
    novembro, descartados = svc.copiar_por_dia_da_semana(outubro, date(2026, 11, 1))
    assert _resumo(novembro) == {G1: [7, 21], G2: [14, 28]}
    assert descartados == 1  # o G3 do 5º sábado não cabe
    assert novembro[2] == _dia(date(2026, 11, 21), G1, time(8, 0), time(11, 0))  # horário vai junto


def test_copiar_para_mes_com_cinco_ocorrencias_e_varios_dias_da_semana():
    # Novembro/2026: domingos 1, 8, 15, 22, 29 (5) → dezembro: domingos 6, 13, 20, 27 (4).
    origem = [_dia(date(2026, 11, 29), G1), _dia(date(2026, 11, 4), G2), _dia(date(2026, 11, 4), G3)]
    dez, descartados = svc.copiar_por_dia_da_semana(origem, date(2026, 12, 1))
    assert descartados == 1
    # 1ª quarta de novembro (4) → 1ª quarta de dezembro (2), com os dois grupos.
    assert [(d.data, d.grupo_id) for d in dez] == [(date(2026, 12, 2), G2), (date(2026, 12, 2), G3)]
    # Para um mês com 5 sábados (janeiro/2027: 2, 9, 16, 23, 30) o 5º sábado da origem entra.
    out, desc = svc.copiar_por_dia_da_semana([_dia(date(2026, 10, 31), G3)], date(2027, 1, 1))
    assert (desc, [d.data for d in out]) == (0, [date(2027, 1, 30)])


# ── Girar grupos ────────────────────────────────────────────────────────────


def test_girar_tres_grupos_como_no_cartao():
    dias = [_dia(date(2026, 11, 7), G1), _dia(date(2026, 11, 14), G2), _dia(date(2026, 11, 21), G3)]
    girado = svc.girar_grupos(dias, [G1, G2, G3])
    # G1 pega os dias do G3, G2 os do G1 e G3 os do G2.
    assert _resumo(girado) == {G2: [7], G3: [14], G1: [21]}


def test_girar_n_grupos_mantem_quem_esta_fora_da_ordem_e_dias_com_dois_grupos():
    dias = [
        _dia(date(2026, 11, 7), G1),
        _dia(date(2026, 11, 7), G4),  # G4 está fora da ordem: não muda
        _dia(date(2026, 11, 14), G2),
        _dia(date(2026, 11, 14), G1),  # dia com dois grupos continua com dois grupos
    ]
    girado = svc.girar_grupos(dias, [G1, G2])
    assert sorted((d.data.day, d.grupo_id.int) for d in girado) == [(7, 2), (7, 4), (14, 1), (14, 2)]
    # Girar N vezes com N grupos volta ao começo.
    tres = [_dia(date(2026, 11, d), g) for d, g in ((7, G1), (14, G2), (21, G3))]
    volta = tres
    for _ in range(3):
        volta = svc.girar_grupos(volta, [G1, G2, G3])
    assert volta == svc.ordenar(tres)
    assert svc.girar_grupos(tres, [G1]) == svc.ordenar(tres)  # um grupo só: nada muda


# ── Distribuir em ciclo ─────────────────────────────────────────────────────


def test_distribuir_aos_sabados_em_ciclo():
    dias = svc.distribuir_em_ciclo(date(2026, 11, 1), [6], [G1, G2, G3], NOVE, DOZE)
    assert [(d.data.day, d.grupo_id) for d in dias] == [(7, G1), (14, G2), (21, G3), (28, G1)]
    assert all((d.hora_inicio, d.hora_fim) == (NOVE, DOZE) for d in dias)


def test_distribuir_em_varios_dias_da_semana_na_ordem_das_datas():
    dias = svc.distribuir_em_ciclo(date(2026, 11, 1), [0, 6], [G2, G1], NOVE)
    assert [(d.data.day, d.grupo_id) for d in dias][:4] == [(1, G2), (7, G1), (8, G2), (14, G1)]
    assert len(dias) == 9  # 5 domingos + 4 sábados
    assert svc.distribuir_em_ciclo(date(2026, 11, 1), [6], [], NOVE) == []
    with pytest.raises(ValidationError):
        svc.distribuir_em_ciclo(date(2026, 11, 1), [7], [G1], NOVE)


# ── Diff da publicação ──────────────────────────────────────────────────────

HOJE = date(2026, 11, 10)
D14, D21, D28 = date(2026, 11, 14), date(2026, 11, 21), date(2026, 11, 28)


def test_primeira_publicacao_cria_tudo_que_nao_passou():
    rascunho = [_dia(date(2026, 11, 7), G1), _dia(D14, G2), _dia(D14, G3), _dia(D21, G1)]
    diff = svc.diff_publicacao([], rascunho, hoje=HOJE)
    assert [(d.data, d.grupo_id) for d in diff.criar] == [(D14, G2), (D14, G3), (D21, G1)]
    assert diff.ignorados_passado == 1  # o dia 7 já passou: não é publicado
    assert diff.tem_mudancas


def test_republicar_sem_mudanca_nao_faz_nada():
    a, b = uuid.uuid4(), uuid.uuid4()
    pub = [_pub(D14, G1, atividade_id=a), _pub(D21, G2, atividade_id=b)]
    diff = svc.diff_publicacao(pub, [_dia(D14, G1), _dia(D21, G2)], hoje=HOJE)
    assert not diff.tem_mudancas and len(diff.sem_mudanca) == 2


def test_dia_removido_cancela_e_dia_novo_cria():
    p14 = _pub(D14, G1)
    diff = svc.diff_publicacao([p14, _pub(D21, G2)], [_dia(D21, G2), _dia(D28, G3)], hoje=HOJE)
    assert diff.cancelar == [p14]
    assert [(d.data, d.grupo_id) for d in diff.criar] == [(D28, G3)]
    assert diff.trocar == []


def test_grupo_trocado_no_dia_reaproveita_a_atividade():
    p14 = _pub(D14, G1)
    diff = svc.diff_publicacao([p14], [_dia(D14, G2, time(8, 0), DOZE)], hoje=HOJE)
    assert len(diff.trocar) == 1
    troca = diff.trocar[0]
    assert (troca.anterior, troca.novo.grupo_id, troca.novo.hora_inicio) == (p14, G2, time(8, 0))
    assert diff.criar == [] and diff.cancelar == []


def test_varios_grupos_no_dia_pareiam_na_ordem_e_sobra_vira_criar_ou_cancelar():
    p1, p2 = _pub(D14, G1), _pub(D14, G2)
    # 14: G1+G2 → G3 sozinho: G1→G3 (troca), G2 cancelado.
    diff = svc.diff_publicacao([p1, p2], [_dia(D14, G3)], hoje=HOJE, ordem=[G1, G2, G3])
    assert [(t.anterior.grupo_id, t.novo.grupo_id) for t in diff.trocar] == [(G1, G3)]
    assert diff.cancelar == [p2]
    # 14: G1 → G2+G3: G1→G2 (troca), G3 criado.
    diff = svc.diff_publicacao([p1], [_dia(D14, G2), _dia(D14, G3)], hoje=HOJE, ordem=[G1, G2, G3])
    assert [(t.anterior.grupo_id, t.novo.grupo_id) for t in diff.trocar] == [(G1, G2)]
    assert [d.grupo_id for d in diff.criar] == [G3]
    # Grupo que continua no dia não entra no pareamento.
    diff = svc.diff_publicacao([p1, p2], [_dia(D14, G1), _dia(D14, G3)], hoje=HOJE, ordem=[G1, G2, G3])
    assert [(t.anterior.grupo_id, t.novo.grupo_id) for t in diff.trocar] == [(G2, G3)]
    assert diff.sem_mudanca == [p1]


def test_horario_mudado_reagenda():
    p = _pub(D14, G1)
    diff = svc.diff_publicacao([p], [_dia(D14, G1, time(8, 0), time(11, 0))], hoje=HOJE)
    assert diff.reagendar == [(p, _dia(D14, G1, time(8, 0), time(11, 0)))]


def test_passado_nao_muda():
    ontem = date(2026, 11, 7)
    passado = _pub(ontem, G1)
    # Tirar o dia 7, pôr outro grupo no dia 7 e mudar o horário de um dia passado: nada vale.
    diff = svc.diff_publicacao([passado], [_dia(ontem, G2, time(7, 0))], hoje=HOJE)
    assert not diff.tem_mudancas and diff.sem_mudanca == [passado]
    assert diff.ignorados_passado == 2
    diff = svc.diff_publicacao([passado], [_dia(ontem, G1, time(7, 0))], hoje=HOJE)
    assert not diff.tem_mudancas and diff.ignorados_passado == 1


def test_chamada_encerrada_nao_e_trocada_nem_cancelada():
    ontem = date(2026, 11, 7)
    passado, encerrada = _pub(ontem, G1), _pub(D14, G2, encerrada=True)
    diff = svc.diff_publicacao([passado, encerrada], [_dia(D14, G3)], hoje=HOJE)
    assert diff.trocar == [] and diff.cancelar == []
    assert [(d.data, d.grupo_id) for d in diff.criar] == [(D14, G3)]
    assert set(diff.sem_mudanca) == {passado, encerrada}
    assert diff.ignorados_passado == 2


def test_atividade_cancelada_a_mao_nao_e_reaproveitada():
    cancelada = _pub(D14, G1, cancelada=True)
    diff = svc.diff_publicacao([cancelada], [_dia(D14, G2)], hoje=HOJE)
    assert diff.cancelar == [cancelada]  # só sai do plano
    assert [d.grupo_id for d in diff.criar] == [G2]
    assert diff.trocar == []


# ── Gancho do AM-15 ─────────────────────────────────────────────────────────


async def test_gancho_dos_avisos_existe_e_nao_envia_nada():
    res = svc.ResultadoPublicacao(convocados=[(uuid.uuid4(), uuid.uuid4())])
    assert await svc.escala_publicada(None, uuid.uuid4(), uuid.uuid4(), res) is None


# ── Guards, plano e rotas ───────────────────────────────────────────────────


def _guards(dependencies) -> set:
    out = set()
    for d in dependencies:
        cells = [c.cell_contents for c in (getattr(d.dependency, "__closure__", None) or ())]
        feats = [c for c in cells if isinstance(c, PermissionFeature)]
        acoes = [c for c in cells if isinstance(c, str)]
        if feats:
            out.add((frozenset(feats), acoes[0] if acoes else None))
    return out


def test_rotas_do_planejador_por_grupo_e_plano():
    from src.api.v1.admin.escala_planos import router
    from tests.plan_gate_helpers import plan_gate_features

    base = "/api/v1/admin/escala-planos/{tipo_id}/{mes}"
    assert router.prefix == "/api/v1/admin/escala-planos"
    assert plan_gate_features(router) == ["area_medium", "escalas"]
    e = frozenset({PermissionFeature.ESCALAS})
    esperado = {
        ("GET", base): {(e, "view")},
        ("PUT", base): {(e, "edit")},
        ("POST", f"{base}/copiar-mes-anterior"): {(e, "edit")},
        ("POST", f"{base}/girar-grupos"): {(e, "edit")},
        ("POST", f"{base}/distribuir"): {(e, "edit")},
        ("POST", f"{base}/publicar"): {(e, "insert"), (e, "edit")},
        ("POST", f"{base}/atualizar-convocacoes"): {(e, "insert"), (e, "edit")},
    }
    vistos = {(m, r.path): _guards(r.dependencies) for r in router.routes for m in r.methods}
    assert vistos == esperado


def test_planejador_registrado_no_admin_router():
    from src.main import create_app

    caminhos = set(create_app().openapi()["paths"])
    assert "/api/v1/admin/escala-planos/{tipo_id}/{mes}/publicar" in caminhos


def test_auditor_de_tenant_sem_violacao_no_planejador():
    spec = importlib.util.spec_from_file_location("audit_tenant_am25", BACKEND_DIR / "scripts/audit_tenant_isolation.py")
    audit = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(audit)
    info = audit.discover_model_info()
    violacoes, _ = audit.find_unvalidated_fks(
        audit.ADMIN_DIR / "escala_planos.py", info, audit.build_callee_index(info.tenant_models)
    )
    assert violacoes == []
