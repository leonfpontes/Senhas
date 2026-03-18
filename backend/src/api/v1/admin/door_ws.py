"""WebSocket endpoint for real-time door queue updates."""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from typing import Dict, Set
import uuid
import json
import logging

from src.security.jwt import decode_token
from src.core.errors import InvalidTokenError

router = APIRouter(tags=["door-ws"])
logger = logging.getLogger(__name__)

# Active connections per gira: {gira_id: set(websocket)}
_connections: Dict[str, Set[WebSocket]] = {}


async def _authenticate_ws(token: str) -> dict:
    """Validate JWT token for WebSocket connection.
    
    Returns dict with user_id, tenant_id, role.
    Raises InvalidTokenError if invalid.
    """
    payload = decode_token(token)
    return {
        "user_id": payload.sub,
        "tenant_id": payload.tenant_id,
        "role": payload.role,
    }


async def broadcast_to_gira(gira_id: str, event: str, data: dict | None = None):
    """Broadcast a message to all WebSocket clients watching a gira.
    
    Called from door_control endpoints after state changes.
    """
    connections = _connections.get(gira_id, set())
    if not connections:
        return

    message = json.dumps({"event": event, "data": data})
    disconnected = set()

    for ws in connections:
        try:
            await ws.send_text(message)
        except Exception:
            disconnected.add(ws)

    # Clean up dead connections
    for ws in disconnected:
        connections.discard(ws)


@router.websocket("/api/v1/admin/giras/{gira_id}/door/ws")
async def door_websocket(
    websocket: WebSocket,
    gira_id: str,
    token: str = Query(...),
):
    """WebSocket endpoint for real-time door queue updates.
    
    Connect with: ws://host/api/v1/admin/giras/{gira_id}/door/ws?token=JWT
    
    Events sent to clients:
    - queue_updated: Full queue refresh signal
    - stats_updated: Stats refresh signal
    """
    # Authenticate via JWT token in query param
    try:
        auth = await _authenticate_ws(token)
    except (InvalidTokenError, Exception) as e:
        logger.warning(f"WebSocket auth failed: {e}")
        await websocket.close(code=4001, reason="Unauthorized")
        return

    # Verify admin/operator role
    if auth["role"] not in ("admin", "operator", "super_admin"):
        await websocket.close(code=4003, reason="Forbidden")
        return

    await websocket.accept()

    # Register connection
    if gira_id not in _connections:
        _connections[gira_id] = set()
    _connections[gira_id].add(websocket)

    logger.info(f"WebSocket connected: gira={gira_id}, user={auth['user_id']}")

    try:
        # Keep connection alive — listen for client pings
        while True:
            data = await websocket.receive_text()
            # Client can send "ping" to keep alive
            if data == "ping":
                await websocket.send_text(json.dumps({"event": "pong"}))
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected: gira={gira_id}, user={auth['user_id']}")
    except Exception as e:
        logger.warning(f"WebSocket error: {e}")
    finally:
        _connections.get(gira_id, set()).discard(websocket)
        if gira_id in _connections and not _connections[gira_id]:
            del _connections[gira_id]
