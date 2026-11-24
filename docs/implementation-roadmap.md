# Porter: Implementation Roadmap

Source of truth: [`docs/design/porter-design-spec.md`](design/porter-design-spec.md). Confirmed rules from the build brief take priority:

- No upper score limit. High scores get a soft warning only.
- Wild cards Ace → King are shown as context per deal.
- Games cannot be ended early.

Status legend: ✅ done · 🔄 in progress · ⬜ not started. All MVP milestones are complete; verification results are below.

## Key technical decisions

| Area | Decision | Why |
|---|---|---|
| Runtime | .NET 10 (LTS), Angular 22 (zoneless, Vitest), PostgreSQL 17 | Current LTS/stable versions |
| API style | Controllers | Explicit and easy to review in a portfolio |
| Layers | Domain → Application → Infrastructure → Api | Domain has zero framework deps; Application depends on an `IPorterDbContext` abstraction (pragmatic Clean Architecture, no repository-per-entity boilerplate) |
| Auth | ASP.NET Core Identity (user store + hashing) + JWT access token (15 min, in memory on client) + rotating refresh token in an HttpOnly cookie (hashed in DB) | No tokens in localStorage; refresh is replay-protected by rotation |
| Same-origin | Angular dev-server proxy (dev), nginx reverse proxy `/api` (prod) | Lets the refresh cookie be `SameSite=Strict`; no CORS needed for the app itself |
| Concurrency | PostgreSQL `xmin` as row version on `Game`; every deal write touches the game row | Client sends `expectedVersion`. Stale → 409 |
| Idempotency | Client-generated game id on `POST /games`; `PUT /games/{id}/deals/{n}` | Retries never duplicate |
| Ranking | Computed in the Domain (`Ranking.Rank`), returned in `GameStateDto` | Client never ranks |
| Integration tests | `WebApplicationFactory` + Testcontainers PostgreSQL | Real Postgres needed for xmin and constraints |
| Frontend state | Signals in feature stores; Reactive Forms for input | Small, explicit, testable |
| Styling | Tailwind v4 `@theme` tokens from the spec + Angular CDK (Dialog, A11y) | Matches the design handoff |
| Email | `IEmailSender` with an SMTP implementation when configured, logging fallback in dev | Honest: no email provider is bundled |

## Milestones

| # | Milestone | Backend | Frontend | Tests | Status |
|---|---|---|---|---|---|
| 1 | Foundation | sln, 4 projects, Docker Compose Postgres (port 5433) | Angular app, Tailwind, proxy | build both | ✅ |
| 2 | Domain rules | Game aggregate, Deal, DealScore, Player, Ranking, WildCard | — | Domain unit tests | ✅ |
| 3 | Database | DbContext, configurations, constraints, migrations, dev seed | — | — | ✅ |
| 4 | Authentication | Identity, JWT, refresh rotation, forgot/reset, rate limiting | auth pages, interceptor, guards | API auth tests | ✅ |
| 5 | Players | CRUD, uniqueness, safe delete | list, sheet/dialog, profile | service + API tests | ✅ |
| 6 | Dashboard | `/api/dashboard` (real activity) | new/returning variants | — | ✅ |
| 7 | Game creation & setup | create (idempotent), patch, start, delete | create screen, player selector, setup | API tests | ✅ |
| 8–9 | Active game & score entry | `PUT deals/{n}` transactional, 409 | Direction A rows, drafts, toasts, live region | API + component tests | ✅ |
| 10 | Standings & history | in GameStateDto | standings, history cards/table | — | ✅ |
| 11 | Edit previous deal | same PUT (correction) | reuse ScoreEntryForm + impact panel + guard | API + E2E | ✅ |
| 12 | Progress | — | timeline + standings + history | — | ✅ |
| 13 | Completion & results | auto-complete at 13, joint winners | completion + results + breakdown | domain + E2E | ✅ |
| 14 | Statistics | player stats, `/statistics/me` | profile + statistics charts | application tests | ✅ |
| 15 | Responsive & a11y polish | — | 390/768/1024/1280/1440 | — | ✅ |
| 16 | Integration & E2E | — | — | Playwright 6 flows | ✅ |
| 17 | Docker & CI | API + client Dockerfiles, compose | nginx | GitHub Actions | ✅ |
| 18 | Deployment prep | env config, prod cookies, migrations on start (opt-in) | — | — | ✅ |

## Verification (last full run)

| Check | Result |
|---|---|
| `dotnet build -c Release` | 0 warnings, 0 errors |
| Domain tests | 53 passed |
| Application tests (Testcontainers PostgreSQL) | 11 passed |
| API integration tests (Testcontainers PostgreSQL) | 39 passed |
| Angular production build | passes |
| Angular unit tests (Vitest) | 54 passed |
| Playwright E2E (6 core flows + draft recovery; 2 flows also at 390px) | 9 passed |
| `docker compose up --build` | db, api, web healthy; login, deep links, CSP and security headers verified through nginx |

## Notable fixes found during verification

- Tailwind v4 ships a `list-item` utility that overrode a component class of the same name, so rows rendered stacked. Renamed to `row-item`.
- After Deal 13, the play screen's status redirect raced the navigation to the completion view. A guard flag was added.
- Production critical-CSS inlining used an inline `onload` handler that the strict CSP blocks. Inlining was disabled instead of weakening the CSP.
- Identical deal replays (a retry after a lost response) returned 409. They now succeed as `unchanged`, keeping `PUT` idempotent.

## Remaining / future (not in MVP)

SignalR live updates, read-only share links, correction audit log, CSV/PDF export, notifications, dark mode.
