import { useState, useEffect, useCallback } from 'react';
import { fmtFecha } from '@/utils/dates';
import {
  Plus, RefreshCw, X, Megaphone, Target,
  Calendar, CheckCircle2, PauseCircle, XCircle,
  Edit2, ChevronDown,
} from 'lucide-react';
import api from '@/services/api';
import { usePermission } from '@/hooks/usePermission';

interface Campana {
  id: number;
  nombre: string;
  descripcion: string | null;
  zona: string | null;
  fundo: string | null;
  fecha_inicio: string;
  fecha_fin: string | null;
  objetivo_qty: number;
  estado: 'activa' | 'pausada' | 'cerrada';
  creado_por_nombre: string | null;
  total_postulantes: number;
  confirmados: number;
  ingresaron: number;
  pendientes: number;
}

interface Stats {
  total: number; activas: number; pausadas: number;
  cerradas: number; objetivo_total: number;
}

const ESTADO_CFG = {
  activa:  { label: 'Activa',   cls: 'bg-teal-100   text-teal-700',   icon: CheckCircle2, dot: 'bg-teal-400'   },
  pausada: { label: 'Pausada',  cls: 'bg-amber-100  text-amber-700',  icon: PauseCircle,  dot: 'bg-amber-400'  },
  cerrada: { label: 'Cerrada', cls: 'bg-stone-100  text-stone-500',  icon: XCircle,      dot: 'bg-stone-400'  },
};

const EMPTY_FORM = {
  nombre: '', descripcion: '', zona: '', fundo: '',
  fecha_inicio: '', fecha_fin: '', objetivo_qty: '',
};

export default function CampanasPage() {
  const [campanas, setCampanas]   = useState<Campana[]>([]);
  const [stats, setStats]         = useState<Stats | null>(null);
  const [loading, setLoading]     = useState(true);
  const [filterEstado, setFilterEstado] = useState('');
  const [filterSearch, setFilterSearch] = useState('');

  // Modals
  const [modal, setModal]         = useState<'crear' | 'editar' | 'estado' | null>(null);
  const [selected, setSelected]   = useState<Campana | null>(null);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [nuevoEstado, setNuevoEstado] = useState('');
  const [saving, setSaving]       = useState(false);
  const [msg, setMsg]             = useState('');
  const [expandId, setExpandId]   = useState<number | null>(null);

  const canManage = usePermission('campanas.manage');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterEstado) params.set('estado', filterEstado);
      if (filterSearch) params.set('search', filterSearch);
      const [res, sRes] = await Promise.all([
        api.get(`/campanas?${params}`),
        api.get('/campanas/stats'),
      ]);
      setCampanas(res.data.data);
      setStats(sRes.data.data);
    } finally {
      setLoading(false);
    }
  }, [filterEstado, filterSearch]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  function openCrear() {
    setForm({ ...EMPTY_FORM, fecha_inicio: new Date().toISOString().split('T')[0] });
    setMsg(''); setModal('crear');
  }

  function openEditar(c: Campana) {
    setSelected(c);
    setForm({
      nombre:       c.nombre,
      descripcion:  c.descripcion  || '',
      zona:         c.zona         || '',
      fundo:        c.fundo        || '',
      fecha_inicio: c.fecha_inicio.split('T')[0],
      fecha_fin:    c.fecha_fin    ? c.fecha_fin.split('T')[0] : '',
      objetivo_qty: String(c.objetivo_qty),
    });
    setMsg(''); setModal('editar');
  }

  function openEstado(c: Campana) {
    setSelected(c); setNuevoEstado(c.estado); setMsg(''); setModal('estado');
  }

  async function handleSave() {
    if (!form.nombre || !form.fecha_inicio) { setMsg('Nombre y fecha de inicio requeridos'); return; }
    setSaving(true); setMsg('');
    try {
      if (modal === 'crear') {
        await api.post('/campanas', {
          ...form,
          objetivo_qty: Number(form.objetivo_qty) || 0,
          fecha_fin:    form.fecha_fin || null,
        });
        setMsg('Campaña creada');
      } else if (selected) {
        await api.put(`/campanas/${selected.id}`, {
          ...form,
          objetivo_qty: Number(form.objetivo_qty) || 0,
          fecha_fin:    form.fecha_fin || null,
        });
        setMsg('Campaña actualizada');
      }
      setTimeout(() => { setModal(null); fetchAll(); }, 800);
    } catch (e: any) {
      setMsg(e?.response?.data?.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  async function handleEstado() {
    if (!selected || nuevoEstado === selected.estado) { setModal(null); return; }
    setSaving(true); setMsg('');
    try {
      await api.patch(`/campanas/${selected.id}/estado`, { estado: nuevoEstado });
      setMsg('Estado actualizado');
      setTimeout(() => { setModal(null); fetchAll(); }, 600);
    } catch (e: any) {
      setMsg(e?.response?.data?.message || 'Error al cambiar estado');
    } finally {
      setSaving(false);
    }
  }

  const formField = (field: keyof typeof form, label: string, type = 'text', required = false) => (
    <div>
      <label className="label text-xs">{label}{required && ' *'}</label>
      {field === 'descripcion' ? (
        <textarea className="input text-sm resize-none h-20" value={form[field]}
          onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))} />
      ) : (
        <input type={type} className="input text-sm py-2.5" value={form[field]}
          onChange={e => setForm(p => ({ ...p, [field]: e.target.value }))} />
      )}
    </div>
  );

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-stone-800">Campañas</h1>
          <p className="text-stone-400 text-sm">{campanas.length} campañas encontradas</p>
        </div>
        <div className="flex gap-2">
          <button onClick={fetchAll} className="btn-secondary py-2 px-3">
            <RefreshCw className="w-4 h-4" />
          </button>
          {canManage && (
            <button onClick={openCrear} className="btn-primary text-sm py-2.5">
              <Plus className="w-4 h-4" /> Nueva campaña
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Total',    value: stats.total,          cls: 'text-stone-700 bg-stone-50'  },
            { label: 'Activas',  value: stats.activas,         cls: 'text-teal-700  bg-teal-50'   },
            { label: 'Pausadas', value: stats.pausadas,        cls: 'text-amber-700 bg-amber-50'  },
            { label: 'Cerradas', value: stats.cerradas,        cls: 'text-stone-500 bg-stone-100' },
            { label: 'Objetivo', value: stats.objetivo_total,  cls: 'text-agro-700  bg-agro-50'   },
          ].map(({ label, value, cls }) => (
            <div key={label} className={`rounded-2xl border border-stone-100 p-3 text-center bg-white`}>
              <p className={`text-xl font-bold font-mono ${cls.split(' ')[0]}`}>{value}</p>
              <p className="text-[10px] text-stone-400 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="card p-3 flex flex-col sm:flex-row gap-3">
        <input className="input text-sm py-2 flex-1" placeholder="Buscar por nombre..."
          value={filterSearch} onChange={e => setFilterSearch(e.target.value)} />
        <select className="input text-sm py-2 sm:w-44" value={filterEstado}
          onChange={e => setFilterEstado(e.target.value)}>
          <option value="">Todos los estados</option>
          <option value="activa">Activa</option>
          <option value="pausada">Pausada</option>
          <option value="cerrada">Cerrada</option>
        </select>
      </div>

      {/* Cards grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card p-5 animate-pulse space-y-3">
              <div className="h-5 bg-stone-100 rounded w-2/3" />
              <div className="h-3 bg-stone-100 rounded w-1/3" />
              <div className="grid grid-cols-3 gap-2 pt-2">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="h-12 bg-stone-100 rounded-xl" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : campanas.length === 0 ? (
        <div className="card p-12 text-center text-stone-400">
          <Megaphone className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No hay campañas registradas</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {campanas.map(c => {
            const cfg      = ESTADO_CFG[c.estado];
            const progress = c.objetivo_qty > 0
              ? Math.min(100, Math.round((c.ingresaron / c.objetivo_qty) * 100))
              : 0;
            const isExpanded = expandId === c.id;

            return (
              <div key={c.id} className="card p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${cfg.cls}`}>
                        {cfg.label}
                      </span>
                    </div>
                    <h3 className="font-semibold text-stone-800 leading-snug mt-1">{c.nombre}</h3>
                    {(c.zona || c.fundo) && (
                      <p className="text-xs text-stone-400 mt-0.5">
                        {[c.zona, c.fundo].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                  {canManage && (
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => openEditar(c)}
                        className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-600 transition-colors">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => openEstado(c)}
                        className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-600 transition-colors">
                        <cfg.icon className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Dates */}
                <div className="flex items-center gap-3 text-xs text-stone-400">
                  <Calendar className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>{fmtFecha(c.fecha_inicio)}</span>
                  {c.fecha_fin && (
                    <><span>→</span><span>{fmtFecha(c.fecha_fin)}</span></>
                  )}
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                  {[
                    { label: 'Total',      value: c.total_postulantes, cls: 'text-stone-600' },
                    { label: 'Pendientes', value: c.pendientes,         cls: 'text-amber-600' },
                    { label: 'Confirm.',   value: c.confirmados,        cls: 'text-blue-600'  },
                    { label: 'Ingresaron', value: c.ingresaron,         cls: 'text-teal-600'  },
                  ].map(({ label, value, cls }) => (
                    <div key={label} className="bg-stone-50 rounded-xl py-2">
                      <p className={`text-base font-bold font-mono ${cls}`}>{value}</p>
                      <p className="text-[10px] text-stone-400 mt-0.5">{label}</p>
                    </div>
                  ))}
                </div>

                {/* Progress hacia objetivo */}
                {c.objetivo_qty > 0 && (
                  <div>
                    <div className="flex justify-between text-xs text-stone-400 mb-1">
                      <span className="flex items-center gap-1">
                        <Target className="w-3 h-3" /> Objetivo: {c.objetivo_qty}
                      </span>
                      <span>{progress}%</span>
                    </div>
                    <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          progress >= 100 ? 'bg-teal-500' : progress >= 50 ? 'bg-agro-500' : 'bg-amber-400'
                        }`}
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Expand description */}
                {c.descripcion && (
                  <button
                    onClick={() => setExpandId(isExpanded ? null : c.id)}
                    className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-600 transition-colors"
                  >
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    {isExpanded ? 'Ocultar descripción' : 'Ver descripción'}
                  </button>
                )}
                {isExpanded && c.descripcion && (
                  <p className="text-xs text-stone-500 bg-stone-50 rounded-xl p-3 leading-relaxed">
                    {c.descripcion}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal Crear / Editar */}
      {(modal === 'crear' || modal === 'editar') && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && !saving && setModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 animate-slide-up max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-agro-100 rounded-xl flex items-center justify-center">
                  <Megaphone className="w-4 h-4 text-agro-700" />
                </div>
                <h2 className="font-bold text-stone-800">
                  {modal === 'crear' ? 'Nueva campaña' : 'Editar campaña'}
                </h2>
              </div>
              <button onClick={() => setModal(null)} className="p-1.5 hover:bg-stone-100 rounded-lg transition-colors">
                <X className="w-4 h-4 text-stone-400" />
              </button>
            </div>
            <div className="space-y-3">
              {formField('nombre',       'Nombre',          'text', true)}
              {formField('descripcion',  'Descripción')}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {formField('zona',   'Zona')}
                {formField('fundo',  'Fundo')}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {formField('fecha_inicio', 'Fecha inicio', 'date', true)}
                {formField('fecha_fin',    'Fecha fin',    'date')}
              </div>
              {formField('objetivo_qty', 'Objetivo (personas)', 'number')}
              {msg && (
                <p className={`text-sm text-center font-medium ${
                  msg.includes('Error') || msg.includes('requerido') ? 'text-red-500' : 'text-teal-600'
                }`}>{msg}</p>
              )}
              <div className="flex gap-2 pt-1">
                <button onClick={() => setModal(null)} disabled={saving} className="btn-secondary flex-1 py-2.5 text-sm">Cancelar</button>
                <button onClick={handleSave} disabled={saving} className="btn-primary flex-1 py-2.5 text-sm">
                  {saving
                    ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" />
                    : modal === 'crear' ? 'Crear' : 'Guardar'
                  }
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal cambiar estado */}
      {modal === 'estado' && selected && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && !saving && setModal(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-slide-up">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 bg-agro-100 rounded-xl flex items-center justify-center">
                <Megaphone className="w-4 h-4 text-agro-700" />
              </div>
              <div>
                <h2 className="font-bold text-stone-800">Cambiar estado</h2>
                <p className="text-xs text-stone-400 truncate">{selected.nombre}</p>
              </div>
            </div>
            <div className="space-y-2 mb-4">
              {(['activa', 'pausada', 'cerrada'] as const).map(e => {
                const cfg = ESTADO_CFG[e];
                const Icon = cfg.icon;
                return (
                  <button
                    key={e}
                    onClick={() => setNuevoEstado(e)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 transition-all
                      ${nuevoEstado === e ? 'border-agro-400 bg-agro-50' : 'border-stone-100 hover:border-stone-200'}`}
                  >
                    <Icon className={`w-4 h-4 ${cfg.cls.split(' ')[1]}`} />
                    <span className={`font-medium text-sm ${nuevoEstado === e ? 'text-agro-700' : 'text-stone-600'}`}>
                      {cfg.label}
                    </span>
                  </button>
                );
              })}
            </div>
            {msg && <p className="text-sm text-center text-teal-600 mb-3">{msg}</p>}
            <div className="flex gap-2">
              <button onClick={() => setModal(null)} disabled={saving} className="btn-secondary flex-1 py-2.5 text-sm">Cancelar</button>
              <button onClick={handleEstado} disabled={saving} className="btn-primary flex-1 py-2.5 text-sm">
                {saving
                  ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" />
                  : 'Confirmar'
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
