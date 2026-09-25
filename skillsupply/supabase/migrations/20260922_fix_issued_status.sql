UPDATE borrow_transactions SET status = 'Borrowed' WHERE status = 'Issued';
UPDATE requisitions SET status = 'Approved' WHERE status = 'Issued';
