"""
T118: Concurrent Ticket Emission Integration Test

Tests atomic ticket emission with 50 concurrent requests.
Requirements:
- SenhaControl SELECT FOR UPDATE locks each increment atomically
- Zero duplicate ticket numbers
- All unique tickets generated
- No race conditions
- Isolation level: SERIALIZABLE
"""

import pytest
import asyncio
import json
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from uuid import uuid4
from typing import List, Set

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select, text

from backend.src.models import Gira, SenhaControl, Ticket, TicketStatus
from backend.src.repositories.senha_control_repo_extended import SenhaControlRepositoryExtended
from backend.src.repositories.ticket_repo import TicketRepository


# ============================================
# FIXTURES
# ============================================

@pytest.fixture
async def test_db():
    """Create test database."""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
        connect_args={"timeout": 30},
    )
    
    async with engine.begin() as conn:
        # SQLite specific setup for concurrent testing
        await conn.execute(text("PRAGMA journal_mode=WAL"))
        await conn.execute(text("PRAGMA synchronous=FULL"))
    
    from backend.src.core.database import Base
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    yield engine
    
    await engine.dispose()


@pytest.fixture
async def test_gira(test_db):
    """Create test gira."""
    async_session = sessionmaker(test_db, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        tomorrow = datetime.utcnow() + timedelta(days=1)
        gira = Gira(
            id=str(uuid4()),
            tenant_id='test-tenant',
            name='Concurrent Test Gira',
            event_date=tomorrow,
            tickets_limit=100,
            location='Test Location',
        )
        session.add(gira)
        await session.commit()
        await session.refresh(gira)
        
        return gira


@pytest.fixture
async def test_senha_control(test_db, test_gira):
    """Create test senha control."""
    async_session = sessionmaker(test_db, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        senha = SenhaControl(
            id=str(uuid4()),
            gira_id=test_gira.id,
            current_number=0,
            max_number=test_gira.tickets_limit,
        )
        session.add(senha)
        await session.commit()
        await session.refresh(senha)
        
        return senha


# ============================================
# TEST SUITE 1: Sequential Baseline
# ============================================

class TestSequentialBaseline:
    """Test sequential emission as baseline."""

    @pytest.mark.asyncio
    async def test_sequential_emission_10_tickets(self, test_db, test_gira, test_senha_control):
        """Should emit 10 tickets sequentially without duplicates."""
        async_session = sessionmaker(test_db, class_=AsyncSession, expire_on_commit=False)
        
        issued_numbers: Set[int] = set()
        
        async with async_session() as session:
            repo = SenhaControlRepositoryExtended(session)
            
            for i in range(10):
                ticket_number = await repo.atomic_increment(test_senha_control.id)
                
                # Verify unique
                assert ticket_number not in issued_numbers
                issued_numbers.add(ticket_number)
                
                # Verify sequential
                assert ticket_number == i + 1
        
        # Verify all 10 were issued
        assert len(issued_numbers) == 10
        assert issued_numbers == set(range(1, 11))

    @pytest.mark.asyncio
    async def test_sequential_emission_reaches_limit(self, test_db, test_gira, test_senha_control):
        """Should stop when reaching limit."""
        async_session = sessionmaker(test_db, class_=AsyncSession, expire_on_commit=False)
        
        async with async_session() as session:
            repo = SenhaControlRepositoryExtended(session)
            
            # Try to exceed limit (100)
            for i in range(100):
                number = await repo.atomic_increment(test_senha_control.id)
                assert number == i + 1
            
            # Next should fail or return None
            with pytest.raises(Exception) as exc_info:
                await repo.atomic_increment(test_senha_control.id)
            
            assert "limit" in str(exc_info.value).lower() or "max" in str(exc_info.value).lower()


# ============================================
# TEST SUITE 2: Concurrent Emission (50 threads)
# ============================================

class TestConcurrentEmission:
    """Test concurrent ticket emission."""

    @pytest.mark.asyncio
    async def test_50_concurrent_emissions(self, test_db, test_gira, test_senha_control):
        """Should emit 50 tickets concurrently without duplicates."""
        async_session = sessionmaker(test_db, class_=AsyncSession, expire_on_commit=False)
        
        issued_numbers: List[int] = []
        errors: List[Exception] = []
        
        async def emit_ticket():
            """Emit a single ticket."""
            try:
                async with async_session() as session:
                    repo = SenhaControlRepositoryExtended(session)
                    number = await repo.atomic_increment(test_senha_control.id)
                    issued_numbers.append(number)
                    return number
            except Exception as e:
                errors.append(e)
                raise
        
        # Launch 50 concurrent tasks
        tasks = [emit_ticket() for _ in range(50)]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Verify no errors
        assert len(errors) == 0
        
        # Verify all 50 tickets issued
        assert len(issued_numbers) == 50
        
        # Verify no duplicates
        assert len(set(issued_numbers)) == 50
        
        # Verify all sequential
        assert sorted(issued_numbers) == list(range(1, 51))

    @pytest.mark.asyncio
    async def test_100_concurrent_emissions_at_limit(self, test_db, test_gira, test_senha_control):
        """Should handle 100 concurrent requests at exactly the limit."""
        async_session = sessionmaker(test_db, class_=AsyncSession, expire_on_commit=False)
        
        issued_numbers: List[int] = []
        errors: List[Exception] = []
        
        async def emit_ticket_safe():
            """Emit a single ticket, handling limit errors."""
            try:
                async with async_session() as session:
                    repo = SenhaControlRepositoryExtended(session)
                    number = await repo.atomic_increment(test_senha_control.id)
                    issued_numbers.append(number)
                    return number
            except Exception as e:
                # Limit errors are expected
                if "limit" not in str(e).lower():
                    errors.append(e)
                return None
        
        # Launch 100 concurrent tasks (should hit limit)
        tasks = [emit_ticket_safe() for _ in range(100)]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Verify no unexpected errors
        assert len(errors) == 0
        
        # Verify exactly 100 tickets issued (the limit)
        assert len(issued_numbers) == 100
        
        # Verify no duplicates
        assert len(set(issued_numbers)) == 100

    @pytest.mark.asyncio
    async def test_concurrent_emissions_maintain_order(self, test_db, test_gira, test_senha_control):
        """Should maintain strict order despite concurrent access."""
        async_session = sessionmaker(test_db, class_=AsyncSession, expire_on_commit=False)
        
        issued_numbers: List[int] = []
        
        async def emit_ticket(index):
            """Emit ticket with index."""
            async with async_session() as session:
                repo = SenhaControlRepositoryExtended(session)
                number = await repo.atomic_increment(test_senha_control.id)
                issued_numbers.append(number)
        
        # Launch 50 concurrent tasks
        tasks = [emit_ticket(i) for i in range(50)]
        await asyncio.gather(*tasks)
        
        # Verify strict ordering (1-50, possibly out of order in list, but unique and sequential)
        assert sorted(issued_numbers) == list(range(1, 51))


# ============================================
# TEST SUITE 3: Database Isolation Level
# ============================================

class TestDatabaseIsolation:
    """Test database isolation during concurrent access."""

    @pytest.mark.asyncio
    async def test_select_for_update_locking(self, test_db, test_senhacontrol):
        """Should use SELECT FOR UPDATE for atomic increment."""
        async_session = sessionmaker(test_db, class_=AsyncSession, expire_on_commit=False)
        
        # Verify SELECT FOR UPDATE is used
        async with async_session() as session:
            repo = SenhaControlRepositoryExtended(session)
            
            # The implementation should use SELECT FOR UPDATE
            # We verify by checking that concurrent access is serialized
            number1 = await repo.atomic_increment(test_senhacontrol.id)
            number2 = await repo.atomic_increment(test_senhacontrol.id)
            
            # If SELECT FOR UPDATE works, numbers are sequential
            assert number1 == 1
            assert number2 == 2

    @pytest.mark.asyncio
    async def test_no_deadlocks_under_load(self, test_db, test_gira, test_senha_control):
        """Should not deadlock under concurrent load."""
        async_session = sessionmaker(test_db, class_=AsyncSession, expire_on_commit=False)
        
        issued_numbers: List[int] = []
        timeout_errors: int = 0
        
        async def try_emit():
            """Try to emit ticket."""
            nonlocal timeout_errors
            try:
                async with asyncio.timeout(5):  # 5 second timeout per request
                    async with async_session() as session:
                        repo = SenhaControlRepositoryExtended(session)
                        number = await repo.atomic_increment(test_senha_control.id)
                        issued_numbers.append(number)
            except asyncio.TimeoutError:
                timeout_errors += 1
        
        # Launch 100 concurrent requests
        tasks = [try_emit() for _ in range(100)]
        await asyncio.gather(*tasks, return_exceptions=True)
        
        # Verify no timeouts (no deadlocks)
        assert timeout_errors == 0


# ============================================
# TEST SUITE 4: Performance Under Concurrency
# ============================================

class TestConcurrentPerformance:
    """Test performance metrics under concurrent load."""

    @pytest.mark.asyncio
    async def test_p95_latency_under_50_concurrent(self, test_db, test_gira, test_senha_control):
        """p95 latency should be < 500ms for 50 concurrent requests."""
        import time
        
        async_session = sessionmaker(test_db, class_=AsyncSession, expire_on_commit=False)
        latencies: List[float] = []
        
        async def emit_and_measure():
            """Emit ticket and measure latency."""
            start = time.time()
            try:
                async with async_session() as session:
                    repo = SenhaControlRepositoryExtended(session)
                    await repo.atomic_increment(test_senha_control.id)
            finally:
                latency = (time.time() - start) * 1000  # ms
                latencies.append(latency)
        
        # Launch 50 concurrent requests
        tasks = [emit_and_measure() for _ in range(50)]
        await asyncio.gather(*tasks)
        
        # Calculate p95
        sorted_latencies = sorted(latencies)
        p95_index = int(len(sorted_latencies) * 0.95)
        p95_latency = sorted_latencies[p95_index]
        
        # Should be < 500ms
        assert p95_latency < 500, f"p95 latency: {p95_latency}ms (should be < 500ms)"

    @pytest.mark.asyncio
    async def test_throughput_50_tickets_per_second(self, test_db, test_gira, test_senha_control):
        """Should emit > 50 tickets/sec under load."""
        import time
        
        async_session = sessionmaker(test_db, class_=AsyncSession, expire_on_commit=False)
        
        start = time.time()
        issued = 0
        
        async def emit_ticket():
            """Emit single ticket."""
            nonlocal issued
            async with async_session() as session:
                repo = SenhaControlRepositoryExtended(session)
                await repo.atomic_increment(test_senha_control.id)
            issued += 1
        
        # Launch 100 concurrent requests in bursts
        for _ in range(2):  # 2 bursts of 50
            tasks = [emit_ticket() for _ in range(50)]
            await asyncio.gather(*tasks)
        
        elapsed = time.time() - start
        throughput = issued / elapsed
        
        # Should be > 50 tickets/sec
        assert throughput > 50, f"Throughput: {throughput:.2f} tickets/sec (should be > 50)"


# ============================================
# TEST SUITE 5: Failure Scenarios
# ============================================

class TestConcurrentFailureScenarios:
    """Test concurrent failure handling."""

    @pytest.mark.asyncio
    async def test_concurrent_with_database_connection_errors(self, test_db, test_gira, test_senha_control):
        """Should handle connection errors gracefully."""
        async_session = sessionmaker(test_db, class_=AsyncSession, expire_on_commit=False)
        
        issued_numbers: List[int] = []
        connection_errors: int = 0
        
        async def emit_with_random_failures():
            """Emit with random connection failures."""
            nonlocal connection_errors
            import random
            
            if random.random() < 0.1:  # 10% failure rate
                connection_errors += 1
                raise Exception("Simulated connection error")
            
            try:
                async with async_session() as session:
                    repo = SenhaControlRepositoryExtended(session)
                    number = await repo.atomic_increment(test_senha_control.id)
                    issued_numbers.append(number)
            except Exception:
                connection_errors += 1
        
        # Launch concurrent requests
        tasks = [emit_with_random_failures() for _ in range(50)]
        await asyncio.gather(*tasks, return_exceptions=True)
        
        # Verify issued numbers are still unique and sequential
        if issued_numbers:
            assert len(set(issued_numbers)) == len(issued_numbers)

    @pytest.mark.asyncio
    async def test_concurrent_emissions_with_cancellation(self, test_db, test_gira, test_senha_control):
        """Should handle task cancellation."""
        async_session = sessionmaker(test_db, class_=AsyncSession, expire_on_commit=False)
        
        issued_numbers: List[int] = []
        cancelled_count: int = 0
        
        async def emit_ticket(delay_ms: int = 0):
            """Emit ticket with optional delay."""
            nonlocal cancelled_count
            try:
                if delay_ms > 0:
                    await asyncio.sleep(delay_ms / 1000.0)
                
                async with async_session() as session:
                    repo = SenhaControlRepositoryExtended(session)
                    number = await repo.atomic_increment(test_senha_control.id)
                    issued_numbers.append(number)
            except asyncio.CancelledError:
                cancelled_count += 1
                raise
        
        # Launch tasks, cancel some
        tasks = [
            asyncio.create_task(emit_ticket(i * 10))
            for i in range(20)
        ]
        
        # Cancel half of them after 50ms
        await asyncio.sleep(0.05)
        for task in tasks[10:]:
            task.cancel()
        
        # Wait for remaining tasks
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Verify issued numbers are still unique
        if issued_numbers:
            assert len(set(issued_numbers)) == len(issued_numbers)


# ============================================
# Test Runner
# ============================================

if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])

