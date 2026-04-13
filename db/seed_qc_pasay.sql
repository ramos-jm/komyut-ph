WITH stop_seed(name, latitude, longitude, type) AS (
  VALUES
    ('SM North EDSA', 14.6569, 121.0292, 'jeep'),
    ('Trinoma', 14.6537, 121.0344, 'jeep'),
    ('North Avenue', 14.6549, 121.0339, 'train'),
    ('Quezon Avenue', 14.6427, 121.0392, 'train'),
    ('GMA-Kamuning', 14.6357, 121.0433, 'train'),
    ('Araneta-Cubao', 14.6194, 121.0535, 'train'),
    ('Santolan-Annapolis', 14.6085, 121.0569, 'train'),
    ('Ortigas', 14.5898, 121.0567, 'train'),
    ('Shaw Boulevard', 14.5812, 121.0536, 'train'),
    ('Boni', 14.5723, 121.0474, 'train'),
    ('Guadalupe', 14.5679, 121.0451, 'train'),
    ('Buendia', 14.5543, 121.0344, 'train'),
    ('Ayala', 14.5492, 121.0279, 'train'),
    ('Magallanes', 14.5419, 121.0197, 'train'),
    ('Taft Avenue', 14.5378, 121.0014, 'train'),
    ('EDSA-LRT1', 14.5380, 121.0006, 'train'),
    ('Baclaran', 14.5343, 120.9982, 'train'),
    ('MOA', 14.5351, 120.9821, 'bus'),
    ('PITX', 14.5101, 120.9918, 'bus'),
    ('Philcoa', 14.6480, 121.0480, 'jeep'),
    ('UP Town Center', 14.6494, 121.0749, 'jeep'),
    ('Katipunan', 14.6307, 121.0648, 'train'),
    ('Anonas', 14.6282, 121.0455, 'jeep'),
    ('East Avenue', 14.6418, 121.0493, 'jeep'),
    ('SM Fairview', 14.7345, 121.0566, 'uv'),
    ('Welcome Rotonda', 14.6167, 121.0005, 'jeep'),
    ('Espana', 14.6105, 120.9892, 'jeep'),
    ('Quiapo', 14.5998, 120.9842, 'jeep'),
    ('Lawton', 14.5938, 120.9827, 'bus')
)
INSERT INTO stops (name, latitude, longitude, type)
SELECT s.name, s.latitude, s.longitude, s.type
FROM stop_seed s
WHERE NOT EXISTS (
  SELECT 1 FROM stops existing WHERE existing.name = s.name
);

WITH route_seed(name, type, signboard) AS (
  VALUES
    ('QC-Pasay MRT Southbound', 'train', 'North Avenue-Taft Avenue'),
    ('QC-Pasay MRT Northbound', 'train', 'Taft Avenue-North Avenue'),
    ('QC Campus Link Jeep', 'jeep', 'Philcoa-Katipunan'),
    ('QC Trunk Jeep', 'jeep', 'SM North-Cubao'),
    ('Cubao-Taft Jeep', 'jeep', 'Cubao-Taft'),
    ('Carousel Southbound Core', 'bus', 'North Avenue-PITX'),
    ('Carousel Northbound Core', 'bus', 'PITX-North Avenue'),
    ('UV Fairview-MOA', 'uv', 'Fairview-MOA'),
    ('UV MOA-Fairview', 'uv', 'MOA-Fairview')
)
INSERT INTO routes (name, type, signboard)
SELECT r.name, r.type, r.signboard
FROM route_seed r
WHERE NOT EXISTS (
  SELECT 1 FROM routes existing WHERE existing.signboard = r.signboard
);

WITH route_map AS (
  SELECT MIN(id) AS id, signboard
  FROM routes
  GROUP BY signboard
),
stop_map AS (
  SELECT MIN(id) AS id, name
  FROM stops
  GROUP BY name
)
INSERT INTO route_stops (route_id, stop_id, stop_order)
SELECT r.id, s.id, x.stop_order
FROM (
  VALUES
    ('North Avenue-Taft Avenue', 'North Avenue', 1),
    ('North Avenue-Taft Avenue', 'Quezon Avenue', 2),
    ('North Avenue-Taft Avenue', 'GMA-Kamuning', 3),
    ('North Avenue-Taft Avenue', 'Araneta-Cubao', 4),
    ('North Avenue-Taft Avenue', 'Santolan-Annapolis', 5),
    ('North Avenue-Taft Avenue', 'Ortigas', 6),
    ('North Avenue-Taft Avenue', 'Shaw Boulevard', 7),
    ('North Avenue-Taft Avenue', 'Boni', 8),
    ('North Avenue-Taft Avenue', 'Guadalupe', 9),
    ('North Avenue-Taft Avenue', 'Buendia', 10),
    ('North Avenue-Taft Avenue', 'Ayala', 11),
    ('North Avenue-Taft Avenue', 'Magallanes', 12),
    ('North Avenue-Taft Avenue', 'Taft Avenue', 13),

    ('Taft Avenue-North Avenue', 'Taft Avenue', 1),
    ('Taft Avenue-North Avenue', 'Magallanes', 2),
    ('Taft Avenue-North Avenue', 'Ayala', 3),
    ('Taft Avenue-North Avenue', 'Buendia', 4),
    ('Taft Avenue-North Avenue', 'Guadalupe', 5),
    ('Taft Avenue-North Avenue', 'Boni', 6),
    ('Taft Avenue-North Avenue', 'Shaw Boulevard', 7),
    ('Taft Avenue-North Avenue', 'Ortigas', 8),
    ('Taft Avenue-North Avenue', 'Santolan-Annapolis', 9),
    ('Taft Avenue-North Avenue', 'Araneta-Cubao', 10),
    ('Taft Avenue-North Avenue', 'GMA-Kamuning', 11),
    ('Taft Avenue-North Avenue', 'Quezon Avenue', 12),
    ('Taft Avenue-North Avenue', 'North Avenue', 13),

    ('Philcoa-Katipunan', 'Philcoa', 1),
    ('Philcoa-Katipunan', 'UP Town Center', 2),
    ('Philcoa-Katipunan', 'Katipunan', 3),

    ('SM North-Cubao', 'SM North EDSA', 1),
    ('SM North-Cubao', 'Trinoma', 2),
    ('SM North-Cubao', 'East Avenue', 3),
    ('SM North-Cubao', 'Anonas', 4),
    ('SM North-Cubao', 'Araneta-Cubao', 5),

    ('Cubao-Taft', 'Araneta-Cubao', 1),
    ('Cubao-Taft', 'Ortigas', 2),
    ('Cubao-Taft', 'Guadalupe', 3),
    ('Cubao-Taft', 'Ayala', 4),
    ('Cubao-Taft', 'Taft Avenue', 5),

    ('North Avenue-PITX', 'North Avenue', 1),
    ('North Avenue-PITX', 'Quezon Avenue', 2),
    ('North Avenue-PITX', 'Araneta-Cubao', 3),
    ('North Avenue-PITX', 'Ortigas', 4),
    ('North Avenue-PITX', 'Guadalupe', 5),
    ('North Avenue-PITX', 'Ayala', 6),
    ('North Avenue-PITX', 'Taft Avenue', 7),
    ('North Avenue-PITX', 'MOA', 8),
    ('North Avenue-PITX', 'PITX', 9),

    ('PITX-North Avenue', 'PITX', 1),
    ('PITX-North Avenue', 'MOA', 2),
    ('PITX-North Avenue', 'Taft Avenue', 3),
    ('PITX-North Avenue', 'Ayala', 4),
    ('PITX-North Avenue', 'Guadalupe', 5),
    ('PITX-North Avenue', 'Ortigas', 6),
    ('PITX-North Avenue', 'Araneta-Cubao', 7),
    ('PITX-North Avenue', 'Quezon Avenue', 8),
    ('PITX-North Avenue', 'North Avenue', 9),

    ('Fairview-MOA', 'SM Fairview', 1),
    ('Fairview-MOA', 'Welcome Rotonda', 2),
    ('Fairview-MOA', 'Espana', 3),
    ('Fairview-MOA', 'Quiapo', 4),
    ('Fairview-MOA', 'Lawton', 5),
    ('Fairview-MOA', 'Taft Avenue', 6),
    ('Fairview-MOA', 'MOA', 7),

    ('MOA-Fairview', 'MOA', 1),
    ('MOA-Fairview', 'Taft Avenue', 2),
    ('MOA-Fairview', 'Lawton', 3),
    ('MOA-Fairview', 'Quiapo', 4),
    ('MOA-Fairview', 'Espana', 5),
    ('MOA-Fairview', 'Welcome Rotonda', 6),
    ('MOA-Fairview', 'SM Fairview', 7)
) AS x(signboard, stop_name, stop_order)
JOIN route_map r ON r.signboard = x.signboard
JOIN stop_map s ON s.name = x.stop_name
ON CONFLICT DO NOTHING;
