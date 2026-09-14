-- Performance indexes for common query patterns

-- inventory_items: WHERE is_active = true, ORDER BY item_name
CREATE INDEX IF NOT EXISTS idx_inventory_items_is_active ON inventory_items(is_active);
CREATE INDEX IF NOT EXISTS idx_inventory_items_item_name ON inventory_items(item_name);

-- inventory_items: low stock queries (quantity <= reorder_level)
CREATE INDEX IF NOT EXISTS idx_inventory_items_stock ON inventory_items(quantity_on_hand, reorder_level);

-- inventory_items: filter by condition
CREATE INDEX IF NOT EXISTS idx_inventory_items_condition ON inventory_items(item_condition);

-- borrow_transactions: overdue calculation (status + expected_return_date)
CREATE INDEX IF NOT EXISTS idx_borrow_transactions_overdue ON borrow_transactions(status, expected_return_date);

-- borrow_transactions: search by borrower name
CREATE INDEX IF NOT EXISTS idx_borrow_transactions_borrower ON borrow_transactions(borrower_name);

-- borrow_transactions: user's borrow history
CREATE INDEX IF NOT EXISTS idx_borrow_transactions_user_status ON borrow_transactions(user_id, status);

-- requisitions: user's requisitions filtered by status
CREATE INDEX IF NOT EXISTS idx_requisitions_user_status ON requisitions(user_id, status);

-- requisitions: search by borrower name
CREATE INDEX IF NOT EXISTS idx_requisitions_borrower ON requisitions(borrower_name);

-- consumption_tracking: composite for item + division queries
CREATE INDEX IF NOT EXISTS idx_consumption_tracking_item_division ON consumption_tracking(item_id, division_id);

-- forecast_data: item + date queries
CREATE INDEX IF NOT EXISTS idx_forecast_data_item_date ON forecast_data(item_id, forecast_date);

-- inventory_items: serial number lookup (used in duplicate check)
CREATE INDEX IF NOT EXISTS idx_inventory_items_serial_number ON inventory_items(serial_number) WHERE serial_number IS NOT NULL;

-- borrow_transactions: item_id for inventory update joins
CREATE INDEX IF NOT EXISTS idx_borrow_transactions_item_status ON borrow_transactions(item_id, status);