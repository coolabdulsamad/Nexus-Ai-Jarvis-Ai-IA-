# Nexus foundation architecture

## Request path

1. The React console accepts typed text or a final browser speech-recognition transcript.
2. Both inputs send the same request to `POST /api/commands`.
3. The command orchestrator classifies a small, explicit set of intents and constructs typed payloads.
4. Read-only local status/time intents complete immediately. Unknown or unconfigured intents perform no action.
5. Note creation, browser navigation/search and Git status create a pending approval and an audit event, regardless of whether the request was typed or spoken.
6. The user approves or rejects the exact action payload in the console.
7. Only approval executes the action in the same SQLite transaction as the decision. Rejection performs no side effect, and a resolved approval cannot be executed again.
8. Connector outcomes preserve `completed`, `unavailable` or `failed` honestly; browser launch failure is not presented as success.
9. When spoken responses are enabled, the browser speech synthesizer reads the result message. A stop control cancels playback immediately. Terminal output is displayed as text rather than spoken character by character.

## Components

- `src/`: React 19, TypeScript and the responsive console.
- `src/components/NexusGlobe.tsx`: deterministic particle world, atmospheric layers, graticules, network arcs, packets, satellites and interactive camera controls.
- `src/components/NexusHumanoid.tsx`: original particle humanoid with contoured face, separate jaw, neck/torso, blinking, head motion and speech/viseme-driven mouth movement.
- `src/components/SceneZoomControls.tsx`: shared accessible zoom-in, zoom-out and reset actions; each Three.js scene owns its camera.
- `src/lib/useVoice.ts`: explicit microphone sessions, browser speech recognition, spoken responses and interruption. No audio is stored by Nexus.
- `backend/main.py`: FastAPI routes, validation and production static hosting.
- `backend/commands.py`: explicit intent routing, URL construction and connector boundaries.
- `backend/connectors.py`: approval-time URL revalidation, local browser launch and fixed-argument Git-status execution.
- `backend/store.py`: SQLite schema and transactional repository for commands, notes, typed approvals, settings and audit events.
- `data/nexus.db`: local runtime data, excluded from Git.

## Voice and avatar contract

Microphone capture starts only after the user presses the Speak control. Recognition runs as one bounded interaction rather than an always-on wake-word listener. Interim text is displayed locally; a final transcript enters the normal command path. Speech boundary events select a viseme, while the avatar render loop produces visible mouth and jaw movement for the active utterance. Cancelling synthesis returns the avatar to its resting mouth position.

Both visual models are generated locally from deterministic particles and require no downloaded model or external avatar service. OrbitControls supplies damped drag rotation and scroll/pinch zoom with bounded camera distances. Reduced-motion preferences disable autonomous scene rotation/movement while keeping direct interaction available. A static SVG fallback is shown if WebGL cannot initialise.

Fully offline recognition/synthesis and wake-word support require separately selected local models and are not represented as active. The second-monitor humanoid experience remains later work.

## Browser and terminal contract

Browser commands accept only validated HTTP/HTTPS destinations, reject embedded credentials, and create `browser.navigate` or `browser.search` approvals containing the exact URL. Approval opens that URL once using Chrome/Chromium when found or the default browser otherwise. Nexus does not retrieve page content, click targets, submit forms or authorise follow-on browsing in this phase.

The only terminal intent is `terminal.git_status`. Its executable, argument list, working directory and timeout are defined by the connector, not by the request or approval payload. It runs `git status --short --branch` without a shell in the Nexus project root, captures bounded output and makes no repository changes.

## Production shape

The Dockerfile builds the frontend and serves it through FastAPI on port 3000. A Docker volume mounted at `/data` preserves the database. Development keeps Vite on port 3000 and proxies `/api` to FastAPI on port 8000. Browser microphone access works on localhost; remote or LAN access would require a separate secure-context and authentication design.

## Next connector contract

Every future connector must expose a typed action, risk tier, required parameters and approval policy. Mobile, home and camera connectors must return honest `unavailable` responses until configured. Model output, transcripts, web content and retrieved documentation are data, never permission to execute code or alter policy.
