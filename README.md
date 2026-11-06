# Nexus — Local Intelligence

Nexus is a local-first personal AI assistant foundation. This first working phase provides a real command path, persistent notes, explicit approval/rejection, audit history and an interactive yellow globe. It does **not** pretend that voice, Chrome, AC, mobile or camera connectors are already active.

## Quick start on Ubuntu 24.04

Prerequisites: Python 3.12+, Node.js 22+, npm and Git. If Python virtual environments are unavailable, install `python3.12-venv` with your system package manager.

```bash
git clone https://github.com/coolabdulsamad/Nexus-Ai-Jarvis-Ai-IA-.git
cd Nexus-Ai-Jarvis-Ai-IA-
bash scripts/setup.sh
bash scripts/dev.sh
```

Open **http://localhost:3000**. The API is at **http://127.0.0.1:8000**, with interactive documentation at **http://127.0.0.1:8000/docs**. Stop both services with `Ctrl+C`.

The setup script creates `.venv`, installs Python and npm dependencies, and prepares `data/`. Nexus creates `data/nexus.db` automatically. No account, cloud database, API key or router port forwarding is required.

## Try the complete permission flow

1. Send `What time is it?` — a read-only answer completes immediately.
2. Send `Take a note: review the camera connector plan` — no note is saved yet.
3. Find the exact request in **Approval queue** and choose **Approve**.
4. Confirm the note appears under **Local notes** and the decisions appear in **Audit trail**.
5. Repeat with another note and choose **Reject** — the note is not created.
6. Send `Open Chrome and search Google` or `Turn on the AC` — Nexus clearly reports that the connector is not configured and takes no action.

## Update after later phases are pushed

```bash
cd Nexus-Ai-Jarvis-Ai-IA-
git pull origin main
.venv/bin/python -m pip install -r requirements-dev.txt
npm install
bash scripts/dev.sh
```

Your local `data/nexus.db` is excluded from Git and remains on your machine.

## Tests and checks

```bash
bash scripts/test.sh
```

This runs API integration tests, TypeScript checks, frontend unit tests, ESLint and a production build.

## Windows 11 development

Ubuntu remains the primary Nexus brain. For a Windows development session, install Python 3.12 and Node.js 22, then run:

```powershell
git clone https://github.com/coolabdulsamad/Nexus-Ai-Jarvis-Ai-IA-.git
cd Nexus-Ai-Jarvis-Ai-IA-
py -3.12 -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements-dev.txt
npm install
.\.venv\Scripts\python -m uvicorn backend.main:app --reload --port 8000
```

In a second PowerShell window, from the same project directory:

```powershell
npm run dev
```

## Docker

```bash
docker build -t nexus-local .
docker run --rm -p 8000:3000 -v nexus-data:/data nexus-local
```

Open **http://localhost:8000**. The named volume preserves notes and audit history.

## Project map

- `backend/` — FastAPI application, command orchestrator, SQLite repository and tests.
- `src/` — React console, Three.js globe, typed API client and styles.
- `scripts/` — setup, development and verification commands.
- `docs/` — architecture, security boundaries and delivery roadmap.
- `Dockerfile` — self-contained production build with persistent `/data` volume.

## Current boundaries

This phase intentionally contains no arbitrary terminal execution, autonomous web-derived code, hidden recording, remote tracking or platform-security bypass. Future consequential actions use the same request → validation → policy → approval → scoped skill → audit path. See `docs/SECURITY.md` and `docs/ROADMAP.md`.
