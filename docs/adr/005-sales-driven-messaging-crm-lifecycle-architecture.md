# ADR 005: Sales-Driven Messaging & CRM Lifecycle Architecture

## Status
Accepted

## Context
Metria Metrics currently treats messaging and CRM as separate entities. To provide a premium e-commerce experience, every interaction (WhatsApp message, Telegram inquiry, Shopify order) must be part of a unified sales lifecycle. A user shouldn't just "receive a message"; they should "receive a potential sale" that is automatically categorized and tracked.

## Decision
We will implement a **Unified Lifecycle Engine** that bridges all inbound signals into a structured CRM Pipeline.

### 1. The "Signal-to-Lead" Logic
Every inbound event will trigger the following cascade:
- **Detection:** Identify the platform (WhatsApp QR, Telegram, Shopify).
- **Identity Resolution:** Check if the contact exists by phone/email.
- **Auto-Categorization:**
  - **Shopify Order:** Move to "Customer" status + Create "Conversion" event.
  - **Inbound Message:** Move to "Lead" status + Trigger AI Qualification.
  - **Telegram Bot Start:** Move to "Prospect" status.

### 2. Native WhatsApp QR as a "Sales Entry Point"
The native WhatsApp integration (ADR 004) will be the primary driver for high-touch sales:
- **QR Experience:** Real-time feedback in UI (Initializing -> Ready).
- **Auto-Handover:** The AI Agent will qualify the lead and, once a budget/interest is detected, automatically create a **Deal** in the "Sales Pipeline" stage.

### 3. Cross-Platform CRM Sync
- **Unified Profile:** A single CRM card showing the Shopify purchase history alongside WhatsApp chat logs and Telegram interactions.
- **Pipeline Automation:** Moving a contact to "Closed Won" in Metria will trigger a tag update in Shopify/WhatsApp.

## Consequences
- **Positive:** Transform Metria into an active sales tool rather than a passive dashboard. High value for users wanting "Autonomous Sales."
- **Negative:** Increased logic complexity in the backend `message.service.ts`.
- **Neutral:** Unified database schema across all integration types.

## Implementation Roadmap
1. **Infrastructure:** Implement the Native WhatsApp Manager (Multi-session).
2. **CRM Bridge:** Update `processInboundMessage` to handle auto-deal creation logic.
3. **Frontend UX:** Design the "Unified Customer Journey" view in the CRM.
