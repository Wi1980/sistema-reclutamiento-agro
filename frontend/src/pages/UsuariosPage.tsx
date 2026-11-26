import { useState, useEffect, useCallback, useRef } from 'react';
import { fmtFechaHora } from '@/utils/dates';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  UserPlus, MoreVertical, KeyRound, Pencil,
  ToggleLeft, ToggleRight, RefreshCw, Eye, EyeOff, Trash2,
  Link2, Link2Off,
} from 'lucide-react';
import api from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import { useIsRoot, usePermission } from '@/hooks/usePermission';
import PermissionGate from '@/components/PermissionGate';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody, DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { rolLabel } from '@/lib/roles';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

interface Usuario {
  id: number;
  nombre: string;
  email: string;
  rol: string;
  activo: boolean;
  ultimo_login: string | null;
  created_at: string;
  creado_por: string | null;
  sesiones_activas: number;
  /** 1 si la cuenta la gobierna el sistema Principal y aquí no se edita. */
  gestionado_por_principal?: number;
}

interface EstadoPrincipal {
  conectado: boolean;
  url: string | null;
  cadaMinutos: number;
  usuariosDelCentral: number;
  enlinea: { ok: boolean; detalle: string };
  ultimoIntento: { cuando: string; ok: boolean; altas: number; desactivados: number } | null;
}

interface Rol {
  id: number;
  nombre: string;
  permisos: Record<string, boolean>;
}

interface Sesion {
  session_id: string;
  ip_address: string;
  user_agent: string;
  nombre_dispositivo: string | null;
  created_at: string;
  expires_at: string;
  revoked: boolean;
}

const ROL_VARIANT: Record<string, 'default' | 'warning' | 'info' | 'secondary' | 'purple'> = {
  ROOT:                   'purple',
  RECLUTADORA:  'warning',
  CONTRATA:               'info',
  CONSULTA:               'secondary',
  VIEWER:                 'secondary',
  // legacy
  JEFA_RRHH:              'warning',
  RECLUTADOR:             'info',
  superadmin:             'purple',
  admin:                  'default',
  viewer:                 'secondary',
};

// Primera letra del primer nombre + primer apellido + @agroexportadora.com
function generarEmail(nombres: string, apellidos: string): string {
  const norm = (s: string) =>
    s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
  const inicial  = norm((nombres.trim().split(/\s+/)[0] ?? '')).charAt(0);
  const apellido = norm(apellidos.trim().split(/\s+/)[0] ?? '');
  return inicial && apellido ? `${inicial}${apellido}@agroexportadora.com` : '';
}

const createSchema = z.object({
  nombres:   z.string().min(2, 'Mín. 2 caracteres').max(60),
  apellidos: z.string().min(2, 'Mín. 2 caracteres').max(60),
  dni:       z.string().min(8, 'Mín. 8 dígitos').max(12).refine(v => /^\d+$/.test(v), { message: 'Solo números' }),
  email:     z.string().email('Email inválido'),
  rol:       z.string().min(1, 'Selecciona un rol'),
});

const resetSchema = z.object({
  password: z.string()
    .min(8, 'Mín. 8 caracteres')
    .refine(v => /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(v), { message: 'Debe tener mayúscula, minúscula y número' }),
});

const editSchema = z.object({
  nombre: z.string().min(2, 'Mín. 2 caracteres').max(120),
  rol:    z.string().min(1, 'Selecciona un rol'),
});

type CreateForm = z.infer<typeof createSchema>;
type ResetForm  = z.infer<typeof resetSchema>;
type EditForm   = z.infer<typeof editSchema>;

export default function UsuariosPage() {
  const [usuarios, setUsuarios]           = useState<Usuario[]>([]);
  const [roles, setRoles]                 = useState<Rol[]>([]);
  const [loading, setLoading]             = useState(true);
  const [showCreate, setShowCreate]       = useState(false);
  const [editTarget, setEditTarget]       = useState<Usuario | null>(null);
  const [resetTarget,   setResetTarget]   = useState<Usuario | null>(null);
  const [showResetPass, setShowResetPass] = useState(false);
  const [sesionUser, setSesionUser]       = useState<Usuario | null>(null);
  const [sesiones, setSesiones]           = useState<Sesion[]>([]);
  const [sesionLoading, setSesionLoading] = useState(false);
  const [generatedPwd, setGeneratedPwd]   = useState<{ nombre: string; pwd: string } | null>(null);
  const [deleteTarget, setDeleteTarget]   = useState<Usuario | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [central, setCentral]             = useState<EstadoPrincipal | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const { user: me }                  = useAuthStore();
  const isRoot                        = useIsRoot();
  const hasManagePermission           = usePermission('usuarios.manage');

  const createForm = useForm<CreateForm>({ resolver: zodResolver(createSchema) });
  const resetForm  = useForm<ResetForm>({ resolver: zodResolver(resetSchema) });
  const editForm   = useForm<EditForm>({ resolver: zodResolver(editSchema) });

  const emailEditedRef   = useRef(false);
  const watchedNombres   = createForm.watch('nombres');
  const watchedApellidos = createForm.watch('apellidos');

  useEffect(() => {
    if (emailEditedRef.current) return;
    const suggested = generarEmail(watchedNombres ?? '', watchedApellidos ?? '');
    if (suggested) createForm.setValue('email', suggested, { shouldValidate: false });
  }, [watchedNombres, watchedApellidos, createForm]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [uRes, rRes] = await Promise.all([api.get('/usuarios'), api.get('/roles')]);
      setUsuarios(uRes.data.data);
      setRoles(rRes.data.data);
      // El estado del central va aparte: si no responde, la lista de usuarios
      // tiene que salir igual.
      try {
        const cRes = await api.get('/principal/estado');
        setCentral(cRes.data.data);
      } catch {
        setCentral(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  async function sincronizarCentral() {
    setSincronizando(true);
    try {
      await api.post('/principal/sincronizar', {});
      await fetchData();
    } finally {
      setSincronizando(false);
    }
  }

  useEffect(() => { fetchData(); }, [fetchData]);

  async function onCreate(data: CreateForm) {
    try {
      await api.post('/usuarios', {
        nombres:   data.nombres,
        apellidos: data.apellidos,
        dni:       data.dni,
        email:     data.email,
        rol:       data.rol,
      });
    } catch (err: any) {
      createForm.setError('root', {
        message: err?.response?.data?.message || 'Error al crear usuario. Intenta de nuevo.',
      });
      return;
    }
    const nombre = `${data.nombres} ${data.apellidos}`;
    const dni    = data.dni;
    createForm.reset();
    emailEditedRef.current = false;
    setShowCreate(false);
    fetchData();
    setGeneratedPwd({ nombre, pwd: dni });
  }

  function openEdit(u: Usuario) {
    setEditTarget(u);
    editForm.reset({ nombre: u.nombre, rol: u.rol });
  }

  async function onEdit(data: EditForm) {
    if (!editTarget) return;
    await api.put(`/usuarios/${editTarget.id}`, { nombre: data.nombre, rol: data.rol });
    setEditTarget(null);
    fetchData();
  }

  async function toggleActivo(u: Usuario) {
    await api.put(`/usuarios/${u.id}`, { activo: !u.activo });
    setUsuarios(prev => prev.map(x => x.id === u.id ? { ...x, activo: !u.activo } : x));
  }

  async function onResetPassword(data: ResetForm) {
    if (!resetTarget) return;
    await api.post(`/usuarios/${resetTarget.id}/reset-password`, data);
    resetForm.reset();
    setResetTarget(null);
  }

  async function openSesiones(u: Usuario) {
    setSesionUser(u);
    setSesionLoading(true);
    try {
      const res = await api.get(`/usuarios/${u.id}/sesiones`);
      setSesiones(res.data.data);
    } finally {
      setSesionLoading(false);
    }
  }

  async function onDelete() {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/usuarios/${deleteTarget.id}`);
      setDeleteTarget(null);
      fetchData();
    } finally {
      setDeleteLoading(false);
    }
  }

  async function revokeAllSessions(u: Usuario) {
    await api.delete(`/usuarios/${u.id}/sesiones`);
    setSesiones([]);
    fetchData();
  }

  const canManage = (u: Usuario) => hasManagePermission && u.id !== me?.id && (isRoot || u.rol !== 'ROOT');

  /**
   * Cuentas que llegan del sistema Principal. Aquí sólo se miran: el rol, el
   * nombre y el interruptor los vuelve a escribir la sincronización, así que
   * ofrecer los botones sería prometer un cambio que se desharía solo.
   */
  const esDelCentral = (u: Usuario) => u.gestionado_por_principal === 1;

  /*
   * Con el central conectado aquí no nace nadie nuevo: una cuenta creada en
   * este sistema tendría su propia contraseña, que Principal no conoce y por
   * lo tanto no puede bloquear. El servidor lo rechaza igual; esconder el
   * botón evita que alguien lo pulse para nada.
   */
  const centralConectado = central?.conectado === true;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-stone-800">Usuarios del Sistema</h1>
          <p className="text-stone-400 text-sm mt-0.5">{usuarios.length} usuarios registrados</p>
        </div>
        <div className="flex gap-3">
          <button onClick={fetchData} className="btn-secondary py-2 px-3">
            <RefreshCw className="w-4 h-4" />
          </button>
          {!centralConectado && (
            <PermissionGate anyOf={['usuarios.manage']}>
              <Button onClick={() => setShowCreate(true)}>
                <UserPlus className="w-4 h-4" /> Nuevo Usuario
              </Button>
            </PermissionGate>
          )}
        </div>
      </div>

      {/*
        Estado del padrón central. Está aquí, encima de la lista, porque la
        pregunta que va a llegar siempre es «le di acceso en Principal y no
        aparece», y la respuesta casi siempre es una de estas dos: la conexión
        está caída, o todavía no ha pasado el turno de sincronización.
      */}
      {central && (
        <div className={`card px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 ${central.enlinea.ok ? 'border-l-4 border-l-agro-500' : 'border-l-4 border-l-amber-400'}`}>
          <div className="flex items-center gap-2 flex-1 min-w-0">
            {central.enlinea.ok
              ? <Link2 className="w-4 h-4 text-agro-600 flex-shrink-0" />
              : <Link2Off className="w-4 h-4 text-amber-500 flex-shrink-0" />}
            <div className="min-w-0">
              <p className="text-sm font-medium text-stone-800">
                {central.enlinea.ok ? 'Accesos centralizados' : 'Sin conexión con el sistema central'}
              </p>
              <p className="text-xs text-stone-500 truncate">
                {central.enlinea.detalle}
                {central.conectado && ` · ${central.usuariosDelCentral} cuenta${central.usuariosDelCentral === 1 ? '' : 's'} del central · revisa cada ${central.cadaMinutos} min`}
              </p>
              {/*
                Por qué desapareció «Nuevo Usuario»: es lo primero que se va a
                preguntar quien abra esta pantalla, y sin la respuesta a la
                vista parece que el sistema se rompió.
              */}
              {central.conectado && (
                <p className="text-xs text-stone-500 mt-1">
                  Los usuarios se dan de alta en Principal. Las cuentas locales que ya existían se
                  siguen administrando aquí.
                </p>
              )}
            </div>
          </div>
          {central.conectado && (
            <button
              onClick={sincronizarCentral}
              disabled={sincronizando}
              className="btn-secondary py-1.5 px-3 text-xs whitespace-nowrap self-start sm:self-auto"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${sincronizando ? 'animate-spin' : ''}`} />
              {sincronizando ? 'Revisando…' : 'Revisar ahora'}
            </button>
          )}
        </div>
      )}

      {/* Tabla */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 border-b border-stone-100">
              <tr>
                {([
                  { h: 'Usuario',       cls: '' },
                  { h: 'Email',         cls: 'hidden sm:table-cell' },
                  { h: 'Rol',           cls: '' },
                  { h: 'Estado',        cls: '' },
                  { h: 'Sesiones',      cls: 'hidden md:table-cell' },
                  { h: 'Último acceso', cls: 'hidden md:table-cell' },
                  { h: 'Creado por',    cls: 'hidden lg:table-cell' },
                  { h: '',              cls: '' },
                ]).map(({ h, cls }) => (
                  <th key={h} className={`px-4 py-3 text-left text-xs font-semibold text-stone-500 whitespace-nowrap ${cls}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 w-24" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : usuarios.map(u => (
                <tr key={u.id} className={`hover:bg-stone-50 transition-colors ${!u.activo ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-agro-100 flex items-center justify-center text-agro-700 text-xs font-bold flex-shrink-0">
                        {u.nombre.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-medium text-stone-800">{u.nombre}</span>
                      {esDelCentral(u) && (
                        <span
                          title="Esta cuenta se administra desde el sistema Principal"
                          className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-agro-700 bg-agro-50 border border-agro-100 rounded-md px-1.5 py-0.5"
                        >
                          <Link2 className="w-3 h-3" /> Principal
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-stone-500 hidden sm:table-cell">{u.email}</td>
                  <td className="px-4 py-3">
                    <Badge variant={ROL_VARIANT[u.rol] ?? 'secondary'}>{rolLabel(u.rol)}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={u.activo ? 'success' : 'danger'}>
                      {u.activo ? 'Activo' : 'Bloqueado'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell">
                    <span className={`text-xs font-mono ${u.sesiones_activas > 0 ? 'text-agro-700 font-semibold' : 'text-stone-400'}`}>
                      {u.sesiones_activas} activa{u.sesiones_activas !== 1 ? 's' : ''}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-stone-400 text-xs whitespace-nowrap hidden md:table-cell">
                    {u.ultimo_login ? fmtFechaHora(u.ultimo_login) : 'Nunca'}
                  </td>
                  <td className="px-4 py-3 text-stone-500 text-xs hidden lg:table-cell">{u.creado_por || 'Sistema'}</td>
                  <td className="px-4 py-3">
                    {canManage(u) && (
                      <DropdownMenu>
                        <DropdownMenuTrigger className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-500 transition-colors">
                          <MoreVertical className="w-4 h-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Acciones</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {esDelCentral(u) ? (
                            <div className="px-2 py-2 text-xs text-stone-500 max-w-[16rem]">
                              El rol, el nombre y el bloqueo de esta cuenta se cambian
                              en el sistema <span className="font-semibold">Principal</span>.
                              Aquí se desharían en la siguiente sincronización.
                            </div>
                          ) : (
                            <>
                              <DropdownMenuItem onClick={() => openEdit(u)}>
                                <Pencil className="w-4 h-4" /> Editar usuario
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => toggleActivo(u)}>
                                {u.activo
                                  ? <><ToggleLeft className="w-4 h-4" /> Bloquear usuario</>
                                  : <><ToggleRight className="w-4 h-4" /> Desbloquear</>
                                }
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => { setResetTarget(u); resetForm.reset(); }}>
                                <KeyRound className="w-4 h-4" /> Resetear contraseña
                              </DropdownMenuItem>
                            </>
                          )}
                          <DropdownMenuItem onClick={() => openSesiones(u)}>
                            <Eye className="w-4 h-4" /> Ver sesiones ({u.sesiones_activas})
                          </DropdownMenuItem>
                          {isRoot && u.sesiones_activas > 0 && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => revokeAllSessions(u)}
                              >
                                <Trash2 className="w-4 h-4" /> Revocar sesiones
                              </DropdownMenuItem>
                            </>
                          )}
                          {isRoot && u.rol !== 'ROOT' && !esDelCentral(u) && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-700 hover:text-red-800 hover:bg-red-50 font-medium"
                                onClick={() => setDeleteTarget(u)}
                              >
                                <Trash2 className="w-4 h-4" /> Eliminar usuario
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dialog: Crear Usuario */}
      <Dialog open={showCreate} onOpenChange={open => { setShowCreate(open); if (!open) { createForm.reset(); emailEditedRef.current = false; } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear nuevo usuario</DialogTitle>
          </DialogHeader>
          <form onSubmit={createForm.handleSubmit(onCreate)}>
            <DialogBody>
              {/* Nombres y Apellidos en grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Nombres</Label>
                  <Input placeholder="Ej: María Elena" {...createForm.register('nombres')} />
                  {createForm.formState.errors.nombres && (
                    <p className="text-red-500 text-xs mt-1">{createForm.formState.errors.nombres.message}</p>
                  )}
                </div>
                <div>
                  <Label>Apellidos</Label>
                  <Input placeholder="Ej: García López" {...createForm.register('apellidos')} />
                  {createForm.formState.errors.apellidos && (
                    <p className="text-red-500 text-xs mt-1">{createForm.formState.errors.apellidos.message}</p>
                  )}
                </div>
              </div>

              <div>
                <Label>DNI</Label>
                <Input
                  placeholder="12345678"
                  maxLength={12}
                  {...createForm.register('dni')}
                />
                {createForm.formState.errors.dni && (
                  <p className="text-red-500 text-xs mt-1">{createForm.formState.errors.dni.message}</p>
                )}
              </div>

              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                <KeyRound className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800 leading-snug">
                  La contraseña inicial del usuario será <strong>su número de DNI</strong>.
                  Se le pedirá cambiarla en su primer ingreso.
                </p>
              </div>

              <div>
                <Label>Correo electrónico</Label>
                <Input
                  type="email"
                  placeholder="usuario@agroexportadora.com"
                  {...createForm.register('email')}
                  onChange={e => {
                    emailEditedRef.current = true;
                    createForm.setValue('email', e.target.value, { shouldValidate: true });
                  }}
                />
                {createForm.formState.errors.email && (
                  <p className="text-red-500 text-xs mt-1">{createForm.formState.errors.email.message}</p>
                )}
              </div>

              <div>
                <Label>Rol</Label>
                <select className="input" {...createForm.register('rol')}>
                  <option value="">Seleccionar rol...</option>
                  {roles
                    .filter(r => isRoot || r.nombre !== 'ROOT')
                    .map(r => (
                      <option key={r.id} value={r.nombre}>{rolLabel(r.nombre)}</option>
                    ))
                  }
                </select>
                {createForm.formState.errors.rol && (
                  <p className="text-red-500 text-xs mt-1">{createForm.formState.errors.rol.message}</p>
                )}
              </div>
            </DialogBody>
            {createForm.formState.errors.root && (
              <div className="px-5 pb-1">
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
                  {createForm.formState.errors.root.message}
                </p>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={createForm.formState.isSubmitting}>
                {createForm.formState.isSubmitting ? 'Creando...' : 'Crear Usuario'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Editar Usuario */}
      <Dialog open={!!editTarget} onOpenChange={open => !open && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar usuario</DialogTitle>
          </DialogHeader>
          <form onSubmit={editForm.handleSubmit(onEdit)}>
            <DialogBody>
              <div>
                <Label>Nombre completo</Label>
                <Input placeholder="Nombre del usuario" {...editForm.register('nombre')} />
                {editForm.formState.errors.nombre && (
                  <p className="text-red-500 text-xs mt-1">{editForm.formState.errors.nombre.message}</p>
                )}
              </div>
              <div>
                <Label>Rol</Label>
                <select className="input" {...editForm.register('rol')}>
                  <option value="">Seleccionar rol...</option>
                  {roles
                    .filter(r => isRoot || r.nombre !== 'ROOT')
                    .map(r => (
                      <option key={r.id} value={r.nombre}>{rolLabel(r.nombre)}</option>
                    ))
                  }
                </select>
                {editForm.formState.errors.rol && (
                  <p className="text-red-500 text-xs mt-1">{editForm.formState.errors.rol.message}</p>
                )}
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditTarget(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={editForm.formState.isSubmitting}>
                {editForm.formState.isSubmitting ? 'Guardando...' : 'Guardar cambios'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Reset Password */}
      <Dialog open={!!resetTarget} onOpenChange={open => { if (!open) { setResetTarget(null); setShowResetPass(false); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resetear contraseña</DialogTitle>
          </DialogHeader>
          <form onSubmit={resetForm.handleSubmit(onResetPassword)}>
            <DialogBody>
              {resetTarget && (
                <p className="text-sm text-stone-600 bg-stone-50 rounded-lg p-3">
                  Cambiando contraseña de <strong>{resetTarget.nombre}</strong>.
                  Se revocarán todas sus sesiones activas.
                </p>
              )}
              <div>
                <Label>Nueva contraseña</Label>
                <div className="relative">
                  <Input
                    type={showResetPass ? 'text' : 'password'}
                    className="pr-10"
                    placeholder="Mín. 8 car., mayúscula y número"
                    {...resetForm.register('password')}
                  />
                  <button
                    type="button"
                    onClick={() => setShowResetPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 transition-colors"
                  >
                    {showResetPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {resetForm.formState.errors.password && (
                  <p className="text-red-500 text-xs mt-1">{resetForm.formState.errors.password.message}</p>
                )}
              </div>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setResetTarget(null)}>
                Cancelar
              </Button>
              <Button type="submit" variant="destructive" disabled={resetForm.formState.isSubmitting}>
                {resetForm.formState.isSubmitting ? 'Actualizando...' : 'Actualizar contraseña'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Confirmación de usuario creado */}
      <Dialog open={!!generatedPwd} onOpenChange={open => !open && setGeneratedPwd(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Usuario creado exitosamente</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-stone-600">
              El usuario <strong>{generatedPwd?.nombre}</strong> fue creado correctamente.
            </p>
            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-1">
              <p className="text-xs font-semibold text-amber-700">Clave inicial</p>
              <div className="flex items-center gap-2">
                <code className="text-base font-mono flex-1 select-all text-stone-800 tracking-widest">
                  {generatedPwd?.pwd}
                </code>
                <button
                  className="text-xs text-agro-700 hover:text-agro-900 font-semibold shrink-0"
                  onClick={() => generatedPwd && navigator.clipboard.writeText(generatedPwd.pwd)}
                >
                  Copiar
                </button>
              </div>
              <p className="text-xs text-amber-600">
                Es el DNI del usuario. Se le pedirá cambiarla en su primer ingreso.
              </p>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => setGeneratedPwd(null)}>Entendido</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Eliminar Usuario (solo ROOT) */}
      <Dialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar usuario</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <Trash2 className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-800">Esta acción es irreversible</p>
                <p className="text-sm text-red-700 mt-0.5">
                  El usuario <strong>{deleteTarget?.nombre}</strong> ({deleteTarget?.email}) será eliminado
                  permanentemente junto con todas sus sesiones activas.
                </p>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleteLoading}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={onDelete} disabled={deleteLoading}>
              {deleteLoading ? 'Eliminando...' : 'Eliminar definitivamente'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Sesiones Activas */}
      <Dialog open={!!sesionUser} onOpenChange={open => !open && setSesionUser(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Sesiones — {sesionUser?.nombre}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {sesionLoading ? (
              <div className="space-y-2">
                {[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : sesiones.length === 0 ? (
              <p className="text-stone-400 text-sm text-center py-8">Sin sesiones registradas</p>
            ) : (
              <div className="space-y-2">
                {sesiones.map(s => (
                  <div key={s.session_id} className={`p-3 rounded-xl border ${s.revoked ? 'border-stone-100 bg-stone-50 opacity-60' : 'border-agro-100 bg-agro-50'}`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs font-mono text-stone-500">
                          {s.session_id.substring(0, 8)}...
                        </p>
                        <p className="text-xs text-stone-600 mt-0.5">{s.ip_address} · {s.user_agent?.substring(0, 60)}...</p>
                        <p className="text-xs text-stone-400 mt-0.5">
                          Creada: {fmtFechaHora(s.created_at)} ·
                          Expira: {fmtFechaHora(s.expires_at)}
                        </p>
                      </div>
                      <Badge variant={s.revoked ? 'secondary' : 'success'}>
                        {s.revoked ? 'Revocada' : 'Activa'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            {sesionUser && sesionUser.id !== me?.id && (
              <Button
                variant="destructive"
                onClick={() => revokeAllSessions(sesionUser)}
              >
                <Trash2 className="w-4 h-4" /> Revocar todas
              </Button>
            )}
            <Button variant="outline" onClick={() => setSesionUser(null)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
