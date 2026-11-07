# Nexus — Local Intelligence

Nexus is a local-first personal AI assistant foundation. It provides a real command path, persistent notes and typed memories, a command/response timeline, an approval-gated Android/iPhone owned-device registry, explicit approval/rejection, audit history, browser voice interaction, approval-gated browser navigation/search, one fixed read-only Git-status action, and switchable interactive yellow particle globe and speech-reactive humanoid modes. It does **not** pretend that arbitrary terminal commands, exact-target browser clicking, adaptive skill installation, AC, mobile or camera connectors are already active.

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

## Voice and humanoid mode

1. Use **Globe / Humanoid** above the visual assistant to switch modes. The choice is saved locally. Drag either model to rotate it; scroll/pinch or use the dedicated buttons to zoom, and use the reset button to restore the camera.
2. Open **Voice & core** to change the assistant name, enable spoken responses, adjust speech rate and preview the voice.
3. Choose **Speak to Nexus** and allow the browser's microphone prompt. Speak one command; its final transcript enters the same command path as typed text.
4. Choose **Stop listening** to cancel capture or **Stop speaking** to interrupt a reply. The humanoid mouth animates during speech.

This voice slice uses the browser Web Speech API. Chrome or Edge on localhost is recommended. Speech-recognition support varies, and some browsers use a network speech service; Nexus does not claim fully offline recognition in this phase. No always-on wake word is active, and Nexus does not store microphone audio. Text remains available as a fallback.

The setup script installs frontend packages through npm 12.2.2 to avoid an npm 10.9.9 peer-resolution failure. It does not change your global npm installation.

## Update after later phases are pushed

```bash
cd Nexus-Ai-Jarvis-Ai-IA-
git pull origin main
.venv/bin/python -m pip install -r requirements-dev.txt
npx --yes npm@12.2.2 install
bash scripts/dev.sh
```

Your local `data/nexus.db` is excluded from Git and remains on your machine. Phases 04 and 05 add their tables automatically without deleting existing notes, memories, settings or audit history.

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

Open **http://localhost:8000**. The named volume preserves notes, typed memories, conversations, owned-device records, settings and audit history.

## Project map

- `backend/` — FastAPI application, command orchestrator, scoped browser/Git connectors, SQLite repository and tests.
- `src/` — React console, interactive Three.js particle globe/humanoid, memory/timeline views, owned-device/home panels, typed API client and styles.
- `scripts/` — setup, development and verification commands.
- `docs/` — architecture, security boundaries and delivery roadmap.
- `Dockerfile` — self-contained production build with persistent `/data` volume.

## Current boundaries

This phase intentionally contains no arbitrary terminal execution, autonomous web-derived code, adaptive skill installation, phone pairing/control, configured home/AC control, hidden recording, remote tracking or platform-security bypass. Future consequential actions use the same request → validation → policy → approval → scoped skill → audit path. See `docs/SECURITY.md` and `docs/ROADMAP.md`.
