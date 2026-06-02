# ADR 002: Omnichannel Messaging Integration Strategy

## Status
Accepted

## Context
Metria Metrics aims to provide a unified communication experience for e-commerce owners. Currently, the system supports official APIs (WhatsApp Business Cloud API, Meta Graph API for Instagram/Messenger, and Telegram Bot API). While robust, official APIs impose significant technical and financial barriers for small merchants (Meta Business Manager verification, templates, etc.).

## Decision
We will implement a **Hybrid Messaging Architecture** to maximize accessibility and reliability.

### 1. Enterprise Layer (Official APIs)
- **Channels:** WhatsApp Business (WABA), Instagram, Messenger, Telegram.
- **Use Case:** High-volume accounts, verified businesses.
- **Implementation:** Direct integration via Metria Backend and Meta Cloud APIs.

### 2. Fast-Start Layer (Unofficial Gateway - OpenWA)
- **Channels:** WhatsApp (Personal/Business accounts via QR).
- **Use Case:** Small merchants, solo entrepreneurs.
- **Implementation:** Integration with **OpenWA** (or Evolution API) as a microservice.
- **Stealth Strategy:** Use Puppeteer-based instances to minimize ban risk by simulating real browser behavior.

### 3. Unified Interface (Metria Inbox)
- All messages, regardless of the provider (Official vs. OpenWA), will be normalized into the `Message` and `Conversation` schema in Metria.
- **AI Agent:** A single AI orchestration layer (Gemini/Claude) will handle auto-responses across all providers.

## Consequences
- **Positive:** Lower barrier to entry for new users. Increased market reach.
- **Negative:** Maintenance of an unofficial bridge (vulnerable to WhatsApp Web updates). Higher RAM consumption for OpenWA instances.
- **Mitigation:** Provide clear warnings about "unofficial" connection risks and encourage migration to official APIs as the business grows.

## Implementation Plan
1. Deploy OpenWA microservice on Easypanel.
2. Implement "Scan QR" UI in Channel Settings.
3. Bridge OpenWA webhooks to `whatsapp.service.ts`.
