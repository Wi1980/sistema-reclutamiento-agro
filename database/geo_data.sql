-- ============================================
-- AGROEXPORTADORA - DATOS GEOGRÁFICOS
-- LA LIBERTAD + LAMBAYEQUE
-- ============================================

USE agroexportadora_db;

-- ===================================================================
-- SECCIÓN 2: DATOS DEPARTAMENTOS
-- ===================================================================

INSERT INTO departamentos (nombre, codigo_departamento) VALUES
('LA LIBERTAD', 13),
('LAMBAYEQUE', 14);

-- ===================================================================
-- SECCIÓN 3: DATOS LA LIBERTAD (CHEPÉN Y PACASMAYO)
-- ===================================================================

-- 3.1 PROVINCIAS LA LIBERTAD
INSERT INTO provincias (nombre, codigo_provincia, departamento_id) VALUES
('CHEPEN', 1304, 1),
('PACASMAYO', 1307, 1);

-- 3.2 DISTRITOS LA LIBERTAD
-- Provincia CHEPEN (provincia_id = 1)
INSERT INTO distritos (nombre, codigo_distrito, provincia_id) VALUES
('CHEPEN', 130401, 1),
('PACANGA', 130402, 1),
('PUEBLO NUEVO', 130403, 1);

-- Provincia PACASMAYO (provincia_id = 2)
INSERT INTO distritos (nombre, codigo_distrito, provincia_id) VALUES
('SAN PEDRO DE LLOC', 130701, 2),
('GUADALUPE', 130702, 2),
('JEQUETEPEQUE', 130703, 2),
('PACASMAYO', 130704, 2),
('SAN JOSÉ', 130705, 2);

-- 3.3 CENTROS POBLADOS LA LIBERTAD
-- DISTRITO CHEPÉN (distrito_id = 1)
INSERT INTO centros_poblados (nombre, codigo_centro, distrito_id) VALUES
('CHEPEN', 1, 1),
('SANTA VICTORIA', 3, 1),
('ISLA ALTA', 4, 1),
('PAMPA LARGA', 5, 1),
('EL SALVADOR', 6, 1),
('SANTA CECILIA', 7, 1),
('MANCOCHITO', 8, 1),
('CATALUÑA', 9, 1),
('NUEVO PARAISO', 10, 1),
('TALAMBO', 12, 1),
('CHEPEN ALTO', 13, 1),
('ALGARROBAL DE TALAMBO', 14, 1),
('LA MORANA', 15, 1),
('MARISCAL LA MAR', 16, 1),
('CALERA BAJA', 17, 1),
('CALERA ALTA', 18, 1),
('PUENTE MAYTA', 19, 1),
('LA PUNTA', 21, 1),
('PUENTE GUADALUPE', 22, 1),
('ALGARROBAL DE SAN MATEO', 23, 1),
('SAN MATEO', 24, 1),
('SAN SIMON', 25, 1),
('HUABAL', 26, 1),
('LA ARENITA', 27, 1),
('ZAPOTAL', 28, 1),
('EL POLVORIN', 29, 1),
('EL SALVADOR', 30, 1),
('MANCOCHE ALTO', 31, 1),
('PUENTE CHEPEN', 32, 1),
('BUENOS AIRES', 33, 1),
('KEIKO SOFIA', 34, 1);

-- DISTRITO PACANGA (distrito_id = 2)
INSERT INTO centros_poblados (nombre, codigo_centro, distrito_id) VALUES
('PACANGA', 1, 2),
('CERRO PRIETO', 2, 2),
('CERRO BLANCO', 3, 2),
('HUACA BLANCA', 4, 2),
('VENTANILLA', 5, 2),
('CHOCOFAN', 6, 2),
('CAMALACHE', 7, 2),
('SINGALAN', 8, 2),
('PAMPA COLORADA', 9, 2),
('TECAPA', 10, 2);

-- DISTRITO PUEBLO NUEVO (distrito_id = 3)
INSERT INTO centros_poblados (nombre, codigo_centro, distrito_id) VALUES
('PUEBLO NUEVO', 1, 3),
('CIUDAD DE DIOS', 2, 3),
('SANTA ROSA DE LIMA', 3, 3),
('CALERA', 4, 3),
('TRES UNIDOS', 5, 3);

-- DISTRITO SAN PEDRO DE LLOC (distrito_id = 4)
INSERT INTO centros_poblados (nombre, codigo_centro, distrito_id) VALUES
('SAN PEDRO DE LLOC', 1, 4),
('SANTA ELENA', 2, 4),
('FARFAN', 3, 4),
('CHEPEN ALTO', 4, 4),
('JATANCA', 5, 4);

-- DISTRITO GUADALUPE (distrito_id = 5)
INSERT INTO centros_poblados (nombre, codigo_centro, distrito_id) VALUES
('GUADALUPE', 1, 5),
('MOCUPE', 2, 5),
('PACANGA', 3, 5),
('SAN JOSE', 4, 5),
('LIMONCARRO', 5, 5);

-- DISTRITO JEQUETEPEQUE (distrito_id = 6)
INSERT INTO centros_poblados (nombre, codigo_centro, distrito_id) VALUES
('JEQUETEPEQUE', 1, 6),
('SAN PEDRO', 2, 6),
('CHAMAN', 3, 6);

-- DISTRITO PACASMAYO (distrito_id = 7)
INSERT INTO centros_poblados (nombre, codigo_centro, distrito_id) VALUES
('PACASMAYO', 1, 7),
('SAN MARTIN', 2, 7),
('EL MILAGRO', 3, 7);

-- DISTRITO SAN JOSÉ (distrito_id = 8)
INSERT INTO centros_poblados (nombre, codigo_centro, distrito_id) VALUES
('SAN JOSÉ', 1, 8),
('VENTANILLAS', 2, 8),
('SANTA MARIA', 3, 8);

-- ===================================================================
-- SECCIÓN 4: DATOS LAMBAYEQUE COMPLETO
-- ===================================================================

-- 4.1 PROVINCIAS LAMBAYEQUE
INSERT INTO provincias (id, nombre, codigo_provincia, departamento_id) VALUES
(4, 'CHICLAYO', 1401, 2),
(5, 'FERREÑAFE', 1402, 2),
(6, 'LAMBAYEQUE', 1403, 2);

-- 4.2 DISTRITOS LAMBAYEQUE
-- Provincia CHICLAYO (provincia_id = 4)
INSERT INTO distritos (id, nombre, codigo_distrito, provincia_id) VALUES
(21, 'CHICLAYO', 140101, 4),
(22, 'CHONGOYAPE', 140102, 4),
(23, 'ETEN', 140103, 4),
(24, 'ETEN PUERTO', 140104, 4),
(25, 'JOSE LEONARDO ORTIZ', 140105, 4),
(26, 'LA VICTORIA', 140106, 4),
(27, 'LAGUNAS', 140107, 4),
(28, 'MONSEFU', 140108, 4),
(29, 'NUEVA ARICA', 140109, 4),
(30, 'OYOTUN', 140110, 4),
(31, 'PICSI', 140111, 4),
(32, 'PIMENTEL', 140112, 4),
(33, 'REQUE', 140113, 4),
(34, 'SANTA ROSA', 140114, 4),
(35, 'SAÑA', 140115, 4),
(36, 'CAYALTI', 140116, 4),
(37, 'PATAPO', 140117, 4),
(38, 'POMALCA', 140118, 4),
(39, 'PUCALA', 140119, 4),
(40, 'TUMAN', 140120, 4);

-- Provincia FERREÑAFE (provincia_id = 5)
INSERT INTO distritos (id, nombre, codigo_distrito, provincia_id) VALUES
(41, 'FERREÑAFE', 140201, 5),
(42, 'PITIPO', 140205, 5);

-- Provincia LAMBAYEQUE (provincia_id = 6)
INSERT INTO distritos (id, nombre, codigo_distrito, provincia_id) VALUES
(43, 'LAMBAYEQUE', 140301, 6),
(44, 'ILLIMO', 140303, 6),
(45, 'MOCHUMI', 140305, 6),
(46, 'MORROPE', 140306, 6),
(47, 'PACORA', 140309, 6),
(48, 'SAN JOSE', 140311, 6),
(49, 'TUCUME', 140312, 6);

-- 4.3 CENTROS POBLADOS LAMBAYEQUE
-- DISTRITO CHICLAYO (distrito_id = 21)
INSERT INTO centros_poblados (nombre, codigo_centro, distrito_id) VALUES
('CHICLAYO', 1, 21),
('SAN LUIS', 3, 21);

-- DISTRITO CHONGOYAPE (distrito_id = 22)
INSERT INTO centros_poblados (nombre, codigo_centro, distrito_id) VALUES
('CHONGOYAPE', 1, 22),
('PAMPA DE CHAPARRI', 2, 22),
('YAIPON', 3, 22),
('PALO BLANCO', 4, 22),
('MIRADOR', 5, 22),
('CERRILLOS', 6, 22),
('MOJONAZGO', 8, 22),
('LAS COLMENAS', 9, 22),
('OVERRAZAL', 10, 22),
('EL CUELLO', 11, 22),
('PAREDONES', 12, 22),
('TIERRAS BLANCAS', 13, 22),
('JUANA RIOS', 14, 22),
('POTRERILLO', 17, 22),
('PIEDRA PARADA', 18, 22),
('ZAPOTAL-TINAJONES', 20, 22),
('GUAYAQUIL', 21, 22),
('LOS LIBERTADORES (LA LIBERTAD)', 24, 22),
('LAS MINAS', 25, 22),
('HUACA BLANCA', 27, 22),
('CAMPO NUEVO', 28, 22),
('LOS PALTOS', 30, 22),
('PAMPA DE TABLAZOS', 32, 22),
('MAL PASO', 34, 22),
('SAN MARTIN', 35, 22),
('CRUCE DE TABLAZOS', 37, 22),
('TABLAZOS', 38, 22),
('CUCULI EL PALMO SAN JUAN', 39, 22),
('GARRASPIÑA', 41, 22),
('WADINGTON BAJO', 42, 22),
('LA MONTERIA', 43, 22),
('BOCA DE TIGRE', 44, 22),
('PAMPA GRANDE', 45, 22),
('LA PARRA', 48, 22),
('WADINGTON ALTO', 49, 22),
('EL ALGARROBAL', 50, 22),
('JACOBITA', 51, 22),
('RESERVA CHAPARRI', 54, 22),
('LOS ALGARROBOS', 56, 22),
('LA CAIDA', 57, 22),
('LAS VEGAS', 58, 22),
('CERRO CANTA GALLO', 59, 22),
('LA PUNTILLA', 60, 22),
('LA CASCADA', 64, 22),
('LA RAMADITA', 67, 22),
('URBANIZACION EL NIÑO', 68, 22);
