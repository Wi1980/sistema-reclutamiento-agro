import { Router } from 'express';
import { body } from 'express-validator';
import rateLimit from 'express-rate-limit';

import { login, refresh, logout, getMySessions, revokeSession, changePassword } from '../controllers/authController';
import {
  createPostulante,
  getPostulantes,
  getPostulanteById,
  deletePostulante,
  updateEstado,
  exportPostulantes,
  getDashboardStats,
  getMisAsignados,
  registrarLlamada,
  getDashboardReclutador,
  asignarMasivo,
  uploadCvPostulante,
  getCvPostulante,
} from '../controllers/postulantesController';
import {
  getUsuarios,
  getRoles,
  createUsuario,
  updateUsuario,
  deleteUsuario,
  createRole,
  updateRole,
  deleteRole,
  resetPassword,
  getUserSessions,
  revokeAllUserSessions,
} from '../controllers/usuariosController';
import {
  getAuditLogs,
  getAuditAcciones,
  getAuditStats,
} from '../controllers/auditController';
import { getAuditCentral } from '../controllers/auditCentralController';
import { soloElCentral } from '../middleware/paseDelCentral';
import { soloLecturaDeListaNegra } from '../middleware/gobiernoListaNegra';
import { getProductividadContratas } from '../controllers/productividadController';
import {
  importarDniExcel, descargarPlantilla,
  importarTrabajadoresExcel, descargarPlantillaTrabajadores,
  importarBajasExcel, descargarPlantillaBajas,
  importarActivosExcel, descargarPlantillaActivos,
} from '../controllers/importController';
import {
  getCampanas, getCampanaById, createCampana,
  updateCampana, cambiarEstadoCampana, getCampanasStats,
} from '../controllers/campanasController';
import multer from 'multer';
import {
  getTrabajadores, getTrabajadoresStats, createTrabajador,
  registrarBaja, registrarReingreso, buscarParaReingreso,
  exportTrabajadores, deleteTrabajador,
} from '../controllers/trabajadoresController';
import {
  getBlacklist, addToBlacklist, updateBlacklist, importBlacklist,
  descargarPlantillaBlacklist, removeFromBlacklist,
} from '../controllers/blacklistController';
import {
  getDepartamentos,
  getProvincias,
  getDistritos,
  getCentrosPoblados,
} from '../controllers/geoController';
import {
  getProfesiones,
  getProfesionesAdmin,
  createProfesion,
  updateProfesion,
  deleteProfesion,
} from '../controllers/profesionesController';
import {
  buscarParaFicha,
  confirmarFicha,
  getAsistencias,
  exportAsistencias,
  pasarATrabajadores,
} from '../controllers/fichaController';
import {
  getHistorialLlamadas,
  exportHistorialLlamadas,
  exportProductividad,
  getNotificaciones,
} from '../controllers/reportesController';
import {
  getEstadoPrincipal,
  postSincronizarPrincipal,
} from '../controllers/principalController';
import {
  authMiddleware,
  requirePermission,
  requireAnyPermission,
} from '../middleware/auth';

const router = Router();

// ── Multer: memoria, sólo Excel ───────────────────────────────
const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const ok = /spreadsheetml|excel|openxmlformats|csv/i.test(file.mimetype) ||
               /\.(xlsx|xls|csv)$/i.test(file.originalname);
    cb(null, ok);
  },
});

// CV de postulantes administrativos: solo PDF, máximo 3 MB
const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024 }, // 3 MB
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype === 'application/pdf' || /\.pdf$/i.test(file.originalname);
    cb(null, ok);
  },
});

// ── Rate limiters ─────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX) || 10,
  message: { success: false, message: 'Demasiados intentos. Intenta en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const publicFormLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Límite de envíos alcanzado. Intenta en 1 hora.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || 'unknown',
});

// Subida de CV pública (tras crear el postulante administrativo)
const cvUploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 15,
  message: { success: false, message: 'Límite de subidas alcanzado. Intenta en 1 hora.' },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip || 'unknown',
});

// F-008: limitar rotación de tokens para dificultar abuso con token robado
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { success: false, message: 'Demasiadas solicitudes de sesión. Intenta en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ────────────────────────────────────────────────────────────
// FICHA DE LLAMADO
// ────────────────────────────────────────────────────────────

// /ficha/buscar — 15 intentos por IP cada 15 min (1/min promedio).
// Suficiente para que alguien escriba mal el DNI varias veces;
// demasiado lento para enumerar DNIs válidos con un script.
const fichaSearchLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: { success: false, message: 'Demasiados intentos. Espera unos minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// /ficha/confirmar — 5 confirmaciones por IP cada hora.
// Un trabajador real confirma una vez; permite algún reintento por error.
const fichaConfirmLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Límite de confirmaciones alcanzado. Intenta en 1 hora.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Públicas — el trabajador las usa desde su celular
router.get('/ficha/buscar',    fichaSearchLimiter,  buscarParaFicha);
router.post('/ficha/confirmar', fichaConfirmLimiter, confirmarFicha);

// Protegidas — supervisor
router.get('/ficha/asistencias',         authMiddleware, requireAnyPermission('llamado.view', 'postulantes.view_all'), getAsistencias);
router.get('/ficha/asistencias/export',  authMiddleware, requireAnyPermission('llamado.exportar', 'postulantes.view_all'), exportAsistencias);
router.post('/ficha/pasar-trabajadores', authMiddleware, requireAnyPermission('llamado.pasar_trabajadores', 'postulantes.view_all'), pasarATrabajadores);

// ────────────────────────────────────────────────────────────
// GEOGRAFÍA (público)
// ────────────────────────────────────────────────────────────
router.get('/geo/departamentos',                getDepartamentos);
router.get('/geo/provincias/:departamentoId',   getProvincias);
router.get('/geo/distritos/:provinciaId',       getDistritos);
router.get('/geo/centros-poblados/:distritoId', getCentrosPoblados);

// ────────────────────────────────────────────────────────────
// PROFESIONES (catálogo)
// ────────────────────────────────────────────────────────────
// Pública: lista activa para el formulario
router.get('/profesiones', getProfesiones);
// Panel: administración (permiso propio profesiones.manage)
router.get(
  '/profesiones/admin',
  authMiddleware,
  requirePermission('profesiones.manage'),
  getProfesionesAdmin
);
router.post(
  '/profesiones',
  authMiddleware,
  requirePermission('profesiones.manage'),
  [body('nombre').trim().isLength({ min: 2, max: 120 })],
  createProfesion
);
router.put(
  '/profesiones/:id',
  authMiddleware,
  requirePermission('profesiones.manage'),
  updateProfesion
);
router.delete(
  '/profesiones/:id',
  authMiddleware,
  requirePermission('profesiones.manage'),
  deleteProfesion
);

// ────────────────────────────────────────────────────────────
// AUTH
// ────────────────────────────────────────────────────────────
router.post(
  '/auth/login',
  authLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }),
  ],
  login
);
router.post('/auth/refresh', refreshLimiter, refresh);
router.post('/auth/logout', authMiddleware, logout);
router.post(
  '/auth/change-password',
  authMiddleware,
  [
    body('currentPassword').notEmpty(),
    body('password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/),
  ],
  changePassword
);

// Sesiones del usuario autenticado
router.get('/auth/sessions', authMiddleware, getMySessions);
router.delete('/auth/sessions/:sessionId', authMiddleware, revokeSession);

// ────────────────────────────────────────────────────────────
// PADRÓN CENTRAL (sistema Principal)
// ────────────────────────────────────────────────────────────
// Sólo identidad: quién entra y con qué rol. Este sistema no baja el padrón
// de planilla — ver database/migration_v13_principal.sql.
router.get('/principal/estado', authMiddleware, requirePermission('usuarios.view'), getEstadoPrincipal);
router.post('/principal/sincronizar', authMiddleware, requirePermission('usuarios.view'), postSincronizarPrincipal);

// ────────────────────────────────────────────────────────────
// POSTULANTES — formulario público
// ────────────────────────────────────────────────────────────
router.post(
  '/postulantes',
  publicFormLimiter,
  [
    body('nombres').trim().isLength({ min: 2, max: 100 }).escape(),
    body('apellidos').trim().isLength({ min: 2, max: 100 }).escape(),
    body('dni').trim().isLength({ min: 8, max: 12 }).isAlphanumeric(),
    body('celular').trim().isLength({ min: 7, max: 20 }),
    body('departamento').trim().notEmpty().escape(),
    body('provincia').trim().notEmpty().escape(),
    body('distrito').trim().notEmpty().escape(),
    body('centro_poblado').optional({ nullable: true, checkFalsy: true }).trim().escape(),
    body('como_entero').trim().isIn(['Facebook','Instagram','TikTok','Amigo/Familiar','Volante','Periódico','Radio','Otro']),
    body('acepta_politicas').isBoolean().equals('true'),
    body('fecha_nacimiento').optional({ nullable: true, checkFalsy: true }).isDate()
      .custom((value) => {
        const birth = new Date(value);
        if (isNaN(birth.getTime())) throw new Error('Fecha de nacimiento inválida');
        const today = new Date();
        let age = today.getFullYear() - birth.getFullYear();
        const m = today.getMonth() - birth.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
        if (age < 18) throw new Error('Debes ser mayor de edad (18 años cumplidos)');
        if (age > 100) throw new Error('Fecha de nacimiento inválida');
        return true;
      }),
    body('sexo').optional({ nullable: true, checkFalsy: true }).isIn(['M', 'F']),
    body('estado_civil').optional({ nullable: true, checkFalsy: true })
      .isIn(['Soltero', 'Casado', 'Conviviente', 'Divorciado', 'Viudo']),
    body('email').optional({ nullable: true, checkFalsy: true }).isEmail().normalizeEmail(),
    // ── Perfiles Campo / Administrativo (v10) ──
    // Opcionales/tolerantes a propósito: durante el deploy (backend antes que
    // frontend) el formulario viejo aún no los envía. La obligatoriedad se
    // exige en el frontend; aquí solo validamos el valor cuando viene.
    body('area_interes').optional({ nullable: true, checkFalsy: true })
      .isIn(['Campo', 'Administrativo/Operativo']),
    body('discapacidad').optional({ nullable: true }).isBoolean(),
    body('grado_instruccion').optional({ nullable: true, checkFalsy: true })
      .isIn(['Técnico', 'Bachiller', 'Titulado', 'Titulado/Colegiado']),
    body('profesion').optional({ nullable: true, checkFalsy: true }).trim().isLength({ max: 200 }),
  ],
  createPostulante
);

// ────────────────────────────────────────────────────────────
// POSTULANTES — panel admin (protegidos)
// ────────────────────────────────────────────────────────────
router.get(
  '/postulantes',
  authMiddleware,
  requireAnyPermission('postulantes.view', 'postulantes.view_assigned', 'postulantes.view_all'),
  getPostulantes
);
router.get(
  '/postulantes/export',
  authMiddleware,
  requirePermission('postulantes.export'),
  exportPostulantes
);
// Asignación masiva — antes de /:id para evitar conflicto de ruta
router.post(
  '/postulantes/asignar-masivo',
  authMiddleware,
  requirePermission('postulantes.assign'),
  asignarMasivo
);
// RECLUTADOR: sus asignados — antes de /:id para evitar conflicto
router.get(
  '/postulantes/mis-asignados',
  authMiddleware,
  requirePermission('postulantes.view_assigned'),
  getMisAsignados
);
router.post(
  '/postulantes/:id/llamada',
  authMiddleware,
  requirePermission('postulantes.log_llamada'),
  registrarLlamada
);
// CV — subida pública (tras crear el postulante administrativo)
router.post(
  '/postulantes/:id/cv',
  cvUploadLimiter,
  pdfUpload.single('cv'),
  uploadCvPostulante as any
);
// CV — ver inline en el panel (protegido)
router.get(
  '/postulantes/:id/cv',
  authMiddleware,
  requireAnyPermission('postulantes.view', 'postulantes.view_assigned', 'postulantes.view_all'),
  getCvPostulante
);
router.get(
  '/postulantes/:id',
  authMiddleware,
  requireAnyPermission('postulantes.view', 'postulantes.view_assigned', 'postulantes.view_all'),
  getPostulanteById
);
router.patch(
  '/postulantes/:id/estado',
  authMiddleware,
  requireAnyPermission('postulantes.edit', 'postulantes.edit_status'),
  updateEstado
);
router.delete(
  '/postulantes/:id',
  authMiddleware,
  requirePermission('postulantes.delete'),
  deletePostulante
);

// ────────────────────────────────────────────────────────────
// DASHBOARD
// ────────────────────────────────────────────────────────────
router.get(
  '/dashboard/stats',
  authMiddleware,
  requirePermission('dashboard.view'),
  getDashboardStats
);
router.get(
  '/dashboard/reclutador',
  authMiddleware,
  requirePermission('postulantes.view_assigned'),
  getDashboardReclutador
);

// ────────────────────────────────────────────────────────────
// USUARIOS
// ────────────────────────────────────────────────────────────
router.get(
  '/usuarios',
  authMiddleware,
  requirePermission('usuarios.view'),
  getUsuarios
);
router.get(
  '/roles',
  authMiddleware,
  requirePermission('usuarios.view'),
  getRoles
);
router.post(
  '/roles',
  authMiddleware,
  requirePermission('usuarios.manage'),
  [body('nombre').trim().isLength({ min: 2, max: 50 })],
  createRole
);
router.put(
  '/roles/:id',
  authMiddleware,
  requirePermission('usuarios.manage'),
  updateRole
);
router.delete(
  '/roles/:id',
  authMiddleware,
  requirePermission('usuarios.manage'),
  deleteRole
);
router.post(
  '/usuarios',
  authMiddleware,
  requirePermission('usuarios.manage'),
  [
    body('nombre').optional().trim().isLength({ min: 2, max: 120 }),
    body('nombres').optional().trim().isLength({ min: 2, max: 60 }),
    body('apellidos').optional().trim().isLength({ min: 2, max: 60 }),
    body('dni').optional().trim().isLength({ min: 8, max: 12 }),
    body('email').isEmail().normalizeEmail(),
    body('password').optional().isLength({ min: 8 }),
    body('rol').trim().notEmpty(),
  ],
  createUsuario
);
router.put(
  '/usuarios/:id',
  authMiddleware,
  requirePermission('usuarios.manage'),
  updateUsuario
);
router.delete(
  '/usuarios/:id',
  authMiddleware,
  requirePermission('usuarios.manage'),
  deleteUsuario
);
router.post(
  '/usuarios/:id/reset-password',
  authMiddleware,
  requirePermission('usuarios.manage'),
  [body('password').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)],
  resetPassword
);
router.get(
  '/usuarios/:id/sesiones',
  authMiddleware,
  requirePermission('usuarios.view'),
  getUserSessions
);
router.delete(
  '/usuarios/:id/sesiones',
  authMiddleware,
  requirePermission('usuarios.view'),
  revokeAllUserSessions
);

// ────────────────────────────────────────────────────────────
// PRODUCTIVIDAD
// ────────────────────────────────────────────────────────────
router.get(
  '/productividad/contratas',
  authMiddleware,
  requireAnyPermission('productividad.view', 'postulantes.assign'),
  getProductividadContratas
);

// ────────────────────────────────────────────────────────────
// IMPORTACIÓN EXCEL
// ────────────────────────────────────────────────────────────
router.get(
  '/import/plantilla',
  authMiddleware,
  requirePermission('postulantes.view_all'),
  descargarPlantilla
);
router.post(
  '/import/dni-excel',
  authMiddleware,
  requirePermission('postulantes.view_all'),
  excelUpload.single('archivo'),
  importarDniExcel as any
);
router.get(
  '/import/plantilla-trabajadores',
  authMiddleware,
  requireAnyPermission('postulantes.view_all', 'bajas.manage'),
  descargarPlantillaTrabajadores
);
router.post(
  '/import/trabajadores-excel',
  authMiddleware,
  requireAnyPermission('postulantes.view_all', 'bajas.manage'),
  excelUpload.single('archivo'),
  importarTrabajadoresExcel as any
);
router.get(
  '/import/plantilla-bajas',
  authMiddleware,
  requirePermission('bajas.manage'),
  descargarPlantillaBajas
);
router.post(
  '/import/bajas-excel',
  authMiddleware,
  requirePermission('bajas.manage'),
  excelUpload.single('archivo'),
  importarBajasExcel as any
);
router.get(
  '/import/plantilla-activos',
  authMiddleware,
  requireAnyPermission('postulantes.view_all', 'bajas.manage'),
  descargarPlantillaActivos
);
router.post(
  '/import/activos-excel',
  authMiddleware,
  requireAnyPermission('postulantes.view_all', 'bajas.manage'),
  excelUpload.single('archivo'),
  importarActivosExcel as any
);

// ────────────────────────────────────────────────────────────
// TRABAJADORES
// ────────────────────────────────────────────────────────────
router.get(
  '/trabajadores',
  authMiddleware,
  requireAnyPermission('trabajadores.view', 'trabajadores.manage', 'postulantes.view_all', 'bajas.manage', 'reingresos.manage'),
  getTrabajadores
);
router.get(
  '/trabajadores/stats',
  authMiddleware,
  requireAnyPermission('trabajadores.view', 'trabajadores.manage', 'postulantes.view_all', 'bajas.manage'),
  getTrabajadoresStats
);
router.get(
  '/trabajadores/export',
  authMiddleware,
  requireAnyPermission('trabajadores.view', 'trabajadores.manage', 'postulantes.view_all'),
  exportTrabajadores
);
router.get(
  '/trabajadores/buscar-baja',
  authMiddleware,
  requireAnyPermission('reingresos.manage', 'reingresos.view'),
  buscarParaReingreso
);
router.post(
  '/trabajadores',
  authMiddleware,
  requireAnyPermission('trabajadores.manage', 'postulantes.view_all', 'bajas.manage'),
  [
    body('nombres').trim().isLength({ min: 2, max: 100 }).escape(),
    body('apellidos').trim().isLength({ min: 2, max: 100 }).escape(),
    body('dni').trim().isLength({ min: 8, max: 12 }),
    body('celular').trim().isLength({ min: 7, max: 20 }),
    body('fecha_ingreso').isDate(),
  ],
  createTrabajador
);
router.post(
  '/trabajadores/:id/baja',
  authMiddleware,
  requirePermission('bajas.manage'),
  registrarBaja
);
router.post(
  '/trabajadores/:id/reingreso',
  authMiddleware,
  requirePermission('reingresos.manage'),
  registrarReingreso
);
router.delete(
  '/trabajadores/:id',
  authMiddleware,
  requirePermission('trabajadores.delete'),
  deleteTrabajador
);

// ────────────────────────────────────────────────────────────
// CAMPAÑAS
// ────────────────────────────────────────────────────────────
router.get(
  '/campanas/stats',
  authMiddleware,
  requirePermission('campanas.view'),
  getCampanasStats
);
router.get(
  '/campanas',
  authMiddleware,
  requirePermission('campanas.view'),
  getCampanas
);
router.get(
  '/campanas/:id',
  authMiddleware,
  requirePermission('campanas.view'),
  getCampanaById
);
router.post(
  '/campanas',
  authMiddleware,
  requirePermission('campanas.manage'),
  [
    body('nombre').trim().isLength({ min: 2, max: 200 }),
    body('fecha_inicio').isDate(),
    body('objetivo_qty').optional().isInt({ min: 0 }),
  ],
  createCampana
);
router.put(
  '/campanas/:id',
  authMiddleware,
  requirePermission('campanas.manage'),
  updateCampana
);
router.patch(
  '/campanas/:id/estado',
  authMiddleware,
  requirePermission('campanas.manage'),
  [body('estado').isIn(['activa', 'pausada', 'cerrada'])],
  cambiarEstadoCampana
);

// ────────────────────────────────────────────────────────────
// LISTA NEGRA
// ────────────────────────────────────────────────────────────
router.get(
  '/blacklist/plantilla',
  authMiddleware,
  requireAnyPermission('blacklist.view', 'blacklist.manage'),
  descargarPlantillaBlacklist
);
router.get(
  '/blacklist',
  authMiddleware,
  requireAnyPermission('blacklist.view', 'blacklist.manage'),
  getBlacklist
);
router.post(
  '/blacklist',
  authMiddleware,
  requirePermission('blacklist.manage'),
  soloLecturaDeListaNegra('vetar a alguien'),
  [
    body('apellidos').trim().isLength({ min: 1, max: 200 }),
    body('nombres').trim().isLength({ min: 1, max: 200 }),
    body('dni').trim().isLength({ min: 8, max: 12 }),
  ],
  addToBlacklist
);
router.post(
  '/blacklist/import',
  authMiddleware,
  requirePermission('blacklist.manage'),
  soloLecturaDeListaNegra('importar vetados'),
  excelUpload.single('archivo'),
  importBlacklist as any
);
router.put(
  '/blacklist/:id',
  authMiddleware,
  requirePermission('blacklist.manage'),
  soloLecturaDeListaNegra('editar un veto'),
  [
    body('apellidos').trim().isLength({ min: 1, max: 200 }),
    body('nombres').trim().isLength({ min: 1, max: 200 }),
    body('dni').trim().isLength({ min: 8, max: 12 }),
  ],
  updateBlacklist
);
router.delete(
  '/blacklist/:id',
  authMiddleware,
  requirePermission('blacklist.manage'),
  soloLecturaDeListaNegra('quitar a alguien de la lista'),
  removeFromBlacklist
);

// ────────────────────────────────────────────────────────────
// REPORTES (historial llamadas + exports + notificaciones)
// ────────────────────────────────────────────────────────────
router.get(
  '/reportes/historial-llamadas/export',
  authMiddleware,
  requirePermission('productividad.view'),
  exportHistorialLlamadas
);
router.get(
  '/reportes/historial-llamadas',
  authMiddleware,
  requirePermission('productividad.view'),
  getHistorialLlamadas
);
router.get(
  '/reportes/productividad/export',
  authMiddleware,
  requirePermission('productividad.view'),
  exportProductividad
);
router.get(
  '/notificaciones',
  authMiddleware,
  requirePermission('productividad.view'),
  getNotificaciones
);

// ────────────────────────────────────────────────────────────
// AUDITORÍA (solo ROOT y JEFA_RRHH con audit.view)
// ────────────────────────────────────────────────────────────
router.get(
  '/audit',
  authMiddleware,
  requirePermission('audit.view'),
  getAuditLogs
);
router.get(
  '/audit/acciones',
  authMiddleware,
  requirePermission('audit.view'),
  getAuditAcciones
);
router.get(
  '/audit/stats',
  authMiddleware,
  requirePermission('audit.view'),
  getAuditStats
);

/**
 * La misma bitácora, pero para el sistema Principal.
 *
 * No lleva `authMiddleware` a propósito: quien llama no es una persona con
 * sesión sino el central con un pase firmado, que `soloElCentral` verifica con
 * la clave pública. Mezclar las dos credenciales en un mismo middleware es como
 * se cuelan los agujeros.
 */
router.get('/auditoria/central', soloElCentral, getAuditCentral);

export default router;
