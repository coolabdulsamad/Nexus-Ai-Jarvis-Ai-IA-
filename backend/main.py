from __future__ import annotations

import os
from contextlib import asynccontextmanager
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
from .store import ApprovalResolvedError, NotFoundError, Store, utc_now

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB_PATH = PROJECT_ROOT / "data" / "nexus.db"


class CommandRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


class SettingsUpdate(BaseModel):
    assistant_name: str | None = Field(default=None, min_length=1, max_length=40)
    voice_enabled: bool | None = None
    voice_rate: float | None = Field(default=None, ge=0.7, le=1.4)
    avatar_mode: Literal["globe", "humanoid"] | None = None


def create_app() -> FastAPI:
    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.store = Store(os.getenv("NEXUS_DB_PATH", DEFAULT_DB_PATH))
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
        return handle_command(payload.text, store(request))

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
        return store(request).update_settings(updates)

    @app.get("/api/notes", tags=["memory"])
    def notes(request: Request, limit: int = Query(default=100, ge=1, le=100)) -> dict:
        return {"notes": store(request).list_notes(limit)}

    @app.get("/api/approvals", tags=["approvals"])
    def approvals(
        request: Request,
        status: Literal["pending", "approved", "rejected"] | None = None,
        limit: int = Query(default=100, ge=1, le=100),
    ) -> dict:
        return {"approvals": store(request).list_approvals(status, limit)}

    @app.post("/api/approvals/{approval_id}/approve", tags=["approvals"])
    def approve(approval_id: str, request: Request) -> dict:
        try:
            return store(request).resolve_approval(approval_id, "approved", execute_approved_action)
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
            candidate = (dist / full_path).resolve()
            if full_path and candidate.is_file() and candidate.is_relative_to(dist.resolve()):
                return FileResponse(candidate)
            return FileResponse(dist / "index.html")

    return app


app = create_app()
