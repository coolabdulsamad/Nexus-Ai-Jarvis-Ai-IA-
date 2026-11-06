from __future__ import annotations

import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterator


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


class NotFoundError(Exception):
    pass


class ApprovalResolvedError(Exception):
    pass


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

                CREATE TABLE IF NOT EXISTS audit_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_type TEXT NOT NULL,
                    subject_id TEXT,
                    status TEXT NOT NULL,
                    detail TEXT NOT NULL,
                    created_at TEXT NOT NULL
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

    def request_note_approval(self, command_id: str, content: str) -> dict[str, Any]:
        approval_id = str(uuid.uuid4())
        payload = {"content": content}
        with self.connection() as connection:
            connection.execute(
                "INSERT INTO approvals(id, command_id, action, payload, status, created_at) VALUES (?, ?, 'note.create', ?, 'pending', ?)",
                (approval_id, command_id, json.dumps(payload), utc_now()),
            )
            connection.execute(
                "UPDATE commands SET status = 'approval_required', response = ?, approval_id = ? WHERE id = ?",
                ("Approval required before saving this note.", approval_id, command_id),
            )
            self.audit(
                connection,
                "approval.requested",
                "pending",
                "Permission requested to create a local note.",
                approval_id,
            )
        return self.get_approval(approval_id)

    def get_approval(self, approval_id: str) -> dict[str, Any]:
        with self.connection() as connection:
            row = connection.execute("SELECT * FROM approvals WHERE id = ?", (approval_id,)).fetchone()
        if row is None:
            raise NotFoundError("Approval request not found.")
        return self._approval(row)

    def resolve_approval(self, approval_id: str, decision: str) -> dict[str, Any]:
        with self.connection() as connection:
            row = connection.execute("SELECT * FROM approvals WHERE id = ?", (approval_id,)).fetchone()
            if row is None:
                raise NotFoundError("Approval request not found.")
            if row["status"] != "pending":
                raise ApprovalResolvedError(f"This request was already {row['status']}.")

            resolved_at = utc_now()
            note = None
            if decision == "approved" and row["action"] == "note.create":
                payload = json.loads(row["payload"])
                note = {
                    "id": str(uuid.uuid4()),
                    "content": payload["content"],
                    "created_at": resolved_at,
                }
                connection.execute(
                    "INSERT INTO notes(id, content, created_at) VALUES (?, ?, ?)",
                    (note["id"], note["content"], note["created_at"]),
                )

            response = "Note saved locally." if note else "Request rejected; nothing was saved."
            connection.execute(
                "UPDATE approvals SET status = ?, resolved_at = ? WHERE id = ?",
                (decision, resolved_at, approval_id),
            )
            connection.execute(
                "UPDATE commands SET status = ?, response = ? WHERE id = ?",
                ("completed" if decision == "approved" else "rejected", response, row["command_id"]),
            )
            self.audit(
                connection,
                f"approval.{decision}",
                decision,
                response,
                approval_id,
            )
            result = self._approval(
                connection.execute("SELECT * FROM approvals WHERE id = ?", (approval_id,)).fetchone()
            )
            result["note"] = note
            result["message"] = response
            return result

    def list_notes(self, limit: int = 100) -> list[dict[str, Any]]:
        with self.connection() as connection:
            rows = connection.execute(
                "SELECT id, content, created_at FROM notes ORDER BY created_at DESC LIMIT ?", (limit,)
            ).fetchall()
        return [dict(row) for row in rows]

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
        return {"notes": notes, "pending_approvals": pending, "audit_events": events}
