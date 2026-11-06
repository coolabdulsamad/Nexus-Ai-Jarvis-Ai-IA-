# Delivery roadmap

## Phase 01 — foundation

- Local FastAPI core and SQLite persistence.
- React console with interactive yellow globe and PWA manifest.
- Text commands, notes, approvals, rejection and audit history.
- Honest unavailable responses for Chrome and home/AC requests.
- Automated tests, development scripts, Docker and CI configuration.

## Phase 02 — voice core

Add configurable assistant name, microphone capture, wake word, local speech-to-text, text-to-speech and interruption. Keep text as a working fallback. Voice must use the existing command and approval path.

## Phase 03 — browser and terminal connectors

Add allowlisted browser navigation and exact-target action previews. Add scoped terminal skills with working-directory limits, timeouts, output capture and tiered approval. No arbitrary command catalogue should bypass policy.

## Phase 04 — memory and adaptive skills

Expand typed memory for preferences, applications, files, conversations and device events. Unknown capabilities follow documentation retrieval → typed proposal → isolated tests → review → signed/versioned release → monitoring and rollback.

## Phase 05 — owned devices and home

Add Android and iPhone companion/platform connectors with platform-specific capability declarations. Add Matter, Home Assistant or vendor-authorised home integrations, including AC where supported.

## Phase 06 — cameras, sensors and avatar

Add IP/CCTV and ESP32-CAM capture, laptop-side vision events and retention controls; a separate ESP32 sensor hub; then the optional speech-driven humanoid avatar.
