import { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Check, X, Search, RefreshCw, GraduationCap } from 'lucide-react';
import api from '@/services/api';

interface Profesion {
  id: number;
  nombre: string;
  activo: 0 | 1;
  usos: number;
}

export default function ProfesionesPage() {
  const [data, setData]       = useState<Profesion[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');

  const [nuevo, setNuevo]     = useState('');
  const [creando, setCreando] = useState(false);
  const [error, setError]     = useState('');

  const [editId, setEditId]       = useState<number | null>(null);
  const [editNombre, setEditNombre] = useState('');
  const [confirmDel, setConfirmDel] = useState<number | null>(null);
  const [busyId, setBusyId]       = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/profesiones/admin');
      setData(res.data.data);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Error al cargar profesiones');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function crear() {
    const nombre = nuevo.trim();
    if (nombre.length < 2) { setError('Escribe un nombre válido (mín. 2 caracteres)'); return; }
    setCreando(true); setError('');
    try {
      await api.post('/profesiones', { nombre });
      setNuevo('');
      fetchData();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Error al crear');
    } finally {
      setCreando(false);
    }
  }

  async function guardarEdicion(id: number) {
    const nombre = editNombre.trim();
    if (nombre.length < 2) return;
    setBusyId(id); setError('');
    try {
      await api.put(`/profesiones/${id}`, { nombre });
      setEditId(null);
      fetchData();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Error al actualizar');
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActivo(p: Profesion) {
    setBusyId(p.id);
    try {
      await api.put(`/profesiones/${p.id}`, { activo: p.activo ? 0 : 1 });
      setData(prev => prev.map(x => x.id === p.id ? { ...x, activo: x.activo ? 0 : 1 } : x));
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Error al cambiar estado');
    } finally {
      setBusyId(null);
    }
  }

  async function eliminar(id: number) {
    setBusyId(id); setError('');
    try {
      await api.delete(`/profesiones/${id}`);
      setData(prev => prev.filter(x => x.id !== id));
      setConfirmDel(null);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Error al eliminar');
    } finally {
      setBusyId(null);
    }
  }

  const filtradas = search.trim()
    ? data.filter(p => p.nombre.toLowerCase().includes(search.toLowerCase()))
    : data;

  return (
    <div className="space-y-5 animate-fade-in max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-agro-100 flex items-center justify-center">
          <GraduationCap className="w-5 h-5 text-agro-700" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold text-stone-800">Profesiones</h1>
          <p className="text-stone-400 text-sm">Catálogo que aparece en el formulario de postulación</p>
        </div>
      </div>

      {/* Agregar */}
      <div className="card p-4">
        <label className="label text-xs">Agregar profesión / especialidad</label>
        <div className="flex gap-2 mt-1">
          <input
            className="input flex-1 py-2.5 text-sm"
            placeholder="Ej: Operador de grúa torre"
            value={nuevo}
            onChange={e => setNuevo(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') crear(); }}
          />
          <button onClick={crear} disabled={creando} className="btn-primary text-sm py-2.5 px-4">
            <Plus className="w-4 h-4" /> Agregar
          </button>
        </div>
        {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
      </div>

      {/* Buscador + refrescar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input className="input pl-9 py-2.5 text-sm w-full" placeholder="Buscar en el catálogo..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button onClick={fetchData} className="btn-secondary py-2.5 px-3">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Lista */}
      <div className="card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-stone-100 text-xs text-stone-400">
          {filtradas.length} profesión{filtradas.length === 1 ? '' : 'es'}
        </div>
        <ul className="divide-y divide-stone-50">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="px-4 py-3 animate-pulse"><div className="h-4 bg-stone-100 rounded w-48" /></li>
            ))
          ) : filtradas.length === 0 ? (
            <li className="px-4 py-12 text-center text-stone-400 text-sm">Sin profesiones</li>
          ) : filtradas.map(p => (
            <li key={p.id} className="px-4 py-2.5 flex items-center gap-3">
              {editId === p.id ? (
                <>
                  <input
                    autoFocus
                    className="input flex-1 py-1.5 text-sm"
                    value={editNombre}
                    onChange={e => setEditNombre(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') guardarEdicion(p.id); if (e.key === 'Escape') setEditId(null); }}
                  />
                  <button onClick={() => guardarEdicion(p.id)} disabled={busyId === p.id}
                    className="p-1.5 rounded-lg text-agro-600 hover:bg-agro-50"><Check className="w-4 h-4" /></button>
                  <button onClick={() => setEditId(null)}
                    className="p-1.5 rounded-lg text-stone-400 hover:bg-stone-100"><X className="w-4 h-4" /></button>
                </>
              ) : (
                <>
                  <span className={`flex-1 text-sm ${p.activo ? 'text-stone-800' : 'text-stone-400 line-through'}`}>
                    {p.nombre}
                  </span>
                  {p.usos > 0 && (
                    <span className="text-[11px] text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full">
                      {p.usos} uso{p.usos === 1 ? '' : 's'}
                    </span>
                  )}
                  <button
                    onClick={() => toggleActivo(p)}
                    disabled={busyId === p.id}
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border transition-colors ${
                      p.activo
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                        : 'bg-stone-100 text-stone-500 border-stone-200 hover:bg-stone-200'
                    }`}
                  >
                    {p.activo ? 'Activa' : 'Inactiva'}
                  </button>
                  <button onClick={() => { setEditId(p.id); setEditNombre(p.nombre); }}
                    className="p-1.5 rounded-lg text-stone-400 hover:bg-stone-100 hover:text-agro-600"><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => setConfirmDel(p.id)}
                    className="p-1.5 rounded-lg text-stone-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>

      {/* Confirmar eliminar */}
      {confirmDel !== null && (() => {
        const p = data.find(x => x.id === confirmDel);
        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={e => { if (e.target === e.currentTarget) setConfirmDel(null); }}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-slide-up">
              <h3 className="font-bold text-stone-800 mb-1">Eliminar profesión</h3>
              <p className="text-sm text-stone-500 mb-1">
                ¿Eliminar <span className="font-semibold">{p?.nombre}</span> del catálogo?
              </p>
              {!!p && p.usos > 0 && (
                <p className="text-xs text-amber-600 mb-3">
                  Ojo: {p.usos} postulante(s) ya la tienen. Su dato no se borra, pero considera mejor
                  marcarla como "Inactiva" para que deje de aparecer en el formulario.
                </p>
              )}
              <div className="flex gap-2 mt-4">
                <button onClick={() => setConfirmDel(null)} className="btn-secondary flex-1 py-2.5 text-sm">Cancelar</button>
                <button onClick={() => eliminar(confirmDel)} disabled={busyId === confirmDel}
                  className="flex-1 py-2.5 text-sm font-semibold rounded-xl bg-red-600 text-white hover:bg-red-700 disabled:opacity-60">
                  Eliminar
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
