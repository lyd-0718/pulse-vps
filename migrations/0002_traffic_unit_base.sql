-- Add per-node traffic unit base (1000 = decimal GB, 1024 = binary GiB)
ALTER TABLE nodes ADD COLUMN traffic_unit_base INTEGER NOT NULL DEFAULT 1024;
