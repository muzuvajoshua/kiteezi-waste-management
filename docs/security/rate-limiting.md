# Rate limiting

**Issue:** KWM-054
**Guard:** [`src/shared/presentation/rate-limit.ts`](../../src/shared/presentation/rate-limit.ts)
**Store:** [`drizzle-rate-limiter.adapter.ts`](../../src/shared/infrastructure/rate-limit/drizzle-rate-limiter.adapter.ts)

---

## 1. What is limited

| Action | Buckets | Limit |
|---|---|---|
| `signInWithEmailPassword` | per email, per IP | 5 / 5 min · 20 / 5 min |
| `registerWithEmailPassword` | per IP | 5 / hour |
| `createReport` | per user | 30 / min |
| `updateTaskStatus`, `updateReportStatus` | per user | 30 / min |
| `redeemReward`, `saveReward` | per user | 30 / min |
| `createCollectedWaste`, `saveCollectedWaste` | per user | 30 / min |
| `markNotificationAsRead` | per user | 30 / min |

Read-only actions are **not** limited. They are cheap, they cannot mint points or create rows, and limiting them would mean a page that renders several lists could lock itself out.

## 2. Why sign-in is limited per email, not only per IP

IP addresses are cheap to rotate; a botnet has thousands. The **email is the thing an attacker cannot change while still attacking one account**, so it carries the tighter limit.

The per-IP limit is the looser backstop for credential stuffing — many accounts, one source, so the per-email bucket never trips. It is deliberately not tight enough to lock out a shared office NAT.

Registration is keyed on **IP only**, never the submitted email: keying on the address would let an attacker mint a fresh budget for every address they invent, which is the opposite of a limit.

## 3. Why Postgres, not Redis

KWM-054 originally proposed Upstash. Postgres was chosen because:

- Neon is already provisioned — **no new vendor, no new credential, no free-tier clock**;
- it is behind the `RateLimiter` port, so moving to Upstash later is one adapter and no change above infrastructure.

The cost is one round trip per limited call, which at this application's scale is not the constraint.

**Process memory was never an option in production.** A serverless deployment runs many instances, so a per-instance counter gives an attacker `limit` attempts *per instance* — and making more concurrent requests spawns more instances, so the bound rises with the attack. `InMemoryRateLimiter` is used only in tests.

## 4. Known limitations

**Fixed window, not sliding.** An attacker timing requests around a window boundary can land up to **2× the limit** in quick succession — the tail of one window plus the head of the next. Accepted deliberately: a sliding window needs either a sorted set of timestamps per key or two counters read together, and this is a brute-force *slowdown*, not an admission gate. The limits are set low enough that twice them is still safe.

**IP detection trusts proxy headers.** `x-real-ip` / `x-forwarded-for` are only meaningful because Vercel sets them. **If the app is ever served on a directly reachable port, every IP-keyed limit becomes trivially bypassable** by sending your own header. This is why the sign-in limit does not rely on IP alone.

**No cleanup job.** `purgeExpired()` exists on the adapter but **nothing calls it**. Rows accumulate at (distinct keys × windows). Small and slow-growing, but unbounded — it needs KWM-058 (background jobs) or a scheduled sweep before running unattended for long.

**Invalid input consumes no budget.** Limits run after validation, so a request that fails Zod is not counted. That path costs only a parse — never a scrypt hash — so it buys an attacker nothing.

## 5. Adding a limit to a new action

```ts
return actionResult(async () => {
  const me = await requireUser();

  await enforceRateLimit(rateLimiter, [
    { scope: 'myAction', id: me.userId, policy: RATE_LIMITS.mutationPerUser },
  ]);

  // …
});
```

`enforceRateLimit` throws `RateLimitedError`, which `actionResult` already maps onto a `RATE_LIMITED` AppError — so a limited action reports exactly like every other failure and the UI needs no special case.

Two behaviours worth knowing before you change the guard:

- **Every bucket is consumed even after one has refused.** Short-circuiting would let an attacker keep a coarse bucket untouched by deliberately tripping a narrower one first, so the coarse limit would never accumulate.
- **A `null` identifier skips its bucket** rather than collapsing into a shared `unknown` one, which would let a single header-less caller exhaust the budget for everyone else.

## 6. Testing

Action tests substitute the shared composition root for an in-memory limiter, the same seam the auth tests use — see `action-auth.test-support.ts`. The harness's `reset()` clears counters between cases; without it a suite whose cases all act as the same user would exhaust a real budget partway through and fail for the wrong reason.

Wiring is pinned by `*.rate-limit.test.ts` files, not just by the limiter's own tests. That distinction matters: **deleting `enforceRateLimit` from an action leaves the limiter's tests entirely green.** Verified by mutation —

| Sabotage | Result |
|---|---|
| remove the guard from `createReport` | 3 fail |
| remove the sign-in per-email bucket | 4 fail |
| remove both sign-in buckets | 5 fail |
| remove the registration bucket | 2 fail |
| short-circuit on first refusal | 1 fail |
| collapse a `null` id into a shared bucket | 1 fail |
| drop key normalisation (case rotation) | 1 fail |
