# ADR 004: Native WhatsApp QR Integration

## Status
Accepted

## Context
Metria Metrics needs to support WhatsApp for users who do not have access to the official WhatsApp Business Cloud API. While third-party gateways like OpenWA or Evolution API exist, they introduce external dependencies and infrastructure complexity. We need a way to allow users to connect their personal or business accounts by scanning a QR code directly within Metria.

## Decision
We will implement a native WhatsApp bridge using the `whatsapp-web.js` library directly within the Metria Backend.

### Architectural Pillars

1. **Multi-Session Management:**
   - We will create a `WhatsAppSessionManager` class to handle multiple concurrent clients (one per workspace).
   - Each client will run in a "Headless" Chromium instance.
   - Resource optimization: Instances will be lazily loaded (only started when the user visits the Inbox or if background automation is active).

2. **Real-time UX (WebSockets):**
   - We will use the existing `socket.io` infrastructure to emit `whatsapp:qr` events to the frontend.
   - The frontend will render the QR using a dedicated component.
   - States like `INITIALIZING`, `QR_READY`, `AUTHENTICATED`, and `READY` will be pushed in real-time.

3. **Session Persistence:**
   - We will use `LocalAuth` strategy to store session data in a secure directory (`.wwebjs_auth`).
   - This ensures that users don't have to re-scan the QR code after backend restarts.

4. **AI Agent Integration:**
   - The `whatsapp-native` service will bridge incoming messages to the `message.service.ts` and `ai.service.ts`, ensuring Andromeda can reply autonomously just like she does with Telegram/Official WA.

## Consequences
- **Positive:** Full control over the user experience. Zero external costs for gateways. Deep integration with Metria's CRM.
- **Negative:** Increased RAM usage (approx. 200MB per active Chromium instance). Dependency on the stability of the WhatsApp Web protocol (maintained by the library community).
- **Neutral:** Requirement for Chromium/Puppeteer dependencies in the production environment (Easypanel/Docker).

## Implementation Roadmap
1. **Scaffold:** Create `Backend/src/lib/whatsapp/manager.ts`.
2. **WebSocket Bridge:** Implement the event emitters for QR and Ready states.
3. **Frontend Dialog:** Create the `WhatsAppQRDialog` component in the Channel Settings.
4. **Auto-Reply:** Hook the native client's `message` event into Metria's AI engine.
