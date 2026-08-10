# Visit-Scheduled Email Notification via Gmail API — Design

## Context

Following up on the WhatsApp technician-alert feature (`sendTechnicianAlert()` in `appointment-notifications.service.ts`, shipped 2026-08-10), the workspace owner wants a second, independent notification channel: an email to a small internal recipient list every time a SITE_VISIT appointment is scheduled or rescheduled, sent **as** `drillchilecl@gmail.com` — the same Google account already connected for Google Calendar sync — carrying the lead's cotización, dirección, teléfono, geolocalización, nombre, and fecha/hora.

A second, larger feature (a personalizable "carta de intención de compra" sent to the lead) was raised in the same conversation and explicitly deferred to its own brainstorming/spec cycle — out of scope here.

**Verified during design (2026-08-10):**
- No address/geolocation/quote data exists anywhere in the WhatsApp bot's conversational qualification flow. It *does* exist, captured by a separate "solar onboarding wizard" intake (`solarLead.routes.ts` → `leadIngestion.service.ts`) and stored in `Contact.qualificationData.rawFields` — confirmed live on a real contact (Alexis Carvajal): `direccion`, `houseMapUrl`, `meterMapUrl`, `montoBoleta`, `comuna`, plus `Contact.sessionId` for building the cotización link.
- Google Calendar OAuth (`GoogleCalendarProvider` in `src/lib/oauth/providers/google-calendar.ts`) is already connected and working for `drillchilecl@gmail.com`, requesting `calendar`, `calendar.events`, `calendar.readonly`, `email`, `profile` — not `gmail.send`.
- The Google Cloud project (`metria-crm`) publishing status is **"En producción"** (not Testing) and `gmail.send` is tier **"Sensible"** (same tier as the calendar scopes already in use) — confirmed directly in Google Cloud Console. This means: no CASA security assessment needed, no 100-test-user cap, no 7-day refresh-token expiry (that limit is Testing-status-only). Reconnecting will show a one-time "app no verificada" warning during consent, same UX Calendar already went through — after that, the token behaves identically to Calendar's.

## Goals

- Send an email from `drillchilecl@gmail.com` to a configurable list of DrillChile team addresses whenever a SITE_VISIT appointment is created or rescheduled.
- Include, in this order: cotización (link), dirección, teléfono, geolocalización (house + meter Maps links), nombre, fecha y hora.
- Reuse the existing per-workspace Google OAuth connection — no new credential storage, no SMTP app password.
- Never block or fail the booking itself if the email fails to send (same non-blocking philosophy as the WhatsApp alert).

## Non-goals

- CALL-type appointments — WhatsApp technician alert already scopes this to SITE_VISIT only; email follows the same scope.
- Per-visit or per-technician recipient variation — one fixed comma-separated list per workspace, configured once.
- The "carta de intención de compra" feature — separate spec.
- Manual retry UI for the email specifically (the existing "Reenviar aviso al técnico" button stays WhatsApp-only for now — can be extended later if needed).

## Architecture

### Gmail sending capability (new shared building block)

- `src/lib/oauth/providers/google-calendar.ts`: add `https://www.googleapis.com/auth/gmail.send` to `getAuthUrl()`'s scope list. `prompt: 'consent'` is already set, so an existing connection just needs the user to click "Conectar Ahora" again (Dashboard → Configuración Técnica → tarjeta Google Calendar) — no disconnect step required, no new UI.
- New `sendGmailEmail(workspaceId, { to, subject, html })` helper in a new file, `src/modules/scheduling/gmail.service.ts`: reuses the existing `getValidAccessToken()` refresh flow from `google-calendar.service.ts`, builds a base64url-encoded RFC 2822 MIME message, `From: <workspace.googleCalEmail>`, and POSTs to `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`.

### Trigger — extends `notifyAppointmentEvent`, not a new hook

`appointment-notifications.service.ts`'s `notifyAppointmentEvent()` gains a third independent, non-blocking branch alongside the existing WhatsApp technician alert and lead confirmation:

```
notifyAppointmentEvent
├── WhatsApp internal alert (sendTechnicianAlert) — non-blocking, existing
├── WhatsApp lead confirmation — non-blocking, existing
└── Email visit notification — non-blocking, NEW
    ├── skip if appointment.type !== 'SITE_VISIT'
    ├── skip if workspace.visitNotifyEmails is empty
    ├── build subject + HTML body from contact + appointment data
    └── sendGmailEmail() to each parsed recipient address
```

Fires for both `kind: 'created'` and `kind: 'rescheduled'`, matching the WhatsApp alert's trigger points (same call sites in `ai.service.ts`'s `schedule_appointment` case, already passing `kind`/`oldScheduledAt` through).

A failure here (expired/missing Gmail grant, Gmail API error, malformed recipient list) is caught locally and logged — never propagates to fail the booking or the WhatsApp branches.

## Data & Config

- New `Workspace.visitNotifyEmails` (`String?`, comma-separated addresses) — added next to `notifyPhone` in `schema.prisma`.
- Extends the existing `PATCH /scheduling/booking-config` route and `BookingConfigCard.tsx` UI: a new text field next to "Número interno a notificar", same save button, same pattern.
- Empty/unset `visitNotifyEmails` = feature off for that workspace, same as `notifyPhone` today.

## Email content

Subject: `📅 Visita técnica agendada — {contact.name} — {fecha corta}` (created) / `📅 Visita técnica reagendada — {contact.name} — {fecha corta}` (rescheduled).

Body, in the requested order, each field omitted if not present on the contact (never renders "undefined" or an empty link):

1. **Cotización** — `https://solar.drillchile.cl/cotizaciones?sessionId={contact.sessionId}` (only if `sessionId` present)
2. **Dirección** — `contact.qualificationData.rawFields.direccion`
3. **Teléfono** — `contact.phone`
4. **Geolocalización** — `rawFields.houseMapUrl` ("Ver ubicación de la casa") and `rawFields.meterMapUrl` ("Ver ubicación del medidor"), each linked only if present
5. **Nombre** — `contact.name`
6. **Fecha y hora** — `appointment.scheduledAt`, formatted via the existing `formatApptDateTime(d, tz)` in the workspace's timezone

For the rescheduled case, also includes the previous date/time (`oldScheduledAt`) for context, same as the WhatsApp reschedule message does.

## Error handling

- Missing/expired Gmail OAuth grant (e.g. workspace never reconnected after the scope was added): `getValidAccessToken()`'s existing refresh-token error path throws; caught locally, logged as `[appointment-notifications] email notification failed (non-blocking): ...`, no email sent, everything else proceeds normally.
- Malformed entries in `visitNotifyEmails` (stray whitespace, trailing comma): trimmed and filtered for a plausible `@` before sending; a single bad address doesn't block the well-formed ones — send per-recipient, collect failures, log a summary.
- No address/geolocation/quote data on the contact (e.g. a manually-created appointment for a contact never routed through the solar onboarding wizard): those lines are simply omitted from the email body, not blocked.

## Testing

Mirrors `appointment-notifications.service.test.ts`'s existing structure:

- `sendGmailEmail()` unit tests: mocked `fetch`, verifies MIME encoding and the `Authorization` header uses the refreshed access token.
- `notifyAppointmentEvent()` additions: sent when `visitNotifyEmails` configured + SITE_VISIT; skipped silently for CALL type; skipped silently when unconfigured; never throws when the Gmail API call fails; renders the rescheduled case with `oldScheduledAt`.

## Rollout (manual steps, in order)

1. Ship the code (scope addition + `sendGmailEmail()` + `notifyAppointmentEvent()` branch + config field + UI).
2. User reconnects Google Calendar (Dashboard → Configuración Técnica → "Conectar Ahora"), accepts the one-time "app no verificada" warning.
3. User fills in `visitNotifyEmails` in the Citas booking-config card.
4. Test by scheduling/rescheduling a real SITE_VISIT appointment; verify email arrives.
