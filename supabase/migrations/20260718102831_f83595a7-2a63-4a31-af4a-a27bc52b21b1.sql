
ALTER TABLE public.order_ops
  ADD COLUMN IF NOT EXISTS steadfast_consignment_id bigint,
  ADD COLUMN IF NOT EXISTS steadfast_tracking_code text,
  ADD COLUMN IF NOT EXISTS steadfast_status text,
  ADD COLUMN IF NOT EXISTS steadfast_synced_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_order_ops_steadfast_cid
  ON public.order_ops (steadfast_consignment_id)
  WHERE steadfast_consignment_id IS NOT NULL;
