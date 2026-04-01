
-- Drop the unique constraint to allow same car number for multiple clients
DROP INDEX IF EXISTS idx_cars_car_number_unique;
