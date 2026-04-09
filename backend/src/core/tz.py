"""Application timezone utilities.

All analytics queries that extract hours or dates from ``created_at`` fields
must use these helpers so the numbers match Brazil local time (UTC-3 / UTC-2
during summer time) rather than raw UTC.

Usage::

    from ..core.tz import local_hour, local_date, today_utc_range

    # In a SQLAlchemy select:
    func.extract("hour", Ticket.created_at)   # ← WRONG (UTC)
    local_hour(Ticket.created_at)             # ← CORRECT (São Paulo)

    func.date(Ticket.created_at)              # ← WRONG (UTC midnight cut)
    local_date(Ticket.created_at)             # ← CORRECT (São Paulo midnight)

    # For "today" date range:
    today_start, today_end = today_utc_range()
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import Integer, func
from sqlalchemy.sql.expression import ColumnElement, literal_column

# Single source of truth for the application timezone.
APP_TZ = ZoneInfo("America/Sao_Paulo")
_TZ_NAME = "America/Sao_Paulo"
# literal_column embeds the timezone name directly in SQL (no bind parameter),
# so the expression is identical in SELECT and GROUP BY — avoiding
# PostgreSQL GroupingError with asyncpg's prepared-statement parameter numbering.
_TZ_LITERAL = literal_column("'America/Sao_Paulo'")


def local_hour(col: ColumnElement) -> ColumnElement:
    """Return a SQLAlchemy expression that extracts the *local* hour (0-23)
    from a timezone-aware timestamp column.

    Equivalent to PostgreSQL::

        EXTRACT(HOUR FROM col AT TIME ZONE 'America/Sao_Paulo')::integer
    """
    return func.extract(
        "hour",
        func.timezone(_TZ_LITERAL, col),
    ).cast(Integer)


def local_date(col: ColumnElement) -> ColumnElement:
    """Return a SQLAlchemy expression that truncates a timezone-aware
    timestamp column to a *local* date (DATE type).

    Equivalent to PostgreSQL::

        DATE(col AT TIME ZONE 'America/Sao_Paulo')
    """
    return func.date(func.timezone(_TZ_LITERAL, col))


def today_utc_range() -> tuple[datetime, datetime]:
    """Return (start_utc, end_utc) covering today in the São Paulo timezone.

    Both datetimes are timezone-aware UTC, safe to compare against
    ``DateTime(timezone=True)`` columns (asyncpg / PostgreSQL TIMESTAMPTZ).

    Example: on 2026-04-09 in São Paulo (UTC-3), this returns
        start_utc = 2026-04-09 03:00:00+00:00  (São Paulo midnight → UTC)
        end_utc   = 2026-04-10 03:00:00+00:00
    """
    now_local = datetime.now(tz=APP_TZ)
    start_local = now_local.replace(hour=0, minute=0, second=0, microsecond=0)
    end_local = start_local + timedelta(days=1)

    # Return as timezone-aware UTC so comparisons work correctly against
    # both DateTime(timezone=True) and naive UTC columns.
    start_utc = start_local.astimezone(timezone.utc)
    end_utc = end_local.astimezone(timezone.utc)

    return start_utc, end_utc
