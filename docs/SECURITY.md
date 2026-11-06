# Security and permission model

## Foundation boundaries

- Nexus binds development services to localhost. Do not enable router port forwarding.
- The repository excludes `.env`, local databases and personal runtime data.
- The first phase has no shell execution, browser control, camera recording or device-control endpoint.
- Note creation requires an explicit approval. Rejection creates no note.
- An approval can be resolved only once; a repeated decision returns HTTP 409.
- Audit events record command receipt, approval requests, decisions and outcomes.

## Risk tiers for later phases

- Tier 0: read-only status and search.
- Tier 1: reversible local actions.
- Tier 2: external or sensitive actions, including messages, recording and Git push.
- Tier 3: high-impact actions, including deletion, production deployment and unlocking.
- Blocked: disabling audit, bypassing consent, stealing secrets or expanding privileges through conversation.

Voice identity is a convenience signal, not sole authorisation for sensitive actions. Android and iPhone connectors must use authorised platform mechanisms and must not promise equivalent control. Camera and microphone features require visible consent, retention controls and platform-supported access.

## Before enabling remote access

Add authentication, CSRF protection where applicable, TLS, per-connector authorisation, rate limits and an explicit remote-access design review. The localhost foundation is not an internet-facing service.
