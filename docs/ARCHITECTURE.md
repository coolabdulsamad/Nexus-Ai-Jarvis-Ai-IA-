# Nexus foundation architecture

## Request path

1. The React console sends text to `POST /api/commands`.
2. The command orchestrator classifies a small, explicit set of intents.
3. Read-only intents complete immediately. Unknown or unconfigured intents perform no action.
4. A note-write intent creates a pending approval and an audit event.
5. The user approves or rejects the exact payload in the console.
6. Only approval executes `note.create` in the same SQLite transaction as the decision.
7. Notes, commands, approvals and outcomes remain available after restart.

## Components

- `src/`: React 19, TypeScript, Three.js globe and installable PWA.
- `backend/main.py`: FastAPI routes, validation and production static hosting.
- `backend/commands.py`: explicit first-phase intent routing and connector boundaries.
- `backend/store.py`: SQLite schema and transactional repository.
- `data/nexus.db`: local runtime data, excluded from Git.

## Production shape

The Dockerfile builds the frontend and serves it through FastAPI on port 3000. A Docker volume mounted at `/data` preserves the database. Development keeps Vite on port 3000 and proxies `/api` to FastAPI on port 8000.

## Next connector contract

Every future connector must expose a typed action, risk tier, required parameters and approval policy. Browser, mobile, home, camera and terminal connectors must return honest `unavailable` responses until configured. Model output and retrieved documentation are data, never permission to execute code.
