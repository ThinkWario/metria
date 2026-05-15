# Metria: Onboarding & Monetization Roadmap

## 1. Onboarding Flow & Trial Logic ✅
- [x] Prevent trial re-use (Database `trialUsedAt` implementation)
- [x] Middleware protection for `/dashboard` and `/onboarding`
- [x] Countdown Banner for Trial period in Dashboard
- [x] Automatic redirect on trial expiration
- [x] Logout button in onboarding page

## 2. Infrastructure for Payments ✅
- [x] Database schema updates (`paymentProvider`, `currentPeriodEnd`, `cancelAtPeriodEnd`)
- [x] Payments API structure (`create-subscription`, `webhook`, `cancel-subscription`)
- [x] Integration with MercadoPago SDK and PayPal REST API
- [x] Billing Section in Settings page

## 3. Real Integration (In Progress) ⏳
- [ ] Configure real PayPal Plan IDs in `.env`
- [ ] Configure real MercadoPago Access Token in `.env`
- [ ] Implement PayPal Webhook verification
- [ ] Implement MercadoPago Webhook verification

## 4. Polishing & UX
- [ ] Detailed success/error pages after payment redirect
- [ ] Email notifications on successful subscription
- [ ] Invoice generation (PDF)
