import { useState, useEffect } from 'react';
import {
  Phone, TrendingUp, CheckCircle2, Clock,
  RefreshCw, AlertTriangle, Users, Zap, AlertCircle, Download,
} from 'lucide-react';
import api from '@/services/api';

interface ContrataStats {
  id: number;
  nombre: string;
  email: string;
  rol: string;
  total_asignados: number;
  pendientes: number;
  confirmados: number;
  programados: number;
  ingresaron: number;
  no_responde: number;
  no_interesados: number;
  llamadas_total: number;
  llamadas_hoy: number;
  llamadas_semana: number;
  ultima_actividad: string | null;
  tasa_confirmacion: number;
}

interface Totales {
  llamadas_hoy: number;
  llamadas_semana: number;
  confirmados_semana: number;
  contratas_activas: number;
}

type Orden = 'llamadas_semana' | 'confirmados' | 'tasa_confirmacion' | 'pendientes' | 'ingresaron';

function diasDesde(fecha: string | null): string {
  if (!fecha) return 'Sin actividad';
  const diff = Math.floor((Date.now() - new Date(fecha).getTime()) / 86_400_000);
  if (diff === 0) return 'Hoy';
  if (diff === 1) return 'Ayer';
  return `Hace ${diff} días`;
}

function nivelActividad(c: ContrataStats): 'alta' | 'media' | 'baja' | 'inactivo' {
  if (!c.ultima_actividad) return 'inactivo';
  const diff = (Date.now() - new Date(c.ultima_actividad).getTime()) / 86_400_000;
  if (c.llamadas_semana >= 20 || diff < 1) return 'alta';
  if (c.llamadas_semana >= 8  || diff < 3) return 'media';
  if (diff < 7) return 'baja';
  return 'inactivo';
}

const NIVEL_STYLE = {
  alta:     { bar: 'bg-teal-500',  badge: 'bg-teal-50 text-teal-700',   label: 'Alta'     },
  media:    { bar: 'bg-agro-500',  badge: 'bg-agro-50 text-agro-700',   label: 'Media'    },
  baja:     { bar: 'bg-amber-400', badge: 'bg-amber-50 text-amber-700', label: 'Baja'     },
  inactivo: { bar: 'bg-stone-300', badge: 'bg-stone-100 text-stone-500',label: 'Inactiva' },
};

function StatChip({ label, value, color = 'stone' }: { label: string; value: number; color?: string }) {
  const colors: Record<string, string> = {
    teal:   'text-teal-600',
    blue:   'text-blue-600',
    amber:  'text-amber-600',
    red:    'text-red-500',
    stone:  'text-stone-600',
    purple: 'text-purple-600',
  };
  return (
    <div className="text-center">
      <p className={`text-base font-bold font-mono leading-none ${colors[color] ?? colors.stone}`}>{value}</p>
      <p className="text-[10px] text-stone-400 mt-0.5 whitespace-nowrap">{label}</p>
    </div>
  );
}

export default function ProductividadPage() {
  const [contratas,   setContratas]   = useState<ContrataStats[]>([]);
  const [totales,     setTotales]     = useState<Totales | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(false);
  const [refreshing,  setRefreshing]  = useState(false);
  const [exporting,   setExporting]   = useState(false);
  const [exportError, setExportError] = useState('');
  const [orden,       setOrden]       = useState<Orden>('llamadas_semana');

  async function fetchData() {
    setError(false);
    try {
      const res = await api.get('/productividad/contratas');
      setContratas(res.data.data);
      setTotales(res.data.totales);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  async function handleRefresh() {
    setRefreshing(true);
    await fetchData();
  }

  async function handleExport() {
    setExporting(true);
    try {
      const res = await api.get('/reportes/productividad/export', { responseType: 'blob' });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a   = document.createElement('a');
      a.href     = url;
      a.download = `productividad_${new Date().toISOString().split('T')[0]}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError('Error al exportar. Intenta de nuevo.');
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => { fetchData(); }, []);

  const sorted      = [...contratas].sort((a, b) => b[orden] - a[orden]);
  const maxLlamadas = Math.max(...contratas.map(c => c.llamadas_semana), 1);

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-stone-800">Productividad</h1>
          <p className="text-stone-400 text-sm mt-0.5">Rendimiento de contratas — últimos 7 días</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            disabled={exporting || loading}
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-agro-700 text-white text-sm font-medium hover:bg-agro-800 transition-all active:scale-95 disabled:opacity-60"
          >
            {exporting
              ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              : <Download className="w-4 h-4" />
            }
            <span className="hidden sm:inline">Exportar</span>
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2.5 rounded-xl border border-stone-200 hover:bg-stone-50 text-stone-400 transition-all active:scale-95"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Export error */}
      {exportError && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{exportError}
        </div>
      )}

      {/* Totales globales */}
      {totales && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Contratas activas', value: totales.contratas_activas,  icon: Users,        color: 'bg-agro-50   text-agro-700',   num: 'text-agro-700'   },
            { label: 'Llamadas hoy',      value: totales.llamadas_hoy,       icon: Phone,        color: 'bg-blue-50   text-blue-600',   num: 'text-blue-600'   },
            { label: 'Llamadas semana',   value: totales.llamadas_semana,    icon: TrendingUp,   color: 'bg-teal-50   text-teal-600',   num: 'text-teal-600'   },
            { label: 'Confirmados 7d',    value: totales.confirmados_semana, icon: CheckCircle2, color: 'bg-purple-50 text-purple-600', num: 'text-purple-600' },
          ].map(({ label, value, icon: Icon, color, num }) => (
            <div key={label} className="bg-white rounded-2xl border border-stone-100 p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
                <Icon className="w-5 h-5" />
              </div>
              <div>
                <p className={`text-2xl font-bold font-mono leading-none ${num}`}>{value}</p>
                <p className="text-xs text-stone-400 mt-0.5">{label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Ordenar */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
        <span className="text-xs text-stone-400 flex-shrink-0">Ordenar:</span>
        {([
          ['llamadas_semana',   'Llamadas 7d'],
          ['confirmados',       'Confirmados'],
          ['ingresaron',        'Ingresaron'],
          ['tasa_confirmacion', 'Tasa %'],
          ['pendientes',        'Pendientes'],
        ] as [Orden, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setOrden(key)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-all ${
              orden === key
                ? 'bg-agro-700 text-white shadow-sm'
                : 'bg-white border border-stone-200 text-stone-500 hover:border-agro-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Estados */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-stone-100 p-4 animate-pulse">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-stone-100 rounded-xl" />
                <div className="space-y-1.5 flex-1">
                  <div className="h-4 bg-stone-100 rounded w-40" />
                  <div className="h-3 bg-stone-100 rounded w-24" />
                </div>
              </div>
              <div className="h-2 bg-stone-100 rounded-full mb-3" />
              <div className="grid grid-cols-6 gap-3">
                {Array.from({ length: 6 }).map((_, j) => (
                  <div key={j} className="h-10 bg-stone-100 rounded-xl" />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="bg-white rounded-2xl border border-stone-100 p-12 text-center">
          <AlertCircle className="w-12 h-12 text-red-300 mx-auto mb-3" />
          <p className="font-semibold text-stone-600">No se pudo cargar la productividad</p>
          <p className="text-sm text-stone-400 mt-1 mb-4">Verifica la conexión con el servidor</p>
          <button
            onClick={handleRefresh}
            className="btn-primary text-sm py-2"
          >
            Reintentar
          </button>
        </div>
      ) : sorted.length === 0 ? (
        <div className="bg-white rounded-2xl border border-stone-100 p-12 text-center">
          <Users className="w-12 h-12 text-stone-200 mx-auto mb-3" />
          <p className="font-semibold text-stone-500">Sin contratas registradas</p>
          <p className="text-sm text-stone-400 mt-1">Agrega usuarios con rol CONTRATA para ver su productividad</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((c, idx) => {
            const nivel = nivelActividad(c);
            const style = NIVEL_STYLE[nivel];
            const pct   = Math.round((c.llamadas_semana / maxLlamadas) * 100);

            return (
              <div key={c.id} className="bg-white rounded-2xl border border-stone-100 shadow-sm p-4 space-y-4">

                {/* Header */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-agro-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                      {idx + 1}
                    </div>
                    <div>
                      <p className="font-bold text-stone-800 leading-tight">{c.nombre}</p>
                      <p className="text-xs text-stone-400">{c.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {nivel === 'inactivo' && (
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                    )}
                    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${style.badge}`}>
                      {style.label}
                    </span>
                  </div>
                </div>

                {/* Barra de actividad semanal */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] text-stone-400">Llamadas esta semana</span>
                    <span className="text-xs font-bold text-stone-700 font-mono">{c.llamadas_semana}</span>
                  </div>
                  <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${style.bar}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>

                {/* Métricas — 6 columnas: 3 en móvil, 6 en sm+ */}
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 pt-1 border-t border-stone-50">
                  <StatChip label="Asignados"   value={c.total_asignados} color="stone"  />
                  <StatChip label="Pendientes"  value={c.pendientes}      color="amber"  />
                  <StatChip label="No responde" value={c.no_responde}     color="red"    />
                  <StatChip label="Confirmados" value={c.confirmados}     color="teal"   />
                  <StatChip label="Ingresaron"  value={c.ingresaron}      color="purple" />
                  <div className="text-center">
                    <p className={`text-base font-bold font-mono leading-none ${
                      c.tasa_confirmacion >= 30 ? 'text-teal-600' :
                      c.tasa_confirmacion >= 15 ? 'text-agro-600' : 'text-stone-400'
                    }`}>
                      {c.tasa_confirmacion}%
                    </p>
                    <p className="text-[10px] text-stone-400 mt-0.5">Conversión 7d</p>
                  </div>
                </div>

                {/* Footer: última actividad + llamadas hoy */}
                <div className="flex items-center justify-between text-[11px] text-stone-400">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3 flex-shrink-0" />
                    <span>
                      Últ. actividad:{' '}
                      <span className="text-stone-600 font-medium">{diasDesde(c.ultima_actividad)}</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    {c.llamadas_hoy > 0 && (
                      <span className="flex items-center gap-1">
                        <Phone className="w-3 h-3 text-blue-400" />
                        <span className="text-blue-600 font-medium">{c.llamadas_hoy} hoy</span>
                      </span>
                    )}
                    {c.ingresaron > 0 && (
                      <span className="flex items-center gap-1">
                        <Zap className="w-3 h-3 text-purple-400" />
                        <span className="text-purple-600 font-medium">{c.ingresaron} ingresaron</span>
                      </span>
                    )}
                  </div>
                </div>

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
