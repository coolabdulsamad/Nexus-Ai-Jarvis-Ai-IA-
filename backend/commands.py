from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlencode

from .connectors import validated_browser_url
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
        "label": "Browser navigation & search",
        "status": "available",
        "tier": 2,
        "description": "Open approved HTTP/HTTPS destinations or Google searches. Exact-target clicking is not included.",
    },
    {
        "id": "terminal",
        "label": "Scoped Git status",
        "status": "available",
        "tier": 1,
        "description": "Run only git status --short --branch after approval. No arbitrary shell input or repository changes.",
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
        "label": "Voice & animated avatar",
        "status": "available",
        "tier": 1,
        "description": "Push-to-talk input, spoken replies, interruption and interactive globe/humanoid modes. Browser support varies.",
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


def _browser_request(text: str) -> tuple[str, dict[str, Any]] | None:
    search = re.match(
        r"^(?:please\s+)?(?:(?:open|launch)\s+(?:chrome|(?:the\s+)?browser)\s+(?:and\s+)?)?"
        r"(?:search\s+(?:google|the\s+web)(?:\s+for)?|google\s+search)(?:\s*[:\-]?\s*)(.*)$",
        text,
        flags=re.IGNORECASE,
    )
    if search:
        query = search.group(1).strip()
        if query:
            if len(query) > 300:
                return None
            return "browser.search", {
                "url": "https://www.google.com/search?" + urlencode({"q": query}),
                "query": query,
            }
        return "browser.navigate", {"url": "https://www.google.com/"}

    patterns = [
        r"^(?:please\s+)?(?:open|launch)\s+(?:chrome|(?:the\s+)?browser)(?:\s+and)?\s+"
        r"(?:open\s+|go\s+to\s+|navigate\s+to\s+|visit\s+)?(.+)$",
        r"^(?:please\s+)?(?:open|visit|go\s+to|navigate\s+to)\s+(.+)$",
    ]
    target = None
    for pattern in patterns:
        match = re.match(pattern, text, flags=re.IGNORECASE)
        if match:
            target = match.group(1).strip().strip("'\"")
            break
    if not target or any(character.isspace() for character in target):
        return None

    if target.lower() in {"google", "google.com", "www.google.com"}:
        url = "https://www.google.com/"
    elif re.match(r"^https?://", target, flags=re.IGNORECASE):
        url = target
    elif re.match(
        r"^(?:localhost|(?:[a-z0-9-]+\.)+[a-z]{2,})(?::\d{1,5})?(?:/[^\s]*)?$",
        target,
        flags=re.IGNORECASE,
    ):
        url = "https://" + target
    else:
        return None

    try:
        return "browser.navigate", {"url": validated_browser_url(url)}
    except ValueError:
        return None


def _approval_command(
    command_id: str,
    base: dict[str, Any],
    store: Store,
    action: str,
    payload: dict[str, Any],
    detail: str,
    message: str,
) -> dict[str, Any]:
    approval = store.request_action_approval(command_id, action, payload, detail, message)
    return {**base, "status": "approval_required", "message": message, "approval": approval}


def handle_command(text: str, store: Store) -> dict[str, Any]:
    normalized = " ".join(text.strip().split())
    lowered = normalized.lower().rstrip("?!")
    note_content = _note_content(normalized)
    browser_request = _browser_request(normalized)

    if note_content:
        intent = "note.create"
    elif lowered in {"what time is it", "time", "current time", "what is the time"}:
        intent = "system.time"
    elif lowered in {"system status", "status", "health", "are you online"}:
        intent = "system.status"
    elif lowered in {"list notes", "show notes", "read my notes", "list my notes"}:
        intent = "note.list"
    elif lowered in {
        "git status",
        "show git status",
        "check git status",
        "run git status",
        "repository status",
        "repo status",
        "show repository status",
    }:
        intent = "terminal.git_status"
    elif browser_request:
        intent = browser_request[0]
    elif any(term in lowered for term in ("chrome", "browser", "website", "search google", "click")):
        intent = "browser.unsupported"
    elif any(term in lowered for term in ("terminal", "shell", "command prompt", "run command")):
        intent = "terminal.unsupported"
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

    if intent in {"browser.navigate", "browser.search"} and browser_request:
        action, payload = browser_request
        destination = payload["url"]
        message = (
            f"Approval required before opening this destination: {destination}. Nothing has opened yet."
        )
        return _approval_command(
            command_id,
            base,
            store,
            action,
            payload,
            f"Permission requested to open {destination} in the local browser.",
            message,
        )

    if intent == "terminal.git_status":
        message = (
            "Approval required to run git status --short --branch in the Nexus project root. "
            "This is read-only and no arbitrary shell input is accepted."
        )
        return _approval_command(
            command_id,
            base,
            store,
            intent,
            {"display_command": "git status --short --branch", "working_directory": "Nexus project root"},
            "Permission requested for the fixed read-only Git status command.",
            message,
        )

    if intent == "system.time":
        message = "Local core time is " + datetime.now(timezone.utc).strftime("%H:%M:%S UTC on %A, %d %B %Y") + "."
        status = "completed"
    elif intent == "system.status":
        counts = store.counts()
        assistant_name = store.get_settings()["assistant_name"]
        message = (
            f"{assistant_name} local core is online. {counts['notes']} note(s), "
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
    elif intent == "browser.unsupported":
        message = (
            "I can open an HTTP/HTTPS site or search Google after approval. "
            "Exact-target clicking is not available yet. Nothing was opened."
        )
        status = "unsupported"
    elif intent == "terminal.unsupported":
        message = (
            "Only the fixed, approval-gated git status --short --branch action is available. "
            "No arbitrary terminal command was run."
        )
        status = "unsupported"
    elif intent == "home.unavailable":
        message = "The home-device connector is not configured yet. No AC or other device was changed."
        status = "unavailable"
    else:
        message = (
            "I don’t have a safe, configured skill for that yet. Try time, status, list notes, "
            "take a note, open a website, search Google, or show Git status."
        )
        status = "unsupported"

    store.finish_command(command_id, status, message)
    return {**base, "status": status, "message": message}
