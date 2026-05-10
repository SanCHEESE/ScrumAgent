---
type: entity
title: "Municorn"
created: 2026-05-10
updated: 2026-05-10
tags: [entity, organization, tenant]
---

# Municorn

The company tenant for which Telecom Scrum Agent is built.

- **Domain:** `municorn.com`
- **Service account:** `telecom.scrum.agent@municorn.com`
- **Access policy:** Google OAuth restricted to `@municorn.com` users (`ALLOWED_DOMAIN`).

The single-tenant assumption shapes the [[domains/architecture]]: one shared knowledge base, one set of MCP credentials, one OAuth-restricted user pool.
