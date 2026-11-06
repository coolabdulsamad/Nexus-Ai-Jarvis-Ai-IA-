from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

from .store import Store


CAPABILITIES = [
    {
        "id": "local-time",
        "label": "Time & system status",
        "status": "available",
        "tier": 0,
        "description": "Read-only local time, database and service status.",
    },
    {
        "id": "notes",
        "label": "Persistent local notes",
        "status": "available",
        "tier": 1,
        "description": "Save and list notes after explicit approval.",
    },
    {
        "id": "audit",
        "label": "Command audit history",
        "status": "available",
        "tier": 0,
        "description": "Inspect requests, decisions and outcomes.",
    },
    {
        "id": "browser",
        "label": "Chrome browser connector",
        "status": "planned",
        "tier": 2,
        "description": "Site navigation, search and exact-target actions arrive in a later phase.",
    },
    {
        "id": "home",
        "label": "Home & AC connector",
        "status": "planned",
        "tier": 2,
        "description": "Requires an authorised Matter, Home Assistant or vendor integration.",
    },
    {
        "id": "voice",
        "label": "Voice conversation",
        "status": "planned",
        "tier": 1,
        "description": "Wake word, speech-to-text, text-to-speech and interruption.",
    },
    {
        "id": "mobile",
        "label": "Android & iPhone",
        "status": "planned",
        "tier": 2,
        "description": "Platform-supported companion and device-management connectors only.",
    },
]


def _note_content(text: str) -> str | None:
    match = re.match(
        r"^(?:please\s+)?(?:take\s+a\s+note|take\s+note|note|remember)(?:\s+that)?\s*[:\-]?\s+(.+)$",
        text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    return match.group(1).strip() if match else None


def handle_command(text: str, store: Store) -> dict[str, Any]:
    normalized = " ".join(text.strip().split())
    lowered = normalized.lower().rstrip("?!.")
    note_content = _note_content(normalized)

    if note_content:
        intent = "note.create"
    elif lowered in {"what time is it", "time", "current time", "what is the time"}:
        intent = "system.time"
    elif lowered in {"system status", "status", "health", "are you online"}:
        intent = "system.status"
    elif lowered in {"list notes", "show notes", "read my notes", "list my notes"}:
        intent = "note.list"
    elif any(term in lowered for term in ("chrome", "browser", "website", "search google", "click")):
        intent = "browser.unavailable"
    elif any(term in lowered for term in ("air conditioner", "air conditioning", " ac", "ac ", "home device", "thermostat")):
        intent = "home.unavailable"
    else:
        intent = "unknown"

    command_id = store.create_command(normalized, intent)
    base: dict[str, Any] = {"command_id": command_id, "intent": intent}

    if intent == "note.create":
        approval = store.request_note_approval(command_id, note_content or "")
        return {
            **base,
            "status": "approval_required",
            "message": "I’m ready to save this note. Review the request and approve or reject it.",
            "approval": approval,
        }

    if intent == "system.time":
        message = "Local core time is " + datetime.now(timezone.utc).strftime("%H:%M:%S UTC on %A, %d %B %Y") + "."
        status = "completed"
    elif intent == "system.status":
        counts = store.counts()
        message = (
            f"Nexus local core is online. {counts['notes']} note(s), "
            f"{counts['pending_approvals']} pending approval(s), and "
            f"{counts['audit_events']} audit event(s) are stored."
        )
        status = "completed"
    elif intent == "note.list":
        notes = store.list_notes(10)
        message = (
            "No notes are stored yet."
            if not notes
            else "Latest notes: " + " | ".join(note["content"] for note in notes)
        )
        status = "completed"
    elif intent == "browser.unavailable":
        message = "The Chrome connector is not configured yet. No browser was opened and no action was taken."
        status = "unavailable"
    elif intent == "home.unavailable":
        message = "The home-device connector is not configured yet. No AC or other device was changed."
        status = "unavailable"
    else:
        message = "I don’t have a safe, configured skill for that yet. Try time, status, list notes, or take a note."
        status = "unsupported"

    store.finish_command(command_id, status, message)
    return {**base, "status": status, "message": message}
