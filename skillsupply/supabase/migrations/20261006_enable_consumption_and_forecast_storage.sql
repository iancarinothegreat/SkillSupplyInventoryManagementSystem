-- Make the existing tracking tables persistent without duplicating daily rows.
CREATE UNIQUE INDEX IF NOT EXISTS uq_consumption_tracking_item_division_date
  ON public.consumption_tracking (item_id, division_id, consumption_date);

CREATE UNIQUE INDEX IF NOT EXISTS uq_forecast_data_item_division_date
  ON public.forecast_data (item_id, division_id, forecast_date);

-- Backfill consumption from the same issued quantities used by the dashboard.
INSERT INTO public.consumption_tracking (item_id, division_id, quantity_consumed, consumption_date)
SELECT item_id, division_id, SUM(quantity_borrowed), borrow_date
FROM public.borrow_transactions
GROUP BY item_id, division_id, borrow_date
ON CONFLICT (item_id, division_id, consumption_date)
DO UPDATE SET quantity_consumed = EXCLUDED.quantity_consumed;

-- Seed the current forecast snapshot. The application refreshes this table on
-- each Forecasting request so it stays current as new transactions arrive.
WITH monthly_consumption AS (
  SELECT bt.item_id, bt.division_id,
         DATE_TRUNC('month', bt.created_at) AS month,
         SUM(bt.quantity_borrowed)::numeric AS consumed
  FROM public.borrow_transactions bt
  WHERE bt.created_at >= NOW() - INTERVAL '3 months'
  GROUP BY bt.item_id, bt.division_id, DATE_TRUNC('month', bt.created_at)
), item_smas AS (
  SELECT item_id, division_id, AVG(consumed) AS sma
  FROM monthly_consumption
  GROUP BY item_id, division_id
)
INSERT INTO public.forecast_data
  (item_id, division_id, forecast_date, sma_value, days_to_depletion, risk_level)
SELECT i.item_id,
       i.division_id,
       CURRENT_DATE,
       ROUND(COALESCE(s.sma, 0), 2),
       CASE WHEN COALESCE(s.sma, 0) > 0
            THEN ROUND((COALESCE(i.quantity_on_hand, 0) / s.sma) * 30)::int
            ELSE NULL END,
       CASE WHEN COALESCE(s.sma, 0) = 0 THEN 'Safe'
            WHEN ROUND((COALESCE(i.quantity_on_hand, 0) / s.sma) * 30)::int <= 7 THEN 'Critical'
            WHEN ROUND((COALESCE(i.quantity_on_hand, 0) / s.sma) * 30)::int <= 30 THEN 'Warning'
            ELSE 'Safe' END
FROM public.inventory_items i
LEFT JOIN item_smas s ON s.item_id = i.item_id AND s.division_id = i.division_id
WHERE i.is_active = true
  AND i.division_id IS NOT NULL
ON CONFLICT (item_id, division_id, forecast_date)
DO UPDATE SET
  sma_value = EXCLUDED.sma_value,
  days_to_depletion = EXCLUDED.days_to_depletion,
  risk_level = EXCLUDED.risk_level;
