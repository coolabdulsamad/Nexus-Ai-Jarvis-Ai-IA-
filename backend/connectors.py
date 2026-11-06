from __future__ import annotations

import os
import shutil
import subprocess
import sys
import webbrowser
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit, urlunsplit

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


def execute_approved_action(
    action: str,
    payload: dict[str, Any],
    client_browser: bool = False,
) -> dict[str, Any]:
    if action in {"browser.navigate", "browser.search"}:
        return open_browser(payload, client_browser=client_browser)
    if action == "terminal.git_status":
        return git_status(payload)
    return {
        "status": "failed",
        "message": "This approval action is not recognized. Nothing was executed.",
        "output": None,
    }
