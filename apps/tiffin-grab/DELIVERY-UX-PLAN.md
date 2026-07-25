# Delivery calendar UX — implementation plan

Shared customer + admin delivery experience. Work in order; later items depend on server rules from earlier steps.

| # | Item | Status | Key files |
|---|------|--------|-----------|
| 0 | Activity log with actor + filter | **Done** | `orders/[id]/order-activity-log.tsx`, `listOrderActivities` |
| 1 | Admin order detail: dedupe Summary vs Deliveries plan info | **Done** | `orders/[id]/page.tsx` |
| 2 | Vacation / pool: native date inputs (no inline calendar) | **Done** | `vacation-date-field.tsx`, `vacation-control.tsx`, `schedule-pool-control.tsx` |
| 3 | Skip count in plan header (customer + admin) | **Done** | `customer-deliveries.service.ts`, `subscription-items.tsx` |
| 4 | Block un-skip when pooled or make-up exists | **Done** | `deliveries.service.ts`, `day-detail.tsx` |
| 5 | Reschedule delivery (pick target date, skip original + make-up) | **Done** | `deliveries.service.ts`, `actions.ts`, `day-detail.tsx` |
| 6 | Schedule pooled tiffin from calendar day tap | **Done** | `day-detail.tsx`, `pool-date-eligibility.ts` |
| 7 | Admin month nav without full page reload | **Done** | `admin-order-deliveries.tsx`, `fetchOrderDeliveriesMonth` |

## Verify

```bash
pnpm turbo typecheck --filter=tiffin-grab
pnpm exec playwright test -c e2e/playwright.config.ts --project=admin e2e/admin/order-revamp.spec.ts
```
