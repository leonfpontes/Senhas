"""Testes da ampliação de 2026-10-05 do auditor de isolamento de tenant
(scripts/audit_tenant_isolation.py): repositories/services (modo "scoped"), rotas públicas
(modo "public"), FKs recebidos na requisição (checagem "fk") e chamadores de
RESOLVED_ID_QUERIES.

Snippets sintéticos em tmp_path + testes de mutação em arquivos reais: remover uma validação
de propósito tem que fazer o auditor falhar.
"""
import importlib.util
import re
import textwrap
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[2]
SCRIPT = BACKEND_DIR / "scripts" / "audit_tenant_isolation.py"

_spec = importlib.util.spec_from_file_location("audit_tenant_isolation_ampliado", SCRIPT)
audit = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(audit)

TENANT_MODELS = {"Gira", "Ticket", "GiraTimeSlot", "Item", "Grupo", "User", "Membership"}

HEADER = """\
from sqlalchemy import select, update, delete, func, and_
from src.models import Gira, Ticket, Tenant, GiraTimeSlot, Item, Grupo, User, Membership
"""


def _queries(tmp_path, body, mode, exempt=None, name="fake.py"):
    path = tmp_path / name
    path.write_text(HEADER + textwrap.dedent(body))
    return audit.find_unfiltered_queries(
        path, TENANT_MODELS, exempt_queries=exempt if exempt is not None else {}, mode=mode
    )


# ─── Modo scoped (repositories/services) ────────────────────────────────────────────


def test_scoped_metodo_que_filtra_pelo_parametro_de_tenant_passa(tmp_path):
    violations, checked = _queries(
        tmp_path,
        """
        class GiraRepo:
            async def get(self, gira_id, tenant_id):
                stmt = select(Gira).where(Gira.id == gira_id, Gira.tenant_id == tenant_id)
                return (await self.db.execute(stmt)).scalar_one_or_none()
        """,
        "scoped",
    )
    assert checked == 1 and violations == []


def test_scoped_parametro_de_tenant_ignorado_falha_mesmo_com_outro_valor_de_tenant(tmp_path):
    """Recebeu tenant_id mas filtrou por outra coisa "com cara de tenant": no modo admin
    passaria; no scoped o valor precisa derivar do parâmetro."""
    violations, _ = _queries(
        tmp_path,
        """
        class GiraRepo:
            async def get(self, gira_id, tenant_id, user):
                stmt = select(Gira).where(Gira.id == gira_id, Gira.tenant_id == user.tenant_id)
                return await self.db.execute(stmt)
        """,
        "scoped",
    )
    assert [(v[1], v[2]) for v in violations] == [("GiraRepo.get", "Gira")]


def test_scoped_valor_derivado_do_parametro_passa(tmp_path):
    violations, _ = _queries(
        tmp_path,
        """
        async def listar(db, tenant):
            tid = tenant.id
            return await db.execute(select(Ticket).where(Ticket.tenant_id == tid))
        """,
        "scoped",
    )
    assert violations == []


def test_scoped_delegacao_para_helper_que_recebe_o_tenant_passa(tmp_path):
    violations, _ = _queries(
        tmp_path,
        """
        class Repo:
            def _conds(self, tenant_id):
                return [Ticket.tenant_id == tenant_id]

            async def total(self, tenant_id):
                conditions = self._conds(tenant_id)
                return await self.db.execute(select(func.count(Ticket.id)).where(*conditions))
        """,
        "scoped",
    )
    assert violations == []


def test_scoped_sem_parametro_de_tenant_e_sem_filtro_exige_excecao(tmp_path):
    body = """
    class PlatformRepo:
        async def list_all(self):
            return await self.db.execute(select(Gira))
    """
    violations, _ = _queries(tmp_path, body, "scoped")
    assert [(v[1], v[2]) for v in violations] == [("PlatformRepo.list_all", "Gira")]
    key = (audit.rel_key(tmp_path / "fake.py"), "PlatformRepo.list_all")
    violations, checked = _queries(tmp_path, body, "scoped", exempt={key: "visão de plataforma"})
    assert checked == 1 and violations == []


def test_scoped_self_model_de_repository_generico_e_auditado(tmp_path):
    violations, _ = _queries(
        tmp_path,
        """
        class BaseRepository:
            def __init__(self, db, model):
                self.db = db
                self.model = model

            async def ok(self, model_id, tenant_id):
                return await self.db.execute(
                    select(self.model).where(self.model.id == model_id, self.model.tenant_id == tenant_id)
                )

            async def vaza(self, model_id, tenant_id):
                return await self.db.execute(select(self.model).where(self.model.id == model_id))
        """,
        "scoped",
    )
    assert [(v[1], v[2]) for v in violations] == [("BaseRepository.vaza", "self.model")]


def test_scoped_self_model_de_modelo_sem_tenant_nao_e_auditado(tmp_path):
    violations, checked = _queries(
        tmp_path,
        """
        class TenantRepository(BaseRepository):
            def __init__(self, db):
                super().__init__(db, Tenant)

            async def get(self, tenant_id):
                return await self.db.execute(select(self.model).where(self.model.id == tenant_id))
        """,
        "scoped",
    )
    assert checked == 0 and violations == []


def test_scoped_session_get_exige_comparacao_com_o_parametro(tmp_path):
    violations, checked = _queries(
        tmp_path,
        """
        async def ok(db, gira_id, tenant_id):
            gira = await db.get(Gira, gira_id)
            if gira is None or gira.tenant_id != tenant_id:
                return None
            return gira

        async def vaza(db, gira_id, tenant_id, user):
            gira = await db.get(Gira, gira_id)
            if gira.tenant_id != user.tenant_id:
                return None
            return gira
        """,
        "scoped",
    )
    assert checked == 2
    assert [(v[1], v[2]) for v in violations] == [("vaza", "Gira")]


# ─── Modo public ────────────────────────────────────────────────────────────────────


def test_public_busca_raiz_por_id_da_requisicao_passa(tmp_path):
    violations, _ = _queries(
        tmp_path,
        """
        import uuid as _uuid

        async def cancelar(session, ticket_id: str):
            ticket_uuid = _uuid.UUID(ticket_id)
            return await session.execute(select(Ticket).where(Ticket.id == ticket_uuid))
        """,
        "public",
    )
    assert violations == []


def test_public_query_filha_por_objeto_carregado_sem_tenant_falha(tmp_path):
    violations, _ = _queries(
        tmp_path,
        """
        async def confirmar(session, ticket_id):
            ticket = (await session.execute(select(Ticket).where(Ticket.id == ticket_id))).scalar_one()
            gira = (await session.execute(select(Gira).where(Gira.id == ticket.gira_id))).scalar_one()
            return gira
        """,
        "public",
    )
    assert [(v[1], v[2]) for v in violations] == [("confirmar", "Gira")]


def test_public_query_filha_com_tenant_do_pai_passa(tmp_path):
    violations, _ = _queries(
        tmp_path,
        """
        async def confirmar(session, ticket_id):
            ticket = (await session.execute(select(Ticket).where(Ticket.id == ticket_id))).scalar_one()
            return await session.execute(
                select(Gira).where(Gira.id == ticket.gira_id, Gira.tenant_id == ticket.tenant_id)
            )
        """,
        "public",
    )
    assert violations == []


def test_public_listagem_por_coluna_que_nao_e_chave_raiz_falha(tmp_path):
    """Gira.id é chave raiz; Ticket.gira_id não — listar tickets de uma gira por id da URL
    sem tenant continua sendo violação."""
    violations, _ = _queries(
        tmp_path,
        """
        async def tickets(session, gira_id):
            return await session.execute(select(Ticket).where(Ticket.gira_id == gira_id))
        """,
        "public",
    )
    assert len(violations) == 1


# ─── Chamadores de RESOLVED_ID_QUERIES ──────────────────────────────────────────────


def test_resolved_id_chamador_novo_quebra_o_auditor(tmp_path):
    (tmp_path / "repo.py").write_text(
        "class Repo:\n    async def list_messages(self, conv_id):\n        ...\n"
    )
    (tmp_path / "a.py").write_text("async def revisado(repo):\n    await repo.list_messages(1)\n")
    entries = {("repo.py", "Repo.list_messages"): {"motivo": "x" * 20, "chamadores": [("a.py", "revisado")]}}
    assert audit.check_resolved_id_callers(entries, tmp_path) == []

    (tmp_path / "b.py").write_text("async def novo(repo):\n    await repo.list_messages(2)\n")
    problems = audit.check_resolved_id_callers(entries, tmp_path)
    assert len(problems) == 1 and "b.py:novo" in problems[0]


# ─── Checagem de FK recebido na requisição ──────────────────────────────────────────

MODELS_SRC = """
class Gira(Base):
    __tablename__ = "giras"
    tenant_id = Column(UUID)

class GiraTimeSlot(Base):
    __tablename__ = "gira_time_slots"
    tenant_id = Column(UUID)
    gira_id = Column(UUID, ForeignKey("giras.id"))

class Grupo(Base):
    __tablename__ = "grupos"
    tenant_id = Column(UUID)

class Item(Base):
    __tablename__ = "itens"
    tenant_id = Column(UUID)
    grupo_id = Column(UUID, ForeignKey("grupos.id"))

class User(Base):
    __tablename__ = "users"
    tenant_id = Column(UUID)

class Membership(Base):
    __tablename__ = "memberships"
    tenant_id = Column(UUID)
    user_id = Column(UUID, ForeignKey("users.id"))
    pais_id = Column(UUID, ForeignKey("paises.id"))  # tabela sem tenant: não rastreada
"""

FK_HEADER = """\
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select
from src.models import Gira, GiraTimeSlot, Grupo, Item, User, Membership

router = APIRouter()


class ItemCreate(BaseModel):
    nome: str
    grupo_id: UUID | None = None


class MembrosRequest(BaseModel):
    user_ids: list[UUID]
    pais_id: UUID | None = None


async def _validar_grupo_do_tenant(db, tenant_id, grupo_id):
    if grupo_id is None:
        return
    found = await db.execute(select(Grupo.id).where(Grupo.id == grupo_id, Grupo.tenant_id == tenant_id))
    if found.scalar_one_or_none() is None:
        raise HTTPException(422)
"""


@pytest.fixture
def model_info(tmp_path):
    models = tmp_path / "models"
    models.mkdir()
    (models / "m.py").write_text(MODELS_SRC)
    return audit.discover_model_info(models)


def _fks(tmp_path, model_info, body, callees=None, exempt=None):
    path = tmp_path / "fake_admin.py"
    path.write_text(FK_HEADER + textwrap.dedent(body))
    report: list = []
    violations, checked = audit.find_unvalidated_fks(
        path, model_info, callees or audit.CalleeIndex(), exempt=exempt or {}, report=report
    )
    return violations, checked, report


def test_fk_model_info_infere_colunas_para_tabelas_multi_tenant(model_info):
    cols = model_info.tenant_fk_columns()
    assert cols == {"gira_id": {"giras"}, "grupo_id": {"grupos"}, "user_id": {"users"}}


def test_fk_construtor_com_campo_do_body_sem_validacao_falha(tmp_path, model_info):
    violations, checked, _ = _fks(
        tmp_path, model_info,
        """
        @router.post("/itens")
        async def create_item(body: ItemCreate, current_user=Depends(get_current_user), db=Depends(get_db)):
            item = Item(tenant_id=current_user.tenant_id, nome=body.nome, grupo_id=body.grupo_id)
            db.add(item)
        """,
    )
    assert checked == 1
    assert [(v[1], v[2], v[3]) for v in violations] == [("create_item", "body.grupo_id", "grupo_id")]


def test_fk_validador_do_tenant_antes_do_sink_passa(tmp_path, model_info):
    violations, checked, _ = _fks(
        tmp_path, model_info,
        """
        @router.post("/itens")
        async def create_item(body: ItemCreate, current_user=Depends(get_current_user), db=Depends(get_db)):
            await _validar_grupo_do_tenant(db, current_user.tenant_id, body.grupo_id)
            db.add(Item(tenant_id=current_user.tenant_id, nome=body.nome, grupo_id=body.grupo_id))
        """,
    )
    assert checked == 1 and violations == []


def test_fk_validador_depois_do_sink_nao_conta(tmp_path, model_info):
    violations, _, _ = _fks(
        tmp_path, model_info,
        """
        @router.post("/itens")
        async def create_item(body: ItemCreate, current_user=Depends(get_current_user), db=Depends(get_db)):
            db.add(Item(tenant_id=current_user.tenant_id, nome=body.nome, grupo_id=body.grupo_id))
            await _validar_grupo_do_tenant(db, current_user.tenant_id, body.grupo_id)
        """,
    )
    assert len(violations) == 1


def test_fk_select_filtrado_por_tenant_e_pelo_id_passa(tmp_path, model_info):
    violations, _, _ = _fks(
        tmp_path, model_info,
        """
        @router.post("/itens")
        async def create_item(body: ItemCreate, current_user=Depends(get_current_user), db=Depends(get_db)):
            grupo = (await db.execute(
                select(Grupo).where(Grupo.id == body.grupo_id, Grupo.tenant_id == current_user.tenant_id)
            )).scalar_one_or_none()
            db.add(Item(tenant_id=current_user.tenant_id, nome=body.nome, grupo_id=body.grupo_id))
        """,
    )
    assert violations == []


def test_fk_select_sem_tenant_ou_sem_comparar_o_id_nao_conta(tmp_path, model_info):
    violations, _, _ = _fks(
        tmp_path, model_info,
        """
        @router.post("/itens")
        async def sem_tenant(body: ItemCreate, current_user=Depends(get_current_user), db=Depends(get_db)):
            await db.execute(select(Grupo).where(Grupo.id == body.grupo_id))
            db.add(Item(tenant_id=current_user.tenant_id, grupo_id=body.grupo_id))

        @router.post("/itens2")
        async def sem_id(body: ItemCreate, current_user=Depends(get_current_user), db=Depends(get_db)):
            # filtra por tenant, mas pela coluna FK de OUTRA tabela — não prova que o grupo é do tenant
            await db.execute(select(Item).where(Item.grupo_id == body.grupo_id, Item.tenant_id == current_user.tenant_id))
            db.add(Item(tenant_id=current_user.tenant_id, grupo_id=body.grupo_id))
        """,
    )
    assert sorted(v[1] for v in violations) == ["sem_id", "sem_tenant"]


def test_fk_setattr_em_laco_sobre_model_dump_e_sink(tmp_path, model_info):
    violations, _, _ = _fks(
        tmp_path, model_info,
        """
        @router.put("/itens/{item_id}")
        async def update_item(item_id: UUID, body: ItemCreate, current_user=Depends(get_current_user), db=Depends(get_db)):
            item = (await db.execute(select(Item).where(Item.id == item_id, Item.tenant_id == current_user.tenant_id))).scalar_one()
            for field, value in body.model_dump(exclude_none=True).items():
                setattr(item, field, value)
        """,
    )
    assert [(v[1], v[2]) for v in violations] == [("update_item", "body.grupo_id")]


def test_fk_atribuicao_direta_e_sink(tmp_path, model_info):
    violations, _, _ = _fks(
        tmp_path, model_info,
        """
        @router.put("/itens/{item_id}/grupo")
        async def mover(item_id: UUID, body: ItemCreate, current_user=Depends(get_current_user), db=Depends(get_db)):
            item = (await db.execute(select(Item).where(Item.id == item_id, Item.tenant_id == current_user.tenant_id))).scalar_one()
            if body.grupo_id:
                item.grupo_id = body.grupo_id
        """,
    )
    assert [(v[1], v[2]) for v in violations] == [("mover", "body.grupo_id")]


def test_fk_chamada_de_escrita_com_kwargs_do_body_e_sink(tmp_path, model_info):
    violations, _, _ = _fks(
        tmp_path, model_info,
        """
        @router.put("/itens/{item_id}")
        async def update_item(item_id: UUID, body: ItemCreate, current_user=Depends(get_current_user), db=Depends(get_db)):
            data = body.model_dump(exclude_unset=True)
            await repo.update_item(item_id, current_user.tenant_id, **data)

        @router.put("/itens2/{item_id}")
        async def update_item_ok(item_id: UUID, body: ItemCreate, current_user=Depends(get_current_user), db=Depends(get_db)):
            data = body.model_dump(exclude_unset=True)
            await _validar_grupo_do_tenant(db, current_user.tenant_id, data.get("grupo_id"))
            await repo.update_item(item_id, current_user.tenant_id, **data)
        """,
    )
    assert [(v[1], v[2]) for v in violations] == [("update_item", "body.grupo_id")]


def test_fk_parametro_de_path_vai_para_get_or_create(tmp_path, model_info):
    """get_or_create_* é escrita (apesar do prefixo get) — o id do path precisa de busca antes."""
    violations, _, _ = _fks(
        tmp_path, model_info,
        """
        @router.post("/giras/{gira_id}/slots")
        async def criar_slot(gira_id: UUID, current_user=Depends(get_current_user), db=Depends(get_db)):
            await repo.get_or_create_for_gira(tenant_id=current_user.tenant_id, gira_id=gira_id)

        @router.post("/giras/{gira_id}/slots2")
        async def criar_slot_ok(gira_id: UUID, current_user=Depends(get_current_user), db=Depends(get_db)):
            gira = await gira_repo.get_by_id(gira_id, current_user.tenant_id)
            await repo.get_or_create_for_gira(tenant_id=current_user.tenant_id, gira_id=gira_id)
        """,
    )
    assert [(v[1], v[2]) for v in violations] == [("criar_slot", "gira_id")]


def test_fk_lista_de_ids_em_laco_e_rastreada(tmp_path, model_info):
    violations, _, _ = _fks(
        tmp_path, model_info,
        """
        @router.post("/grupos/{grupo_id}/membros")
        async def membros(body: MembrosRequest, current_user=Depends(get_current_user), db=Depends(get_db)):
            for uid in body.user_ids:
                db.add(Membership(tenant_id=current_user.tenant_id, user_id=uid, pais_id=body.pais_id))

        @router.post("/grupos/{grupo_id}/membros2")
        async def membros_ok(body: MembrosRequest, current_user=Depends(get_current_user), db=Depends(get_db)):
            users = (await db.execute(
                select(User).where(User.id.in_(body.user_ids), User.tenant_id == current_user.tenant_id)
            )).scalars().all()
            for uid in body.user_ids:
                db.add(Membership(tenant_id=current_user.tenant_id, user_id=uid))
        """,
    )
    # pais_id aponta para tabela sem tenant_id: não é rastreado
    assert [(v[1], v[2], v[3]) for v in violations] == [("membros", "body.user_ids", "user_id")]


def test_fk_callee_resolvido_que_valida_o_parametro_passa(tmp_path, model_info):
    repo_dir = tmp_path / "repos"
    repo_dir.mkdir()
    (repo_dir / "r.py").write_text(
        textwrap.dedent(
            """
            from sqlalchemy import select
            from src.models import User, Membership

            class BaseRepository:
                async def get_by_id(self, model_id, tenant_id):
                    return await self.db.execute(
                        select(self.model).where(self.model.id == model_id, self.model.tenant_id == tenant_id)
                    )

            class MembroRepository(BaseRepository):
                async def add_member(self, group_id, user_id, tenant_id):
                    group = await self.get_by_id(group_id, tenant_id)
                    user = await self.db.execute(select(User).where(User.id == user_id, User.tenant_id == tenant_id))
                    self.db.add(Membership(user_id=user_id, tenant_id=tenant_id))

                async def add_sem_validar(self, user_id, tenant_id):
                    existing = await self.get_pagamento(tenant_id, user_id)
                    self.db.add(Membership(user_id=user_id, tenant_id=tenant_id))

                async def get_pagamento(self, tenant_id, user_id):
                    return await self.db.execute(
                        select(Membership).where(Membership.user_id == user_id, Membership.tenant_id == tenant_id)
                    )
            """
        )
    )
    callees = audit.build_callee_index(TENANT_MODELS, (repo_dir,))
    assert callees.method("MembroRepository", "add_member").validated == {"group_id", "user_id"}
    # busca na tabela filha por user_id não valida o usuário
    assert callees.method("MembroRepository", "add_sem_validar").validated == set()

    violations, checked, _ = _fks(
        tmp_path, model_info,
        """
        class AddMember(BaseModel):
            user_id: UUID

        @router.post("/grupos/{group_id}/membros")
        async def add(group_id: UUID, request: AddMember, current_user=Depends(get_current_user), db=Depends(get_db)):
            repo = MembroRepository(db)
            await repo.add_member(group_id=group_id, user_id=request.user_id, tenant_id=current_user.tenant_id)

        @router.post("/membros")
        async def add_ruim(request: AddMember, current_user=Depends(get_current_user), db=Depends(get_db)):
            repo = MembroRepository(db)
            await repo.add_sem_validar(request.user_id, current_user.tenant_id)
        """,
        callees=callees,
    )
    assert [(v[1], v[2]) for v in violations] == [("add_ruim", "request.user_id")]


def test_fk_funcao_que_nao_e_rota_nao_e_auditada(tmp_path, model_info):
    violations, checked, _ = _fks(
        tmp_path, model_info,
        """
        async def _helper(db, tenant_id, gira_id):
            db.add(GiraTimeSlot(tenant_id=tenant_id, gira_id=gira_id))
        """,
    )
    assert checked == 0 and violations == []


def test_fk_excecao_por_campo(tmp_path, model_info):
    body = """
    @router.post("/itens")
    async def create_item(body: ItemCreate, current_user=Depends(get_current_user), db=Depends(get_db)):
        db.add(Item(tenant_id=current_user.tenant_id, grupo_id=body.grupo_id))
    """
    violations, _, _ = _fks(tmp_path, model_info, body, exempt={("fake_admin.py", "create_item", "grupo_id"): "x"})
    assert violations == []


# ─── Exceções e código real ─────────────────────────────────────────────────────────


def test_toda_excecao_ampliada_tem_justificativa():
    for key, reason in {
        **audit.EXEMPT_SCOPED_QUERIES, **audit.EXEMPT_PUBLIC_QUERIES, **audit.EXEMPT_BODY_FKS
    }.items():
        assert isinstance(reason, str) and len(reason.strip()) > 10, key
    for key, entry in audit.RESOLVED_ID_QUERIES.items():
        assert len(entry["motivo"].strip()) > 10 and entry["chamadores"], key


def test_excecoes_apontam_para_funcoes_que_existem():
    """Exceção órfã (função renomeada/apagada) esconderia a função nova de mesmo nome."""
    import ast as _ast

    for file, qualname in [*audit.EXEMPT_SCOPED_QUERIES, *audit.RESOLVED_ID_QUERIES, *audit.EXEMPT_PUBLIC_QUERIES]:
        tree = _ast.parse((audit.SRC_DIR / file).read_text())
        names = {q for q, _f, _c in audit._iter_units(tree)}
        assert qualname in names, (file, qualname)


def _real(rel: str) -> Path:
    return audit.SRC_DIR / rel


def _mutate(rel: str, old: str, new: str) -> str:
    source = _real(rel).read_text()
    assert old in source, f"trecho do teste de mutação não existe mais em {rel} — atualize o teste"
    return source.replace(old, new, 1)


@pytest.mark.parametrize(
    "rel, old, new",
    [
        # BaseRepository.get_by_id — filtro genérico por self.model.tenant_id
        ("repositories/base.py", " & (self.model.tenant_id == tenant_id)", ""),
        # GiraRepository.get_active_giras
        ("repositories/gira_repo.py", "Gira.tenant_id == tenant_id,\n                Gira.is_active == True,", "Gira.is_active == True,"),
        # PermissionGroupRepository.add_member — filtro redundante adicionado nesta ampliação
        ("repositories/permission_group_repo.py", "            & (UserGroupMembership.tenant_id == tenant_id)\n        )\n        existing_result", "        )\n        existing_result"),
        # PermissionService.get_user_effective_permissions — vazamento corrigido nesta ampliação
        ("services/permission_service.py", " & (User.tenant_id == tenant_id)", ""),
    ],
)
def test_mutacao_scoped_remover_filtro_quebra_o_auditor(tmp_path, rel, old, new):
    models = audit.discover_tenant_models()
    baseline, _ = audit.find_unfiltered_queries(_real(rel), models, mode="scoped")
    assert baseline == []
    mutated = _mutate(rel, old, new)
    copy = tmp_path / Path(rel).name
    copy.write_text(mutated)
    # a chave de exceção usa o caminho relativo a src/; a cópia fica fora — sem exceções
    violations, _ = audit.find_unfiltered_queries(copy, models, exempt_queries={}, mode="scoped")
    assert violations, f"auditor não detectou a remoção do filtro em {rel}"


def test_mutacao_public_remover_tenant_do_pai_quebra_o_auditor(tmp_path):
    rel = "api/v1/public/waitlist_confirm.py"
    models = audit.discover_tenant_models()
    baseline, _ = audit.find_unfiltered_queries(_real(rel), models, mode="public")
    assert baseline == []
    copy = tmp_path / "waitlist_confirm.py"
    copy.write_text(_mutate(rel, ", Gira.tenant_id == ticket.tenant_id", ""))
    violations, _ = audit.find_unfiltered_queries(copy, models, exempt_queries={}, mode="public")
    assert [(v[1], v[2]) for v in violations] == [("confirm_waitlist_ticket", "Gira")]


@pytest.fixture(scope="module")
def real_info():
    info = audit.discover_model_info()
    return info, audit.build_callee_index(info.tenant_models)


@pytest.mark.parametrize(
    "filename, old, new, esperado",
    [
        # create_conta sem o validador → categoria_id e conta_bancaria_id de outro tenant
        ("contas_financeiras.py",
         "    await _validar_referencias_do_tenant(\n        db, current_user.tenant_id, body.categoria_id, body.conta_bancaria_id\n    )\n    conta = ContaFinanceira(",
         "    conta = ContaFinanceira(",
         {("create_conta", "body.categoria_id"), ("create_conta", "body.conta_bancaria_id")}),
        # dar_baixa sem o validador
        ("contas_financeiras.py",
         "    await _validar_referencias_do_tenant(\n        db, current_user.tenant_id, conta_bancaria_id=body.conta_bancaria_id\n    )\n",
         "",
         {("dar_baixa", "body.conta_bancaria_id")}),
        # create_item sem _validar_grupo_do_tenant
        ("estoque.py",
         "    await _validar_grupo_do_tenant(db, current_user.tenant_id, body.grupo_id)\n",
         "",
         {("create_item", "body.grupo_id")}),
        # update_item sem _validar_grupo_do_tenant (dados via **update_kwargs)
        ("estoque.py",
         '    await _validar_grupo_do_tenant(db, current_user.tenant_id, update_kwargs.get("grupo_id"))\n',
         "",
         {("update_item", "body.grupo_id")}),
        # create_movimentacao sem a busca do item no tenant
        ("estoque.py",
         "    item = await item_repo.get_by_id(body.item_id, current_user.tenant_id)\n",
         "    item = None\n",
         {("create_movimentacao", "body.item_id")}),
        # registrar_pagamento (mensalidade) sem filtro de tenant na busca do médium
        ("mensalidades.py",
         "            MediumModel.id == mediun_id,\n            MediumModel.tenant_id == current_user.tenant_id,\n",
         "            MediumModel.id == mediun_id,\n",
         {("registrar_pagamento", "mediun_id")}),
        # create_participante sem a busca do curso no tenant
        ("cursos_presenciais.py",
         "    curso = await curso_repo.get_by_id(curso_id, current_user.tenant_id)\n    if not curso:\n        raise NotFoundError(\"CursoPresencial\")\n\n    # Verifica limite",
         "    curso = None\n\n    # Verifica limite",
         {("create_participante", "curso_id")}),
    ],
)
def test_mutacao_fk_remover_validacao_quebra_o_auditor(tmp_path, real_info, filename, old, new, esperado):
    info, callees = real_info
    real = audit.ADMIN_DIR / filename
    baseline, _ = audit.find_unvalidated_fks(real, info, callees)
    assert baseline == []
    source = real.read_text()
    assert old in source, f"trecho do teste de mutação não existe mais em {filename} — atualize o teste"
    copy = tmp_path / filename
    copy.write_text(source.replace(old, new, 1))
    violations, _ = audit.find_unvalidated_fks(copy, info, callees)
    assert {(v[1], v[2]) for v in violations} == esperado


def test_mutacao_fk_repository_que_deixa_de_validar_quebra_o_auditor(tmp_path, real_info):
    """add_member valida grupo e usuário dentro do repository. Se o repository parar de
    filtrar o usuário por tenant, o endpoint add_group_member passa a acusar user_id."""
    info, _ = real_info
    repos = tmp_path / "repos"
    repos.mkdir()
    for path in audit.REPOSITORIES_DIR.glob("*.py"):
        (repos / path.name).write_text(path.read_text())
    target = repos / "permission_group_repo.py"
    src = target.read_text()
    old = "            (User.id == user_id)\n            & (User.tenant_id == tenant_id)\n"
    assert old in src
    target.write_text(src.replace(old, "            (User.id == user_id)\n", 1))
    callees = audit.build_callee_index(info.tenant_models, (repos, audit.SERVICES_DIR))
    violations, _ = audit.find_unvalidated_fks(audit.ADMIN_DIR / "permission_groups.py", info, callees)
    assert {(v[1], v[2]) for v in violations} == {("add_group_member", "request.user_id")}
