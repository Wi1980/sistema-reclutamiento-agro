import { useState, useEffect, useRef, memo } from 'react';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { fmtHora } from '@/utils/dates';
import {
  Phone, MessageCircle, Zap,
  CheckCircle2, RefreshCw, Search, Calendar, Briefcase, RotateCcw,
} from 'lucide-react';
import api from '@/services/api';
import { BottomSheet } from '@/components/ui/sheet';

interface PostulanteAsignado {
  id: number;
  nombres: string;
  apellidos: string;
  dni: string;
  celular: string;
  departamento: string;
  provincia: string;
  distrito: string | null;
  centro_poblado: string | null;
  zona_postula: string | null;
  estado: string;
  fue_trabajador: 0 | 1;
  repostulo_at: string | null;
  assigned_at: string | null;
  notas_internas: string | null;
  campana_nombre: string | null;
  ultima_llamada: string | null;
  total_llamadas: number;
  fecha_programada: string | null;
}

interface ReclutadorStats {
  total_asignados: number;
  pendientes: number;
  no_responde: number;
  confirmados: number;
  programados: number;
  ingresaron: number;
  no_interesados: number;
  no_presentados: number;
  llamadas_hoy: number;
  urgentes: number;
}

const FILTROS = [
  { value: 'activos',      label: 'Activos' },
  { value: 'por_llamar',   label: 'Pendientes' },
  { value: 'No responde',  label: 'Sin respuesta' },
  { value: 'Confirmado',   label: 'Confirmados' },
  { value: 'Programado',   label: 'Programados' },
  { value: 'cerrados',     label: 'Cerrados' },
];

const ESTADO_CHIP: Record<string, { bg: string; text: string; dot: string }> = {
  Pendiente:       { bg: 'bg-amber-50',  text: 'text-amber-700',  dot: 'bg-amber-400' },
  Asignado:        { bg: 'bg-amber-50',  text: 'text-amber-700',  dot: 'bg-amber-400' },
  'No responde':   { bg: 'bg-red-50',    text: 'text-red-600',    dot: 'bg-red-400'   },
  Confirmado:      { bg: 'bg-teal-50',   text: 'text-teal-700',   dot: 'bg-teal-500'  },
  Programado:      { bg: 'bg-blue-50',   text: 'text-blue-700',   dot: 'bg-blue-400'  },
  'No interesado':   { bg: 'bg-stone-100', text: 'text-stone-500',  dot: 'bg-stone-400' },
  'Ingresó':         { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500'},
  Descartado:        { bg: 'bg-stone-100', text: 'text-stone-500',  dot: 'bg-stone-300' },
  'No se presentó':  { bg: 'bg-orange-50', text: 'text-orange-600', dot: 'bg-orange-400'},
};

const RESULTADOS = [
  { value: 'confirmado',    emoji: '✅', label: 'Confirmó',         sel: 'border-teal-400 bg-teal-50 text-teal-800'    },
  { value: 'no_responde',   emoji: '📵', label: 'No responde',      sel: 'border-red-300 bg-red-50 text-red-700'       },
  { value: 'no_interesado', emoji: '❌', label: 'No interesado',    sel: 'border-stone-300 bg-stone-100 text-stone-700'},
  { value: 'programado',    emoji: '📅', label: 'Programado',       sel: 'border-blue-400 bg-blue-50 text-blue-700'    },
  { value: 'callback',      emoji: '🔁', label: 'Volveré a llamar', sel: 'border-amber-300 bg-amber-50 text-amber-800' },
];

function cleanPhone(phone: string) {
  return phone.replace(/[\s\-\+\(\)]/g, '');
}

function diasDesde(fecha: string | null): string | null {
  if (!fecha) return null;
  const diff = Math.floor((Date.now() - new Date(fecha).getTime()) / 86_400_000);
  if (diff === 0) return 'hoy';
  if (diff === 1) return '1 día';
  return `${diff} días`;
}

function fmtFechaCita(fecha: string | null): string | null {
  if (!fecha) return null;
  const d = new Date(fecha);
  const dia  = d.toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: '2-digit', month: 'short' });
  return `${dia} ${fmtHora(fecha)}`;
}

// ─── Stat pill ────────────────────────────────────────────────────────────────

function StatPill({ label, value, highlight = false, accent }: {
  label: string; value: number; highlight?: boolean; accent?: string;
}) {
  const base = highlight ? 'bg-amber-50 border border-amber-200' : 'bg-stone-50 border border-stone-100';
  const num  = highlight ? 'text-amber-600' : accent ?? 'text-stone-700';
  return (
    <div className={`flex-shrink-0 flex flex-col items-center px-3 py-2 rounded-xl ${base}`}>
      <span className={`text-2xl font-bold font-mono leading-none ${num}`}>{value}</span>
      <span className="text-[11px] text-stone-400 mt-0.5 whitespace-nowrap">{label}</span>
    </div>
  );
}

// ─── Postulante card ──────────────────────────────────────────────────────────

interface CardProps {
  p: PostulanteAsignado;
  onRegistrar: () => void;
}

const PostulanteCard = memo(function PostulanteCard({ p, onRegistrar }: CardProps) {
  const chip      = ESTADO_CHIP[p.estado] ?? { bg: 'bg-stone-50', text: 'text-stone-500', dot: 'bg-stone-400' };
  const tel       = cleanPhone(p.celular);
  const diasAsig  = diasDesde(p.assigned_at);
  const diasSin   = diasDesde(p.ultima_llamada);
  const esFinal   = ['Confirmado', 'Ingresó', 'No interesado', 'Descartado', 'Denegado'].includes(p.estado);
  const sinLlamar = !p.ultima_llamada;
  const urgente   = !esFinal && (sinLlamar || (Date.now() - new Date(p.ultima_llamada!).getTime()) > 48 * 3_600_000);
  const citaFmt   = fmtFechaCita(p.fecha_programada);

  return (
    <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 space-y-3">
      {/* Header: estado + campaña */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${chip.bg} ${chip.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${chip.dot}`} />
            {p.estado}
          </span>
          {!!p.fue_trabajador && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-100 text-indigo-700 border border-indigo-200">
              <Briefcase className="w-3 h-3" />
              Ex-trabajador
            </span>
          )}
          {!!p.repostulo_at && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700 border border-emerald-200">
              <RotateCcw className="w-3 h-3" />
              Quiere volver
            </span>
          )}
          {p.campana_nombre && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-agro-50 text-agro-700 border border-agro-200">
              {p.campana_nombre}
            </span>
          )}
        </div>
        <div className="text-right space-y-0.5 flex-shrink-0">
          {urgente && (
            <p className="text-[11px] text-amber-600 font-medium">
              ⚠ {sinLlamar ? 'sin llamar aún' : `sin llamar ${diasSin}`}
            </p>
          )}
          {citaFmt && p.estado === 'Programado' && (
            <p className="text-[11px] text-blue-600 font-medium flex items-center gap-1 justify-end">
              <Calendar className="w-3 h-3" />
              {citaFmt}
            </p>
          )}
          {diasAsig && (
            <p className="text-[11px] text-stone-400">asignado hace {diasAsig}</p>
          )}
        </div>
      </div>

      {/* Nombre, DNI y ubicación */}
      <div>
        <h3 className="font-bold text-stone-900 text-[18px] leading-tight">
          {p.nombres} {p.apellidos}
        </h3>
        <p className="text-stone-400 text-sm mt-0.5">
          {[p.provincia, p.distrito, p.centro_poblado].filter(Boolean).join(' · ')}
        </p>
        <p className="text-stone-400 text-xs mt-0.5 font-mono">DNI {p.dni}</p>
      </div>

      {/* Nota interna si existe */}
      {p.notas_internas && (
        <p className="text-xs text-stone-500 bg-stone-50 rounded-xl px-3 py-2 border border-stone-100 line-clamp-2">
          📝 {p.notas_internas}
        </p>
      )}

      {/* Teléfono — botón grande de toque */}
      <a
        href={`tel:${tel}`}
        className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-stone-50 border border-stone-200 font-mono text-[18px] font-bold text-stone-800 active:bg-stone-100 transition-colors"
      >
        <Phone className="w-4 h-4 text-stone-400" />
        {p.celular}
      </a>

      {/* Llamar / WhatsApp */}
      <div className="flex gap-2">
        <a
          href={`tel:${tel}`}
          className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-agro-50 border border-agro-200 text-agro-700 text-sm font-semibold active:bg-agro-100 transition-colors"
        >
          <Phone className="w-4 h-4" />
          Llamar
        </a>
        <a
          href={`https://wa.me/51${tel}?text=Hola%20${encodeURIComponent(p.nombres)}%2C%20le%20contactamos%20de%20Agroexportadora.`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm font-semibold active:bg-green-100 transition-colors"
        >
          <MessageCircle className="w-4 h-4" />
          WhatsApp
        </a>
      </div>

      {/* Registrar resultado */}
      <button
        onClick={onRegistrar}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-agro-600 text-white text-sm font-bold shadow-sm active:bg-agro-700 active:scale-[0.98] transition-all"
      >
        <Zap className="w-4 h-4" />
        Registrar resultado
        {p.total_llamadas > 0 && (
          <span className="text-agro-200 text-xs ml-1">({p.total_llamadas})</span>
        )}
      </button>
    </div>
  );
});

// ─── Page principal ───────────────────────────────────────────────────────────

export default function ReclutadorPage() {
  const [postulantes,      setPostulantes]      = useState<PostulanteAsignado[]>([]);
  const [stats,            setStats]            = useState<ReclutadorStats | null>(null);
  const [loading,          setLoading]          = useState(true);
  const [loadingMore,      setLoadingMore]      = useState(false);
  const [page,             setPage]             = useState(1);
  const [hasMore,          setHasMore]          = useState(false);
  const [filtro,           setFiltro]           = useState('activos');
  const [refreshing,       setRefreshing]       = useState(false);
  const [search,           setSearch]           = useState('');
  const [debouncedSearch,  setDebouncedSearch]  = useState('');

  // Sheet
  const [sheetOpen,       setSheetOpen]       = useState(false);
  const [selected,        setSelected]        = useState<PostulanteAsignado | null>(null);
  const [resultado,       setResultado]       = useState('');
  const [observacion,     setObservacion]     = useState('');
  const [fechaProgramada, setFechaProgramada] = useState('');
  const [guardando,       setGuardando]       = useState(false);
  const [error,           setError]           = useState('');
  const [confirmClose,    setConfirmClose]    = useState(false);

  const abortRef    = useRef<AbortController | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Debounce búsqueda 350ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  async function fetchStats() {
    try {
      const res = await api.get('/dashboard/reclutador');
      setStats(res.data.data);
    } catch {}
  }

  async function loadPostulantes(reset: boolean) {
    // Cancelar carga anterior para evitar race condition
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const pg = reset ? 1 : page;
    reset ? setLoading(true) : setLoadingMore(true);

    try {
      const qs = new URLSearchParams({ page: String(pg), limit: '15' });
      qs.set('estado', filtro);
      if (debouncedSearch.trim()) qs.set('search', debouncedSearch.trim());
      const res = await api.get(`/postulantes/mis-asignados?${qs}`, { signal: ctrl.signal });
      const { data: rows, pagination } = res.data;
      // setPage solo en éxito para evitar saltar páginas si falla
      setPostulantes(prev => reset ? rows : [...prev, ...rows]);
      setHasMore(pg < pagination.pages);
      setPage(reset ? 2 : pg + 1);
    } catch (err: any) {
      if (err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError') return;
      if (reset) setPostulantes([]);
    } finally {
      if (!ctrl.signal.aborted) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }

  // Scroll infinito con IntersectionObserver — reemplaza "Cargar más"
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loading || loadingMore) return;
    const io = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) loadPostulantes(false); },
      { threshold: 0.1 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loading, loadingMore]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRefresh() {
    setRefreshing(true);
    await Promise.all([loadPostulantes(true), fetchStats()]);
    setRefreshing(false);
  }

  useEffect(() => { fetchStats(); }, []);
  useEffect(() => { loadPostulantes(true); }, [filtro, debouncedSearch]); // eslint-disable-line react-hooks/exhaustive-deps
  useAutoRefresh(() => { fetchStats(); loadPostulantes(true); }, 30_000);

  function abrirSheet(p: PostulanteAsignado) {
    setSelected(p);
    setResultado('');
    setObservacion('');
    setFechaProgramada('');
    setError('');
    setConfirmClose(false);
    setSheetOpen(true);
  }

  function cerrarSheet() {
    if (guardando) return;
    if (resultado) { setConfirmClose(true); return; }
    setSheetOpen(false);
  }

  function descartarYCerrar() {
    setConfirmClose(false);
    setSheetOpen(false);
  }

  async function handleGuardar() {
    if (!resultado || !selected) return;
    if (resultado === 'programado' && !fechaProgramada) {
      setError('Ingresa la fecha y hora de la cita.');
      return;
    }
    setGuardando(true);
    setError('');
    try {
      const body: Record<string, any> = {
        resultado,
        observacion: observacion.trim() || undefined,
      };
      if (resultado === 'programado') body.fecha_programada = fechaProgramada;

      const res = await api.post(`/postulantes/${selected.id}/llamada`, body);
      const nuevoEstado: string | undefined  = res.data.estado;
      const nuevaFecha:  string | undefined  = res.data.fecha_programada;

      setPostulantes(prev =>
        prev.map(p =>
          p.id === selected.id
            ? {
                ...p,
                estado:           nuevoEstado ?? p.estado,
                notas_internas:   observacion.trim() || p.notas_internas,
                total_llamadas:   p.total_llamadas + 1,
                ultima_llamada:   new Date().toISOString(),
                fecha_programada: nuevaFecha ?? p.fecha_programada,
              }
            : p
        )
      );
      fetchStats();
      setSheetOpen(false);
    } catch {
      setError('Error al guardar. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  }

  const porLlamar = stats ? stats.pendientes + stats.no_responde : 0;

  function filtroCount(value: string): number | null {
    if (!stats) return null;
    switch (value) {
      case 'activos':      return stats.pendientes + stats.no_responde + stats.confirmados + stats.programados;
      case 'por_llamar':   return stats.pendientes;
      case 'No responde':  return stats.no_responde;
      case 'Confirmado':   return stats.confirmados;
      case 'Programado':   return stats.programados;
      case 'cerrados':     return stats.ingresaron + stats.no_interesados + (stats.no_presentados ?? 0);
      default:             return null;
    }
  }

  return (
    <>
      <div className="flex flex-col h-full -m-4 md:-m-6">

        {/* Stats strip */}
        <div className="bg-white border-b border-stone-100 px-4 py-3 flex items-center gap-2 overflow-x-auto flex-shrink-0 scrollbar-hide">
          <StatPill label="Asignados"   value={stats?.total_asignados ?? 0} />
          <StatPill label="Por llamar"  value={porLlamar}                   highlight />
          <StatPill label="Urgentes"    value={stats?.urgentes ?? 0}        accent="text-red-500" />
          <StatPill label="Hoy"         value={stats?.llamadas_hoy ?? 0}    accent="text-blue-600" />
          <StatPill label="Confirmados" value={stats?.confirmados ?? 0}     accent="text-teal-600" />
          <StatPill label="Programados" value={stats?.programados ?? 0}     accent="text-blue-500" />
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex-shrink-0 ml-auto p-2 rounded-xl hover:bg-stone-100 text-stone-400 active:scale-95 transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* Búsqueda por nombre, DNI o teléfono */}
        <div className="bg-white border-b border-stone-100 px-4 py-2 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" />
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nombre, DNI o teléfono..."
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-stone-200 text-sm text-stone-700 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-agro-400 focus:border-agro-400 transition-colors bg-stone-50"
            />
          </div>
        </div>

        {/* Filtros de estado con conteos */}
        <div className="bg-white border-b border-stone-100 px-2 py-2 flex gap-1 overflow-x-auto flex-shrink-0 scrollbar-hide">
          {FILTROS.map(f => {
            const cnt = filtroCount(f.value);
            const isCerrados = f.value === 'cerrados';
            return (
              <div key={f.value} className="flex items-center gap-1 flex-shrink-0">
                {isCerrados && (
                  <div className="w-px bg-stone-200 h-5 mx-1 self-center" />
                )}
                <button
                  onClick={() => setFiltro(f.value)}
                  className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5 ${
                    filtro === f.value
                      ? isCerrados
                        ? 'bg-stone-600 text-white shadow-sm'
                        : 'bg-agro-600 text-white shadow-sm'
                      : isCerrados
                        ? 'text-stone-400 hover:bg-stone-100'
                        : 'text-stone-500 hover:bg-stone-100'
                  }`}
                >
                  {f.label}
                  {cnt !== null && cnt > 0 && (
                    <span className={`text-xs rounded-full px-1.5 py-0.5 font-bold leading-none ${
                      filtro === f.value
                        ? 'bg-white/20 text-white'
                        : 'bg-stone-200 text-stone-600'
                    }`}>
                      {cnt}
                    </span>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Lista de cards */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 pb-6">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-stone-100 p-4 animate-pulse space-y-3">
                <div className="flex justify-between">
                  <div className="h-6 bg-stone-100 rounded-full w-24" />
                  <div className="h-4 bg-stone-100 rounded w-20" />
                </div>
                <div className="space-y-1.5">
                  <div className="h-5 bg-stone-100 rounded w-48" />
                  <div className="h-4 bg-stone-100 rounded w-32" />
                </div>
                <div className="h-12 bg-stone-100 rounded-xl" />
                <div className="flex gap-2">
                  <div className="flex-1 h-11 bg-stone-100 rounded-xl" />
                  <div className="flex-1 h-11 bg-stone-100 rounded-xl" />
                </div>
                <div className="h-12 bg-stone-100 rounded-xl" />
              </div>
            ))
          ) : postulantes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-16 h-16 bg-stone-100 rounded-2xl flex items-center justify-center mb-4">
                <Phone className="w-8 h-8 text-stone-300" />
              </div>
              <p className="font-semibold text-stone-600 mb-1">Sin resultados</p>
              <p className="text-stone-400 text-sm">
                {search
                  ? `No hay coincidencias para "${search}".`
                  : filtro === 'activos'
                    ? 'No tienes postulantes activos por gestionar.'
                    : filtro === 'cerrados'
                      ? 'Aún no hay postulantes cerrados.'
                      : 'No hay postulantes con ese estado.'}
              </p>
            </div>
          ) : (
            postulantes.map(p => (
              <PostulanteCard key={p.id} p={p} onRegistrar={() => abrirSheet(p)} />
            ))
          )}

          {/* Sentinel invisible — dispara scroll infinito */}
          <div ref={sentinelRef} className="h-4" />

          {/* Spinner de carga de página siguiente */}
          {loadingMore && (
            <div className="flex justify-center py-4">
              <div className="w-5 h-5 border-2 border-stone-300 border-t-agro-600 rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>

      {/* Bottom Sheet — resultado de llamada */}
      <BottomSheet open={sheetOpen} onClose={cerrarSheet} maxHeight="92vh">
        {selected && (
          <div className="pt-3 pb-2 space-y-4">

            {/* Banner de confirmación de cierre */}
            {confirmClose && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-3">
                <p className="text-sm font-semibold text-amber-800">
                  ¿Salir sin guardar el resultado?
                </p>
                <p className="text-xs text-amber-600">
                  Tienes un resultado seleccionado que aún no fue guardado.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmClose(false)}
                    className="flex-1 py-2 rounded-xl border border-amber-300 text-amber-700 text-sm font-semibold hover:bg-amber-100 transition-colors"
                  >
                    Continuar editando
                  </button>
                  <button
                    onClick={descartarYCerrar}
                    className="flex-1 py-2 rounded-xl bg-stone-700 text-white text-sm font-semibold hover:bg-stone-800 transition-colors"
                  >
                    Descartar y cerrar
                  </button>
                </div>
              </div>
            )}

            {/* Info del postulante */}
            <div>
              <p className="font-bold text-stone-900 text-lg leading-tight">
                {selected.nombres} {selected.apellidos}
              </p>
              <p className="text-stone-400 text-xs mt-0.5 font-mono">DNI {selected.dni}</p>
              <a
                href={`tel:${cleanPhone(selected.celular)}`}
                className="flex items-center gap-2 mt-2 py-3 px-4 rounded-xl bg-stone-50 border border-stone-200 font-mono text-base font-semibold text-stone-700 active:bg-stone-100 transition-colors"
              >
                <Phone className="w-4 h-4 text-stone-400" />
                {selected.celular}
              </a>
              {selected.notas_internas && (
                <p className="mt-2 text-xs text-stone-500 bg-stone-50 rounded-xl px-3 py-2 border border-stone-100">
                  📝 {selected.notas_internas}
                </p>
              )}
            </div>

            {/* Resultado */}
            <div>
              <p className="text-xs text-stone-400 font-semibold uppercase tracking-wider mb-2.5">
                ¿Cuál fue el resultado?
              </p>
              <div className="space-y-2">
                {RESULTADOS.map(r => (
                  <button
                    key={r.value}
                    onClick={() => {
                      setResultado(r.value);
                      if (r.value !== 'programado') setFechaProgramada('');
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 transition-all active:scale-[0.98] ${
                      resultado === r.value
                        ? `border-opacity-100 ${r.sel}`
                        : 'border-stone-200 bg-white text-stone-700'
                    }`}
                  >
                    <span className="text-xl leading-none">{r.emoji}</span>
                    <span className="font-semibold text-[15px]">{r.label}</span>
                    {resultado === r.value && (
                      <CheckCircle2 className="w-4 h-4 ml-auto text-agro-600 flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Fecha y hora de cita — solo cuando programado */}
            {resultado === 'programado' && (
              <div>
                <p className="text-xs text-stone-400 font-semibold uppercase tracking-wider mb-2">
                  Fecha y hora de la cita <span className="text-red-400">*</span>
                </p>
                <input
                  type="datetime-local"
                  value={fechaProgramada}
                  min={new Date().toISOString().slice(0, 16)}
                  onChange={e => setFechaProgramada(e.target.value)}
                  className="w-full rounded-xl border border-stone-200 p-3 text-sm text-stone-700 focus:outline-none focus:ring-2 focus:ring-agro-400 focus:border-agro-400 transition-colors"
                />
              </div>
            )}

            {/* Nota opcional */}
            <div>
              <p className="text-xs text-stone-400 font-semibold uppercase tracking-wider mb-2">
                Nota rápida (opcional)
              </p>
              <textarea
                value={observacion}
                onChange={e => setObservacion(e.target.value)}
                placeholder="Ej: Llamar en la tarde, tiene turno de mañana..."
                rows={2}
                maxLength={500}
                className="w-full resize-none rounded-xl border border-stone-200 p-3 text-sm text-stone-700 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-agro-400 focus:border-agro-400 transition-colors"
              />
              {observacion.length > 400 && (
                <p className="text-xs text-stone-400 text-right mt-1">{observacion.length}/500</p>
              )}
            </div>

            {/* Error */}
            {error && <p className="text-red-600 text-sm text-center">{error}</p>}

            {/* Guardar */}
            <button
              disabled={!resultado || guardando}
              onClick={handleGuardar}
              className={`w-full py-4 rounded-2xl text-base font-bold transition-all ${
                resultado && !guardando
                  ? 'bg-agro-600 text-white shadow-md active:scale-[0.98] active:bg-agro-700'
                  : 'bg-stone-100 text-stone-400 cursor-not-allowed'
              }`}
            >
              {guardando ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" />
                  Guardando...
                </span>
              ) : resultado ? (
                'Guardar resultado'
              ) : (
                'Selecciona un resultado'
              )}
            </button>
          </div>
        )}
      </BottomSheet>
    </>
  );
}
