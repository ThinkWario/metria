# ADR 003: Omni-OAuth Integration Framework

## Status
Proposed

## Context
Metria Metrics relies on data from multiple platforms: Meta Ads, Google Ads, and Shopify. Currently, connecting these sources requires users to manually input sensitive and technical API keys (tokens, customer IDs, etc.). This manual process is high-friction and leads to significant dropout during onboarding.

## Decision
We will implement a unified **Omni-OAuth Framework** to automate the connection of all data sources. This framework will replace manual token entry with standard OAuth 2.0 flows and platform-specific installation sequences.

### Integration Matrix

| Platform | Method | Implementation Details |
| :--- | :--- | :--- |
| **Meta Ads** | **OAuth 2.0** | Redirect to Facebook -> Get User Access Token -> Upgrade to Long-Lived Token (60 days). |
| **Google Ads** | **OAuth 2.0** | Redirect to Google -> Get Authorization Code -> Exchange for Refresh Token (Permanent). |
| **Shopify** | **App Installation** | OAuth flow for Shopify App Store. Redirect to store URL -> Get Offline Access Token (Permanent). |
| **Telegram** | **Token Assist** | Semi-automated flow: One-click button to @BotFather -> User pastes token back. |
| **WhatsApp** | **QR Scan** | OpenWA integration. User scans QR in Metria UI -> Backend spawns browser instance. |

### Architectural Requirements
1. **Centralized Token Management:** All OAuth tokens will be stored in the `Integration` model's `config` JSON field, encrypted at rest.
2. **Refresh Logic:** Implement a background service/cron to automatically refresh short-lived tokens (especially for Google Ads and Meta).
3. **State Management:** Use `state` parameters in OAuth redirects to prevent CSRF and maintain `workspaceId` context during callbacks.

## Consequences
- **Positive:** Massive improvement in User Experience (UX). Zero-friction onboarding. Enhanced security by following platform-native auth standards.
- **Negative:** Increased complexity in the Backend (handling callback routes for 3+ providers). Requirement to maintain valid Developer Apps on Meta, Google, and Shopify.
- **Neutral:** Need for a centralized "Integration Hub" in the Frontend.

## Implementation Strategy
1. **Base Framework:** Create a generic `/api/auth/{platform}/callback` structure in the backend.
2. **Meta & Google First:** Prioritize Ads platforms as they are the hardest to configure manually.
3. **Shopify Migration:** Transition from manual custom-app tokens to a formal "Install App" flow.
