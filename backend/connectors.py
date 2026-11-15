from __future__ import annotations

import math
import os
import shutil
import subprocess
import sys
import webbrowser
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit, urlunsplit

from .ollama import OllamaError

PROJECT_ROOT = Path(__file__).resolve().parent.parent
MAX_COMMAND_OUTPUT = 5000


def validated_browser_url(value: Any) -> str:
    """Re-check persisted approval payloads before opening the local browser."""
    if not isinstance(value, str) or len(value) > 2000:
        raise ValueError("A valid browser destination is required.")
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except ValueError as error:
        raise ValueError("The browser destination is invalid.") from error
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("Only HTTP and HTTPS browser destinations are allowed.")
    if parsed.username or parsed.password:
        raise ValueError("Browser destinations containing credentials are not allowed.")
    if port is not None and not 1 <= port <= 65535:
        raise ValueError("The browser destination port is invalid.")
    return urlunsplit(parsed)


def _chrome_command(url: str) -> tuple[list[str], str] | None:
    if os.name == "nt":
        candidates = ["chrome.exe", "chrome"]
    elif sys.platform == "darwin":
        candidates = []
        application = Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
        if application.is_file():
            return [str(application), url], "Google Chrome"
    else:
        candidates = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser"]

    for candidate in candidates:
        executable = shutil.which(candidate)
        if executable:
            return [executable, url], "Google Chrome" if "chrome" in candidate else "Chromium"
    return None


def open_browser(payload: dict[str, Any], client_browser: bool = False) -> dict[str, Any]:
    try:
        url = validated_browser_url(payload.get("url"))
    except ValueError as error:
        return {"status": "failed", "message": str(error), "output": None}

    if client_browser:
        return {
            "status": "completed",
            "message": f"Approval confirmed. Opening the exact destination in this browser: {url}",
            "output": None,
        }

    try:
        chrome = _chrome_command(url)
        if chrome:
            command, browser_name = chrome
            subprocess.Popen(
                command,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        else:
            opened = webbrowser.open(url, new=2)
            if not opened:
                return {
                    "status": "unavailable",
                    "message": "No compatible local browser could be opened. Nothing was launched.",
                    "output": None,
                }
            browser_name = "your default browser"
        return {
            "status": "completed",
            "message": f"Approved destination opened in {browser_name}: {url}",
            "output": None,
        }
    except (OSError, webbrowser.Error) as error:
        return {
            "status": "unavailable",
            "message": f"The browser could not be opened: {error}. No other action was attempted.",
            "output": None,
        }


def git_status(_payload: dict[str, Any]) -> dict[str, Any]:
    """Run one fixed read-only command. Approval payload cannot alter argv or cwd."""
    command = ["git", "status", "--short", "--branch"]
    try:
        completed = subprocess.run(
            command,
            cwd=PROJECT_ROOT,
            shell=False,
            capture_output=True,
            text=True,
            timeout=6,
            check=False,
        )
    except FileNotFoundError:
        return {
            "status": "unavailable",
            "message": "Git is not installed or is not on PATH. No terminal command was run.",
            "output": None,
        }
    except (OSError, subprocess.TimeoutExpired) as error:
        return {
            "status": "failed",
            "message": f"Git status could not finish safely: {error}. No changes were made.",
            "output": None,
        }

    output = (completed.stdout + completed.stderr).strip()[:MAX_COMMAND_OUTPUT]
    if completed.returncode != 0:
        return {
            "status": "failed",
            "message": "Git status returned an error. No repository changes were made.",
            "output": output or f"Git exited with code {completed.returncode}.",
        }
    return {
        "status": "completed",
        "message": "Git status completed. This was read-only; no repository changes were made.",
        "output": output or "The working tree is clean.",
    }


def inspect_screen(payload: dict[str, Any], assistant: Any = None, store: Any = None) -> dict[str, Any]:
    from .screen import ScreenError, capture_monitor

    try:
        capture = capture_monitor(payload.get("monitor_id"))
    except ScreenError as error:
        return {"status": "unavailable", "message": str(error), "output": None}
    monitor = capture["monitor"]
    target = payload.get("target")
    question = str(payload.get("question") or "Describe what is visibly happening on this monitor.")[:500]
    if assistant is None or store is None:
        return {
            "status": "unavailable",
            "message": "The snapshot was captured, but no vision connector is configured. No image was stored and nothing was clicked.",
            "output": None,
        }
    try:
        analysis = assistant.inspect_screen(
            store=store,
            image_base64=capture["image_base64"],
            image_width=capture["image_width"],
            image_height=capture["image_height"],
            question=question,
            target=target,
        )
    except OllamaError as error:
        screen = {
            "image_data_url": "data:image/png;base64," + capture["image_base64"],
            "monitor": monitor,
            "target": target,
            "description": "Visual analysis unavailable.",
        }
        return {
            "status": "unavailable",
            "message": f"The approved snapshot was captured for this response, but visual analysis failed: {error} No image was stored and nothing was clicked.",
            "output": None,
            "screen": screen,
        }

    if not target:
        return {
            "status": "completed",
            "message": analysis["description"],
            "output": None,
            "screen": {
                "image_data_url": "data:image/png;base64," + capture["image_base64"],
                "monitor": monitor,
                "description": analysis["description"],
                "model": analysis["model"],
            },
        }

    location = analysis["location"]
    found = location.get("found") is True
    x = location.get("x")
    y = location.get("y")
    confidence = location.get("confidence")
    valid_coordinates = (
        all(isinstance(value, int) and not isinstance(value, bool) for value in (x, y))
        and 0 <= x < capture["image_width"]
        and 0 <= y < capture["image_height"]
    )
    valid_confidence = (
        isinstance(confidence, (int, float))
        and not isinstance(confidence, bool)
        and math.isfinite(confidence)
        and 0 <= confidence <= 1
    )
    description = str(location.get("description") or "No visual evidence supplied.")[:1000]
    screen = {
        "image_data_url": "data:image/png;base64," + capture["image_base64"],
        "monitor": monitor,
        "target": str(target)[:160],
        "description": description,
        "model": analysis["model"],
    }
    if not found or not valid_coordinates or not valid_confidence or confidence < 0.55:
        return {
            "status": "unavailable",
            "message": f"Nexus could not locate {target!r} confidently on monitor {monitor['id']}. Nothing was clicked. {description}",
            "output": None,
            "screen": screen,
        }

    global_x = monitor["left"] + round(x * monitor["width"] / capture["image_width"])
    global_y = monitor["top"] + round(y * monitor["height"] / capture["image_height"])
    screen.update(x=global_x, y=global_y, confidence=round(float(confidence), 2))
    return {
        "status": "completed",
        "message": (
            f"Possible {target!r} target proposed at global coordinates ({global_x}, {global_y}) on monitor {monitor['id']}. "
            "Review the snapshot and exact coordinates, then request a separate click approval. Nothing was clicked."
        ),
        "output": None,
        "screen": screen,
    }


def click_screen(payload: dict[str, Any]) -> dict[str, Any]:
    from .screen import ScreenError, click_monitor

    try:
        clicked = click_monitor(payload.get("monitor_id"), payload.get("x"), payload.get("y"))
    except ScreenError as error:
        return {"status": "failed", "message": str(error), "output": None}
    target = str(payload.get("target") or "approved target")[:160]
    return {
        "status": "completed",
        "message": (
            f"One approved left click was sent for {target!r} at ({clicked['x']}, {clicked['y']}) "
            f"on monitor {clicked['monitor']['id']}. No keyboard input or additional click was sent."
        ),
        "output": None,
    }


def execute_approved_action(
    action: str,
    payload: dict[str, Any],
    client_browser: bool = False,
    assistant: Any = None,
    store: Any = None,
) -> dict[str, Any]:
    if action in {"browser.navigate", "browser.search"}:
        return open_browser(payload, client_browser=client_browser)
    if action == "terminal.git_status":
        return git_status(payload)
    if action == "system.open_application":
        from .system import launch_application

        return launch_application(payload)
    if action == "system.open_folder":
        from .system import open_folder

        return open_folder(payload)
    if action in {"screen.capture", "screen.locate"}:
        return inspect_screen(payload, assistant=assistant, store=store)
    if action == "screen.click":
        return click_screen(payload)
    return {
        "status": "failed",
        "message": "This approval action is not recognized. Nothing was executed.",
        "output": None,
    }
