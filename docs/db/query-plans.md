# Query plans (KWM-014)

Indexes added in `drizzle/0001_add_indexes.sql`:

| Index | Column(s) | Serves |
|---|---|---|
| `reports_user_id_idx` | `reports(user_id)` | `getReportsByUserId` |
| `reports_status_idx` | `reports(status)` | `getPendingReports` |
| `reports_collector_id_idx` | `reports(collector_id)` | collector task lookups |
| `reports_created_at_idx` | `reports(created_at)` | `getRecentReports` (ordered) |
| `notifications_user_id_is_read_idx` | `notifications(user_id, is_read)` | `getUnreadNotifications` |
| `collected_wastes_report_id_idx` | `collected_wastes(report_id)` | collection joins |
| `collected_wastes_collector_id_idx` | `collected_wastes(collector_id)` | `getCollectedWastesByCollector` |
| `transactions_user_id_date_idx` | `transactions(user_id, date)` | `getRewardTransactions` (filter + order) |

> Deferred: `point_transactions(user_id, created_at)` from the KWM-014 acceptance
> criteria lands with KWM-011, which creates the `point_transactions` table.

## Before / after plans

`EXPLAIN ANALYZE` output must be captured against a **populated** database
(plans on empty tables show `Seq Scan` regardless, because the planner skips
indexes when a scan is cheaper). Capture these against a staging Neon branch
seeded with representative data, then paste the before/after plans here.

Top queries to profile:

```sql
EXPLAIN ANALYZE SELECT * FROM reports WHERE user_id = $1;
EXPLAIN ANALYZE SELECT * FROM reports WHERE status = 'pending';
EXPLAIN ANALYZE SELECT * FROM reports ORDER BY created_at DESC LIMIT 10;
EXPLAIN ANALYZE SELECT * FROM notifications WHERE user_id = $1 AND is_read = false;
EXPLAIN ANALYZE SELECT * FROM transactions WHERE user_id = $1 ORDER BY date DESC LIMIT 10;
```

Expected post-index result: `Index Scan` / `Bitmap Index Scan` rather than
`Seq Scan` once the tables hold enough rows for the planner to prefer the index.

_Status: pending — no seeded database is available from this branch._
