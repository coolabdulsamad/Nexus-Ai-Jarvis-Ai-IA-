from __future__ import annotations

import base64
import io
import json
import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent
WINDOWS_HELPER = PROJECT_ROOT / "scripts" / "windows_screen.ps1"
MAX_CAPTURE_RESPONSE = 16_000_000


class ScreenError(Exception):
    """A safe, user-presentable screen connector error."""


def _powershell() -> str | None:
    if os.name != "nt" and "microsoft" not in platform.release().lower():
        return None
    return shutil.which("powershell.exe") or shutil.which("powershell")


def _run_windows(action: str, monitor_id: int = 0, x: int = 0, y: int = 0) -> str:
    executable = _powershell()
    if not executable or not WINDOWS_HELPER.is_file():
        raise ScreenError("The Windows screen helper is unavailable. No screen action was taken.")
    command = [
        executable,
        "-NoProfile",
        "-NonInteractive",
        "-File",
        str(WINDOWS_HELPER),
        action,
        "-MonitorId",
        str(monitor_id),
    ]
    if action == "click":
        command.extend(["-X", str(x), "-Y", str(y)])
    try:
        completed = subprocess.run(
            command,
            shell=False,
            capture_output=True,
            text=True,
            timeout=25,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise ScreenError(f"The Windows screen connector could not finish safely: {error}") from error
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout).strip()[-800:]
        raise ScreenError(f"The Windows screen connector reported an error: {detail or 'unknown error'}")
    if len(completed.stdout) > MAX_CAPTURE_RESPONSE:
        raise ScreenError("The screen capture exceeded the safe response limit.")
    return completed.stdout.strip()


def list_monitors() -> list[dict[str, Any]]:
    if os.getenv("NEXUS_SCREEN_DISABLED") == "1":
        raise ScreenError("Screen access is disabled by NEXUS_SCREEN_DISABLED=1.")
    if _powershell():
        try:
            data = json.loads(_run_windows("monitors"))
        except json.JSONDecodeError as error:
            raise ScreenError("Windows returned invalid monitor metadata.") from error
        rows = data if isinstance(data, list) else [data]
        monitors: list[dict[str, Any]] = []
        for row in rows:
            if not isinstance(row, dict):
                continue
            try:
                monitor = {
                    "id": int(row["id"]),
                    "left": int(row["left"]),
                    "top": int(row["top"]),
                    "width": int(row["width"]),
                    "height": int(row["height"]),
                    "primary": bool(row["primary"]),
                    "name": str(row.get("name") or "")[:120],
                }
            except (KeyError, TypeError, ValueError):
                continue
            if monitor["id"] > 0 and monitor["width"] > 0 and monitor["height"] > 0:
                monitors.append(monitor)
        if not monitors:
            raise ScreenError("Windows returned no usable monitors.")
        return monitors[:16]

    try:
        import mss  # type: ignore[import-not-found]
    except ImportError as error:
        raise ScreenError("The mss screen connector is not installed. Install the project requirements.") from error
    try:
        with mss.MSS() as capture:
            return [
                {
                    "id": index,
                    "left": int(monitor["left"]),
                    "top": int(monitor["top"]),
                    "width": int(monitor["width"]),
                    "height": int(monitor["height"]),
                    "primary": index == 1,
                    "name": f"Display {index}",
                }
                for index, monitor in enumerate(capture.monitors[1:17], start=1)
                if int(monitor["width"]) > 0 and int(monitor["height"]) > 0
            ]
    except Exception as error:
        raise ScreenError(f"The graphical display is unavailable: {error}") from error


def monitor_by_id(monitor_id: Any) -> dict[str, Any]:
    if isinstance(monitor_id, bool) or not isinstance(monitor_id, int) or not 1 <= monitor_id <= 16:
        raise ScreenError("A valid monitor number is required.")
    monitor = next((item for item in list_monitors() if item["id"] == monitor_id), None)
    if monitor is None:
        raise ScreenError(f"Monitor {monitor_id} is not currently available.")
    return monitor


def capture_monitor(monitor_id: Any) -> dict[str, Any]:
    monitor = monitor_by_id(monitor_id)
    if _powershell():
        encoded = _run_windows("capture", monitor["id"])
    else:
        try:
            import mss  # type: ignore[import-not-found]
            from PIL import Image  # type: ignore[import-not-found]
        except ImportError as error:
            raise ScreenError("Install mss and Pillow from the project requirements before screen capture.") from error
        try:
            with mss.MSS() as capture:
                raw = capture.grab(capture.monitors[monitor["id"]])
                image = Image.frombytes("RGB", raw.size, raw.rgb)
            scale = min(1.0, 1600.0 / monitor["width"])
            if scale < 1.0:
                image = image.resize(
                    (max(1, round(monitor["width"] * scale)), max(1, round(monitor["height"] * scale)))
                )
            buffer = io.BytesIO()
            image.save(buffer, format="PNG")
            encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
        except Exception as error:
            raise ScreenError(f"The monitor could not be captured: {error}") from error
    if not encoded or len(encoded) > MAX_CAPTURE_RESPONSE:
        raise ScreenError("The monitor returned an empty or oversized capture.")
    return {
        "monitor": monitor,
        "image_base64": encoded,
        "image_width": round(monitor["width"] * min(1.0, 1600.0 / monitor["width"])),
        "image_height": round(monitor["height"] * min(1.0, 1600.0 / monitor["width"])),
    }


def click_monitor(monitor_id: Any, x: Any, y: Any) -> dict[str, Any]:
    monitor = monitor_by_id(monitor_id)
    if any(isinstance(value, bool) or not isinstance(value, int) for value in (x, y)):
        raise ScreenError("Approved click coordinates must be integers.")
    if not (monitor["left"] <= x < monitor["left"] + monitor["width"]):
        raise ScreenError("The approved X coordinate is outside the current monitor bounds. Nothing was clicked.")
    if not (monitor["top"] <= y < monitor["top"] + monitor["height"]):
        raise ScreenError("The approved Y coordinate is outside the current monitor bounds. Nothing was clicked.")
    if _powershell():
        _run_windows("click", monitor["id"], x, y)
    elif sys.platform.startswith("linux"):
        try:
            import pyautogui  # type: ignore[import-not-found]

            pyautogui.moveTo(x, y, duration=0.25)
            pyautogui.click(x=x, y=y, clicks=1, interval=0, button="left")
        except Exception as error:
            raise ScreenError(f"The approved click could not be completed: {error}") from error
    else:
        raise ScreenError("Single-click control is currently supported only by the Windows and Linux connectors.")
    return {"monitor": monitor, "x": x, "y": y}


def screen_status() -> dict[str, Any]:
    try:
        monitors = list_monitors()
    except ScreenError as error:
        return {
            "state": "unavailable",
            "capture_active": False,
            "monitors_visible": 0,
            "monitors": [],
            "clicking_enabled": False,
            "detail": str(error),
        }
    clicking_available = bool(_powershell()) or sys.platform.startswith("linux")
    return {
        "state": "available",
        "capture_active": False,
        "monitors_visible": len(monitors),
        "monitors": monitors,
        "clicking_enabled": False,
        "clicking_available": clicking_available,
        "detail": (
            f"{len(monitors)} monitor(s) detected. No continuous capture is active. "
            "Each snapshot and each click requires its own explicit approval."
        ),
    }
