# Implementation Tasks - Sistema Multi-Tenant de Gestão de Senhas

**Feature**: Sistema Multi-Tenant de Gestão de Senhas para Terreiros  
**Branch**: `001-multi-tenant-senhas`  
**Date Generated**: 2026-03-05  
**Total Tasks**: 87  
**Execution Strategy**: Phase-based with parallel opportunities per story

---

## Executive Summary

This document breaks down the feature specification into 87 actionable implementation tasks organized by **phase** and **user story priority**. Each task is independent, has clear file paths, and can be executed in parallel within its phase.

### Task Organization

- **Phase 1**: Project Setup & Infrastructure (9 tasks) - Blocking
- **Phase 2**: Foundational Backend (14 tasks) - Blocking
- **Phase 3**: User Story 1 - Public Ticket Emission [P1] (18 tasks) - Core Value
- **Phase 4**: User Story 2 - Admin Management [P2] (22 tasks) - Operations
- **Phase 5**: User Story 4 - UI/UX & Branding [P2] (14 tasks) - Parallel with Phase 4
- **Phase 6**: User Story 3 - Super Admin Platform [P3] (14 tasks) - Parallel with Phase 5
- **Phase 7**: Integration, Testing & Polish (7 tasks) - Final

### MVP Scope (Recommended)

- ✅ Phase 1-3: Public ticket emission (US1, P1) - **Complete MVP in 2 weeks**
- ✅ Phase 2-4 parallel: Admin dashboard (US2, P2) - **Add operations in week 3**
- ❌ Phase 6: Super admin (US3, P3) - **Defer for v1.1 (commercial scale)**

---

## Phase 1: Project Setup & Infrastructure

### Monorepo Structure & Configuration

- [ ] T001 [P] Create project directory structure: `/backend`, `/frontend`, `/packages/shared-types`, `/packages/shared-ui`
- [ ] T002 [P] Initialize backend FastAPI project with `backend/pyproject.toml` (dependencies: fastapi, sqlalchemy, pydantic, alembic, pytest, black, ruff)
- [ ] T003 [P] Initialize frontend Next.js project with `frontend/package.json` (next, typescript, mui, axios, jest, prettier, eslint)
- [ ] T004 [P] Create shared types package `packages/shared-types/package.json` with TypeScript interfaces for API contracts
- [ ] T005 [P] Create shared MUI theme package `packages/shared-ui/package.json` with Material-UI theme, buttons, layouts
- [ ] T006 [P] Configure Git hooks: `.husky/pre-commit` for black + ruff (backend) and prettier + eslint (frontend)
- [ ] T007 [P] Create Docker Compose stack `docker-compose.yml` with PostgreSQL 15, backend service, frontend service
- [ ] T008 [P] Create `.env.example` template with PostgreSQL credentials, JWT secrets, Brevo API key, Flask app settings
- [ ] T009 [P] Initialize Alembic migrations in `backend/alembic/` with env.py configured for PostgreSQL multi-tenant

### Database Foundation

- [ ] T010 Create PostgreSQL database initialization script `backend/alembic/versions/001_init_schema.py` with initial migration template (empty versions directory ready for Phase 2)

---

## Phase 2: Foundational Backend Infrastructure

### Database Models & ORM

- [ ] T011 [P] Implement Tenant model in `backend/src/models/tenants.py` with columns: id, slug (unique), name, branding (JSONB), plan, status, data_retention_days, metadata, created_at, updated_at, deleted_at
- [ ] T012 [P] Implement User model in `backend/src/models/users.py` with columns: id, tenant_id, email, password_hash, full_name, phone, role, is_active, email_verified, last_login_at, password_changed_at, failed_login_attempts, locked_until, created_at, updated_at, deleted_at
- [ ] T013 [P] Implement Gira model in `backend/src/models/giras.py` with columns: id, tenant_id, number, title, description, event_date, event_time, duration_minutes, location, capacity, total_tickets_issued, tickets_limit, completed_at, cancelled_at, notes, tags, created_at, updated_at, deleted_at
- [ ] T014 [P] Implement Consulente model in `backend/src/models/consulentes.py` with columns: id, tenant_id, name, name_normalized, phone_e164, email_lower, deleted_at, created_at, updated_at
- [ ] T015 [P] Implement Ticket model in `backend/src/models/tickets.py` with columns: id, tenant_id, gira_id, consulente_id, number, sequence, email_address, email_sent_at, email_opened_at, resend_count, last_resend_at, is_used, used_at, request_ip, user_agent, created_at, updated_at, deleted_at
- [ ] T016 [P] Implement SenhaControl model in `backend/src/models/senha_controls.py` with columns: id, tenant_id, gira_id, max_senhas, current_number (atomic counter), release_start_at, release_end_at, progress_visibility (enum), created_at, updated_at, deleted_at
- [ ] T017 [P] Implement AuditLog model in `backend/src/models/audit_logs.py` (immutable) with columns: id, tenant_id, actor_user_id, action, entity_type, entity_id, metadata (JSON), ip_address, user_agent, created_at
- [ ] T018 Create database migration `backend/alembic/versions/002_create_tables.py` generating all 7 tables from ORM models with indices and constraints

### Authentication & JWT Infrastructure

- [ ] T019 [P] Implement JWT utilities in `backend/src/security/jwt.py` with functions: `create_access_token(data, expires_in=24h)`, `create_refresh_token(data, expires_in=30d)`, `decode_token(token, secret)`
- [ ] T020 [P] Implement JWT refresh middleware in `backend/src/middleware/jwt_middleware.py` (Starlette) that extracts token from Authorization header, validates expiration, raises 401 if expired
- [ ] T021 [P] Implement password hashing utilities in `backend/src/security/password.py` with `hash_password(pwd)` and `verify_password(pwd, hash)` using bcrypt
- [ ] T022 [P] Create FastAPI dependency injection helpers in `backend/src/api/dependencies.py`: `get_db()`, `get_current_user()`, `require_role(role: str)` for route protection
- [ ] T023 Create `/api/v1/auth/login` endpoint in `backend/src/api/v1/auth/login.py`: accepts email+password, validates, returns access_token + sets refresh_token cookie (HTTP-only, 30d)
- [ ] T024 Create `/api/v1/auth/refresh` endpoint in `backend/src/api/v1/auth/refresh.py`: validates refresh_token cookie, returns new access_token, handles cookie refresh
- [ ] T025 Create `/api/v1/auth/logout` endpoint in `backend/src/api/v1/auth/logout.py`: invalidates refresh_token cookie, clears session

### Shared Infrastructure

- [ ] T026 [P] Create FastAPI app factory in `backend/src/main.py` with: route registration, middleware stack, CORS config, rate limiting, error handlers, startup/shutdown hooks
- [ ] T027 [P] Implement multi-tenant context extraction in `backend/src/middleware/tenant_context.py`: extracts tenant_id from JWT or URL slug, stores in request.state for all handlers
- [ ] T028 [P] Implement base repository pattern in `backend/src/repositories/base.py` with `BaseRepository(db, model)` class providing: `get_by_id()`, `list()`, `create()`, `update()`, `delete()`, `count()` - all filtering by tenant_id automatically
- [ ] T029 Create error handling & logging setup in `backend/src/core/logging.py` and `backend/src/core/errors.py` with custom exceptions, handlers, formatted responses

---

## Phase 3: User Story 1 - Consulente Retira Senha Pública [P1]

**Goal**: Enable public (no-login) ticket emission flow for consulentes  
**Independent Test Criteria**: Consulente accesses `/t/{slug}/senha`, fills 3-field form (name, phone, email), receives unique sequential ticket number, gets confirmation email  
**Parallel Execution**: All tasks except T040 (integration) can run in parallel across backend/frontend/email

### Database & ORM for US1

- [ ] T030 [P] Create SenhaControl repository in `backend/src/repositories/senha_controls.py` with atomic number increment method: `get_next_number_atomic(gira_id, tenant_id) → int` using SELECT FOR UPDATE
- [ ] T031 [P] Create Tickets repository in `backend/src/repositories/tickets.py` with: `create_ticket()`, `get_by_gira_and_consulente()`, `list_by_gira()`, `count_by_gira_and_status()`
- [ ] T032 [P] Create Consulentes repository in `backend/src/repositories/consulentes.py` with: `get_or_create(tenant_id, phone, email)`, `normalize_phone_e164()`, `normalize_email_lower()`

### Backend API Endpoints for US1

- [ ] T033 Create `/api/v1/public/tenants/{slug}/next-gira` endpoint in `backend/src/api/v1/public/giras.py`: returns next available gira with status/countdown info, rate limited 5 req/min
- [ ] T034 Create `/api/v1/public/tenants/{slug}/tickets` POST endpoint in `backend/src/api/v1/public/tickets.py`: accepts name/phone/email, normalizes, validates, creates ticket atomically, triggers email send, returns ticket details with rate limiting 5 req/min
- [ ] T035 Create `/api/v1/public/tenants/{slug}/tickets/{ticket_id}/resend-email` endpoint in `backend/src/api/v1/public/tickets.py`: resends confirmation email, rate limited 2 req/min per ticket
- [ ] T036 Create response validation models in `backend/src/schemas/tickets.py`: TicketEmissionRequest, TicketResponse, GiraResponse (Pydantic models with FR-015..023 validations)

### Email Service Integration for US1

- [ ] T037 [P] Implement email service abstraction in `backend/src/services/email.py`: interface `EmailService` with `send_html(to, subject, html_body, from_email)` returning result with tracking
- [ ] T038 [P] Implement Brevo email provider in `backend/src/services/brevo_provider.py`: inherits EmailService, calls Brevo API, handles retries + fallback to Resend
- [ ] T039 [P] Create email template renderer in `backend/src/templates/ticket_confirmation_email.py`: generates HTML inline (CSS embedded) with ticket number, gira details, consulente data, LGPD consent text + privacy link

### Frontend Pages for US1

- [ ] T040 [P] Create public tenant page layout in `frontend/pages/t/[slug]/index.tsx`: AppBar + hero section + "Como funciona" + next gira countdown widget + footer (no auth required)
- [ ] T041 [P] Create ticket emission form component in `frontend/components/TicketEmissionForm.tsx`: 3 fields (name, phone, email) + consent checkbox + submit button, normalizes data before POST
- [ ] T042 [P] Create ticket confirmation modal in `frontend/components/TicketConfirmationModal.tsx`: displays ticket number in large font, gira details, "E-mail enviado", resend email button
- [ ] T043 [P] Create gira countdown widget in `frontend/components/GiraCountdownWidget.tsx`: displays next-gira query result, countdown timer if not yet open, progress bar (PERCENT/COUNT/HIDDEN based on config), messages for esgotamento/encerramento
- [ ] T044 [P] Create public pages routing in `frontend/pages/t/[slug]/senha.tsx`: renders TicketEmissionForm + GiraCountdownWidget + response handling
- [ ] T045 [P] Implement API client in `frontend/services/api.ts`: axios instance with request/response interceptors, error handling, rate limit parsing, public endpoints for ticket emission

### Testing for US1 (Optional if requested)

- [ ] T046 [P] [US1] Create unit tests for Consulente repository in `backend/tests/repositories/test_consulentes.py`: phone normalization, email normalization, get_or_create idempotency
- [ ] T047 [P] [US1] Create integration test for ticket emission in `backend/tests/api/test_tickets_emission.py`: simulate 50 concurrent POST requests, verify unique sequential numbers, zero race conditions (validates FR-018, SC-002, SC-003)
- [ ] T048 [P] [US1] Create component tests for TicketEmissionForm in `frontend/tests/components/TicketEmissionForm.test.tsx`: form validation, data normalization, API calls, error handling

### US1 Integration & E2E

- [ ] T049 [US1] Create end-to-end test scenario in `backend/tests/e2e/test_us1_ticket_emission.py`: full flow from form submission → ticket creation → email sending → verification in audit_logs

---

## Phase 4: User Story 2 - Admin Gerencia Calendário e Senhas [P2]

**Goal**: Enable authenticated admin to CRUD giras, manage ticket operations, view/export data  
**Independent Test Criteria**: Admin logs in, creates gira, publishes it, views ticket list, exports CSV, cancelsa ticket, admin actions appear in audit logs  
**Parallel Execution**: Can be executed in parallel with Phase 5 (UI) and after Phase 3 (auth ready)

### Database & Repositories for US2

- [ ] T050 [P] Create Giras repository in `backend/src/repositories/giras.py` with: `create_gira()`, `list_by_tenant()`, `update_status()`, `count_issued_tickets()`, `list_tickets_for_gira()`, filtered by tenant_id
- [ ] T051 [P] Extend tickets repository with: `update_ticket_status()`, `bulk_export_csv()`, `list_with_filters(status, search, page, page_size)`, soft-delete on cancel

### Backend API Endpoints for US2 - Gira Management

- [ ] T052 Create `GET /api/v1/admin/{slug}/giras` endpoint in `backend/src/api/v1/admin/giras.py`: lists giras with pagination, filtering (status, date range), sorting, rate limited 100 req/min
- [ ] T053 Create `POST /api/v1/admin/{slug}/giras` endpoint in `backend/src/api/v1/admin/giras.py`: creates gira in DRAFT status, validates fields (FR-009), creates SenhaControl 1:1 relationship
- [ ] T054 Create `GET /api/v1/admin/{slug}/giras/{gira_id}` endpoint in `backend/src/api/v1/admin/giras.py`: returns gira details + ticket counts + SenhaControl config
- [ ] T055 Create `PUT /api/v1/admin/{slug}/giras/{gira_id}` endpoint in `backend/src/api/v1/admin/giras.py`: updates gira fields (title, description, notes) + SenhaControl config (max_senhas, release_start_at, progress_visibility)
- [ ] T056 Create `PUT /api/v1/admin/{slug}/giras/{gira_id}/publish` endpoint in `backend/src/api/v1/admin/giras.py`: validates SenhaControl exists (FR-013), sets status to PUBLISHED, registers action in audit_logs
- [ ] T057 Create `PUT /api/v1/admin/{slug}/giras/{gira_id}/cancel` endpoint in `backend/src/api/v1/admin/giras.py`: sets status to CANCELLED, preserves ticket history, logs action

### Backend API Endpoints for US2 - Ticket Management

- [ ] T058 Create `GET /api/v1/admin/{slug}/giras/{gira_id}/tickets` endpoint in `backend/src/api/v1/admin/tickets.py`: lists tickets with filters (status, search by name/phone/email), pagination, sorting by number ascending, rate limited 100 req/min
- [ ] T059 Create `GET /api/v1/admin/{slug}/giras/{gira_id}/tickets/export` endpoint in `backend/src/api/v1/admin/tickets.py`: returns CSV download with all ticket columns, respects permission checks
- [ ] T060 Create `PUT /api/v1/admin/{slug}/tickets/{ticket_id}/cancel` endpoint in `backend/src/api/v1/admin/tickets.py`: sets ticket status to CANCELLED, preserves number, logs action (FR-032)
- [ ] T061 Create `POST /api/v1/admin/{slug}/tickets/{ticket_id}/reissue` endpoint in `backend/src/api/v1/admin/tickets.py`: creates new ticket with new number (incremental), validates max_senhas not reached (FR-033), logs action
- [ ] T062 Create `POST /api/v1/admin/{slug}/tickets/{ticket_id}/resend-email` endpoint in `backend/src/api/v1/admin/tickets.py`: resends email, rate limited 5/hour per ticket, logs action (FR-035)

### Backend API Endpoints for US2 - Tenant Config

- [ ] T063 Create `GET /api/v1/admin/{slug}/config` endpoint in `backend/src/api/v1/admin/config.py`: returns tenant branding config (logo, colors, message_no_next_gira, privacy_policy_url), validates authz (ADMIN role or higher)
- [ ] T064 Create `PUT /api/v1/admin/{slug}/config` endpoint in `backend/src/api/v1/admin/config.py`: updates tenant config fields, validates logo URL format, color hex format, pre-uploads logo if provided, logs changes in audit_logs

### Audit Logging for US2

- [ ] T065 [P] Implement audit logging service in `backend/src/services/audit_log.py`: `log_action(tenant_id, user_id, action, entity_type, entity_id, metadata={})` writes to audit_logs table with timestamp + ip + user_agent
- [ ] T066 [P] Hook audit logging in repositories: all create/update/delete operations auto-call audit_log_service, capturing before/after JSON diffs in metadata

### Frontend Pages for US2 - Admin Dashboard

- [ ] T067 [P] Create authenticated admin layout in `frontend/pages/app/[slug]/layout.tsx`: AppBar + Drawer (nav items: Dashboard, Giras, Tickets, Config, Usuários, Auditoria), main content area
- [ ] T068 [P] Create giras list page in `frontend/pages/app/[slug]/giras/index.tsx`: list with filters (status, date), pagination, buttons (create, edit, publish, cancel), row actions
- [ ] T069 [P] Create gira creation/edit form in `frontend/pages/app/[slug]/giras/[gira_id]/edit.tsx`: form fields (title, description, event_date, event_time, location, capacity), SenhaControl fields (max_senhas, release_start_at, release_end_at, progress_visibility), status selector, save + cancel buttons
- [ ] T070 [P] Create tickets list page in `frontend/pages/app/[slug]/giras/[gira_id]/tickets.tsx`: list with filters (status, search), pagination, columns (number, name, phone, email, issued_at, status), row actions (cancel, reissue, resend-email), export CSV button
- [ ] T071 [P] Create admin config page in `frontend/pages/app/[slug]/config.tsx`: form for branding (logo upload, color pickers for primary/secondary/bg/text), message customization, save button, preview panel

### Frontend integration for US2

- [ ] T072 [P] Implement authenticated API client in `frontend/services/admin-api.ts`: extends public API client with JWT auth header injection, token refresh handling, rate limit display
- [ ] T073 [P] Create hooks for admin data in `frontend/hooks/useGiras.ts`, `useTickets.ts`: API fetch wrappers with caching, pagination, filtering state management
- [ ] T074 [P] Create authentication context in `frontend/contexts/AuthContext.tsx`: stores user, access_token, refresh_token, login/logout/register functions, protects routes
- [ ] T075 Create admin login page in `frontend/pages/app/[slug]/login.tsx`: email + password form, POST to `/api/v1/auth/login`, stores tokens, redirects to dashboard

### Testing for US2 (Optional)

- [ ] T076 [P] [US2] Create integration tests for gira operations in `backend/tests/api/test_giras_admin.py`: create/read/update/publish/cancel, verify status transitions, audit logging
- [ ] T077 [P] [US2] Create integration tests for ticket operations in `backend/tests/api/test_tickets_admin.py`: cancel, reissue, resend-email, verify constraints and audit logging
- [ ] T078 [P] [US2] Create component tests for admin dashboard in `frontend/tests/pages/admin.test.tsx`: page loads, giras list renders, form submission, API calls

### US2 Integration

- [ ] T079 [US2] Create end-to-end test in `backend/tests/e2e/test_us2_admin_operations.py`: full workflow (create gira → configure senhas → publish → emit tickets → cancel one → reissue → export CSV)

---

## Phase 5: User Story 4 - UI/UX Padronizada & Branding [P2]

**Goal**: Consistent Material-UI design across all pages, tenant branding applied dynamically  
**Independent Test Criteria**: Public pages show tenant logo/colors; admin pages show consistent layout (AppBar+Drawer); platform pages use neutral theme; mobile responsive (320px)  
**Parallel Execution**: Can be executed in parallel with Phase 4; relies on Phase 3 for public pages

### Shared UI Component Library

- [ ] T080 [P] Create MUI theme provider in `packages/shared-ui/theme.ts`: defines color palette, typography, spacing, breakpoints for responsive design
- [ ] T081 [P] Create AppBar component in `packages/shared-ui/components/AppBar.tsx`: props (logo_url, title, user_menu_items), mobile hamburger toggle, tenant branding integration
- [ ] T082 [P] Create Drawer navigation in `packages/shared-ui/components/Drawer.tsx`: navigation items, collapsible sections, active state indicators, mobile-responsive behavior
- [ ] T083 [P] Create page layout wrapper in `packages/shared-ui/components/PageLayout.tsx`: combines AppBar + Drawer + content area + footer, handles mobile Drawer toggling, theme switching
- [ ] T084 [P] Create MUI override theme in `packages/shared-ui/theme-overrides.ts` for branding: function `createTenantTheme(branding: BrandingConfig)` returns MUI theme with tenant colors

### Public Tenant Pages Styling

- [ ] T085 [P] Apply tenant branding in public pages: Update `/t/[slug]/index.tsx`, `/t/[slug]/senha.tsx` to use createTenantTheme(), display logo in AppBar, apply colors to buttons/progress bar/links
- [ ] T086 [P] Create responsive layouts for public pages: ensure 320px mobile display, test form on mobile (single column, full-width buttons), test countdown widget on mobile

### Admin Pages Styling

- [ ] T087 [P] Apply PageLayout wrapper in admin pages: Update all `/app/[slug]/...` pages to use PageLayout with AppBar + Drawer, implement responsive Drawer toggle on mobile breakpoints
- [ ] T088 [P] Implement responsive data tables in `frontend/components/DataTable.tsx`: MUI TableContainer with pagination, sorting, filtering, mobile stack view on small screens
- [ ] T089 [P] Create responsive forms: Update gira form, config form to be full-width on mobile, field stacking, accessible touch targets (48px minimum)
- [ ] T090 [P] Test mobile responsiveness: Use Chrome DevTools, Nexus 5 (320px), tablet (768px), desktop (1200px) viewports

### Platform Pages Styling

- [ ] T091 [P] Create platform theme in `frontend/contexts/ThemeContext.tsx`: toggles between tenant theme (if slug in URL) and neutral platform theme (if /platform in URL)
- [ ] T092 [P] Apply neutral theme to `/platform/...` pages: gray palette, generic logo, no tenant branding

### Accessibility & Branding Fallbacks

- [ ] T093 [P] Implement logo fallback: if logo_url unavailable or fails to load, display tenant initials in circle (using MUI Avatar) or platform logo
- [ ] T094 [P] Create brand color validation: ensure sufficient contrast ratio (WCAG AA) between primary + background + text, warn if not met

---

## Phase 6: User Story 3 - Super Admin Gerencia Plataforma Multi-Tenant [P3]

**Goal**: Enable super admin to onboard new tenants, manage global audit trail, manage tenant lifecycle  
**Independent Test Criteria**: Super admin logs in, creates new tenant with slug, creates admin user for that tenant, tenant admin logs in independently, audits consolidate all tenant actions  
**Parallel Execution**: Can be executed in parallel with Phase 5; non-blocking for MVP

### Database & Repositories for US3

- [ ] T095 [P] Create Tenants repository in `backend/src/repositories/tenants.py`: `create_tenant()`, `get_by_slug()`, `list_all()`, `update_config()`, `deactivate()` - validates slug uniqueness globally
- [ ] T096 [P] Extend Users repository for super admin: `create_user_with_temp_password()`, `force_password_change_on_next_login()`, `list_users_by_role()`

### Backend API Endpoints for US3 - Tenant Management

- [ ] T097 Create `POST /api/v1/platform/tenants` endpoint in `backend/src/api/v1/platform/tenants.py`: accepts slug, name, timezone, creates tenant, validates super admin authz (role check), returns tenant details
- [ ] T098 Create `GET /api/v1/platform/tenants` endpoint in `backend/src/api/v1/platform/tenants.py`: lists all tenants (super admin only), pagination, filtering, includes metrics (giras count, tickets count, users count)
- [ ] T099 Create `GET /api/v1/platform/tenants/{tenant_id}` endpoint in `backend/src/api/v1/platform/tenants.py`: returns tenant with details + summary stats
- [ ] T100 Create `PUT /api/v1/platform/tenants/{tenant_id}` endpoint in `backend/src/api/v1/platform/tenants.py`: edits tenant config (branding, data_retention_days, plan), super admin only
- [ ] T101 Create `PUT /api/v1/platform/tenants/{tenant_id}/deactivate` endpoint in `backend/src/api/v1/platform/tenants.py`: sets is_active=false, blocks all access to that tenant

### Backend API Endpoints for US3 - User Management within Tenant

- [ ] T102 Create `POST /api/v1/platform/tenants/{tenant_id}/users` endpoint in `backend/src/api/v1/platform/users.py`: creates admin user with temp password, super admin creates for any tenant
- [ ] T103 Create `GET /api/v1/platform/tenants/{tenant_id}/users` endpoint in `backend/src/api/v1/platform/users.py`: lists users for tenant, super admin only
- [ ] T104 Create `PUT /api/v1/platform/users/{user_id}/force-password-reset` endpoint in `backend/src/api/v1/platform/users.py`: marks next login requires password change, super admin only

### Backend API Endpoints for US3 - Audit Trail

- [ ] T105 Create `GET /api/v1/platform/audit-logs` endpoint in `backend/src/api/v1/platform/audit_logs.py`: returns consolidated audit trail for all tenants, filters by tenant_id, actor, action, period, pagination, super admin only (FR-046)
- [ ] T106 Create `GET /api/v1/platform/audit-logs/export` endpoint in `backend/src/api/v1/platform/audit_logs.py`: exports audit logs as CSV, applies same filtering

### Frontend Pages for US3 - Platform Admin

- [ ] T107 [P] Create platform admin login in `frontend/pages/platform/login.tsx`: similar to tenant admin login, but for SUPER_ADMIN role
- [ ] T108 [P] Create tenants list page in `frontend/pages/platform/tenants/index.tsx`: list all tenants, columns (slug, name, plan, status, created_at, giras_count, tickets_count, users_count), actions (view, edit, deactivate)
- [ ] T109 [P] Create tenant creation form in `frontend/pages/platform/tenants/create.tsx`: form (slug, name, timezone, logo_url, colors), submit creates tenant, generates temp admin password
- [ ] T110 [P] Create tenant edit page in `frontend/pages/platform/tenants/[tenant_id]/edit.tsx`: edit branding, data_retention_days, plan, status
- [ ] T111 [P] Create platform audit page in `frontend/pages/platform/audit-logs.tsx`: audit logs for all tenants, filters (tenant_id, actor, action, date_range), export button, pagination

### Testing for US3 (Optional)

- [ ] T112 [P] [US3] Create integration tests for tenant operations in `backend/tests/api/test_platform_tenants.py`: create, list, update, deactivate, verify isolation
- [ ] T113 [P] [US3] Create integration tests for audit trail in `backend/tests/api/test_platform_audit.py`: multi-tenant audit consolidation, filtering
- [ ] T114 [P] [US3] Create component tests for platform admin pages in `frontend/tests/pages/platform.test.tsx`: tenant list, creation form, audit view

---

## Phase 7: Integration, Testing & Deployment

### End-to-End Testing

- [ ] T115 Create comprehensive E2E test suite in `backend/tests/e2e/test_full_workflow.py`: simulates real user journey (public emission → admin operations → super admin oversight)
- [ ] T116 Create E2E tests with Cypress/Playwright in `frontend/tests/e2e/full-flow.cy.ts`: public form submission → admin login → ticket management → logout

### Performance & Concurrency Validation

- [ ] T117 Run load test in `backend/tests/performance/load_test.py`: simulate 50+ concurrent ticket emissions, verify <500ms p95 latency (SC-013), zero duplicate numbers (SC-003)
- [ ] T118 Run stress test for database: 1000 tickets in background, verify queries remain <100ms with indices

### Security Audits

- [ ] T119 Perform JWT security validation: test token expiration (24h access, 30d refresh), refresh token rotation, revocation on logout
- [ ] T120 Perform RBAC validation: non-admin user tries to access admin endpoints → 403, cross-tenant access attempts blocked, super admin can access all

### Deployment & DevOps

- [ ] T121 Create GitHub Actions CI/CD pipeline in `.github/workflows/test-lint-deploy.yml`: runs pytest + eslint + prettier on every commit, deploys on tag
- [ ] T122 Deploy backend to VPS: Nginx reverse proxy, Docker container, Let's Encrypt SSL, health checks
- [ ] T123 Deploy frontend to Vercel or same VPS: optimized build, CDN, auto-redeploy on main branch

### Documentation & Handoff

- [ ] T124 Update `backend/README.md`: setup instructions, env vars, running tests, architecture overview
- [ ] T125 Update `frontend/README.md`: setup instructions, env vars, running tests, component structure
- [ ] T126 Create API documentation in `backend/docs/API.md`: endpoint reference, auth flow, error codes, examples (or auto-generated from OpenAPI schema)
- [ ] T127 Create deployment runbook in `docs/DEPLOYMENT.md`: VPS setup, database initialization, environment configuration, backup strategy

### Monitoring & Observability (Post-MVP)

- [ ] T128 [P] Setup structured logging in `backend/src/core/logging.py`: JSON logs with trace IDs, correlate requests across services
- [ ] T129 [P] Setup APM/metrics collection: FastAPI middleware for latency, throughput, error rates

---

## Dependency Graph & Execution Strategy

### Phase Execution Order (Blocking)

```
Phase 1 (Setup)
    ↓
Phase 2 (Foundation)
    ├→ Phase 3 (US1 - Public Ticket Emission) [P1]
    │   ├→ Phase 4 (US2 - Admin Management) [P2]  ← Can start after Phase 3 auth
    │   └→ Phase 5 (US4 - UI/UX) [P2]             ← Can start after Phase 3 public pages
    │       └→ Phase 6 (US3 - Super Admin) [P3]   ← Can start after Phase 5
    └→ Phase 7 (Integration & Deployment)
```

### Parallelization Opportunities (Recommended)

**Week 1:**
- [PARALLEL] T001-T009: Monorepo setup + Docker (8h)
- [SEQUENTIAL] T010-T029: Database models + Auth (16h)

**Week 2:**
- [PARALLEL] T030-T049: US1 Backend + Frontend (16h)

**Week 3:**
- [PARALLEL] T050-T108: US2 Backend + US4 UI/UX (20h)

**Week 4:**
- [PARALLEL] T109-T125: Platform admin (US3) + E2E tests (16h)

**MVP Completion: End of Week 3** (US1 + US2, Phase 7 partial)  
**Full Platform: End of Week 4** (All features, Phase 7 complete)

### Independent Task Groups (Can run in parallel)

**Within Phase 3 (after Phase 2):**
- T030-T032: Database (backend)
- T033-T036: API endpoints (backend)
- T037-T039: Email service (backend)
- T040-T045: Frontend pages (frontend)
- T046-T048: Tests (both, independent)

**Within Phase 4 (after Phase 3):**
- T050-T066: Backend repos + audit (backend)
- T052-T064: API endpoints (backend)
- T067-T075: Admin pages (frontend)
- T076-T078: Tests (both)

---

## Testing Strategy

### Unit Tests
- Database models validation (ORM constraints)
- Phone/email normalization (Consulente repo)
- Password hashing (security.password)
- JWT token generation/validation (security.jwt)

### Integration Tests
- Full API flows (US1 ticket emission, US2 admin ops)
- Database transactions (SELECT FOR UPDATE atomicity)
- Email service retry logic
- Rate limiting enforcement
- Multi-tenant isolation (cross-tenant queries blocked)

### E2E Tests
- Complete user journeys (form → ticket → email → admin view)
- Browser automation (Cypress/Playwright)
- Mobile responsiveness assertions

### Performance Tests
- Concurrent ticket emission (50 concurrent, <500ms p95)
- Database query latency (<100ms with indices)
- API response time (<5s for 95% of requests)

### Security Tests
- JWT expiration enforcement
- RBAC permission boundaries
- Cross-tenant access prevention
- SQL injection prevention (ORM protections)
- Password validation (minimum 12 chars, complexity)

---

## Success Criteria Mapping

| Success Criteria | Task(s) | Validation |
|------------------|---------|-----------|
| SC-001: 95% E2E <60s | T116, T117 | E2E test timing |
| SC-002: 50 concurrent safe | T117 | Load test zero duplicates |
| SC-003: Zero duplicate numbers | T031, T046, T047, T117 | SELECT FOR UPDATE test, concurrency test |
| SC-004: 95% email delivery | T037, T038, T052 | Email service logs, resend tracking |
| SC-006: 100% audit logging | T065, T066, T056 etc | Audit_logs populated on all actions |
| SC-008: Mobile responsive (320px) | T085, T086, T089-T090 | Viewport testing, responsive components |
| SC-011: 100% cross-tenant prevention | T120, T103 | RBAC tests, tenant isolation tests |
| SC-012: 99.5% uptime | T121, T122 | Health checks, monitoring setup |
| SC-013: <500ms p95 latency | T117, T118 | Performance tests |

---

## MVP Scope & Go/No-Go Criteria

### ✅ MVP Must-Have (Phases 1-4)

- [x] Public ticket emission (US1) - complete 3-field form flow
- [x] Admin gira + ticket management (US2) - CRUD giras, cancel/reissue tickets  
- [x] Consistent UI/UX (US4) - AppBar, Drawer, branding
- [x] JWT authentication - access token + refresh cookie
- [x] Audit logging - all admin actions tracked
- [x] Email notifications - ticket confirmation + resend capability
- [x] Database schema - 7 tables with constraints + indices
- [x] Rate limiting - public 5 req/min, admin 100 req/min

### ❌ v1.1 Defer (Phase 6)

- [ ] Super admin platform (US3) - can be added after MVP launch
- [ ] Multi-tenant onboarding UI - can use direct API calls initially
- [ ] Advanced analytics - can be rolled out separately

### Go/No-Go Gate (End of Week 3)

- ✅ All Phase 1-2 tests passing (Database, Auth, Repos)
- ✅ All Phase 3 E2E tests passing (Public ticket emission)
- ✅ All Phase 4 integration tests passing (Admin ops)
- ✅ Phase 5 responsive design QA passed (mobile 320px tested)
- ✅ Performance test: 50 concurrent emissions, <500ms p95, zero duplicates
- ✅ Security audit: RBAC tested, cross-tenant tested
- ⚠️  Phase 6 (Super Admin) can be deferred to v1.1

---

## Notes & Conventions

- **Task ID Format**: T### (001-129) in execution order
- **[P] Marker**: Task is parallelizable (no dependencies on other incomplete tasks)
- **[US#] Label**: Task belongs to User Story # (only in Phase 3-6)
- **File Paths**: Relative to repo root; use `/backend/`, `/frontend/`, `/packages/` prefixes
- **Success Metric**: Each task has clear acceptance criteria (return type, output, side effects)
- **Git Workflow**: Feature branch `001-multi-tenant-senhas`, atomic commits per task set, squash before merge

---

**Document Version**: 1.0  
**Generated by**: speckit.tasks workflow  
**Next Steps**: Execute Phase 1 tasks, confirm infrastructure ready, proceed to Phase 2 (foundation)
