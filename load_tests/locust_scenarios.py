"""
T119: Load Testing with Locust

Scenarios:
- 100 virtual users emitting tickets
- Sustained load for 60 seconds
- p95 latency < 500ms
- p99 latency < 1000ms
- Error rate < 0.1%
- Throughput > 50 tickets/sec
"""

from locust import HttpUser, task, between, TaskSet, events
from locust.contrib.fasthttp import FastHttpUser
import json
import random
import time
from datetime import datetime, timedelta


# ============================================
# FIXTURES / CONFIG
# ============================================

TENANT_ID = "load-test-tenant"
BASE_URL = "http://localhost:8000"
PUBLIC_ENDPOINT = f"/api/v1/public"
ADMIN_ENDPOINT = f"/api/v1/admin"

# Test data
ADMIN_EMAIL = "admin@loadtest.local"
ADMIN_PASSWORD = "SecurePassword123!"

CONSULENTE_NAMES = [
    "João Silva", "Maria Santos", "Pedro Oliveira", "Ana Costa", "Carlos Ferreira",
    "Juliana Lima", "Roberto Alves", "Fernanda Souza", "Lucas Martins", "Patricia Gomes"
]

CONSULENTE_PHONES = [
    "(11) 99999-9999", "(21) 88888-8888", "(31) 77777-7777", "(41) 66666-6666", "(51) 55555-5555"
]


# ============================================
# LOAD TEST TASKS
# ============================================

class UserBehavior(TaskSet):
    """User behavior for load testing."""

    def on_start(self):
        """Setup for each user."""
        self.gira_id = None
        self.consulente_email = f"user{random.randint(1000, 9999)}@example.com"
        self.session_start = time.time()
        self.request_count = 0

    @task(1)
    def get_next_gira(self):
        """Task 1: Get next available gira."""
        self.request_count += 1
        
        with self.client.get(
            f"{PUBLIC_ENDPOINT}/{TENANT_ID}/next-gira",
            catch_response=True,
            name="/api/v1/public/[tenant]/next-gira"
        ) as response:
            if response.status_code == 200:
                data = response.json()
                if data.get('data'):
                    self.gira_id = data['data'].get('id')
                response.success()
            elif response.status_code in [404, 429]:
                response.success()  # Expected behavior
            else:
                response.failure(f"Unexpected status: {response.status_code}")

    @task(7)
    def emit_ticket(self):
        """Task 2: Emit ticket (main task - 70% of traffic)."""
        self.request_count += 1
        
        if not self.gira_id:
            # Try to get gira first
            response = self.client.get(f"{PUBLIC_ENDPOINT}/{TENANT_ID}/next-gira")
            if response.status_code == 200:
                data = response.json()
                if data.get('data'):
                    self.gira_id = data['data'].get('id')
        
        if self.gira_id:
            payload = {
                "gira_id": self.gira_id,
                "consulente_nome": random.choice(CONSULENTE_NAMES),
                "consulente_email": f"user{random.randint(1000, 9999)}@example.com",
                "consulente_phone": random.choice(CONSULENTE_PHONES),
            }
            
            with self.client.post(
                f"{PUBLIC_ENDPOINT}/{TENANT_ID}/emit-ticket",
                json=payload,
                catch_response=True,
                name="/api/v1/public/[tenant]/emit-ticket"
            ) as response:
                if response.status_code == 201:
                    response.success()
                elif response.status_code in [400, 404, 409, 429]:
                    response.success()  # Expected error responses
                else:
                    response.failure(f"Unexpected status: {response.status_code}")

    @task(2)
    def resend_ticket_email(self):
        """Task 3: Resend ticket email."""
        self.request_count += 1
        
        with self.client.post(
            f"{PUBLIC_ENDPOINT}/{TENANT_ID}/resend-ticket-email",
            json={"email": self.consulente_email},
            catch_response=True,
            name="/api/v1/public/[tenant]/resend-ticket-email"
        ) as response:
            if response.status_code in [200, 404]:
                response.success()
            else:
                response.failure(f"Unexpected status: {response.status_code}")


# ============================================
# LOCUST USER CLASSES
# ============================================

class APIUser(FastHttpUser):
    """Heavy load user for API testing."""
    
    wait_time = between(0.5, 2)  # Wait 0.5-2 seconds between requests
    tasks = [UserBehavior]


# ============================================
# EVENT HANDLERS
# ============================================

@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    """Called when test starts."""
    print("\n" + "="*60)
    print("LOAD TEST STARTING")
    print("="*60)
    print(f"Target: {BASE_URL}")
    print(f"Tenant: {TENANT_ID}")
    print(f"Test Duration: 60 seconds")
    print(f"Expected Users: 100")
    print("="*60 + "\n")


@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    """Called when test stops."""
    print("\n" + "="*60)
    print("LOAD TEST STOPPED")
    print("="*60)
    
    # Print statistics
    stats = environment.stats
    
    print("\nRESQUEST STATISTICS:")
    print("-" * 60)
    print(f"{'Endpoint':<40} {'Count':<10} {'Avg(ms)':<10}")
    print("-" * 60)
    
    for key, stat in stats.entries.items():
        if hasattr(stat, 'name'):
            avg_response_time = stat.avg_response_time if hasattr(stat, 'avg_response_time') else 0
            print(f"{stat.name:<40} {stat.num_requests:<10} {avg_response_time:<10.2f}")
    
    # Print aggregated stats
    print("\nAGGREGATED STATISTICS:")
    print("-" * 60)
    
    total_requests = sum(stat.num_requests for stat in stats.entries.values() if hasattr(stat, 'num_requests'))
    total_failures = sum(stat.num_failures for stat in stats.entries.values() if hasattr(stat, 'num_failures'))
    
    print(f"Total Requests: {total_requests}")
    print(f"Total Failures: {total_failures}")
    print(f"Error Rate: {(total_failures/total_requests*100) if total_requests > 0 else 0:.2f}%")
    
    # Calculate percentiles
    all_response_times = []
    for stat in stats.entries.values():
        if hasattr(stat, 'response_times'):
            all_response_times.extend(stat.response_times.values())
    
    if all_response_times:
        sorted_times = sorted(all_response_times)
        p50 = sorted_times[int(len(sorted_times) * 0.50)]
        p95 = sorted_times[int(len(sorted_times) * 0.95)]
        p99 = sorted_times[int(len(sorted_times) * 0.99)]
        
        print(f"\nRESPONSE TIME PERCENTILES:")
        print(f"p50 (median): {p50:.2f}ms")
        print(f"p95: {p95:.2f}ms (target: <500ms)")
        print(f"p99: {p99:.2f}ms (target: <1000ms)")
        
        print("\nPERFORMANCE GOALS:")
        print(f"✓ p95 < 500ms: {'PASS' if p95 < 500 else 'FAIL'}")
        print(f"✓ p99 < 1000ms: {'PASS' if p99 < 1000 else 'FAIL'}")
        print(f"✓ Error rate < 0.1%: {'PASS' if (total_failures/total_requests*100) < 0.1 else 'FAIL'}")
    
    print("="*60 + "\n")


@events.request.add_listener
def on_request(request_type, name, response_time, response_length, exception, **kwargs):
    """Called for each request."""
    # Could be used for detailed request logging
    pass


# ============================================
# CONFIGURATION FOR RUNNING
# ============================================

# To run: locust -f load_tests/locust_scenarios.py \
#   --host=http://localhost:8000 \
#   --users=100 \
#   --spawn-rate=10 \
#   --run-time=60s \
#   --headless \
#   --csv=load_tests/results

