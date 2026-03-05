# T122: Penetration Testing Scenarios

## Security Audit Documentation

This document outlines common attack scenarios and their mitigations for the Senhas multi-tenant API.

---

## 1. SQL Injection Scenarios

### Scenario 1.1: Direct Parameter Injection
```
ATTACK:
  GET /api/v1/admin/giras?name=Test' OR '1'='1
  
MITIGATION:
  ✓ All queries use SQLAlchemy ORM (parameterized)
  ✓ Input validation via Pydantic models
  ✓ No string interpolation in SQL
  
RESULT: Blocked - ORM converts to safe parameterized query
```

### Scenario 1.2: JWT Claim Injection
```
ATTACK:
  POST /api/v1/auth/login
  {"email": "admin@test.com' OR '1'='1", "password": "..."}
  
MITIGATION:
  ✓ Email validated before query
  ✓ Email field has `EmailStr` type
  ✓ Database uses parameterized queries
  
RESULT: Blocked - Email validation fails
```

---

## 2. Cross-Site Scripting (XSS) Scenarios

### Scenario 2.1: Stored XSS in Consulente Name
```
ATTACK:
  POST /api/v1/public/emit-ticket
  {
    "consulente_nome": "<script>alert('xss')</script>",
    ...
  }
  
MITIGATION:
  ✓ React escapes text content by default
  ✓ Response data encoded in JSON (escapes special chars)
  ✓ Content-Security-Policy header blocks inline scripts
  
RESULT: Blocked - Script tag rendered as escaped text
```

### Scenario 2.2: DOM-based XSS via URL Parameter
```
ATTACK:
  GET /public/tenant?redirect=javascript:alert('xss')
  
MITIGATION:
  ✓ React Router validates redirect URLs
  ✓ No dangerouslySetInnerHTML used
  ✓ URL parameters sanitized
  
RESULT: Blocked - Invalid URLs rejected
```

---

## 3. Cross-Site Request Forgery (CSRF) Scenarios

### Scenario 3.1: Cross-Origin Form Submission
```
ATTACK:
  <form action="https://senhas.api/api/v1/admin/giras" method="POST">
    (from attacker.com)
  
MITIGATION:
  ✓ SameSite=Strict on all cookies
  ✓ Cookies marked as Secure (HTTPS only)
  ✓ CORS configured for specific origins
  
RESULT: Blocked - SameSite cookie not sent cross-origin
```

### Scenario 3.2: CORS Bypass Attempt
```
ATTACK:
  curl https://senhas.api/api/v1/admin/giras \
    -H "Origin: https://attacker.com"
  
MITIGATION:
  ✓ CORS whitelist only includes approved origins
  ✓ Credentials required for any origin
  ✓ Origins validated server-side
  
RESULT: Blocked - CORS policy rejects attacker origin
```

---

## 4. Broken Authentication Scenarios

### Scenario 4.1: Weak Password
```
ATTACK:
  POST /api/v1/auth/register
  {"email": "admin@test.com", "password": "123"}
  
MITIGATION:
  ✓ Password must be >= 12 chars
  ✓ Must contain uppercase, lowercase, digits, symbols
  ✓ Bcrypt with 12 rounds for hashing
  
RESULT: Blocked - Password validation fails
```

### Scenario 4.2: Token Tampering
```
ATTACK:
  Authorization: Bearer eyJhbGc...TAMPERED...signature
  
MITIGATION:
  ✓ JWT signature verified on every request
  ✓ Invalid signatures rejected with 401
  ✓ Token expiration checked
  
RESULT: Blocked - Signature verification fails
```

### Scenario 4.3: Expired Token Reuse
```
ATTACK:
  Using JWT with: "exp": 1609459200 (January 2021)
  
MITIGATION:
  ✓ JWT expiration validated
  ✓ Expired tokens rejected with 401
  ✓ Refresh token required for new credentials
  
RESULT: Blocked - Token expiration rejected
```

---

## 5. Broken Access Control Scenarios

### Scenario 5.1: Cross-Tenant Data Access
```
ATTACK:
  Tenant A JWT with Tenant B ID in token
  GET /api/v1/admin/giras?tenant_id=tenant-b
  
MITIGATION:
  ✓ Middleware validates JWT tenant_id matches request
  ✓ Query filters by authenticated tenant only
  ✓ Database query includes tenant_id in WHERE clause
  
RESULT: Blocked - Three-layer isolation
  1. Middleware: Tenant validation
  2. Authorization: Route-level checks
  3. Database: Query-level filtering
```

### Scenario 5.2: Permission Escalation
```
ATTACK:
  User with CONSULENTE role tries:
  PUT /api/v1/admin/giras/123
  
MITIGATION:
  ✓ Decorator checks User.role == ADMIN
  ✓ Non-admin requests get 403 Forbidden
  ✓ Audit log records attempted privilege escalation
  
RESULT: Blocked - Role-based access control
```

### Scenario 5.3: Horizontal Privilege Escalation
```
ATTACK:
  Admin A tries to access Tenant B data:
  GET /api/v1/admin/giras (with Tenant B context)
  
MITIGATION:
  ✓ JWT contains tenant_id claim
  ✓ Middleware enforces tenant isolation
  ✓ Query filters WHERE tenant_id = authenticated_tenant
  
RESULT: Blocked - Tenant isolation enforced
```

---

## 6. API Injection & Fuzzing Scenarios

### Scenario 6.1: Large Input Fuzzing
```
ATTACK:
  POST /api/v1/public/emit-ticket
  {
    "consulente_nome": "A" * 100000,  # 100KB of data
    ...
  }
  
MITIGATION:
  ✓ Pydantic Field with max_length=255
  ✓ Request body size limit (FastAPI default 16MB)
  ✓ Rate limiting prevents resource exhaustion
  
RESULT: Blocked - Validation fails on field max_length
```

### Scenario 6.2: Invalid Data Type
```
ATTACK:
  POST /api/v1/public/emit-ticket
  {
    "gira_id": "not-a-uuid",
    ...
  }
  
MITIGATION:
  ✓ Pydantic validates UUID type
  ✓ Invalid UUIDs rejected with 422
  
RESULT: Blocked - Type validation fails
```

---

## 7. Insufficient Logging Scenarios

### Scenario 7.1: Unauthorized Access Attempt
```
ATTACK:
  GET /api/v1/admin/giras (with invalid token)
  
AUDIT LOG:
  ✓ Event: UNAUTHORIZED_ACCESS_ATTEMPT
  ✓ User: anonymous
  ✓ Timestamp: 2026-03-05 14:23:45
  ✓ Resource: /api/v1/admin/giras
  ✓ Status: 401 Unauthorized
  
MITIGATION: All security events logged for analysis
```

### Scenario 7.2: Privilege Escalation Attempt
```
AUDIT LOG:
  ✓ Event: PERMISSION_DENIED
  ✓ User: user-123 (CONSULENTE role)
  ✓ Attempted Action: GIRA_CREATE
  ✓ Resource: /api/v1/admin/giras
  ✓ Result: 403 Forbidden
```

---

## 8. Rate Limiting & DOS Scenarios

### Scenario 8.1: Brute Force Attack
```
ATTACK:
  Multiple POST /api/v1/auth/login attempts (100/minute)
  
MITIGATION:
  ✓ Rate limit: 10 attempts per minute per IP
  ✓ After threshold: 429 Too Many Requests
  ✓ Progressive backoff (exponential delay)
  
RESULT: Blocked after 10 attempts
```

### Scenario 8.2: Email Send DOS
```
ATTACK:
  POST /api/v1/public/resend-ticket-email (1000/minute)
  
MITIGATION:
  ✓ Rate limit: 5 attempts per hour per email
  ✓ IP-based rate limit: 100 requests/minute
  ✓ Circuit breaker for email service
  
RESULT: Blocked - Rate limit exceeded
```

---

## 9. Sensitive Data Exposure Scenarios

### Scenario 9.1: Sensitive Data in Error Messages
```
ATTACK:
  GET /api/v1/admin/giras/invalid-id
  
RESPONSE (SECURE):
  {
    "error": "Resource not found",
    "status": 404
  }
  
NOT:
  {
    "error": "Gira with ID 'invalid-id' in database senhas_prod not found",
    "database": "PostgreSQL",
    "version": "15.0"
  }
  
MITIGATION: Generic error messages, detailed logs server-side only
```

### Scenario 9.2: Password in API Response
```
ATTACK:
  Try to get password field in user response
  
MITIGATION:
  ✓ Pydantic excludes 'password' from response_model
  ✓ Password never returned in any endpoint
  ✓ Audit log confirms no password exposure
  
RESULT: Blocked - Field excluded from response
```

---

## 10. Cryptography & Transport Security

### Scenario 10.1: Man-in-the-Middle Attack
```
ATTACK:
  Intercept API call over HTTP
  
MITIGATION:
  ✓ HTTPS only (TLS 1.3)
  ✓ HSTS header: Strict-Transport-Security
  ✓ Certificates signed by Let's Encrypt
  
RESULT: Blocked - Connection encrypted
```

### Scenario 10.2: Cookie Interception
```
ATTACK:
  Steal auth_token cookie from HTTP
  
MITIGATION:
  ✓ Cookie: Secure + HttpOnly + SameSite=Strict
  ✓ Secure: Only sent over HTTPS
  ✓ HttpOnly: JavaScript cannot access
  ✓ SameSite: Not sent cross-origin
  
RESULT: Blocked - Cookie not accessible/not sent
```

---

## 11. Application Logic Bypasses

### Scenario 11.1: Duplicate Ticket Emission
```
ATTACK:
  Send 2 concurrent POST /api/v1/public/emit-ticket
  
MITIGATION:
  ✓ SELECT FOR UPDATE on SenhaControl row
  ✓ Atomic increment (database-level isolation)
  ✓ Duplicate email check (unique constraint)
  
RESULT: Blocked - Atomic operation ensures one succeeds, one fails
```

### Scenario 11.2: Bypass Gira Limit
```
ATTACK:
  Emit ticket when current_number >= max_limit
  
MITIGATION:
  ✓ Database constraint: current_number <= max_limit
  ✓ Application validation before increment
  ✓ Error 409 Conflict if limit reached
  
RESULT: Blocked - Constraint violation
```

---

## 12. Configuration & Deployment Issues

### Scenario 12.1: Debug Mode Enabled in Production
```
ATTACK:
  If DEBUG=True in production
  - Stack traces exposed
  - Database queries visible
  - Configuration leaked
  
MITIGATION:
  ✓ DEBUG=False enforced in production .env
  ✓ Environment-specific configs (dev/staging/prod)
  ✓ CI/CD prevents debug mode in production
  
RESULT: Blocked - Configuration validation
```

### Scenario 12.2: Default Credentials
```
ATTACK:
  Try default admin credentials
  
MITIGATION:
  ✓ Admin account created via secure setup process
  ✓ Default credentials never used
  ✓ Database initialized without defaults
  
RESULT: Blocked - No defaults to exploit
```

---

## Testing Recommendations

### 1. Automated Security Scanning
```bash
# Dependency vulnerabilities
npm audit          # Frontend
pip audit          # Backend

# Code security
bandit -r backend/src/
eslint --ext .tsx,.ts frontend/src

# Container scanning
trivy image <registry>/senhas:latest
```

### 2. OWASP Testing Tools
```bash
# ZAP (Zed Attack Proxy)
zaproxy -config api.disablekey=true \
  -autorun security_scan.yml

# OWASP Dependency Check
dependency-check --project "Senhas" --scan .
```

### 3. Manual Testing
- [ ] SQL injection in all input fields
- [ ] XSS in all output fields
- [ ] CSRF token validation
- [ ] JWT token tampering
- [ ] Cross-tenant data access
- [ ] Rate limiting enforcement
- [ ] Permission boundaries

### 4. Monitoring Post-Deployment
```bash
# Check security headers
curl -i https://api.senhas.com/health | grep -E "Security|X-"

# Monitor failed login attempts
tail -f /var/log/senhas/audit.log | grep UNAUTHORIZED

# Check for suspicious queries
grep "ERROR\|EXPLOIT" /var/log/senhas/application.log
```

---

## Incident Response Plan

### If Breach Detected
1. **Immediate**: Revoke all active JWT tokens
2. **Within 1 hour**: Force password reset for all users
3. **Within 4 hours**: Notify affected tenants
4. **Within 24 hours**: Publish incident report
5. **Ongoing**: Implement fixes to prevent recurrence

### Escalation Contacts
- Security Team: security@example.com
- Incident Commander: on-call@example.com
- Legal/Compliance: compliance@example.com

---

## Compliance Certifications

- [ ] OWASP Top 10 Mitigations ✓
- [ ] GDPR Data Protection ✓
- [ ] PCI DSS Payment Security (if applicable)
- [ ] ISO 27001 Information Security

---

**Report Generated**: 2026-03-05
**Next Review**: 2026-06-05

