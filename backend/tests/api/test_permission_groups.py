"""Integration tests for permission groups administration and check_permission logic."""
import pytest
from datetime import datetime
from uuid import uuid4, UUID
from fastapi import FastAPI, Depends
from fastapi.testclient import TestClient
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text

from src.core.database import get_db
from src.models import Base, User, UserRole, Tenant, Subscription, PlanType, SubscriptionStatus
from src.models.permission_groups import PermissionGroup, GroupPermission, UserGroupMembership, PermissionFeature
from src.repositories.permission_group_repo import PermissionGroupRepository
from src.services.permission_service import PermissionService
from src.api.v1.admin.permission_groups import router as pg_router
from src.core.errors import GroupPermissionDeniedError, ConflictError
from src.api.dependencies import get_current_user



# ── SQLite Database Setup ────────────────────────────────────────────────────

@pytest.fixture
async def test_db():
    """Create a SQLite in-memory database and apply schemas."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
    )
    async with engine.begin() as conn:
        # SQLite specific config
        await conn.execute(text("PRAGMA foreign_keys = ON;"))
        await conn.run_sync(Base.metadata.create_all)
    
    yield engine
    await engine.dispose()


@pytest.fixture
async def db_session(test_db):
    """Provide a transactional DB session for testing."""
    async_session = sessionmaker(test_db, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        yield session


# ── Test App Setup ───────────────────────────────────────────────────────────

@pytest.fixture
def test_app(test_db):
    """Configure a mock FastAPI app with database dependency override and exception handlers."""
    from src.core.errors import APIException
    from fastapi.responses import JSONResponse
    
    app = FastAPI()
    
    @app.exception_handler(APIException)
    async def api_exception_handler(request, exc: APIException):
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error_code": exc.error_code,
                "message": exc.message,
                "details": exc.details,
            },
        )
        
    app.include_router(pg_router)

    async_session = sessionmaker(test_db, class_=AsyncSession, expire_on_commit=False)
    
    async def override_get_db():
        async with async_session() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    return app


# ── Seed Fixtures ─────────────────────────────────────────────────────────────

@pytest.fixture
async def seed_data(db_session):
    """Seed base tenants, users, plans and subscriptions."""
    tenant_a_id = uuid4()
    tenant_b_id = uuid4()

    tenant_a = Tenant(id=tenant_a_id, name="Terreiro A", slug="terreiro-a", is_active=True)
    tenant_b = Tenant(id=tenant_b_id, name="Terreiro B", slug="terreiro-b", is_active=True)
    db_session.add_all([tenant_a, tenant_b])

    # Subscriptions (Tenant A: PREMIUM, Tenant B: FREE)
    sub_a = Subscription(
        id=uuid4(),
        tenant_id=tenant_a_id,
        plan=PlanType.PREMIUM,
        status=SubscriptionStatus.ACTIVE,
        max_users=-1,
        max_giras_per_month=-1,
        max_mediuns=-1,
        monthly_price=99.00,
    )
    sub_b = Subscription(
        id=uuid4(),
        tenant_id=tenant_b_id,
        plan=PlanType.FREE,
        status=SubscriptionStatus.ACTIVE,
        max_users=1,
        max_giras_per_month=2,
        max_mediuns=0,
        monthly_price=0.00,
    )
    db_session.add_all([sub_a, sub_b])

    # Users
    admin_a = User(
        id=uuid4(),
        tenant_id=tenant_a_id,
        email="admin@a.com",
        username="admin_a",
        password_hash="fake",
        role=UserRole.ADMIN,
        is_active=True,
    )
    op_a = User(
        id=uuid4(),
        tenant_id=tenant_a_id,
        email="operator@a.com",
        username="operator_a",
        password_hash="fake",
        role=UserRole.OPERATOR,
        is_active=True,
    )
    op_b = User(
        id=uuid4(),
        tenant_id=tenant_b_id,
        email="operator@b.com",
        username="operator_b",
        password_hash="fake",
        role=UserRole.OPERATOR,
        is_active=True,
    )
    
    db_session.add_all([admin_a, op_a, op_b])
    await db_session.commit()

    return {
        "tenant_a_id": tenant_a_id,
        "tenant_b_id": tenant_b_id,
        "admin_a": admin_a,
        "op_a": op_a,
        "op_b": op_b,
    }


# ── Repository Tests ──────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_repo_optimistic_locking(db_session, seed_data):
    """Test that modifying permissions requires correct version (T3)."""
    repo = PermissionGroupRepository(db_session)
    tenant_id = seed_data["tenant_a_id"]

    # Create group
    group = await repo.create(tenant_id=tenant_id, name="Test Lock", version=1)

    # Set permissions with correct version
    await repo.set_group_permissions(
        group_id=group.id,
        tenant_id=tenant_id,
        permissions=[{"feature": PermissionFeature.TICKETS, "can_view": True}],
        expected_version=1,
    )

    # Check version incremented
    assert group.version == 2

    # Attempt with stale version -> ConflictError
    with pytest.raises(ConflictError):
        await repo.set_group_permissions(
            group_id=group.id,
            tenant_id=tenant_id,
            permissions=[{"feature": PermissionFeature.TICKETS, "can_view": True}],
            expected_version=1,  # expected is 2 now
        )


@pytest.mark.asyncio
async def test_repo_cross_tenant_add_member(db_session, seed_data):
    """Test that adding a user from another tenant is forbidden (T2)."""
    repo = PermissionGroupRepository(db_session)
    tenant_a_id = seed_data["tenant_a_id"]
    op_b = seed_data["op_b"]  # tenant B user

    # Create group in tenant A
    group = await repo.create(tenant_id=tenant_a_id, name="Group A")

    # Adding user from tenant B to group A should raise NotFoundError since user belongs to tenant B
    from src.core.errors import NotFoundError
    with pytest.raises(NotFoundError):
        await repo.add_member(group_id=group.id, user_id=op_b.id, tenant_id=tenant_a_id)


@pytest.mark.asyncio
async def test_repo_deleted_user_excluded_from_members(db_session, seed_data):
    """Test soft-deleted users are excluded from list_members (T6)."""
    repo = PermissionGroupRepository(db_session)
    tenant_a_id = seed_data["tenant_a_id"]
    op_a = seed_data["op_a"]

    # Create group and add member
    group = await repo.create(tenant_id=tenant_a_id, name="Group A")
    await repo.add_member(group_id=group.id, user_id=op_a.id, tenant_id=tenant_a_id)

    # Validate member listed
    members = await repo.list_members(group.id, tenant_a_id)
    assert len(members) == 1
    assert members[0].id == op_a.id

    # Soft delete the user
    op_a.deleted_at = datetime.utcnow()
    await db_session.commit()

    # Member should now be excluded
    members_after = await repo.list_members(group.id, tenant_a_id)
    assert len(members_after) == 0


# ── Permission Service Tests ──────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_service_plan_gate_first(db_session, seed_data):
    """Test subscription plan limits block permissions (T4)."""
    service = PermissionService(db_session)
    op_b = seed_data["op_b"]  # Tenant B has FREE plan (no mediuns feature)

    # Check permission for mediuns feature
    # It should be False even if we haven't set up groups, because plan has max_mediuns = 0
    has_perm = await service.check_permission(op_b, PermissionFeature.MEDIUNS, "view")
    assert has_perm is False


@pytest.mark.asyncio
async def test_service_backward_compatibility(db_session, seed_data):
    """Test operator with no groups retains full access."""
    service = PermissionService(db_session)
    op_a = seed_data["op_a"]  # belongs to Tenant A (PREMIUM plan)

    # Check permission for ticketing and mediuns (both enabled in Premium plan)
    assert await service.check_permission(op_a, PermissionFeature.TICKETS, "view") is True
    assert await service.check_permission(op_a, PermissionFeature.MEDIUNS, "edit") is True


@pytest.mark.asyncio
async def test_service_restricted_by_groups(db_session, seed_data):
    """Test that group assignment limits operator access and consolidates via OR logic."""
    repo = PermissionGroupRepository(db_session)
    service = PermissionService(db_session)
    tenant_a_id = seed_data["tenant_a_id"]
    op_a = seed_data["op_a"]

    # Create Group 1 (can view tickets)
    g1 = await repo.create(tenant_id=tenant_a_id, name="Ticket Viewers")
    await repo.set_group_permissions(
        group_id=g1.id,
        tenant_id=tenant_a_id,
        permissions=[{"feature": PermissionFeature.TICKETS, "can_view": True}],
        expected_version=1,
    )
    await repo.add_member(group_id=g1.id, user_id=op_a.id, tenant_id=tenant_a_id)

    # Now op_a is restricted to this group's permissions
    assert await service.check_permission(op_a, PermissionFeature.TICKETS, "view") is True
    assert await service.check_permission(op_a, PermissionFeature.TICKETS, "edit") is False
    assert await service.check_permission(op_a, PermissionFeature.MEDIUNS, "view") is False

    # Create Group 2 (can edit tickets and view mediuns)
    g2 = await repo.create(tenant_id=tenant_a_id, name="Helpers")
    await repo.set_group_permissions(
        group_id=g2.id,
        tenant_id=tenant_a_id,
        permissions=[
            {"feature": PermissionFeature.TICKETS, "can_edit": True},
            {"feature": PermissionFeature.MEDIUNS, "can_view": True},
        ],
        expected_version=1,
    )
    await repo.add_member(group_id=g2.id, user_id=op_a.id, tenant_id=tenant_a_id)

    # Permissions consolidated via OR
    assert await service.check_permission(op_a, PermissionFeature.TICKETS, "view") is True
    assert await service.check_permission(op_a, PermissionFeature.TICKETS, "edit") is True
    assert await service.check_permission(op_a, PermissionFeature.MEDIUNS, "view") is True
    assert await service.check_permission(op_a, PermissionFeature.MEDIUNS, "edit") is False


@pytest.mark.asyncio
async def test_service_impersonation_bypass(db_session, seed_data):
    """Test that impersonated tokens bypass group checking (T9)."""
    service = PermissionService(db_session)
    op_a = seed_data["op_a"]
    repo = PermissionGroupRepository(db_session)

    # Restrict user by putting them in an empty group
    g = await repo.create(tenant_id=seed_data["tenant_a_id"], name="Empty")
    await repo.add_member(group_id=g.id, user_id=op_a.id, tenant_id=seed_data["tenant_a_id"])

    # Normal check -> False
    assert await service.check_permission(op_a, PermissionFeature.TICKETS, "view") is False

    # Mock TokenData with impersonated_by tag
    class MockTokenData:
        impersonated_by = str(uuid4())

    # Impersonation check -> True
    assert await service.check_permission(op_a, PermissionFeature.TICKETS, "view", token_data=MockTokenData()) is True


# ── API Endpoint Tests ────────────────────────────────────────────────────────

def test_api_group_crud_and_conflict(test_app, seed_data):
    """Test group CRUD endpoints, including delete-members block conflict (G2)."""
    client = TestClient(test_app)
    admin_a = seed_data["admin_a"]
    op_a = seed_data["op_a"]

    # We mock get_current_user dependency injection
    test_app.dependency_overrides[get_current_user] = lambda: admin_a

    # 1. Create group
    res_create = client.post(
        "/api/v1/admin/permission-groups",
        json={"name": "Api Group", "description": "Desc"},
    )
    assert res_create.status_code == 201
    group_data = res_create.json()
    group_id = group_data["id"]
    assert group_data["name"] == "Api Group"

    # 2. Add member
    res_member = client.post(
        f"/api/v1/admin/permission-groups/{group_id}/members",
        json={"user_id": str(op_a.id)},
    )
    assert res_member.status_code == 200

    # 3. Attempt to delete group -> should raise 409 Conflict (G2)
    res_del_fail = client.delete(f"/api/v1/admin/permission-groups/{group_id}")
    assert res_del_fail.status_code == 409
    assert "ativos" in res_del_fail.json()["message"]

    # 4. Delete with force=true -> should succeed
    res_del_ok = client.delete(f"/api/v1/admin/permission-groups/{group_id}?force=true")
    assert res_del_ok.status_code == 204
