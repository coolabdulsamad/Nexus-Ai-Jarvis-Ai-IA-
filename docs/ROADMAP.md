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

This is the browser voice slice, not a claim of fully offline speech. Persistent background/offline wake-word detection and locally hosted speech-to-text/text-to-speech models remain voice-hardening work. Browser recognition availability and network behaviour depend on the browser and operating system.

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

## Phase 07 — real local-model intelligence (delivered)

- Added genuine free-form conversation through Ollama's native model-list and non-streaming chat APIs rather than fixed responses alone.
- Added independent `ready`, `model_missing`, `unavailable` and `disabled` model states, configurable persisted model selection, bounded timeouts and honest setup/failure messages.
- Added a model system identity using the configured assistant name, up to six recent exchanges and up to eight explicitly approved typed memories as bounded, untrusted context.
- Preserved deterministic action parsing and existing approvals. The model receives no tools or executor, and generated text cannot execute actions or change policy.
- Added model-health and provider labels to the console, model/voice settings, typed/voice conversation through the same path, and mocked provider/safety/regression tests.

This is local inference, not model training, fine-tuning, embedding retrieval or autonomous self-improvement. No physical Ollama installation or response is claimed until the user installs a model and verifies it on the laptop. No cloud provider is connected.

## Phase 08 — responsiveness, opt-in wake word and local system control (delivered)

- Reduced common chat-path waiting with a short-lived Ollama readiness cache, ten-minute model keep-alive, bounded generation defaults, four recent exchanges and six approved memories. Ordinary answers now default to two to four sentences, and dashboard refreshes no longer block display of the command result.
- Added an explicitly enabled browser wake-word session with visible state, Stop control, direct wake-plus-command handling and an eight-second one-command follow-up window after wake alone. Capture pauses during processing and speech, and activation is never restored after reload.
- Added bounded real directory discovery under the home directory or explicitly configured roots, with hidden-directory and symlink exclusions, result/depth/scan limits and no file-content reads.
- Added approval-gated VS Code and platform file-manager launches using a fixed application catalog, exact resolved paths, connector-defined arguments, `shell=False` and approval-time revalidation. Ambiguous or missing folders create no launch approval.
- Added a responsive System Control console for real directory search, exact-path actions, installation state, configured roots and honest inactive screen status.
- Preserved deterministic routing, single-use approvals and audit history for typed and spoken commands. Expanded parser, connector, provider-cache, API and browser verification.

This phase does not provide speaker identification, persistent background/offline wake listening, streaming inference, screen capture, multi-monitor understanding, activity inference or clicking. Mobile pairing/tracking/control, home/AC connectivity, autonomous web learning, model training/fine-tuning and self-modification also remain unavailable. Browser speech recognition recognises words rather than voices and may use a vendor network service.

Future screen work must add visible capture consent, exact monitor/window scope, honest visual results, target confirmation and separate audited approval for each input action. Speaker profiles may become a convenience feature only; they must never become sole authorisation for sensitive actions.

## Phase 09 — streaming responsiveness and conversational voice (delivered)

- Added server-sent model-token streaming through the same validated command orchestrator, with one persisted final result and measured first-token/total timings. Kept the non-streaming compatibility endpoint, expanded readiness reuse to 60 seconds and model keep-alive to thirty minutes, and reduced post-command refreshes from eleven API requests to four.
- Replaced loosely connected wake flags with one visible voice lifecycle covering wake listening, wake-alone command capture, processing, speaking and bounded post-question reply capture. Recognition is excluded throughout processing and speech, resumes from actual synthesis completion, and prevents duplicate dispatch per recognition instance.
- Added up to eight editable wake phrases, independent `hey` activation, selectable `en-NG`/`en-US`/`en-GB` recognition locales, and tightly bounded Nexus aliases including `nextus`, `nexis` and `next to`.
- Added deterministic folder clarification: `Open a folder` asks which folder, listens after the spoken question without another wake phrase, supports exact/ordinal ambiguous choices and cancellation, and still requires exact-path approval before launch.
- Added bounded twelve-second post-question listening for completed model answers ending in a question while the explicit wake session remains enabled. Text fallback, Stop speaking and Stop voice session remain available.

This phase does not provide speaker identification or an “only my voice” security mode. Browser speech recognition identifies words rather than speakers and may use a vendor network service. A future consented local speaker-profile filter must be separately enrolled, revocable and honestly described as fallible and replay-susceptible; it must never replace authentication or action approvals. Persistent offline/background wake listening, screen capture/clicking, mobile tracking/control, home/AC connectivity, autonomous learning, training and self-modification remain unavailable.

## Phase 10 — genuine device and home connectors

Implement platform-authorised Android/iPhone companion pairing and explicitly scoped actions, followed by one configured home connector with exact device selection and verified outcomes. Add IP/CCTV, ESP32-CAM and ESP32 sensor connectors separately with consent, authentication, retention and audit controls. Registration records must not be presented as real connections.

## Phase 11 — reviewed adaptive capabilities and expanded automation

Unknown capabilities follow documentation retrieval → typed proposal → isolated tests → human review → signing/versioning → monitoring and rollback. Raw pages, documents, transcripts and model output remain untrusted data. Browser exact-target clicking, scoped coding automation, Git operations and deployment each require their own permission boundaries and tests before activation. Fine-tuning, if deliberately added later, is a separate reviewed dataset/training/evaluation workflow—not a side effect of chat.
