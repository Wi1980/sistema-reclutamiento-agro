import { useState, useEffect, useCallback, useRef } from 'react';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { fmtFecha, fmtFechaHora } from '@/utils/dates';
import {
  Search, Download, Eye, X,
  ChevronLeft, ChevronRight, RefreshCw,
  UserPlus, CheckSquare, Square,
  ChevronUp, ChevronDown, ChevronsUpDown,
  AlertTriangle, Trash2, Briefcase, RotateCcw, FileText,
} from 'lucide-react';
import api from '@/services/api';
import { usePermission } from '@/hooks/usePermission';

interface Postulante {
  id: number; nombres: string; apellidos: string; dni: string;
  celular: string;
  departamento: string; provincia: string;
  distrito: string; centro_poblado: string | null;
  como_entero: string; estado: string; created_at: string;
  contrata_nombre: string | null; campana_nombre: string | null;
  posible_duplicado: 0 | 1;
  fue_trabajador: 0 | 1;
  repostulo_at: string | null;
  // Perfiles Campo / Administrativo (v10)
  area_interes: 'Campo' | 'Administrativo/Operativo';
  sexo: 'M' | 'F' | 'Otro' | null;
  edad: number | null;
  discapacidad: 0 | 1;
  grado_instruccion: string | null;
  especialidad: string | null;
  tiene_cv: 0 | 1;
}

interface PostulanteDetalle extends Postulante {
  notas_internas: string;
  fecha_nacimiento: string | null;
  especialidad: string | null;
  tiene_cv: 0 | 1;
}

interface Pagination { total: number; page: number; limit: number; pages: number; }

interface Contrata { id: number; nombre: string; email: string; rol: string; total_asignados: number; }

// "ALEXANDRA MARGARITA BARRANTES ANGULO" → "ALEXANDRA BARRANTES"
function nombreCorto(full: string | null): string {
  if (!full) return '—';
  const parts = full.trim().split(/\s+/);
  if (parts.length <= 2) return full;
  const mid = Math.floor(parts.length / 2);
  return `${parts[0]} ${parts[mid]}`;
}

const ESTADO_BADGE: Record<string, string> = {
  Pendiente:        'bg-sky-100 text-sky-700',
  Asignado:         'bg-violet-100 text-violet-700',
  'No responde':    'bg-orange-100 text-orange-700',
  Confirmado:       'bg-emerald-100 text-emerald-700',
  'No interesado':  'bg-red-100 text-red-700',
  Programado:       'bg-blue-100 text-blue-700',
  'Ingresó':        'bg-teal-100 text-teal-700',
  Descartado:         'bg-stone-200 text-stone-600',
  'No se presentó':   'bg-orange-100 text-orange-700',
};

const ESTADOS = ['Pendiente','Asignado','No responde','Confirmado','No interesado','Programado','Ingresó','Descartado','No se presentó'];

// Perfiles Campo / Administrativo (v10)
const AREA_ADMIN = 'Administrativo/Operativo';

const RANGOS_EDAD = [
  { label: 'Todas las edades', min: '', max: '' },
  { label: '18 – 25 años',     min: '18', max: '25' },
  { label: '26 – 35 años',     min: '26', max: '35' },
  { label: '36 – 45 años',     min: '36', max: '45' },
  { label: '46 – 55 años',     min: '46', max: '55' },
  { label: '56 años a más',    min: '56', max: ''   },
];

const GENERO_LABEL: Record<string, string> = { M: 'Masculino', F: 'Femenino', Otro: 'Otro' };

// Resumen género · edad para la sub-línea bajo el nombre
function generoEdad(sexo: string | null, edad: number | null): string {
  const g = sexo === 'F' ? 'F' : sexo === 'M' ? 'M' : null;
  const e = edad != null ? `${edad} años` : null;
  return [g, e].filter(Boolean).join(' · ');
}

// Resultados de llamada — mismo set que usa la Contrata (A1, v10)
const RESULTADOS_LLAMADA = [
  { value: 'confirmado',    label: '✅ Confirmó' },
  { value: 'no_responde',   label: '📵 No responde' },
  { value: 'no_interesado', label: '❌ No interesado' },
  { value: 'programado',    label: '📅 Programado' },
  { value: 'callback',      label: '🔁 Volveré a llamar' },
];

export default function PostulantesPage() {
  const [data, setData]               = useState<Postulante[]>([]);
  const [pagination, setPagination]   = useState<Pagination>({ total: 0, page: 1, limit: 20, pages: 1 });
  const [loading, setLoading]         = useState(true);
  const [selected, setSelected]       = useState<PostulanteDetalle | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [filters, setFilters]  = useState({ search: '', estado: '', distrito: '', desde: '', hasta: '', fue_trabajador: '', quiere_volver: '', area: '', edad_min: '', edad_max: '', discapacidad: '', profesion: '', sexo: '' });
  const [applied, setApplied]  = useState(filters);
  const isMount                = useRef(true);
  const [page, setPage]               = useState(1);
  const [sortBy,  setSortBy]  = useState('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [updatingEstado, setUpdatingEstado] = useState(false);
  const [nuevoEstado, setNuevoEstado] = useState('');
  const [notas, setNotas]             = useState('');

  // Asignación masiva
  const [checkedIds, setCheckedIds]     = useState<Set<number>>(new Set());
  const [showAsignar, setShowAsignar]   = useState(false);
  const [contratas, setContratas]       = useState<Contrata[]>([]);
  const [loadingContratas, setLoadingContratas] = useState(false);
  const [contratasError, setContratasError]     = useState('');
  const [contrataBusqueda, setContrataBusqueda] = useState('');
  const [reclutadorId, setReclutadorId] = useState<number | ''>('');
  const [asignando, setAsignando]       = useState(false);
  const [asignarMsg, setAsignarMsg]     = useState('');

  // Estados donde la contrata ya tiene trabajo activo — no se pueden reasignar
  const ESTADOS_NO_ASIGNABLES = new Set(['Confirmado', 'Programado', 'Ingresó', 'Denegado']);

  const canAssign  = usePermission('postulantes.assign');
  const canDelete  = usePermission('postulantes.delete');
  const canLogLlamada = usePermission('postulantes.log_llamada');

  // Catálogo de profesiones para el filtro (solo pestaña Administrativos)
  const [profesionesCat, setProfesionesCat] = useState<{ id: number; nombre: string }[]>([]);
  useEffect(() => {
    api.get('/profesiones').then(r => setProfesionesCat(r.data.data)).catch(() => {});
  }, []);

  // Visor de CV incrustado (Ola 2)
  const [cvUrl, setCvUrl]         = useState<string | null>(null);
  const [cvLoading, setCvLoading] = useState(false);

  // Registro de llamada para administrativos (A1, v10)
  const [llamadaResultado, setLlamadaResultado] = useState('');
  const [llamadaObs,       setLlamadaObs]       = useState('');
  const [llamadaFecha,     setLlamadaFecha]     = useState('');
  const [guardandoLlamada, setGuardandoLlamada] = useState(false);
  const [llamadaError,     setLlamadaError]     = useState('');
  const [llamadaMsg,       setLlamadaMsg]       = useState('');

  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [deletingId,      setDeletingId]      = useState<number | null>(null);
  const [deleteError,     setDeleteError]     = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20', sortBy, sortDir });
      if (applied.search)          params.set('search',          applied.search);
      if (applied.estado)          params.set('estado',          applied.estado);
      if (applied.distrito)        params.set('distrito',        applied.distrito);
      if (applied.desde)           params.set('desde',           applied.desde);
      if (applied.hasta)           params.set('hasta',           applied.hasta);
      if (applied.fue_trabajador)  params.set('fue_trabajador',  applied.fue_trabajador);
      if (applied.quiere_volver)   params.set('quiere_volver',   applied.quiere_volver);
      if (applied.area)            params.set('area',            applied.area);
      if (applied.edad_min)        params.set('edad_min',        applied.edad_min);
      if (applied.edad_max)        params.set('edad_max',        applied.edad_max);
      if (applied.discapacidad)    params.set('discapacidad',    applied.discapacidad);
      if (applied.profesion)       params.set('profesion',       applied.profesion);
      if (applied.sexo)            params.set('sexo',            applied.sexo);
      const res = await api.get(`/postulantes?${params}`);
      setData(res.data.data);
      setPagination(res.data.pagination);
      setCheckedIds(new Set());
    } finally {
      setLoading(false);
    }
  }, [page, applied, sortBy, sortDir]);

  function handleSort(col: string) {
    if (sortBy === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir('asc');
    }
    setPage(1);
  }

  function SortIcon({ col }: { col: string }) {
    if (sortBy !== col) return <ChevronsUpDown className="w-3 h-3 ml-1 text-stone-300 inline" />;
    return sortDir === 'asc'
      ? <ChevronUp   className="w-3 h-3 ml-1 text-agro-600 inline" />
      : <ChevronDown className="w-3 h-3 ml-1 text-agro-600 inline" />;
  }

  useEffect(() => { fetchData(); }, [fetchData]);
  useAutoRefresh(fetchData, 30_000);

  // Filtros reactivos: texto con debounce 350ms, selects/fechas inmediatos
  useEffect(() => {
    if (isMount.current) { isMount.current = false; return; }
    const t = setTimeout(() => {
      setApplied(prev => ({ ...prev, search: filters.search, distrito: filters.distrito }));
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [filters.search, filters.distrito]);

  useEffect(() => {
    if (isMount.current) return;
    setApplied(prev => ({ ...prev, estado: filters.estado, desde: filters.desde, hasta: filters.hasta, fue_trabajador: filters.fue_trabajador, quiere_volver: filters.quiere_volver, area: filters.area, edad_min: filters.edad_min, edad_max: filters.edad_max, discapacidad: filters.discapacidad, profesion: filters.profesion, sexo: filters.sexo }));
    setPage(1);
  }, [filters.estado, filters.desde, filters.hasta, filters.fue_trabajador, filters.quiere_volver, filters.area, filters.edad_min, filters.edad_max, filters.discapacidad, filters.profesion, filters.sexo]);

  // Carga contratas (incluye CONTRATA y RECLUTADORA activos)
  async function loadContratas() {
    setLoadingContratas(true);
    setContratasError('');
    try {
      const res = await api.get('/productividad/contratas');
      setContratas(res.data.data.map((c: any) => ({
        id: c.id, nombre: c.nombre, email: c.email, rol: c.rol, total_asignados: c.total_asignados,
      })));
    } catch (e: any) {
      setContratasError(e?.response?.data?.message || 'No se pudo cargar la lista. Recarga la página.');
    } finally {
      setLoadingContratas(false);
    }
  }

  async function loadCv(id: number) {
    setCvLoading(true);
    try {
      const res = await api.get(`/postulantes/${id}/cv`, { responseType: 'blob' });
      setCvUrl(URL.createObjectURL(res.data));
    } catch {
      setCvUrl(null);
    } finally {
      setCvLoading(false);
    }
  }

  // Abre el CV (PDF) en una pestaña nueva desde la columna Acción.
  async function abrirCv(id: number) {
    try {
      const res = await api.get(`/postulantes/${id}/cv`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      /* sin CV o error — el icono solo aparece si tiene_cv */
    }
  }

  async function openDetail(id: number) {
    setDetailLoading(true);
    setLlamadaResultado(''); setLlamadaObs(''); setLlamadaFecha('');
    setLlamadaError(''); setLlamadaMsg('');
    setCvUrl(null);
    try {
      const res = await api.get(`/postulantes/${id}`);
      const det = res.data.data;
      setSelected(det);
      setNuevoEstado(det.estado);
      setNotas(det.notas_internas || '');
      if (det.tiene_cv) loadCv(id);
    } finally {
      setDetailLoading(false);
    }
  }

  // Libera el object URL del CV anterior al cambiar o desmontar
  useEffect(() => {
    return () => { if (cvUrl) URL.revokeObjectURL(cvUrl); };
  }, [cvUrl]);

  // A1 (v10): la Reclutadora Principal registra llamadas de administrativos
  // con el mismo mecanismo que las contratas, sin necesidad de asignación.
  async function registrarLlamadaAdmin() {
    if (!selected || !llamadaResultado) return;
    if (llamadaResultado === 'programado' && !llamadaFecha) {
      setLlamadaError('Ingresa la fecha y hora de la cita.');
      return;
    }
    setGuardandoLlamada(true);
    setLlamadaError('');
    try {
      const body: Record<string, any> = {
        resultado: llamadaResultado,
        observacion: llamadaObs.trim() || undefined,
      };
      if (llamadaResultado === 'programado') body.fecha_programada = llamadaFecha;
      await api.post(`/postulantes/${selected.id}/llamada`, body);
      setLlamadaMsg('Llamada registrada correctamente.');
      const id = selected.id;
      await openDetail(id);   // refresca estado y notas del detalle
      fetchData();
      setTimeout(() => setLlamadaMsg(''), 2500);
    } catch (e: any) {
      setLlamadaError(e?.response?.data?.message || 'Error al registrar la llamada.');
    } finally {
      setGuardandoLlamada(false);
    }
  }

  async function updateEstado() {
    if (!selected) return;
    setUpdatingEstado(true);
    try {
      await api.patch(`/postulantes/${selected.id}/estado`, { estado: nuevoEstado, notas_internas: notas });
      setSelected(null);
      fetchData();
    } finally {
      setUpdatingEstado(false);
    }
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    setDeleteError('');
    try {
      await api.delete(`/postulantes/${id}`);
      setData(prev => prev.filter(p => p.id !== id));
      setPagination(prev => ({ ...prev, total: prev.total - 1 }));
      setConfirmDeleteId(null);
    } catch (err: any) {
      setDeleteError(err?.response?.data?.message || 'Error al eliminar. Intenta de nuevo.');
    } finally {
      setDeletingId(null);
    }
  }

  async function handleExport() {
    const res = await api.get('/postulantes/export', { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a   = document.createElement('a');
    a.href = url;
    a.download = `postulantes_${new Date().toISOString().split('T')[0]}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleAsignarMasivo() {
    if (!reclutadorId || checkedIds.size === 0) return;
    setAsignando(true);
    setAsignarMsg('');
    try {
      const res = await api.post('/postulantes/asignar-masivo', {
        postulante_ids: Array.from(checkedIds),
        reclutador_id:  reclutadorId,
      });
      setAsignarMsg(res.data.message);
      // Si hubo omitidos mostramos el mensaje más tiempo para que el admin lo lea
      const delay = (res.data.omitidos ?? 0) > 0 ? 3000 : 1200;
      setTimeout(() => {
        setShowAsignar(false);
        setCheckedIds(new Set());
        setAsignarMsg('');
        setReclutadorId('');
        fetchData();
      }, delay);
    } catch (e: any) {
      setAsignarMsg(e?.response?.data?.message || 'Error al asignar');
    } finally {
      setAsignando(false);
    }
  }

  // Un administrativo nunca es asignable a una contrata (carril separado v10).
  const noAsignable = (p: Postulante) =>
    ESTADOS_NO_ASIGNABLES.has(p.estado) || p.area_interes === AREA_ADMIN;

  function toggleCheck(id: number) {
    const p = data.find(x => x.id === id);
    if (!p || noAsignable(p)) return;
    setCheckedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleAll() {
    const asignables = data.filter(p => !noAsignable(p));
    if (checkedIds.size === asignables.length && asignables.length > 0) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(asignables.map(p => p.id)));
    }
  }

  function clearFilters() {
    const empty = { search: '', estado: '', distrito: '', desde: '', hasta: '', fue_trabajador: '', quiere_volver: '', area: '', edad_min: '', edad_max: '', discapacidad: '', profesion: '', sexo: '' };
    setFilters(empty); setApplied(empty); setPage(1);
  }

  const hasFilters       = Object.values(filters).some(Boolean);
  const asignablesCount  = data.filter(p => !noAsignable(p)).length;
  const allChecked       = asignablesCount > 0 && checkedIds.size === asignablesCount;
  const someChecked      = checkedIds.size > 0;
  // En la pestaña Administrativos no aplica el concepto de "Contrata" (los
  // gestiona la Reclutadora Principal, no se asignan) → ocultamos la columna.
  const showContrata     = applied.area !== AREA_ADMIN;
  // En Administrativos cambiamos "Contrata" por "Profesión" (misma cantidad de columnas).
  const colCount         = (canAssign ? 1 : 0) + 9;

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-stone-800">Postulantes</h1>
          <p className="text-stone-400 text-sm">{pagination.total.toLocaleString()} registros totales</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={fetchData} className="btn-secondary py-2 px-3">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button onClick={handleExport} className="btn-primary text-sm py-2.5">
            <Download className="w-4 h-4" /> Exportar Excel
          </button>
        </div>
      </div>

      {/* Toolbar asignación masiva */}
      {canAssign && someChecked && (
        <div className="flex items-center gap-3 bg-agro-50 border border-agro-200 rounded-2xl px-4 py-3 animate-slide-up">
          <CheckSquare className="w-5 h-5 text-agro-700 flex-shrink-0" />
          <span className="text-sm font-semibold text-agro-800 flex-1">
            {checkedIds.size} postulante{checkedIds.size > 1 ? 's' : ''} seleccionado{checkedIds.size > 1 ? 's' : ''}
          </span>
          <button
            onClick={() => { loadContratas(); setShowAsignar(true); setAsignarMsg(''); setContrataBusqueda(''); setReclutadorId(''); }}
            className="flex items-center gap-1.5 px-4 py-2 bg-agro-700 text-white text-sm font-semibold rounded-xl hover:bg-agro-800 active:scale-95 transition-all"
          >
            <UserPlus className="w-4 h-4" />
            Asignar a contrata
          </button>
          <button onClick={() => setCheckedIds(new Set())} className="p-1.5 text-agro-500 hover:text-agro-700 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Segmentación por área de interés (v10) — Campo vs Administrativos */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {[
          { val: '',         label: 'Todos' },
          { val: 'Campo',    label: 'Campo' },
          { val: AREA_ADMIN, label: 'Administrativos' },
        ].map(t => (
          <button
            key={t.val || 'all'}
            onClick={() => setFilters(p => ({ ...p, area: t.val, profesion: '' }))}
            className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${
              filters.area === t.val
                ? 'bg-agro-600 text-white border-agro-600'
                : 'bg-white text-stone-600 border-stone-200 hover:border-agro-300 hover:text-agro-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input className="input pl-9 py-2.5 text-sm" placeholder="Buscar nombre, DNI..."
              value={filters.search} onChange={e => setFilters(p => ({ ...p, search: e.target.value }))} />
          </div>
          <select className="input py-2.5 text-sm" value={filters.estado}
            onChange={e => setFilters(p => ({ ...p, estado: e.target.value }))}>
            <option value="">Pipeline activo</option>
            {ESTADOS.map(e => <option key={e}>{e}</option>)}
          </select>
          <input className="input py-2.5 text-sm" placeholder="Distrito"
            value={filters.distrito} onChange={e => setFilters(p => ({ ...p, distrito: e.target.value }))} />
          <select className="input py-2.5 text-sm"
            value={`${filters.edad_min}-${filters.edad_max}`}
            onChange={e => {
              const [min, max] = e.target.value.split('-');
              setFilters(p => ({ ...p, edad_min: min, edad_max: max }));
            }}>
            {RANGOS_EDAD.map(r => (
              <option key={r.label} value={`${r.min}-${r.max}`}>{r.label}</option>
            ))}
          </select>
          <input type="date" className="input py-2.5 text-sm" value={filters.desde}
            onChange={e => setFilters(p => ({ ...p, desde: e.target.value }))} />
          <input type="date" className="input py-2.5 text-sm" value={filters.hasta}
            onChange={e => setFilters(p => ({ ...p, hasta: e.target.value }))} />
        </div>
        <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <select
              className="input py-1.5 text-xs w-auto"
              value={filters.sexo}
              onChange={e => setFilters(p => ({ ...p, sexo: e.target.value }))}
            >
              <option value="">Todos los géneros</option>
              <option value="M">Masculino</option>
              <option value="F">Femenino</option>
            </select>
            {filters.area === AREA_ADMIN && (
              <select
                className="input py-1.5 text-xs w-auto max-w-[220px]"
                value={filters.profesion}
                onChange={e => setFilters(p => ({ ...p, profesion: e.target.value }))}
              >
                <option value="">Todas las profesiones</option>
                {profesionesCat.map(pr => <option key={pr.id} value={pr.nombre}>{pr.nombre}</option>)}
              </select>
            )}
            <button
              onClick={() => setFilters(p => ({ ...p, fue_trabajador: p.fue_trabajador === '1' ? '' : '1' }))}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors
                ${filters.fue_trabajador === '1'
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-stone-600 border-stone-200 hover:border-indigo-400 hover:text-indigo-600'}`}
            >
              <Briefcase className="w-3.5 h-3.5" />
              Solo ex-trabajadores
            </button>
            <button
              onClick={() => setFilters(p => ({ ...p, quiere_volver: p.quiere_volver === '1' ? '' : '1' }))}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors
                ${filters.quiere_volver === '1'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-stone-600 border-stone-200 hover:border-emerald-400 hover:text-emerald-600'}`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Quieren volver
            </button>
            <button
              onClick={() => setFilters(p => ({ ...p, discapacidad: p.discapacidad === '1' ? '' : '1' }))}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors
                ${filters.discapacidad === '1'
                  ? 'bg-sky-600 text-white border-sky-600'
                  : 'bg-white text-stone-600 border-stone-200 hover:border-sky-400 hover:text-sky-600'}`}
            >
              Con discapacidad
            </button>
          </div>
          {hasFilters && (
            <button onClick={clearFilters} className="btn-secondary text-sm py-2 px-4">
              <X className="w-3.5 h-3.5" /> Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm table-fixed">
            <thead className="bg-stone-50 border-b border-stone-100">
              <tr>
                {canAssign && (
                  <th className="px-4 py-3 w-[3%]">
                    <button onClick={toggleAll} className="text-stone-400 hover:text-agro-700 transition-colors">
                      {allChecked
                        ? <CheckSquare className="w-4 h-4 text-agro-600" />
                        : <Square className="w-4 h-4" />}
                    </button>
                  </th>
                )}
                {([
                  ['ID',        'id',         'w-[4%]'],
                  ['Nombre',    'nombres',    'w-[15%]'],
                  ['DNI',       'dni',        'w-[8%]'],
                  ['Celular',   'celular',    'w-[9%] hidden lg:table-cell'],
                  ['Ubicación', 'distrito',   'w-[10%]'],
                  ...(showContrata
                    ? [['Contrata', 'contrata', 'w-[12%]']]
                    : [['Profesión', 'especialidad', 'w-[16%]']]),
                  ['Estado',    'estado',     'w-[9%]'],
                  ['Registro',  'created_at', 'w-[9%] hidden xl:table-cell'],
                  ['',          '',           'w-[9%]'],
                ] as [string, string, string][]).map(([label, col, width]) => (
                  <th key={label || 'accion'}
                    className={`px-4 py-3 text-left text-xs font-semibold text-stone-500 whitespace-nowrap ${width}
                      ${col ? 'cursor-pointer select-none hover:text-agro-700 hover:bg-stone-100 transition-colors' : ''}`}
                    onClick={() => col && handleSort(col)}
                  >
                    {label}{col && <SortIcon col={col} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: colCount }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-stone-100 rounded w-16" /></td>
                    ))}
                  </tr>
                ))
              ) : data.length === 0 ? (
                <tr>
                  <td colSpan={colCount} className="px-4 py-12 text-center text-stone-400">
                    No se encontraron registros
                  </td>
                </tr>
              ) : data.map(p => (
                <tr key={p.id}
                  className={`hover:bg-stone-50 transition-colors ${checkedIds.has(p.id) ? 'bg-agro-50/50' : ''}`}>
                  {canAssign && (
                    <td className="px-4 py-3 w-10">
                      {noAsignable(p) ? (
                        <span
                          title={p.area_interes === AREA_ADMIN
                            ? 'Administrativo — lo gestiona la Reclutadora Principal, no se asigna a contratas'
                            : `Estado "${p.estado}" — no se puede reasignar`}
                          className="text-stone-200 cursor-not-allowed block"
                        >
                          <Square className="w-4 h-4" />
                        </span>
                      ) : (
                        <button onClick={() => toggleCheck(p.id)} className="text-stone-400 hover:text-agro-700 transition-colors">
                          {checkedIds.has(p.id)
                            ? <CheckSquare className="w-4 h-4 text-agro-600" />
                            : <Square className="w-4 h-4" />}
                        </button>
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3 font-mono text-stone-400 text-xs">#{p.id}</td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-stone-800 block truncate">
                      {p.nombres} {p.apellidos}
                    </span>
                    {generoEdad(p.sexo, p.edad) && (
                      <span className="block text-[11px] text-stone-400 mt-0.5">{generoEdad(p.sexo, p.edad)}</span>
                    )}
                    {(!!p.posible_duplicado || !!p.fue_trabajador || !!p.repostulo_at || p.area_interes === AREA_ADMIN) && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {p.area_interes === AREA_ADMIN && (
                          <span
                            title="Postulante a puesto Administrativo / Operativo"
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-100 text-purple-700"
                          >
                            Administrativo
                          </span>
                        )}
                        {!!p.posible_duplicado && (
                          <span
                            title="Mismo nombre registrado con otro DNI — verificar posible duplicado"
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-700"
                          >
                            <AlertTriangle className="w-2.5 h-2.5" />
                            DNI duplicado
                          </span>
                        )}
                        {!!p.fue_trabajador && (
                          <span
                            title="Fue trabajador activo — ya tuvo experiencia en campo"
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-100 text-indigo-700"
                          >
                            <Briefcase className="w-2.5 h-2.5" />
                            Ex-trabajador
                          </span>
                        )}
                        {!!p.repostulo_at && (
                          <span
                            title={`Volvió a postular el ${new Date(p.repostulo_at).toLocaleString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}`}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700"
                          >
                            <RotateCcw className="w-2.5 h-2.5" />
                            Quiere volver
                          </span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">{p.dni}</td>
                  <td className="px-4 py-3 text-stone-600 text-xs whitespace-nowrap hidden lg:table-cell">{p.celular}</td>
                  <td className="px-4 py-3">
                    <span className="block text-xs text-stone-600 truncate">{p.distrito || '—'}</span>
                    {p.centro_poblado && (
                      <span className="block text-[11px] text-stone-400 truncate mt-0.5">{p.centro_poblado}</span>
                    )}
                  </td>
                  {showContrata ? (
                    <td className="px-4 py-3 text-stone-500 text-xs truncate">{nombreCorto(p.contrata_nombre)}</td>
                  ) : (
                    <td className="px-4 py-3 text-stone-600 text-xs truncate" title={p.especialidad || ''}>{p.especialidad || '—'}</td>
                  )}
                  <td className="px-4 py-3">
                    <span className={`badge ${ESTADO_BADGE[p.estado] || 'bg-stone-100 text-stone-600'}`}>
                      {p.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-stone-400 text-xs whitespace-nowrap hidden xl:table-cell">{fmtFecha(p.created_at)}</td>
                  <td className="px-2 py-3">
                    <div className="flex items-center gap-1">
                      {p.area_interes === AREA_ADMIN && !!p.tiene_cv && (
                        <button onClick={() => abrirCv(p.id)}
                          title="Ver CV (PDF)"
                          className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors">
                          <FileText className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={() => openDetail(p.id)}
                        className="p-1.5 rounded-lg hover:bg-agro-50 text-agro-600 transition-colors">
                        <Eye className="w-4 h-4" />
                      </button>
                      {canDelete && (
                        <button
                          onClick={() => { setConfirmDeleteId(p.id); setDeleteError(''); }}
                          className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors"
                          title="Eliminar postulante"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-stone-100">
          <p className="text-xs text-stone-400">
            Mostrando {Math.min((page-1)*20+1, pagination.total)}–{Math.min(page*20, pagination.total)} de {pagination.total}
          </p>
          <div className="flex gap-1">
            <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1}
              className="p-2 rounded-lg hover:bg-stone-100 disabled:opacity-30 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            {Array.from({ length: Math.min(5, pagination.pages) }, (_, i) => {
              const p = Math.max(1, Math.min(page-2, pagination.pages-4)) + i;
              return (
                <button key={p} onClick={() => setPage(p)}
                  className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors
                    ${p === page ? 'bg-agro-600 text-white' : 'hover:bg-stone-100 text-stone-600'}`}>
                  {p}
                </button>
              );
            })}
            <button onClick={() => setPage(p => Math.min(pagination.pages, p+1))} disabled={page===pagination.pages}
              className="p-2 rounded-lg hover:bg-stone-100 disabled:opacity-30 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Modal asignación masiva */}
      {showAsignar && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && !asignando && setShowAsignar(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-slide-up">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-agro-100 flex items-center justify-center">
                  <UserPlus className="w-4 h-4 text-agro-700" />
                </div>
                <div>
                  <h2 className="font-bold text-stone-800">Asignación masiva</h2>
                  <p className="text-xs text-stone-400">{checkedIds.size} postulante{checkedIds.size > 1 ? 's' : ''} seleccionado{checkedIds.size > 1 ? 's' : ''}</p>
                </div>
              </div>
              {!asignando && (
                <button onClick={() => setShowAsignar(false)} className="p-1.5 hover:bg-stone-100 rounded-lg transition-colors">
                  <X className="w-4 h-4 text-stone-400" />
                </button>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label className="label text-xs">Seleccionar contrata</label>
                {loadingContratas ? (
                  <div className="input text-sm flex items-center gap-2 text-stone-400">
                    <span className="w-3.5 h-3.5 border-2 border-stone-300 border-t-agro-500 rounded-full animate-spin flex-shrink-0" />
                    Cargando...
                  </div>
                ) : contratasError ? (
                  <div className="text-sm text-red-500 bg-red-50 rounded-xl px-3 py-2">
                    {contratasError}
                  </div>
                ) : (() => {
                  const lista = contratas
                    .filter(c => c.rol === 'CONTRATA' || c.rol === 'RECLUTADOR')
                    .filter(c =>
                      !contrataBusqueda ||
                      c.nombre.toLowerCase().includes(contrataBusqueda.toLowerCase()) ||
                      c.email.toLowerCase().includes(contrataBusqueda.toLowerCase())
                    );
                  return (
                    <>
                      <div className="relative mb-2">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400" />
                        <input
                          className="input pl-8 py-2 text-sm"
                          placeholder="Buscar por nombre o correo..."
                          value={contrataBusqueda}
                          onChange={e => setContrataBusqueda(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
                        {lista.length === 0 ? (
                          <p className="text-center text-stone-400 text-sm py-4">Sin resultados</p>
                        ) : lista.map(c => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setReclutadorId(c.id)}
                            className={`w-full text-left px-3 py-2.5 rounded-xl border transition-all ${
                              reclutadorId === c.id
                                ? 'border-agro-500 bg-agro-50 ring-1 ring-agro-400'
                                : 'border-stone-100 hover:border-agro-200 hover:bg-stone-50'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-stone-800 truncate">{c.nombre}</p>
                                <p className="text-xs text-stone-400 truncate">{c.email}</p>
                              </div>
                              <span className="text-xs text-stone-500 flex-shrink-0 bg-stone-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                                {c.total_asignados} asig.
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </div>

              {asignarMsg && (
                <p className={`text-sm text-center font-medium ${
                  asignarMsg.includes('Error')    ? 'text-red-500'    :
                  asignarMsg.includes('omitido')  ? 'text-amber-600'  :
                  'text-teal-600'
                }`}>
                  {asignarMsg}
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setShowAsignar(false)}
                  disabled={asignando}
                  className="btn-secondary flex-1 py-2.5 text-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAsignarMasivo}
                  disabled={!reclutadorId || asignando}
                  className="btn-primary flex-1 py-2.5 text-sm"
                >
                  {asignando
                    ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" />
                    : 'Asignar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {(selected || detailLoading) && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setSelected(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto animate-slide-up">
            {detailLoading ? (
              <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-4 border-agro-200 border-t-agro-600 rounded-full animate-spin" />
              </div>
            ) : selected && (
              <>
                <div className="sticky top-0 bg-white border-b border-stone-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
                  <div>
                    <h2 className="font-display font-bold text-stone-800 text-lg">{selected.nombres} {selected.apellidos}</h2>
                    <p className="text-stone-400 text-sm">DNI: {selected.dni} · #{selected.id}</p>
                  </div>
                  <button onClick={() => setSelected(null)} className="p-2 hover:bg-stone-100 rounded-xl transition-colors">
                    <X className="w-5 h-5 text-stone-500" />
                  </button>
                </div>

                <div className="p-6 space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <h3 className="font-semibold text-stone-500 text-xs uppercase tracking-wider mb-3">Identificación</h3>
                      <div className="space-y-2">
                        {[
                          ['Nombre completo', `${selected.nombres} ${selected.apellidos}`],
                          ['DNI', selected.dni],
                          ['Celular', selected.celular],
                        ].map(([k, v]) => (
                          <div key={k} className="bg-stone-50 rounded-xl px-4 py-2.5">
                            <p className="text-xs text-stone-400">{k}</p>
                            <p className="text-sm font-medium text-stone-700 mt-0.5">{v}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <h3 className="font-semibold text-stone-500 text-xs uppercase tracking-wider mb-3">Ubicación</h3>
                      <div className="space-y-2">
                        {[
                          ['Departamento', selected.departamento],
                          ['Provincia',    selected.provincia],
                          ['Distrito',     selected.distrito],
                          ['Centro poblado', selected.centro_poblado || '—'],
                        ].map(([k, v]) => (
                          <div key={k} className="bg-stone-50 rounded-xl px-4 py-2.5">
                            <p className="text-xs text-stone-400">{k}</p>
                            <p className="text-sm font-medium text-stone-700 mt-0.5">{v}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-semibold text-stone-500 text-xs uppercase tracking-wider mb-3">Perfil</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {([
                        ['Área de interés', selected.area_interes],
                        ['Género', GENERO_LABEL[selected.sexo || ''] || '—'],
                        ['Edad', selected.edad != null ? `${selected.edad} años` : '—'],
                        ['Discapacidad', selected.discapacidad ? 'Sí' : 'No'],
                        ...(selected.area_interes === AREA_ADMIN ? [
                          ['Profesión', selected.especialidad || '—'],
                        ] : []),
                      ] as [string, string][]).map(([k, v]) => (
                        <div key={k} className="bg-stone-50 rounded-xl px-4 py-2.5">
                          <p className="text-xs text-stone-400">{k}</p>
                          <p className="text-sm font-medium text-stone-700 mt-0.5">{v}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="font-semibold text-stone-500 text-xs uppercase tracking-wider mb-3">Cómo nos conoció</h3>
                    <div className="bg-stone-50 rounded-xl px-4 py-2.5 inline-block">
                      <p className="text-sm font-medium text-stone-700">{selected.como_entero || '—'}</p>
                    </div>
                  </div>

                  {selected.area_interes === AREA_ADMIN && (
                    <div>
                      <h3 className="font-semibold text-stone-500 text-xs uppercase tracking-wider mb-3">Curriculum (CV)</h3>
                      {!selected.tiene_cv ? (
                        <p className="text-sm text-stone-400">Este postulante no adjuntó CV.</p>
                      ) : cvLoading ? (
                        <p className="text-sm text-stone-400">Cargando CV...</p>
                      ) : cvUrl ? (
                        <div className="space-y-2">
                          <iframe
                            src={cvUrl}
                            title="CV del postulante"
                            className="w-full h-96 rounded-xl border border-stone-200"
                          />
                          <a href={cvUrl} target="_blank" rel="noopener noreferrer"
                            className="inline-block text-sm text-agro-600 hover:underline">
                            Abrir en pestaña nueva
                          </a>
                        </div>
                      ) : (
                        <p className="text-sm text-red-500">No se pudo cargar el CV.</p>
                      )}
                    </div>
                  )}

                  <div>
                    <h3 className="font-semibold text-stone-500 text-xs uppercase tracking-wider mb-3">Registro</h3>
                    <div className="bg-stone-50 rounded-xl px-4 py-2.5 inline-block">
                      <p className="text-xs text-stone-400">Fecha de postulación</p>
                      <p className="text-sm font-medium text-stone-700 mt-0.5">
                        {fmtFechaHora(selected.created_at)}
                      </p>
                    </div>
                  </div>

                  {selected.area_interes === AREA_ADMIN && canLogLlamada && (
                    <div className="border-t border-stone-100 pt-5">
                      <h3 className="font-semibold text-stone-600 text-xs uppercase tracking-wider mb-3">Registrar llamada</h3>
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {RESULTADOS_LLAMADA.map(r => (
                            <button
                              key={r.value}
                              type="button"
                              onClick={() => { setLlamadaResultado(r.value); if (r.value !== 'programado') setLlamadaFecha(''); }}
                              className={`px-3 py-2.5 rounded-xl border text-sm font-medium transition-all ${
                                llamadaResultado === r.value
                                  ? 'border-agro-500 bg-agro-50 text-agro-700 ring-1 ring-agro-400'
                                  : 'border-stone-200 bg-white text-stone-600 hover:border-agro-300'
                              }`}
                            >
                              {r.label}
                            </button>
                          ))}
                        </div>
                        {llamadaResultado === 'programado' && (
                          <div>
                            <label className="label text-xs">Fecha y hora de la cita *</label>
                            <input
                              type="datetime-local"
                              className="input text-sm"
                              value={llamadaFecha}
                              min={new Date().toISOString().slice(0, 16)}
                              onChange={e => setLlamadaFecha(e.target.value)}
                            />
                          </div>
                        )}
                        <div>
                          <label className="label text-xs">Nota de la llamada (opcional)</label>
                          <textarea
                            className="input text-sm resize-none h-20"
                            maxLength={500}
                            value={llamadaObs}
                            onChange={e => setLlamadaObs(e.target.value)}
                            placeholder="Ej: Interesado, coordinar entrevista..."
                          />
                        </div>
                        {llamadaError && <p className="text-sm text-red-500">{llamadaError}</p>}
                        {llamadaMsg && <p className="text-sm text-teal-600">{llamadaMsg}</p>}
                        <button
                          onClick={registrarLlamadaAdmin}
                          disabled={!llamadaResultado || guardandoLlamada}
                          className="btn-primary text-sm py-2.5"
                        >
                          {guardandoLlamada ? 'Guardando...' : 'Registrar llamada'}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="border-t border-stone-100 pt-5">
                    <h3 className="font-semibold text-stone-600 text-xs uppercase tracking-wider mb-3">Gestión</h3>
                    <div className="grid grid-cols-1 gap-3">
                      <div>
                        <label className="label text-xs">Estado del postulante</label>
                        <select className="input text-sm" value={nuevoEstado} onChange={e => setNuevoEstado(e.target.value)}>
                          {ESTADOS.map(e => <option key={e}>{e}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="label text-xs">Notas internas</label>
                        <textarea className="input text-sm resize-none h-24" value={notas}
                          onChange={e => setNotas(e.target.value)} placeholder="Observaciones del equipo..." />
                      </div>
                      <button onClick={updateEstado} disabled={updatingEstado} className="btn-primary text-sm py-2.5">
                        {updatingEstado ? 'Guardando...' : 'Guardar cambios'}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      {/* Modal confirmación eliminar */}
      {confirmDeleteId !== null && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget && !deletingId) { setConfirmDeleteId(null); setDeleteError(''); } }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm animate-slide-up p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-stone-800">Eliminar postulante</h3>
                <p className="text-xs text-stone-400">Esta acción no se puede deshacer</p>
              </div>
            </div>

            {(() => {
              const p = data.find(x => x.id === confirmDeleteId);
              return p ? (
                <div className="bg-stone-50 rounded-xl px-4 py-3 mb-4 text-sm">
                  <p className="font-semibold text-stone-800">{p.nombres} {p.apellidos}</p>
                  <p className="text-stone-400 text-xs font-mono mt-0.5">DNI {p.dni} · #{p.id}</p>
                </div>
              ) : null;
            })()}

            {deleteError && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs mb-4">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                {deleteError}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => { setConfirmDeleteId(null); setDeleteError(''); }}
                disabled={!!deletingId}
                className="btn-secondary flex-1 py-2.5 text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(confirmDeleteId)}
                disabled={!!deletingId}
                className="flex-1 py-2.5 text-sm font-semibold rounded-xl bg-red-600 text-white hover:bg-red-700 active:scale-95 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {deletingId
                  ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <Trash2 className="w-4 h-4" />}
                {deletingId ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
