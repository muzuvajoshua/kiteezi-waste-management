# Sessions and revocation

**Issue:** KWM-079 (#109)
**Record:** [`sessions` table](../../drizzle/0009_add_sessions.sql) · [`drizzle-session-repository.adapter.ts`](../../src/modules/auth/infrastructure/drizzle-session-repository.adapter.ts)
**Check:** [`get-current-user.usecase.ts`](../../src/modules/auth/application/get-current-user.usecase.ts)

---

## 1. The gap this closes

The session cookie is a **stateless HS256 JWT valid for seven days**. Logout cleared the cookie — and nothing else.

Clearing a cookie removes *the browser's copy*. A copy taken beforehand — XSS, a shared machine, a synced browser profile, a proxy log — kept working for the remainder of those seven days. "Log out" gave the user no protection they would reasonably assume they had.

There was also no way to end a session for any other reason: a compromised account, an offboarded operator, a password reset. (Roles were always read fresh per request, so *authorisation* changes took effect immediately — it was *identity* that could not be withdrawn.)

## 2. How it works now

Every session has a server-side record, and the record — not the token — is the authority on whether it is still good.

```
sign-in        → token carries a `jti`; a `sessions` row is written first,
                 then the cookie is set
every request  → verify token → look up the record → reject if absent,
                 revoked, or expired → then resolve the user
logout         → revoke THIS session, then clear the cookie
password reset → revoke EVERY session for that user
```

Three properties, each deliberate:

**The record is written before the cookie.** Otherwise there is a window in which a browser holds a token the server does not know about, and that token would be rejected — a sign-in that silently fails.

**A token with no record is refused.** It might be forged against a leaked `SESSION_SECRET`, or minted before this existed. Either way it cannot be revoked, so accepting it would grant an untrackable session that outlives every logout. Refusing costs one re-authentication.

**Logout revokes only the current session.** Signing out of a laptop must not sign out the phone. Ending everything is a separate, deliberate action.

## 3. The cost

**One extra database read per authenticated request.**

That is the price of revocation and it is paid knowingly. The alternatives were considered and rejected:

| Option | Why not |
|---|---|
| Short-lived token + refresh | Cuts the window to minutes rather than closing it, and the refresh token needs the same revocation question answered anyway |
| Denylist of revoked ids | Cheaper, but needs storage with TTL and still fails open if the denylist is unavailable |
| Leave it stateless | The seven-day window is the bug |

If the read ever becomes a bottleneck, the fix is caching with a short TTL — accepting a bounded revocation delay — not removing the check.

## 4. Password reset ends every session

The connection that made this worth doing first. Without it, a reset protects nobody: whoever knew the old password — the case a reset most often exists to handle — simply stays signed in until their cookie expires.

Revocation happens **after** the new password is stored. Revoking first would leave a window where the old password still worked but sessions were already gone.

`resetPassword` returns `sessionsEnded`, so the user can be told how many devices were signed out. An unexpected count is how someone discovers a session they did not recognise.

## 5. Upgrade note

**Existing sessions are invalidated by this change.** Tokens minted before it carry no `jti`, so they have no record and are refused. Everyone signs in once more. That is the correct trade: the alternative is honouring exactly the unrevocable tokens this exists to eliminate.

## 6. Known gaps

- **Expired and revoked rows are never purged.** They accumulate. Same gap as the rate-limit counters and reset tokens — one cleanup job (KWM-058) should handle all three.
- **No "sign out everywhere" in the UI.** `revokeUserSessions` exists and is tested; nothing calls it from a page yet. It needs a settings screen, which does not exist.
- **No session list for the user.** Showing device, IP and last-used would let someone spot an unfamiliar session. The record has the data to support this; the UI does not exist.
- **Revocation is not audited.** When #108 wires `audit()`, session termination is worth recording — it is exactly the sort of privileged event an audit trail exists for.

## 7. Testing

42 cases across `session-revocation.test.ts`, `jose-session-token.adapter.test.ts` and the reset suite.

The token service had **no tests at all** before this, despite being the thing that mints session credentials. It does now, including that a tampered token, a wrong-secret token and an expired token all resolve to `null` rather than throwing — the contract `getCurrentUser` depends on to avoid turning every expired cookie into a 500.

**Mutation-verified:**

| Sabotage | Failures |
|---|---|
| logout clears the cookie but does not revoke *(the original bug)* | 2 |
| `getCurrentUser` ignores `revokedAt` | 4 |
| accept a token with no session record | 1 |
| password reset does not revoke sessions | 1 |
| reuse one session id for every sign-in | 2 |
| accept tokens with no `jti` | 1 |

The first row is the point: that mutation restores the exact behaviour KWM-079 describes, and the suite now catches it.
