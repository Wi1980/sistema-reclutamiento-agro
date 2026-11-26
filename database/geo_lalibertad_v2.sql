-- ============================================================
-- MIGRACIÓN: La Libertad v2 (dataset completo)
-- Borra data anterior de La Libertad y la reemplaza.
-- Lambayeque NO se toca.
-- ============================================================
USE agroexportadora_db;

SET FOREIGN_KEY_CHECKS = 0;

-- 1. Limpiar centros_poblados y distritos de La Libertad (IDs 1-8)
DELETE FROM centros_poblados WHERE distrito_id IN (1,2,3,4,5,6,7,8);
DELETE FROM distritos         WHERE id          IN (1,2,3,4,5,6,7,8);

-- 2. Corregir nombre de provincia CHEPÉN (acento)
UPDATE provincias SET nombre = 'CHEPÉN' WHERE id = 1;

-- 3. Re-insertar distritos con nombres correctos y mismos IDs
INSERT INTO distritos (id, nombre, codigo_distrito, provincia_id) VALUES
(1, 'CHEPÉN',            130401, 1),
(2, 'PACANGA',           130402, 1),
(3, 'PUEBLO NUEVO',      130403, 1),
(4, 'SAN PEDRO DE LLOC', 130701, 2),
(5, 'GUADALUPE',         130702, 2),
(6, 'JEQUETEPEQUE',      130703, 2),
(7, 'PACASMAYO',         130704, 2),
(8, 'SAN JOSÉ',          130705, 2);

-- 4. Insertar centros_poblados completos (nuevos)
-- Códigos: dist_codigo → distrito_id
-- '130401'→1  '130402'→2  '130403'→3
-- '130701'→4  '130702'→5  '130703'→6  '130704'→7  '130705'→8

-- ── CHEPÉN (1) ──────────────────────────────────────────────
INSERT INTO centros_poblados (nombre, codigo_centro, distrito_id) VALUES
('CHEPEN',                   1, 1),
('SANTA VICTORIA',           3, 1),
('ISLA ALTA',                4, 1),
('PAMPA LARGA',              5, 1),
('EL SALVADOR',              6, 1),
('SANTA CECILIA',            7, 1),
('MANCOCHITO',               8, 1),
('CATALUÑA',                 9, 1),
('NUEVO PARAISO',           10, 1),
('TALAMBO',                 12, 1),
('CHEPEN ALTO',             13, 1),
('ALGARROBAL DE TALAMBO',   14, 1),
('LA MORANA',               15, 1),
('MARISCAL LA MAR',         16, 1),
('CALERA BAJA',             17, 1),
('CALERA ALTA',             18, 1),
('PUENTE MAYTA',            19, 1),
('LA PUNTA',                21, 1),
('PUENTE GUADALUPE',        22, 1),
('ALGARROBAL DE SAN MATEO', 23, 1),
('SAN MATEO',               24, 1),
('SAN SIMON',               25, 1),
('HUABAL',                  26, 1),
('LA ARENITA',              27, 1),
('ZAPOTAL',                 28, 1),
('EL POLVORIN',             29, 1),
('EL SALVADOR',             30, 1),
('MANCOCHE ALTO',           31, 1),
('PUENTE CHEPEN',           32, 1),
('BUENOS AIRES',            33, 1),
('KEIKO SOFIA',             34, 1);

-- ── PACANGA (2) ─────────────────────────────────────────────
INSERT INTO centros_poblados (nombre, codigo_centro, distrito_id) VALUES
('PACANGA',                    1, 2),
('NUEVA ESPERANZA',            2, 2),
('PAMPA LAS SANDIAS',          4, 2),
('SAN JUAN DE DIOS',           5, 2),
('CERRO COLORADO',             9, 2),
('MONTE SECO',                11, 2),
('TIERRAS NUEVAS',            12, 2),
('SEBASTROPOL',               13, 2),
('CUCHARA',                   14, 2),
('MARTIN SANCHEZ',            16, 2),
('HUACA BLANCA BAJA',         17, 2),
('EL TRUST',                  18, 2),
('PACANGUILLA',               19, 2),
('TAMBILLO',                  20, 2),
('EL SANJON',                 24, 2),
('LA CAMPIÑA DE MOFO',        25, 2),
('CABO VERDE',                26, 2),
('EL TRIUNFO',                28, 2),
('SAN GERARDO',               29, 2),
('QUITO',                     30, 2),
('SAN JOSE DE MORO (MORO)',   32, 2),
('HUACA DE LAS ESTACAS',      33, 2),
('CAIN',                      34, 2),
('LOS PARQUES',               35, 2),
('HUACA BLANCA ALTA',         36, 2),
('KAWACHI',                   37, 2),
('TRUST BAJO',                38, 2),
('TRUST ALTO',                39, 2),
('EL ALGARROBAL',             42, 2),
('NUEVA JERUSALEN',           43, 2),
('EL PORVENIR',               44, 2),
('LA FLORIDA',                45, 2),
('HUACA CHINA',               46, 2),
('LA VIÑA',                   47, 2),
('CERRO BLANCO',              48, 2),
('PRIMERO DE MAYO',           50, 2),
('SAN CAYETANO',              51, 2),
('SANTA ELENA',               52, 2),
('TELEFONO',                  53, 2),
('CRUZ DE LA LEGUA',          54, 2),
('CAIN ALTO LA LUNA',         55, 2),
('HUACA RAJADA',              56, 2),
('BETHEL',                    57, 2),
('CERRO COLORADO',            58, 2);

-- ── PUEBLO NUEVO (3) ────────────────────────────────────────
INSERT INTO centros_poblados (nombre, codigo_centro, distrito_id) VALUES
('PUEBLO NUEVO',                  1, 3),
('NUEVO HORIZONTE-BUENOS AIRES',  2, 3),
('ALTO SAN ILDEFONSO',            3, 3),
('SAN ISIDRO',                    4, 3),
('SANTA MARIA',                   5, 3),
('SANTA ROSA',                    6, 3),
('TAHUANTINSUYO',                 7, 3),
('SAN EUGENIO',                   9, 3),
('HUANCHACO',                    10, 3),
('NUEVA ESPERANZA',              11, 3),
('CHARCAPE',                     12, 3),
('UJIAN',                        13, 3),
('EL MILAGRO-MOLINO',            14, 3),
('AVIACION',                     15, 3),
('GEIPE BAJO',                   17, 3),
('GUANABANO',                    18, 3),
('QUEMBER',                      19, 3),
('LA PAMPILLA',                  20, 3),
('LA GRANJA',                    21, 3),
('LA MANGA',                     22, 3),
('SANTA CATALINA',               23, 3),
('EL ALGARROBAL',                24, 3),
('EL PROGRESO',                  25, 3),
('NUEVO MONTE GRANDE',           26, 3),
('PUERTO CHERREPE',              27, 3),
('PRIETO',                       28, 3),
('LA BOCANA',                    29, 3),
('PLAYA GRANDE',                 30, 3),
('GEIPE ALTO',                   33, 3),
('SANTIAGO',                     34, 3),
('BLAYS',                        35, 3),
('MAFFEQUIN',                    36, 3),
('IGLESIA VIEJA',                37, 3),
('NUEVO MUNDO',                  38, 3),
('LA TERESA',                    39, 3),
('EL POTRERO',                   40, 3),
('MANANGUICHE',                  41, 3),
('HUACA BLANCA',                 42, 3),
('COTON',                        43, 3),
('LA MARIPOSA',                  44, 3),
('EL TRIGO',                     45, 3),
('EL HORNO',                     47, 3);

-- ── SAN PEDRO DE LLOC (4) ───────────────────────────────────
INSERT INTO centros_poblados (nombre, codigo_centro, distrito_id) VALUES
('SAN PEDRO DE LLOC',        1, 4),
('MASANCA',                  2, 4),
('CAVOUR',                   3, 4),
('SANTONTE',                 4, 4),
('CHOCOFAN',                 5, 4),
('CHASCARRAPE',              6, 4),
('JATANCA',                  7, 4),
('CRUCE EL HORNITO',         8, 4),
('EL HORNITO',               9, 4),
('PUEBLO LIBRE',            10, 4),
('EL MILAGRO',              11, 4),
('SAN DEMETRIO',            12, 4),
('BUENOS AIRES',            13, 4),
('PUEMAPE',                 14, 4),
('CERRO CHILCO',            15, 4),
('EL SOLANO',               16, 4),
('LA CONSTANCIA',           17, 4),
('SANTA ELENA',             18, 4),
('CALA',                    19, 4),
('DIOS TEDE',               20, 4),
('BRISAS DE PACASMAYO',     21, 4);

-- ── GUADALUPE (5) ───────────────────────────────────────────
INSERT INTO centros_poblados (nombre, codigo_centro, distrito_id) VALUES
('GUADALUPE',                1, 5),
('ALTO PERU',                2, 5),
('EL HUABITO',               3, 5),
('SEMAN',                    4, 5),
('CAMPO ARTURO',             5, 5),
('LOS JARDINES',             7, 5),
('CASA BLANCA',              8, 5),
('NUEVO GUADALUPE',          9, 5),
('LA CINTA',                10, 5),
('LOS MANGOS',              11, 5),
('CALERA',                  13, 5),
('CERRO AZUL',              14, 5),
('EL APRA',                 15, 5),
('PRIMER CAMPO',            16, 5),
('LA LAGUNA',               17, 5),
('JORGE CHAVEZ',            18, 5),
('MARISCAL CASTILLA',       19, 5),
('CHAFAN GRANDE',           22, 5),
('LIMONCARRO',              23, 5),
('TAMARINDO',               24, 5),
('CIUDAD DE DIOS',          25, 5),
('MANUEL GUARNIZ',          26, 5),
('FACLO CHICO',             27, 5),
('NUEVA ESPERANZA',         28, 5),
('FACLO GRANDE',            29, 5),
('LA BARRANCA',             30, 5),
('CRUZ DE GUAYABO',         31, 5),
('LUIS SILVA',              32, 5),
('PAMPAS DE JESUS',         33, 5),
('LA PLANTA',               34, 5),
('SANJON MARINUÑEZ',        39, 5),
('PAMPILLA BAJA',           40, 5),
('LAS BRISAS',              41, 5),
('CHUNGALITO',              42, 5),
('MANUEL TIRADO',           48, 5),
('ALTO MIRAMAR',            49, 5);

-- ── JEQUETEPEQUE (6) ────────────────────────────────────────
INSERT INTO centros_poblados (nombre, codigo_centro, distrito_id) VALUES
('JEQUETEPEQUE',         1, 6),
('MONTE VERDE',          3, 6),
('LA VENTUROSA',         4, 6),
('LA PEÑA',              7, 6),
('LACHE GRANDE',         8, 6),
('LACHE CHICO',          9, 6),
('HUASCAR',             10, 6),
('LETANA',              11, 6),
('COLLIQUE',            12, 6),
('DAMAS ARIAS',         13, 6),
('SAUSAL',              14, 6),
('PLATANAR',            16, 6),
('PUENTE ZAMBRANO',     20, 6),
('SANTA MARTHA',        21, 6),
('EL BALZAR',           23, 6),
('LA PRIMAVERA',        24, 6),
('CACHO DE VENADO',     27, 6),
('ZANJON',              28, 6),
('LA FLORIDA',          29, 6),
('SANTA APOLONIA',      30, 6),
('LAS CALABERAS',       31, 6),
('BOCA DEL RIO',        33, 6),
('LOS GUABOS',          34, 6),
('ALTO JEQUETEPEQUE',   37, 6),
('LA QUIRIVA',          39, 6),
('EL ALFALFARITO',      40, 6),
('LA JULIANA',          41, 6);

-- ── PACASMAYO (7) ───────────────────────────────────────────
INSERT INTO centros_poblados (nombre, codigo_centro, distrito_id) VALUES
('PACASMAYO',                    1, 7),
('LAGUNA DEL MUERTO IZQUIERDO',  5, 7),
('QUEBRADA DE LA CEBRUNA',       6, 7);

-- ── SAN JOSÉ (8) ────────────────────────────────────────────
INSERT INTO centros_poblados (nombre, codigo_centro, distrito_id) VALUES
('SAN JOSE',                                 1, 8),
('CRUCE SAN MARTIN DE PORRES',               2, 8),
('ÑAMPOL',                                   3, 8),
('COSQUE',                                   4, 8),
('CULTAMBO',                                 5, 8),
('NUEVA ESPERANZA',                          6, 8),
('INFIERNILLO DE CHAFAN',                    7, 8),
('LAS VEGAS',                                8, 8),
('LA PORTADA DE LA SIERRA',                  9, 8),
('EL INFIERNILLO',                          10, 8),
('LA VIÑA',                                 11, 8),
('JAGUEY',                                  12, 8),
('POTRERO',                                 14, 8),
('TECAPA',                                  15, 8),
('SANTA MARIA DE TECAPA',                   16, 8),
('COSQUEPON',                               17, 8),
('ALTO JAGUEY',                             18, 8),
('LA HUACA',                                19, 8),
('QUEBRACHO',                               20, 8),
('PUEBLO NUEVO',                            21, 8),
('PAMPA DE LA CEBRUNA',                     22, 8),
('PUENTE CULTAMBO',                         32, 8),
('NUEVO CULTAMBO',                          33, 8);

SET FOREIGN_KEY_CHECKS = 1;
