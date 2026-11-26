import { Request, Response } from 'express';
import * as XLSX from 'xlsx';
import pool from '../config/database';
import { logger } from '../utils/logger';
import { audit, AuditAction, AuditEntity } from '../services/audit.service';

// Tipo auxiliar para requests con archivo subido por multer
type FileRequest = Request & { file?: Express.Multer.File };

// Columnas reconocidas en el Excel (nombres normalizados a minúsculas sin tildes)
const ALIAS: Record<string, string> = {
  // DNI
  'dni': 'dni', 'numero de documento': 'dni', 'num documento': 'dni',
  'documento': 'dni', 'nro dni': 'dni',
  // Nombres
  'nombres': 'nombres', 'nombre': 'nombres', 'primer nombre': 'nombres',
  // Apellidos
  'apellidos': 'apellidos', 'apellido': 'apellidos',
  // Nombre completo (se parte en nombres/apellidos si no hay columnas separadas)
  'nombre completo': 'nombre_completo', 'nombres y apellidos': 'nombre_completo',
  // Celular
  'celular': 'celular', 'telefono': 'celular', 'telefono celular': 'celular',
  'cel': 'celular', 'numero celular': 'celular',
  // Ubicación
  'departamento': 'departamento', 'dept': 'departamento',
  'provincia': 'provincia', 'prov': 'provincia',
  'distrito': 'distrito', 'dist': 'distrito',
  'centro poblado': 'centro_poblado', 'centro_poblado': 'centro_poblado',
  'cp': 'centro_poblado', 'c.p.': 'centro_poblado',
  // Trabajador — ingreso
  'fecha ingreso': 'fecha_ingreso', 'fecha de ingreso': 'fecha_ingreso',
  'ingreso': 'fecha_ingreso', 'fecha_ingreso': 'fecha_ingreso',
  // Trabajador — baja
  'fecha baja': 'fecha_baja', 'fecha de baja': 'fecha_baja',
  'cese': 'fecha_baja', 'fecha cese': 'fecha_baja', 'fecha de cese': 'fecha_baja',
  'fecha_baja': 'fecha_baja',
  'motivo': 'motivo', 'motivo baja': 'motivo', 'motivo cese': 'motivo', 'motivo_baja': 'motivo',
};

const MOTIVOS_BAJA_VALIDOS = ['Renuncia','Fin de contrato','Abandono','Falta grave','Accidente','Enfermedad','Otro'];

/** Convierte DD-MM-YYYY o YYYY-MM-DD → YYYY-MM-DD para MySQL */
function parseFecha(raw: string): string {
  const s = String(raw).trim();
  // DD-MM-YYYY o DD/MM/YYYY
  const dmy = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`;
  // YYYY-MM-DD (ya correcto)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return s;
}

/** Fecha de hoy en Lima (UTC-5) en YYYY-MM-DD */
function fechaHoy(): string {
  const d = new Date(Date.now() - 5 * 60 * 60 * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
}

function normalize(str: string): string {
  return str.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mapHeaders(rawHeaders: string[]): Record<number, string> {
  const map: Record<number, string> = {};
  rawHeaders.forEach((h, i) => {
    const key = normalize(String(h ?? ''));
    if (ALIAS[key]) { map[i] = ALIAS[key]; return; }
    // Coincidencia tolerante por prefijo: tolera sufijos como "(DD/MM/AAAA)"
    if (key.startsWith('fecha ingreso') || key.startsWith('fecha de ingreso')) { map[i] = 'fecha_ingreso'; return; }
    if (key.startsWith('fecha baja') || key.startsWith('fecha de baja') ||
        key.startsWith('fecha cese') || key.startsWith('fecha de cese')) { map[i] = 'fecha_baja'; return; }
  });
  return map;
}

// ── POST /import/dni-excel ──────────────────────────────────────────────────
export async function importarDniExcel(req: FileRequest, res: Response): Promise<void> {
  if (!req.file) {
    res.status(400).json({ success: false, message: 'No se recibió ningún archivo' });
    return;
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
  } catch {
    res.status(400).json({ success: false, message: 'Archivo Excel inválido o corrupto' });
    return;
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    res.status(400).json({ success: false, message: 'El archivo no contiene hojas' });
    return;
  }

  const sheet = workbook.Sheets[sheetName];
  const rawRows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '', raw: false });

  if (rawRows.length < 2) {
    res.status(400).json({ success: false, message: 'El archivo está vacío o solo tiene encabezados' });
    return;
  }

  const headerRow = rawRows[0] as string[];
  const colMap    = mapHeaders(headerRow);

  const hasDni = Object.values(colMap).includes('dni');
  if (!hasDni) {
    res.status(400).json({
      success: false,
      message: 'No se encontró columna DNI. Columnas reconocidas: "DNI", "Numero de Documento", "Documento"',
      columns_found: headerRow,
    });
    return;
  }

  interface RowResult {
    fila: number;
    dni: string;
    estado: 'importado' | 'duplicado' | 'error';
    mensaje?: string;
  }

  const results: RowResult[]  = [];
  const batchSize             = 50;
  let   importados            = 0;
  let   duplicados            = 0;
  let   errores               = 0;

  const dataRows = rawRows.slice(1) as any[][];

  for (let i = 0; i < dataRows.length; i += batchSize) {
    const batch = dataRows.slice(i, i + batchSize);
    for (const [batchIdx, rawRow] of batch.entries()) {
      const rowIdx = i + batchIdx + 2; // 1-indexed, +1 para encabezado
      const row    = rawRow as any[];

      const getCol = (field: string): string => {
        const colIdx = Object.entries(colMap).find(([, v]) => v === field)?.[0];
        return colIdx !== undefined ? String(row[Number(colIdx)] ?? '').trim() : '';
      };

      let dni = getCol('dni').replace(/\D/g, '');

      // Cero-pad hasta 8 dígitos
      if (dni.length > 0 && dni.length < 8) dni = dni.padStart(8, '0');

      if (!dni || dni.length < 8 || dni.length > 12) {
        results.push({ fila: rowIdx, dni: getCol('dni'), estado: 'error', mensaje: 'DNI inválido' });
        errores++;
        continue;
      }

      let nombres  = getCol('nombres');
      let apellidos = getCol('apellidos');

      // Si hay nombre_completo y no hay nombres+apellidos separados, partir por espacio
      if (!nombres && !apellidos) {
        const completo = getCol('nombre_completo').trim();
        if (completo) {
          const partes = completo.split(/\s+/);
          if (partes.length >= 2) {
            nombres   = partes.slice(0, Math.ceil(partes.length / 2)).join(' ');
            apellidos = partes.slice(Math.ceil(partes.length / 2)).join(' ');
          } else {
            nombres = completo;
          }
        }
      }

      const celular     = getCol('celular').replace(/\D/g, '');
      const departamento = getCol('departamento') || null;
      const provincia    = getCol('provincia')    || null;
      const distrito     = getCol('distrito')     || null;

      try {
        const [[existing]] = await pool.execute<any[]>(
          `SELECT id FROM postulantes WHERE dni = ? LIMIT 1`,
          [dni]
        );

        if (existing) {
          results.push({ fila: rowIdx, dni, estado: 'duplicado', mensaje: 'Ya existe en el sistema' });
          duplicados++;
          continue;
        }

        const [[campActiva]] = await pool.execute<any[]>(
          `SELECT id FROM campanas
           WHERE estado = 'activa'
             AND fecha_inicio <= CURDATE()
             AND (fecha_fin IS NULL OR fecha_fin >= CURDATE())
           ORDER BY fecha_inicio DESC LIMIT 1`,
          []
        );

        await pool.execute(
          `INSERT INTO postulantes
             (nombres, apellidos, dni, celular, departamento, provincia, distrito,
              estado, importado_por, campana_id, created_at)
           VALUES (?,?,?,?,?,?,?, 'Pendiente', ?, ?, UTC_TIMESTAMP())`,
          [
            nombres   || 'Sin nombre',
            apellidos || 'Sin apellido',
            dni,
            celular   || '000000000',
            departamento || null,
            provincia    || null,
            distrito     || null,
            req.user!.sub,
            campActiva?.id ?? null,
          ]
        );

        results.push({ fila: rowIdx, dni, estado: 'importado' });
        importados++;
      } catch (err) {
        logger.error(`importarDniExcel row ${rowIdx}:`, err);
        results.push({ fila: rowIdx, dni, estado: 'error', mensaje: 'Error de base de datos' });
        errores++;
      }
    }
  }

  audit({
    usuarioId: req.user!.sub, usuarioNombre: req.user!.nombre,
    accion: AuditAction.POST_EXPORT, entidadTipo: AuditEntity.POSTULANTE,
    entidadId: 0,
    valoresNuevos: { archivo: req.file.originalname, importados, duplicados, errores },
    ip: req.ip, userAgent: req.headers['user-agent'],
  });

  res.json({
    success: true,
    message: `Importación completada: ${importados} importados, ${duplicados} duplicados, ${errores} errores`,
    summary: { importados, duplicados, errores, total: dataRows.length },
    rows: results,
  });
}

// ── POST /import/trabajadores-excel ────────────────────────────────────────
// Sube Excel con DNIs → busca postulante → crea trabajador → marca "Ingresó"
export async function importarTrabajadoresExcel(req: FileRequest, res: Response): Promise<void> {
  if (!req.file) {
    res.status(400).json({ success: false, message: 'No se recibió ningún archivo' });
    return;
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
  } catch {
    res.status(400).json({ success: false, message: 'Archivo Excel inválido o corrupto' });
    return;
  }

  const sheet    = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows  = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '', raw: false });
  if (rawRows.length < 2) {
    res.status(400).json({ success: false, message: 'El archivo está vacío o solo tiene encabezados' });
    return;
  }

  const colMap = mapHeaders(rawRows[0] as string[]);
  if (!Object.values(colMap).includes('dni')) {
    res.status(400).json({
      success: false,
      message: 'No se encontró columna DNI',
      columns_found: rawRows[0],
    });
    return;
  }

  interface RowResult {
    fila: number; dni: string;
    nombre: string;
    estado: 'registrado' | 'reingreso' | 'duplicado' | 'no_encontrado' | 'error';
    mensaje?: string;
  }

  const results: RowResult[] = [];
  let registrados = 0, reingresos = 0, duplicados = 0, noEncontrados = 0, errores = 0;

  for (const [idx, rawRow] of (rawRows.slice(1) as any[][]).entries()) {
    const rowIdx = idx + 2;
    const row    = rawRow as any[];

    const getCol = (field: string): string => {
      const colIdx = Object.entries(colMap).find(([, v]) => v === field)?.[0];
      return colIdx !== undefined ? String(row[Number(colIdx)] ?? '').trim() : '';
    };

    const rawDni = getCol('dni').trim();
    if (!rawDni) continue; // fila vacía — saltar silenciosamente

    let dni = rawDni.replace(/\D/g, '');
    if (dni.length > 0 && dni.length < 8) dni = dni.padStart(8, '0');
    if (!dni || dni.length < 8 || dni.length > 12) {
      results.push({ fila: rowIdx, dni: rawDni, nombre: '', estado: 'error', mensaje: 'DNI inválido' });
      errores++; continue;
    }

    const fechaRaw    = getCol('fecha_ingreso');
    const fechaIngreso = fechaRaw ? parseFecha(fechaRaw) : fechaHoy();

    try {
      // ¿Ya existe como trabajador con ese DNI?
      const [[trabExistente]] = await pool.execute<any[]>(
        `SELECT id, nombres, apellidos, estado, postulante_id, contrata_id, campana_id
         FROM trabajadores WHERE dni = ? LIMIT 1`,
        [dni]
      );

      if (trabExistente) {
        if (trabExistente.estado !== 'Baja') {
          // Activo o Reingreso → duplicado real
          results.push({
            fila: rowIdx, dni,
            nombre: `${trabExistente.nombres} ${trabExistente.apellidos}`,
            estado: 'duplicado',
            mensaje: `Ya activo como trabajador (${trabExistente.estado})`,
          });
          duplicados++; continue;
        }

        // Está en Baja → registrar reingreso en transacción
        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();

          // Intentar tomar contrata/campaña actuales del postulante vinculado
          let newContrataId = trabExistente.contrata_id;
          let newCampanaId  = trabExistente.campana_id;
          if (trabExistente.postulante_id) {
            const [[post]] = await conn.execute<any[]>(
              `SELECT assigned_to, campana_id FROM postulantes WHERE id = ? LIMIT 1`,
              [trabExistente.postulante_id]
            );
            if (post) {
              newContrataId = post.assigned_to ?? trabExistente.contrata_id;
              newCampanaId  = post.campana_id  ?? trabExistente.campana_id;
            }
          }

          await conn.execute(
            `UPDATE trabajadores
             SET estado = 'Reingreso', fecha_cese = NULL, motivo_cese = NULL,
                 contrata_id = COALESCE(?, contrata_id),
                 campana_id  = COALESCE(?, campana_id)
             WHERE id = ?`,
            [newContrataId, newCampanaId, trabExistente.id]
          );

          await conn.execute(
            `INSERT INTO reingresos
               (trabajador_id, fecha_reingreso, campana_id, contrata_id, observacion, registrado_por)
             VALUES (?, ?, ?, ?, 'Importado desde Excel', ?)`,
            [trabExistente.id, fechaIngreso, newCampanaId, newContrataId, req.user!.sub]
          );

          if (trabExistente.postulante_id) {
            await conn.execute(
              `UPDATE postulantes SET estado = 'Ingresó' WHERE id = ?`,
              [trabExistente.postulante_id]
            );
          }

          await conn.commit();
          results.push({
            fila: rowIdx, dni,
            nombre: `${trabExistente.nombres} ${trabExistente.apellidos}`,
            estado: 'reingreso',
          });
          reingresos++;
        } catch (reErr) {
          await conn.rollback();
          logger.error(`importarTrabajadoresExcel reingreso row ${rowIdx}:`, reErr);
          results.push({
            fila: rowIdx, dni,
            nombre: `${trabExistente.nombres} ${trabExistente.apellidos}`,
            estado: 'error', mensaje: 'Error al registrar reingreso',
          });
          errores++;
        } finally {
          conn.release();
        }
        continue;
      }

      // Buscar postulante por DNI (incluye contrata y campaña para heredarlos)
      const [[post]] = await pool.execute<any[]>(
        `SELECT id, nombres, apellidos, celular, departamento, provincia, distrito,
                centro_poblado, assigned_to, campana_id
         FROM postulantes WHERE dni = ? LIMIT 1`,
        [dni]
      );

      let nombres: string, apellidos: string, celular: string;
      let departamento: string | null, provincia: string | null, distrito: string | null;
      let centroPoblado: string | null = null;
      let postulanteId: number | null = null;
      let contrataId: number | null   = null;
      let campanaId:  number | null   = null;

      if (post) {
        nombres       = post.nombres;
        apellidos     = post.apellidos;
        celular       = post.celular;
        departamento  = post.departamento;
        provincia     = post.provincia;
        distrito      = post.distrito;
        centroPoblado = post.centro_poblado ?? null;
        postulanteId  = post.id;
        contrataId    = post.assigned_to  ?? null;
        campanaId     = post.campana_id   ?? null;
      } else {
        // DNI no encontrado en postulantes → no crear trabajador
        results.push({ fila: rowIdx, dni, nombre: '', estado: 'no_encontrado', mensaje: 'DNI no registrado en postulantes' });
        noEncontrados++; continue;
      }

      // Crear trabajador heredando contrata, campaña y centro_poblado del postulante
      const [result] = await pool.execute<any>(
        `INSERT INTO trabajadores
           (nombres, apellidos, dni, celular, departamento, provincia, distrito,
            centro_poblado, fecha_ingreso, postulante_id, contrata_id, campana_id, creado_por)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [nombres, apellidos, dni, celular, departamento, provincia, distrito,
         centroPoblado, fechaIngreso, postulanteId, contrataId, campanaId, req.user!.sub]
      );

      // Marcar postulante como Ingresó
      if (postulanteId) {
        await pool.execute(
          `UPDATE postulantes SET estado = 'Ingresó' WHERE id = ?`, [postulanteId]
        );
      }

      audit({
        usuarioId: req.user!.sub, usuarioNombre: req.user!.nombre,
        accion: AuditAction.TRAB_CREATE, entidadTipo: AuditEntity.TRABAJADOR,
        entidadId: (result as any).insertId,
        valoresNuevos: { dni, nombres, apellidos, fecha_ingreso: fechaIngreso, desde_excel: true },
        ip: req.ip, userAgent: req.headers['user-agent'],
      });

      results.push({ fila: rowIdx, dni, nombre: `${nombres} ${apellidos}`, estado: 'registrado' });
      registrados++;

    } catch (err) {
      logger.error(`importarTrabajadoresExcel row ${rowIdx}:`, err);
      results.push({ fila: rowIdx, dni, nombre: '', estado: 'error', mensaje: 'Error de base de datos' });
      errores++;
    }
  }

  res.json({
    success: true,
    message: `Importación completada: ${registrados} registrados, ${reingresos} reingresos, ${duplicados} duplicados, ${noEncontrados} no encontrados, ${errores} errores`,
    summary: { registrados, reingresos, duplicados, noEncontrados, errores, total: rawRows.length - 1 },
    rows: results,
  });
}

// ── GET /import/plantilla-excel ─────────────────────────────────────────────
// Genera y descarga una plantilla Excel de ejemplo
export function descargarPlantilla(_req: Request, res: Response): void {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['DNI', 'Nombres', 'Apellidos', 'Celular', 'Departamento', 'Provincia', 'Distrito'],
    ['12345678', 'Juan Carlos', 'García López', '987654321', 'LA LIBERTAD', 'TRUJILLO', 'TRUJILLO'],
    ['87654321', 'María Elena', 'Rodríguez Vega', '912345678', 'LA LIBERTAD', 'TRUJILLO', 'VÍCTOR LARCO HERRERA'],
  ]);

  // Ancho de columnas
  ws['!cols'] = [{ wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 24 }];

  XLSX.utils.book_append_sheet(wb, ws, 'Plantilla');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': 'attachment; filename="plantilla_importacion_dni.xlsx"',
    'Content-Length': buffer.length,
  });
  res.send(buffer);
}

// ── GET /import/plantilla-trabajadores ──────────────────────────────────────
export function descargarPlantillaTrabajadores(_req: Request, res: Response): void {
  const wb  = XLSX.utils.book_new();
  const hoy = fechaHoy(); // YYYY-MM-DD
  const [y, m, d] = hoy.split('-');
  const ejemplo   = `${d}/${m}/${y}`;
  const ws = XLSX.utils.aoa_to_sheet([
    ['DNI', 'Fecha Ingreso (DD/MM/AAAA)'],
    ['12345678', ejemplo],
    ['87654321', ejemplo],
  ]);
  ws['!cols'] = [{ wch: 14 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Trabajadores');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': 'attachment; filename="plantilla_ingreso_trabajadores.xlsx"',
    'Content-Length': buffer.length,
  });
  res.send(buffer);
}

// ── POST /import/bajas-excel ────────────────────────────────────────────────
// Sube Excel con DNI + Fecha de Baja → registra baja masiva de trabajadores
export async function importarBajasExcel(req: FileRequest, res: Response): Promise<void> {
  if (!req.file) {
    res.status(400).json({ success: false, message: 'No se recibió ningún archivo' });
    return;
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
  } catch {
    res.status(400).json({ success: false, message: 'Archivo Excel inválido o corrupto' });
    return;
  }

  const sheet   = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '', raw: false });
  if (rawRows.length < 2) {
    res.status(400).json({ success: false, message: 'El archivo está vacío o solo tiene encabezados' });
    return;
  }

  const colMap = mapHeaders(rawRows[0] as string[]);
  if (!Object.values(colMap).includes('dni')) {
    res.status(400).json({
      success: false,
      message: 'No se encontró columna DNI',
      columns_found: rawRows[0],
    });
    return;
  }

  interface RowResult {
    fila:   number;
    dni:    string;
    nombre: string;
    estado: 'procesado' | 'ya_en_baja' | 'no_encontrado' | 'error';
    mensaje?: string;
  }

  const results: RowResult[] = [];
  let procesados = 0, yaEnBaja = 0, noEncontrados = 0, errores = 0;

  for (const [idx, rawRow] of (rawRows.slice(1) as any[][]).entries()) {
    const rowIdx = idx + 2;
    const row    = rawRow as any[];

    const getCol = (field: string): string => {
      const colIdx = Object.entries(colMap).find(([, v]) => v === field)?.[0];
      return colIdx !== undefined ? String(row[Number(colIdx)] ?? '').trim() : '';
    };

    const rawDni = getCol('dni').trim();
    if (!rawDni) continue;

    let dni = rawDni.replace(/\D/g, '');
    if (dni.length > 0 && dni.length < 8) dni = dni.padStart(8, '0');
    if (!dni || dni.length < 8 || dni.length > 12) {
      results.push({ fila: rowIdx, dni: rawDni, nombre: '', estado: 'error', mensaje: 'DNI inválido' });
      errores++; continue;
    }

    const fechaRaw  = getCol('fecha_baja');
    const fechaBaja = fechaRaw ? parseFecha(fechaRaw) : fechaHoy();

    // Motivo: tomar del Excel o usar default
    const motivoRaw = getCol('motivo').trim();
    const motivo    = MOTIVOS_BAJA_VALIDOS.includes(motivoRaw) ? motivoRaw : 'Fin de contrato';

    try {
      const [[trab]] = await pool.execute<any[]>(
        `SELECT id, nombres, apellidos, estado, postulante_id
         FROM trabajadores WHERE dni = ? LIMIT 1`,
        [dni]
      );

      if (!trab) {
        results.push({ fila: rowIdx, dni, nombre: '', estado: 'no_encontrado', mensaje: 'No registrado como trabajador' });
        noEncontrados++; continue;
      }

      if (trab.estado === 'Baja') {
        results.push({
          fila: rowIdx, dni,
          nombre: `${trab.nombres} ${trab.apellidos}`,
          estado: 'ya_en_baja', mensaje: 'Ya registrado en baja',
        });
        yaEnBaja++; continue;
      }

      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();

        await conn.execute(
          `UPDATE trabajadores SET estado = 'Baja', fecha_cese = ?, motivo_cese = ? WHERE id = ?`,
          [fechaBaja, motivo, trab.id]
        );

        await conn.execute(
          `INSERT INTO bajas (trabajador_id, fecha_baja, motivo, observacion, registrado_por)
           VALUES (?, ?, ?, 'Importado desde Excel', ?)`,
          [trab.id, fechaBaja, motivo, req.user!.sub]
        );

        // Liberar postulante vinculado: vuelve al pool de reclutamiento
        if (trab.postulante_id) {
          await conn.execute(
            `UPDATE postulantes
             SET estado = 'Pendiente', assigned_to = NULL,
                 assigned_at = NULL, assigned_by = NULL, fue_trabajador = 1
             WHERE id = ?`,
            [trab.postulante_id]
          );
        }

        await conn.commit();

        audit({
          usuarioId: req.user!.sub, usuarioNombre: req.user!.nombre,
          accion: AuditAction.TRAB_BAJA, entidadTipo: AuditEntity.TRABAJADOR,
          entidadId: Number(trab.id),
          valoresNuevos: { fecha_baja: fechaBaja, motivo, desde_excel: true },
          ip: req.ip, userAgent: req.headers['user-agent'],
        });

        results.push({ fila: rowIdx, dni, nombre: `${trab.nombres} ${trab.apellidos}`, estado: 'procesado' });
        procesados++;
      } catch (txErr) {
        await conn.rollback();
        logger.error(`importarBajasExcel row ${rowIdx}:`, txErr);
        results.push({ fila: rowIdx, dni, nombre: `${trab.nombres} ${trab.apellidos}`, estado: 'error', mensaje: 'Error al registrar baja' });
        errores++;
      } finally {
        conn.release();
      }
    } catch (err) {
      logger.error(`importarBajasExcel row ${rowIdx}:`, err);
      results.push({ fila: rowIdx, dni, nombre: '', estado: 'error', mensaje: 'Error de base de datos' });
      errores++;
    }
  }

  res.json({
    success: true,
    message: `Bajas procesadas: ${procesados} registradas, ${yaEnBaja} ya en baja, ${noEncontrados} no encontrados, ${errores} errores`,
    summary: { procesados, yaEnBaja, noEncontrados, errores, total: rawRows.length - 1 },
    rows: results,
  });
}

// ── POST /import/activos-excel ──────────────────────────────────────────────
// Carga masiva de personal ya activo: DNI + Nombres + Apellidos + Fecha Ingreso
// No requiere postulante previo — inserta directamente en trabajadores con estado Activo
export async function importarActivosExcel(req: FileRequest, res: Response): Promise<void> {
  if (!req.file) {
    res.status(400).json({ success: false, message: 'No se recibió ningún archivo' });
    return;
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: true });
  } catch {
    res.status(400).json({ success: false, message: 'Archivo Excel inválido o corrupto' });
    return;
  }

  const sheet   = workbook.Sheets[workbook.SheetNames[0]];
  const rawRows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '', raw: false });

  if (rawRows.length < 2) {
    res.status(400).json({ success: false, message: 'El archivo está vacío o solo tiene encabezados' });
    return;
  }

  const colMap = mapHeaders(rawRows[0] as string[]);
  if (!Object.values(colMap).includes('dni')) {
    res.status(400).json({
      success: false,
      message: 'No se encontró columna DNI. Encabezados reconocidos: "DNI", "Numero de Documento", "Documento"',
      columns_found: rawRows[0],
    });
    return;
  }

  if (!Object.values(colMap).includes('nombres') && !Object.values(colMap).includes('nombre_completo')) {
    res.status(400).json({
      success: false,
      message: 'No se encontró columna Nombres. Encabezados reconocidos: "Nombres", "Nombre", "Nombre Completo"',
      columns_found: rawRows[0],
    });
    return;
  }

  interface RowResult {
    fila:   number;
    dni:    string;
    nombre: string;
    estado: 'registrado' | 'reingreso' | 'actualizado' | 'duplicado' | 'blacklist' | 'error';
    mensaje?: string;
  }

  // Índice de columna por campo lógico (resuelto una sola vez)
  const colIndex: Record<string, number> = {};
  for (const [idxStr, field] of Object.entries(colMap)) colIndex[field] = Number(idxStr);
  const cell = (row: any[], field: string): string => {
    const i = colIndex[field];
    return i !== undefined ? String(row[i] ?? '').trim() : '';
  };

  // ── Fase 1: parsear y validar todas las filas en memoria (sin tocar la BD) ──
  interface ParsedRow {
    rowIdx: number; dni: string; nombres: string; apellidos: string;
    nombreCompleto: string; fechaIngreso: string;
  }
  const results: RowResult[] = [];
  const parsed: ParsedRow[]  = [];
  const dnisVistos           = new Set<string>();
  let registrados = 0, reingresos = 0, actualizados = 0, duplicados = 0, enBlacklist = 0, errores = 0;

  for (const [idx, rawRow] of (rawRows.slice(1) as any[][]).entries()) {
    const rowIdx = idx + 2;
    const row    = rawRow as any[];

    const rawDni = cell(row, 'dni');
    if (!rawDni) continue; // fila vacía

    let dni = rawDni.replace(/\D/g, '');
    if (dni.length > 0 && dni.length < 8) dni = dni.padStart(8, '0');
    if (!dni || dni.length < 8 || dni.length > 12) {
      results.push({ fila: rowIdx, dni: rawDni, nombre: '', estado: 'error', mensaje: 'DNI inválido' });
      errores++; continue;
    }

    let nombres   = cell(row, 'nombres');
    let apellidos = cell(row, 'apellidos');
    if (!nombres && !apellidos) {
      const completo = cell(row, 'nombre_completo');
      if (completo) {
        const partes = completo.split(/\s+/);
        nombres   = partes.slice(0, Math.ceil(partes.length / 2)).join(' ');
        apellidos = partes.slice(Math.ceil(partes.length / 2)).join(' ');
      }
    }
    if (!nombres)   nombres   = 'Sin nombre';
    if (!apellidos) apellidos = 'Sin apellido';
    const nombreCompleto = `${nombres} ${apellidos}`.trim();

    const fechaRaw     = cell(row, 'fecha_ingreso');
    const fechaIngreso = fechaRaw ? parseFecha(fechaRaw) : fechaHoy();

    // Duplicado dentro del mismo archivo → solo se procesa la primera aparición
    if (dnisVistos.has(dni)) {
      results.push({ fila: rowIdx, dni, nombre: nombreCompleto, estado: 'duplicado', mensaje: 'DNI repetido en el archivo' });
      duplicados++; continue;
    }
    dnisVistos.add(dni);

    parsed.push({ rowIdx, dni, nombres, apellidos, nombreCompleto, fechaIngreso });
  }

  // Helper: ejecutar consultas IN(...) en lotes para no saturar el placeholder limit
  const chunk = <T,>(arr: T[], size: number): T[][] => {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  };

  try {
    const dnis = parsed.map(p => p.dni);

    // ── Fase 2: lecturas en lote (blacklist + trabajadores existentes) ──
    const enBL = new Set<string>();
    const existentes = new Map<string, any>();
    for (const grupo of chunk(dnis, 500)) {
      const [bl] = await pool.query<any[]>(
        `SELECT dni FROM black_list WHERE dni IN (?)`, [grupo]
      );
      for (const r of bl) enBL.add(String(r.dni));

      const [tr] = await pool.query<any[]>(
        `SELECT id, nombres, apellidos, dni, estado FROM trabajadores WHERE dni IN (?)`, [grupo]
      );
      for (const r of tr) existentes.set(String(r.dni), r);
    }

    // ── Fase 3: clasificar filas ──
    const nuevos:     ParsedRow[]            = [];
    const aReingresar: { p: ParsedRow; id: number }[] = [];

    for (const p of parsed) {
      if (enBL.has(p.dni)) {
        results.push({ fila: p.rowIdx, dni: p.dni, nombre: p.nombreCompleto, estado: 'blacklist', mensaje: 'DNI registrado como Personal no Apto' });
        enBlacklist++; continue;
      }
      const trab = existentes.get(p.dni);
      if (trab) {
        if (trab.estado !== 'Baja') {
          results.push({
            fila: p.rowIdx, dni: p.dni,
            nombre: `${trab.nombres} ${trab.apellidos}`,
            estado: 'duplicado', mensaje: `Ya activo como trabajador (${trab.estado})`,
          });
          duplicados++;
        } else {
          aReingresar.push({ p, id: Number(trab.id) });
        }
        continue;
      }
      nuevos.push(p);
    }

    // ── Fase 4: inserción masiva de nuevos (bulk INSERT por lotes) ──
    for (const grupo of chunk(nuevos, 200)) {
      const valores = grupo.map(p => [
        p.nombres, p.apellidos, p.dni, '000000000', p.fechaIngreso, 'Activo', req.user!.sub,
      ]);
      await pool.query(
        `INSERT INTO trabajadores
           (nombres, apellidos, dni, celular, fecha_ingreso, estado, creado_por)
         VALUES ?`,
        [valores]
      );
      for (const p of grupo) {
        results.push({ fila: p.rowIdx, dni: p.dni, nombre: p.nombreCompleto, estado: 'registrado' });
        registrados++;
      }
    }

    // ── Fase 5: reingresos (UPDATE en lote + INSERT en lote a reingresos) ──
    if (aReingresar.length > 0) {
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        for (const grupo of chunk(aReingresar, 200)) {
          const ids = grupo.map(g => g.id);
          await conn.query(
            `UPDATE trabajadores
             SET estado = 'Reingreso', fecha_cese = NULL, motivo_cese = NULL
             WHERE id IN (?)`,
            [ids]
          );
          const valores = grupo.map(g => [
            g.id, g.p.fechaIngreso, 'Importado desde Excel (activos)', req.user!.sub,
          ]);
          await conn.query(
            `INSERT INTO reingresos (trabajador_id, fecha_reingreso, observacion, registrado_por)
             VALUES ?`,
            [valores]
          );
        }
        await conn.commit();
        for (const g of aReingresar) {
          results.push({ fila: g.p.rowIdx, dni: g.p.dni, nombre: g.p.nombreCompleto, estado: 'reingreso' });
          reingresos++;
        }
      } catch (txErr) {
        await conn.rollback();
        logger.error('importarActivosExcel reingresos lote:', txErr);
        for (const g of aReingresar) {
          results.push({ fila: g.p.rowIdx, dni: g.p.dni, nombre: g.p.nombreCompleto, estado: 'error', mensaje: 'Error al registrar reingreso' });
          errores++;
        }
      } finally {
        conn.release();
      }
    }
  } catch (err: any) {
    logger.error('importarActivosExcel lote:', err);
    // Exponer el detalle real de SQL para poder diagnosticar (p. ej. columna inexistente)
    const detalle = err?.sqlMessage || err?.message || 'Error desconocido';
    res.status(500).json({
      success: false,
      message: `Error de base de datos durante la importación: ${detalle}`,
      code: err?.code ?? null,
    });
    return;
  }

  // ── Auditoría: un único registro resumen (en vez de uno por fila) ──
  audit({
    usuarioId: req.user!.sub, usuarioNombre: req.user!.nombre,
    accion: AuditAction.TRAB_CREATE, entidadTipo: AuditEntity.TRABAJADOR,
    entidadId: 0,
    valoresNuevos: { archivo: req.file.originalname, registrados, reingresos, actualizados, duplicados, enBlacklist, errores, desde_excel_activos: true },
    ip: req.ip, userAgent: req.headers['user-agent'],
  });

  res.json({
    success: true,
    message: `Importación completada: ${registrados} registrados, ${actualizados} actualizados, ${reingresos} reingresos, ${duplicados} sin cambios, ${enBlacklist} en blacklist, ${errores} errores`,
    summary: { registrados, actualizados, reingresos, duplicados, enBlacklist, errores, total: rawRows.length - 1 },
    rows: results,
  });
}

// ── GET /import/plantilla-activos ───────────────────────────────────────────
export function descargarPlantillaActivos(_req: Request, res: Response): void {
  const hoy       = fechaHoy();
  const [y, m, d] = hoy.split('-');
  const ejemplo   = `${d}/${m}/${y}`;
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['DNI', 'Nombres', 'Apellidos', 'Fecha Ingreso (DD/MM/AAAA)'],
    ['12345678', 'Carlos', 'García López',   ejemplo],
    ['87654321', 'María Elena', 'Rodríguez', ejemplo],
  ]);
  ws['!cols'] = [{ wch: 14 }, { wch: 22 }, { wch: 22 }, { wch: 26 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Personal Activo');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': 'attachment; filename="plantilla_personal_activo.xlsx"',
    'Content-Length': buffer.length,
  });
  res.send(buffer);
}

// ── GET /import/plantilla-bajas ──────────────────────────────────────────────
export function descargarPlantillaBajas(_req: Request, res: Response): void {
  const hoy       = fechaHoy();
  const [y, m, d] = hoy.split('-');
  const ejemplo   = `${d}/${m}/${y}`;
  const wb  = XLSX.utils.book_new();
  const ws  = XLSX.utils.aoa_to_sheet([
    ['DNI', 'Fecha de Baja (DD/MM/AAAA)', 'Motivo (opcional)'],
    ['12345678', ejemplo, 'Fin de contrato'],
    ['87654321', ejemplo, 'Renuncia'],
  ]);
  ws['!cols'] = [{ wch: 14 }, { wch: 26 }, { wch: 22 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Bajas');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': 'attachment; filename="plantilla_baja_trabajadores.xlsx"',
    'Content-Length': buffer.length,
  });
  res.send(buffer);
}
