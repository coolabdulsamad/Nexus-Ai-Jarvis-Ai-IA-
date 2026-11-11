from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Callable
from urllib.parse import urlencode

from .connectors import validated_browser_url
from .store import Store
from .system import APPLICATIONS, resolve_directory_request

if TYPE_CHECKING:
    from .ollama import OllamaAssistant


CAPABILITIES = [
    {
        "id": "assistant",
        "label": "Local model conversation",
        "status": "available",
        "tier": 0,
        "description": "Free-form conversation through configured Ollama inference, with assistant identity, bounded history and approved memories. No training or autonomous actions.",
    },
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
        "id": "memory",
        "label": "Typed memory & timeline",
        "status": "available",
        "tier": 1,
        "description": "Persist approved preferences, applications, files, devices and facts, plus command/response history.",
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
        "id": "local-system",
        "label": "Approved apps & folders",
        "status": "available",
        "tier": 2,
        "description": "Discover bounded directory metadata and open VS Code, the file manager or a validated folder after approval. No arbitrary shell commands.",
    },
    {
        "id": "screen",
        "label": "Screen & multi-monitor awareness",
        "status": "planned",
        "tier": 2,
        "description": "No display capture, screen understanding, monitor inventory or clicking is active. These need separate visible consent and scoped connectors.",
    },
    {
        "id": "devices",
        "label": "Owned-device registry",
        "status": "available",
        "tier": 1,
        "description": "Register approved Android/iPhone records and inspect platform boundaries. No device is paired or controlled.",
    },
    {
        "id": "camera",
        "label": "Consent-based camera preview",
        "status": "available",
        "tier": 2,
        "description": "Approval-gated local webcam preview with browser permission, video only, visible stop and no frame storage.",
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
        "description": "Push-to-talk and opt-in wake-word sessions, spoken replies, interruption and interactive avatars. Browser speech recognition is not speaker identification.",
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


def _memory_request(text: str) -> tuple[str, str] | None:
    match = re.match(
        r"^(?:please\s+)?remember\s+(preference|application|file|device|fact)\s*[:\-]\s+(.+)$",
        text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if not match:
        return None
    return match.group(1).lower(), match.group(2).strip()


def _device_request(text: str) -> tuple[str, str] | None:
    match = re.match(
        r"^(?:please\s+)?register\s+(android|iphone)(?:\s+device)?\s*[:\-]\s+(.+)$",
        text,
        flags=re.IGNORECASE,
    )
    if not match:
        return None
    name = match.group(2).strip()
    if not name or len(name) > 80:
        return None
    return match.group(1).lower(), name


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


def _system_request(text: str) -> tuple[str, dict[str, Any]] | None:
    app_names = r"(?:vs\s*code|visual\s+studio\s+code|vscode|file\s+manager|files)"
    incomplete_folder = re.match(
        rf"^(?:please\s+)?(?:open|launch)\s+(?:the\s+)?(?:a\s+)?(?:folder|directory)"
        rf"(?:\s+(?:in|with|using)\s+({app_names}))?$",
        text,
        flags=re.IGNORECASE,
    )
    if incomplete_folder:
        app_name = (incomplete_folder.group(1) or "vscode").lower()
        application = "files" if app_name in {"files", "file manager"} else "vscode"
        return "system.clarify_folder", {"application": application}

    folder_patterns = [
        rf"^(?:please\s+)?(?:open|launch)\s+(?:the\s+)?(?:folder|directory)\s+(.+?)(?:\s+(?:in|with|using)\s+({app_names}))?$",
        rf"^(?:please\s+)?(?:open|launch)\s+(.+?)\s+(?:in|with|using)\s+({app_names})$",
    ]
    for pattern in folder_patterns:
        match = re.match(pattern, text, flags=re.IGNORECASE)
        if not match:
            continue
        query = match.group(1).strip().strip("'\"")
        app_name = (match.group(2) or "vscode").lower()
        if not query or len(query) > 200 or any(char in query for char in "\x00\r\n"):
            return None
        application = "files" if app_name in {"files", "file manager"} else "vscode"
        return "system.open_folder", {"query": query, "application": application}

    application = re.match(
        rf"^(?:please\s+)?(?:open|launch)\s+(?:the\s+)?({app_names})$",
        text,
        flags=re.IGNORECASE,
    )
    if application:
        app_name = application.group(1).lower()
        app_id = "files" if app_name in {"files", "file manager"} else "vscode"
        return "system.open_application", {"application": app_id}
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


def handle_command(
    text: str,
    store: Store,
    assistant: OllamaAssistant | None = None,
    on_token: Callable[[str], None] | None = None,
) -> dict[str, Any]:
    normalized = " ".join(text.strip().split())
    lowered = normalized.lower().rstrip("?!")
    note_content = _note_content(normalized)
    memory_request = _memory_request(normalized)
    device_request = _device_request(normalized)
    browser_request = _browser_request(normalized)
    system_request = _system_request(normalized)

    if memory_request:
        intent = "memory.create"
    elif device_request:
        intent = "device.register"
    elif note_content:
        intent = "note.create"
    elif lowered in {"what time is it", "time", "current time", "what is the time"}:
        intent = "system.time"
    elif lowered in {"system status", "status", "health", "are you online"}:
        intent = "system.status"
    elif lowered in {"list notes", "show notes", "read my notes", "list my notes"}:
        intent = "note.list"
    elif lowered in {"list memory", "show memory", "list memories", "show memories"}:
        intent = "memory.list"
    elif lowered in {"show timeline", "conversation history", "show conversation history"}:
        intent = "conversation.list"
    elif lowered in {"show devices", "list devices", "show owned devices", "device status"}:
        intent = "device.list"
    elif lowered in {"home status", "home connector status", "ac connector status"}:
        intent = "home.status"
    elif lowered in {"start camera", "start camera preview", "open camera preview", "start webcam", "start webcam preview"}:
        intent = "camera.preview"
    elif lowered in {"camera status", "camera preview status", "webcam status"}:
        intent = "camera.status"
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
    elif system_request:
        intent = system_request[0]
    elif browser_request:
        intent = browser_request[0]
    elif lowered.startswith("register "):
        intent = "device.unsupported"
    elif any(term in lowered for term in ("chrome", "browser", "website", "search google", "click")):
        intent = "browser.unsupported"
    elif any(term in lowered for term in ("terminal", "shell", "command prompt", "run command")):
        intent = "terminal.unsupported"
    elif re.match(r"^(?:please\s+)?(?:open|launch|visit|go\s+to|navigate\s+to)\b", lowered):
        intent = "browser.unsupported"
    elif any(term in lowered for term in ("air conditioner", "air conditioning", " ac", "ac ", "home device", "thermostat")):
        intent = "home.unavailable"
    else:
        intent = "assistant.chat" if assistant else "unknown"

    command_id = store.create_command(normalized, intent)
    base: dict[str, Any] = {"command_id": command_id, "intent": intent}

    if intent == "system.clarify_folder" and system_request:
        application = system_request[1]["application"]
        label = APPLICATIONS[application]["label"]
        message = f"Which folder would you like to open with {label}?"
        store.finish_command(command_id, "completed", message)
        return {
            **base,
            "status": "completed",
            "message": message,
            "follow_up": {"kind": "system.folder", "application": application},
        }

    if intent == "assistant.chat" and assistant:
        reply = assistant.respond(store, normalized, command_id, on_token=on_token)
        store.finish_command(command_id, reply["status"], reply["message"])
        return {**base, **reply}

    if intent == "memory.create" and memory_request:
        kind, content = memory_request
        approval = store.request_memory_approval(command_id, kind, content)
        return {
            **base,
            "status": "approval_required",
            "message": f"I’m ready to save this {kind} memory. Review the request and approve or reject it.",
            "approval": approval,
        }

    if intent == "device.register" and device_request:
        platform, name = device_request
        approval = store.request_device_approval(command_id, platform, name)
        return {
            **base,
            "status": "approval_required",
            "message": (
                f"I’m ready to register {name} as an owned {platform} device. "
                "This creates only a local, not-connected record. Review and approve or reject it."
            ),
            "approval": approval,
        }

    if intent == "camera.preview":
        approval = store.request_camera_approval(command_id)
        return {
            **base,
            "status": "approval_required",
            "message": (
                "I’m ready to request a video-only webcam preview. Approval does not activate the camera yet; "
                "your browser will still ask for permission. No audio, recording or image storage is included."
            ),
            "approval": approval,
        }

    if intent == "note.create":
        approval = store.request_note_approval(command_id, note_content or "")
        return {
            **base,
            "status": "approval_required",
            "message": "I’m ready to save this note. Review the request and approve or reject it.",
            "approval": approval,
        }

    if intent == "system.open_application" and system_request:
        payload = system_request[1]
        label = APPLICATIONS[payload["application"]]["label"]
        return _approval_command(
            command_id,
            base,
            store,
            intent,
            payload,
            f"Permission requested to launch the fixed {label} connector.",
            f"Approval required to open {label}. No application has launched yet.",
        )

    if intent == "system.open_folder" and system_request:
        request_payload = system_request[1]
        resolved = resolve_directory_request(request_payload["query"])
        if resolved["state"] != "found":
            message = resolved.get("message") or "No unique folder was resolved. Nothing was opened."
            store.finish_command(command_id, "unavailable", message)
            result = {
                **base,
                "status": "unavailable",
                "message": message,
                "directories": resolved["directories"],
            }
            if resolved["state"] == "ambiguous":
                result["follow_up"] = {
                    "kind": "system.folder",
                    "application": request_payload["application"],
                }
            return result
        directory = resolved["directory"]
        application = request_payload["application"]
        label = APPLICATIONS[application]["label"]
        payload = {
            "path": directory["path"],
            "name": directory["name"],
            "application": application,
        }
        return _approval_command(
            command_id,
            base,
            store,
            intent,
            payload,
            f"Permission requested to open the validated folder {directory['path']} with {label}.",
            f"Approval required to open {directory['path']} with {label}. Nothing has opened yet.",
        )

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
    elif intent == "memory.list":
        memories = store.list_memories(limit=10)
        message = (
            "No typed memories are stored yet."
            if not memories
            else "Latest typed memories: "
            + " | ".join(f"{memory['kind']}: {memory['content']}" for memory in memories)
        )
        status = "completed"
    elif intent == "conversation.list":
        conversations = store.list_conversations(10)
        message = (
            "No conversation history is stored yet."
            if not conversations
            else f"{len(conversations)} recent command(s) are available in the Memory timeline."
        )
        status = "completed"
    elif intent == "device.list":
        devices = store.list_devices(20)
        message = (
            "No owned devices are registered. Use “Register Android device: name” or "
            "“Register iPhone device: name”; registration requires approval and does not pair the device."
            if not devices
            else f"{len(devices)} owned device record(s) are available. All remain not connected until a companion connector is configured."
        )
        status = "completed"
    elif intent == "home.status":
        message = (
            "No Home Assistant, Matter or vendor-authorised home connector is configured. "
            "AC control is unavailable, and no home device was contacted or changed."
        )
        status = "unavailable"
    elif intent == "camera.status":
        sessions = store.list_camera_sessions(1)
        if not sessions:
            message = "No camera preview has been approved or started. Nexus has not accessed a camera."
        else:
            latest = sessions[0]
            states = {
                "approved": "approved, but the browser has not reported an active stream",
                "active": "reported active by the browser; video only, with no recording or frame storage",
                "unavailable": "unavailable or denied; no preview is active",
                "stopped": "stopped; the browser released its camera tracks",
            }
            message = f"Latest camera session is {states[latest['status']]}."
        status = "completed"
    elif intent == "device.unsupported":
        message = "Only Android and iPhone device records are supported. No device was registered or connected."
        status = "unsupported"
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
            "remember preference: your preference, show memory, register Android device: name, "
            "show devices, home status, start camera preview, camera status, open a website, search Google, or show Git status."
        )
        status = "unsupported"

    store.finish_command(command_id, status, message)
    return {**base, "status": status, "message": message}
