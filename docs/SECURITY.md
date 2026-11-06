# Security and permission model

## Local boundaries

- Nexus binds development services to localhost. Do not enable router port forwarding.
- The repository excludes `.env`, local databases and personal runtime data.
- There is no shell execution, browser control, camera recording or device-control endpoint.
- Note creation requires an explicit approval. Rejection creates no note.
- An approval can be resolved only once; a repeated decision returns HTTP 409.
- Audit events record command receipt, approval requests, decisions, settings updates and outcomes.
- Direct settings changes are reversible local preferences chosen by the user; they do not grant connector privileges or approve commands.

## Voice and microphone

- Microphone recognition starts only after an explicit Speak button press. There is no always-on wake-word listener in this phase.
- A visible listening state and stop control are provided. Nexus does not save microphone audio or transcripts as audio files.
- A final transcript is treated exactly like typed input: it cannot bypass intent validation, approval policy or audit history.
- Browser speech recognition may use a browser/vendor speech service and may require network access. Nexus does not claim that this phase is fully offline. Use text when network recognition is not acceptable.
- Spoken responses use the browser/operating system's available speech synthesizer. Availability and voice selection vary.
- Voice identity is a convenience signal, not sole authorisation for sensitive actions.

## Risk tiers for later phases

- Tier 0: read-only status and search.
- Tier 1: reversible local actions.
- Tier 2: external or sensitive actions, including messages, recording and Git push.
- Tier 3: high-impact actions, including deletion, production deployment and unlocking.
- Blocked: disabling audit, bypassing consent, stealing secrets or expanding privileges through conversation.

Android and iPhone connectors must use authorised platform mechanisms and must not promise equivalent control. Camera and microphone features require visible consent, retention controls and platform-supported access.

## Before enabling remote access

Add authentication, CSRF protection where applicable, TLS, per-connector authorisation, rate limits and an explicit remote-access design review. The localhost foundation is not an internet-facing service. Browser microphone capture also requires a secure context such as localhost or HTTPS.
