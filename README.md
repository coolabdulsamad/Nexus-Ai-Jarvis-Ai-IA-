# Nexus — Local Intelligence

Nexus is a local-first personal AI assistant with **real free-form conversation through a configured local Ollama model**, plus a separate validated command path, persistent notes and typed memories, a command/response timeline, an approval-gated Android/iPhone owned-device registry, explicit approval/rejection, audit history, push-to-talk and opt-in wake-word browser sessions, approval-gated browser navigation/search, bounded local folder discovery, approval-gated VS Code/file-manager launching, one fixed read-only Git-status action, an approval-gated video-only local webcam preview, and switchable interactive yellow particle globe and speech-reactive humanoid modes.

Ollama supplies model **inference**, not automatic training or self-modification. Nexus does **not** pretend that a model is available when Ollama is offline, that arbitrary terminal commands, exact-target browser clicking, adaptive skill installation, AC, mobile control, IP/CCTV or ESP32-CAM connectors are already active.

## Quick start on Ubuntu 24.04

Prerequisites: Python 3.12+, Node.js 22+, npm, Git and—**for real AI conversation**—Ollama. If Python virtual environments are unavailable, install `python3.12-venv` with your system package manager.

```bash
git clone https://github.com/coolabdulsamad/Nexus-Ai-Jarvis-Ai-IA-.git
cd Nexus-Ai-Jarvis-Ai-IA-
bash scripts/setup.sh
bash scripts/dev.sh
```

Open **http://localhost:3000**. The API is at **http://127.0.0.1:8000**, with interactive documentation at **http://127.0.0.1:8000/docs**. Stop both services with `Ctrl+C`.

The setup script creates `.venv`, installs Python and npm dependencies, and prepares `data/`. Nexus creates `data/nexus.db` automatically. No account, cloud database, API key or router port forwarding is required for local inference.

## Connect the real local AI brain

Nexus now calls Ollama's native `GET /api/tags` and `POST /api/chat` APIs. Fixed commands continue to work without a model, but open-ended conversation honestly reports `unavailable` until Ollama and the selected model are ready.

On Ubuntu/Linux, install Ollama and pull the default model:

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen2.5:3b
```

For macOS or Windows, install Ollama from **https://ollama.com/download**, open it, then run the same `ollama pull qwen2.5:3b` command. On Linux, if the service is not already running, use:

```bash
ollama serve
```

Keep that service running and start Nexus in another terminal with `bash scripts/dev.sh`. The console's model card must say **AI MODEL READY** before free-form chat is available. The first response can take longer while the model loads.

Try:

```text
Who are you?
Explain quantum computing in simple terms.
What can you help me plan today?
```

The model receives the assistant name saved in **Assistant & model**, up to four recent conversation exchanges and up to six explicitly approved typed memories. These inputs are bounded and marked as untrusted reference data. This is conversational context, not semantic memory search or training. Select another installed model or disable free-form chat in **Assistant & model**; the setting persists locally.

Phase 08 reuses a recent successful readiness check for 20 seconds, keeps the model warm in Ollama for ten minutes, reduces default generation/context limits, asks for concise ordinary answers, and updates the visible result before refreshing the rest of the dashboard in the background. Model speed still depends on your model, hardware, prompt and current load; the first response after an idle period can take longer.

Optional environment configuration belongs in `.env` (never commit it):

```bash
NEXUS_OLLAMA_BASE_URL=http://127.0.0.1:11434
NEXUS_OLLAMA_STATUS_TIMEOUT=3
NEXUS_OLLAMA_TIMEOUT=120
```

No cloud model provider is connected in this phase. A future cloud route must be explicitly configured and must not be described as local or private.

## Try the complete permission flow

1. Send `What time is it?` — a read-only answer completes immediately.
2. Send `Take a note: review the camera connector plan` — no note is saved yet.
3. Find the exact request in **Approval queue** and choose **Approve**.
4. Confirm the note appears under **Memory → Notes** and the decisions appear in **Audit trail**.
5. Send `Remember preference: I prefer concise answers` — review and approve the typed memory request. It appears under **Memory → Typed memory**.
6. Repeat with `Remember device: my office laptop` and choose **Reject** — no memory is created, and the rejected outcome appears under **Memory → Timeline**.
7. Send `Show memory` or `Show timeline` to switch to the corresponding console view.
8. Send `Search Google for local AI safety` — review the exact Google URL in **Approval queue**. Nothing opens until you approve; rejection launches nothing.
9. Choose **Approve** on a browser request. Nexus reserves a new tab on the device displaying the console, then opens only the exact approved URL after the backend confirms the decision. Allow pop-ups for Nexus if your browser asks; a blocked tab leaves the approval pending.
10. Send `Show Git status` — review the fixed `git status --short --branch` action. Approval runs it once in the project root and displays its output. It cannot accept arbitrary shell text or change repository files.
11. Send `Turn on the AC` — Nexus clearly reports that the home connector is not configured and takes no action.
12. Open **Devices & home**, choose Android, enter a device name and select **Request registration**. No device appears before approval.
13. Approve the exact request. The device appears as **Not connected**, with platform capabilities and limitations. This is a local registry entry, not pairing or remote control.
14. Repeat with iPhone and choose **Reject** — no device is created. Both platforms remain subject to their operating-system restrictions.
15. Select **Check connector** or **Test AC boundary** under **Home & AC**. Both honestly report that no integration is configured and no home device was contacted or changed.
16. Open **Camera & vision** and select **Request camera preview**. The approval card shows video on, microphone off, recording off and no frame storage. No camera request has happened yet.
17. Choose **Reject** to confirm that no session or camera access is created. Repeat the request and choose **Approve**; Nexus creates an `approved` session, but video is still not active.
18. Respond to the browser's separate camera prompt. Denial marks the session `unavailable`; allowing it starts the local preview and marks it `active` only after a real video stream is available.
19. Choose **Stop camera**. Nexus immediately releases every media track, clears the preview and records `stopped`. Leaving or reloading the page also releases the stream and makes a best-effort stopped report.
20. Send `Camera status` for a read-only summary. Session history contains metadata and timestamps only—never images, video or audio.
21. Open **System control**, search for a real folder such as `Documents`, then choose **VS Code**. Confirm that the approval contains the exact resolved path. Rejection opens nothing; approval revalidates the directory and uses a fixed executable/argument list.
22. Send `Open VS Code` or `Open File Manager`. These are fixed catalog actions, not arbitrary executable names. An unavailable application is reported honestly.
23. Configure a wake word in **Assistant & model**, then choose **Enable “Nexus”** in the main console. Say `Nexus, what time is it?`, or say `Nexus` alone followed by one command within eight seconds. Choose **Stop wake word** to end the microphone session.

## Camera preview and consent boundary

- The browser calls `getUserMedia` with `{ video: { facingMode: 'user' }, audio: false }` only after the exact `camera.preview` approval. Camera access requires a secure browser context such as localhost or HTTPS.
- Nexus approval and browser permission are deliberately separate. Approval creates an `approved` session; only the browser's successful stream starts the preview and produces an `active` report.
- Denial or startup failure produces `unavailable`. Stop, an ended browser track and page cleanup release local media tracks; the supported session states are `approved`, `active`, `unavailable` and `stopped`.
- `GET /api/camera/sessions` lists bounded session metadata. `POST /api/camera/sessions/{id}/events` accepts only `started`, `unavailable` or `stopped`, enforces valid transitions and writes audit events. These are browser-reported lifecycle records, not proof from camera hardware.
- No camera-frame API, recording, snapshots, uploads, image storage or microphone capture is included. IP/CCTV, ESP32-CAM, camera observations and retention controls remain separate later work.

## Persistent memory and timeline

- Notes and typed memories are separate local records. Typed memory supports `preference`, `application`, `file`, `device` and `fact` categories.
- Use the command form `Remember <category>: <content>`. Every new typed memory requires explicit approval.
- **Memory → Timeline** shows recent commands, intents, outcomes and response messages, including pending, completed and rejected requests.
- `GET /api/memories` supports optional `kind` and bounded `limit` filters. `GET /api/conversations` returns the bounded recent timeline.
- All records remain in the local SQLite database across service restarts. This phase creates and lists memories; editing, deletion, retention policies and semantic retrieval are separate later work.

## Owned devices and home boundary

- Register an owned device with `Register Android device: My phone` or `Register iPhone device: My iPhone`. The console form creates the same approval-gated command.
- Registration stores only the approved name, platform, `not_connected` state and timestamp in local SQLite. It does not prove ownership, pair a companion app, unlock a device or enable remote access.
- `GET /api/devices` lists registered devices with explicit platform capabilities and limitations. `Show devices` is the read-only command equivalent.
- `Home status` reports the current connector boundary. No Home Assistant, Matter or vendor integration is configured in this slice, so AC state remains unknown and control requests return unavailable.
- Real companion pairing, remote actions and home control require separately configured authorised connectors and their own approval tests. Android and iPhone are not assumed to offer equivalent control.

## Browser and scoped terminal actions

- Browser requests accept HTTP/HTTPS destinations and Google searches. The console reserves a blank tab synchronously when you choose Approve, sends the approval with `client_browser=true`, and assigns the exact validated URL only after approval succeeds.
- If pop-ups are blocked, Nexus does not resolve the approval or claim success. Allow pop-ups for the local Nexus console and approve the still-pending request again.
- Browser approval covers one exact destination only. It does not authorise subsequent clicks, form submission, downloads or autonomous browsing.
- Direct API approvals that omit `client_browser=true` retain the backend-local browser fallback for advanced/local integrations; the normal console always uses the client-device handoff.
- Terminal support is deliberately limited to `git status --short --branch`. It uses a fixed argument list, no shell, a six-second timeout, captured output and the Nexus project root as its working directory.
- Browser, terminal, note and typed-memory requests use the same approval, rejection and audit path. Typed and spoken commands receive no special privileges.

## Local apps, folders and screen boundary

- `GET /api/system/directories` searches directory metadata under `NEXUS_SYSTEM_ROOTS`, defaulting to your home directory. It scans at most 600 entries, two directory levels deep, returns at most 30 results, skips hidden directories and symlinks, and never reads file contents.
- Folder commands resolve an exact directory before creating an approval. Ambiguous names return choices; missing, hidden or outside-root paths create no launch approval. Explicit absolute paths must still be inside a configured root.
- The application catalog contains only VS Code and the platform file manager. `system.open_application` and `system.open_folder` approvals are revalidated and executed with fixed argument lists and `shell=False`. The payload cannot select an arbitrary executable or shell string.
- `GET /api/system/status` reports roots, application detection and discovery limits. Screen capture, monitor inventory, visual screen understanding and clicking remain `not_configured`; the console never simulates them.
- VS Code must be available as `code`, `code-insiders` or `codium` on the API host's PATH. In VS Code, its shell-command installer may be needed. On WSL, launches occur in the WSL/Windows integration environment available to those executables.

Example root configuration in `.env`:

```bash
# Linux/macOS
NEXUS_SYSTEM_ROOTS=/home/you:/mnt/projects
# Windows uses semicolons: C:\Users\you;D:\Projects
```

## Voice and humanoid mode

1. Use **Globe / Humanoid** above the visual assistant to switch modes. The choice is saved locally. Drag either model to rotate it; scroll/pinch or use the dedicated buttons to zoom, and use the reset button to restore the camera.
2. Open **Assistant & model** to change the assistant name, select the Ollama model, enable spoken responses, adjust speech rate and preview the voice.
3. Choose **Speak to Nexus** and allow the browser's microphone prompt. Speak one command; its final transcript enters the same command path as typed text.
4. Choose **Stop listening** to cancel capture or **Stop speaking** to interrupt a reply. The humanoid mouth animates during speech.
5. Set the wake-word phrase in **Assistant & model**, then explicitly enable it from the main console. A continuous browser recognition session listens for the phrase at the start of speech. The name alone arms one follow-up for eight seconds; a name plus command submits immediately. Wake capture pauses while a command is processed or spoken, restarts with visible state, and never reactivates automatically after a page reload.

This voice slice uses the browser Web Speech API. Chrome or Edge on localhost is recommended. Speech-recognition support varies, and some browsers use a network speech service; Nexus does not claim fully offline recognition or a separate local wake-word engine. Browser speech recognition identifies words, not the speaker, and voice identity never authorises sensitive actions. Nexus does not store microphone audio; recognized command text and responses remain in the local timeline. Text remains available as a fallback.

The setup script installs frontend packages through npm 12.2.2 to avoid an npm 10.9.9 peer-resolution failure. It does not change your global npm installation.

## Update after later phases are pushed

```bash
cd Nexus-Ai-Jarvis-Ai-IA-
git pull origin main
.venv/bin/python -m pip install -r requirements-dev.txt
npx --yes npm@12.2.2 install
bash scripts/dev.sh
```

Your local `data/nexus.db` is excluded from Git and remains on your machine. Phases 04–08 add their tables/settings automatically without deleting existing notes, memories, devices, settings or audit history. Phase 08 adds only a default wake-word setting; it never enables the microphone on upgrade. Ollama manages model downloads separately, and no model weights are committed to Git.

## Tests and checks

```bash
bash scripts/test.sh
```

This runs API integration tests, TypeScript checks, frontend unit tests, ESLint and a production build. Ollama tests use a mocked provider, so the suite does not need to download a model or expose a real service.

For an optional physical Ollama smoke test after installation:

```bash
ollama list
curl http://127.0.0.1:11434/api/tags
curl http://127.0.0.1:8000/api/assistant/status
```

The last command must report `"state":"ready"`; then ask `Who are you?` in the Nexus console and confirm the result is labelled `OLLAMA INFERENCE`.

## Windows 11 development

Ubuntu remains the primary Nexus brain. For a Windows development session, install Python 3.12 and Node.js 22, then run:

```powershell
git clone https://github.com/coolabdulsamad/Nexus-Ai-Jarvis-Ai-IA-.git
cd Nexus-Ai-Jarvis-Ai-IA-
py -3.12 -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements-dev.txt
npx --yes npm@12.2.2 install
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

Open **http://localhost:8000**. The named volume preserves notes, typed memories, conversations, owned-device records, camera-session metadata, settings and audit history. Camera access still requires approval and browser permission in each new browser session.

## Project map

- `backend/` — FastAPI application, Ollama inference client, command/model orchestrator, bounded system/app connectors, scoped browser/Git connectors, SQLite repository and tests.
- `src/` — React console, wake/push-to-talk voice lifecycle, system-control panel, interactive Three.js particle globe/humanoid, memory/timeline views, video-only camera preview, owned-device/home panels, typed API client and styles.
- `scripts/` — setup, development and verification commands.
- `docs/` — architecture, security boundaries and delivery roadmap.
- `Dockerfile` — self-contained production build with persistent `/data` volume.

## Current boundaries

This phase intentionally contains no model training/fine-tuning, autonomous self-modification, persistent background/offline wake-word engine, speaker authentication, screen capture or monitor understanding, exact-target clicking, arbitrary terminal execution, autonomous web-derived code, adaptive skill installation, phone pairing/control/tracking, configured home/AC control, IP/CCTV or ESP32-CAM ingestion, camera recording/storage, hidden capture or platform-security bypass. Future consequential actions use the same request → validation → policy → approval → scoped skill → audit path. See `docs/SECURITY.md` and `docs/ROADMAP.md`.
