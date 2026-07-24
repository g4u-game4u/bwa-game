# Architectural Review — `bwa-game`

**Date:** 2026-07-24
**Scope:** Architecture-level review (Phase 1 of 2). Line-by-line review follows in Phase 2.
**Reviewed at commit:** `3e44767` (branch `master`)
**Codebase:** Angular 17 (NgModule-based) + Supabase + Funifier, 508 TS files, ~130k LOC

> **Report-only.** No behaviour was changed. Findings cite `file:line` for independent verification.
> A companion review exists in `g4u-player-mvp-web` — the two repositories share a common ancestor
> and section 1 below is the shared concern.

---

## Executive summary

`bwa-game` is the largest front-end in the portfolio and, in most respects, the **more mature** of
the two Angular applications. It has real CI, hardened token decoding, route guards, and defensive
null handling that its sibling lacks. Several of its files read like the result of genuine
production debugging.

The problem is not quality — it is **topology**. `bwa-game` and `g4u-player-mvp-web` are the same
application forked into two repositories, and the fork has drifted across 103 files including the
entire authentication layer. Fixes made here have not reached the sibling. That is the finding
that dominates this review.

| Severity | Count | Summary |
|---|---|---|
| 🔴 Critical | 1 | Fork drift across the auth layer (shared with `g4u-player-mvp-web`) |
| 🟠 High | 3 | Latent service-role key path, god components, eager-loaded bundle |
| 🟡 Medium | 6 | Client-side role logic, subscription management, token storage, dead refactor, duplicate date libs, `any` usage |
| 🟢 Low | 3 | `console.log` volume, TODO backlog, whitelist substring matching |
| ✅ Commendable | 4 | CI pipeline, defensive token decode, OnPush adoption, redirect-loop guard |

---

## 🔴 CRITICAL-1 — Two repositories, one application, divergent authentication

### The measurement

I hashed every file in both `src/` trees:

| | Count |
|---|---|
| Files in `bwa-game/src` | 769 |
| Files in `g4u-player-mvp-web/src` | 434 |
| Paths present in **both** | 413 |
| Of those, **byte-identical** | 310 |
| Of those, **diverged** | **103** |

`bwa-game` is a superset fork. 310 files are still literally identical, which tells us the fork was
never intended as a permanent divergence — it was a copy that was meant to stay in step and didn't.

### Why it is Critical rather than a maintenance annoyance

The diverged set is not cosmetic. It includes the entire session and transport security layer:

```
src/app/providers/auth/auth.provider.ts               bwa 102 LOC  vs  player  46 LOC
src/app/providers/auth.interceptor.ts                 bwa 251 LOC  vs  player 127 LOC
src/app/providers/api.provider.ts                     bwa  70 LOC  vs  player 133 LOC
src/app/providers/sessao/sessao.provider.ts           bwa 258 LOC  vs  player 115 LOC
src/app/providers/sessao/permissao-acesso.provider.ts bwa  63 LOC  vs  player  58 LOC
```

plus 13 diverged services (`pontos-avulsos`, `mes-atual`, `mes-anterior`, `campaign`, `features`,
`notification`, `recompensas`, `season-dates`, `system-params`, `team-stats-cache`, `temporada`,
`toast`, `grafico`).

I compared the auth files line by line. **Every material difference is a fix that exists here and
is missing in the sibling.** Four concrete examples:

**1. Token decoding — `auth.interceptor.ts:203-219` (this repo) is hardened; the sibling is not.**

Here:

```ts
private isTokenExpired(token: string): boolean {
    try {
        const claims = jwtDecode(token);
        if (claims.exp) { ... }
        return false;
    } catch (error) {
        // Funifier tokens use GZIP compression and can't be decoded with jwtDecode
        return false;
    }
}
```

In `g4u-player-mvp-web` the same method has **no `try`/`catch` and a non-null assertion**:

```ts
private isTokenExpired(token: string) {
    const claims = jwtDecode(token)          // throws on a non-JWT
    const expDate = moment(claims.exp! * 1000);
    ...
}
```

An HTTP interceptor that throws breaks *every* outbound request. This repo learned that lesson —
the comment about Funifier's compressed tokens is the evidence — and the sibling never received it.

**2. Stale bearer tokens on password-reset flows — `auth.interceptor.ts:33-37`, only here.**

```ts
const isPublicAuthPath = (url: string) =>
    /\/auth\/(login|refresh|token|change-password-request|change-password-recovery|change-password)(\/|$|\?)/.test(url);
```

Used at line 133 to deliberately *not* attach the session bearer to reset endpoints. The sibling
attaches whatever token it has, meaning an expired token can accompany a reset request. Note this
implementation also correctly anchors on path separators rather than doing a substring match — see
LOW-3 for where the same file doesn't.

**3. `client_id` header scoping — `auth.interceptor.ts:60-75`, only here.**

`isGame4uBackendRequestUrl()` compares parsed origins so `client_id` is attached only to
first-party API calls. The sibling attaches `client_id: environment.client_id!` unconditionally,
leaking the tenant identifier to every external host it talks to.

**4. Redirect-loop protection — `auth.interceptor.ts:174-183`, only here.**

```ts
const currentUrl = this.router.url;
if (!currentUrl.includes('/login')) { ...navigate(['/login'])... }
return throwError(() => "Session expired, please log in");
```

The sibling navigates unconditionally, so a 401 while already on `/login` re-enters the guard.

There is also a **null-safety fix** present here and absent there: `sessao.provider.ts:131-135`
correctly `return`s after `logout()` when `user` is falsy; the sibling falls through and
dereferences `user.roles`.

### The structural risk

The direction of drift is consistent — this repo is ahead on every one of these. So the live risk
is concentrated in `g4u-player-mvp-web`, but the *architectural* risk belongs to both: there is no
mechanism that would cause the next auth fix to reach both applications. A future
vulnerability patched here will silently not apply there.

### Recommended direction

Pick one of three, in descending order of preference:

1. **Extract the shared layer into a versioned package.** The 310 byte-identical files are already
   a de-facto shared library. Publishing `@g4u/angular-core` (providers, interceptor, session,
   models, shared UI) to a private registry or a git dependency makes drift impossible by
   construction. This is the correct long-term answer.
2. **Single repository, multiple build targets.** An Nx/Angular workspace with two `apps/` and one
   `libs/core`. Same guarantee, one repo, at the cost of a migration.
3. **If neither is affordable now:** at minimum, reconcile the five auth files immediately by
   porting this repo's versions into the sibling, and add a CI job to each repo that fails when the
   shared file hashes diverge. That is a stopgap, not a fix, but it converts a silent risk into a
   loud one.

Whichever route: **do not resolve this by copying files again.** That is what produced the current
state.

---

## 🟠 HIGH-1 — A code path exists to hand a service-role Supabase key to the browser

`src/app/services/game4u-supabase-fallback.service.ts:68-74`:

```ts
private getAuthKey(): string {
    const role = (environment.supabaseServiceRoleKey || '').trim();
    if (role) {
        return role;                      // ← prefers service_role
    }
    return (environment.supabaseAnonKey || '').trim();
}
```

The return value is passed straight into a browser-side client at line 100:

```ts
this.client = createClient(url, key, { db: { schema } });
```

A Supabase `service_role` key bypasses Row Level Security completely. Any key reaching the browser
is readable by every visitor via devtools or the bundle.

**Currently this does not fire.** I traced the whole chain: `environment.supabaseServiceRoleKey`
reads `process.env['supabase_service_role_key']` (`src/environments/environment.ts:58`,
`.prod.ts:35`, `.homol.ts:36`), and `custom-webpack.config.ts` — which is what actually inlines
`process.env` into the bundle via `DefinePlugin` — **does not include that key** in either of its
two definition blocks. So it resolves to `''` and the anon key is used. Good outcome, by accident
of the webpack config rather than by design.

The risk is the gap between the two files. All three `environment.*.ts` files actively advertise
the variable, so the natural response to "the fallback service can't read data" is to add
`supabase_service_role_key` to the webpack config or Vercel env — at which point every visitor
receives an RLS-bypass key. The safeguard is one line in a file nobody associates with security.

By contrast, `src/app/services/supabase-companies.service.ts:193-195` gets this right —
`getSupabaseAnonKey()` returns the anon key only. So the pattern is already inconsistent within
the repo, which is what makes the dangerous variant look legitimate.

**Recommendation:** delete `supabaseServiceRoleKey` from all three `environment.*.ts` files and
remove the `role` branch from `getAuthKey()`. If the fallback service genuinely needs elevated
reads, route them through `g4u-mvp-api`. Removing the capability is the fix; documenting it is not.

---

## 🟠 HIGH-2 — God components concentrate the application's risk

| File | LOC |
|---|---|
| `pages/dashboard/team-management-dashboard/team-management-dashboard.component.ts` | 6,630 |
| `modals/modal-gerenciar-pontos-avulsos/modal-gerenciar-pontos-avulsos.component.ts` | 5,147 |
| `services/action-log.service.ts` | 4,662 |
| `services/pontos-avulsos.service.ts` | 2,305 |
| `services/game4u-game-mapper.ts` | 2,266 |
| `pages/dashboard/gamification-dashboard/gamification-dashboard.component.ts` | 2,235 |
| `services/game4u-api.service.ts` | 1,772 |

A 6,630-line component cannot be reasoned about as a unit, cannot be meaningfully unit-tested, and
cannot be worked on by two people at once without conflicts. `team-management-dashboard` and
`modal-gerenciar-pontos-avulsos` together are ~11,800 LOC — 9% of the repository in two files, both
sitting on the points/rewards path where correctness matters most.

Note that these are also the files most likely to have diverged from the sibling (CRITICAL-1), so
size and drift compound: the two largest files are the two hardest to reconcile.

**Recommendation:** treat these as the primary refactor targets, extracting presentational
sub-components and moving data orchestration into services. `modal-gerenciar-pontos-avulsos`
already has a `services/` and `components/` subdirectory, so the seams have been identified —
see MEDIUM-4 for why that effort stalled.

---

## 🟠 HIGH-3 — Effectively no lazy loading: 114 components in the initial bundle

`src/app/app-routing.module.ts` declares only **two** `loadChildren` boundaries (`login` and
`main`). Everything reachable from `main` — 114 components across 79 NgModules — is inside a
single lazy chunk, which for an authenticated user means one enormous download before first paint.

Combined with `moment` (see MEDIUM-5), `chart.js`, `lottie-web`, `panzoom`, `bootstrap`,
`@angular/material` **and** `@ng-bootstrap/ng-bootstrap`, and `xlsx`, the initial payload is
almost certainly the dominant contributor to time-to-interactive.

**Recommendation:** introduce route-level `loadChildren` per dashboard area (the
`pages/dashboard/*` directories are natural boundaries), and lazy-import the heavy leaf libraries
(`xlsx` and `lottie-web` in particular are only needed on specific interactions).

---

## 🟡 Medium findings

### MEDIUM-1 — Client-side role checks use substring matching and self-grant a role

`src/app/providers/sessao/sessao.provider.ts:217-220`:

```ts
private verifyUserProfile(...rolesType: ROLES_LIST[]) {
    return this._usuario?.roles?.some((role) =>
        role && typeof role === 'string' && rolesType.some((roleType) => role.includes(roleType))
    );
}
```

`role.includes(roleType)` is a substring test, so any future role whose name *contains* a
privileged role name matches it (`ACCESS_ADMIN_PANEL_READONLY` would satisfy `isAdmin()`). Use
strict equality against a canonical set — `g4u-mvp-api` already has exactly this in
`src/access/utils/canonical-user-role.ts`, and mirroring that helper client-side would fix both
this and the naming-history problem.

Separately, line 168-170 unconditionally grants every authenticated user
`ROLES_LIST.ACCESS_PLAYER_PANEL`. Since the API enforces authorisation server-side this is not a
privilege escalation, but it means the client's role model does not reflect the server's — a
reliable source of "the UI showed me a button that 403s" bugs.

### MEDIUM-2 — 365 manual subscriptions against 110 teardown usages

`grep` counts 365 `.subscribe(` calls and 110 references to `takeUntil` / `takeUntilDestroyed` /
`DestroyRef`. Even allowing generously for `async` pipe usage and self-completing HTTP observables,
the gap indicates a substantial number of unmanaged subscriptions. In an app where the whole
authenticated surface lives in one long-lived chunk (HIGH-3), leaked subscriptions accumulate for
the entire session and will manifest as gradual slowdown plus duplicated HTTP calls on
re-navigation.

**Recommendation:** standardise on `takeUntilDestroyed(this.destroyRef)` and add an ESLint rule
(`rxjs-angular/prefer-takeuntil`) to enforce it. Prioritise the god components from HIGH-2.

### MEDIUM-3 — Session tokens in `sessionStorage`, base64-wrapped

`sessao.provider.ts:225` stores the full login response (access **and** refresh token) as
`utf8ToBase64(JSON.stringify(loginResponse))` in `sessionStorage`. Base64 is an encoding, not
encryption — anything with script execution in the page reads it trivially. The wrapping mainly
risks giving a reader the impression the value is protected.

`sessionStorage` is a reasonable pragmatic choice for an SPA (it beats `localStorage`, and
scoping to the tab limits persistence), so I'd rate this Medium rather than High. Worth an explicit
decision record either way, and worth noting the refresh token is the more sensitive of the two
values being stored.

Credit where due: this repo's `utf8ToBase64` helper fixes a real bug — the sibling's plain `btoa`
throws on any non-Latin1 character in the payload.

### MEDIUM-4 — An abandoned refactor is shipping as dead code, in duplicate

Both `modal-gerenciar-pontos-avulsos.component.ts` (5,147 LOC) **and**
`modal-gerenciar-pontos-avulsos-refatorado.component.ts` (742 LOC) exist, alongside
`-refatorado.module.ts`, `-refatorado.component.html`, and two planning documents
(`REFATORACAO.md`, `refatoracao-proposta.md`).

I searched the entire `src/` tree: **the `Refatorado` component has zero references.** It is not
routed, imported, or instantiated. The same four files, also unreferenced, exist in
`g4u-player-mvp-web`. So the portfolio carries four copies of this modal's logic — two live, two
dead.

This is worth naming explicitly because it is evidence about process, not just code: someone
correctly identified HIGH-2, planned the fix, built a third of it, and stopped — and the fork then
duplicated the half-finished state. Either finish it or delete it; leaving it invites a future
reader to assume the refactor landed.

### MEDIUM-5 — Two date libraries, one of them deprecated

`moment` (8 importing files) and `dayjs` (5 importing files) are both production dependencies.
Moment has been in maintenance-only mode since 2020 and is the larger of the two by a wide margin
in bundle terms. Pick one — `dayjs`, given it's already present — and migrate.

### MEDIUM-6 — 431 `: any` annotations

Concentrated in the API-boundary code (`game4u-api.model.ts` is 1,859 LOC of models, yet `any`
still appears widely). Since the sibling app talks to the same `g4u-mvp-api`, response types are
another candidate for the shared package proposed in CRITICAL-1 — generating them once from the
API's Swagger document would remove most of these and keep both apps honest.

---

## 🟢 Low / nits

- **479 `console.log`/`console.debug` calls in `src/`.** Several are on auth paths
  (`auth.interceptor.ts:214` logs token-shape information; `sessao.provider.ts:97` logs
  `🔐 Clearing invalid token due to error`). Strip via build config or a logger abstraction with
  level gating; avoid logging anything token-adjacent in production.
- **33 `TODO`/`FIXME`/`HACK` markers** with no linked issues. Convert to tracked tickets or delete.
- **`auth.interceptor.ts:22-31` — `WHITELISTED_URLS` is matched with `requestUrl.includes(item)`.**
  The list contains the bare string `'/campaign'`, so any URL containing that substring anywhere
  (including in a query parameter) is treated as exempt from the session requirement. The same file
  already demonstrates the correct approach in `isPublicAuthPath` (anchored regex) — apply it here
  too.

---

## ✅ What is done well

1. **This is the only Angular repo in the portfolio with CI**, and it is a real pipeline:
   `.github/workflows/ci-cd.yml` runs unit tests headless with coverage (`--watch=false
   --browsers=ChromeHeadless --code-coverage`), uploads to Codecov, builds a Docker image, and runs
   smoke tests — plus a separate `security.yml`. 150 spec files back it. `g4u-player-mvp-web` has
   no CI at all. Whatever process produced this should be replicated, not diluted.
2. **Defensive token handling.** The `try`/`catch` in `isTokenExpired` with an explanatory comment
   about Funifier's GZIP-compressed tokens is exactly the right way to record a hard-won lesson in
   code.
3. **35 components use `ChangeDetectionStrategy.OnPush`** (vs 1 in the sibling), and 3 have been
   migrated to standalone. There is a real, if partial, modernisation effort here.
4. **Genuine hardening in the interceptor** — origin-compared `client_id` scoping, anchored
   public-path regex, redirect-loop prevention, and a shared refresh chain (`share()`) that
   prevents a token-refresh stampede when several requests 401 at once.

---

## Suggested sequencing

| # | Action | Finding | Notes |
|---|---|---|---|
| 1 | Remove `supabaseServiceRoleKey` from environments + `getAuthKey()` | HIGH-1 | Hours. Closes a latent critical before someone "fixes" the webpack config |
| 2 | Port the five auth files to `g4u-player-mvp-web`; add CI there | CRITICAL-1 | Stops the active bleeding in the sibling |
| 3 | Delete or finish the `-refatorado` dead code | MEDIUM-4 | Cheap, removes ambiguity |
| 4 | Extract `@g4u/angular-core` shared package | CRITICAL-1 | The actual fix. Plan properly |
| 5 | Route-level lazy loading per dashboard area | HIGH-3 | Measurable user-facing win |
| 6 | Decompose `team-management-dashboard` + the pontos modal | HIGH-2 | Long-lived; do incrementally, after #4 so it's done once |
| 7 | ESLint rule for subscription teardown; strip `console.log` | MED-2, LOW | Mechanical |

Step 6 after step 4 matters: refactoring the god components *before* consolidating the fork means
doing the work twice.

---

## Method and limitations

- Static review of `master` at `3e44767`. **No code was executed** — no `npm install`, build, or
  test run — so this review makes no claim about current compile or test-suite health. Happy to run
  `npm ci && npm run build && npm test` and report separately.
- Fork comparison was done by SHA-1 hashing all 769 + 434 `src/` files and diffing path sets, then
  reading the diverged auth files in full. Counts are exact; the characterisation of *which* fork
  is ahead is based on the five auth files, not all 103.
- Subscription-leak and `console.log` figures are `grep` counts and therefore upper bounds; they
  indicate where to look rather than confirmed defects.
- Phase 2 (line-by-line) will target the points/rewards path — `pontos-avulsos.service.ts`,
  `action-log.service.ts`, and the two god components.
