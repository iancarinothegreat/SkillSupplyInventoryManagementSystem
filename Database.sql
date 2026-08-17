
CREATE TABLE roles (
  role_id SERIAL PRIMARY KEY,
  role_name VARCHAR(50) NOT NULL UNIQUE,
  hierarchy_level INT NOT NULL
);
INSERT INTO roles VALUES (1,'Division Staff',1),(2,'Supply Officer',2),(3,'Administrator',3);

CREATE TABLE users (
  user_id SERIAL PRIMARY KEY,
  role_id INT NOT NULL REFERENCES roles(role_id),
  username VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(150),
  contact VARCHAR(50),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE divisions (
  division_id SERIAL PRIMARY KEY,
  division_name VARCHAR(100) NOT NULL UNIQUE
);
INSERT INTO divisions (division_name) VALUES
('Administrative'),('Finance'),('Student Services'),
('Registrar and Records'),('Training and Assessment');

CREATE TABLE categories (
  category_id SERIAL PRIMARY KEY,
  category_name VARCHAR(100) NOT NULL UNIQUE
);
INSERT INTO categories (category_name) VALUES
('Tools'),('Consumables'),('Equipment'),('Materials');

CREATE TABLE inventory_items (
  item_id SERIAL PRIMARY KEY,
  category_id INT REFERENCES categories(category_id),
  division_id INT REFERENCES divisions(division_id),
  item_name VARCHAR(200) NOT NULL,
  unit_of_measure VARCHAR(50),
  quantity_on_hand INT NOT NULL DEFAULT 0,
  reorder_level INT NOT NULL DEFAULT 10,
  unit_cost NUMERIC(10,2),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE borrow_transactions (
  borrow_id SERIAL PRIMARY KEY,
  item_id INT NOT NULL REFERENCES inventory_items(item_id),
  user_id INT NOT NULL REFERENCES users(user_id),
  division_id INT NOT NULL REFERENCES divisions(division_id),
  quantity_borrowed INT NOT NULL,
  borrow_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_return_date DATE,
  actual_return_date DATE,
  status VARCHAR(20) DEFAULT 'Active',
  purpose TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE return_transactions (
  return_id SERIAL PRIMARY KEY,
  borrow_id INT NOT NULL REFERENCES borrow_transactions(borrow_id),
  quantity_returned INT NOT NULL,
  condition_returned VARCHAR(20) DEFAULT 'Good',
  return_date DATE NOT NULL DEFAULT CURRENT_DATE,
  processed_by INT REFERENCES users(user_id),
  notes TEXT
);

CREATE TABLE audit_log (
  log_id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(user_id),
  action_type VARCHAR(20) NOT NULL,
  affected_table VARCHAR(100),
  affected_record_id INT,
  old_value JSONB,
  new_value JSONB,
  timestamp TIMESTAMP DEFAULT NOW()
);


CREATE TABLE requisitions (
  requisition_id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(user_id),
  division_id INT NOT NULL REFERENCES divisions(division_id),
  status VARCHAR(20) DEFAULT 'Pending',
  requested_date DATE NOT NULL DEFAULT CURRENT_DATE,
  approved_by INT REFERENCES users(user_id),
  approval_date DATE,
  approval_remarks TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE requisition_items (
  requisition_item_id SERIAL PRIMARY KEY,
  requisition_id INT NOT NULL REFERENCES requisitions(requisition_id),
  item_id INT NOT NULL REFERENCES inventory_items(item_id),
  quantity_requested INT NOT NULL,
  quantity_approved INT,
  status VARCHAR(20) DEFAULT 'Pending'
);

CREATE TABLE consumption_tracking (
  consumption_id SERIAL PRIMARY KEY,
  item_id INT NOT NULL REFERENCES inventory_items(item_id),
  division_id INT NOT NULL REFERENCES divisions(division_id), 
  quantity_consumed INT NOT NULL,
  consumption_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE forecast_data (
  forecast_id SERIAL PRIMARY KEY,
  item_id INT NOT NULL REFERENCES inventory_items(item_id),
  division_id INT NOT NULL REFERENCES divisions(division_id),
  forecast_date DATE NOT NULL,
  sma_value NUMERIC(10,2),
  days_to_depletion INT,
  risk_level VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW()
);


CREATE INDEX idx_users_role_id ON users(role_id);
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_inventory_items_category_id ON inventory_items(category_id);
CREATE INDEX idx_inventory_items_division_id ON inventory_items(division_id);
CREATE INDEX idx_borrow_transactions_status ON borrow_transactions(status);
CREATE INDEX idx_borrow_transactions_item_id ON borrow_transactions(item_id);
CREATE INDEX idx_borrow_transactions_user_id ON borrow_transactions(user_id);
CREATE INDEX idx_borrow_transactions_division_id ON borrow_transactions(division_id);
CREATE INDEX idx_borrow_transactions_borrow_date ON borrow_transactions(borrow_date DESC);
CREATE INDEX idx_return_transactions_borrow_id ON return_transactions(borrow_id);
CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_timestamp ON audit_log(timestamp DESC);


CREATE INDEX idx_requisitions_status ON requisitions(status);
CREATE INDEX idx_requisitions_user_id ON requisitions(user_id);
CREATE INDEX idx_requisitions_division_id ON requisitions(division_id);
CREATE INDEX idx_requisition_items_requisition_id ON requisition_items(requisition_id);
CREATE INDEX idx_consumption_tracking_item_id ON consumption_tracking(item_id);
CREATE INDEX idx_consumption_tracking_division_id ON consumption_tracking(division_id);
CREATE INDEX idx_consumption_tracking_date ON consumption_tracking(consumption_date DESC);
CREATE INDEX idx_forecast_data_item_id ON forecast_data(item_id);
CREATE INDEX idx_forecast_data_division_id ON forecast_data(division_id);

