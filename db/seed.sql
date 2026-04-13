WITH stop_seed(name, latitude, longitude, type) AS (
  VALUES
    ('Divisoria', 14.6010, 120.9716, 'jeep'),
    ('Recto', 14.6031, 120.9851, 'train'),
    ('Legarda', 14.6024, 120.9927, 'train'),
    ('Pureza', 14.6018, 121.0050, 'train'),
    ('V. Mapa', 14.6040, 121.0173, 'train'),
    ('J. Ruiz', 14.6108, 121.0264, 'train'),
    ('Gilmore', 14.6133, 121.0352, 'train'),
    ('Betty Go-Belmonte', 14.6230, 121.0421, 'train'),
    ('Araneta-Cubao', 14.6194, 121.0535, 'train'),
    ('Katipunan', 14.6307, 121.0648, 'train'),
    ('Santolan', 14.6222, 121.0847, 'train'),
    ('Marikina-Pasig', 14.6302, 121.1006, 'train'),
    ('Antipolo', 14.6297, 121.1207, 'train'),
    ('Doroteo Jose', 14.6054, 120.9823, 'train'),
    ('Carriedo', 14.5991, 120.9814, 'train'),
    ('Central Terminal', 14.5929, 120.9818, 'train'),
    ('UN Avenue', 14.5828, 120.9846, 'train'),
    ('Pedro Gil', 14.5766, 120.9881, 'train'),
    ('Quirino', 14.5705, 120.9918, 'train'),
    ('Vito Cruz', 14.5636, 120.9948, 'train'),
    ('Gil Puyat', 14.5538, 120.9969, 'train'),
    ('Libertad', 14.5478, 120.9989, 'train'),
    ('EDSA-LRT1', 14.5380, 121.0006, 'train'),
    ('Baclaran', 14.5343, 120.9982, 'train'),
    ('Blumentritt', 14.6228, 120.9827, 'train'),
    ('Monumento', 14.6572, 120.9837, 'train'),
    ('Balintawak', 14.6570, 121.0048, 'train'),
    ('FPJ Station', 14.6575, 121.0217, 'train'),
    ('Taft Avenue', 14.5378, 121.0014, 'train'),
    ('Magallanes', 14.5419, 121.0197, 'train'),
    ('Ayala', 14.5492, 121.0279, 'train'),
    ('Buendia', 14.5543, 121.0344, 'train'),
    ('Guadalupe', 14.5679, 121.0451, 'train'),
    ('Boni', 14.5723, 121.0474, 'train'),
    ('Shaw Boulevard', 14.5812, 121.0536, 'train'),
    ('Ortigas', 14.5898, 121.0567, 'train'),
    ('Santolan-Annapolis', 14.6085, 121.0569, 'train'),
    ('Kamuning', 14.6357, 121.0433, 'train'),
    ('Quezon Avenue', 14.6427, 121.0392, 'train'),
    ('North Avenue', 14.6549, 121.0339, 'train'),
    ('MOA', 14.5351, 120.9821, 'bus'),
    ('PITX', 14.5101, 120.9918, 'bus'),
    ('Lawton', 14.5938, 120.9827, 'bus'),
    ('Quiapo', 14.5998, 120.9842, 'jeep'),
    ('Espana', 14.6105, 120.9892, 'jeep'),
    ('Welcome Rotonda', 14.6167, 121.0005, 'jeep'),
    ('SM Fairview', 14.7345, 121.0566, 'uv')
)
INSERT INTO stops (name, latitude, longitude, type)
SELECT s.name, s.latitude, s.longitude, s.type
FROM stop_seed s
WHERE NOT EXISTS (
  SELECT 1 FROM stops existing WHERE existing.name = s.name
);

WITH route_seed(name, type, signboard) AS (
  VALUES
    ('LRT-2 Eastbound', 'train', 'Recto-Antipolo'),
    ('LRT-2 Westbound', 'train', 'Antipolo-Recto'),
    ('MRT-3 Northbound', 'train', 'Taft Avenue-North Avenue'),
    ('MRT-3 Southbound', 'train', 'North Avenue-Taft Avenue'),
    ('LRT-1 Northbound', 'train', 'Baclaran-FPJ Station'),
    ('LRT-1 Southbound', 'train', 'FPJ Station-Baclaran'),
    ('Jeep Line 1', 'jeep', 'Cubao-Divisoria'),
    ('Jeep Line 2', 'jeep', 'Cubao-Marikina'),
    ('Jeep Line 3', 'jeep', 'Quiapo-PITX'),
    ('Jeep Line 4', 'jeep', 'Lawton-Cubao'),
    ('EDSA Carousel Northbound', 'bus', 'PITX-Monumento'),
    ('EDSA Carousel Southbound', 'bus', 'Monumento-PITX'),
    ('UV Express Northbound', 'uv', 'Fairview-Buendia'),
    ('UV Express Southbound', 'uv', 'Buendia-Fairview')
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
shape_seed(signboard, seq, latitude, longitude) AS (
  VALUES
    ('North Avenue-Taft Avenue', 1, 14.6549, 121.0339),
    ('North Avenue-Taft Avenue', 2, 14.6490, 121.0369),
    ('North Avenue-Taft Avenue', 3, 14.6427, 121.0392),
    ('North Avenue-Taft Avenue', 4, 14.6392, 121.0410),
    ('North Avenue-Taft Avenue', 5, 14.6357, 121.0433),
    ('North Avenue-Taft Avenue', 6, 14.6278, 121.0481),
    ('North Avenue-Taft Avenue', 7, 14.6194, 121.0535),
    ('North Avenue-Taft Avenue', 8, 14.6142, 121.0554),
    ('North Avenue-Taft Avenue', 9, 14.6085, 121.0569),
    ('North Avenue-Taft Avenue', 10, 14.5991, 121.0571),
    ('North Avenue-Taft Avenue', 11, 14.5898, 121.0567),
    ('North Avenue-Taft Avenue', 12, 14.5812, 121.0536),
    ('North Avenue-Taft Avenue', 13, 14.5723, 121.0474),
    ('North Avenue-Taft Avenue', 14, 14.5679, 121.0451),
    ('North Avenue-Taft Avenue', 15, 14.5608, 121.0397),
    ('North Avenue-Taft Avenue', 16, 14.5543, 121.0344),
    ('North Avenue-Taft Avenue', 17, 14.5518, 121.0312),
    ('North Avenue-Taft Avenue', 18, 14.5492, 121.0279),
    ('North Avenue-Taft Avenue', 19, 14.5452, 121.0241),
    ('North Avenue-Taft Avenue', 20, 14.5419, 121.0197),
    ('North Avenue-Taft Avenue', 21, 14.5396, 121.0112),
    ('North Avenue-Taft Avenue', 22, 14.5378, 121.0014),

    ('Taft Avenue-North Avenue', 1, 14.5378, 121.0014),
    ('Taft Avenue-North Avenue', 2, 14.5396, 121.0112),
    ('Taft Avenue-North Avenue', 3, 14.5419, 121.0197),
    ('Taft Avenue-North Avenue', 4, 14.5452, 121.0241),
    ('Taft Avenue-North Avenue', 5, 14.5492, 121.0279),
    ('Taft Avenue-North Avenue', 6, 14.5518, 121.0312),
    ('Taft Avenue-North Avenue', 7, 14.5543, 121.0344),
    ('Taft Avenue-North Avenue', 8, 14.5608, 121.0397),
    ('Taft Avenue-North Avenue', 9, 14.5679, 121.0451),
    ('Taft Avenue-North Avenue', 10, 14.5723, 121.0474),
    ('Taft Avenue-North Avenue', 11, 14.5812, 121.0536),
    ('Taft Avenue-North Avenue', 12, 14.5898, 121.0567),
    ('Taft Avenue-North Avenue', 13, 14.5991, 121.0571),
    ('Taft Avenue-North Avenue', 14, 14.6085, 121.0569),
    ('Taft Avenue-North Avenue', 15, 14.6142, 121.0554),
    ('Taft Avenue-North Avenue', 16, 14.6194, 121.0535),
    ('Taft Avenue-North Avenue', 17, 14.6278, 121.0481),
    ('Taft Avenue-North Avenue', 18, 14.6357, 121.0433),
    ('Taft Avenue-North Avenue', 19, 14.6392, 121.0410),
    ('Taft Avenue-North Avenue', 20, 14.6427, 121.0392),
    ('Taft Avenue-North Avenue', 21, 14.6490, 121.0369),
    ('Taft Avenue-North Avenue', 22, 14.6549, 121.0339),

    ('Recto-Antipolo', 1, 14.6031, 120.9851),
    ('Recto-Antipolo', 2, 14.6060, 120.9900),
    ('Recto-Antipolo', 3, 14.6024, 120.9927),
    ('Recto-Antipolo', 4, 14.6040, 121.0173),
    ('Recto-Antipolo', 5, 14.6108, 121.0264),
    ('Recto-Antipolo', 6, 14.6133, 121.0352),
    ('Recto-Antipolo', 7, 14.6230, 121.0421),
    ('Recto-Antipolo', 8, 14.6194, 121.0535),
    ('Recto-Antipolo', 9, 14.6307, 121.0648),
    ('Recto-Antipolo', 10, 14.6222, 121.0847),
    ('Recto-Antipolo', 11, 14.6302, 121.1006),
    ('Recto-Antipolo', 12, 14.6297, 121.1207),

    ('Antipolo-Recto', 1, 14.6297, 121.1207),
    ('Antipolo-Recto', 2, 14.6302, 121.1006),
    ('Antipolo-Recto', 3, 14.6222, 121.0847),
    ('Antipolo-Recto', 4, 14.6307, 121.0648),
    ('Antipolo-Recto', 5, 14.6194, 121.0535),
    ('Antipolo-Recto', 6, 14.6230, 121.0421),
    ('Antipolo-Recto', 7, 14.6133, 121.0352),
    ('Antipolo-Recto', 8, 14.6108, 121.0264),
    ('Antipolo-Recto', 9, 14.6040, 121.0173),
    ('Antipolo-Recto', 10, 14.6024, 120.9927),
    ('Antipolo-Recto', 11, 14.6060, 120.9900),
    ('Antipolo-Recto', 12, 14.6031, 120.9851),

    ('Baclaran-FPJ Station', 1, 14.5343, 120.9982),
    ('Baclaran-FPJ Station', 2, 14.5380, 121.0006),
    ('Baclaran-FPJ Station', 3, 14.5478, 120.9989),
    ('Baclaran-FPJ Station', 4, 14.5538, 120.9969),
    ('Baclaran-FPJ Station', 5, 14.5636, 120.9948),
    ('Baclaran-FPJ Station', 6, 14.5705, 120.9918),
    ('Baclaran-FPJ Station', 7, 14.5766, 120.9881),
    ('Baclaran-FPJ Station', 8, 14.5828, 120.9846),
    ('Baclaran-FPJ Station', 9, 14.5929, 120.9818),
    ('Baclaran-FPJ Station', 10, 14.5991, 120.9814),
    ('Baclaran-FPJ Station', 11, 14.6054, 120.9823),
    ('Baclaran-FPJ Station', 12, 14.6228, 120.9827),
    ('Baclaran-FPJ Station', 13, 14.6572, 120.9837),
    ('Baclaran-FPJ Station', 14, 14.6570, 121.0048),
    ('Baclaran-FPJ Station', 15, 14.6575, 121.0217),

    ('FPJ Station-Baclaran', 1, 14.6575, 121.0217),
    ('FPJ Station-Baclaran', 2, 14.6570, 121.0048),
    ('FPJ Station-Baclaran', 3, 14.6572, 120.9837),
    ('FPJ Station-Baclaran', 4, 14.6228, 120.9827),
    ('FPJ Station-Baclaran', 5, 14.6054, 120.9823),
    ('FPJ Station-Baclaran', 6, 14.5991, 120.9814),
    ('FPJ Station-Baclaran', 7, 14.5929, 120.9818),
    ('FPJ Station-Baclaran', 8, 14.5828, 120.9846),
    ('FPJ Station-Baclaran', 9, 14.5766, 120.9881),
    ('FPJ Station-Baclaran', 10, 14.5705, 120.9918),
    ('FPJ Station-Baclaran', 11, 14.5636, 120.9948),
    ('FPJ Station-Baclaran', 12, 14.5538, 120.9969),
    ('FPJ Station-Baclaran', 13, 14.5478, 120.9989),
    ('FPJ Station-Baclaran', 14, 14.5380, 121.0006),
    ('FPJ Station-Baclaran', 15, 14.5343, 120.9982)
)
INSERT INTO route_shape_points (route_id, seq, latitude, longitude)
SELECT r.id, s.seq, s.latitude, s.longitude
FROM shape_seed s
JOIN route_map r ON r.signboard = s.signboard
ON CONFLICT (route_id, seq) DO NOTHING;

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
    ('Recto-Antipolo', 'Recto', 1),
    ('Recto-Antipolo', 'Legarda', 2),
    ('Recto-Antipolo', 'Pureza', 3),
    ('Recto-Antipolo', 'V. Mapa', 4),
    ('Recto-Antipolo', 'J. Ruiz', 5),
    ('Recto-Antipolo', 'Gilmore', 6),
    ('Recto-Antipolo', 'Betty Go-Belmonte', 7),
    ('Recto-Antipolo', 'Araneta-Cubao', 8),
    ('Recto-Antipolo', 'Katipunan', 9),
    ('Recto-Antipolo', 'Santolan', 10),
    ('Recto-Antipolo', 'Marikina-Pasig', 11),
    ('Recto-Antipolo', 'Antipolo', 12),

    ('Antipolo-Recto', 'Antipolo', 1),
    ('Antipolo-Recto', 'Marikina-Pasig', 2),
    ('Antipolo-Recto', 'Santolan', 3),
    ('Antipolo-Recto', 'Katipunan', 4),
    ('Antipolo-Recto', 'Araneta-Cubao', 5),
    ('Antipolo-Recto', 'Betty Go-Belmonte', 6),
    ('Antipolo-Recto', 'Gilmore', 7),
    ('Antipolo-Recto', 'J. Ruiz', 8),
    ('Antipolo-Recto', 'V. Mapa', 9),
    ('Antipolo-Recto', 'Pureza', 10),
    ('Antipolo-Recto', 'Legarda', 11),
    ('Antipolo-Recto', 'Recto', 12),

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
    ('Taft Avenue-North Avenue', 'Kamuning', 11),
    ('Taft Avenue-North Avenue', 'Quezon Avenue', 12),
    ('Taft Avenue-North Avenue', 'North Avenue', 13),

    ('North Avenue-Taft Avenue', 'North Avenue', 1),
    ('North Avenue-Taft Avenue', 'Quezon Avenue', 2),
    ('North Avenue-Taft Avenue', 'Kamuning', 3),
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

    ('Baclaran-FPJ Station', 'Baclaran', 1),
    ('Baclaran-FPJ Station', 'EDSA-LRT1', 2),
    ('Baclaran-FPJ Station', 'Libertad', 3),
    ('Baclaran-FPJ Station', 'Gil Puyat', 4),
    ('Baclaran-FPJ Station', 'Vito Cruz', 5),
    ('Baclaran-FPJ Station', 'Quirino', 6),
    ('Baclaran-FPJ Station', 'Pedro Gil', 7),
    ('Baclaran-FPJ Station', 'UN Avenue', 8),
    ('Baclaran-FPJ Station', 'Central Terminal', 9),
    ('Baclaran-FPJ Station', 'Carriedo', 10),
    ('Baclaran-FPJ Station', 'Doroteo Jose', 11),
    ('Baclaran-FPJ Station', 'Blumentritt', 12),
    ('Baclaran-FPJ Station', 'Monumento', 13),
    ('Baclaran-FPJ Station', 'Balintawak', 14),
    ('Baclaran-FPJ Station', 'FPJ Station', 15),

    ('FPJ Station-Baclaran', 'FPJ Station', 1),
    ('FPJ Station-Baclaran', 'Balintawak', 2),
    ('FPJ Station-Baclaran', 'Monumento', 3),
    ('FPJ Station-Baclaran', 'Blumentritt', 4),
    ('FPJ Station-Baclaran', 'Doroteo Jose', 5),
    ('FPJ Station-Baclaran', 'Carriedo', 6),
    ('FPJ Station-Baclaran', 'Central Terminal', 7),
    ('FPJ Station-Baclaran', 'UN Avenue', 8),
    ('FPJ Station-Baclaran', 'Pedro Gil', 9),
    ('FPJ Station-Baclaran', 'Quirino', 10),
    ('FPJ Station-Baclaran', 'Vito Cruz', 11),
    ('FPJ Station-Baclaran', 'Gil Puyat', 12),
    ('FPJ Station-Baclaran', 'Libertad', 13),
    ('FPJ Station-Baclaran', 'EDSA-LRT1', 14),
    ('FPJ Station-Baclaran', 'Baclaran', 15),

    ('Cubao-Divisoria', 'Divisoria', 1),
    ('Cubao-Divisoria', 'Recto', 2),
    ('Cubao-Divisoria', 'Legarda', 3),
    ('Cubao-Divisoria', 'Araneta-Cubao', 4),

    ('Cubao-Marikina', 'Araneta-Cubao', 1),
    ('Cubao-Marikina', 'Katipunan', 2),
    ('Cubao-Marikina', 'Santolan', 3),
    ('Cubao-Marikina', 'Marikina-Pasig', 4),

    ('Quiapo-PITX', 'Quiapo', 1),
    ('Quiapo-PITX', 'Lawton', 2),
    ('Quiapo-PITX', 'UN Avenue', 3),
    ('Quiapo-PITX', 'Gil Puyat', 4),
    ('Quiapo-PITX', 'MOA', 5),
    ('Quiapo-PITX', 'PITX', 6),

    ('Lawton-Cubao', 'Lawton', 1),
    ('Lawton-Cubao', 'Quiapo', 2),
    ('Lawton-Cubao', 'Espana', 3),
    ('Lawton-Cubao', 'Welcome Rotonda', 4),
    ('Lawton-Cubao', 'Araneta-Cubao', 5),

    ('PITX-Monumento', 'PITX', 1),
    ('PITX-Monumento', 'MOA', 2),
    ('PITX-Monumento', 'Taft Avenue', 3),
    ('PITX-Monumento', 'Ayala', 4),
    ('PITX-Monumento', 'Guadalupe', 5),
    ('PITX-Monumento', 'Ortigas', 6),
    ('PITX-Monumento', 'Araneta-Cubao', 7),
    ('PITX-Monumento', 'North Avenue', 8),
    ('PITX-Monumento', 'Monumento', 9),

    ('Monumento-PITX', 'Monumento', 1),
    ('Monumento-PITX', 'North Avenue', 2),
    ('Monumento-PITX', 'Araneta-Cubao', 3),
    ('Monumento-PITX', 'Ortigas', 4),
    ('Monumento-PITX', 'Guadalupe', 5),
    ('Monumento-PITX', 'Ayala', 6),
    ('Monumento-PITX', 'Taft Avenue', 7),
    ('Monumento-PITX', 'MOA', 8),
    ('Monumento-PITX', 'PITX', 9),

    ('Fairview-Buendia', 'SM Fairview', 1),
    ('Fairview-Buendia', 'Welcome Rotonda', 2),
    ('Fairview-Buendia', 'Espana', 3),
    ('Fairview-Buendia', 'Quiapo', 4),
    ('Fairview-Buendia', 'Lawton', 5),
    ('Fairview-Buendia', 'Buendia', 6),

    ('Buendia-Fairview', 'Buendia', 1),
    ('Buendia-Fairview', 'Lawton', 2),
    ('Buendia-Fairview', 'Quiapo', 3),
    ('Buendia-Fairview', 'Espana', 4),
    ('Buendia-Fairview', 'Welcome Rotonda', 5),
    ('Buendia-Fairview', 'SM Fairview', 6)
) AS x(signboard, stop_name, stop_order)
JOIN route_map r ON r.signboard = x.signboard
JOIN stop_map s ON s.name = x.stop_name
ON CONFLICT DO NOTHING;
