from __future__ import annotations

import os
import shutil
import subprocess
import sys
from collections import deque
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent
MAX_DISCOVERY_RESULTS = 30
MAX_DIRECTORIES_SCANNED = 600
MAX_DISCOVERY_DEPTH = 2

APPLICATIONS: dict[str, dict[str, Any]] = {
    "vscode": {
        "label": "VS Code",
        "executables": ("code", "code-insiders", "codium"),
        "description": "Open VS Code or a validated folder in a new VS Code window.",
    },
    "files": {
        "label": "File manager",
        "executables": (),
        "description": "Open the platform file manager at Home or a validated folder.",
    },
}


def configured_roots() -> list[Path]:
    configured = os.getenv("NEXUS_SYSTEM_ROOTS", "").strip()
    candidates = configured.split(os.pathsep) if configured else [str(Path.home())]
    roots: list[Path] = []
    for candidate in candidates:
        try:
            root = Path(candidate).expanduser().resolve(strict=True)
        except (OSError, RuntimeError):
            continue
        if root.is_dir() and root not in roots:
            roots.append(root)
    return roots[:8]


def _within_roots(path: Path, roots: list[Path]) -> bool:
    return any(path == root or path.is_relative_to(root) for root in roots)


def validated_directory(value: Any) -> Path:
    if not isinstance(value, str) or not value.strip() or len(value) > 1000:
        raise ValueError("A valid local directory is required.")
    try:
        path = Path(value).expanduser().resolve(strict=True)
    except (OSError, RuntimeError) as error:
        raise ValueError("The approved directory no longer exists.") from error
    roots = configured_roots()
    if not path.is_dir() or not _within_roots(path, roots):
        raise ValueError("The directory is outside Nexus's configured local discovery roots.")
    for root in roots:
        if path == root or path.is_relative_to(root):
            if any(part.startswith(".") for part in path.relative_to(root).parts):
                raise ValueError("Hidden directories are not available to the local launcher.")
            break
    return path


def discover_directories(query: str = "", limit: int = MAX_DISCOVERY_RESULTS) -> dict[str, Any]:
    normalized = query.strip().casefold()[:100]
    limit = min(MAX_DISCOVERY_RESULTS, max(1, limit))
    roots = configured_roots()
    matches: list[dict[str, Any]] = []
    scanned = 0
    truncated = False
    queue: deque[tuple[Path, int]] = deque((root, 0) for root in roots)
    seen: set[Path] = set()

    while queue and scanned < MAX_DIRECTORIES_SCANNED and len(matches) < limit:
        current, depth = queue.popleft()
        if current in seen:
            continue
        seen.add(current)
        try:
            entries = sorted(os.scandir(current), key=lambda entry: entry.name.casefold())
        except (OSError, PermissionError):
            continue
        for entry in entries:
            scanned += 1
            if scanned > MAX_DIRECTORIES_SCANNED:
                truncated = True
                break
            try:
                if entry.name.startswith(".") or entry.is_symlink() or not entry.is_dir(follow_symlinks=False):
                    continue
                path = Path(entry.path).resolve(strict=True)
            except (OSError, RuntimeError):
                continue
            if not _within_roots(path, roots):
                continue
            if not normalized or normalized in entry.name.casefold():
                matches.append({
                    "name": entry.name,
                    "path": str(path),
                    "parent": str(current),
                    "depth": depth + 1,
                })
                if len(matches) >= limit:
                    truncated = bool(queue)
                    break
            if depth < MAX_DISCOVERY_DEPTH:
                queue.append((path, depth + 1))
    return {
        "directories": matches,
        "roots": [str(root) for root in roots],
        "scanned": min(scanned, MAX_DIRECTORIES_SCANNED),
        "truncated": truncated or bool(queue),
        "max_depth": MAX_DISCOVERY_DEPTH,
    }


def resolve_directory_request(query: str) -> dict[str, Any]:
    expanded = Path(query).expanduser()
    if expanded.is_absolute() or query.strip().startswith("~"):
        try:
            path = validated_directory(query)
        except ValueError as error:
            return {"state": "not_found", "message": str(error), "directories": []}
        return {
            "state": "found",
            "directory": {"name": path.name or str(path), "path": str(path), "parent": str(path.parent)},
            "directories": [],
        }

    result = discover_directories(query, limit=8)
    directories = result["directories"]
    exact = [item for item in directories if item["name"].casefold() == query.strip().casefold()]
    if len(exact) == 1:
        return {"state": "found", "directory": exact[0], "directories": []}
    if len(directories) == 1:
        return {"state": "found", "directory": directories[0], "directories": []}
    if directories:
        return {
            "state": "ambiguous",
            "message": "Several folders match. Use the System control panel to choose the exact folder.",
            "directories": directories,
        }
    return {
        "state": "not_found",
        "message": (
            f"No visible folder matching {query!r} was found within the configured roots, "
            f"up to {MAX_DISCOVERY_DEPTH} levels deep. No folder was opened."
        ),
        "directories": [],
    }


def _application_executable(app_id: str) -> str | None:
    if app_id == "vscode":
        for candidate in APPLICATIONS[app_id]["executables"]:
            executable = shutil.which(candidate)
            if executable:
                return executable
        return None
    if app_id == "files":
        candidates = ("explorer",) if os.name == "nt" else ("open",) if sys.platform == "darwin" else ("xdg-open",)
        for candidate in candidates:
            executable = shutil.which(candidate)
            if executable:
                return executable
    return None


def application_status() -> list[dict[str, Any]]:
    return [
        {
            "id": app_id,
            "label": application["label"],
            "description": application["description"],
            "installed": _application_executable(app_id) is not None,
        }
        for app_id, application in APPLICATIONS.items()
    ]


def system_status() -> dict[str, Any]:
    return {
        "roots": [str(root) for root in configured_roots()],
        "discovery": {
            "max_depth": MAX_DISCOVERY_DEPTH,
            "max_scanned": MAX_DIRECTORIES_SCANNED,
            "hidden_directories": False,
            "symlinks_followed": False,
            "file_contents_read": False,
        },
        "applications": application_status(),
        "screen_awareness": {
            "state": "not_configured",
            "capture_active": False,
            "monitors_visible": 0,
            "clicking_enabled": False,
            "detail": "No screen capture, monitor inventory, visual understanding or clicking connector is active.",
        },
    }


def _launch(command: list[str]) -> None:
    subprocess.Popen(
        command,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        shell=False,
    )


def launch_application(payload: dict[str, Any]) -> dict[str, Any]:
    app_id = payload.get("application")
    if app_id not in APPLICATIONS:
        return {"status": "failed", "message": "The approved application is not in the fixed launcher catalog.", "output": None}
    executable = _application_executable(app_id)
    if not executable:
        return {
            "status": "unavailable",
            "message": f"{APPLICATIONS[app_id]['label']} is not available on this system's PATH. Nothing was launched.",
            "output": None,
        }
    command = [executable, "--new-window"] if app_id == "vscode" else [executable, str(Path.home())]
    try:
        _launch(command)
    except OSError as error:
        return {"status": "failed", "message": f"The application could not be launched: {error}", "output": None}
    return {
        "status": "completed",
        "message": f"Approved launch requested for {APPLICATIONS[app_id]['label']}. No other application or command was run.",
        "output": None,
    }


def open_folder(payload: dict[str, Any]) -> dict[str, Any]:
    app_id = payload.get("application", "vscode")
    if app_id not in APPLICATIONS:
        return {"status": "failed", "message": "The approved folder application is not allowed.", "output": None}
    try:
        directory = validated_directory(payload.get("path"))
    except ValueError as error:
        return {"status": "failed", "message": str(error), "output": None}
    executable = _application_executable(app_id)
    if not executable:
        return {
            "status": "unavailable",
            "message": f"{APPLICATIONS[app_id]['label']} is unavailable. The folder was not opened.",
            "output": None,
        }
    command = [executable, "--new-window", str(directory)] if app_id == "vscode" else [executable, str(directory)]
    try:
        _launch(command)
    except OSError as error:
        return {"status": "failed", "message": f"The folder could not be opened: {error}", "output": None}
    return {
        "status": "completed",
        "message": f"Approved folder opened with {APPLICATIONS[app_id]['label']}: {directory}",
        "output": None,
    }
