# ADR 001: Agent-Driven Comprehensive Site Review Protocol

## Status
Accepted

## Context
Metria is a complex metrics platform with high-density UI and multiple external integrations (Shopify, Meta, Google, etc.). Ensuring perfect synchronization between backend parameters and frontend expectations is critical. Manual testing of these interdependencies is slow and prone to human error, especially as the platform scales.

## Decision
We will adopt an **Agent-Driven Review Protocol** to maintain system integrity and visual excellence. This involves delegating specific audit layers to AI agents with specialized tools.

### 1. Architectural & Integration Audit (@codebase_investigator)
- **Goal:** Ensure the "plumbing" is correct.
- **Checks:** 
  - Consistency of `JWT_SECRET` across services.
  - Alignment of `FRONTEND_URL` and `BACKEND_URL` in `.env` files.
  - Verification that API endpoints called by the frontend exist and are correctly typed in the backend.

### 2. Visual & Interaction Excellence (@agent-browser)
- **Goal:** Guarantee a premium "2026-standard" UI/UX.
- **Workflow:** Execute the `/audit` command periodically.
- **Key Focus:** 
  - Bento Grid alignment and spacing tokens.
  - Glassmorphism and backdrop-blur consistency.
  - Interaction feedback (<100ms response) and loading states (skeletons).

### 3. Functional & Data Integrity (@generalist)
- **Goal:** Verify logic and data flows.
- **Actions:** 
  - Run diagnostic scripts (`check_db.ts`, `check_all_integrations.ts`).
  - Monitor logs for silent failures in background cron jobs.

## Consequences
- **Positive:** Dramatic reduction in regression bugs. Continuous assurance of visual quality. Faster onboarding for new developers.
- **Negative:** Increased token usage for comprehensive audits. Requires discipline in keeping `.env.example` and diagnostic scripts updated.
- **Neutral:** Verification shifts from "doing" to "orchestrating" agent tasks.

## Verification Gate
A system is considered "Metria-Ready" only if all agents report success and the visual audit score is ≥ 9/10.
