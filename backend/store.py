from __future__ import annotations

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Iterator


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class NotFoundError(Exception):
    pass


class ApprovalResolvedError(Exception):
    pass


class CameraStateError(Exception):
    pass


DEFAULT_SETTINGS: dict[str, Any] = {
    "assistant_name": "Nexus",
    "voice_enabled": True,
    "voice_rate": 1.0,
    "avatar_mode": "globe",
    "model_enabled": True,
    "model_name": "qwen2.5:3b",
    "wake_word": "Nexus, Hey",
    "speech_locale": "en-NG",
}

DEVICE_PLATFORMS: dict[str, dict[str, Any]] = {
    "android": {
        "label": "Android",
        "capabilities": [
            "Local owned-device registration",
            "Companion-app capability declarations",
        ],
        "limitations": [
            "No companion app is paired",
            "No remote control, locking or background access is active",
        ],
    },
    "iphone": {
        "label": "iPhone",
        "capabilities": [
            "Local owned-device registration",
            "Companion-app capability declarations",
        ],
        "limitations": [
            "No companion app is paired",
            "iOS background and device-management restrictions still apply",
            "No remote control or locking is active",
        ],
    },
}


class Store:
    """Small SQLite repository. No arbitrary SQL or shell input is accepted."""

    def __init__(self, path: str | Path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.initialize()

    @contextmanager
    def connection(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.path, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA journal_mode = WAL")
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def initialize(self) -> None:
        with self.connection() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS commands (
                    id TEXT PRIMARY KEY,
                    input_text TEXT NOT NULL,
                    intent TEXT NOT NULL,
                    status TEXT NOT NULL,
                    response TEXT NOT NULL DEFAULT '',
                    approval_id TEXT,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS approvals (
                    id TEXT PRIMARY KEY,
                    command_id TEXT NOT NULL UNIQUE REFERENCES commands(id),
                    action TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'rejected')),
                    created_at TEXT NOT NULL,
                    resolved_at TEXT
                );

                CREATE TABLE IF NOT EXISTS notes (
                    id TEXT PRIMARY KEY,
                    content TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS memory_records (
                    id TEXT PRIMARY KEY,
                    kind TEXT NOT NULL CHECK(kind IN ('preference', 'application', 'file', 'device', 'fact')),
                    content TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS devices (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    platform TEXT NOT NULL CHECK(platform IN ('android', 'iphone')),
                    connection_status TEXT NOT NULL CHECK(connection_status IN ('not_connected')),
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS camera_sessions (
                    id TEXT PRIMARY KEY,
                    approval_id TEXT NOT NULL UNIQUE REFERENCES approvals(id),
                    status TEXT NOT NULL CHECK(status IN ('approved', 'active', 'unavailable', 'stopped')),
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS audit_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_type TEXT NOT NULL,
                    subject_id TEXT,
                    status TEXT NOT NULL,
                    detail TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_audit_created
                    ON audit_events(created_at DESC);
                CREATE INDEX IF NOT EXISTS idx_approvals_status
                    ON approvals(status, created_at DESC);
                """
            )

    @staticmethod
    def _approval(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "command_id": row["command_id"],
            "action": row["action"],
            "payload": json.loads(row["payload"]),
            "status": row["status"],
            "created_at": row["created_at"],
            "resolved_at": row["resolved_at"],
        }

    def audit(
        self,
        connection: sqlite3.Connection,
        event_type: str,
        status: str,
        detail: str,
        subject_id: str | None = None,
    ) -> None:
        connection.execute(
            "INSERT INTO audit_events(event_type, subject_id, status, detail, created_at) VALUES (?, ?, ?, ?, ?)",
            (event_type, subject_id, status, detail, utc_now()),
        )

    def create_command(self, text: str, intent: str) -> str:
        command_id = str(uuid.uuid4())
        with self.connection() as connection:
            connection.execute(
                "INSERT INTO commands(id, input_text, intent, status, created_at) VALUES (?, ?, ?, 'processing', ?)",
                (command_id, text, intent, utc_now()),
            )
            self.audit(connection, "command.received", "processing", text, command_id)
        return command_id

    def finish_command(
        self,
        command_id: str,
        status: str,
        response: str,
        approval_id: str | None = None,
    ) -> None:
        with self.connection() as connection:
            connection.execute(
                "UPDATE commands SET status = ?, response = ?, approval_id = ? WHERE id = ?",
                (status, response, approval_id, command_id),
            )
            self.audit(connection, f"command.{status}", status, response, command_id)

    def request_action_approval(
        self,
        command_id: str,
        action: str,
        payload: dict[str, Any],
        detail: str,
        response: str,
    ) -> dict[str, Any]:
        approval_id = str(uuid.uuid4())
        with self.connection() as connection:
            connection.execute(
                "INSERT INTO approvals(id, command_id, action, payload, status, created_at) VALUES (?, ?, ?, ?, 'pending', ?)",
                (approval_id, command_id, action, json.dumps(payload), utc_now()),
            )
            connection.execute(
                "UPDATE commands SET status = 'approval_required', response = ?, approval_id = ? WHERE id = ?",
                (response, approval_id, command_id),
            )
            self.audit(connection, "approval.requested", "pending", detail, approval_id)
        return self.get_approval(approval_id)

    def request_note_approval(self, command_id: str, content: str) -> dict[str, Any]:
        return self.request_action_approval(
            command_id,
            "note.create",
            {"content": content},
            "Permission requested to create a local note.",
            "Approval required before saving this note.",
        )

    def request_memory_approval(self, command_id: str, kind: str, content: str) -> dict[str, Any]:
        return self.request_action_approval(
            command_id,
            "memory.create",
            {"kind": kind, "content": content},
            f"Permission requested to create a typed {kind} memory.",
            f"Approval required before saving this {kind} memory.",
        )

    def request_device_approval(self, command_id: str, platform: str, name: str) -> dict[str, Any]:
        label = DEVICE_PLATFORMS[platform]["label"]
        return self.request_action_approval(
            command_id,
            "device.register",
            {"platform": platform, "name": name},
            f"Permission requested to register an owned {label} device locally.",
            f"Approval required before registering this {label} device as not connected.",
        )

    def request_camera_approval(self, command_id: str) -> dict[str, Any]:
        return self.request_action_approval(
            command_id,
            "camera.preview",
            {"video": True, "audio": False, "recording": False, "storage": "none"},
            "Permission requested for a video-only browser webcam preview.",
            "Approval required before requesting camera access. No recording or image storage is included.",
        )

    def get_approval(self, approval_id: str) -> dict[str, Any]:
        with self.connection() as connection:
            row = connection.execute("SELECT * FROM approvals WHERE id = ?", (approval_id,)).fetchone()
        if row is None:
            raise NotFoundError("Approval request not found.")
        return self._approval(row)

    def resolve_approval(
        self,
        approval_id: str,
        decision: str,
        action_executor: Callable[[str, dict[str, Any]], dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        with self.connection() as connection:
            row = connection.execute("SELECT * FROM approvals WHERE id = ?", (approval_id,)).fetchone()
            if row is None:
                raise NotFoundError("Approval request not found.")
            if row["status"] != "pending":
                raise ApprovalResolvedError(f"This request was already {row['status']}.")

            resolved_at = utc_now()
            note = None
            memory = None
            device = None
            camera_session = None
            output = None
            payload = json.loads(row["payload"])
            if decision == "approved" and row["action"] == "note.create":
                note = {
                    "id": str(uuid.uuid4()),
                    "content": payload["content"],
                    "created_at": resolved_at,
                }
                connection.execute(
                    "INSERT INTO notes(id, content, created_at) VALUES (?, ?, ?)",
                    (note["id"], note["content"], note["created_at"]),
                )
                response = "Note saved locally."
                command_status = "completed"
            elif decision == "approved" and row["action"] == "memory.create":
                memory = {
                    "id": str(uuid.uuid4()),
                    "kind": payload["kind"],
                    "content": payload["content"],
                    "created_at": resolved_at,
                    "updated_at": resolved_at,
                }
                connection.execute(
                    "INSERT INTO memory_records(id, kind, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                    (memory["id"], memory["kind"], memory["content"], resolved_at, resolved_at),
                )
                response = f"{memory['kind'].capitalize()} memory saved locally."
                command_status = "completed"
            elif decision == "approved" and row["action"] == "device.register":
                platform = payload["platform"]
                if platform not in DEVICE_PLATFORMS:
                    raise ValueError("Unsupported device platform in stored approval.")
                device = {
                    "id": str(uuid.uuid4()),
                    "name": payload["name"],
                    "platform": platform,
                    "connection_status": "not_connected",
                    "created_at": resolved_at,
                }
                connection.execute(
                    "INSERT INTO devices(id, name, platform, connection_status, created_at) VALUES (?, ?, ?, ?, ?)",
                    (device["id"], device["name"], platform, "not_connected", resolved_at),
                )
                label = DEVICE_PLATFORMS[platform]["label"]
                response = (
                    f"{device['name']} was registered as an owned {label} device. "
                    "It is not connected, and no remote control was enabled."
                )
                command_status = "completed"
            elif decision == "approved" and row["action"] == "camera.preview":
                camera_session = {
                    "id": str(uuid.uuid4()),
                    "approval_id": approval_id,
                    "status": "approved",
                    "created_at": resolved_at,
                    "updated_at": resolved_at,
                }
                connection.execute(
                    "INSERT INTO camera_sessions(id, approval_id, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
                    (camera_session["id"], approval_id, "approved", resolved_at, resolved_at),
                )
                response = (
                    "Camera preview approved. Your browser still needs camera permission; "
                    "no video is active yet, and no frames will be recorded or stored."
                )
                command_status = "completed"
            elif decision == "approved":
                action_result = (
                    action_executor(row["action"], payload)
                    if action_executor
                    else {
                        "status": "failed",
                        "message": "No approved connector is configured. Nothing was executed.",
                        "output": None,
                    }
                )
                response = str(action_result["message"])
                command_status = str(action_result["status"])
                output = action_result.get("output")
            else:
                if row["action"] in {"note.create", "memory.create"}:
                    response = "Request rejected; nothing was saved."
                elif row["action"] == "device.register":
                    response = "Request rejected; no device was registered or connected."
                elif row["action"] == "camera.preview":
                    response = "Request rejected; camera access was not requested and no preview started."
                elif row["action"] in {"system.open_application", "system.open_folder"}:
                    response = "Request rejected; no application or folder was opened."
                else:
                    response = "Request rejected; no browser or terminal action was taken."
                command_status = "rejected"

            connection.execute(
                "UPDATE approvals SET status = ?, resolved_at = ? WHERE id = ?",
                (decision, resolved_at, approval_id),
            )
            connection.execute(
                "UPDATE commands SET status = ?, response = ? WHERE id = ?",
                (command_status, response, row["command_id"]),
            )
            self.audit(connection, f"approval.{decision}", decision, response, approval_id)
            result = self._approval(
                connection.execute("SELECT * FROM approvals WHERE id = ?", (approval_id,)).fetchone()
            )
            result["note"] = note
            result["memory"] = memory
            result["device"] = device
            result["camera_session"] = camera_session
            result["message"] = response
            result["output"] = output
            result["command_status"] = command_status
            return result

    def get_settings(self) -> dict[str, Any]:
        with self.connection() as connection:
            rows = connection.execute("SELECT key, value FROM settings").fetchall()
        stored = {row["key"]: json.loads(row["value"]) for row in rows}
        return {**DEFAULT_SETTINGS, **stored}

    def update_settings(self, updates: dict[str, Any]) -> dict[str, Any]:
        if not updates:
            return self.get_settings()
        with self.connection() as connection:
            for key, value in updates.items():
                connection.execute(
                    """
                    INSERT INTO settings(key, value, updated_at) VALUES (?, ?, ?)
                    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
                    """,
                    (key, json.dumps(value), utc_now()),
                )
            self.audit(
                connection,
                "settings.updated",
                "completed",
                "Updated assistant settings: " + ", ".join(sorted(updates)),
            )
        return self.get_settings()

    def list_notes(self, limit: int = 100) -> list[dict[str, Any]]:
        with self.connection() as connection:
            rows = connection.execute(
                "SELECT id, content, created_at FROM notes ORDER BY created_at DESC LIMIT ?", (limit,)
            ).fetchall()
        return [dict(row) for row in rows]

    def list_memories(self, kind: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
        query = "SELECT id, kind, content, created_at, updated_at FROM memory_records"
        parameters: list[Any] = []
        if kind:
            query += " WHERE kind = ?"
            parameters.append(kind)
        query += " ORDER BY created_at DESC LIMIT ?"
        parameters.append(limit)
        with self.connection() as connection:
            rows = connection.execute(query, parameters).fetchall()
        return [dict(row) for row in rows]

    def list_conversations(self, limit: int = 50) -> list[dict[str, Any]]:
        with self.connection() as connection:
            rows = connection.execute(
                """
                SELECT id, input_text, intent, status, response, created_at
                FROM commands ORDER BY created_at DESC LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [dict(row) for row in rows]

    def list_devices(self, limit: int = 100) -> list[dict[str, Any]]:
        with self.connection() as connection:
            rows = connection.execute(
                "SELECT id, name, platform, connection_status, created_at FROM devices ORDER BY created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [
            {
                **dict(row),
                "label": DEVICE_PLATFORMS[row["platform"]]["label"],
                "capabilities": DEVICE_PLATFORMS[row["platform"]]["capabilities"],
                "limitations": DEVICE_PLATFORMS[row["platform"]]["limitations"],
            }
            for row in rows
        ]

    def list_camera_sessions(self, limit: int = 20) -> list[dict[str, Any]]:
        with self.connection() as connection:
            rows = connection.execute(
                "SELECT id, approval_id, status, created_at, updated_at FROM camera_sessions ORDER BY created_at DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [dict(row) for row in rows]

    def record_camera_event(self, session_id: str, event: str) -> dict[str, Any]:
        transitions = {
            "started": ({"approved"}, "active"),
            "unavailable": ({"approved", "active"}, "unavailable"),
            "stopped": ({"approved", "active", "unavailable"}, "stopped"),
        }
        if event not in transitions:
            raise ValueError("Unsupported camera event.")
        allowed, next_status = transitions[event]
        with self.connection() as connection:
            row = connection.execute(
                "SELECT id, approval_id, status, created_at, updated_at FROM camera_sessions WHERE id = ?",
                (session_id,),
            ).fetchone()
            if row is None:
                raise NotFoundError("Camera session not found.")
            if row["status"] not in allowed:
                raise CameraStateError(f"Cannot report {event} for a {row['status']} camera session.")
            updated_at = utc_now()
            connection.execute(
                "UPDATE camera_sessions SET status = ?, updated_at = ? WHERE id = ?",
                (next_status, updated_at, session_id),
            )
            details = {
                "started": "Browser reported an active video-only camera preview.",
                "unavailable": "Browser camera access was unavailable or denied; no preview is active.",
                "stopped": "Camera preview stopped and its browser tracks were released.",
            }
            self.audit(connection, f"camera.{event}", next_status, details[event], session_id)
            return {
                "id": row["id"],
                "approval_id": row["approval_id"],
                "status": next_status,
                "created_at": row["created_at"],
                "updated_at": updated_at,
            }

    def list_approvals(self, status: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
        query = "SELECT * FROM approvals"
        parameters: list[Any] = []
        if status:
            query += " WHERE status = ?"
            parameters.append(status)
        query += " ORDER BY created_at DESC LIMIT ?"
        parameters.append(limit)
        with self.connection() as connection:
            rows = connection.execute(query, parameters).fetchall()
        return [self._approval(row) for row in rows]

    def list_audit(self, limit: int = 100) -> list[dict[str, Any]]:
        with self.connection() as connection:
            rows = connection.execute(
                "SELECT id, event_type, subject_id, status, detail, created_at FROM audit_events ORDER BY id DESC LIMIT ?",
                (limit,),
            ).fetchall()
        return [dict(row) for row in rows]

    def counts(self) -> dict[str, int]:
        with self.connection() as connection:
            notes = connection.execute("SELECT COUNT(*) FROM notes").fetchone()[0]
            pending = connection.execute(
                "SELECT COUNT(*) FROM approvals WHERE status = 'pending'"
            ).fetchone()[0]
            events = connection.execute("SELECT COUNT(*) FROM audit_events").fetchone()[0]
            memories = connection.execute("SELECT COUNT(*) FROM memory_records").fetchone()[0]
            conversations = connection.execute("SELECT COUNT(*) FROM commands").fetchone()[0]
            devices = connection.execute("SELECT COUNT(*) FROM devices").fetchone()[0]
            camera_sessions = connection.execute("SELECT COUNT(*) FROM camera_sessions").fetchone()[0]
        return {
            "notes": notes,
            "pending_approvals": pending,
            "audit_events": events,
            "memory_records": memories,
            "conversations": conversations,
            "devices": devices,
            "camera_sessions": camera_sessions,
        }
