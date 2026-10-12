-- Keep legacy requisition statuses valid while allowing the approved-to-released workflow.
ALTER TABLE requisitions
  DROP CONSTRAINT IF EXISTS requisitions_status_check;

ALTER TABLE requisitions
  ADD CONSTRAINT requisitions_status_check
  CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Issued', 'Returned', 'Released'));

ALTER TABLE requisition_items
  DROP CONSTRAINT IF EXISTS requisition_items_status_check;

ALTER TABLE requisition_items
  ADD CONSTRAINT requisition_items_status_check
  CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Issued', 'Returned', 'Released'));
