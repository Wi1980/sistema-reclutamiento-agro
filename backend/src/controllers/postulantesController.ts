import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import * as XLSX from 'xlsx';
import pool from '../config/database';
import { logger } from '../utils/logger';
import { audit, AuditAction, AuditEntity } from '../services/audit.service';

// Valores válidos para el campo como_entero (espejo del ENUM en DB)
const COMO_ENTERO_VALIDOS = new Set([
  'Facebook', 'Instagram', 'TikTok', 'Amigo/Familiar',
  'Volante', 'Periódico', 'Radio', 'Otro',
]);

export async function createPostulante(req: Request, res: Response): Promise<void> {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ success: false, errors: errors.array() });
    return;
  }

  const data = req.body;

  // Sanitizar como_entero contra el ENUM real de la DB
  const comoEntero: string | null = COMO_ENTERO_VALIDOS.has(data.como_entero)
    ? data.como_entero
    : null;

  // ── Perfiles Campo / Administrativo (v10) ──────────────────────
  // Normalización defensiva: el frontend exige estos campos, pero el backend
  // los acepta opcionales para no romper el formulario durante el deploy.
  const areaInteres: string = data.area_interes === 'Administrativo/Operativo'
    ? 'Administrativo/Operativo'
    : 'Campo';

  // sexo es NOT NULL en la BD; si no viene (formulario viejo) → 'M' como hasta hoy.
  const sexo: string = (data.sexo === 'M' || data.sexo === 'F') ? data.sexo : 'M';

  // fecha_nacimiento: cadena 'YYYY-MM-DD' válida o null (la edad 18+ ya la valida el router).
  const fechaNacimiento: string | null = data.fecha_nacimiento || null;

  // discapacidad: acepta boolean, 1/0 o '1'/'0'
  const discapacidad: number =
    (data.discapacidad === true || data.discapacidad === 1 ||
     data.discapacidad === '1' || data.discapacidad === 'true') ? 1 : 0;

  // grado_instruccion: solo aplica a administrativos.
  const GRADOS_VALIDOS = new Set(['Técnico', 'Bachiller', 'Titulado', 'Titulado/Colegiado']);
  const gradoInstruccion: string | null =
    areaInteres === 'Administrativo/Operativo' && GRADOS_VALIDOS.has(data.grado_instruccion)
      ? data.grado_instruccion
      : null;

  // profesión (texto libre, ej. "Ingeniero Industrial") → columna especialidad.
  // Solo aplica a administrativos.
  const profesion: string | null =
    areaInteres === 'Administrativo/Operativo' && typeof data.profesion === 'string' && data.profesion.trim()
      ? data.profesion.trim().slice(0, 200)
      : null;

  try {
    // ── 1. ¿Ya es trabajador activo o reingresado? ───────────────
    const [[trabajadorActivo]] = await pool.execute<any[]>(
      `SELECT id FROM trabajadores WHERE dni = ? AND estado IN ('Activo','Reingreso') LIMIT 1`,
      [data.dni]
    );
    if (trabajadorActivo) {
      res.status(409).json({
        success: false,
        message: 'Ya eres parte de nuestro equipo. ¡Gracias!',
      });
      return;
    }

    // ── 2. ¿Existe postulante previo? ────────────────────────────
    const [[postulantePrevio]] = await pool.execute<any[]>(
      `SELECT id, estado, fue_trabajador FROM postulantes WHERE dni = ? ORDER BY created_at DESC LIMIT 1`,
      [data.dni]
    );

    if (postulantePrevio) {
      const estado = postulantePrevio.estado as string;

      // Ex-trabajador en Pendiente — actualizar datos de contacto y marcar que quiere volver
      if (estado === 'Pendiente' && postulantePrevio.fue_trabajador === 1) {
        await pool.execute(
          `UPDATE postulantes
           SET celular          = ?,
               departamento     = ?,
               provincia        = ?,
               distrito         = ?,
               centro_poblado   = ?,
               sexo             = ?,
               fecha_nacimiento = COALESCE(?, fecha_nacimiento),
               area_interes     = ?,
               discapacidad     = ?,
               grado_instruccion = COALESCE(?, grado_instruccion),
               especialidad     = COALESCE(?, especialidad),
               como_entero      = COALESCE(?, como_entero),
               repostulo_at     = UTC_TIMESTAMP(),
               notas_internas = CONCAT(
                 COALESCE(notas_internas, ''),
                 IF(notas_internas IS NOT NULL AND notas_internas != '', '\n', ''),
                 '[', DATE_FORMAT(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR), '%d/%m/%Y %H:%i'), '] Volvió a postular desde formulario público.'
               )
           WHERE id = ?`,
          [
            data.celular,
            data.departamento, data.provincia, data.distrito,
            data.centro_poblado || null,
            sexo, fechaNacimiento, areaInteres, discapacidad, gradoInstruccion, profesion,
            comoEntero,
            postulantePrevio.id,
          ]
        );
        logger.info(`Ex-trabajador repostuló: DNI ${data.dni} (id=${postulantePrevio.id})`);
        res.status(200).json({
          success: true,
          id: postulantePrevio.id,
          message: '¡Datos actualizados! Pronto nos comunicaremos contigo. ¡Bienvenido de vuelta!',
        });
        return;
      }

      // Proceso activo — no duplicar
      if (['Pendiente', 'Asignado', 'Confirmado', 'Programado'].includes(estado)) {
        res.status(409).json({
          success: false,
          message: 'Ya tenemos tu postulación en proceso. Un asesor se comunicará contigo pronto. ¡Gracias por tu interés!',
        });
        return;
      }

      // Ya ingresó como trabajador
      if (estado === 'Ingresó') {
        res.status(409).json({
          success: false,
          message: 'Ya fuiste registrado como trabajador. Si tienes dudas, contacta directamente a RRHH.',
        });
        return;
      }

      // En lista negra — no re-registrar (Denegado lo setea el check de black_list)
      if (estado === 'Denegado') {
        // Respuesta neutral para no revelar el motivo
        res.status(201).json({
          success: true,
          message: '¡Registro enviado exitosamente! Nos comunicaremos contigo pronto.',
        });
        return;
      }

      // Candidato que volvió a interesarse (No responde / No interesado / Descartado)
      // → Reactivar: actualizar datos de contacto y volver a Pendiente
      if (['No responde', 'No interesado', 'Descartado'].includes(estado)) {
        const notaReactivacion = `Volvió a postular desde formulario público (estaba: ${estado}).`;
        await pool.execute(
          `UPDATE postulantes
           SET estado        = 'Pendiente',
               celular       = ?,
               departamento  = ?,
               provincia     = ?,
               distrito      = ?,
               centro_poblado = ?,
               sexo             = ?,
               fecha_nacimiento = COALESCE(?, fecha_nacimiento),
               area_interes     = ?,
               discapacidad     = ?,
               grado_instruccion = COALESCE(?, grado_instruccion),
               especialidad     = COALESCE(?, especialidad),
               como_entero   = COALESCE(?, como_entero),
               assigned_to   = NULL,
               assigned_at   = NULL,
               assigned_by   = NULL,
               repostulo_at  = UTC_TIMESTAMP(),
               notas_internas = CONCAT(
                 COALESCE(notas_internas, ''),
                 IF(notas_internas IS NOT NULL AND notas_internas != '', '\n', ''),
                 '[', DATE_FORMAT(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR), '%d/%m/%Y %H:%i'), '] ', ?
               )
           WHERE id = ?`,
          [
            data.celular,
            data.departamento, data.provincia, data.distrito,
            data.centro_poblado || null,
            sexo, fechaNacimiento, areaInteres, discapacidad, gradoInstruccion, profesion,
            comoEntero,
            notaReactivacion,
            postulantePrevio.id,
          ]
        );

        logger.info(`Postulante reactivado: DNI ${data.dni} (id=${postulantePrevio.id}), estado anterior: ${estado}`);

        res.status(200).json({
          success: true,
          reactivado: true,
          id: postulantePrevio.id,
          message: '¡Registro actualizado! Nos comunicaremos contigo pronto.',
        });
        return;
      }
    }

    // ── 3. Verificar lista negra (registro nuevo) ─────────────────
    const [[enBlacklist]] = await pool.execute<any[]>(
      `SELECT id FROM black_list WHERE dni = ? LIMIT 1`,
      [data.dni]
    );
    const estadoInicial = enBlacklist ? 'Denegado' : 'Pendiente';

    // ── 4. Campaña activa ────────────────────────────────────────
    const [[campanaActiva]] = await pool.execute<any[]>(
      `SELECT id FROM campanas
       WHERE estado = 'activa'
         AND fecha_inicio <= CURDATE()
         AND (fecha_fin IS NULL OR fecha_fin >= CURDATE())
       ORDER BY fecha_inicio DESC LIMIT 1`,
      []
    );
    const campanaId = campanaActiva?.id ?? null;

    // ── 5. Insertar nuevo postulante ──────────────────────────────
    const [result] = await pool.execute<any>(
      `INSERT INTO postulantes (
        nombres, apellidos, dni,
        celular,
        distrito, centro_poblado, provincia, departamento,
        como_entero,
        sexo, fecha_nacimiento, area_interes, discapacidad, grado_instruccion, especialidad,
        ip_origen, user_agent, estado, campana_id
      ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        data.nombres.trim(), data.apellidos.trim(), data.dni,
        data.celular,
        data.distrito, data.centro_poblado || null, data.provincia, data.departamento,
        comoEntero,
        sexo, fechaNacimiento, areaInteres, discapacidad, gradoInstruccion, profesion,
        req.ip, req.headers['user-agent'] || '',
        estadoInicial, campanaId,
      ]
    );

    res.status(201).json({
      success: true,
      message: '¡Registro enviado exitosamente! Nos comunicaremos contigo pronto.',
      id: (result as any).insertId,
    });
  } catch (err) {
    logger.error('Create postulante error:', err);
    res.status(500).json({ success: false, message: 'Error al guardar el registro' });
  }
}

// ─── CV: subida pública (solo administrativos, ventana de 30 min) ───────────
export async function uploadCvPostulante(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (isNaN(id) || id <= 0) {
    res.status(400).json({ success: false, message: 'ID inválido' });
    return;
  }
  const file = (req as any).file;
  if (!file) {
    res.status(400).json({ success: false, message: 'No se recibió ningún archivo' });
    return;
  }
  if (file.mimetype !== 'application/pdf') {
    res.status(400).json({ success: false, message: 'El CV debe ser un archivo PDF' });
    return;
  }
  if (file.size > 3 * 1024 * 1024) {
    res.status(400).json({ success: false, message: 'El CV no debe superar los 3 MB' });
    return;
  }
  try {
    // Solo administrativos y registros recién creados/actualizados (anti-abuso).
    // updated_at usa CURRENT_TIMESTAMP (zona de la sesión); se compara contra
    // NOW() en la MISMA zona para que la ventana de 30 min sea correcta sin
    // importar el timezone del servidor MySQL.
    const [[post]] = await pool.execute<any[]>(
      `SELECT id FROM postulantes
       WHERE id = ?
         AND area_interes = 'Administrativo/Operativo'
         AND updated_at >= (NOW() - INTERVAL 30 MINUTE)
       LIMIT 1`,
      [id]
    );
    if (!post) {
      res.status(403).json({ success: false, message: 'No se puede adjuntar el CV a este registro' });
      return;
    }
    const nombre = String(file.originalname || 'cv.pdf').slice(0, 255);
    await pool.execute(
      `INSERT INTO postulante_cv (postulante_id, archivo, nombre, mime, size_bytes)
       VALUES (?,?,?,?,?)
       ON DUPLICATE KEY UPDATE
         archivo = VALUES(archivo), nombre = VALUES(nombre),
         mime = VALUES(mime), size_bytes = VALUES(size_bytes)`,
      [id, file.buffer, nombre, file.mimetype, file.size]
    );
    res.status(201).json({ success: true, message: 'CV adjuntado correctamente' });
  } catch (err) {
    logger.error('uploadCv error:', err);
    res.status(500).json({ success: false, message: 'Error al guardar el CV' });
  }
}

// ─── CV: ver/descargar inline (panel, protegido) ────────────────────────────
export async function getCvPostulante(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (isNaN(id) || id <= 0) {
    res.status(400).json({ success: false, message: 'ID inválido' });
    return;
  }
  try {
    const [[cv]] = await pool.execute<any[]>(
      `SELECT archivo, nombre, mime FROM postulante_cv WHERE postulante_id = ? LIMIT 1`,
      [id]
    );
    if (!cv) {
      res.status(404).json({ success: false, message: 'Este postulante no tiene CV adjunto' });
      return;
    }
    res.setHeader('Content-Type', cv.mime || 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(cv.nombre || 'cv.pdf')}"`);
    res.send(cv.archivo);
  } catch (err) {
    logger.error('getCv error:', err);
    res.status(500).json({ success: false, message: 'Error al obtener el CV' });
  }
}

export async function getPostulantes(req: Request, res: Response): Promise<void> {
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(100, Math.max(10, Number(req.query.limit) || 20));
  const offset = (page - 1) * limit;

  const { search, estado, distrito, desde, hasta, sortBy, sortDir, fue_trabajador, quiere_volver,
          area, edad_min, edad_max, sexo, discapacidad, profesion } = req.query;

  const SORT_MAP: Record<string, string> = {
    id:            'p.id',
    nombres:       'p.nombres',
    dni:           'p.dni',
    celular:       'p.celular',
    distrito:      'p.distrito',
    centro_poblado:'p.centro_poblado',
    contrata:      'u.nombre',
    campana:       'cam.nombre',
    estado:        'p.estado',
    created_at:    'p.created_at',
    grado_instruccion: 'p.grado_instruccion',
    especialidad:  'p.especialidad',
  };
  const orderCol = SORT_MAP[String(sortBy)] ?? 'p.created_at';
  const orderDir = sortDir === 'asc' ? 'ASC' : 'DESC';

  const filters: string[] = [];
  const params: any[] = [];

  if (search) {
    filters.push(`MATCH(p.nombres, p.apellidos, p.dni) AGAINST (? IN BOOLEAN MODE)`);
    params.push(`${search}*`);
  }
  if (estado)          { filters.push(`p.estado = ?`);                   params.push(estado); }
  else                 { filters.push(`p.estado != 'Ingresó'`); }
  if (distrito)        { filters.push(`p.distrito LIKE ?`);               params.push(`%${distrito}%`); }
  if (desde)           { filters.push(`DATE(p.created_at) >= ?`);         params.push(desde); }
  if (hasta)           { filters.push(`DATE(p.created_at) <= ?`);         params.push(hasta); }
  if (fue_trabajador === '1') { filters.push(`p.fue_trabajador = 1`); }
  if (quiere_volver  === '1') { filters.push(`p.repostulo_at IS NOT NULL`); }

  // Perfiles Campo / Administrativo (v10)
  if (area === 'Campo' || area === 'Administrativo/Operativo') {
    filters.push(`p.area_interes = ?`); params.push(area);
  }
  if (sexo === 'M' || sexo === 'F') { filters.push(`p.sexo = ?`); params.push(sexo); }
  if (typeof profesion === 'string' && profesion.trim()) {
    filters.push(`p.especialidad = ?`); params.push(profesion.trim());
  }
  if (discapacidad === '1' || discapacidad === '0') {
    filters.push(`p.discapacidad = ?`); params.push(Number(discapacidad));
  }
  // Filtro por rango de edad — se calcula en vivo contra fecha_nacimiento
  // (siempre actualizado; los registros sin fecha quedan fuera del rango).
  const edadMin = Number(edad_min);
  const edadMax = Number(edad_max);
  if (Number.isFinite(edadMin) && edad_min !== '') {
    filters.push(`TIMESTAMPDIFF(YEAR, p.fecha_nacimiento, CURDATE()) >= ?`); params.push(edadMin);
  }
  if (Number.isFinite(edadMax) && edad_max !== '') {
    filters.push(`TIMESTAMPDIFF(YEAR, p.fecha_nacimiento, CURDATE()) <= ?`); params.push(edadMax);
  }

  const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';

  try {
    const [[{ total }]] = await pool.execute<any[]>(
      `SELECT COUNT(*) AS total FROM postulantes p ${where}`,
      params
    );

    const [rows] = await pool.execute<any[]>(
      `SELECT p.id, p.nombres, p.apellidos, p.dni,
              p.celular, p.departamento, p.provincia,
              p.distrito, p.centro_poblado,
              p.como_entero, p.estado, p.created_at,
              p.fue_trabajador, p.repostulo_at,
              p.area_interes, p.sexo, p.discapacidad, p.grado_instruccion, p.especialidad,
              TIMESTAMPDIFF(YEAR, p.fecha_nacimiento, CURDATE()) AS edad,
              EXISTS(SELECT 1 FROM postulante_cv pcv WHERE pcv.postulante_id = p.id) AS tiene_cv,
              u.nombre AS contrata_nombre,
              cam.nombre AS campana_nombre,
              EXISTS (
                SELECT 1 FROM postulantes p2
                WHERE p2.nombres = p.nombres
                  AND p2.apellidos = p.apellidos
                  AND p2.dni != p.dni
              ) AS posible_duplicado
       FROM postulantes p
       LEFT JOIN usuarios u   ON p.assigned_to = u.id
       LEFT JOIN campanas cam ON p.campana_id   = cam.id
       ${where}
       ORDER BY ${orderCol} ${orderDir} LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    res.json({
      success: true,
      data: rows,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    logger.error('Get postulantes error:', err);
    res.status(500).json({ success: false, message: 'Error al obtener registros' });
  }
}

export async function deletePostulante(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (isNaN(id) || id <= 0) {
    res.status(400).json({ success: false, message: 'ID inválido' });
    return;
  }
  const actorId = req.user!.sub;

  try {
    const [[postulante]] = await pool.execute<any[]>(
      `SELECT id, nombres, apellidos, dni, estado FROM postulantes WHERE id = ? LIMIT 1`,
      [id]
    );
    if (!postulante) {
      res.status(404).json({ success: false, message: 'Postulante no encontrado' });
      return;
    }

    // Bloquear si tiene llamadas — trazabilidad histórica
    const [[{ llamadas }]] = await pool.execute<any[]>(
      `SELECT COUNT(*) AS llamadas FROM llamadas WHERE postulante_id = ?`,
      [id]
    );
    if (Number(llamadas) > 0) {
      res.status(409).json({
        success: false,
        message: `No se puede eliminar: tiene ${llamadas} llamada${Number(llamadas) > 1 ? 's' : ''} registrada${Number(llamadas) > 1 ? 's' : ''}. Cambia el estado a "Descartado" en su lugar.`,
      });
      return;
    }

    // Bloquear si ya tiene registro de trabajador (evita FK rota en trabajadores.postulante_id)
    const [[{ trabajadores }]] = await pool.execute<any[]>(
      `SELECT COUNT(*) AS trabajadores FROM trabajadores WHERE postulante_id = ?`,
      [id]
    );
    if (Number(trabajadores) > 0) {
      res.status(409).json({
        success: false,
        message: 'No se puede eliminar: el postulante tiene un registro de trabajador asociado. Cambia el estado a "Descartado" en su lugar.',
      });
      return;
    }

    await pool.execute(`DELETE FROM postulantes WHERE id = ?`, [id]);

    await audit({
      usuarioId:          actorId,
      accion:             AuditAction.POST_DELETE,
      entidadTipo:        AuditEntity.POSTULANTE,
      entidadId:          Number(id),
      valoresAnteriores:  { nombres: postulante.nombres, apellidos: postulante.apellidos, dni: postulante.dni, estado: postulante.estado },
    });

    logger.info(`Postulante eliminado: id=${id} DNI=${postulante.dni} por usuario=${actorId}`);
    res.json({ success: true, message: 'Postulante eliminado correctamente' });
  } catch (err) {
    logger.error('Delete postulante error:', err);
    res.status(500).json({ success: false, message: 'Error al eliminar el registro' });
  }
}

export async function getPostulanteById(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (isNaN(id) || id <= 0) {
    res.status(400).json({ success: false, message: 'ID inválido' });
    return;
  }
  const userId    = req.user!.sub;
  const isRoot    = req.user!.permisos?.all === true;
  const canViewAll = isRoot
    || req.user!.permisos?.['postulantes.view_all']
    || req.user!.permisos?.['postulantes.view'];

  try {
    const extra = `EXISTS(SELECT 1 FROM postulante_cv c WHERE c.postulante_id = postulantes.id) AS tiene_cv,
                   TIMESTAMPDIFF(YEAR, fecha_nacimiento, CURDATE()) AS edad`;
    const [rows] = canViewAll
      ? await pool.execute<any[]>(`SELECT *, ${extra} FROM postulantes WHERE id = ? LIMIT 1`, [id])
      : await pool.execute<any[]>(`SELECT *, ${extra} FROM postulantes WHERE id = ? AND assigned_to = ? LIMIT 1`, [id, userId]);

    if (!rows[0]) {
      res.status(404).json({ success: false, message: 'Registro no encontrado' });
      return;
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    logger.error('Get postulante error:', err);
    res.status(500).json({ success: false, message: 'Error del servidor' });
  }
}

export async function updateEstado(req: Request, res: Response): Promise<void> {
  const id = Number(req.params.id);
  if (isNaN(id) || id <= 0) {
    res.status(400).json({ success: false, message: 'ID inválido' });
    return;
  }
  const { estado, notas_internas } = req.body;
  const userId    = req.user!.sub;
  const isRoot    = req.user!.permisos?.all === true;
  const canEditAll = isRoot
    || req.user!.permisos?.['postulantes.view_all']
    || req.user!.permisos?.['postulantes.edit'];

  const estadosValidos = ['Pendiente','Asignado','No responde','Confirmado','No interesado','Programado','Ingresó','Descartado','Denegado'];
  if (!estadosValidos.includes(estado)) {
    res.status(400).json({ success: false, message: 'Estado inválido' });
    return;
  }

  // Solo administradores pueden marcar como Denegado
  if (estado === 'Denegado' && !canEditAll) {
    res.status(403).json({ success: false, message: 'Solo administradores pueden asignar estado Denegado' });
    return;
  }

  try {
    // Si se cambia a un estado activo/final, el badge "Quiere volver" ya fue visto → limpiar
    const clearRepostulo = estado !== 'Pendiente';
    const updateSql = canEditAll
      ? `UPDATE postulantes SET estado = ?, notas_internas = COALESCE(?, notas_internas)${clearRepostulo ? ', repostulo_at = NULL' : ''} WHERE id = ?`
      : `UPDATE postulantes SET estado = ?, notas_internas = COALESCE(?, notas_internas)${clearRepostulo ? ', repostulo_at = NULL' : ''} WHERE id = ? AND assigned_to = ?`;
    const updateParams = canEditAll
      ? [estado, notas_internas || null, id]
      : [estado, notas_internas || null, id, userId];

    const [result] = await pool.execute<any>(updateSql, updateParams);

    if ((result as any).affectedRows === 0) {
      res.status(404).json({ success: false, message: 'Postulante no encontrado o sin permisos' });
      return;
    }

    audit({
      usuarioId:    req.user!.sub,
      usuarioNombre: req.user!.nombre,
      accion:       AuditAction.POST_ESTADO,
      entidadTipo:  AuditEntity.POSTULANTE,
      entidadId:    Number(id),
      valoresNuevos: { estado, notas_internas: notas_internas || null },
      ip:           req.ip,
      userAgent:    req.headers['user-agent'],
    });

    const [[updated]] = await pool.execute<any[]>(
      `SELECT id, estado, notas_internas FROM postulantes WHERE id = ? LIMIT 1`,
      [id]
    );
    res.json({ success: true, message: 'Estado actualizado', data: updated ?? null });
  } catch (err) {
    logger.error('Update estado error:', err);
    res.status(500).json({ success: false, message: 'Error al actualizar' });
  }
}

export async function exportPostulantes(req: Request, res: Response): Promise<void> {
  try {
    const [rows] = await pool.execute<any[]>(
      `SELECT p.id, p.nombres, p.apellidos, p.dni,
              p.celular, p.departamento, p.provincia, p.distrito, p.centro_poblado,
              p.area_interes, p.sexo, p.discapacidad, p.grado_instruccion,
              TIMESTAMPDIFF(YEAR, p.fecha_nacimiento, CURDATE()) AS edad,
              p.como_entero, p.estado, p.fue_trabajador, p.repostulo_at, p.created_at,
              u.nombre AS contrata_nombre,
              cam.nombre AS campana_nombre
       FROM postulantes p
       LEFT JOIN usuarios u   ON p.assigned_to = u.id
       LEFT JOIN campanas cam ON p.campana_id   = cam.id
       WHERE p.estado != 'Ingresó'
       ORDER BY p.created_at DESC
       LIMIT 10000`
    );

    const formatted = rows.map((r) => ({
      ID: r.id,
      Nombres: r.nombres,
      Apellidos: r.apellidos,
      DNI: r.dni,
      Celular: r.celular,
      'Área de interés': r.area_interes || 'Campo',
      Género: r.sexo === 'F' ? 'Femenino' : r.sexo === 'M' ? 'Masculino' : '',
      Edad: r.edad ?? '',
      Discapacidad: r.discapacidad ? 'Sí' : 'No',
      'Grado de instrucción': r.grado_instruccion || '',
      Departamento: r.departamento,
      Provincia: r.provincia,
      Distrito: r.distrito,
      'Centro Poblado': r.centro_poblado || '',
      'Cómo se enteró': r.como_entero,
      Estado: r.estado,
      'Ex-trabajador': r.fue_trabajador ? 'Sí' : 'No',
      'Quiere volver': r.repostulo_at
        ? new Date(r.repostulo_at).toLocaleString('es-PE', { timeZone: 'America/Lima' })
        : 'No',
      Contrata: r.contrata_nombre || '',
      Campaña: r.campana_nombre || '',
      'Fecha Registro': new Date(r.created_at).toLocaleString('es-PE'),
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(formatted);

    ws['!cols'] = Object.keys(formatted[0] || {}).map((k) => ({
      wch: Math.max(k.length + 2, 15),
    }));

    XLSX.utils.book_append_sheet(wb, ws, 'Postulantes');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const filename = `postulantes_${new Date().toISOString().split('T')[0]}.xlsx`;

    audit({
      usuarioId:    req.user!.sub,
      usuarioNombre: req.user!.nombre,
      accion:       AuditAction.POST_EXPORT,
      entidadTipo:  AuditEntity.POSTULANTE,
      metadata:     { total: rows.length },
      ip:           req.ip,
      userAgent:    req.headers['user-agent'],
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    logger.error('Export error:', err);
    res.status(500).json({ success: false, message: 'Error al exportar' });
  }
}

export async function getDashboardStats(_req: Request, res: Response): Promise<void> {
  try {
    const [[totales]] = await pool.execute<any[]>(`
      SELECT
        COUNT(*) AS total,
        SUM(estado IN ('Pendiente','Asignado')) AS pendientes,
        SUM(estado = 'No responde')    AS no_responde,
        SUM(estado = 'Confirmado')     AS confirmados,
        SUM(estado = 'Programado')     AS programados,
        SUM(estado = 'Ingresó')        AS ingresos,
        SUM(estado = 'No interesado')  AS no_interesados,
        SUM(estado = 'Descartado')     AS descartados,
        SUM(DATE(created_at) = CURDATE()) AS hoy,
        SUM(created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY)) AS semana,
        SUM(assigned_to IS NOT NULL)   AS asignados_total,
        SUM(assigned_to IS NULL)       AS sin_asignar
      FROM postulantes
    `);

    const [porDistrito] = await pool.execute<any[]>(`
      SELECT distrito, COUNT(*) AS cantidad
      FROM postulantes
      WHERE distrito IS NOT NULL AND distrito != ''
      GROUP BY distrito
      ORDER BY cantidad DESC
      LIMIT 10
    `);

    const [porDia] = await pool.execute<any[]>(`
      SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS fecha, COUNT(*) AS cantidad
      FROM postulantes
      WHERE created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)
      GROUP BY DATE_FORMAT(created_at, '%Y-%m-%d')
      ORDER BY fecha ASC
    `);

    const [porComoEntero] = await pool.execute<any[]>(`
      SELECT
        COALESCE(NULLIF(TRIM(como_entero), ''), 'Sin especificar') AS canal,
        COUNT(*) AS cantidad
      FROM postulantes
      GROUP BY canal
      ORDER BY cantidad DESC
      LIMIT 12
    `);

    const [porDisponibilidad] = await pool.execute<any[]>(`
      SELECT disponibilidad, COUNT(*) AS cantidad
      FROM postulantes
      GROUP BY disponibilidad
    `);

    // Productividad de reclutadores (top 10, últimos 7 días)
    const [productividadReclutadores] = await pool.execute<any[]>(`
      SELECT u.nombre, COUNT(*) AS llamadas_7d,
             SUM(l.resultado = 'confirmado') AS confirmados_7d
      FROM llamadas l
      JOIN usuarios u ON l.reclutador_id = u.id
      WHERE l.fecha_llamada >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY)
      GROUP BY l.reclutador_id, u.nombre
      ORDER BY llamadas_7d DESC
      LIMIT 10
    `);

    res.json({
      success: true,
      data: { totales, porDistrito, porDia, porDisponibilidad, porComoEntero, productividadReclutadores },
    });
  } catch (err) {
    logger.error('Dashboard stats error:', err);
    res.status(500).json({ success: false, message: 'Error al obtener estadísticas' });
  }
}

// ─── RECLUTADOR: lista de sus asignados ────────────────────────────────────

export async function getMisAsignados(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  const page   = Math.max(1, Number(req.query.page)  || 1);
  const limit  = Math.min(50, Math.max(5, Number(req.query.limit) || 15));
  const offset = (page - 1) * limit;
  const { estado, search } = req.query;

  const filters: string[] = ['p.assigned_to = ?'];
  const params: any[]     = [userId];

  if (estado === 'por_llamar') {
    filters.push("p.estado IN ('Pendiente','Asignado')");
  } else if (estado === 'cerrados') {
    filters.push("p.estado IN ('Ingresó','No interesado','Descartado','No se presentó')");
  } else if (estado && estado !== 'activos') {
    filters.push("p.estado != 'Denegado'");
    filters.push('p.estado = ?');
    params.push(estado);
  } else {
    // 'activos' o sin filtro — solo pipeline activo
    filters.push("p.estado IN ('Pendiente','Asignado','No responde','Confirmado','Programado')");
  }

  if (search) {
    const t = `%${String(search).trim()}%`;
    filters.push(`(p.nombres LIKE ? OR p.apellidos LIKE ? OR p.celular LIKE ? OR p.dni LIKE ?)`);
    params.push(t, t, t, t);
  }

  const where = `WHERE ${filters.join(' AND ')}`;

  try {
    const [[{ total }]] = await pool.execute<any[]>(
      `SELECT COUNT(*) AS total FROM postulantes p ${where}`,
      params
    );

    const [rows] = await pool.execute<any[]>(
      `SELECT
         p.id, p.nombres, p.apellidos, p.dni, p.celular,
         p.departamento, p.provincia, p.distrito, p.centro_poblado, p.zona_postula,
         p.estado, p.fue_trabajador, p.repostulo_at, p.assigned_at, p.notas_internas,
         c.nombre AS campana_nombre,
         (SELECT l.fecha_llamada FROM llamadas l
          WHERE l.postulante_id = p.id
          ORDER BY l.fecha_llamada DESC LIMIT 1) AS ultima_llamada,
         (SELECT COUNT(*) FROM llamadas l WHERE l.postulante_id = p.id) AS total_llamadas,
         (SELECT l.fecha_programada FROM llamadas l
          WHERE l.postulante_id = p.id AND l.resultado = 'programado'
          ORDER BY l.fecha_llamada DESC LIMIT 1) AS fecha_programada
       FROM postulantes p
       LEFT JOIN campanas c ON p.campana_id = c.id
       ${where}
       ORDER BY
         CASE
           WHEN p.estado IN ('Pendiente','Asignado','No responde') THEN 0
           WHEN p.estado IN ('Programado','Confirmado') THEN 1
           ELSE 2
         END ASC,
         CASE
           WHEN p.estado IN ('Pendiente','Asignado','No responde')
           THEN COALESCE(ultima_llamada, '2000-01-01 00:00:00')
           ELSE p.assigned_at
         END ASC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    );

    res.json({
      success: true,
      data: rows,
      pagination: { total: Number(total), page, limit, pages: Math.ceil(Number(total) / limit) },
    });
  } catch (err) {
    logger.error('getMisAsignados error:', err);
    res.status(500).json({ success: false, message: 'Error al obtener asignados' });
  }
}

// ─── RECLUTADOR: registrar resultado de una llamada ────────────────────────

export async function registrarLlamada(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const userId  = req.user!.sub;
  const isRoot  = req.user!.permisos?.all === true;
  const { resultado, observacion, fecha_programada } = req.body;

  const resultadosValidos = ['no_responde','confirmado','no_interesado','callback','programado','no_califica'];
  if (!resultadosValidos.includes(resultado)) {
    res.status(400).json({ success: false, message: 'Resultado inválido' });
    return;
  }

  if (resultado === 'programado' && !fecha_programada) {
    res.status(400).json({ success: false, message: 'Debes ingresar la fecha y hora de la cita' });
    return;
  }

  const fechaProg = fecha_programada
    ? new Date(fecha_programada).toISOString().slice(0, 19).replace('T', ' ')
    : null;

  // Verificar autorización para registrar la llamada.
  // - ROOT: todo.
  // - Contrata: solo sus asignados.
  // - Reclutadora Principal (view_all): sus asignados + cualquier postulante
  //   Administrativo/Operativo, aunque no esté asignado (A1, flujo separado v10).
  const canViewAll = req.user!.permisos?.['postulantes.view_all'] === true;
  if (!isRoot) {
    const [[post]] = await pool.execute<any[]>(
      `SELECT assigned_to, area_interes FROM postulantes WHERE id = ? LIMIT 1`,
      [id]
    );
    if (!post) {
      res.status(404).json({ success: false, message: 'Postulante no encontrado' });
      return;
    }
    const esPropio          = Number(post.assigned_to) === Number(userId);
    const esAdminGestionable = canViewAll && post.area_interes === 'Administrativo/Operativo';
    if (!esPropio && !esAdminGestionable) {
      res.status(403).json({ success: false, message: 'Postulante no asignado a ti' });
      return;
    }
  }

  // Mapa resultado → estado del postulante
  // 'callback' no cambia estado intencionalmente (se llamará de vuelta)
  const estadoMap: Record<string, string> = {
    confirmado:    'Confirmado',
    no_responde:   'No responde',
    no_interesado: 'No interesado',
    programado:    'Programado',
    no_califica:   'Descartado',
  };
  const nuevoEstado = estadoMap[resultado] ?? null;
  const obs = observacion?.trim() || null;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    await conn.execute(
      `INSERT INTO llamadas (postulante_id, reclutador_id, resultado, observacion, fecha_programada) VALUES (?,?,?,?,?)`,
      [id, userId, resultado, obs, fechaProg]
    );

    // Actualizar estado del postulante si hay mapeo definido
    if (nuevoEstado) {
      await conn.execute(
        `UPDATE postulantes SET estado = ? WHERE id = ?`,
        [nuevoEstado, id]
      );
    }

    // Siempre agregar la observación al historial de notas (append, no reemplazar)
    if (obs) {
      await conn.execute(
        `UPDATE postulantes
         SET notas_internas = CONCAT(
           COALESCE(notas_internas, ''),
           IF(notas_internas IS NOT NULL AND notas_internas != '', '\n', ''),
           '[', DATE_FORMAT(DATE_SUB(UTC_TIMESTAMP(), INTERVAL 5 HOUR), '%d/%m/%Y %H:%i'), '] ', ?
         ) WHERE id = ?`,
        [obs, id]
      );
    }

    await conn.commit();

    // Audit fire-and-forget
    audit({
      usuarioId:      userId,
      usuarioNombre:  req.user!.nombre,
      accion:         AuditAction.LLAMADA_CREATE,
      entidadTipo:    AuditEntity.LLAMADA,
      entidadId:      Number(id),
      valoresNuevos:  { resultado, observacion, nuevoEstado, fechaProg },
      ip:             req.ip,
      userAgent:      req.headers['user-agent'],
    });

    res.json({ success: true, message: 'Llamada registrada', estado: nuevoEstado, fecha_programada: fechaProg });
  } catch (err) {
    await conn.rollback();
    logger.error('registrarLlamada error:', err);
    res.status(500).json({ success: false, message: 'Error al registrar llamada' });
  } finally {
    conn.release();
  }
}

// ─── RECLUTADORA PRINCIPAL: asignación masiva ────────────────────────────────

export async function asignarMasivo(req: Request, res: Response): Promise<void> {
  const { postulante_ids, reclutador_id } = req.body;

  if (!Array.isArray(postulante_ids) || postulante_ids.length === 0) {
    res.status(400).json({ success: false, message: 'postulante_ids requerido (array no vacío)' });
    return;
  }
  if (!reclutador_id) {
    res.status(400).json({ success: false, message: 'reclutador_id requerido' });
    return;
  }

  const ids = postulante_ids.map(Number).filter(n => !isNaN(n) && n > 0);
  if (ids.length === 0) {
    res.status(400).json({ success: false, message: 'IDs inválidos' });
    return;
  }
  if (ids.length > 500) {
    res.status(400).json({ success: false, message: 'Máximo 500 postulantes por asignación' });
    return;
  }

  const ROLES_ASIGNABLES = ['CONTRATA', 'RECLUTADORA', 'RECLUTADOR'];

  try {
    // Verificar que el reclutador exista, esté activo y tenga rol asignable
    const [reclutador] = await pool.execute<any[]>(
      `SELECT u.id, u.nombre, r.nombre AS rol
       FROM usuarios u JOIN roles r ON u.rol_id = r.id
       WHERE u.id = ? AND u.activo = 1 LIMIT 1`,
      [reclutador_id]
    );
    if (!(reclutador as any[])[0]) {
      res.status(404).json({ success: false, message: 'Reclutador no encontrado o inactivo' });
      return;
    }
    if (!ROLES_ASIGNABLES.includes((reclutador as any[])[0].rol)) {
      res.status(400).json({ success: false, message: `El usuario seleccionado no tiene un rol que permita recibir asignaciones (${(reclutador as any[])[0].rol})` });
      return;
    }

    // Solo se pueden asignar candidatos que aún no tienen cita confirmada o programada.
    // Confirmado/Programado ya tienen una contrata activa trabajando con ellos — reasignarlos
    // rompe el flujo de llamado. Ingresó y Denegado también se excluyen.
    const ESTADOS_ASIGNABLES = `('Pendiente','Asignado','No responde','No interesado','Descartado')`;

    const placeholders = ids.map(() => '?').join(',');
    // Blindaje (v10): solo se asignan a contratas los postulantes de Campo.
    // Los Administrativo/Operativo los gestiona la Reclutadora Principal en su
    // propio carril y NUNCA deben caer en el flujo de contratas.
    const [result] = await pool.execute<any>(
      `UPDATE postulantes
       SET assigned_to = ?, assigned_at = UTC_TIMESTAMP(),
           estado = IF(estado IN ('Pendiente','No responde','No interesado','Descartado'),
                       'Asignado', estado),
           repostulo_at = NULL
       WHERE id IN (${placeholders})
         AND area_interes = 'Campo'
         AND estado IN ${ESTADOS_ASIGNABLES}`,
      [reclutador_id, ...ids]
    );

    const asignados = (result as any).affectedRows;
    const omitidos  = ids.length - asignados;
    const nombre    = (reclutador as any[])[0].nombre;

    const mensaje = omitidos > 0
      ? `${asignados} asignado(s) a ${nombre}. ${omitidos} omitido(s): ya tienen cita Confirmada o Programada.`
      : `${asignados} postulante(s) asignado(s) a ${nombre}`;

    audit({
      usuarioId:    req.user!.sub,
      usuarioNombre: req.user!.nombre,
      accion:       AuditAction.POST_ASSIGN,
      entidadTipo:  AuditEntity.POSTULANTE,
      metadata:     { reclutador_id, postulante_ids: ids, asignados, omitidos },
      ip:           req.ip,
      userAgent:    req.headers['user-agent'],
    });

    res.json({
      success: true,
      message: mensaje,
      asignados,
      omitidos,
    });
  } catch (err) {
    logger.error('asignarMasivo error:', err);
    res.status(500).json({ success: false, message: 'Error al asignar postulantes' });
  }
}

// ─── RECLUTADOR: stats de su propio dashboard ──────────────────────────────

export async function getDashboardReclutador(req: Request, res: Response): Promise<void> {
  const userId = req.user!.sub;
  try {
    const [[stats]] = await pool.execute<any[]>(`
      SELECT
        COUNT(*)                                    AS total_asignados,
        SUM(p.estado IN ('Pendiente','Asignado'))   AS pendientes,
        SUM(p.estado = 'No responde')               AS no_responde,
        SUM(p.estado = 'Confirmado')                AS confirmados,
        SUM(p.estado = 'Programado')                AS programados,
        SUM(p.estado = 'Ingresó')                   AS ingresaron,
        SUM(p.estado = 'No interesado')             AS no_interesados,
        SUM(p.estado = 'No se presentó')            AS no_presentados,
        SUM(
          p.estado IN ('Pendiente','Asignado','No responde') AND
          (lmax.ultima IS NULL OR lmax.ultima < NOW() - INTERVAL 48 HOUR)
        ) AS urgentes
      FROM postulantes p
      LEFT JOIN (
        SELECT postulante_id, MAX(fecha_llamada) AS ultima
        FROM llamadas GROUP BY postulante_id
      ) lmax ON lmax.postulante_id = p.id
      WHERE p.assigned_to = ? AND p.estado != 'Denegado'
    `, [userId]);

    const [[{ llamadas_hoy }]] = await pool.execute<any[]>(`
      SELECT COUNT(*) AS llamadas_hoy
      FROM llamadas
      WHERE reclutador_id = ? AND DATE(fecha_llamada) = CURDATE()
    `, [userId]);

    res.json({
      success: true,
      data: {
        total_asignados: Number(stats.total_asignados),
        pendientes:       Number(stats.pendientes),
        no_responde:      Number(stats.no_responde),
        confirmados:      Number(stats.confirmados),
        programados:      Number(stats.programados),
        ingresaron:       Number(stats.ingresaron),
        no_interesados:   Number(stats.no_interesados),
        no_presentados:   Number(stats.no_presentados),
        urgentes:         Number(stats.urgentes),
        llamadas_hoy:     Number(llamadas_hoy),
      },
    });
  } catch (err) {
    logger.error('getDashboardReclutador error:', err);
    res.status(500).json({ success: false, message: 'Error al obtener estadísticas' });
  }
}
