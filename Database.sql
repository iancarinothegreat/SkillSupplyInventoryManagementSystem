
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
  division_id INT,
  reset_token VARCHAR(128),
  reset_expires_at TIMESTAMP WITH TIME ZONE,
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

ALTER TABLE users
  ADD CONSTRAINT users_division_id_fkey
  FOREIGN KEY (division_id) REFERENCES divisions(division_id);

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
  serial_number VARCHAR(100),
  defective_quantity INT NOT NULL DEFAULT 0,
  is_returnable BOOLEAN DEFAULT FALSE,
  unit_cost NUMERIC(10,2),
  description TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE borrow_transactions (
  borrow_id SERIAL PRIMARY KEY,
  item_id INT NOT NULL REFERENCES inventory_items(item_id),
  user_id INT NOT NULL REFERENCES users(user_id),
  division_id INT NOT NULL REFERENCES divisions(division_id),
  quantity_borrowed INT NOT NULL,
  borrower_name VARCHAR(150) DEFAULT '',
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
  audit_id BIGSERIAL PRIMARY KEY,
  user_id INT REFERENCES users(user_id),
  username VARCHAR(100),
  action VARCHAR(30) NOT NULL,
  table_name VARCHAR(100) NOT NULL,
  record_id VARCHAR(100),
  old_values JSONB,
  new_values JSONB,
  ip_address INET,
  user_agent TEXT,
  request_id VARCHAR(100),
  success BOOLEAN DEFAULT TRUE,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  entry_hash VARCHAR(64),
  previous_hash VARCHAR(64),
  timestamp TIMESTAMP DEFAULT NOW()
);

CREATE TABLE login_audit (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(user_id),
  username VARCHAR(100) NOT NULL,
  action VARCHAR(20) NOT NULL,
  failure_reason VARCHAR(40),
  login_time TIMESTAMP DEFAULT NOW(),
  logout_time TIMESTAMP,
  ip_address VARCHAR(45),
  user_agent TEXT
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
  quantity_issued INT NOT NULL DEFAULT 0,
  purpose TEXT,
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

ALTER TABLE borrow_transactions
  ADD COLUMN requisition_id INT REFERENCES requisitions(requisition_id);

CREATE TABLE incident_reports (
  incident_id SERIAL PRIMARY KEY,
  item_id INT REFERENCES inventory_items(item_id) ON DELETE SET NULL,
  incident_type VARCHAR(30) NOT NULL,
  incident_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reported_by INT NOT NULL REFERENCES users(user_id),
  quantity_affected INT NOT NULL DEFAULT 1,
  description TEXT NOT NULL,
  investigation_remarks TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'Open',
  reviewed_by INT REFERENCES users(user_id),
  reviewed_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
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

