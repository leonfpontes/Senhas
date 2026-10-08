"""Jornadas de conta/configurações via HTTP real (Postgres).

- Usuários: grupo USUARIOS vale para operador, sem escalada para admin;
  proteções de auto-exclusão/último admin; reativar respeita o limite.
- Configurações: grupo CONFIGURACOES vale para operador; cores/logo exigem
  tema_personalizado só quando mudam; respostas trazem tenant_nome.
- Sessão: logout-all recusa token de impersonação.
- Plataforma: assinatura mostra a contagem real de usuários ativos e is_bonus.
"""
import pytest

from src.models.permission_groups import PermissionFeature
from src.models.subscriptions import PlanType
from src.models.users import UserRole
from src.security.jwt import create_access_token

from .factories import create_tenant, create_user, grant

SENHA_FORTE = "SenhaForte#2026"


def _novo_usuario(role: str = "operator", email: str | None = None) -> dict:
    import uuid

    return {
        "email": email or f"novo-{uuid.uuid4().hex[:8]}@example.com",
        "username": "Pessoa Nova",
        "password": SENHA_FORTE,
        "role": role,
    }


# ── Usuários ────────────────────────────────────────────────────────────────


async def test_operador_com_grupo_usuarios_cria_operador_mas_nao_admin(client, db):
    tenant = await create_tenant(db, plan=PlanType.PREMIUM)
    operador = await create_user(db, tenant, UserRole.OPERATOR, name="operador")
    await grant(db, operador, tenant, PermissionFeature.USUARIOS, "view", "insert", "edit", "delete")

    ok = await client.post("/api/v1/admin/users", headers=operador.headers, json=_novo_usuario("operator"))
    assert ok.status_code == 201, ok.text

    admin_body = _novo_usuario("admin")
    negado = await client.post("/api/v1/admin/users", headers=operador.headers, json=admin_body)
    assert negado.status_code == 403, negado.text

    # promover o operador recém-criado também é negado
    promover = await client.put(
        f"/api/v1/admin/users/{ok.json()['id']}", headers=operador.headers, json={"role": "admin"}
    )
    assert promover.status_code == 403, promover.text


async def test_senha_fraca_e_super_admin_sao_recusados(client, db):
    tenant = await create_tenant(db, plan=PlanType.PREMIUM)
    admin = await create_user(db, tenant, UserRole.ADMIN)

    fraca = await client.post(
        "/api/v1/admin/users", headers=admin.headers, json={**_novo_usuario(), "password": "curta"}
    )
    assert fraca.status_code == 422, fraca.text

    super_admin = await client.post("/api/v1/admin/users", headers=admin.headers, json=_novo_usuario("super_admin"))
    assert super_admin.status_code == 422, super_admin.text


async def test_admin_nao_se_exclui_nem_se_rebaixa_e_ultimo_admin_fica(client, db):
    tenant = await create_tenant(db, plan=PlanType.PREMIUM)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    uid = admin.user.id

    assert (await client.delete(f"/api/v1/admin/users/{uid}", headers=admin.headers)).status_code == 409
    rebaixar = await client.put(f"/api/v1/admin/users/{uid}", headers=admin.headers, json={"role": "operator"})
    assert rebaixar.status_code == 409
    desativar = await client.put(f"/api/v1/admin/users/{uid}", headers=admin.headers, json={"is_active": False})
    assert desativar.status_code == 409

    # editar o próprio nome reenviando o mesmo perfil continua permitido
    nome = await client.put(
        f"/api/v1/admin/users/{uid}",
        headers=admin.headers,
        json={"username": "Novo Nome", "role": "admin", "is_active": True},
    )
    assert nome.status_code == 200, nome.text

    # com dois admins, um remove o outro normalmente
    outro = await create_user(db, tenant, UserRole.ADMIN, name="outro-admin")
    resp = await client.delete(f"/api/v1/admin/users/{outro.user.id}", headers=admin.headers)
    assert resp.status_code == 204, resp.text


async def test_reativar_nao_tem_limite_de_usuarios(client, db):
    """Usuários ilimitados em todos os planos (out/2026): reativar sempre pode."""
    tenant = await create_tenant(db, plan=PlanType.FREE)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    await create_user(db, tenant, UserRole.OPERATOR, name="op1")
    inativo = await create_user(db, tenant, UserRole.OPERATOR, name="op-inativo")
    inativo.user.is_active = False
    db.add(inativo.user)
    await db.commit()
    await create_user(db, tenant, UserRole.OPERATOR, name="op2")  # 3 ativos (antes: acima do FREE)

    resp = await client.put(
        f"/api/v1/admin/users/{inativo.user.id}", headers=admin.headers, json={"is_active": True}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["is_active"] is True


# ── Configurações ───────────────────────────────────────────────────────────


async def _config(client, actor):
    resp = await client.get("/api/v1/admin/tenant/config", headers=actor.headers)
    assert resp.status_code == 200, resp.text
    return resp.json()


async def test_plano_sem_tema_salva_o_resto_mas_nao_muda_cores(client, db):
    tenant = await create_tenant(db, "Casa Basic", plan=PlanType.BASIC)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    atual = await _config(client, admin)

    # A tela reenvia as cores atuais: sem mudança real, salva e devolve o nome.
    ok = await client.put(
        "/api/v1/admin/tenant/config",
        headers=admin.headers,
        json={
            "primary_color": atual["primary_color"],
            "secondary_color": atual["secondary_color"],
            "custom_settings": {"font_color": "#FFFFFF"},
            "endereco": "Rua Nova, 1",
        },
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["tenant_nome"] == "Casa Basic"
    assert ok.json()["endereco"] == "Rua Nova, 1"

    cor = await client.put("/api/v1/admin/tenant/config", headers=admin.headers, json={"primary_color": "#000000"})
    assert cor.status_code == 403, cor.text

    logo = await client.post(
        "/api/v1/admin/tenant/logo", headers=admin.headers, files={"file": ("logo.png", b"\x89PNG", "image/png")}
    )
    assert logo.status_code == 403, logo.text

    remover = await client.delete("/api/v1/admin/tenant/logo", headers=admin.headers)
    assert remover.status_code == 200, remover.text
    assert remover.json()["tenant_nome"] == "Casa Basic"


async def test_operador_com_grupo_configuracoes_edita(client, db):
    tenant = await create_tenant(db, "Casa Pro", plan=PlanType.PRO)
    operador = await create_user(db, tenant, UserRole.OPERATOR, name="operador")
    await grant(db, operador, tenant, PermissionFeature.CONFIGURACOES, "view", "edit")

    resp = await client.put(
        "/api/v1/admin/tenant/config", headers=operador.headers, json={"primary_color": "#123456"}
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["primary_color"] == "#123456"
    assert resp.json()["tenant_nome"] == "Casa Pro"

    logo = await client.post(
        "/api/v1/admin/tenant/logo", headers=operador.headers, files={"file": ("logo.png", b"\x89PNG", "image/png")}
    )
    assert logo.status_code == 200, logo.text
    assert logo.json()["tenant_nome"] == "Casa Pro"


# ── Sessão ──────────────────────────────────────────────────────────────────


async def test_logout_all_recusa_impersonacao(client, db):
    tenant = await create_tenant(db, plan=PlanType.PREMIUM)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    super_admin = await create_user(db, None, UserRole.SUPER_ADMIN, name="plataforma")
    token = create_access_token(admin.user.id, tenant.id, "admin", impersonated_by=super_admin.user.id)

    resp = await client.post("/api/v1/auth/logout-all", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403, resp.text
    assert "set-cookie" not in {k.lower() for k in resp.headers.keys()}

    await db.refresh(admin.user)
    assert admin.user.sessions_revoked_at is None


async def test_usuario_excluido_perde_acesso_na_hora(client, db):
    """Antes, a exclusão (soft delete) não desativava a conta e o get_current_user não
    olhava deleted_at: o excluído seguia usando o painel até o token vencer (24 h)."""
    import uuid

    from src.security.jwt import create_refresh_token

    tenant = await create_tenant(db, plan=PlanType.PREMIUM)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    operador = await create_user(db, tenant, UserRole.OPERATOR, name="operador")
    refresh = create_refresh_token(operador.user.id, tenant.id, "operator", uuid.uuid4(), uuid.uuid4())
    email = operador.user.email

    assert (await client.get("/api/v1/auth/me", headers=operador.headers)).status_code == 200

    resp = await client.delete(f"/api/v1/admin/users/{operador.user.id}", headers=admin.headers)
    assert resp.status_code == 204, resp.text

    assert (await client.get("/api/v1/auth/me", headers=operador.headers)).status_code == 401
    renovar = await client.post("/api/v1/auth/refresh", headers={"Cookie": f"refresh_token={refresh}"})
    assert renovar.status_code == 401, renovar.text

    await db.refresh(operador.user)
    assert operador.user.is_active is False
    assert operador.user.sessions_revoked_at is not None

    # Recriar a conta com o mesmo e-mail ressuscita a linha, mas o token antigo continua morto.
    recriar = await client.post("/api/v1/admin/users", headers=admin.headers, json=_novo_usuario("operator", email=email))
    assert recriar.status_code == 201, recriar.text
    assert (await client.get("/api/v1/auth/me", headers=operador.headers)).status_code == 401


# ── Plataforma / assinatura ─────────────────────────────────────────────────


async def test_plataforma_mostra_usuarios_ativos_reais_e_bonus(client, db):
    tenant = await create_tenant(db, plan=PlanType.PRO)
    await create_user(db, tenant, UserRole.ADMIN)
    await create_user(db, tenant, UserRole.OPERATOR, name="op")
    super_admin = await create_user(db, None, UserRole.SUPER_ADMIN, name="plataforma")

    resp = await client.get(f"/api/v1/platform/subscriptions/{tenant.id}", headers=super_admin.headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["current_users"] == 2
    assert resp.json()["is_bonus"] is False


async def test_admin_subscription_diz_se_tem_assinatura_stripe(client, db):
    tenant = await create_tenant(db, plan=PlanType.PRO)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    resp = await client.get("/api/v1/admin/subscription", headers=admin.headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["has_stripe_subscription"] is False
    assert body["is_bonus"] is False
    # ações em lote valem em todos os planos
    assert body["features"]["bulk_operations"] is True


@pytest.mark.parametrize("plano", [PlanType.FREE])
async def test_bulk_operations_no_gratuito(client, db, plano):
    tenant = await create_tenant(db, plan=plano)
    admin = await create_user(db, tenant, UserRole.ADMIN)
    resp = await client.get("/api/v1/admin/subscription", headers=admin.headers)
    assert resp.json()["features"]["bulk_operations"] is True
