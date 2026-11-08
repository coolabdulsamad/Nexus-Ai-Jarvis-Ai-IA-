from __future__ import annotations

import os
import re
from contextlib import asynccontextmanager
from functools import partial
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import __version__
from .commands import CAPABILITIES, handle_command
from .connectors import execute_approved_action
from .ollama import OllamaAssistant
from .store import ApprovalResolvedError, CameraStateError, NotFoundError, Store, utc_now
from .system import discover_directories, system_status

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB_PATH = PROJECT_ROOT / "data" / "nexus.db"


class CommandRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


class ApprovalDecision(BaseModel):
    client_browser: bool = False


class CameraEvent(BaseModel):
    event: Literal["started", "unavailable", "stopped"]


class SettingsUpdate(BaseModel):
    assistant_name: str | None = Field(default=None, min_length=1, max_length=40)
    voice_enabled: bool | None = None
    voice_rate: float | None = Field(default=None, ge=0.7, le=1.4)
    avatar_mode: Literal["globe", "humanoid"] | None = None
    model_enabled: bool | None = None
    model_name: str | None = Field(default=None, min_length=1, max_length=100)
    wake_word: str | None = Field(default=None, min_length=2, max_length=40)


def create_app() -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.store = Store(os.getenv("NEXUS_DB_PATH", DEFAULT_DB_PATH))
        app.state.assistant = OllamaAssistant()
        yield

    app = FastAPI(
        title="Nexus Local Core",
        summary="Local-first command, approval, memory and audit API.",
        version=__version__,
        lifespan=lifespan,
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ],
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
    )

    def store(request: Request) -> Store:
        return request.app.state.store

    def assistant(request: Request) -> OllamaAssistant:
        return request.app.state.assistant

    @app.get("/api/health", tags=["system"])
    def health(request: Request) -> dict:
        return {
            "status": "online",
            "service": "Nexus Local Core",
            "version": __version__,
            "database": "sqlite",
            "time": utc_now(),
            **store(request).counts(),
        }

    @app.get("/api/capabilities", tags=["system"])
    def capabilities() -> dict:
        return {"capabilities": CAPABILITIES}

    @app.post("/api/commands", status_code=200, tags=["commands"])
    def command(payload: CommandRequest, request: Request) -> dict:
        return handle_command(payload.text, store(request), assistant(request))

    @app.get("/api/assistant/status", tags=["assistant"])
    def assistant_status(request: Request) -> dict:
        return assistant(request).status(store(request))

    @app.get("/api/settings", tags=["system"])
    def settings(request: Request) -> dict:
        return store(request).get_settings()

    @app.post("/api/settings", tags=["system"])
    def update_settings(payload: SettingsUpdate, request: Request) -> dict:
        updates = payload.model_dump(exclude_unset=True, exclude_none=True)
        if "assistant_name" in updates:
            name = updates["assistant_name"].strip()
            if not name:
                raise HTTPException(status_code=422, detail="Assistant name cannot be blank.")
            updates["assistant_name"] = name
        if "model_name" in updates:
            model_name = updates["model_name"].strip()
            if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:/-]{0,99}", model_name):
                raise HTTPException(status_code=422, detail="Enter a valid Ollama model name, such as qwen2.5:3b.")
            updates["model_name"] = model_name
        if "wake_word" in updates:
            wake_word = updates["wake_word"].strip()
            if len(wake_word) < 2 or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9' -]{0,39}", wake_word):
                raise HTTPException(status_code=422, detail="Use a wake word with 2–40 letters, numbers, spaces, apostrophes or hyphens.")
            updates["wake_word"] = wake_word
        return store(request).update_settings(updates)

    @app.get("/api/system/status", tags=["system"])
    def local_system_status() -> dict:
        return system_status()

    @app.get("/api/system/directories", tags=["system"])
    def local_directories(
        query: str = Query(default="", max_length=100),
        limit: int = Query(default=20, ge=1, le=30),
    ) -> dict:
        return discover_directories(query, limit)

    @app.get("/api/notes", tags=["memory"])
    def notes(request: Request, limit: int = Query(default=100, ge=1, le=100)) -> dict:
        return {"notes": store(request).list_notes(limit)}

    @app.get("/api/memories", tags=["memory"])
    def memories(
        request: Request,
        kind: Literal["preference", "application", "file", "device", "fact"] | None = None,
        limit: int = Query(default=100, ge=1, le=100),
    ) -> dict:
        return {"memories": store(request).list_memories(kind, limit)}

    @app.get("/api/conversations", tags=["memory"])
    def conversations(request: Request, limit: int = Query(default=50, ge=1, le=100)) -> dict:
        return {"conversations": store(request).list_conversations(limit)}

    @app.get("/api/devices", tags=["devices"])
    def devices(request: Request, limit: int = Query(default=100, ge=1, le=100)) -> dict:
        return {"devices": store(request).list_devices(limit)}

    @app.get("/api/camera/sessions", tags=["camera"])
    def camera_sessions(request: Request, limit: int = Query(default=20, ge=1, le=50)) -> dict:
        return {"sessions": store(request).list_camera_sessions(limit)}

    @app.post("/api/camera/sessions/{session_id}/events", tags=["camera"])
    def camera_event(session_id: str, payload: CameraEvent, request: Request) -> dict:
        try:
            return {"session": store(request).record_camera_event(session_id, payload.event)}
        except NotFoundError as error:
            raise HTTPException(status_code=404, detail=str(error)) from error
        except CameraStateError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error

    @app.get("/api/approvals", tags=["approvals"])
    def approvals(
        request: Request,
        status: Literal["pending", "approved", "rejected"] | None = None,
        limit: int = Query(default=100, ge=1, le=100),
    ) -> dict:
        return {"approvals": store(request).list_approvals(status, limit)}

    @app.post("/api/approvals/{approval_id}/approve", tags=["approvals"])
    def approve(approval_id: str, request: Request, payload: ApprovalDecision | None = None) -> dict:
        executor = partial(
            execute_approved_action,
            client_browser=bool(payload and payload.client_browser),
        )
        try:
            return store(request).resolve_approval(approval_id, "approved", executor)
        except NotFoundError as error:
            raise HTTPException(status_code=404, detail=str(error)) from error
        except ApprovalResolvedError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error

    @app.post("/api/approvals/{approval_id}/reject", tags=["approvals"])
    def reject(approval_id: str, request: Request) -> dict:
        try:
            return store(request).resolve_approval(approval_id, "rejected")
        except NotFoundError as error:
            raise HTTPException(status_code=404, detail=str(error)) from error
        except ApprovalResolvedError as error:
            raise HTTPException(status_code=409, detail=str(error)) from error

    @app.get("/api/audit", tags=["audit"])
    def audit(request: Request, limit: int = Query(default=100, ge=1, le=100)) -> dict:
        return {"events": store(request).list_audit(limit)}

    @app.get("/api", include_in_schema=False)
    def api_index() -> dict:
        return {"service": "Nexus Local Core", "docs": "/docs", "health": "/api/health"}

    dist = PROJECT_ROOT / "dist"
    if (dist / "index.html").exists():
        app.mount("/assets", StaticFiles(directory=dist / "assets"), name="assets")

        @app.get("/{full_path:path}", include_in_schema=False)
        def frontend(full_path: str) -> FileResponse:
            if full_path.startswith("api/"):
                raise HTTPException(status_code=404, detail="API endpoint not found.")
            candidate = (dist / full_path).resolve()
            if full_path and candidate.is_file() and candidate.is_relative_to(dist.resolve()):
                return FileResponse(candidate)
            return FileResponse(dist / "index.html")

    return app


app = create_app()
