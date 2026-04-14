"""Unit tests for Site Builder admin and public API endpoints."""
import os
import sys

# Set DEBUG=True before any src imports to bypass production-secrets validation.
os.environ.setdefault("DEBUG", "true")
os.environ.setdefault("SECRET_KEY", "test-secret-key-not-for-production-use-only")
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://senhas:senhas@localhost/senhas_test")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..'))

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4
from datetime import datetime, timezone

# ── Fixed UUIDs ───────────────────────────────────────────────────────────────
TENANT_ID = UUID("00000000-0000-0000-0000-000000000001")
USER_ID = UUID("00000000-0000-0000-0000-000000000010")
SITE_ID = UUID("00000000-0000-0000-0000-000000000020")
SECTION_ID = UUID("00000000-0000-0000-0000-000000000030")
IMAGE_ID = UUID("00000000-0000-0000-0000-000000000040")
VERSION_ID = UUID("00000000-0000-0000-0000-000000000050")

NOW = datetime(2026, 4, 14, 12, 0, 0, tzinfo=timezone.utc)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _mock_db():
    db = AsyncMock()
    db.execute = AsyncMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()
    db.add = MagicMock()
    db.delete = AsyncMock()
    db.commit = AsyncMock()
    return db


def _admin_user():
    from src.models.users import UserRole
    user = MagicMock()
    user.id = USER_ID
    user.tenant_id = TENANT_ID
    user.role = UserRole.ADMIN
    return user


def _pro_sub():
    from src.models.subscriptions import PlanType
    sub = MagicMock()
    sub.plan = PlanType.PRO
    return sub


def _premium_sub():
    from src.models.subscriptions import PlanType
    sub = MagicMock()
    sub.plan = PlanType.PREMIUM
    return sub


def _free_sub():
    from src.models.subscriptions import PlanType
    sub = MagicMock()
    sub.plan = PlanType.FREE
    return sub


def _basic_sub():
    from src.models.subscriptions import PlanType
    sub = MagicMock()
    sub.plan = PlanType.BASIC
    return sub


def _make_site(status="DRAFT"):
    from src.models.site import SiteStatus, TenantSite
    site = MagicMock(spec=TenantSite)
    site.id = SITE_ID
    site.tenant_id = TENANT_ID
    site.slug = "terreiro-test"
    site.status = SiteStatus(status)
    site.template = "moderno"
    site.meta_title = "Terreiro Test"
    site.meta_description = None
    site.updated_at = NOW
    site.sections = []
    site.deleted_at = None
    return site


def _make_section(section_type="HERO", order_index=0):
    from src.models.site import TenantSiteSection, SiteSectionType
    s = MagicMock(spec=TenantSiteSection)
    s.id = SECTION_ID
    s.site_id = SITE_ID
    s.tenant_id = TENANT_ID
    s.section_type = SiteSectionType(section_type)
    s.order_index = order_index
    s.config = {"title": "Bem-vindo"}
    s.created_at = NOW
    return s


def _make_image():
    from src.models.site import SiteImage
    img = MagicMock(spec=SiteImage)
    img.id = IMAGE_ID
    img.site_id = SITE_ID
    img.tenant_id = TENANT_ID
    img.filename = "foto.jpg"
    img.mimetype = "image/jpeg"
    img.size_bytes = 1024
    img.width = 800
    img.height = 600
    img.data = b"\xff\xd8\xff"
    img.created_at = NOW
    return img


def _make_version():
    from src.models.site import SiteVersion
    v = MagicMock(spec=SiteVersion)
    v.id = VERSION_ID
    v.site_id = SITE_ID
    v.tenant_id = TENANT_ID
    v.snapshot = [{"section_type": "HERO", "order_index": 0, "config": {"title": "v1"}}]
    v.label = None
    v.created_by = str(USER_ID)
    v.created_at = NOW
    return v


# ═══════════════════════════════════════════════════════════════════════════════
# Plan Gate Tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestPlanGate:
    """Endpoints devem retornar 403 para planos FREE e BASIC."""

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.sites.SubscriptionRepository")
    async def test_free_plan_get_site_retorna_403(self, MockSubRepo):
        from fastapi import HTTPException
        from src.api.v1.admin.sites import get_site
        sub_inst = AsyncMock()
        sub_inst.get_by_tenant.return_value = _free_sub()
        MockSubRepo.return_value = sub_inst
        request = MagicMock()
        with pytest.raises(HTTPException) as exc:
            await get_site(request, _admin_user(), _mock_db())
        assert exc.value.status_code == 403

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.sites.SubscriptionRepository")
    async def test_basic_plan_get_site_retorna_403(self, MockSubRepo):
        from fastapi import HTTPException
        from src.api.v1.admin.sites import get_site
        sub_inst = AsyncMock()
        sub_inst.get_by_tenant.return_value = _basic_sub()
        MockSubRepo.return_value = sub_inst
        request = MagicMock()
        with pytest.raises(HTTPException) as exc:
            await get_site(request, _admin_user(), _mock_db())
        assert exc.value.status_code == 403

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.sites.SubscriptionRepository")
    @patch("src.api.v1.admin.sites.SiteRepository")
    async def test_pro_plan_get_site_ok(self, MockSiteRepo, MockSubRepo):
        from src.api.v1.admin.sites import get_site
        sub_inst = AsyncMock()
        sub_inst.get_by_tenant.return_value = _pro_sub()
        MockSubRepo.return_value = sub_inst

        site_inst = AsyncMock()
        site_inst.get_by_tenant.return_value = _make_site()
        MockSiteRepo.return_value = site_inst

        request = MagicMock()
        db = _mock_db()
        result = await get_site(request, _admin_user(), db)
        assert result.slug == "terreiro-test"

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.sites.SubscriptionRepository")
    @patch("src.api.v1.admin.sites.SiteRepository")
    async def test_premium_plan_get_site_ok(self, MockSiteRepo, MockSubRepo):
        from src.api.v1.admin.sites import get_site
        sub_inst = AsyncMock()
        sub_inst.get_by_tenant.return_value = _premium_sub()
        MockSubRepo.return_value = sub_inst

        site_inst = AsyncMock()
        site_inst.get_by_tenant.return_value = _make_site()
        MockSiteRepo.return_value = site_inst

        request = MagicMock()
        db = _mock_db()
        result = await get_site(request, _admin_user(), db)
        assert result.id == str(SITE_ID)


# ═══════════════════════════════════════════════════════════════════════════════
# get_site — auto-create quando site inexistente
# ═══════════════════════════════════════════════════════════════════════════════

class TestGetSite:

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.sites.SubscriptionRepository")
    @patch("src.api.v1.admin.sites.SiteRepository")
    async def test_auto_create_quando_site_nao_existe(self, MockSiteRepo, MockSubRepo):
        """Site deve ser criado automaticamente se o tenant não tiver um."""
        from src.api.v1.admin.sites import get_site
        sub_inst = AsyncMock()
        sub_inst.get_by_tenant.return_value = _pro_sub()
        MockSubRepo.return_value = sub_inst

        new_site = _make_site()
        site_inst = AsyncMock()
        site_inst.get_by_tenant.return_value = None        # primeiro retorno: None
        site_inst.get_or_create.return_value = new_site
        MockSiteRepo.return_value = site_inst

        request = MagicMock()
        db = _mock_db()
        result = await get_site(request, _admin_user(), db)

        site_inst.get_or_create.assert_awaited_once()
        db.commit.assert_awaited()
        assert result.status == "DRAFT"

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.sites.SubscriptionRepository")
    @patch("src.api.v1.admin.sites.SiteRepository")
    async def test_retorna_site_existente_sem_criar(self, MockSiteRepo, MockSubRepo):
        from src.api.v1.admin.sites import get_site
        sub_inst = AsyncMock()
        sub_inst.get_by_tenant.return_value = _pro_sub()
        MockSubRepo.return_value = sub_inst

        existing_site = _make_site("PUBLISHED")
        site_inst = AsyncMock()
        site_inst.get_by_tenant.return_value = existing_site
        MockSiteRepo.return_value = site_inst

        request = MagicMock()
        result = await get_site(request, _admin_user(), _mock_db())

        site_inst.get_or_create.assert_not_awaited()
        assert result.status == "PUBLISHED"


# ═══════════════════════════════════════════════════════════════════════════════
# update_site — slug único, campos opcionais
# ═══════════════════════════════════════════════════════════════════════════════

class TestUpdateSite:

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.sites.SubscriptionRepository")
    @patch("src.api.v1.admin.sites.SiteRepository")
    async def test_update_meta_title(self, MockSiteRepo, MockSubRepo):
        from src.api.v1.admin.sites import update_site, SiteUpdateRequest
        sub_inst = AsyncMock()
        sub_inst.get_by_tenant.return_value = _pro_sub()
        MockSubRepo.return_value = sub_inst

        updated_site = _make_site()
        updated_site.meta_title = "Novo Título"
        site_inst = AsyncMock()
        site_inst.get_by_tenant.return_value = _make_site()
        site_inst.update_site.return_value = updated_site
        MockSiteRepo.return_value = site_inst

        body = SiteUpdateRequest(meta_title="Novo Título")
        db = _mock_db()
        result = await update_site(body, _admin_user(), db)
        assert result.meta_title == "Novo Título"
        db.commit.assert_awaited()

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.sites.SubscriptionRepository")
    @patch("src.api.v1.admin.sites.SiteRepository")
    async def test_update_site_nao_encontrado_retorna_404(self, MockSiteRepo, MockSubRepo):
        from fastapi import HTTPException
        from src.api.v1.admin.sites import update_site, SiteUpdateRequest
        sub_inst = AsyncMock()
        sub_inst.get_by_tenant.return_value = _pro_sub()
        MockSubRepo.return_value = sub_inst

        site_inst = AsyncMock()
        site_inst.get_by_tenant.return_value = None
        MockSiteRepo.return_value = site_inst

        body = SiteUpdateRequest(meta_title="X")
        with pytest.raises(HTTPException) as exc:
            await update_site(body, _admin_user(), _mock_db())
        assert exc.value.status_code == 404

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.sites.SubscriptionRepository")
    @patch("src.api.v1.admin.sites.SiteRepository")
    async def test_slug_duplicado_retorna_409(self, MockSiteRepo, MockSubRepo):
        """Mudar para slug já em uso por outro site → 409."""
        from fastapi import HTTPException
        from src.api.v1.admin.sites import update_site, SiteUpdateRequest
        sub_inst = AsyncMock()
        sub_inst.get_by_tenant.return_value = _pro_sub()
        MockSubRepo.return_value = sub_inst

        current_site = _make_site()
        site_inst = AsyncMock()
        site_inst.get_by_tenant.return_value = current_site
        MockSiteRepo.return_value = site_inst

        # db.execute retorna um site existente com o mesmo slug → conflito
        other_site = _make_site()
        other_site.id = uuid4()
        db = _mock_db()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = other_site
        db.execute.return_value = mock_result

        body = SiteUpdateRequest(slug="slug-em-uso")
        with pytest.raises(HTTPException) as exc:
            await update_site(body, _admin_user(), db)
        assert exc.value.status_code == 409


# ═══════════════════════════════════════════════════════════════════════════════
# get_sections / save_sections
# ═══════════════════════════════════════════════════════════════════════════════

class TestSections:

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.sites.SubscriptionRepository")
    @patch("src.api.v1.admin.sites.SiteRepository")
    async def test_get_sections_retorna_lista_ordenada(self, MockSiteRepo, MockSubRepo):
        from src.api.v1.admin.sites import get_sections
        sub_inst = AsyncMock()
        sub_inst.get_by_tenant.return_value = _pro_sub()
        MockSubRepo.return_value = sub_inst

        s0 = _make_section("HERO", 0)
        s1 = _make_section("ABOUT", 1)
        site = _make_site()
        site.sections = [s1, s0]   # ordem invertida — deve ser reordenada
        site_inst = AsyncMock()
        site_inst.get_by_tenant.return_value = site
        MockSiteRepo.return_value = site_inst

        result = await get_sections(_admin_user(), _mock_db())
        assert result.sections[0].section_type == "HERO"
        assert result.sections[1].section_type == "ABOUT"

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.sites.SubscriptionRepository")
    @patch("src.api.v1.admin.sites.SiteRepository")
    async def test_get_sections_site_nao_encontrado_retorna_lista_vazia(self, MockSiteRepo, MockSubRepo):
        from src.api.v1.admin.sites import get_sections
        sub_inst = AsyncMock()
        sub_inst.get_by_tenant.return_value = _pro_sub()
        MockSubRepo.return_value = sub_inst

        site_inst = AsyncMock()
        site_inst.get_by_tenant.return_value = None
        MockSiteRepo.return_value = site_inst

        result = await get_sections(_admin_user(), _mock_db())
        assert result.sections == []

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.sites.SubscriptionRepository")
    @patch("src.api.v1.admin.sites.SiteVersionRepository")
    @patch("src.api.v1.admin.sites.SiteRepository")
    async def test_save_sections_sucesso(self, MockSiteRepo, MockVersionRepo, MockSubRepo):
        from src.api.v1.admin.sites import save_sections, SectionsUpdateRequest, SectionPayload
        sub_inst = AsyncMock()
        sub_inst.get_by_tenant.return_value = _pro_sub()
        MockSubRepo.return_value = sub_inst

        site = _make_site()
        updated_site = _make_site()
        updated_section = _make_section("HERO", 0)
        updated_site.sections = [updated_section]

        site_inst = AsyncMock()
        site_inst.get_by_tenant.side_effect = [site, updated_site]  # before + after save
        site_inst.save_sections.return_value = None
        MockSiteRepo.return_value = site_inst

        ver_inst = AsyncMock()
        MockVersionRepo.return_value = ver_inst

        body = SectionsUpdateRequest(
            sections=[SectionPayload(section_type="HERO", config={"title": "Olá"})],
            site_version=NOW.isoformat(),
        )
        db = _mock_db()
        result = await save_sections(body, _admin_user(), db)
        assert len(result.sections) == 1
        assert result.sections[0].section_type == "HERO"
        db.commit.assert_awaited()

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.sites.SubscriptionRepository")
    @patch("src.api.v1.admin.sites.SiteRepository")
    async def test_save_sections_hero_sem_titulo_retorna_422(self, MockSiteRepo, MockSubRepo):
        from fastapi import HTTPException
        from src.api.v1.admin.sites import save_sections, SectionsUpdateRequest, SectionPayload
        sub_inst = AsyncMock()
        sub_inst.get_by_tenant.return_value = _pro_sub()
        MockSubRepo.return_value = sub_inst

        site = _make_site()
        site_inst = AsyncMock()
        site_inst.get_by_tenant.return_value = site
        MockSiteRepo.return_value = site_inst

        body = SectionsUpdateRequest(
            sections=[SectionPayload(section_type="HERO", config={"title": "  "})],
        )
        with pytest.raises(HTTPException) as exc:
            await save_sections(body, _admin_user(), _mock_db())
        assert exc.value.status_code == 422

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.sites.SubscriptionRepository")
    @patch("src.api.v1.admin.sites.SiteRepository")
    async def test_save_sections_tipo_invalido_retorna_422(self, MockSiteRepo, MockSubRepo):
        from fastapi import HTTPException
        from src.api.v1.admin.sites import save_sections, SectionsUpdateRequest, SectionPayload
        sub_inst = AsyncMock()
        sub_inst.get_by_tenant.return_value = _pro_sub()
        MockSubRepo.return_value = sub_inst

        site = _make_site()
        site_inst = AsyncMock()
        site_inst.get_by_tenant.return_value = site
        MockSiteRepo.return_value = site_inst

        body = SectionsUpdateRequest(
            sections=[SectionPayload(section_type="TIPO_INEXISTENTE", config={})],
        )
        with pytest.raises(HTTPException) as exc:
            await save_sections(body, _admin_user(), _mock_db())
        assert exc.value.status_code == 422

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.sites.SubscriptionRepository")
    @patch("src.api.v1.admin.sites.SiteVersionRepository")
    @patch("src.api.v1.admin.sites.SiteRepository")
    async def test_save_sections_lock_otimista_409(self, MockSiteRepo, MockVersionRepo, MockSubRepo):
        """Se site_version divergir do updated_at atual → 409 Conflict."""
        from fastapi import HTTPException
        from src.api.v1.admin.sites import save_sections, SectionsUpdateRequest, SectionPayload
        sub_inst = AsyncMock()
        sub_inst.get_by_tenant.return_value = _pro_sub()
        MockSubRepo.return_value = sub_inst

        site = _make_site()
        site.updated_at = datetime(2026, 4, 14, 10, 0, 0, tzinfo=timezone.utc)
        site_inst = AsyncMock()
        site_inst.get_by_tenant.return_value = site
        MockSiteRepo.return_value = site_inst
        MockVersionRepo.return_value = AsyncMock()

        # client envia timestamp desatualizado
        stale_version = datetime(2026, 4, 14, 9, 0, 0, tzinfo=timezone.utc).isoformat()
        body = SectionsUpdateRequest(
            sections=[SectionPayload(section_type="ABOUT", config={"body": "texto"})],
            site_version=stale_version,
        )
        with pytest.raises(HTTPException) as exc:
            await save_sections(body, _admin_user(), _mock_db())
        assert exc.value.status_code == 409


# ═══════════════════════════════════════════════════════════════════════════════
# publish / unpublish
# ═══════════════════════════════════════════════════════════════════════════════

class TestPublishUnpublish:

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.sites.SubscriptionRepository")
    @patch("src.api.v1.admin.sites.SiteRepository")
    async def test_publish_site(self, MockSiteRepo, MockSubRepo):
        from src.api.v1.admin.sites import publish_site
        sub_inst = AsyncMock()
        sub_inst.get_by_tenant.return_value = _pro_sub()
        MockSubRepo.return_value = sub_inst

        published_site = _make_site("PUBLISHED")
        site_inst = AsyncMock()
        site_inst.get_by_tenant.return_value = _make_site("DRAFT")
        site_inst.publish.return_value = published_site
        MockSiteRepo.return_value = site_inst

        db = _mock_db()
        result = await publish_site(_admin_user(), db)
        assert result.status == "PUBLISHED"
        db.commit.assert_awaited()

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.sites.SubscriptionRepository")
    @patch("src.api.v1.admin.sites.SiteRepository")
    async def test_unpublish_site(self, MockSiteRepo, MockSubRepo):
        from src.api.v1.admin.sites import unpublish_site
        sub_inst = AsyncMock()
        sub_inst.get_by_tenant.return_value = _pro_sub()
        MockSubRepo.return_value = sub_inst

        unpublished_site = _make_site("UNPUBLISHED")
        site_inst = AsyncMock()
        site_inst.get_by_tenant.return_value = _make_site("PUBLISHED")
        site_inst.unpublish.return_value = unpublished_site
        MockSiteRepo.return_value = site_inst

        db = _mock_db()
        result = await unpublish_site(_admin_user(), db)
        assert result.status == "UNPUBLISHED"
        db.commit.assert_awaited()

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.sites.SubscriptionRepository")
    @patch("src.api.v1.admin.sites.SiteRepository")
    async def test_publish_site_nao_encontrado_retorna_404(self, MockSiteRepo, MockSubRepo):
        from fastapi import HTTPException
        from src.api.v1.admin.sites import publish_site
        sub_inst = AsyncMock()
        sub_inst.get_by_tenant.return_value = _pro_sub()
        MockSubRepo.return_value = sub_inst

        site_inst = AsyncMock()
        site_inst.get_by_tenant.return_value = None
        MockSiteRepo.return_value = site_inst

        with pytest.raises(HTTPException) as exc:
            await publish_site(_admin_user(), _mock_db())
        assert exc.value.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════════
# Images — upload, list, delete
# ═══════════════════════════════════════════════════════════════════════════════

class TestImages:

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.sites.SubscriptionRepository")
    @patch("src.api.v1.admin.sites.SiteImageRepository")
    @patch("src.api.v1.admin.sites.SiteRepository")
    async def test_list_images(self, MockSiteRepo, MockImageRepo, MockSubRepo):
        from src.api.v1.admin.sites import list_images
        sub_inst = AsyncMock()
        sub_inst.get_by_tenant.return_value = _pro_sub()
        MockSubRepo.return_value = sub_inst

        site_inst = AsyncMock()
        site_inst.get_by_tenant.return_value = _make_site()
        MockSiteRepo.return_value = site_inst

        img_inst = AsyncMock()
        img_inst.list_by_site.return_value = [_make_image()]
        MockImageRepo.return_value = img_inst

        result = await list_images(_admin_user(), _mock_db())
        assert len(result) == 1
        assert result[0].filename == "foto.jpg"

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.sites.SubscriptionRepository")
    @patch("src.api.v1.admin.sites.SiteImageRepository")
    @patch("src.api.v1.admin.sites.SiteRepository")
    async def test_upload_image_sucesso(self, MockSiteRepo, MockImageRepo, MockSubRepo):
        from src.api.v1.admin.sites import upload_image
        sub_inst = AsyncMock()
        sub_inst.get_by_tenant.return_value = _pro_sub()
        MockSubRepo.return_value = sub_inst

        site_inst = AsyncMock()
        site_inst.get_by_tenant.return_value = _make_site()
        MockSiteRepo.return_value = site_inst

        saved_img = _make_image()
        img_inst = AsyncMock()
        img_inst.count_by_tenant.return_value = 0  # abaixo do limite
        img_inst.create.return_value = saved_img
        MockImageRepo.return_value = img_inst

        file = AsyncMock()
        file.filename = "foto.jpg"
        file.content_type = "image/jpeg"
        file.read = AsyncMock(return_value=b"\xff\xd8\xff" + b"\x00" * 100)

        db = _mock_db()
        with patch("src.api.v1.admin.sites._extract_image_dimensions", return_value=(800, 600)):
            result = await upload_image(file=file, current_user=_admin_user(), db=db)

        assert result.filename == "foto.jpg"
        db_created = img_inst.create.call_args
        assert db_created is not None

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.sites.SubscriptionRepository")
    @patch("src.api.v1.admin.sites.SiteImageRepository")
    @patch("src.api.v1.admin.sites.SiteRepository")
    async def test_upload_image_mimetype_invalido_retorna_415(self, MockSiteRepo, MockImageRepo, MockSubRepo):
        from fastapi import HTTPException
        from src.api.v1.admin.sites import upload_image
        sub_inst = AsyncMock()
        sub_inst.get_by_tenant.return_value = _pro_sub()
        MockSubRepo.return_value = sub_inst

        site_inst = AsyncMock()
        site_inst.get_by_tenant.return_value = _make_site()
        MockSiteRepo.return_value = site_inst

        MockImageRepo.return_value = AsyncMock()

        file = AsyncMock()
        file.filename = "script.svg"
        file.content_type = "image/svg+xml"
        file.read = AsyncMock(return_value=b"<svg/>")

        with pytest.raises(HTTPException) as exc:
            await upload_image(file=file, current_user=_admin_user(), db=_mock_db())
        assert exc.value.status_code == 415

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.sites.SubscriptionRepository")
    @patch("src.api.v1.admin.sites.SiteImageRepository")
    @patch("src.api.v1.admin.sites.SiteRepository")
    async def test_upload_image_acima_tamanho_retorna_413(self, MockSiteRepo, MockImageRepo, MockSubRepo):
        from fastapi import HTTPException
        from src.api.v1.admin.sites import upload_image, MAX_IMAGE_SIZE_BYTES
        sub_inst = AsyncMock()
        sub_inst.get_by_tenant.return_value = _pro_sub()
        MockSubRepo.return_value = sub_inst

        site_inst = AsyncMock()
        site_inst.get_by_tenant.return_value = _make_site()
        MockSiteRepo.return_value = site_inst

        MockImageRepo.return_value = AsyncMock()

        file = AsyncMock()
        file.filename = "grande.jpg"
        file.content_type = "image/jpeg"
        file.read = AsyncMock(return_value=b"\xff\xd8\xff" + b"\x00" * (MAX_IMAGE_SIZE_BYTES + 1))

        with pytest.raises(HTTPException) as exc:
            await upload_image(file=file, current_user=_admin_user(), db=_mock_db())
        assert exc.value.status_code == 413

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.sites.SubscriptionRepository")
    @patch("src.api.v1.admin.sites.SiteImageRepository")
    @patch("src.api.v1.admin.sites.SiteRepository")
    async def test_upload_image_limite_50_retorna_400(self, MockSiteRepo, MockImageRepo, MockSubRepo):
        from fastapi import HTTPException
        from src.api.v1.admin.sites import upload_image, MAX_IMAGES_PER_TENANT
        sub_inst = AsyncMock()
        sub_inst.get_by_tenant.return_value = _pro_sub()
        MockSubRepo.return_value = sub_inst

        site_inst = AsyncMock()
        site_inst.get_by_tenant.return_value = _make_site()
        MockSiteRepo.return_value = site_inst

        img_inst = AsyncMock()
        img_inst.count_by_tenant.return_value = MAX_IMAGES_PER_TENANT
        MockImageRepo.return_value = img_inst

        file = AsyncMock()
        file.filename = "nova.jpg"
        file.content_type = "image/jpeg"
        file.read = AsyncMock(return_value=b"\xff\xd8\xff" + b"\x00" * 100)

        with pytest.raises(HTTPException) as exc:
            await upload_image(file=file, current_user=_admin_user(), db=_mock_db())
        assert exc.value.status_code == 400

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.sites.SubscriptionRepository")
    @patch("src.api.v1.admin.sites.SiteImageRepository")
    @patch("src.api.v1.admin.sites.SiteRepository")
    async def test_delete_image_sucesso(self, MockSiteRepo, MockImageRepo, MockSubRepo):
        from src.api.v1.admin.sites import delete_image
        sub_inst = AsyncMock()
        sub_inst.get_by_tenant.return_value = _pro_sub()
        MockSubRepo.return_value = sub_inst

        site_inst = AsyncMock()
        site_inst.get_by_tenant.return_value = _make_site()
        MockSiteRepo.return_value = site_inst

        img_inst = AsyncMock()
        img_inst.get.return_value = _make_image()
        img_inst.delete.return_value = None
        MockImageRepo.return_value = img_inst

        db = _mock_db()
        # Não deve lançar exceção
        await delete_image(IMAGE_ID, _admin_user(), db)
        img_inst.delete.assert_awaited_once()
        db.commit.assert_awaited()

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.sites.SubscriptionRepository")
    @patch("src.api.v1.admin.sites.SiteImageRepository")
    @patch("src.api.v1.admin.sites.SiteRepository")
    async def test_delete_image_nao_encontrada_retorna_404(self, MockSiteRepo, MockImageRepo, MockSubRepo):
        from fastapi import HTTPException
        from src.api.v1.admin.sites import delete_image
        sub_inst = AsyncMock()
        sub_inst.get_by_tenant.return_value = _pro_sub()
        MockSubRepo.return_value = sub_inst

        site_inst = AsyncMock()
        site_inst.get_by_tenant.return_value = _make_site()
        MockSiteRepo.return_value = site_inst

        img_inst = AsyncMock()
        img_inst.get.return_value = None
        MockImageRepo.return_value = img_inst

        with pytest.raises(HTTPException) as exc:
            await delete_image(IMAGE_ID, _admin_user(), _mock_db())
        assert exc.value.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════════
# Versions — list & restore
# ═══════════════════════════════════════════════════════════════════════════════

class TestVersions:

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.sites.SubscriptionRepository")
    @patch("src.api.v1.admin.sites.SiteVersionRepository")
    @patch("src.api.v1.admin.sites.SiteRepository")
    async def test_list_versions(self, MockSiteRepo, MockVersionRepo, MockSubRepo):
        from src.api.v1.admin.sites import list_versions
        sub_inst = AsyncMock()
        sub_inst.get_by_tenant.return_value = _pro_sub()
        MockSubRepo.return_value = sub_inst

        site_inst = AsyncMock()
        site_inst.get_by_tenant.return_value = _make_site()
        MockSiteRepo.return_value = site_inst

        ver_inst = AsyncMock()
        ver_inst.list.return_value = [_make_version()]
        MockVersionRepo.return_value = ver_inst

        result = await list_versions(_admin_user(), _mock_db())
        assert len(result) == 1
        assert result[0].id == str(VERSION_ID)

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.sites.SubscriptionRepository")
    @patch("src.api.v1.admin.sites.SiteVersionRepository")
    @patch("src.api.v1.admin.sites.SiteRepository")
    async def test_restore_version_sucesso(self, MockSiteRepo, MockVersionRepo, MockSubRepo):
        from src.api.v1.admin.sites import restore_version
        sub_inst = AsyncMock()
        sub_inst.get_by_tenant.return_value = _pro_sub()
        MockSubRepo.return_value = sub_inst

        restored_site = _make_site()
        restored_site.sections = [_make_section("HERO", 0)]

        site_inst = AsyncMock()
        site_inst.get_by_tenant.side_effect = [_make_site(), restored_site]
        site_inst.save_sections.return_value = None
        MockSiteRepo.return_value = site_inst

        version = _make_version()
        ver_inst = AsyncMock()
        ver_inst.get.return_value = version
        ver_inst.restore.return_value = version.snapshot
        MockVersionRepo.return_value = ver_inst

        db = _mock_db()
        result = await restore_version(VERSION_ID, _admin_user(), db)
        assert len(result.sections) == 1
        db.commit.assert_awaited()

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.sites.SubscriptionRepository")
    @patch("src.api.v1.admin.sites.SiteVersionRepository")
    @patch("src.api.v1.admin.sites.SiteRepository")
    async def test_restore_version_nao_encontrada_retorna_404(self, MockSiteRepo, MockVersionRepo, MockSubRepo):
        from fastapi import HTTPException
        from src.api.v1.admin.sites import restore_version
        sub_inst = AsyncMock()
        sub_inst.get_by_tenant.return_value = _pro_sub()
        MockSubRepo.return_value = sub_inst

        site_inst = AsyncMock()
        site_inst.get_by_tenant.return_value = _make_site()
        MockSiteRepo.return_value = site_inst

        ver_inst = AsyncMock()
        ver_inst.get.return_value = None
        MockVersionRepo.return_value = ver_inst

        with pytest.raises(HTTPException) as exc:
            await restore_version(VERSION_ID, _admin_user(), _mock_db())
        assert exc.value.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════════
# Validadores helpers
# ═══════════════════════════════════════════════════════════════════════════════

class TestValidadores:

    def test_youtube_url_valida_embed(self):
        from src.api.v1.admin.sites import _validate_youtube_url
        _validate_youtube_url("https://www.youtube.com/embed/dQw4w9WgXcQ")  # não deve lançar

    def test_youtube_url_valida_nocookie(self):
        from src.api.v1.admin.sites import _validate_youtube_url
        _validate_youtube_url("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ")

    def test_youtube_url_valida_watch(self):
        from src.api.v1.admin.sites import _validate_youtube_url
        _validate_youtube_url("https://www.youtube.com/watch?v=dQw4w9WgXcQ")

    def test_youtube_url_invalida_retorna_422(self):
        from fastapi import HTTPException
        from src.api.v1.admin.sites import _validate_youtube_url
        with pytest.raises(HTTPException) as exc:
            _validate_youtube_url("https://vimeo.com/12345")
        assert exc.value.status_code == 422

    def test_youtube_url_vazia_nao_levanta(self):
        from src.api.v1.admin.sites import _validate_youtube_url
        _validate_youtube_url("")  # URL vazia é permitida (campo opcional)

    def test_validate_section_hero_sem_titulo(self):
        from fastapi import HTTPException
        from src.api.v1.admin.sites import _validate_section, SectionPayload
        with pytest.raises(HTTPException) as exc:
            _validate_section(SectionPayload(section_type="HERO", config={"title": ""}))
        assert exc.value.status_code == 422

    def test_validate_section_hero_com_titulo_ok(self):
        from src.api.v1.admin.sites import _validate_section, SectionPayload
        _validate_section(SectionPayload(section_type="HERO", config={"title": "Olá"}))

    def test_validate_section_video_embed_url_invalida(self):
        from fastapi import HTTPException
        from src.api.v1.admin.sites import _validate_section, SectionPayload
        with pytest.raises(HTTPException) as exc:
            _validate_section(SectionPayload(
                section_type="VIDEO_EMBED",
                config={"youtube_url": "https://vimeo.com/123"},
            ))
        assert exc.value.status_code == 422

    def test_validate_section_type_invalido(self):
        from fastapi import HTTPException
        from src.api.v1.admin.sites import _validate_section_type
        with pytest.raises(HTTPException) as exc:
            _validate_section_type("NAO_EXISTE")
        assert exc.value.status_code == 422

    def test_validate_section_type_valido(self):
        from src.api.v1.admin.sites import _validate_section_type
        from src.models.site import SiteSectionType
        result = _validate_section_type("HERO")
        assert result == SiteSectionType.HERO


# ═══════════════════════════════════════════════════════════════════════════════
# Public endpoints
# ═══════════════════════════════════════════════════════════════════════════════

class TestPublicEndpoints:

    @pytest.mark.asyncio
    @patch("src.api.v1.public.sites.SiteRepository")
    async def test_get_published_site_sucesso(self, MockSiteRepo):
        from src.api.v1.public.sites import get_published_site
        site = _make_site("PUBLISHED")
        site.sections = [_make_section("HERO", 0)]
        repo_inst = AsyncMock()
        repo_inst.get_published_by_slug.return_value = {
            "site": site,
            "upcoming_giras": [],
        }
        MockSiteRepo.return_value = repo_inst

        result = await get_published_site("terreiro-test", _mock_db())
        assert result["slug"] == "terreiro-test"
        assert result["status"] == "PUBLISHED"
        assert len(result["sections"]) == 1
        assert result["upcoming_giras"] == []

    @pytest.mark.asyncio
    @patch("src.api.v1.public.sites.SiteRepository")
    async def test_get_published_site_nao_encontrado_retorna_404(self, MockSiteRepo):
        from fastapi import HTTPException
        from src.api.v1.public.sites import get_published_site
        repo_inst = AsyncMock()
        repo_inst.get_published_by_slug.return_value = None
        MockSiteRepo.return_value = repo_inst

        with pytest.raises(HTTPException) as exc:
            await get_published_site("inexistente", _mock_db())
        assert exc.value.status_code == 404

    @pytest.mark.asyncio
    @patch("src.api.v1.public.sites.SiteRepository")
    async def test_get_published_site_inclui_giras(self, MockSiteRepo):
        """upcoming_giras deve estar presente no payload para SSR/SEO."""
        from src.api.v1.public.sites import get_published_site
        from datetime import timedelta

        site = _make_site("PUBLISHED")
        site.sections = []

        gira = MagicMock()
        gira.id = uuid4()
        gira.nome = "Gira de Oxalá"
        gira.data_hora = NOW + timedelta(days=7)
        gira.descricao = "Descrição da gira"

        repo_inst = AsyncMock()
        repo_inst.get_published_by_slug.return_value = {
            "site": site,
            "upcoming_giras": [gira],
        }
        MockSiteRepo.return_value = repo_inst

        result = await get_published_site("terreiro-test", _mock_db())
        assert len(result["upcoming_giras"]) == 1
        assert result["upcoming_giras"][0]["nome"] == "Gira de Oxalá"

    @pytest.mark.asyncio
    @patch("src.api.v1.public.sites.SiteImageRepository")
    async def test_get_site_image_sucesso(self, MockImageRepo):
        from fastapi import Request
        from src.api.v1.public.sites import get_site_image

        img = _make_image()
        repo_inst = AsyncMock()
        repo_inst.get_public.return_value = img
        MockImageRepo.return_value = repo_inst

        request = MagicMock(spec=Request)
        result = await get_site_image(request, IMAGE_ID, _mock_db())
        assert result.media_type == "image/jpeg"
        assert result.headers["Cache-Control"] == "public, max-age=86400"

    @pytest.mark.asyncio
    @patch("src.api.v1.public.sites.SiteImageRepository")
    async def test_get_site_image_nao_encontrada_retorna_404(self, MockImageRepo):
        from fastapi import HTTPException, Request
        from src.api.v1.public.sites import get_site_image

        repo_inst = AsyncMock()
        repo_inst.get_public.return_value = None
        MockImageRepo.return_value = repo_inst

        request = MagicMock(spec=Request)
        with pytest.raises(HTTPException) as exc:
            await get_site_image(request, IMAGE_ID, _mock_db())
        assert exc.value.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════════
# Repositories
# ═══════════════════════════════════════════════════════════════════════════════

class TestSiteRepository:

    @pytest.fixture
    def repo_and_db(self):
        from src.repositories.site_repo import SiteRepository
        db = _mock_db()
        return SiteRepository(db), db

    def _mock_scalar(self, value):
        r = MagicMock()
        r.scalar_one_or_none.return_value = value
        return r

    def _mock_scalars(self, items):
        r = MagicMock()
        sc = MagicMock()
        sc.all.return_value = items
        r.scalars.return_value = sc
        return r

    @pytest.mark.asyncio
    async def test_get_by_tenant_encontrado(self, repo_and_db):
        repo, db = repo_and_db
        site = _make_site()
        db.execute.return_value = self._mock_scalar(site)
        result = await repo.get_by_tenant(TENANT_ID)
        assert result is site

    @pytest.mark.asyncio
    async def test_get_by_tenant_nao_encontrado(self, repo_and_db):
        repo, db = repo_and_db
        db.execute.return_value = self._mock_scalar(None)
        result = await repo.get_by_tenant(TENANT_ID)
        assert result is None

    @pytest.mark.asyncio
    async def test_get_published_by_slug_retorna_none_para_rascunho(self, repo_and_db):
        repo, db = repo_and_db
        db.execute.return_value = self._mock_scalar(None)  # não encontrado (filtro PUBLISHED)
        result = await repo.get_published_by_slug("slug-rascunho")
        assert result is None

    @pytest.mark.asyncio
    async def test_get_published_by_slug_sucesso(self, repo_and_db):
        repo, db = repo_and_db
        site = _make_site("PUBLISHED")
        gira = MagicMock()
        # Primeiro execute (site), segundo execute (giras)
        db.execute.side_effect = [
            self._mock_scalar(site),
            self._mock_scalars([gira]),
        ]
        result = await repo.get_published_by_slug("terreiro-test")
        assert result is not None
        assert result["site"] is site
        assert len(result["upcoming_giras"]) == 1

    @pytest.mark.asyncio
    async def test_save_sections_realiza_delete_e_insert(self, repo_and_db):
        repo, db = repo_and_db
        site = _make_site()
        site.sections = [_make_section()]

        sections_data = [
            {"section_type": "HERO", "config": {"title": "Olá"}},
            {"section_type": "ABOUT", "config": {"body": "Texto"}},
        ]
        await repo.save_sections(site, sections_data)

        # delete deve ter sido chamado via db.execute
        db.execute.assert_awaited()
        # db.add chamado duas vezes (uma por seção)
        assert db.add.call_count == 2
        db.flush.assert_awaited()

    @pytest.mark.asyncio
    async def test_publish_sets_status(self, repo_and_db):
        repo, db = repo_and_db
        site = _make_site("DRAFT")
        result = await repo.publish(site)
        from src.models.site import SiteStatus
        assert result.status == SiteStatus.PUBLISHED
        db.flush.assert_awaited()

    @pytest.mark.asyncio
    async def test_unpublish_sets_status(self, repo_and_db):
        repo, db = repo_and_db
        site = _make_site("PUBLISHED")
        result = await repo.unpublish(site)
        from src.models.site import SiteStatus
        assert result.status == SiteStatus.UNPUBLISHED
        db.flush.assert_awaited()


class TestSiteImageRepository:

    @pytest.fixture
    def repo_and_db(self):
        from src.repositories.site_image_repo import SiteImageRepository
        db = _mock_db()
        return SiteImageRepository(db), db

    def _mock_scalar(self, value):
        r = MagicMock()
        r.scalar_one_or_none.return_value = value
        r.scalar.return_value = value
        return r

    def _mock_scalars(self, items):
        r = MagicMock()
        sc = MagicMock()
        sc.all.return_value = items
        r.scalars.return_value = sc
        return r

    @pytest.mark.asyncio
    async def test_count_by_tenant(self, repo_and_db):
        repo, db = repo_and_db
        db.execute.return_value = self._mock_scalar(3)
        count = await repo.count_by_tenant(TENANT_ID)
        assert count == 3

    @pytest.mark.asyncio
    async def test_get_image_com_tenant_filtrado(self, repo_and_db):
        """get() deve filtrar por tenant_id (isolamento multi-tenant)."""
        repo, db = repo_and_db
        img = _make_image()
        db.execute.return_value = self._mock_scalar(img)
        result = await repo.get(IMAGE_ID, TENANT_ID)
        assert result is img

    @pytest.mark.asyncio
    async def test_get_public_sem_filtro_tenant(self, repo_and_db):
        """get_public() não filtra por tenant — necessário para servir imagens publicamente."""
        repo, db = repo_and_db
        img = _make_image()
        db.execute.return_value = self._mock_scalar(img)
        result = await repo.get_public(IMAGE_ID)
        assert result is img

    @pytest.mark.asyncio
    async def test_create_image(self, repo_and_db):
        repo, db = repo_and_db
        result = await repo.create(
            site_id=SITE_ID,
            tenant_id=TENANT_ID,
            filename="foto.jpg",
            mimetype="image/jpeg",
            data=b"\xff\xd8\xff",
            width=800,
            height=600,
        )
        db.add.assert_called_once()
        db.flush.assert_awaited()
        # create returns the image object directly (no refresh needed)
        assert result is not None

    @pytest.mark.asyncio
    async def test_delete_image(self, repo_and_db):
        repo, db = repo_and_db
        img = _make_image()
        await repo.delete(img)
        db.delete.assert_awaited_with(img)
        db.flush.assert_awaited()

    def test_is_referenced_in_sections_true(self):
        from src.repositories.site_image_repo import SiteImageRepository
        repo = SiteImageRepository(_mock_db())
        img_id = str(IMAGE_ID)
        sections_data = [
            {"section_type": "HERO", "config": {"image_id": img_id}},
        ]
        assert repo.is_referenced_in_sections(IMAGE_ID, sections_data) is True

    def test_is_referenced_in_sections_false(self):
        from src.repositories.site_image_repo import SiteImageRepository
        repo = SiteImageRepository(_mock_db())
        sections_data = [
            {"section_type": "HERO", "config": {"image_id": str(uuid4())}},
        ]
        assert repo.is_referenced_in_sections(IMAGE_ID, sections_data) is False


class TestSiteVersionRepository:

    @pytest.fixture
    def repo_and_db(self):
        from src.repositories.site_version_repo import SiteVersionRepository
        db = _mock_db()
        return SiteVersionRepository(db), db

    def _mock_scalar(self, value):
        r = MagicMock()
        r.scalar_one_or_none.return_value = value
        return r

    def _mock_scalars(self, items):
        r = MagicMock()
        sc = MagicMock()
        sc.all.return_value = items
        r.scalars.return_value = sc
        return r

    @pytest.mark.asyncio
    async def test_create_versao(self, repo_and_db):
        repo, db = repo_and_db
        site = _make_site()
        site.sections = [_make_section("HERO", 0)]

        db.execute.return_value = self._mock_scalars([])   # sem versões antigas para deletar

        await repo.create(site, created_by=USER_ID, label="v1")
        db.add.assert_called_once()
        db.flush.assert_awaited()

    @pytest.mark.asyncio
    async def test_list_versoes(self, repo_and_db):
        repo, db = repo_and_db
        version = _make_version()
        db.execute.return_value = self._mock_scalars([version])
        result = await repo.list(SITE_ID, TENANT_ID)
        assert result == [version]

    @pytest.mark.asyncio
    async def test_get_versao_com_tenant(self, repo_and_db):
        repo, db = repo_and_db
        version = _make_version()
        db.execute.return_value = self._mock_scalar(version)
        result = await repo.get(VERSION_ID, TENANT_ID)
        assert result is version

    @pytest.mark.asyncio
    async def test_restore_retorna_snapshot(self, repo_and_db):
        repo, db = repo_and_db
        version = _make_version()
        site = _make_site()
        snapshot = await repo.restore(version, site)
        assert snapshot == version.snapshot
