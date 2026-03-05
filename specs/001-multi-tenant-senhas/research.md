# Research & Findings: Sistema Multi-Tenant de Gestão de Senhas

**Phase**: 0 - Research (Unknowns Resolution)  
**Date**: 2026-03-05  
**Status**: In Planning

---

## JWT Refresh Token Implementation

### Decision: Starlette Middleware + Frontend Interceptor Pattern

**What was unclear**: How to implement JWT refresh mechanism (24h access token + 30d refresh token)?

**Findings**:
- **Approach 1 (Google/Okta pattern)**: Automatic silent refresh via HTTP-only cookie + backend endpoint `/auth/refresh`
  - Pro: Secure (token never in JS), standard pattern, explicit refresh control
  - Con: Requires extra round-trip, complexity in error handling
  
- **Approach 2 (Facebook pattern)**: Longer-lived access token (24h) + proactive frontend refresh 5min before expiration
  - Pro: Fewer round-trips in happy path, predictable
  - Con: Requires client-side timer logic

- **Approach 3 (AWS Cognito)**: Implicit refresh on 401 response (access token expires → backend 401 → client refreshes transparently)
  - Pro: Simplest client code, automatic
  - Con: Every expired token = 2 requests (failed + refresh retry)

**Selected**: **Approach 1** (Starlette middleware + HTTP-only refresh cookie + silent refresh endpoint)
- Backend: FastAPI endpoint `POST /api/v1/auth/refresh` validates refresh token cookie, returns new access token
- Frontend: Axios/fetch interceptor catches 401 responses, calls refresh endpoint, retries original request
- Security: Access token in memory/sessionStorage, refresh token in HTTP-only cookie (not accessible to JS)

**Implementation**:
```python
# Backend: FastAPI middleware + router
from fastapi_jwt_extended import create_access_token

@router.post("/refresh")
async def refresh_token(request: Request, db: Session):
    # Extract refresh token from HTTP-only cookie
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(401, "Refresh token missing")
    # Validate token, get user
    try:
        payload = jwt.decode(refresh_token, settings.REFRESH_SECRET, algorithms=["HS256"])
    except JWTError:
        raise HTTPException(401, "Invalid refresh token")
    # Generate new access token
    new_access = create_access_token(data={"sub": payload["sub"]})
    return {"access_token": new_access}
```

```typescript
// Frontend: Axios interceptor
import axios from 'axios';

const api = axios.create({
  baseURL: process.env.API_URL,
  withCredentials: true  // Send cookies
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      try {
        const { data } = await api.post('/api/v1/auth/refresh');
        localStorage.setItem('access_token', data.access_token);
        original.headers['Authorization'] = `Bearer ${data.access_token}`;
        return api(original);
      } catch (err) {
        // Redirect to login
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);
```

---

## LGPD Data Retention & Right to Erasure

### Decision: Soft-Delete with Configurable Retention Window

**What was unclear**: Implementation strategy for LGPD compliance (data retention + right to erasure)?

**Findings**:
- **Approach 1 (Hard delete)**: Remove all PII immediately on request
  - Pro: Simplest, guaranteed privacy
  - Con: Cannot comply with audits, legal holds, dispute resolution (need history)
  - Risk: LGPD allows 30-60 day assessment period before deletion

- **Approach 2 (Pseudonimization)**: Keep operational data but remove identifiers
  - Pro: Maintains audit trail, operationally useful
  - Con: Pseudonimized person can re-identify if they log back in (tenants might not cooperate)

- **Approach 3 (Soft-delete + TTL)**: Mark as deleted, keep for retention window, then hard-delete
  - Pro: Compliance + auditability + legal safety
  - Con: Storage cost grows (mitigated by archiving to cold storage after 1 year)

**Selected**: **Approach 3** (Soft-Delete + TTL)
- Retention window: **Configurable per tenant** (default 12 months, min 6, max 24)
- Process: 
  1. User requests deletion via `/t/{slug}/privacy/deletion-request`
  2. Background job marks `consulentes.deleted_at = now()`, `tickets.deleted_at = now()`
  3. After retention window, hard-delete PII columns (keep only IDs in audit_logs for legal holds)
  4. Audit_logs retain action but pseudonymize actor details

**Implementation**:
```python
# models.py
class Consulente(Base):
    __tablename__ = "consulentes"
    id: UUID = Column(UUID, primary_key=True)
    tenant_id: UUID = Column(UUID, FK("tenants.id"))
    name: str = Column(String)
    phone_e164: str = Column(String)
    email: str = Column(String)
    deleted_at: Optional[datetime] = Column(DateTime, nullable=True)  # Soft-delete

# service
async def request_data_deletion(email: str, tenant_id: UUID, db: Session):
    c = db.query(Consulente).filter_by(tenant_id=tenant_id, email_lower=email.lower()).first()
    if c:
        c.deleted_at = datetime.utcnow()
        await audit_log(tenant_id=tenant_id, action="DELETE_REQUEST", entity_id=c.id)
    # Background job runs daily: delete records where deleted_at < now - retention_window
```

---

## E-mail Service Selection: Brevo vs Resend

### Decision: Brevo (Standard), Resend (Modern Alternative)

**What was unclear**: Which transactional e-mail service to use?

**Comparison**:

| Critério | Brevo | Resend |
|----------|-------|--------|
| **Free Tier** | 300/day (sufficient MVP) | 100/day (tight for MVP) |
| **Pricing** | Pay-as-you-go, cheap scale | Linear pricing, more predictable |
| **HTML Templates** | Old UI, but reliable | Modern, TypeScript-first (React Email) |
| **Brazil Support** | Excellent (European but BR office) | N/A in Brazil, but global |
| **Docs** | Comprehensive | Growing, modern |
| **Recommendation** | ✅ Primary (reliability) | Secondary (modern option) |

**Selected**: **Brevo** (primary) with **Resend** fallback
- Use Brevo SMTP/API as primary service
- Monitor delivery rate, fallback to Resend if Brevo experiences downtime
- Both support HTML inline, good template control

---

## Ticket Number Allocation Strategy

### Decision: Manual Increment with SELECT FOR UPDATE

**What was unclear**: Implement atomic ticket numbering without external sequence service?

**Options**:
- **PostgreSQL SEQUENCE**: `NEXTVAL('tickets_seq')` - built-in, but requires function call
- **Manual Increment**: `SELECT current_number FROM senha_controls WHERE id=? FOR UPDATE` then increment
- **External Service**: Redis, separate counter service (overkill for MVP)

**Selected**: **Manual Increment with SELECT FOR UPDATE**
- Why: Simple, no external deps, guaranteed atomicity with SERIALIZABLE isolation
- Implementation: Within transaction, lock the `senha_controls` row for the gira, check `current_number < max_senhas`, increment, emit ticket

**Implementation**:
```python
# services/ticket_service.py
async def emit_ticket(
    tenant_id: UUID,
    gira_id: UUID,
    consulente: Consulente,
    db: Session
) -> Ticket:
    try:
        # Start transaction with SERIALIZABLE isolation
        db.execute(text("BEGIN ISOLATION LEVEL SERIALIZABLE"))
        
        # Lock the senha_control row exclusively
        control = db.query(SenhaControl)\
            .filter_by(tenant_id=tenant_id, gira_id=gira_id)\
            .with_for_update()\
            .first()
        
        if not control:
            raise ValueError("Gira control not found")
        
        if control.current_number >= control.max_senhas:
            db.rollback()
            raise ValueError("Capacidade máxima atingida")
        
        # Increment and get number
        numero = control.current_number + 1
        control.current_number = numero
        
        # Create ticket
        ticket = Ticket(
            tenant_id=tenant_id,
            gira_id=gira_id,
            consulente_id=consulente.id,
            numero=numero,
            status=TicketStatus.RESERVED,
            issued_at=datetime.utcnow(UTC),
            ip_address=get_client_ip(),
            user_agent=get_user_agent()
        )
        
        db.add(ticket)
        db.flush()  # Get ID
        
        # Schedule e-mail sending
        await send_confirmation_email_async(ticket)
        
        db.commit()
        return ticket
    except Exception as e:
        db.rollback()
        logger.error(f"Ticket emission failed: {e}")
        raise
```

---

## Rate Limiting Implementation

### Decision: Nginx + Middleware Hybrid

**What was unclear**: Where to implement rate limiting (Nginx vs FastAPI middleware)?

**Decision**:
- **Public API** (`/api/v1/public/...`): Rate limit at **Nginx level** (performance, simple config)
  - 5 req/min per IP (ticket emission)
  - 2 req/min per IP (refresh/resend)
  - Bypass: Whitelist health check endpoints
  
- **Admin API** (`/api/v1/admin/...`): Rate limit at **FastAPI middleware** level (auth-aware)
  - 100 req/min per authenticated user (generous for admin, but prevent abuse)
  - Per-endpoint limits (extra restrictive on sensitive ops like cancel/reissue)

**Implementation**:
```nginx
# Nginx
limit_req_zone $binary_remote_addr zone=public_tickets:10m rate=5r/m;
limit_req_zone $binary_remote_addr zone=public_resend:10m rate=2r/m;

server {
    location /api/v1/public/tenants/.*/tickets$ {
        limit_req zone=public_tickets;
        proxy_pass http://backend:8000;
    }
    location /api/v1/public/tenants/.*/resend-email$ {
        limit_req zone=public_resend;
        proxy_pass http://backend:8000;
    }
}
```

---

## Deployment & VPS Architecture

### Decision: Single VPS with Docker Compose

**Stack**:
- **VPS**: Ubuntu 22.04 LTS, 2GB RAM minimum (upgradeable)
- **Reverse Proxy**: Nginx (HTTP reverse proxy, SSL termination, rate limiting)
- **Backend**: FastAPI + Uvicorn (async ASGI)
- **Frontend**: Next.js + Node.js runtime
- **Database**: PostgreSQL 15 (local, VPS-hosted)
- **E-mail**: External service (Brevo/Resend)
- **SSL**: Let's Encrypt (auto-renew via Certbot)

**Containerization**: Docker Compose for local dev + Docker stack for production deploy

---

## Summary of Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| JWT Refresh | Starlette middleware + HTTP-only cookie | Standard, secure, explicit control |
| Data Retention | Soft-delete + TTL (configurable) | LGPD compliant + audit trail |
| E-mail | Brevo primary + Resend fallback | Reliability + cost-effective |
| Ticket Numbers | SELECT FOR UPDATE in transaction | Simple, no external deps, atomic |
| Rate Limiting | Nginx + FastAPI middleware | Performance + security layered |
| Deployment | Single VPS with Docker | Cost-effective, sufficient for MVP scale |

All decisions are confirmed and ready for Phase 1 design (data-model.md, contracts).

---

**Status**: ✅ **Cleared for Phase 1 Design**
