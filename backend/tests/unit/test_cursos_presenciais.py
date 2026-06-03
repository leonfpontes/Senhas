"""Unit tests for Presentail Courses and Participants API."""
import pytest
import uuid
from datetime import datetime, date
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
from fastapi import status

from src.main import create_app
from src.core.database import get_db
from src.api.dependencies import get_current_user
from src.models import User, UserRole, CursoPresencial, CursoParticipante
from src.models.subscriptions import PlanType, SubscriptionStatus
from tests.conftest import TENANT_ID, USER_ID, GIRA_ID

# Define test entities
CURSO_ID = uuid.uuid4()
PARTICIPANTE_ID = uuid.uuid4()

@pytest.fixture
def mock_admin_user():
    u = User()
    u.id = USER_ID
    u.tenant_id = TENANT_ID
    u.email = "admin@test.com"
    u.username = "admin"
    u.role = UserRole.ADMIN
    u.is_active = True
    return u

@pytest.fixture
def mock_operator_user():
    u = User()
    u.id = USER_ID
    u.tenant_id = TENANT_ID
    u.email = "operator@test.com"
    u.username = "operator"
    u.role = UserRole.OPERATOR
    u.is_active = True
    return u

@pytest.fixture
def mock_subscription():
    sub = MagicMock()
    sub.status = SubscriptionStatus.ACTIVE
    sub.plan = PlanType.PREMIUM
    return sub

@pytest.fixture
def mock_db_session():
    db = AsyncMock()
    db.execute = AsyncMock()
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    db.add = MagicMock()
    return db

@pytest.fixture
def client(mock_db_session):
    app = create_app()
    app.dependency_overrides[get_db] = lambda: mock_db_session
    yield TestClient(app, base_url="http://localhost")
    app.dependency_overrides.clear()

class TestCursosPresenciaisAPI:

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.cursos_presenciais.SubscriptionRepository")
    @patch("src.api.v1.admin.cursos_presenciais.CursoPresencialRepository")
    async def test_create_curso_presencial_success_as_admin(
        self, mock_repo_cls, mock_sub_repo_cls, client, mock_admin_user, mock_subscription
    ):
        # Override current user dependency
        client.app.dependency_overrides[get_current_user] = lambda: mock_admin_user

        # Mock subscription checks
        mock_sub_repo = AsyncMock()
        mock_sub_repo.get_by_tenant.return_value = mock_subscription
        mock_sub_repo_cls.return_value = mock_sub_repo

        # Mock repository create
        mock_repo = AsyncMock()
        mock_course = CursoPresencial(
            id=CURSO_ID,
            tenant_id=TENANT_ID,
            titulo="Curso de Doutrina",
            ementa="Aulas teóricas e práticas",
            data_inicio=datetime.utcnow(),
            is_active=True,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        mock_repo.create.return_value = mock_course
        mock_repo_cls.return_value = mock_repo

        response = client.post(
            "/api/v1/admin/cursos-presenciais",
            json={
                "titulo": "Curso de Doutrina",
                "ementa": "Aulas teóricas e práticas",
                "data_inicio": datetime.utcnow().isoformat(),
                "valor_mensalidade_padrao": 50.00,
            }
        )

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["titulo"] == "Curso de Doutrina"
        assert data["id"] == str(CURSO_ID)

    @pytest.mark.asyncio
    async def test_create_curso_presencial_forbidden_as_operator(
        self, client, mock_operator_user
    ):
        client.app.dependency_overrides[get_current_user] = lambda: mock_operator_user

        response = client.post(
            "/api/v1/admin/cursos-presenciais",
            json={
                "titulo": "Curso de Doutrina",
                "data_inicio": datetime.utcnow().isoformat(),
            }
        )

        assert response.status_code == status.HTTP_403_FORBIDDEN
        assert "cargo de administrador" in response.json()["message"]

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.cursos_presenciais.SubscriptionRepository")
    async def test_list_cursos_presenciais_success(
        self, mock_sub_repo_cls, client, mock_operator_user, mock_subscription, mock_db_session
    ):
        client.app.dependency_overrides[get_current_user] = lambda: mock_operator_user

        mock_sub_repo = AsyncMock()
        mock_sub_repo.get_by_tenant.return_value = mock_subscription
        mock_sub_repo_cls.return_value = mock_sub_repo

        # Mock select query result
        mock_course = CursoPresencial(
            id=CURSO_ID,
            tenant_id=TENANT_ID,
            titulo="Curso de Teologia",
            data_inicio=datetime.utcnow(),
            is_active=True,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [mock_course]
        mock_db_session.execute.return_value = mock_result

        response = client.get("/api/v1/admin/cursos-presenciais")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 1
        assert data[0]["titulo"] == "Curso de Teologia"

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.cursos_presenciais.SubscriptionRepository")
    @patch("src.api.v1.admin.cursos_presenciais.CursoPresencialRepository")
    @patch("src.api.v1.admin.cursos_presenciais.CursoParticipanteRepository")
    async def test_create_participante_success(
        self, mock_part_repo_cls, mock_course_repo_cls, mock_sub_repo_cls, client, mock_admin_user, mock_subscription
    ):
        client.app.dependency_overrides[get_current_user] = lambda: mock_admin_user

        mock_sub_repo = AsyncMock()
        mock_sub_repo.get_by_tenant.return_value = mock_subscription
        mock_sub_repo_cls.return_value = mock_sub_repo

        # Mock course check
        mock_course = CursoPresencial(
            id=CURSO_ID,
            tenant_id=TENANT_ID,
            titulo="Curso de Teologia",
            max_participantes=10,
            valor_mensalidade_padrao=Decimal('50.00'),
        )
        mock_course_repo = AsyncMock()
        mock_course_repo.get_by_id.return_value = mock_course
        mock_course_repo.get_participant_count.return_value = 4
        mock_course_repo_cls.return_value = mock_course_repo

        # Mock participant creation
        mock_part = CursoParticipante(
            id=PARTICIPANTE_ID,
            curso_id=CURSO_ID,
            tenant_id=TENANT_ID,
            nome="Zeca de Oxóssi",
            email="zeca@test.com",
            valor_mensalidade=Decimal('50.00'),
            pago=False,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        mock_part_repo = AsyncMock()
        mock_part_repo.create.return_value = mock_part
        mock_part_repo_cls.return_value = mock_part_repo

        response = client.post(
            f"/api/v1/admin/cursos-presenciais/{CURSO_ID}/participantes",
            json={
                "nome": "Zeca de Oxóssi",
                "email": "zeca@test.com",
            }
        )

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["nome"] == "Zeca de Oxóssi"
        assert data["valor_mensalidade"] == "50.00"

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.cursos_presenciais.SubscriptionRepository")
    @patch("src.api.v1.admin.cursos_presenciais.CursoPresencialRepository")
    async def test_create_participante_limit_exceeded(
        self, mock_course_repo_cls, mock_sub_repo_cls, client, mock_admin_user, mock_subscription
    ):
        client.app.dependency_overrides[get_current_user] = lambda: mock_admin_user

        mock_sub_repo = AsyncMock()
        mock_sub_repo.get_by_tenant.return_value = mock_subscription
        mock_sub_repo_cls.return_value = mock_sub_repo

        # Mock course with limit reached
        mock_course = CursoPresencial(
            id=CURSO_ID,
            tenant_id=TENANT_ID,
            titulo="Curso Lotado",
            max_participantes=5,
        )
        mock_course_repo = AsyncMock()
        mock_course_repo.get_by_id.return_value = mock_course
        mock_course_repo.get_participant_count.return_value = 5
        mock_course_repo_cls.return_value = mock_course_repo

        response = client.post(
            f"/api/v1/admin/cursos-presenciais/{CURSO_ID}/participantes",
            json={
                "nome": "Sérgio",
            }
        )

        assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
        assert "Limite de participantes atingido" in response.json()["detail"]

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.cursos_presenciais.SubscriptionRepository")
    @patch("src.api.v1.admin.cursos_presenciais.CursoPresencialRepository")
    @patch("src.api.v1.admin.cursos_presenciais.CursoParticipanteRepository")
    async def test_delete_participante_success(
        self, mock_part_repo_cls, mock_course_repo_cls, mock_sub_repo_cls, client, mock_admin_user, mock_subscription
    ):
        client.app.dependency_overrides[get_current_user] = lambda: mock_admin_user

        mock_sub_repo = AsyncMock()
        mock_sub_repo.get_by_tenant.return_value = mock_subscription
        mock_sub_repo_cls.return_value = mock_sub_repo

        mock_course = CursoPresencial(id=CURSO_ID, tenant_id=TENANT_ID)
        mock_course_repo = AsyncMock()
        mock_course_repo.get_by_id.return_value = mock_course
        mock_course_repo_cls.return_value = mock_course_repo

        mock_part = CursoParticipante(id=PARTICIPANTE_ID, curso_id=CURSO_ID, tenant_id=TENANT_ID, nome="Zeca")
        mock_part_repo = AsyncMock()
        mock_part_repo.get_by_id.return_value = mock_part
        mock_part_repo.delete.return_value = True
        mock_part_repo_cls.return_value = mock_part_repo

        response = client.delete(
            f"/api/v1/admin/cursos-presenciais/{CURSO_ID}/participantes/{PARTICIPANTE_ID}"
        )

        assert response.status_code == status.HTTP_204_NO_CONTENT
        mock_part_repo.delete.assert_called_once_with(PARTICIPANTE_ID, TENANT_ID, soft=True)

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.cursos_presenciais.SubscriptionRepository")
    @patch("src.api.v1.admin.cursos_presenciais.CursoPresencialRepository")
    @patch("src.api.v1.admin.cursos_presenciais.CursoParticipantePagamentoRepository")
    async def test_list_curso_mensalidades_success(
        self, mock_pag_repo_cls, mock_course_repo_cls, mock_sub_repo_cls, client, mock_operator_user, mock_subscription
    ):
        client.app.dependency_overrides[get_current_user] = lambda: mock_operator_user

        mock_sub_repo = AsyncMock()
        mock_sub_repo.get_by_tenant.return_value = mock_subscription
        mock_sub_repo_cls.return_value = mock_sub_repo

        mock_course = CursoPresencial(id=CURSO_ID, tenant_id=TENANT_ID, gerar_mensalidade=True)
        mock_course_repo = AsyncMock()
        mock_course_repo.get_by_id.return_value = mock_course
        mock_course_repo_cls.return_value = mock_course_repo

        mock_pag_repo = AsyncMock()
        mock_pag_repo.list_mes.return_value = [
            {
                "participante_id": PARTICIPANTE_ID,
                "participante_nome": "Zeca",
                "email": "zeca@test.com",
                "celular": None,
                "data_nascimento": None,
                "valor_mensalidade": Decimal("50.00"),
                "pagamento_id": uuid.uuid4(),
                "status": "pago",
                "data_pagamento": datetime.utcnow(),
                "valor_vigente": Decimal("50.00"),
                "valor_pago": Decimal("50.00"),
                "comprovante_filename": "comprovante.png",
                "observacao": "Pago em dia",
            }
        ]
        mock_pag_repo_cls.return_value = mock_pag_repo

        response = client.get(f"/api/v1/admin/cursos-presenciais/{CURSO_ID}/financeiro/mensalidades?mes=2026-06")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert len(data) == 1
        assert data[0]["participante_nome"] == "Zeca"
        assert data[0]["status"] == "pago"

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.cursos_presenciais.SubscriptionRepository")
    @patch("src.api.v1.admin.cursos_presenciais.CursoPresencialRepository")
    @patch("src.api.v1.admin.cursos_presenciais.CursoParticipanteRepository")
    @patch("src.api.v1.admin.cursos_presenciais.CursoParticipantePagamentoRepository")
    async def test_registrar_curso_pagamento_success(
        self, mock_pag_repo_cls, mock_part_repo_cls, mock_course_repo_cls, mock_sub_repo_cls, client, mock_admin_user, mock_subscription
    ):
        client.app.dependency_overrides[get_current_user] = lambda: mock_admin_user

        mock_sub_repo = AsyncMock()
        mock_sub_repo.get_by_tenant.return_value = mock_subscription
        mock_sub_repo_cls.return_value = mock_sub_repo

        mock_course = CursoPresencial(id=CURSO_ID, tenant_id=TENANT_ID, gerar_mensalidade=True)
        mock_course_repo = AsyncMock()
        mock_course_repo.get_by_id.return_value = mock_course
        mock_course_repo_cls.return_value = mock_course_repo

        mock_part = CursoParticipante(id=PARTICIPANTE_ID, curso_id=CURSO_ID, tenant_id=TENANT_ID, valor_mensalidade=Decimal("50.00"))
        mock_part_repo = AsyncMock()
        mock_part_repo.get_by_id.return_value = mock_part
        mock_part_repo_cls.return_value = mock_part_repo

        mock_pag = MagicMock()
        mock_pag.id = uuid.uuid4()
        mock_pag.status = MagicMock()
        mock_pag.status.value = "PAGO"

        mock_pag_repo = AsyncMock()
        mock_pag_repo.registrar_pagamento.return_value = mock_pag
        mock_pag_repo_cls.return_value = mock_pag_repo

        response = client.post(
            f"/api/v1/admin/cursos-presenciais/{CURSO_ID}/financeiro/mensalidades/{PARTICIPANTE_ID}/2026-06",
            data={
                "status": "PAGO",
                "valor_pago": 50.00,
                "data_pagamento": datetime.utcnow().isoformat(),
                "observacao": "Pago via PIX",
            }
        )

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["status"] == "PAGO"
        assert "id" in data

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.cursos_presenciais.SubscriptionRepository")
    @patch("src.api.v1.admin.cursos_presenciais.CursoPresencialRepository")
    @patch("src.api.v1.admin.cursos_presenciais.CursoParticipantePagamentoRepository")
    async def test_download_curso_comprovante_success(
        self, mock_pag_repo_cls, mock_course_repo_cls, mock_sub_repo_cls, client, mock_operator_user, mock_subscription
    ):
        client.app.dependency_overrides[get_current_user] = lambda: mock_operator_user

        mock_sub_repo = AsyncMock()
        mock_sub_repo.get_by_tenant.return_value = mock_subscription
        mock_sub_repo_cls.return_value = mock_sub_repo

        mock_course = CursoPresencial(id=CURSO_ID, tenant_id=TENANT_ID, gerar_mensalidade=True)
        mock_course_repo = AsyncMock()
        mock_course_repo.get_by_id.return_value = mock_course
        mock_course_repo_cls.return_value = mock_course_repo

        mock_pag = MagicMock()
        mock_pag.comprovante_data = b"comprovante_bytes"
        mock_pag.comprovante_mime = "image/png"
        mock_pag.comprovante_filename = "comprovante.png"

        mock_pag_repo = AsyncMock()
        mock_pag_repo.get_pagamento.return_value = mock_pag
        mock_pag_repo_cls.return_value = mock_pag_repo

        response = client.get(
            f"/api/v1/admin/cursos-presenciais/{CURSO_ID}/financeiro/mensalidades/{PARTICIPANTE_ID}/2026-06/comprovante"
        )

        assert response.status_code == status.HTTP_200_OK
        assert response.content == b"comprovante_bytes"
        assert response.headers["content-type"] == "image/png"

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.cursos_presenciais.SubscriptionRepository")
    @patch("src.api.v1.admin.cursos_presenciais.CursoPresencialRepository")
    @patch("src.api.v1.admin.cursos_presenciais.CursoParticipantePagamentoRepository")
    async def test_delete_curso_comprovante_success(
        self, mock_pag_repo_cls, mock_course_repo_cls, mock_sub_repo_cls, client, mock_admin_user, mock_subscription
    ):
        client.app.dependency_overrides[get_current_user] = lambda: mock_admin_user

        mock_sub_repo = AsyncMock()
        mock_sub_repo.get_by_tenant.return_value = mock_subscription
        mock_sub_repo_cls.return_value = mock_sub_repo

        mock_course = CursoPresencial(id=CURSO_ID, tenant_id=TENANT_ID, gerar_mensalidade=True)
        mock_course_repo = AsyncMock()
        mock_course_repo.get_by_id.return_value = mock_course
        mock_course_repo_cls.return_value = mock_course_repo

        pagamento_id = uuid.uuid4()
        mock_pag = MagicMock()
        mock_pag.id = pagamento_id

        mock_pag_repo = AsyncMock()
        mock_pag_repo.delete_comprovante.return_value = mock_pag
        mock_pag_repo_cls.return_value = mock_pag_repo

        response = client.delete(
            f"/api/v1/admin/cursos-presenciais/{CURSO_ID}/financeiro/mensalidades/{pagamento_id}/comprovante"
        )

        assert response.status_code == status.HTTP_204_NO_CONTENT

    @pytest.mark.asyncio
    @patch("src.api.v1.admin.cursos_presenciais.SubscriptionRepository")
    @patch("src.api.v1.admin.cursos_presenciais.CursoPresencialRepository")
    @patch("src.api.v1.admin.cursos_presenciais.CursoParticipantePagamentoRepository")
    async def test_get_curso_resumo_success(
        self, mock_pag_repo_cls, mock_course_repo_cls, mock_sub_repo_cls, client, mock_operator_user, mock_subscription
    ):
        client.app.dependency_overrides[get_current_user] = lambda: mock_operator_user

        mock_sub_repo = AsyncMock()
        mock_sub_repo.get_by_tenant.return_value = mock_subscription
        mock_sub_repo_cls.return_value = mock_sub_repo

        mock_course = CursoPresencial(id=CURSO_ID, tenant_id=TENANT_ID, gerar_mensalidade=True)
        mock_course_repo = AsyncMock()
        mock_course_repo.get_by_id.return_value = mock_course
        mock_course_repo_cls.return_value = mock_course_repo

        mock_pag_repo = AsyncMock()
        mock_pag_repo.get_resumo.return_value = {
            "historico": [
                {"mes": "2026-05", "esperado": 100.0, "arrecadado": 50.0, "inadimplentes": 1}
            ],
            "projecao": [
                {"mes": "2026-06", "projetado": 100.0}
            ],
            "config": {
                "valor_mensal": 100.0,
                "count_ativos": 2,
            }
        }
        mock_pag_repo_cls.return_value = mock_pag_repo

        response = client.get(f"/api/v1/admin/cursos-presenciais/{CURSO_ID}/financeiro/resumo")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "historico" in data
        assert "projecao" in data
        assert data["config"]["valor_mensal"] == 100.0

