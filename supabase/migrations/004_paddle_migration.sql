-- Migrates paid_audits from Stripe to Paddle. Run this AFTER 002_paid_audits.sql
-- if that table already exists with a stripe_session_id column.

alter table paid_audits rename column stripe_session_id to paddle_transaction_id;

-- paddle_transaction_id must be unique for the webhook's upsert-based
-- idempotency (onConflict: "paddle_transaction_id") to work correctly.
create unique index if not exists paid_audits_paddle_transaction_id_unique_idx
  on paid_audits (paddle_transaction_id);