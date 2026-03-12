CREATE TABLE IF NOT EXISTS app_users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(80) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(30) NOT NULL DEFAULT 'disponent',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bookings (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  container_no VARCHAR(120) NOT NULL,
  customer VARCHAR(255) NOT NULL,
  plate VARCHAR(120) NOT NULL,
  order_no VARCHAR(120) NOT NULL,
  booking_date DATE NOT NULL,
  color VARCHAR(20) NOT NULL DEFAULT '#0ea5e9',
  created_by BIGINT REFERENCES app_users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(booking_date);
