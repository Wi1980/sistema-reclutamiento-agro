import { useState, useEffect } from 'react';
import { Shield, Save, ShieldCheck, RefreshCw, Landmark, Plus, Trash2, X } from 'lucide-react';
import api from '@/services/api';
import { rolLabel } from '@/lib/roles';

const PERMISSION_GROUPS = [
  {
    group: 'Dashboard',
    items: [
      { key: 'dashboard.view', label: 'Ver dashboard' },
    ],
  },
  {
    group: 'Postulantes',
    items: [
      { key: 'postulantes.view',         label: 'Ver lista de postulantes' },
      { key: 'postulantes.view_all',      label: 'Ver todos sin filtro de asignación' },
      { key: 'postulantes.view_assigned', label: 'Solo asignados — modo Contrata' },
      { key: 'postulantes.edit',          label: 'Editar datos del postulante' },
      { key: 'postulantes.edit_status',   label: 'Cambiar estado' },
      { key: 'postulantes.export',        label: 'Exportar listado a Excel' },
      { key: 'postulantes.assign',        label: 'Asignar postulante a reclutador' },
      { key: 'postulantes.delete',        label: 'Eliminar postulante' },
      { key: 'postulantes.log_llamada',   label: 'Registrar llamadas' },
    ],
  },
  {
    group: 'Campañas',
    items: [
      { key: 'campanas.view',   label: 'Ver campañas' },
      { key: 'campanas.manage', label: 'Crear y gestionar campañas' },
    ],
  },
  {
    group: 'Profesiones',
    items: [
      { key: 'profesiones.manage', label: 'Administrar catálogo de profesiones' },
    ],
  },
  {
    group: 'Usuarios y Roles',
    items: [
      { key: 'usuarios.view',   label: 'Ver usuarios y roles' },
      { key: 'usuarios.manage', label: 'Crear, editar y eliminar usuarios y roles' },
    ],
  },
  {
    group: 'Auditoría',
    items: [
      { key: 'audit.view', label: 'Ver registros de auditoría' },
    ],
  },
  {
    group: 'Personal no Apto',
    items: [
      { key: 'blacklist.view',   label: 'Ver Personal no Apto' },
      { key: 'blacklist.manage', label: 'Agregar, importar y eliminar de Personal no Apto' },
    ],
  },
  {
    group: 'Llamado QR',
    items: [
      { key: 'llamado.view',               label: 'Ver llamado QR y lista de asistentes en tiempo real' },
      { key: 'llamado.exportar',           label: 'Exportar asistentes a Excel' },
      { key: 'llamado.pasar_trabajadores', label: 'Pasar confirmados a trabajadores' },
    ],
  },
  {
    group: 'Trabajadores',
    items: [
      { key: 'trabajadores.view',    label: 'Ver lista de trabajadores' },
      { key: 'trabajadores.manage',  label: 'Registrar trabajadores manualmente' },
      { key: 'trabajadores.delete',  label: 'Eliminar trabajadores' },
      { key: 'bajas.manage',         label: 'Registrar bajas' },
      { key: 'reingresos.manage',    label: 'Registrar reingresos' },
      { key: 'reingresos.view',      label: 'Ver/buscar bajas para reingreso' },
    ],
  },
];

const TOTAL_PERMS = PERMISSION_GROUPS.reduce((acc, g) => acc + g.items.length, 0);

interface Rol {
  id: number;
  nombre: string;
  permisos: Record<string, boolean>;
  /** Es un puesto del catálogo de la empresa: el nombre lo manda el Principal. */
  del_catalogo?: boolean;
}

/** Lo que el servidor dice sobre quién manda en los nombres de los puestos. */
interface Puestos {
  gobernados: boolean;
  catalogo: Record<string, string>;
}

function parsePermisos(raw: unknown): Record<string, boolean> {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return raw as Record<string, boolean>;
}

export default function RolesPage() {
  const [roles, setRoles]         = useState<Rol[]>([]);
  const [puestos, setPuestos]     = useState<Puestos>({ gobernados: false, catalogo: {} });
  const [activeTab, setActiveTab] = useState(0);
  const [edits, setEdits]         = useState<Record<number, Record<string, boolean>>>({});
  const [saving, setSaving]       = useState<number | null>(null);
  const [flash, setFlash]         = useState<number | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');

  // Modal crear
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName]       = useState('');
  const [creating, setCreating]     = useState(false);
  const [createError, setCreateError] = useState('');

  // Modal eliminar
  const [confirmDelete, setConfirmDelete] = useState<Rol | null>(null);
  const [deleting, setDeleting]           = useState(false);

  useEffect(() => { loadRoles(); }, []);

  async function loadRoles() {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/roles');
      const raw: any[] = res.data.data || [];
      setRoles(raw.map(r => ({ ...r, permisos: parsePermisos(r.permisos) })));
      if (res.data.puestos) setPuestos(res.data.puestos);
    } catch {
      setError('No se pudieron cargar los roles.');
    } finally {
      setLoading(false);
    }
  }

  const editableRoles = roles.filter(r => r.nombre !== 'ROOT');

  /**
   * Puestos del catálogo que todavía no existen aquí.
   *
   * Con el central conectado, «crear un rol» es traer un puesto del catálogo de
   * la empresa, no inventar un nombre. Si ya están los trece, no queda nada que
   * traer y el botón lo dice en vez de abrir un formulario que va a fallar.
   */
  const puestosDisponibles = puestos.gobernados
    ? Object.entries(puestos.catalogo).filter(([codigo]) => !roles.some(r => r.nombre === codigo))
    : [];
  const sinPuestosLibres = puestos.gobernados && puestosDisponibles.length === 0;

  function getPermisos(role: Rol): Record<string, boolean> {
    return edits[role.id] ?? role.permisos;
  }

  function toggle(roleId: number, key: string) {
    const base = edits[roleId] ?? roles.find(r => r.id === roleId)!.permisos;
    setEdits(prev => ({ ...prev, [roleId]: { ...base, [key]: !base[key] } }));
  }

  async function savePermisos(role: Rol) {
    const newPerms = edits[role.id];
    if (!newPerms) return;
    setSaving(role.id);
    try {
      await api.put(`/roles/${role.id}`, { permisos: newPerms });
      setRoles(prev => prev.map(r => r.id === role.id ? { ...r, permisos: newPerms } : r));
      setEdits(prev => { const n = { ...prev }; delete n[role.id]; return n; });
      setFlash(role.id);
      setTimeout(() => setFlash(null), 2000);
    } finally {
      setSaving(null);
    }
  }

  async function handleCreate() {
    if (!newName.trim() || newName.trim().length < 2) {
      setCreateError('Mínimo 2 caracteres');
      return;
    }
    setCreating(true);
    setCreateError('');
    try {
      const res = await api.post('/roles', { nombre: newName });
      const created: Rol = { id: res.data.id, nombre: res.data.nombre, permisos: {} };
      setRoles(prev => [...prev, created]);
      setActiveTab(roles.filter(r => r.nombre !== 'ROOT').length); // nueva pestaña al final
      setShowCreate(false);
      setNewName('');
    } catch (e: any) {
      setCreateError(e?.response?.data?.message || 'Error al crear el rol');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/roles/${confirmDelete.id}`);
      const newRoles = roles.filter(r => r.id !== confirmDelete.id);
      setRoles(newRoles);
      setActiveTab(0);
      setConfirmDelete(null);
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Error al eliminar el rol');
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-agro-200 border-t-agro-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-stone-400">{error}</p>
        <button onClick={loadRoles} className="btn-secondary text-sm py-2 px-4">
          <RefreshCw className="w-4 h-4" /> Reintentar
        </button>
      </div>
    );
  }

  const activeRole = editableRoles[activeTab];

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-stone-800">Roles y Accesos</h1>
          <p className="text-stone-400 text-sm mt-0.5">
            Configura los permisos por rol. Los cambios aplican al próximo inicio de sesión.
          </p>
        </div>
        <button
          onClick={() => {
            setShowCreate(true);
            // Con el catálogo mandando, el primero viene elegido: el caso
            // normal es un clic en «Agregar» y no hay forma de mandar vacío.
            setNewName(puestos.gobernados ? (puestosDisponibles[0]?.[0] ?? '') : '');
            setCreateError('');
          }}
          disabled={sinPuestosLibres}
          title={sinPuestosLibres ? 'Los trece puestos del catálogo ya existen aquí' : undefined}
          className="btn-primary text-sm py-2.5 whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus className="w-4 h-4" /> {puestos.gobernados ? 'Agregar puesto' : 'Nuevo Rol'}
        </button>
      </div>

      {/*
        El reparto, dicho donde importa. Quien abre esta pantalla a cambiar el
        nombre de un rol tiene que enterarse aquí y no con un error al guardar.
      */}
      {puestos.gobernados && (
        <div className="card p-4 flex items-start gap-3 bg-agro-50 border-agro-100">
          <Landmark className="w-5 h-5 text-agro-700 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-agro-800">
              Los nombres vienen del catálogo de la empresa
            </p>
            <p className="text-xs text-agro-700 mt-0.5 leading-snug">
              Un puesto se llama igual en los cinco sistemas, así que su nombre se administra en el
              sistema Principal. <strong>Los permisos de cada puesto dentro de Reclutamiento sí se
              editan aquí.</strong>
            </p>
          </div>
        </div>
      )}

      {/* ROOT banner */}
      <div className="card p-4 flex items-start gap-3 bg-purple-50 border-purple-100">
        <ShieldCheck className="w-5 h-5 text-purple-500 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-purple-800 text-sm font-semibold">Rol ROOT — Acceso total</p>
          <p className="text-purple-600 text-xs mt-0.5">
            El rol ROOT tiene acceso ilimitado a todo el sistema y no puede modificarse ni eliminarse.
          </p>
        </div>
      </div>

      <div className="card overflow-hidden">

        {/* Tabs */}
        <div className="flex border-b border-stone-100 overflow-x-auto">
          {editableRoles.map((role, i) => {
            const isDirty     = !!edits[role.id];
            const activeCount = Object.values(getPermisos(role)).filter(Boolean).length;
            return (
              <button
                key={role.id}
                onClick={() => setActiveTab(i)}
                className={`flex items-center gap-2 px-5 py-3.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2
                  ${activeTab === i
                    ? 'text-agro-700 border-agro-600 bg-agro-50/60'
                    : 'text-stone-500 border-transparent hover:text-stone-700 hover:bg-stone-50'
                  }`}
              >
                <Shield className="w-3.5 h-3.5" />
                {rolLabel(role.nombre)}
                <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-semibold
                  ${activeTab === i ? 'bg-agro-100 text-agro-700' : 'bg-stone-100 text-stone-500'}`}>
                  {activeCount}
                </span>
                {isDirty && (
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-400 flex-shrink-0" title="Cambios sin guardar" />
                )}
              </button>
            );
          })}

          {editableRoles.length === 0 && (
            <p className="px-5 py-3.5 text-sm text-stone-400 italic">
              No hay roles configurables. Crea uno con "Nuevo Rol".
            </p>
          )}
        </div>

        {/* Tab content */}
        {activeRole ? (
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-semibold text-stone-800 text-lg flex items-center gap-2">
                  {rolLabel(activeRole.nombre)}
                  {activeRole.del_catalogo && (
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-agro-50 text-agro-700 border border-agro-200"
                      title="El nombre de este puesto se administra en el sistema Principal"
                    >
                      <Landmark className="w-3 h-3" /> Del catálogo
                    </span>
                  )}
                </h2>
                <p className="text-stone-400 text-xs mt-0.5">
                  {Object.values(getPermisos(activeRole)).filter(Boolean).length} de {TOTAL_PERMS} permisos activos
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!activeRole.del_catalogo && (
                <button
                  onClick={() => setConfirmDelete(activeRole)}
                  className="p-2 rounded-xl text-stone-400 hover:text-red-500 hover:bg-red-50 transition-colors"
                  title="Eliminar rol"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                )}
                <button
                  onClick={() => savePermisos(activeRole)}
                  disabled={!edits[activeRole.id] || saving === activeRole.id}
                  className={`btn-primary text-sm py-2 px-4 min-w-[140px] disabled:opacity-40
                    ${flash === activeRole.id ? '!bg-emerald-600 hover:!bg-emerald-700' : ''}`}
                >
                  {saving === activeRole.id ? (
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  ) : flash === activeRole.id ? (
                    <><ShieldCheck className="w-4 h-4" /> Guardado</>
                  ) : (
                    <><Save className="w-4 h-4" /> Guardar</>
                  )}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-6">
              {PERMISSION_GROUPS.map(({ group, items }) => {
                const perms = getPermisos(activeRole);
                return (
                  <div key={group}>
                    <h3 className="text-[11px] font-semibold text-stone-400 uppercase tracking-wider mb-2 pb-1.5 border-b border-stone-100">
                      {group}
                    </h3>
                    <div className="space-y-1">
                      {items.map(({ key, label }) => {
                        const on = !!perms[key];
                        return (
                          <div
                            key={key}
                            onClick={() => toggle(activeRole.id, key)}
                            className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-stone-50 cursor-pointer transition-colors select-none"
                          >
                            <div className={`relative w-11 h-6 rounded-full flex-shrink-0 transition-colors duration-200
                              ${on ? 'bg-agro-600' : 'bg-stone-200'}`}
                            >
                              <span className={`absolute top-[3px] left-[3px] w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-transform duration-200
                                ${on ? 'translate-x-5' : 'translate-x-0'}`}
                              />
                            </div>
                            <span className={`text-sm transition-colors ${on ? 'text-stone-800' : 'text-stone-400'}`}>
                              {label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="p-12 text-center text-stone-400 text-sm">
            Crea un rol con el botón "Nuevo Rol" para configurar sus permisos.
          </div>
        )}
      </div>

      {/* ── Modal Crear Rol ── */}
      {showCreate && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setShowCreate(false)}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-slide-up">
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-display font-bold text-stone-800 text-lg">
                {puestos.gobernados ? 'Agregar puesto del catálogo' : 'Nuevo Rol'}
              </h2>
              <button onClick={() => setShowCreate(false)} className="p-2 hover:bg-stone-100 rounded-xl transition-colors">
                <X className="w-4 h-4 text-stone-400" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="label">{puestos.gobernados ? 'Puesto' : 'Nombre del rol'}</label>
                {puestos.gobernados ? (
                  <>
                    <select
                      className="input"
                      value={newName}
                      onChange={e => { setNewName(e.target.value); setCreateError(''); }}
                      autoFocus
                    >
                      {puestosDisponibles.map(([codigo, etiqueta]) => (
                        <option key={codigo} value={codigo}>{etiqueta}</option>
                      ))}
                    </select>
                    <p className="text-stone-400 text-xs mt-1">
                      Del catálogo de Agroexportadora. Empieza sin ningún permiso: se los das tú desde
                      las pestañas.
                    </p>
                  </>
                ) : (
                  <>
                    <input
                      className="input"
                      placeholder="Ej: SUPERVISOR"
                      value={newName}
                      onChange={e => { setNewName(e.target.value.toUpperCase()); setCreateError(''); }}
                      onKeyDown={e => e.key === 'Enter' && handleCreate()}
                      autoFocus
                      maxLength={50}
                    />
                    <p className="text-stone-400 text-xs mt-1">
                      Se guardará en mayúsculas. Luego configura sus permisos desde las pestañas.
                    </p>
                  </>
                )}
                {createError && <p className="text-red-500 text-xs mt-1">{createError}</p>}
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowCreate(false)} className="btn-secondary flex-1 py-2.5 text-sm">
                  Cancelar
                </button>
                <button onClick={handleCreate} disabled={creating} className="btn-primary flex-1 py-2.5 text-sm">
                  {creating
                    ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    : <><Plus className="w-4 h-4" /> Crear</>
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Confirmar Eliminar ── */}
      {confirmDelete && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setConfirmDelete(null)}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-slide-up">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h2 className="font-bold text-stone-800">Eliminar rol</h2>
                <p className="text-stone-400 text-sm">{rolLabel(confirmDelete.nombre)}</p>
              </div>
            </div>

            <p className="text-stone-600 text-sm mb-5">
              ¿Estás seguro? Esta acción no se puede deshacer. Si hay usuarios con este rol, no se podrá eliminar.
            </p>

            <div className="flex gap-2">
              <button onClick={() => setConfirmDelete(null)} className="btn-secondary flex-1 py-2.5 text-sm">
                Cancelar
              </button>
              <button onClick={handleDelete} disabled={deleting} className="btn-danger flex-1 py-2.5">
                {deleting
                  ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : 'Eliminar'
                }
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
