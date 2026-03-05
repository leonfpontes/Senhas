#!/bin/bash

# T120: Frontend Performance Analysis
# 
# Runs Lighthouse audits on frontend pages:
# - /public/[tenant]/emitir
# - /admin/dashboard
# - /admin/gira/[id]
#
# Requirements:
# - Lighthouse CLI installed: npm install -g lighthouse
# - Frontend running on port 3000
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
FRONTEND_HOST="${FRONTEND_HOST:-http://localhost:3000}"
TENANT_ID="${TENANT_ID:-test-tenant}"
RESULTS_DIR="performance/lighthouse-reports"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
REPORT_FILE="${RESULTS_DIR}/lighthouse-${TIMESTAMP}.json"
SUMMARY_FILE="${RESULTS_DIR}/performance-summary-${TIMESTAMP}.txt"

# Thresholds (0-100)
PERFORMANCE_THRESHOLD=80
ACCESSIBILITY_THRESHOLD=80
BEST_PRACTICES_THRESHOLD=80
SEO_THRESHOLD=80
PWA_THRESHOLD=50

mkdir -p "${RESULTS_DIR}"

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}Frontend Performance Analysis - Lighthouse${NC}"
echo -e "${BLUE}================================================${NC}"
echo

# ============================================
# PAGE 1: Public Ticket Emission
# ============================================

echo -e "${YELLOW}Testing: /public/${TENANT_ID}/emitir${NC}"

PAGE_1_URL="${FRONTEND_HOST}/public/${TENANT_ID}/emitir"
PAGE_1_REPORT="${RESULTS_DIR}/page-1-emission-${TIMESTAMP}.json"

lighthouse "${PAGE_1_URL}" \
  --output=json \
  --output-path="${PAGE_1_REPORT}" \
  --chrome-flags="--headless --no-sandbox" \
  --throttling-method=simulate \
  --throttling.downloadThroughputKbps=1600 \
  --throttling.uploadThroughputKbps=750 \
  --throttling.roundTripLatencyMs=150 \
  --throttling.rttMs=150 \
  --throttling.cpuSlowdownMultiplier=4

# Parse results
if [ -f "${PAGE_1_REPORT}" ]; then
  PERF=$(jq '.lighthouseResult.categories.performance.score * 100' "${PAGE_1_REPORT}")
  A11Y=$(jq '.lighthouseResult.categories.accessibility.score * 100' "${PAGE_1_REPORT}")
  BP=$(jq '.lighthouseResult.categories["best-practices"].score * 100' "${PAGE_1_REPORT}")
  SEO=$(jq '.lighthouseResult.categories.seo.score * 100' "${PAGE_1_REPORT}")
  
  echo
  echo -e "${GREEN}Results for /public/${TENANT_ID}/emitir:${NC}"
  echo "  Performance: $(printf '%.0f' $PERF)/100"
  echo "  Accessibility: $(printf '%.0f' $A11Y)/100"
  echo "  Best Practices: $(printf '%.0f' $BP)/100"
  echo "  SEO: $(printf '%.0f' $SEO)/100"
  echo
fi

# ============================================
# PAGE 2: Admin Dashboard
# ============================================

echo -e "${YELLOW}Testing: /admin/dashboard${NC}"

PAGE_2_URL="${FRONTEND_HOST}/admin/dashboard"
PAGE_2_REPORT="${RESULTS_DIR}/page-2-dashboard-${TIMESTAMP}.json"

# Note: This requires being logged in as admin
# In a real scenario, you'd need to:
# 1. Use a logged-in session
# 2. Set a valid auth token in cookies/headers

# For now, we'll note this would require authentication
echo -e "${YELLOW}(Note: Requires admin authentication)${NC}"

# Attempt to run (will likely get redirected to login)
lighthouse "${PAGE_2_URL}" \
  --output=json \
  --output-path="${PAGE_2_REPORT}" \
  --chrome-flags="--headless --no-sandbox" \
  --throttling-method=simulate \
  --view=false || true

# ============================================
# PAGE 3: Gira Details
# ============================================

echo -e "${YELLOW}Testing: /admin/gira/[id]${NC}"

PAGE_3_URL="${FRONTEND_HOST}/admin/gira/test-gira-id"
PAGE_3_REPORT="${RESULTS_DIR}/page-3-gira-${TIMESTAMP}.json"

echo -e "${YELLOW}(Note: Requires admin authentication)${NC}"

lighthouse "${PAGE_3_URL}" \
  --output=json \
  --output-path="${PAGE_3_REPORT}" \
  --chrome-flags="--headless --no-sandbox" \
  --throttling-method=simulate \
  --view=false || true

# ============================================
# PERFORMANCE METRICS EXTRACTION
# ============================================

echo
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}Detailed Performance Metrics${NC}"
echo -e "${BLUE}================================================${NC}"

if [ -f "${PAGE_1_REPORT}" ]; then
  echo -e "\n${GREEN}Page 1: /public/${TENANT_ID}/emitir${NC}"
  echo "---"
  
  # LightHouse metrics
  METRIC_FCP=$(jq '.lighthouseResult.audits."first-contentful-paint".displayValue' "${PAGE_1_REPORT}" 2>/dev/null || echo "N/A")
  METRIC_LCP=$(jq '.lighthouseResult.audits."largest-contentful-paint".displayValue' "${PAGE_1_REPORT}" 2>/dev/null || echo "N/A")
  METRIC_CLS=$(jq '.lighthouseResult.audits."cumulative-layout-shift".displayValue' "${PAGE_1_REPORT}" 2>/dev/null || echo "N/A")
  METRIC_TTI=$(jq '.lighthouseResult.audits."interactive".displayValue' "${PAGE_1_REPORT}" 2>/dev/null || echo "N/A")
  
  echo "First Contentful Paint (FCP): ${METRIC_FCP}"
  echo "Largest Contentful Paint (LCP): ${METRIC_LCP}"
  echo "Cumulative Layout Shift (CLS): ${METRIC_CLS}"
  echo "Time to Interactive (TTI): ${METRIC_TTI}"
  
  # Core Web Vitals targets
  echo
  echo -e "${BLUE}Core Web Vitals Targets:${NC}"
  echo "  LCP < 2.5s: ${METRIC_LCP}"
  echo "  FID < 100ms: (measured via lab)"
  echo "  CLS < 0.1: ${METRIC_CLS}"
fi

# ============================================
# AUDIT ITEMS ANALYSIS
# ============================================

echo
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}Failed Audits${NC}"
echo -e "${BLUE}================================================${NC}"

if [ -f "${PAGE_1_REPORT}" ]; then
  echo
  echo "Opportunity scores (cost of fixing):"
  jq -r '.lighthouseResult.categories.performance.auditRefs[] |
    select(.weight > 0) |
    "\(.id): (weight: \(.weight))"' "${PAGE_1_REPORT}" 2>/dev/null | head -10
fi

# ============================================
# SUMMARY REPORT
# ============================================

echo
echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}Performance Summary${NC}"
echo -e "${BLUE}================================================${NC}"

{
  echo "Performance Analysis Report - ${TIMESTAMP}"
  echo "======================================"
  echo ""
  echo "Frontend Host: ${FRONTEND_HOST}"
  echo "Tenant ID: ${TENANT_ID}"
  echo ""
  echo "TEST RESULTS:"
  echo "---"
  
  if [ -f "${PAGE_1_REPORT}" ]; then
    PERF=$(jq '.lighthouseResult.categories.performance.score * 100' "${PAGE_1_REPORT}")
    A11Y=$(jq '.lighthouseResult.categories.accessibility.score * 100' "${PAGE_1_REPORT}")
    BP=$(jq '.lighthouseResult.categories["best-practices"].score * 100' "${PAGE_1_REPORT}")
    SEO=$(jq '.lighthouseResult.categories.seo.score * 100' "${PAGE_1_REPORT}")
    
    echo "PUBLIC PAGE (/public/${TENANT_ID}/emitir)"
    echo "  Performance: $(printf '%.0f' $PERF)/100"
    echo "  Accessibility: $(printf '%.0f' $A11Y)/100"
    echo "  Best Practices: $(printf '%.0f' $BP)/100"
    echo "  SEO: $(printf '%.0f' $SEO)/100"
    echo ""
    
    PERF_STATUS="PASS"
    A11Y_STATUS="PASS"
    BP_STATUS="PASS"
    SEO_STATUS="PASS"
    
    if (( $(echo "$PERF < $PERFORMANCE_THRESHOLD" | bc -l) )); then
      PERF_STATUS="FAIL"
    fi
    if (( $(echo "$A11Y < $ACCESSIBILITY_THRESHOLD" | bc -l) )); then
      A11Y_STATUS="FAIL"
    fi
    if (( $(echo "$BP < $BEST_PRACTICES_THRESHOLD" | bc -l) )); then
      BP_STATUS="FAIL"
    fi
    if (( $(echo "$SEO < $SEO_THRESHOLD" | bc -l) )); then
      SEO_STATUS="FAIL"
    fi
    
    echo "THRESHOLD CHECK (minimum ${PERFORMANCE_THRESHOLD}):"
    echo "  Performance: ${PERF_STATUS}"
    echo "  Accessibility: ${A11Y_STATUS}"
    echo "  Best Practices: ${BP_STATUS}"
    echo "  SEO: ${SEO_STATUS}"
  fi
  
  echo ""
  echo "REPORTS GENERATED:"
  echo "  - ${PAGE_1_REPORT}"
  if [ -f "${PAGE_2_REPORT}" ]; then
    echo "  - ${PAGE_2_REPORT}"
  fi
  if [ -f "${PAGE_3_REPORT}" ]; then
    echo "  - ${PAGE_3_REPORT}"
  fi
  
} | tee "${SUMMARY_FILE}"

echo
echo -e "${GREEN}✓ Performance analysis complete${NC}"
echo -e "${GREEN}✓ Reports saved to: ${RESULTS_DIR}${NC}"
echo

