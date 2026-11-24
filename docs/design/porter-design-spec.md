# Porter: Product Design Spec

> **The notepad, upgraded.** Porter is a scorekeeping web app for the physical Sri Lankan Porter card game. The cards stay on the table; Porter replaces the paper score sheet.

Visual designs (all screens, states, the two score-entry directions, and a working score-entry prototype) are on the design canvas:
https://claude.ai/artifact/VZDaXWKWuDgWzDH289ZN63

This document is the written companion for implementation: decisions, rules, tokens, components, behavior, and API assumptions.

---

## 1. Product summary

| | |
|---|---|
| **What** | Shared digital score sheet: create a game, pick 2–4 players, enter one score per player after each of 13 physical deals, get exact totals, rankings, history and statistics. |
| **What it is not** | A card game. No cards, decks, hands, turns, melds, dealing, or game animations. |
| **Primary user** | Scorekeeper: one person, one device, enters every score. |
| **Secondary** | Players glancing at standings. Spectators via a read-only shared link (future). |

### Confirmed rules (do not extend)

- 2–4 players per game; exactly 13 deals; game completes automatically after Deal 13.
- Every player gets one score per deal: a non-negative integer, any value.
- Lowest cumulative total wins.
- Competition ranking (`10, 10, 15, 20 → 1, 1, 3, 4`). No tie-breakers.
- Saved deals can be edited; totals and ranks recalculate.

### Open questions (left undecided on purpose)

| Topic | Current design assumption |
|---|---|
| Wild card per deal | **Confirmed:** Deal 1 Ace, 2–10 by number, 11 Jack, 12 Queen, 13 King. Shown as context in the deal header; never enforced. |
| Must someone score 0? | Soft, non-blocking notice only. Never blocks save. |
| Change players after start | Not allowed. Editable only in Setup. |
| End a game early | Not supported; an active game can be deleted. |
| Upper score bound | **Confirmed: none.** Unusually high scores get a soft, non-blocking warning. |
| Personal stats for the user | User links a "This is me" player in Settings. |

## 2. Design principles → decisions

| Principle | Concrete decision |
|---|---|
| Fast | Create game is one screen with "Create & start". Score entry is rows plus one Save, with no confirm on the happy path. |
| Clear | "Deal N of 13" is the largest type on the game screen; Save is labelled "Save Deal N". |
| Forgiving | Save toast has an Edit link; any past deal is editable; values persist through errors; drafts survive reloads. |
| Predictable | Score rows keep **seat order** and never re-sort; focus never auto-advances. |
| Reliable | Server computes totals and ranks; explicit Saving and Saved states; idempotent saves. |
| Minimal / Human | Warm paper palette, first names with initials, no confetti or gamification. |

## 3. Information architecture

### Routes

| Route | Screen | Notes |
|---|---|---|
| `/login` `/register` `/forgot-password` `/reset-password?token=` | Auth | Centered 420px card on ≥768px |
| `/dashboard` | Dashboard | New-user and returning variants |
| `/games` | Games list | `?status=&q=&sort=&page=` in URL |
| `/games/new` | Create game | Player selector with inline add |
| `/games/:id` | **Resolver** | Redirects by status: Draft → `setup`, Active → `play`, Completed → `results` |
| `/games/:id/setup` | Game setup | Drafts only |
| `/games/:id/play` | Active game | `?view=score\|standings\|history` |
| `/games/:id/progress` | Progress | Timeline, standings and deal history together |
| `/games/:id/deals/:n` | Deal details | Read view |
| `/games/:id/deals/:n/edit` | Edit deal | `canDeactivate` guard |
| `/games/:id/results` | Final results | Read-only by default |
| `/players` `/players/new` `/players/:id` | Players | `new` is a dialog (desktop) or sheet (mobile) over the list |
| `/statistics` | My statistics | Requires linked player |
| `/profile` `/settings` | Account | One screen on mobile |
| `/s/:shareToken` | Shared game | Future, read-only |

### Navigation

- **≥768px:** top bar with Dashboard, Games, Players, Statistics, and an avatar menu (Profile, Settings, Log out). A top bar keeps the full width for score tables.
- **<768px:** bottom bar with Home, Games, Players, Profile. Statistics is reached from Profile and the dashboard stat tiles.
- **Inside a game (mobile):** the bottom bar is replaced by a sticky "Save Deal N" bar; the header has Back, game name and a ⋯ menu; a segmented control switches Score, Standings and History.

### Core journey

Open → Dashboard → New game (name + 2–4 players) → [Setup, only if saved for later] → Play physical deal → Enter scores → Save Deal → standings update → repeat ×13 → automatic completion → Results → History and stats.

## 4. Design tokens

### Color

| Token | Hex | Use |
|---|---|---|
| `bg` | `#F6F4EF` | App canvas (warm ivory) |
| `surface` | `#FFFFFF` | Cards, inputs, sheets |
| `surface-muted` | `#EFEBE3` | Table heads, panels, segmented track |
| `border` / `border-strong` | `#E2DCD1` / `#C9C1B3` | Separators / input borders |
| `ink` / `ink-muted` / `ink-subtle` | `#1D2320` / `#535A56` / `#686E6A` | Text (15.1:1, 6.6:1, 4.9:1 on bg) |
| `primary` (+hover/active/soft) | `#1E5E57` (`#174B45` / `#113934` / `#E1ECE9`) | Actions, done deals, selection |
| `sage` (+soft/ink) | `#7F9B8B` (`#E6EDE8` / `#3A5446`) | Secondary, decorative |
| `amber` (+soft/ink) | `#C98A2E` (`#FAEFD9` / `#774D0D`) | Current deal, leader, Active badge |
| `success` (+soft) | `#2F7347` (`#E2EFE5`) | Completed, zero scores |
| `warning` | `#8A590B` | Soft warnings |
| `danger` (+soft/border) | `#A63F2E` (`#F8E4E0` / `#DDA79D`) | Errors, destructive |
| `info` (+soft) | `#2F6386` (`#E1EBF3`) | Info notices |

Player avatar tints (assigned by stable hash; the initial is always shown): `#DCEAE6/#1E5E57`, `#F5E4C4/#774D0D`, `#E3E9DA/#45582E`, `#DEE6F0/#2D5070`, `#EDE6F0/#5B4466`, `#F3E1DC/#86402F`.

### Typography (Inter, weights 400 and 500)

| Token | Size/line | Notes |
|---|---|---|
| score-display | 40/44, 500, −2% | Winner total, tablet standings |
| page-title | 24/32 (mobile 22/28), 500 | |
| section-title | 18/26, 500 | |
| card-title | 16/24, 500 | |
| body | 15/22, 400 | Inputs use 16px to prevent iOS zoom |
| small | 13/18 | |
| caption | 12/16, 500, +4%, uppercase | |
| score / score-lg | 20/28, 28/32, 500 | Always `font-variant-numeric: tabular-nums`, right-aligned in columns |

### Spacing, radius, elevation, motion

- Spacing: 4px base (4, 8, 12, 16, 20, 24, 32, 48, 64). Tailwind's default scale already matches.
- Radius: sm 6, md 8 (controls), lg 12 (cards), xl 16 (dialogs).
- Elevation: cards use borders only. `shadow-1` = `0 1px 2px rgba(29,35,32,.06)`; `shadow-2` = `0 8px 24px rgba(29,35,32,.12)` for menus, toasts, dialogs and sheets.
- Motion: 120ms (hover/press), 200ms (sheets, toasts, collapse), `cubic-bezier(.2,0,0,1)`, disabled under `prefers-reduced-motion`.

### Breakpoints (Tailwind defaults)

`base <768` mobile (390 target) · `md 768–1023` tablet · `lg ≥1024` · `xl ≥1280` (content max 1200px).

### Tailwind config

```ts
// tailwind.config.ts → theme.extend
colors: {
  bg: '#F6F4EF', surface: '#FFFFFF', 'surface-muted': '#EFEBE3',
  border: '#E2DCD1', 'border-strong': '#C9C1B3',
  ink: { DEFAULT: '#1D2320', muted: '#535A56', subtle: '#686E6A' },
  primary: { DEFAULT: '#1E5E57', hover: '#174B45', active: '#113934', soft: '#E1ECE9' },
  sage: { DEFAULT: '#7F9B8B', soft: '#E6EDE8', ink: '#3A5446' },
  amber: { DEFAULT: '#C98A2E', soft: '#FAEFD9', ink: '#774D0D' },
  success: { DEFAULT: '#2F7347', soft: '#E2EFE5' },
  warning: { DEFAULT: '#8A590B', soft: '#FAEFD9' },
  danger: { DEFAULT: '#A63F2E', soft: '#F8E4E0', border: '#DDA79D' },
  info: { DEFAULT: '#2F6386', soft: '#E1EBF3' },
},
borderRadius: { sm: '6px', md: '8px', lg: '12px', xl: '16px' },
fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
boxShadow: { 1: '0 1px 2px rgba(29,35,32,.06)', 2: '0 8px 24px rgba(29,35,32,.12)' },
```

### Status badges

Active (amber) · Completed (green) · Setup (neutral) · Paused (info, future) · Sync error (red). Every badge has a dot plus a text label, so status is never shown by color alone.

## 5. Score entry: the core screen

### Two directions explored

- **A: Compact rows.** One row per player: avatar, name, last-saved total and rank, score input, and a "→ new total" preview. All four players and Save fit on 390×844 with no scroll.
- **B: Spacious cards.** One card per player with a full-width input and a "0" shortcut; standings shown as a chip strip. Only about 3 cards are visible, so it needs a scroll and a review step.

| Criterion | Edge |
|---|---|
| Speed | A (no scroll, no review step) |
| Mobile at 390px | A |
| Error prevention | A (live new-total preview, missing-score count) |
| Cognitive load | A (one scan line per player, like paper) |
| Standings visibility | Even |
| Tablet on the table | A (scales to a two-pane layout) |
| Accessibility | Even |
| Implementation | A (one FormArray, reused for Edit Deal) |

**Decision: ship A**, taking two ideas from B: the new-total preview, and larger targets on tablet (64px inputs). The "0" shortcut was dropped because it adds a target per row and typing 0 is already one keystroke.

### Behavior spec

- Input: `type="text" inputmode="numeric" pattern="[0-9]*" enterkeyhint="next" autocomplete="off"`. Not `type="number"` (spinners, wheel bugs, accepts "e").
- Select-all on focus. **No auto-advance.** The keyboard's Next button moves focus only when pressed. Enter on the last row moves focus to Save and does not submit.
- Rows stay in seat order. Totals and ranks in rows reflect the **last saved** deal; standings never re-rank while typing.
- Format errors (negative, decimal, non-digit) show inline while typing. Missing scores are flagged only after a Save attempt. Focus goes to the first invalid field. Values are always kept.
- Sticky footer: "N of M scores entered · Deal sum X" + **Save Deal N**. No confirm dialog: the visible summary is the review.
- Saving: inputs read-only, button shows "Saving…", double submit prevented.
- Saved: inputs clear, progress advances, toast "Deal N saved" with **Edit** for 6s, LiveAnnouncer reads "Deal 5 saved. Amali leads with 41."
- Soft warnings (non-blocking): no player has 0; a value far above the player's usual range.
- Drafts autosave to `localStorage` key `porter:draft:{gameId}:{dealNumber}` and restore with a notice. They are discarded when the deal is saved, including from another device.
- After Deal 13 saves: status becomes Completed and the one-time completion view is shown; later visits open Results.

### Edit a previous deal

Same `ScoreEntryForm` in edit mode. Changed rows show "Was 9 · +10" in text plus amber. An **effect panel** previews total and rank changes before saving (it replaces a confirm dialog). The save button reads "Save correction". The unsaved-changes guard asks "Discard changes to Deal 3?", with focus on "Keep editing".

## 6. Component inventory

**Shared UI (`shared/ui`)**: AppShell, PageHeader, Breadcrumbs, Button, IconButton, Card, Badge, Avatar, AvatarGroup, Input, NumericInput, SearchInput, Select, Checkbox, Radio, Toggle, SegmentedControl, Tabs, Dialog, ConfirmDialog, Sheet, Menu, Toast (+ LiveAnnouncer), Tooltip, Skeleton, EmptyState, ErrorState, Pagination, DataTable.

**Game domain (`features/game`)**: GameCard, GameHeader, DealProgress (13-segment bar), DealTimeline (13 numbered cells), ScoreEntryForm, ScoreEntryRow, ScoreInput, StandingsList (`size: sm|md|lg`), DealHistoryTable / DealHistoryCard (switch by breakpoint), WinnerSection (joint winners), ScoreBreakdown (per deal / running), PlayerSelector, PlayerRow, StatTile, FinishBar.

**Page-specific (keep local until a second page needs them)**: NewUserWelcome, ActiveGameHero, ActivityFeed, EditImpactPanel, CompletionSummary, FinalScoreChart, PasswordStrength.

Library guidance: Tailwind for styling; Angular CDK for Dialog, Overlay, FocusTrap, LiveAnnouncer, and DragDrop (seat order). Angular Material only for Menu and Snackbar, if wanted.

### Active game composition

```
GamePlayPage (/games/:id/play, resolver → GameStateDto)
├─ GameHeader
├─ DealProgress
├─ SegmentedControl (Score | Standings | History)
├─ ScoreEntryForm (FormGroup { scores: FormArray<FormControl<string>> })
│  ├─ ScoreEntryRow × n → ScoreInput
│  └─ FormSummary
├─ StandingsList
├─ DealHistoryCard[] | DealHistoryTable
└─ SaveBar (sticky)
GameStore (signals): game, deals, standings, version, saving, error; saveDeal(); draft effect()
```

## 7. Responsive behavior

| Page | <768 | 768–1023 | ≥1024 |
|---|---|---|---|
| Active game | Rows, tabs, sticky save | Two panes: entry and large standings (40px totals) | Two panes plus history below |
| Dashboard | Stacked; activity hidden | Two columns | Main column plus aside |
| Games | Cards | Cards, 2 columns | Table with pagination |
| Deal history | Deal cards | Table, deals as rows | Table, players as rows (13 deal columns) |
| Add player | Bottom sheet | Dialog | Dialog |

## 8. Interaction states (summary)

| Area | States designed |
|---|---|
| Auth | normal, field validation, loading, failed login (generic), registration success, reset sent, expired link |
| Dashboard | new user, returning with active game, no active game, per-section loading/error |
| Create game | empty, selecting, inline add, too few, max reached, duplicate name, loading, failure (idempotent retry) |
| Active game | loading skeleton, empty, editing, valid, invalid, saving, saved, offline, network error, 409 conflict, draft recovery, soft warnings |
| Deal history | normal, no completed deals, loading, error |
| Edit deal | editing, unsaved changes guard, validation, saving, saved, network failure, conflict |
| Completion | completed, joint winners, loading, error |
| General | 401 session expired (silent refresh first), 404 not found or not owned, deleted game, empty search, no games, no players, no statistics, destructive confirm |

Rule: **an error never discards what the user typed.**

## 9. API assumptions (ASP.NET Core Web API)

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/register \| login \| refresh \| logout` | JWT access token (≈15 min) + httpOnly refresh cookie |
| `POST /api/auth/forgot-password \| reset-password` | Forgot always returns 202 (no account enumeration) |
| `GET /api/dashboard` | Active game, recent games, my stats, activity |
| `GET /api/games?status=&q=&sort=&page=` | Paged list |
| `POST /api/games` | `{ id, name, playerIds[], start }`; client-generated `id` makes it idempotent |
| `GET /api/games/{id}` | `GameStateDto`: players (seat order), deals, totals, standings, `version` |
| `POST /api/games/{id}/start` | Draft → Active |
| `PUT /api/games/{id}/deals/{n}` | **Save or correct a deal**: `{ scores: [{ playerId, score }], expectedVersion }` → `GameStateDto` |
| `DELETE /api/games/{id}` | Soft delete |
| `GET/POST/PATCH/DELETE /api/players` | Delete returns 409 if the player has games |
| `GET /api/players/{id}/stats` | Played, wins, avg, best, finishes, recent |
| `GET /api/statistics/me` | Via the linked "This is me" player |

- `PUT …/deals/{n}`: if `n == completed + 1`, the deal is created; if `n ≤ completed`, it is replaced; anything else returns 400. Saving `n == 13` completes the game in the same transaction. The server recalculates and returns full state, so the client never ranks.
- Errors: RFC 7807 `ValidationProblemDetails`, keys like `scores[3].score` mapped onto the FormArray. **409** on `expectedVersion` mismatch (Postgres `xmin` as concurrency token). **404** for games the caller doesn't own.

Competition ranking (domain service):

```csharp
public static IReadOnlyList<Standing> Rank(IReadOnlyCollection<PlayerTotal> totals) =>
    totals.Select(t => new Standing(t.PlayerId, t.Name, t.Total,
                Rank: 1 + totals.Count(o => o.Total < t.Total)))
          .OrderBy(s => s.Rank).ThenBy(s => s.Name)
          .ToList(); // 20, 20, 25, 30 → 1, 1, 3, 4
```

### Data model (EF Core + PostgreSQL)

- `User` (Id, Name, Email, PasswordHash, MePlayerId?)
- `Player` (Id, OwnerUserId, Name, AvatarColor, CreatedAt). Name is unique per owner, case-insensitive.
- `Game` (Id, OwnerUserId, Name, Status, CreatedAt, StartedAt, CompletedAt, DeletedAt, xmin)
- `GamePlayer` (GameId, PlayerId, Seat 1–4), with unique (GameId, Seat) and (GameId, PlayerId)
- `Deal` (Id, GameId, Number 1–13, CreatedAt, UpdatedAt, UpdatedBy), with unique (GameId, Number)
- `DealScore` (DealId, PlayerId, Score ≥ 0)
- Future: `DealScoreAudit` (who, player, deal, old, new, at), written in the same transaction; `Game.ShareToken` for read-only links; SignalR group per game id.

### Validation (client mirrors server)

| Field | Rule |
|---|---|
| Score | required, integer, ≥ 0 (no upper rule; soft warning only) |
| Deal | exactly one score per game player; n ≤ completed + 1; n ≤ 13 |
| Game | name 1–60 chars (defaults to "Porter · {date}"); 2–4 distinct players; players locked after start |
| Player | name 1–40 chars; unique per owner (case-insensitive) |
| Account | valid email; password ≥ 8 chars with a letter and a number |

## 10. Accessibility

- Landmarks (`header`, `nav`, `main`, `aside`), one `h1` per page, logical heading order.
- Every input has a visible label or a specific `aria-label` ("Kasun, Deal 5 score. Total so far 35").
- Errors linked with `aria-describedby` and `aria-invalid`; summary uses `role="alert"`.
- Polite live announcements for saves, search result counts, and standings changes.
- Visible 2px focus ring with offset; never removed.
- Touch targets ≥ 44px; score inputs 52px (64px tablet).
- Rank is always a number and status always a word; color only reinforces. Text contrast ≥ 4.5:1.
- Dialogs and sheets trap focus, close on Esc, and return focus to the trigger.
- `prefers-reduced-motion` respected; layout survives 200% text zoom.

## 11. Sample data (used consistently in designs)

**Friday Night Porter**: active, Deal 5 of 13; seats Kasun, Nimal, Amali, Tharindu.

| Deal | Kasun | Nimal | Amali | Tharindu |
|---|---:|---:|---:|---:|
| 1 | 0 | 12 | 5 | 18 |
| 2 | 18 | 0 | 7 | 25 |
| 3 | 5 | 9 | 0 | 12 |
| 4 | 12 | 33 | 14 | 0 |
| **Total** | **35** (2nd) | **54** (3rd) | **26** (1st) | **55** (4th) |

**Poya Night Porter** (15 Nov, completed): Kasun 93 (1st), Amali 99 (2nd), Nimal 116 (3rd), Tharindu 129 (4th).

**Avurudu Porter** (2 players): Kasun & Nimal tied on 101, both rank 1.
