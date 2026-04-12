INSERT INTO stops (name, latitude, longitude, type) VALUES
  ('Recto', 14.6031, 120.9851, 'jeep'),
  ('Divisoria', 14.6010, 120.9716, 'jeep'),
  ('Cubao', 14.6190, 121.0537, 'jeep'),
  ('Taft Avenue', 14.5378, 121.0014, 'train'),
  ('Ayala', 14.5492, 121.0279, 'train'),
  ('North Avenue', 14.6549, 121.0339, 'train')
ON CONFLICT DO NOTHING;

INSERT INTO routes (name, type, signboard) VALUES
  ('Recto-Cubao Jeep Route', 'jeep', 'Cubao-Divisoria'),
  ('MRT-3 Main Line', 'train', 'North Avenue-Taft Avenue')
ON CONFLICT DO NOTHING;

WITH route_map AS (
  SELECT id, signboard FROM routes
),
stop_map AS (
  SELECT id, name FROM stops
)
INSERT INTO route_stops (route_id, stop_id, stop_order)
SELECT r.id, s.id, x.stop_order
FROM (
  VALUES
    ('Cubao-Divisoria', 'Divisoria', 1),
    ('Cubao-Divisoria', 'Recto', 2),
    ('Cubao-Divisoria', 'Cubao', 3),
    ('North Avenue-Taft Avenue', 'Taft Avenue', 1),
    ('North Avenue-Taft Avenue', 'Ayala', 2),
    ('North Avenue-Taft Avenue', 'North Avenue', 3)
) AS x(signboard, stop_name, stop_order)
JOIN route_map r ON r.signboard = x.signboard
JOIN stop_map s ON s.name = x.stop_name
ON CONFLICT DO NOTHING;
