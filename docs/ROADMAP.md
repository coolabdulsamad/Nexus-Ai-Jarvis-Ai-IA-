# Delivery roadmap

## Phase 01 — foundation (delivered)

- Local FastAPI core and SQLite persistence.
- React console with interactive yellow globe and PWA manifest.
- Text commands, notes, approvals, rejection and audit history.
- Automated tests, development scripts and Docker configuration.

## Phase 02 — voice interaction (delivered)

- Explicit push-to-talk microphone input using the browser Web Speech API.
- Spoken command results, speech-rate control and immediate interruption.
- Persistent assistant name, voice preference and visual-mode settings.
- Switchable globe and original humanoid face with blinking, head movement and speech-driven mouth shapes.
- Voice commands use the existing validation, approval and audit path.

This is the browser voice slice, not a claim of fully offline speech. Wake-word detection and locally hosted speech-to-text/text-to-speech models remain voice-hardening work. Browser recognition availability and network behaviour depend on the browser and operating system.

## Phase 03 — visual world and scoped connectors (delivered)

- Rebuilt the globe as a dense procedural particle world with terrain-like fields, graticules, lifted network arcs, moving packets, satellites, orbital rings and atmospheric dust.
- Rebuilt the humanoid with deterministic facial, jaw, neck and torso particles; structured eyes, nose and mouth; speech/viseme-driven jaw movement; and an animated chest core.
- Added drag rotation, scroll/pinch zoom, dedicated zoom-in/zoom-out controls and camera reset to both models, with responsive and reduced-motion behaviour.
- Added approval-gated HTTP/HTTPS browser navigation and Google search.
- Added one fixed, read-only `git status --short --branch` terminal action with approval, fixed arguments, no shell, a timeout and captured output.
- Added action-specific approval cards, honest connector outcomes and expanded backend safety tests.

Exact-target clicking, form submission, arbitrary shell commands, coding automation, Git push and deployment are not part of this slice.

## Phase 04 — persistent memory foundation and browser handoff (delivered)

- Added typed `preference`, `application`, `file`, `device` and `fact` memory records in local SQLite storage.
- Added the approval-gated `memory.create` action; rejection creates no record and every decision updates the original command outcome.
- Added read APIs for typed memories and the recent command/response timeline, with bounded result limits and optional memory-kind filtering.
- Added console tabs for Notes, Typed memory and Timeline, including empty states, status presentation and responsive layouts.
- Fixed console browser navigation/search so approval opens the exact URL on the device displaying Nexus rather than relying on a browser process on the API host.
- Added popup-block handling that leaves the approval pending and reports that no page opened.
- Verified memory persistence across an API restart and expanded backend integration coverage.

This phase creates and lists memory records. Memory editing/deletion, semantic retrieval, retention controls, adaptive skill installation, exact-target browser clicking and broader terminal/coding skills remain separately scoped work.

## Phase 05 — owned devices and home (foundation delivered)

- Added approval-gated local registration for owned Android and iPhone devices, with persistent `not_connected` records and read APIs.
- Added explicit platform capability declarations and limitations; registration does not pair a device, prove ownership or enable remote control.
- Added a Devices & home console with Android/iPhone registration, rejection, registry inspection and responsive layouts.
- Added honest Home & AC connector status and boundary checks. No integration is configured, no state is simulated and no home device is contacted.
- Verified device persistence across an API restart and expanded backend/browser coverage.

Real Android/iPhone companion pairing and platform-authorised actions remain next. Matter, Home Assistant or vendor-authorised home integrations, including AC where supported, require exact device selection, configured credentials outside Git and separate approval tests. Laptop input/session locking and physical passcode recovery require a separately reviewed operating-system design.

## Phase 06 — consent-based local camera preview (first slice delivered)

- Added approval-gated `camera.preview` requests with an exact video-only payload: browser camera video enabled, microphone disabled, recording disabled and frame storage set to none.
- Added a second, browser-native permission boundary. Backend approval creates an `approved` session but does not access or activate a camera.
- Added a visible local webcam preview with immediate Stop, pending-request cancellation, browser-track cleanup and page-exit cleanup. The preview becomes active only after a real browser `MediaStream` starts.
- Added persistent browser-reported `approved`, `active`, `unavailable` and `stopped` sessions, strict lifecycle transitions, read-only camera status and matching audit events.
- Added a responsive Camera & vision console and session metadata history. No camera frames, snapshots, recordings, audio or uploads are accepted by the API.
- Expanded automated coverage and verified approval, rejection, browser denial, active preview, immediate stop, page cleanup, persistence and responsive layouts using a simulated browser video track.

### Remaining Phase 06 connector work

Add explicitly configured IP/CCTV and ESP32-CAM connectors, laptop-side vision events and retention-controlled observations; then add a separate ESP32 sensor hub and expand the humanoid into the optional second-monitor avatar experience. These connectors are not active yet. Camera and speaker-profile features require visible consent and must not treat voice identity as sufficient authorisation for sensitive actions.

## Phase 07 — reviewed adaptive capabilities and expanded automation

Unknown capabilities follow documentation retrieval → typed proposal → isolated tests → human review → signed/versioned release → monitoring and rollback. Raw pages, documents, transcripts and model output remain untrusted data. Browser exact-target clicking, scoped coding automation, Git operations and deployment each require their own permission boundaries and tests before activation.
