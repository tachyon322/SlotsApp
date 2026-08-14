-- The old debit-first /withdraw flow could leave more than one pending
-- withdrawal row per user (two parallel requests debited twice and inserted
-- two rows). Keep the newest as the active pending request and mark the older
-- duplicates 'failed'. They keep balance_debited = true, so the normal refund
-- path (clearWithdrawRequests) returns the duplicated debit on the user's next
-- withdraw attempt instead of silently vanishing the money.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id
           ORDER BY created_at DESC, id DESC
         ) AS rn
  FROM transactions
  WHERE type = 'withdrawal' AND status = 'pending'
)
UPDATE transactions t
SET status = 'failed'
FROM ranked r
WHERE t.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "transactions_one_pending_withdrawal_per_user" ON "transactions" ("user_id") WHERE "type" = 'withdrawal' AND "status" = 'pending';
