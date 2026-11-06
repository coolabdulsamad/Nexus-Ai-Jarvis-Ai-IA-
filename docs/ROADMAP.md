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
- Added approval-gated HTTP/HTTPS browser navigation and Google search through Chrome/Chromium or the default browser.
- Added one fixed, read-only `git status --short --branch` terminal action with approval, fixed arguments, no shell, a timeout and captured output.
- Added action-specific approval cards, honest connector outcomes and expanded backend safety tests.

Exact-target clicking, form submission, arbitrary shell commands, coding automation, Git push and deployment are not part of this slice.

## Phase 04 — memory and adaptive skills

Expand typed memory for preferences, applications, files, conversations and device events. Unknown capabilities follow documentation retrieval → typed proposal → isolated tests → review → signed/versioned release → monitoring and rollback. Browser exact-target clicking and broader terminal/coding skills require separate scoped designs and tests.

## Phase 05 — owned devices and home

Add Android and iPhone companion/platform connectors with platform-specific capability declarations. Add Matter, Home Assistant or vendor-authorised home integrations, including AC where supported.

## Phase 06 — cameras, sensors and avatar expansion

Add IP/CCTV and ESP32-CAM capture, laptop-side vision events and retention controls; a separate ESP32 sensor hub; then expand the humanoid into the optional second-monitor avatar experience.
