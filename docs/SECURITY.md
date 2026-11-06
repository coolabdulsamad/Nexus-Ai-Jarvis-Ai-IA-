# Security and permission model

## Local boundaries

- Nexus binds development services to localhost. Do not enable router port forwarding.
- The repository excludes `.env`, local databases and personal runtime data.
- Note creation, browser navigation/search and Git status require explicit approval. Rejection performs no action.
- An approval can be resolved only once; a repeated decision returns HTTP 409. Connector execution occurs only through that single-use decision path.
- Audit events record command receipt, approval requests, decisions, settings updates and outcomes.
- Direct settings changes are reversible local preferences chosen by the user; they do not grant connector privileges or approve commands.
- There is no arbitrary shell endpoint, exact-target browser clicking, camera recording or device-control endpoint.

## Browser connector

- Only HTTP and HTTPS URLs are accepted. `file:`, `javascript:` and other schemes are rejected, as are URLs containing embedded usernames or passwords.
- The exact destination is visible in the approval card and checked again by the connector immediately before launch.
- Approval authorises one local browser launch. It does not authorise clicking, form submission, downloads, page-content trust or autonomous follow-on navigation.
- Chrome/Chromium is preferred when installed; otherwise Nexus tries the default browser. An unsuccessful launch returns `unavailable` and does not claim completion.
- Web pages, search results and any future retrieved content remain untrusted data and cannot directly change policy or execute code.

## Scoped terminal connector

- Only the fixed read-only command `git status --short --branch` is available.
- User input and stored approval payloads cannot select the executable, arguments, working directory or environment.
- Execution uses an argument list with `shell=False`, the Nexus project root, a six-second timeout and bounded captured output.
- The action cannot edit, stage, commit, push, delete or deploy. Arbitrary terminal/coding requests remain unsupported.

## Voice and microphone

- Microphone recognition starts only after an explicit Speak button press. There is no always-on wake-word listener in this phase.
- A visible listening state and stop control are provided. Nexus does not save microphone audio or transcripts as audio files.
- A final transcript is treated exactly like typed input: it cannot bypass intent validation, approval policy or audit history.
- Browser speech recognition may use a browser/vendor speech service and may require network access. Nexus does not claim that this phase is fully offline. Use text when network recognition is not acceptable.
- Spoken responses use the browser/operating system's available speech synthesizer. Availability and voice selection vary.
- Voice identity is a convenience signal, not sole authorisation for sensitive actions.

## Risk tiers

- Tier 0: read-only local status, time, note listing and audit inspection.
- Tier 1: reversible or tightly scoped local actions, including approved note creation and the fixed Git-status read.
- Tier 2: external or sensitive actions, including browser navigation, messages, recording and Git push.
- Tier 3: high-impact actions, including deletion, production deployment and unlocking.
- Blocked: disabling audit, bypassing consent, stealing secrets or expanding privileges through conversation.

Android and iPhone connectors must use authorised platform mechanisms and must not promise equivalent control. Camera and microphone features require visible consent, retention controls and platform-supported access. Voice recognition alone must never unlock a device or authorise a high-impact action.

## Before enabling remote access

Add authentication, CSRF protection where applicable, TLS, per-connector authorisation, rate limits and an explicit remote-access design review. The localhost foundation is not an internet-facing service. Browser microphone capture also requires a secure context such as localhost or HTTPS.
