"""
T128: Prometheus Monitoring Integration

Metrics collection for:
- Application uptime & health
- API latency (p50, p95, p99)
- Error rates
- Database connection pool
- Email delivery status
- Ticket emission rate
- Multi-tenant performance isolation
"""

from prometheus_client import (
    Counter,
    Histogram,
    Gauge,
    Summary,
    generate_latest,
    CollectorRegistry,
    REGISTRY,
)
from contextlib import contextmanager
import time
from typing import Dict, Optional


# ============================================
# REGISTRY & SETUP
# ============================================

# Global registry
registry = REGISTRY


# ============================================
# REQUEST METRICS
# ============================================

request_count = Counter(
    'http_requests_total',
    'Total HTTP requests',
    ['method', 'endpoint', 'status'],
    registry=registry,
)

request_latency = Histogram(
    'http_request_duration_seconds',
    'HTTP request latency in seconds',
    ['method', 'endpoint'],
    buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0),
    registry=registry,
)

request_size = Summary(
    'http_request_size_bytes',
    'HTTP request size in bytes',
    ['method', 'endpoint'],
    registry=registry,
)

response_size = Summary(
    'http_response_size_bytes',
    'HTTP response size in bytes',
    ['method', 'endpoint', 'status'],
    registry=registry,
)


# ============================================
# BUSINESS METRICS
# ============================================

tickets_emitted = Counter(
    'tickets_emitted_total',
    'Total tickets emitted',
    ['tenant_id', 'gira_id'],
    registry=registry,
)

tickets_used = Counter(
    'tickets_used_total',
    'Total tickets marked as used',
    ['tenant_id', 'gira_id'],
    registry=registry,
)

active_giras = Gauge(
    'active_giras_count',
    'Number of active giras',
    ['tenant_id'],
    registry=registry,
)

gira_capacity = Gauge(
    'gira_capacity_used_percent',
    'Gira ticket capacity used (percent)',
    ['tenant_id', 'gira_id'],
    registry=registry,
)

consulentes_registered = Counter(
    'consulentes_registered_total',
    'Total consulentes registered',
    ['tenant_id'],
    registry=registry,
)


# ============================================
# EMAIL METRICS
# ============================================

emails_sent = Counter(
    'emails_sent_total',
    'Total emails sent',
    ['provider', 'tenant_id', 'status'],
    registry=registry,
)

email_latency = Histogram(
    'email_send_duration_seconds',
    'Email sending latency in seconds',
    ['provider'],
    buckets=(0.1, 0.5, 1.0, 2.0, 5.0, 10.0),
    registry=registry,
)

email_delivery_failures = Counter(
    'email_delivery_failures_total',
    'Total email delivery failures',
    ['provider', 'reason'],
    registry=registry,
)


# ============================================
# DATABASE METRICS
# ============================================

db_connection_pool_size = Gauge(
    'db_connection_pool_size',
    'Database connection pool size',
    registry=registry,
)

db_active_connections = Gauge(
    'db_active_connections',
    'Active database connections',
    registry=registry,
)

db_query_latency = Histogram(
    'db_query_duration_seconds',
    'Database query latency in seconds',
    ['query_type'],
    buckets=(0.01, 0.05, 0.1, 0.25, 0.5, 1.0),
    registry=registry,
)

db_transaction_count = Counter(
    'db_transactions_total',
    'Total database transactions',
    ['operation', 'status'],
    registry=registry,
)


# ============================================
# AUTHENTICATION METRICS
# ============================================

auth_attempts = Counter(
    'auth_attempts_total',
    'Total authentication attempts',
    ['method', 'status'],
    registry=registry,
)

jwt_validations = Counter(
    'jwt_validations_total',
    'Total JWT validations',
    ['result'],
    registry=registry,
)

active_sessions = Gauge(
    'active_sessions_total',
    'Number of active JWT sessions',
    ['tenant_id'],
    registry=registry,
)


# ============================================
# MULTI-TENANT METRICS
# ============================================

tenant_isolation_checks = Counter(
    'tenant_isolation_checks_total',
    'Tenant isolation validation checks',
    ['result'],
    registry=registry,
)

cross_tenant_access_attempts = Counter(
    'cross_tenant_access_attempts_total',
    'Blocked cross-tenant access attempts',
    ['tenant_a', 'tenant_b'],
    registry=registry,
)

tenant_api_quota_usage = Gauge(
    'tenant_api_quota_usage_percent',
    'API quota usage percentage per tenant',
    ['tenant_id'],
    registry=registry,
)


# ============================================
# ERROR METRICS
# ============================================

errors_total = Counter(
    'errors_total',
    'Total errors',
    ['error_type', 'endpoint'],
    registry=registry,
)

exceptions_raised = Counter(
    'exceptions_raised_total',
    'Total exceptions raised',
    ['exception_type'],
    registry=registry,
)

validation_errors = Counter(
    'validation_errors_total',
    'Total validation errors',
    ['field', 'endpoint'],
    registry=registry,
)


# ============================================
# CACHE METRICS
# ============================================

cache_hits = Counter(
    'cache_hits_total',
    'Total cache hits',
    ['cache_name'],
    registry=registry,
)

cache_misses = Counter(
    'cache_misses_total',
    'Total cache misses',
    ['cache_name'],
    registry=registry,
)

cache_size = Gauge(
    'cache_size_bytes',
    'Cache size in bytes',
    ['cache_name'],
    registry=registry,
)


# ============================================
# SYSTEM METRICS
# ============================================

app_uptime_seconds = Gauge(
    'app_uptime_seconds',
    'Application uptime in seconds',
    registry=registry,
)

health_check_status = Gauge(
    'health_check_status',
    'Health check status (1=healthy, 0=unhealthy)',
    ['component'],
    registry=registry,
)


# ============================================
# CONTEXT MANAGERS FOR METRICS
# ============================================

@contextmanager
def measure_request(method: str, endpoint: str):
    """Context manager to measure HTTP request metrics."""
    start_time = time.time()
    
    try:
        yield
        status = 200
    except Exception as e:
        status = 500
        raise
    finally:
        duration = time.time() - start_time
        request_latency.labels(method=method, endpoint=endpoint).observe(duration)
        request_count.labels(method=method, endpoint=endpoint, status=status).inc()


@contextmanager
def measure_email_send(provider: str, tenant_id: str):
    """Context manager to measure email sending metrics."""
    start_time = time.time()
    
    try:
        yield
        status = 'success'
    except Exception as e:
        status = 'failure'
        email_delivery_failures.labels(
            provider=provider,
            reason=type(e).__name__,
        ).inc()
        raise
    finally:
        duration = time.time() - start_time
        email_latency.labels(provider=provider).observe(duration)
        emails_sent.labels(
            provider=provider,
            tenant_id=tenant_id,
            status=status,
        ).inc()


@contextmanager
def measure_db_query(query_type: str):
    """Context manager to measure database query metrics."""
    start_time = time.time()
    
    try:
        yield
        operation = 'success'
    except Exception as e:
        operation = 'failure'
        raise
    finally:
        duration = time.time() - start_time
        db_query_latency.labels(query_type=query_type).observe(duration)
        db_transaction_count.labels(
            operation=query_type,
            status=operation,
        ).inc()


# ============================================
# HELPER FUNCTIONS FOR COMMON OPERATIONS
# ============================================

def track_ticket_emission(tenant_id: str, gira_id: str, email_provider: str):
    """Track ticket emission event."""
    tickets_emitted.labels(tenant_id=tenant_id, gira_id=gira_id).inc()
    
    # Also track the email sent
    emails_sent.labels(
        provider=email_provider,
        tenant_id=tenant_id,
        status='success',
    ).inc()


def track_ticket_used(tenant_id: str, gira_id: str):
    """Track ticket marked as used."""
    tickets_used.labels(tenant_id=tenant_id, gira_id=gira_id).inc()


def track_gira_created(tenant_id: str, gira_id: str, capacity: int):
    """Track gira creation."""
    active_giras.labels(tenant_id=tenant_id).inc()


def track_auth_attempt(method: str, success: bool):
    """Track authentication attempt."""
    status = 'success' if success else 'failure'
    auth_attempts.labels(method=method, status=status).inc()


def track_validation_error(field: str, endpoint: str):
    """Track validation error."""
    validation_errors.labels(field=field, endpoint=endpoint).inc()


def track_cross_tenant_attempt(tenant_a: str, tenant_b: str):
    """Track blocked cross-tenant access attempt."""
    cross_tenant_access_attempts.labels(tenant_a=tenant_a, tenant_b=tenant_b).inc()


def set_gira_capacity_used(tenant_id: str, gira_id: str, used: int, limit: int):
    """Set gira capacity usage percentage."""
    percent = (used / limit * 100) if limit > 0 else 0
    gira_capacity.labels(tenant_id=tenant_id, gira_id=gira_id).set(percent)


def set_tenant_quota_usage(tenant_id: str, used: float, limit: float):
    """Set tenant API quota usage."""
    percent = (used / limit * 100) if limit > 0 else 0
    tenant_api_quota_usage.labels(tenant_id=tenant_id).set(percent)


# ============================================
# PROMETHEUS EXPORTER ENDPOINT
# ============================================

def get_metrics_text():
    """Return metrics in Prometheus text format."""
    return generate_latest(registry).decode('utf-8')


# ============================================
# HEALTH CHECK COMPONENT STATUS
# ============================================

def set_component_health(component: str, healthy: bool):
    """Set health status for a component."""
    status = 1 if healthy else 0
    health_check_status.labels(component=component).set(status)


# ============================================
# INITIALIZATION
# ============================================

def init_monitoring():
    """Initialize monitoring system."""
    # Set initial component health status
    set_component_health('database', True)
    set_component_health('cache', True)
    set_component_health('email', True)
    set_component_health('api', True)


if __name__ == '__main__':
    # Test prometheus metrics
    init_monitoring()
    
    # Simulate some metrics
    track_ticket_emission('tenant-1', 'gira-1', 'brevo')
    track_auth_attempt('password', True)
    set_gira_capacity_used('tenant-1', 'gira-1', 45, 100)
    
    # Print metrics
    print(get_metrics_text())

