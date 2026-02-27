# GOVHUB Backlog Mirror

Human-friendly mirror of `governance.hub_backlog_items`.
Single source of truth remains the database.

## Current Items

| mission_key | title | status | priority | owner_repo | notes |
| --- | --- | --- | ---: | --- | --- |
| GOV-0084 | Fetch-mission client implementation and CCP hardening completion | queued | 100 | platform | Seeded by GOV-0086 migration. |

## Update Procedure
1. Update DB first (`governance.hub_backlog_items`).
2. Mirror changes in this file in the same governance PR.
3. Keep `mission_key`, `status`, and `priority` aligned with DB.
