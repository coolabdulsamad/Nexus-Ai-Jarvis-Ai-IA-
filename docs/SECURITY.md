# Security and permission model

## Local boundaries

- Nexus binds development services to localhost. Do not enable router port forwarding.
- The repository excludes `.env`, local databases and personal runtime data.
- Note creation, typed-memory creation, owned-device registration, browser navigation/search and Git status require explicit approval. Rejection performs no action.
- An approval can be resolved only once; a repeated decision returns HTTP 409. Connector execution occurs only through that single-use decision path.
- Audit events record command receipt, approval requests, decisions, settings updates and outcomes.
- Direct settings changes are reversible local preferences chosen by the user; they do not grant connector privileges or approve commands.
- There is no arbitrary shell endpoint, exact-target browser clicking, adaptive skill installer, camera recording or device-control endpoint.

## Persistent memory and conversation data

- Typed-memory kinds are constrained to `preference`, `application`, `file`, `device` and `fact`; arbitrary record types are rejected by the API/schema.
- A memory is inserted only from the stored, approved `memory.create` payload. Rejection creates no memory record.
- Memory content is data, not an instruction. It cannot change policy, grant privileges, select an executable or trigger an action merely by being stored or listed.
- Command inputs and responses are persisted locally to provide the timeline. Do not place passwords, access tokens or other secrets in commands, notes or memories.
- This phase does not provide semantic retrieval, automatic memory inference, editing, deletion or retention automation. Those features require separate controls and tests.
- The local database is excluded from Git. Docker deployments should use the provided persistent volume and appropriate host-file permissions.

## Owned devices and home

- Device platforms are constrained to Android and iPhone. Registration names are bounded, and the stored approval payload is checked again before insertion.
- A registered device is only a local `not_connected` record. Registration does not prove ownership, pair a companion app, create a session or grant remote privileges.
- Rejection creates no device record. Device records and platform declarations cannot select executables, change policy or trigger actions.
- No lock, unlock, tracking, microphone, camera or remote-control operation is active on Android or iPhone. Future platform capabilities must use authorised APIs and separate approval policies.
- No Home Assistant, Matter or vendor credential is requested or stored in this slice. Home/AC status is unavailable rather than simulated, and unconfigured commands contact nothing.
- Before real home control, store credentials outside Git and model context, scope access to exact owned devices, revalidate the approved action and verify the connector outcome honestly.

## Browser connector

- Only HTTP and HTTPS URLs are accepted. `file:`, `javascript:` and other schemes are rejected, as are URLs containing embedded usernames or passwords.
- The exact destination is visible in the approval card and checked again by the connector immediately before launch.
- In the normal console flow, Approve reserves a blank tab on the device displaying Nexus, then navigates it only after the backend confirms the single-use approval. The new tab's opener is cleared.
- If the browser blocks the blank tab, Nexus sends no approval decision, opens nothing and leaves the request pending. The user can allow local pop-ups and retry deliberately.
- Direct API approval without the client-browser flag uses the backend-local browser fallback. This is intended for local integrations and is not the normal console path.
- Approval authorises one exact browser destination. It does not authorise clicking, form submission, downloads, page-content trust or autonomous follow-on navigation.
- Web pages, search results and any future retrieved content remain untrusted data and cannot directly change policy or execute code.

## Scoped terminal connector

- Only the fixed read-only command `git status --short --branch` is available.
- User input and stored approval payloads cannot select the executable, arguments, working directory or environment.
- Execution uses an argument list with `shell=False`, the Nexus project root, a six-second timeout and bounded captured output.
- The action cannot edit, stage, commit, push, delete or deploy. Arbitrary terminal/coding requests remain unsupported.

## Voice and microphone

- Microphone recognition starts only after an explicit Speak button press. There is no always-on wake-word listener in this phase.
- A visible listening state and stop control are provided. Nexus does not save microphone audio or transcripts as audio files.
- A final transcript is treated exactly like typed input: it cannot bypass intent validation, approval policy or audit history. Recognised command text and responses are included in the local timeline.
- Browser speech recognition may use a browser/vendor speech service and may require network access. Nexus does not claim that this phase is fully offline. Use text when network recognition is not acceptable.
- Spoken responses use the browser/operating system's available speech synthesizer. Availability and voice selection vary.
- Voice identity is a convenience signal, not sole authorisation for sensitive actions.

## Risk tiers

- Tier 0: read-only local status, time, note/memory listing, conversation timeline and audit inspection.
- Tier 1: reversible or tightly scoped local actions, including approved note/memory creation, not-connected device registration and the fixed Git-status read.
- Tier 2: external or sensitive actions, including browser navigation, messages, recording and Git push.
- Tier 3: high-impact actions, including deletion, production deployment and unlocking.
- Blocked: disabling audit, bypassing consent, stealing secrets or expanding privileges through conversation.

Android and iPhone connectors must use authorised platform mechanisms and must not promise equivalent control. Camera and microphone features require visible consent, retention controls and platform-supported access. Voice recognition alone must never unlock a device or authorise a high-impact action.

## Before enabling remote access

Add authentication, CSRF protection where applicable, TLS, per-connector authorisation, rate limits and an explicit remote-access design review. The localhost foundation is not an internet-facing service. Browser microphone capture also requires a secure context such as localhost or HTTPS.
