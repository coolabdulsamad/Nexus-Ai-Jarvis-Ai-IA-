# Nexus local assistant architecture

## Request path

1. The React console accepts typed text, a final push-to-talk transcript, or a command extracted from an explicitly enabled wake-word session.
2. All command inputs use `POST /api/commands/stream`; the non-streaming `POST /api/commands` remains as a compatibility API. Both enter the same orchestrator and approval policy.
3. The orchestrator first classifies the explicit action/status intents and constructs typed payloads. Known connector boundaries remain deterministic.
4. A message outside those intents becomes `assistant.chat`. The Ollama provider reuses a short-lived readiness cache, builds a bounded identity/history/approved-memory prompt and calls `POST /api/chat` with a thirty-minute `keep_alive`. The streaming route forwards generated text tokens as server-sent events, then emits one final result with measured first-token and total timings. It returns generated text only; it has no tool or action executor.
5. Read-only local status/time/list intents complete immediately. If Ollama is offline, disabled or missing the selected model, model chat returns an honest `unavailable`, `model_missing` or disabled response without affecting fixed commands.
6. Note creation, typed-memory creation, owned-device registration, browser navigation/search, Git status, camera preview and fixed app/folder launches create a pending approval and an audit event, regardless of whether the request was typed or spoken.
7. The user approves or rejects the exact action payload in the console.
8. Only approval executes the action in the same SQLite transaction as the decision. Camera approval creates an `approved` session only; browser camera access remains a separate step. Rejection performs no side effect, and a resolved approval cannot be executed again.
9. Connector outcomes preserve `completed`, `unavailable` or `failed` honestly; browser launch failure is not presented as success. Camera state becomes `active` only after the console obtains and plays a real browser video stream.
10. The original command row is updated with the final response and outcome, making it available to the persistent conversation timeline and bounded later model context.
11. When spoken responses are enabled, the browser speech synthesizer reads the result message. A stop control cancels playback immediately. Terminal output is displayed as text rather than spoken character by character.

## Components

- `src/`: React 19, TypeScript and the responsive console.
- `src/components/NexusGlobe.tsx`: deterministic particle world, atmospheric layers, graticules, network arcs, packets, satellites and interactive camera controls.
- `src/components/NexusHumanoid.tsx`: original particle humanoid with contoured face, separate jaw, neck/torso, blinking, head motion and speech/viseme-driven mouth movement.
- `src/components/SceneZoomControls.tsx`: shared accessible zoom-in, zoom-out and reset actions; each Three.js scene owns its camera.
- `src/lib/useVoice.ts`: one explicit voice state machine covering idle, push listening, wake listening, wake follow-up, processing, speaking and post-question follow-up listening. It owns guarded restarts, bounded timers, speech-time capture exclusion, duplicate-dispatch prevention, multiple wake phrases, bounded Nexus recognition aliases, spoken responses and interruption. No audio is stored by Nexus.
- `src/lib/conversation.ts`: typed follow-up metadata and deterministic folder-reply mapping. Model questions can open a bounded listening window but cannot create actions; folder replies return to the normal command parser.
- `src/components/SystemControl.tsx`: bounded directory search, exact-path launch requests, fixed application detection and explicit inactive screen status.
- `src/lib/camera.ts`: the only browser webcam request helper; it fixes video to the user-facing camera, sets `audio: false` and stops every track on cleanup.
- `src/pages/Home.tsx`: command console, tabbed notes/typed-memory/timeline views, local camera preview and lifecycle reporting, owned-device/home panels, approval decisions and browser-tab handoff.
- `backend/main.py`: FastAPI routes, validation, model-status endpoint and production static hosting.
- `backend/ollama.py`: local Ollama model detection, short-lived readiness caching, bounded non-streaming and NDJSON streaming inference, model keep-alive, Nexus identity prompt, bounded history/memory context and honest provider failures. It exposes no action or tool execution.
- `backend/commands.py`: explicit intent routing, model-chat fallback, typed-memory and owned-device parsing, URL construction, bounded folder-request resolution and connector boundaries.
- `backend/connectors.py`: approval-time payload revalidation, client-browser confirmation or local browser fallback, fixed-argument Git-status execution, and fixed local application/folder launches.
- `backend/system.py`: bounded local directory discovery, configured-root validation, fixed application detection, shell-free argument lists and explicit inactive screen status.
- `backend/store.py`: SQLite schema and transactional repository for commands, notes, typed memories, owned-device records, camera-session metadata, typed approvals, settings and audit events.
- `data/nexus.db`: local runtime data, excluded from Git.

## Local model contract

`GET /api/assistant/status` checks Ollama separately from the Nexus API. It reports `ready`, `model_missing`, `unavailable` or `disabled`, the selected model and a bounded installed-model list. A healthy FastAPI core therefore does not imply that an AI model is ready.

The default model is `qwen2.5:3b`; users can persist another Ollama model name in settings. The Ollama base URL and timeouts come from local environment configuration, not from model output or browser-supplied URLs. Status checks have a short timeout; chat has a bounded configurable timeout, generation limits, a two-megabyte streamed-response budget and bounded response text. The console displays tokens incrementally but speaks only the completed response so synthesis and recognition cannot overlap.

The system prompt supplies the configured assistant name and explicit truthfulness/action boundaries. Up to four recent completed exchanges and six approved memories are included with per-item limits. Memories and history are labelled untrusted data. No embedding retrieval, model training, fine-tuning, weight update or autonomous self-modification occurs.

Model output becomes only the `assistant.chat` response and timeline text. It cannot create an approval, invoke a connector, select a tool, run code or change settings. A user can still request a supported action through the deterministic command path and approve its exact payload separately.

## Persistent memory contract

`memory_records` stores a UUID, a constrained kind (`preference`, `application`, `file`, `device` or `fact`), content and creation/update timestamps. The only creation path is an approved `memory.create` request. The approval stores the exact kind and content; rejection inserts nothing. Listing supports an optional kind filter and a bounded limit.

The conversation timeline is derived from the existing `commands` table rather than a second, divergent history. It exposes the original input, classified intent, current status, latest response and creation time. Approval resolution updates that command row, so pending, completed and rejected outcomes remain consistent with the audit trail.

This is structured persistence with bounded recent-memory context for local model chat, not semantic long-term recall. Nexus does not yet infer memories, edit or delete records, embeddings-search content or install adaptive skills.

## Owned-device and home contract

`devices` stores a UUID, user-approved name, constrained platform (`android` or `iphone`), a `not_connected` state and creation timestamp. The only creation path is an approved `device.register` request. Rejection inserts nothing. The read API joins each record to static platform declarations so the UI can distinguish local registry support from unavailable companion-app capabilities.

Registration is not pairing, authentication or proof of ownership. No Android/iOS endpoint can lock, unlock, track or control a device in this slice. Future companion connectors must declare platform-specific operations rather than presenting Android and iPhone as equivalent.

Home status is read-only and reports `unavailable` while no authorised connector exists. AC commands follow the same honest unavailable path and create no approval because there is no connector to execute. A future home connector must add exact device identifiers, supported operations, credential handling outside Git, approval-time revalidation and outcome verification before any real control is enabled.

## Local camera contract

`camera_sessions` stores a UUID, the unique originating approval ID, one constrained lifecycle state and creation/update timestamps. It stores no device identifier, image, video, audio, observation or frame payload. Rejection creates no session. Approval inserts `approved`, never `active`.

After approval, the React console calls `navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false })`. The browser presents its own permission prompt. The console attaches a successful stream directly to a muted local `<video>` element, waits for playback and then posts `started`; only this path displays the preview as active. Denial or startup failure stops any acquired tracks and reports `unavailable`.

Stop invalidates any pending browser request, stops every track, clears `srcObject` and reports `stopped`. A late stream from a cancelled request is stopped immediately without being attached. Browser-track termination and page/component cleanup also stop local media; page exit uses a best-effort keepalive stopped report. A request-generation counter prevents stale asynchronous results from reactivating a cancelled preview.

`GET /api/camera/sessions` returns bounded metadata history. `POST /api/camera/sessions/{id}/events` accepts only `started`, `unavailable` and `stopped`; allowed transitions are `approved → active`, `approved/active → unavailable`, and `approved/active/unavailable → stopped`. Invalid or repeated transitions return HTTP 409. These records are browser-reported lifecycle state, not independent hardware attestation.

There is no backend webcam connector, frame-upload route, snapshot operation, recording or remote camera access. Future IP/CCTV and ESP32-CAM connectors need separate authentication, exact-source selection, consent, retention and observation-storage designs.

## Voice and avatar contract

Microphone recognition starts only after the user presses Speak or explicitly enables the wake session. Push-to-talk is one bounded interaction. The opt-in wake session uses the browser's continuous recognition mode while the console is open, displays an authoritative lifecycle state and provides a Stop control; activation is never restored automatically after a reload.

Up to eight comma-separated phrases are supported. Matching occurs only at the beginning, optionally after `hey`, `ok` or `okay`; an independently configured `hey` phrase also works alone. `Nexus` has explicit recognition aliases including `nextus`, `nexis`, `next to` and close variants, plus a one-edit bounded match for sufficiently long custom single words. There is no unrestricted fuzzy activation. `en-NG`, `en-US` and `en-GB` recognition locales are selectable, subject to browser/vendor support.

A phrase followed by a command enters the normal path immediately. The phrase alone arms one command for ten seconds. A deterministic folder clarification or completed model answer ending in a question can request one twelve-second post-speech reply window while the wake session remains enabled. Recognition is aborted before processing and speech, and restarts only from the synthesis end/error callback or the no-speech path. A speech-generation guard prevents cancelled utterance callbacks from opening the microphone. Every recognition instance has a one-dispatch guard. Follow-up timeout, Stop speaking and Stop voice session all return to a defined state without submitting audio.

For folder clarification, typed `follow_up` metadata retains only the fixed application and currently returned bounded directory choices. A reply can select an exact path, unique name, number or ordinal, or become a new folder query. Cancellation opens nothing. The resulting text re-enters deterministic directory resolution and must produce a fresh exact-path approval before launch.

A final transcript is treated exactly like typed input. Browser speech recognition recognises words, not the speaker's identity, and may use a browser/vendor network service. Speech boundary events select a viseme, while the avatar render loop produces visible mouth and jaw movement for the active utterance. Cancelling synthesis returns the avatar to its resting mouth position.

Both visual models are generated locally from deterministic particles and require no downloaded model or external avatar service. OrbitControls supplies damped drag rotation and scroll/pinch zoom with bounded camera distances. Reduced-motion preferences disable autonomous scene rotation/movement while keeping direct interaction available. A static SVG fallback is shown if WebGL cannot initialise.

Fully offline recognition/synthesis, a persistent background/offline wake engine and speaker profiles require separately selected local models and consent controls. They are not represented as active. The second-monitor humanoid experience remains later work.

## Local applications, folders and screen contract

Directory discovery defaults to the user's home directory. `NEXUS_SYSTEM_ROOTS` can explicitly configure up to eight roots using the operating system's path-list separator. Discovery is breadth-first and bounded to 600 scanned entries, depth two and 30 returned results. It skips hidden directories, does not follow symlinks and reads no file contents.

Folder requests are resolved before an approval is created. Missing or ambiguous names return available exact-name choices without creating a launch approval. An exact match creates `system.open_folder` with the resolved absolute path and selected application. Explicit paths must remain inside a configured root and may not traverse hidden directories.

The application catalog is fixed to VS Code (`code`, `code-insiders` or `codium`) and the platform file manager. VS Code receives only `--new-window` and the stored absolute directory. File-manager and application-only launches likewise use connector-defined executables and argument patterns with `shell=False`. The stored payload and resolved directory are revalidated during the single-use approval transaction; a missing executable or launch failure is reported honestly.

`GET /api/system/status` reports application installation and screen state. Screen capture remains `not_configured`, with no active capture, visible monitor inventory, visual understanding, activity inference or clicking. `GET /api/system/directories` performs only the bounded discovery described above. Future screen connectors need visible capture consent, exact monitor/window scope, retention limits, target confirmation and separate approval for every click or input action.

## Browser and terminal contract

Browser commands accept only validated HTTP/HTTPS destinations, reject embedded credentials, and create `browser.navigate` or `browser.search` approvals containing the exact URL.

For the normal console flow:

1. The Approve click synchronously reserves an `about:blank` tab and clears its opener.
2. If the browser blocks that tab, no approval request is sent; the stored approval remains pending and the UI explains how to retry.
3. If reservation succeeds, the console sends the approval with `client_browser=true`.
4. The backend revalidates the stored URL and resolves the single-use approval. No host browser process is launched in this mode.
5. Only after a completed result does the console navigate the reserved tab to the exact approved URL. Failure closes the blank tab.

Direct API callers that omit the client flag retain a backend-local browser fallback. Neither mode retrieves page content, clicks targets, submits forms or authorises follow-on browsing in this phase.

The only terminal intent is `terminal.git_status`. Its executable, argument list, working directory and timeout are defined by the connector, not by the request or approval payload. It runs `git status --short --branch` without a shell in the Nexus project root, captures bounded output and makes no repository changes.

## Production shape

The Dockerfile builds the frontend and serves it through FastAPI on port 3000. A Docker volume mounted at `/data` preserves the database. Development keeps Vite on port 3000 and proxies `/api` to FastAPI on port 8000. Ollama is deliberately not bundled into the image; Docker users must explicitly set a reachable `NEXUS_OLLAMA_BASE_URL` for their host/network. Browser microphone and camera access work on localhost or another secure context; remote or LAN access would require a separate TLS and authentication design.

## Next connector contract

Every future connector must expose a typed action, risk tier, required parameters and approval policy. Mobile, home, IP/CCTV, ESP32-CAM and sensor connectors must return honest `unavailable` responses until configured. Model output, transcripts, web content, camera frames and retrieved documentation are data, never permission to execute code or alter policy.
