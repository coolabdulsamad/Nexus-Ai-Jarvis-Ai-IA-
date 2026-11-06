# Delivery roadmap

## Phase 01 — foundation (delivered)

- Local FastAPI core and SQLite persistence.
- React console with interactive yellow globe and PWA manifest.
- Text commands, notes, approvals, rejection and audit history.
- Honest unavailable responses for Chrome and home/AC requests.
- Automated tests, development scripts and Docker configuration.

## Phase 02 — voice interaction (this commit)

- Explicit push-to-talk microphone input using the browser Web Speech API.
- Spoken command results, speech-rate control and immediate interruption.
- Persistent assistant name, voice preference and visual-mode settings.
- Switchable globe and original humanoid face with blinking, head movement and speech-driven mouth shapes.
- Voice commands use the existing validation, approval and audit path.

This is the browser voice slice, not a claim of fully offline speech. Wake-word detection and locally hosted speech-to-text/text-to-speech models remain voice-hardening work. Browser recognition availability and network behaviour depend on the browser and operating system.

## Phase 03 — browser and terminal connectors

Add allowlisted browser navigation and exact-target action previews. Add scoped terminal skills with working-directory limits, timeouts, output capture and tiered approval. No arbitrary command catalogue should bypass policy.

## Phase 04 — memory and adaptive skills

Expand typed memory for preferences, applications, files, conversations and device events. Unknown capabilities follow documentation retrieval → typed proposal → isolated tests → review → signed/versioned release → monitoring and rollback.

## Phase 05 — owned devices and home

Add Android and iPhone companion/platform connectors with platform-specific capability declarations. Add Matter, Home Assistant or vendor-authorised home integrations, including AC where supported.

## Phase 06 — cameras, sensors and avatar expansion

Add IP/CCTV and ESP32-CAM capture, laptop-side vision events and retention controls; a separate ESP32 sensor hub; then expand the humanoid into the optional second-monitor avatar experience.
