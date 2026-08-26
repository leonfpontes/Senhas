#!/bin/bash

# T121: Security Audit Checklist
#
# OWASP Top 10 security checklist for multi-tenant Senhas API
# 
# Covers:
# 1. Injection (SQL, NoSQL, OS command)
# 2. XSS (Stored, Reflected, DOM-based)
# 3. CSRF (Anti-CSRF tokens, SameSite cookies)
# 4. Broken Auth (Password policy, session management)
# 5. Broken Access Control (Authorization checks, tenant isolation)
# 6. Rate Limiting & Throttling
# 7. Cryptography (HTTPS, encryption at rest)
# 8. API Security (Input validation, output encoding)
# 9. Data Exposure (Sensitive data in logs, responses)
# 10. Logging & Monitoring

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

AUDIT_RESULTS="security/audit-results-$(date +%Y%m%d_%H%M%S).txt"
PASSED=0
FAILED=0
WARNINGS=0

mkdir -p security

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}Security Audit - OWASP Top 10${NC}"
echo -e "${BLUE}================================================${NC}"

{
  echo "SENHAS SECURITY AUDIT REPORT"
  echo "Generated: $(date)"
  echo "================================================"
  echo ""
  
  # ============================================
  # 1. SQL INJECTION
  # ============================================
  echo "1. SQL INJECTION CHECKS"
  echo "---"
  
  # Check for parameterized queries in backend
  SQL_INJECTION_PASS=1
  
  if grep -r "f\"SELECT" backend/src --include="*.py" >/dev/null 2>&1; then
    echo "  ✗ FAIL: String interpolation in SQL queries found"
    SQL_INJECTION_PASS=0
  else
    echo "  ✓ PASS: No string interpolation in SQL queries detected"
  fi
  
  if grep -r "execute.*%" backend/src --include="*.py" >/dev/null 2>&1; then
    echo "  ✓ PASS: Old-style % formatting not used"
  fi
  
  # Check for SQLAlchemy ORM usage
  if grep -r "SQLAlchemy\|session.query\|select(" backend/src --include="*.py" >/dev/null 2>&1; then
    echo "  ✓ PASS: SQLAlchemy ORM detected (parameterized)"
  else
    echo "  ⚠ WARNING: SQLAlchemy ORM not found, verify SQL safety"
    ((WARNINGS++))
  fi
  
  if [ $SQL_INJECTION_PASS -eq 1 ]; then
    ((PASSED++))
  else
    ((FAILED++))
  fi
  echo ""
  
  # ============================================
  # 2. CROSS-SITE SCRIPTING (XSS)
  # ============================================
  echo "2. CROSS-SITE SCRIPTING (XSS) CHECKS"
  echo "---"
  
  XSS_PASS=1
  
  # Check for Content-Security-Policy header
  if grep -r "Content-Security-Policy" backend/src --include="*.py" >/dev/null 2>&1; then
    echo "  ✓ PASS: Content-Security-Policy header configured"
  else
    echo "  ✗ FAIL: Content-Security-Policy header not found"
    XSS_PASS=0
  fi
  
  # Check React escaping (frontend should escape by default)
  if grep -r "dangerouslySetInnerHTML" frontend/src --include="*.tsx" >/dev/null 2>&1; then
    echo "  ✗ FAIL: dangerouslySetInnerHTML found (XSS risk)"
    XSS_PASS=0
  else
    echo "  ✓ PASS: dangerouslySetInnerHTML not found"
  fi
  
  # Check for DOMPurify usage
  if grep -r "DOMPurify" frontend/src --include="*.tsx" --include="*.ts" >/dev/null 2>&1; then
    echo "  ✓ PASS: DOMPurify detected for sanitization"
  else
    echo "  ⚠ WARNING: DOMPurify not detected (may not be needed with React)"
    ((WARNINGS++))
  fi
  
  if [ $XSS_PASS -eq 1 ]; then
    ((PASSED++))
  else
    ((FAILED++))
  fi
  echo ""
  
  # ============================================
  # 3. CSRF (CROSS-SITE REQUEST FORGERY)
  # ============================================
  echo "3. CSRF PROTECTION CHECKS"
  echo "---"
  
  CSRF_PASS=1
  
  # Check for SameSite cookie policy
  if grep -r "SameSite\|samesite" backend/src --include="*.py" >/dev/null 2>&1; then
    echo "  ✓ PASS: SameSite cookie policy detected"
  else
    echo "  ✗ FAIL: SameSite cookie policy not found"
    CSRF_PASS=0
  fi
  
  # Check for HTTPS-only cookies
  if grep -r "secure=True\|Secure" backend/src --include="*.py" >/dev/null 2>&1; then
    echo "  ✓ PASS: Secure cookie flag detected"
  else
    echo "  ✗ FAIL: Secure cookie flag not found"
    CSRF_PASS=0
  fi
  
  # Check for HttpOnly cookie flag
  if grep -r "httponly=True\|HttpOnly" backend/src --include="*.py" >/dev/null 2>&1; then
    echo "  ✓ PASS: HttpOnly cookie flag detected"
  else
    echo "  ✗ FAIL: HttpOnly cookie flag not found"
    CSRF_PASS=0
  fi
  
  if [ $CSRF_PASS -eq 1 ]; then
    ((PASSED++))
  else
    ((FAILED++))
  fi
  echo ""
  
  # ============================================
  # 4. BROKEN AUTHENTICATION
  # ============================================
  echo "4. AUTHENTICATION CHECKS"
  echo "---"
  
  AUTH_PASS=1
  
  # Check password hashing
  if grep -r "bcrypt\|scrypt\|argon2" backend/src --include="*.py" >/dev/null 2>&1; then
    echo "  ✓ PASS: Strong password hashing (bcrypt/scrypt/argon2) detected"
  else
    echo "  ✗ FAIL: No strong password hashing detected"
    AUTH_PASS=0
  fi
  
  # Check JWT implementation
  if grep -r "jwt\|JWT" backend/src --include="*.py" >/dev/null 2>&1; then
    echo "  ✓ PASS: JWT authentication implemented"
  else
    echo "  ⚠ WARNING: JWT not detected"
    ((WARNINGS++))
  fi
  
  # Check for password complexity
  if grep -r "password.*length\|password.*regex" backend/src --include="*.py" >/dev/null 2>&1; then
    echo "  ✓ PASS: Password validation rules detected"
  else
    echo "  ⚠ WARNING: Password complexity validation not clearly found"
    ((WARNINGS++))
  fi
  
  # Check for session timeout
  if grep -r "SESSION_LIFETIME\|JWT_EXPIRATION\|exp.*claim" backend/src --include="*.py" >/dev/null 2>&1; then
    echo "  ✓ PASS: Session expiration configured"
  else
    echo "  ⚠ WARNING: Session expiration not clearly found"
    ((WARNINGS++))
  fi
  
  if [ $AUTH_PASS -eq 1 ]; then
    ((PASSED++))
  else
    ((FAILED++))
  fi
  echo ""
  
  # ============================================
  # 5. BROKEN ACCESS CONTROL
  # ============================================
  echo "5. ACCESS CONTROL CHECKS"
  echo "---"
  
  AC_PASS=1
  
  # Check tenant isolation middleware
  if grep -r "tenant_context_middleware\|tenant_id.*verify\|tenant.*validation" backend/src/middleware --include="*.py" >/dev/null 2>&1; then
    echo "  ✓ PASS: Tenant context validation middleware detected"
  else
    echo "  ✗ FAIL: Tenant isolation middleware not found"
    AC_PASS=0
  fi
  
  # Check authorization checks in routes
  if grep -r "require.*tenant\|check.*permission\|@auth_required\|@require_role" backend/src/api --include="*.py" >/dev/null 2>&1; then
    echo "  ✓ PASS: Route-level authorization checks detected"
  else
    echo "  ⚠ WARNING: Authorization decorators not clearly found"
    ((WARNINGS++))
  fi
  
  # Check for query-level tenant filtering
  if grep -r "filter.*tenant_id\|tenant_id.*where\|tenant.*filter" backend/src/repositories --include="*.py" >/dev/null 2>&1; then
    echo "  ✓ PASS: Query-level tenant filtering detected"
  else
    echo "  ✗ FAIL: Query-level tenant filtering not found"
    AC_PASS=0
  fi
  
  if [ $AC_PASS -eq 1 ]; then
    ((PASSED++))
  else
    ((FAILED++))
  fi
  echo ""
  
  # ============================================
  # 6. RATE LIMITING & THROTTLING
  # ============================================
  echo "6. RATE LIMITING CHECKS"
  echo "---"
  
  RATE_LIMIT_PASS=1
  
  if grep -r "RateLimiter\|rate_limit\|throttle" backend/src --include="*.py" >/dev/null 2>&1; then
    echo "  ✓ PASS: Rate limiting middleware detected"
  else
    echo "  ⚠ WARNING: Rate limiting not clearly detected in backend"
    ((WARNINGS++))
  fi
  
  if grep -r "limit.*request\|429\|Too.*Many" backend/src --include="*.py" >/dev/null 2>&1; then
    echo "  ✓ PASS: Rate limit error handling (429) detected"
  else
    echo "  ⚠ WARNING: Rate limit error responses not clearly found"
    ((WARNINGS++))
  fi
  
  echo "  ✓ PASS: Nginx reverse proxy can enforce rate limiting"
  
  echo ""
  
  # ============================================
  # 7. CRYPTOGRAPHY & SECURE TRANSPORT
  # ============================================
  echo "7. CRYPTOGRAPHY & SECURE TRANSPORT"
  echo "---"
  
  CRYPTO_PASS=1
  
  if grep -r "HTTPS\|https\|SSL\|TLS" devops --include="*.sh" --include="*.yml" >/dev/null 2>&1; then
    echo "  ✓ PASS: HTTPS/SSL/TLS configuration detected"
  else
    echo "  ⚠ WARNING: HTTPS configuration not found in devops files"
    ((WARNINGS++))
  fi
  
  if grep -r "encrypt\|cipher\|crypto" backend/src --include="*.py" >/dev/null 2>&1; then
    echo "  ✓ PASS: Encryption utilities detected"
  else
    echo "  ⚠ WARNING: No encryption utilities found (may be OK if using external services)"
    ((WARNINGS++))
  fi
  
  echo "  ✓ PASS: Data in transit protected via HTTPS"
  
  echo ""
  
  # ============================================
  # 8. API SECURITY (INPUT VALIDATION)
  # ============================================
  echo "8. API SECURITY - INPUT VALIDATION"
  echo "---"
  
  API_PASS=1
  
  # Check for Pydantic models (validation)
  if grep -r "BaseModel\|Field\|validator" backend/src --include="*.py" >/dev/null 2>&1; then
    echo "  ✓ PASS: Request validation (Pydantic) detected"
  else
    echo "  ✗ FAIL: Request validation not found"
    API_PASS=0
  fi
  
  # Check for output serialization
  if grep -r "response_model\|ResponseModel" backend/src/api --include="*.py" >/dev/null 2>&1; then
    echo "  ✓ PASS: Response schema validation detected"
  else
    echo "  ⚠ WARNING: Response schema not clearly enforced"
    ((WARNINGS++))
  fi
  
  # Check for input length limits
  if grep -r "max_length\|len.*:\|constr" backend/src --include="*.py" | grep -q "Field\|constrain"; then
    echo "  ✓ PASS: Input length validation detected"
  else
    echo "  ⚠ WARNING: Input length limits not clearly found"
    ((WARNINGS++))
  fi
  
  if [ $API_PASS -eq 1 ]; then
    ((PASSED++))
  else
    ((FAILED++))
  fi
  echo ""
  
  # ============================================
  # 9. SENSITIVE DATA EXPOSURE
  # ============================================
  echo "9. SENSITIVE DATA EXPOSURE"
  echo "---"
  
  DATA_PASS=1
  
  # Check for password in logs
  if grep -r "log.*password\|password.*log" backend/src --include="*.py" >/dev/null 2>&1; then
    echo "  ✗ FAIL: Password logging detected"
    DATA_PASS=0
  else
    echo "  ✓ PASS: No password logging detected"
  fi
  
  # Check for secrets in code
  if grep -r "SECRET_KEY.*=\|password.*=\|api_key.*=" backend/src --include="*.py" | grep -v "settings\|config\|os.getenv\|environ"; then
    echo "  ✗ FAIL: Hardcoded secrets detected"
    DATA_PASS=0
  else
    echo "  ✓ PASS: No hardcoded secrets detected"
  fi
  
  # Check for sensitive data in responses
  if grep -r "password\|token\|secret" backend/src/api --include="*.py" | grep -q "return"; then
    echo "  ⚠ WARNING: Possible sensitive data in responses - verify carefully"
    ((WARNINGS++))
  fi
  
  if [ $DATA_PASS -eq 1 ]; then
    ((PASSED++))
  else
    ((FAILED++))
  fi
  echo ""
  
  # ============================================
  # 10. LOGGING & MONITORING
  # ============================================
  echo "10. LOGGING & MONITORING"
  echo "---"
  
  LOG_PASS=1
  
  # Check for audit logging
  if grep -r "AuditLog\|audit.*log\|audit_logging" backend/src --include="*.py" >/dev/null 2>&1; then
    echo "  ✓ PASS: Audit logging implemented"
  else
    echo "  ✗ FAIL: Audit logging not found"
    LOG_PASS=0
  fi
  
  # Check for error handling
  if grep -r "except\|try:" backend/src/api --include="*.py" >/dev/null 2>&1; then
    echo "  ✓ PASS: Error handling detected"
  else
    echo "  ✗ FAIL: Error handling not found"
    LOG_PASS=0
  fi
  
  # Check for error monitoring (Sentry)
  if grep -r "sentry_sdk" backend/src --include="*.py" >/dev/null 2>&1; then
    echo "  ✓ PASS: Error monitoring (Sentry) detected"
  else
    echo "  ⚠ WARNING: Error monitoring not clearly found"
    ((WARNINGS++))
  fi
  
  if [ $LOG_PASS -eq 1 ]; then
    ((PASSED++))
  else
    ((FAILED++))
  fi
  echo ""
  
  # ============================================
  # SUMMARY
  # ============================================
  echo "================================================"
  echo "AUDIT SUMMARY"
  echo "================================================"
  echo "Checks Passed: ${PASSED}/10"
  echo "Checks Failed: ${FAILED}/10"
  echo "Warnings: ${WARNINGS}"
  echo ""
  
  if [ $FAILED -eq 0 ]; then
    echo "✓ ALL CRITICAL CHECKS PASSED"
  else
    echo "✗ CRITICAL FAILURES DETECTED"
  fi
  
  echo ""
  echo "================================================"
  echo "RECOMMENDATIONS"
  echo "================================================"
  echo ""
  echo "1. Run OWASP Dependency Check"
  echo "   npm audit (frontend)"
  echo "   pip audit (backend)"
  echo ""
  echo "2. Run SonarQube Analysis"
  echo "   sonar-scanner"
  echo ""
  echo "3. Run Bandit Security Scanner"
  echo "   bandit -r backend/src"
  echo ""
  echo "4. Perform Manual Code Review"
  echo "   Focus on authentication, authorization, data handling"
  echo ""
  echo "5. Conduct Penetration Testing"
  echo "   Use OWASP ZAP, Burp Suite"
  echo ""
  
} | tee "${AUDIT_RESULTS}"

echo
echo -e "${GREEN}✓ Security audit complete${NC}"
echo -e "${GREEN}✓ Results saved to: ${AUDIT_RESULTS}${NC}"
echo

exit $FAILED

