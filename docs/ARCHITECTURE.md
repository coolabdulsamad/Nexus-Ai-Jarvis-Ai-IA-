# Nexus foundation architecture

## Request path

1. The React console accepts typed text or a final browser speech-recognition transcript.
2. Both inputs send the same request to `POST /api/commands`.
3. The command orchestrator classifies a small, explicit set of intents.
4. Read-only intents complete immediately. Unknown or unconfigured intents perform no action.
5. A note-write intent creates a pending approval and an audit event, regardless of whether it was typed or spoken.
6. The user approves or rejects the exact payload in the console.
7. Only approval executes `note.create` in the same SQLite transaction as the decision.
8. When spoken responses are enabled, the browser speech synthesizer reads the result. A stop control cancels playback immediately.

## Components

- `src/`: React 19, TypeScript and the responsive console.
- `src/components/NexusGlobe.tsx`: interactive Three.js yellow globe.
- `src/components/NexusHumanoid.tsx`: original Three.js humanoid with deterministic idle motion, blinking and speech/viseme-driven mouth shapes.
- `src/lib/useVoice.ts`: explicit microphone sessions, browser speech recognition, spoken responses and interruption. No audio is stored by Nexus.
- `backend/main.py`: FastAPI routes, validation and production static hosting.
- `backend/commands.py`: explicit intent routing and connector boundaries.
- `backend/store.py`: SQLite schema and transactional repository for commands, notes, approvals, settings and audit events.
- `data/nexus.db`: local runtime data, excluded from Git.

## Voice and avatar contract

Microphone capture starts only after the user presses the Speak control. Recognition runs as one bounded interaction rather than an always-on wake-word listener. Interim text is displayed locally; a final transcript enters the normal command path. Speech boundary events select a viseme, while the avatar render loop produces visible mouth movement for the active utterance. Cancelling synthesis returns the avatar to its resting mouth position.

The current humanoid is a lightweight stylized assistant face rendered in the existing console. It does not require a downloaded model, external avatar service or second monitor. Fully offline recognition/synthesis and wake-word support require separately selected local models and are not represented as active.

## Production shape

The Dockerfile builds the frontend and serves it through FastAPI on port 3000. A Docker volume mounted at `/data` preserves the database. Development keeps Vite on port 3000 and proxies `/api` to FastAPI on port 8000. Browser microphone access works on localhost; remote or LAN access would require a separate secure-context and authentication design.

## Next connector contract

Every future connector must expose a typed action, risk tier, required parameters and approval policy. Browser, mobile, home, camera and terminal connectors must return honest `unavailable` responses until configured. Model output, transcripts and retrieved documentation are data, never permission to execute code.
