import { useCallback, useEffect, useState } from 'react';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { useNavigate } from 'react-router-dom';
import {
  Users, TrendingUp, UserCheck, Clock, BarChart3,
  Download, CheckCircle, UserX, AlertCircle, CalendarCheck,
  ArrowUpRight, RefreshCw,
} from 'lucide-react';
import {
  AreaChart, Area, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import api from '@/services/api';
import { useAuthStore } from '@/store/authStore';

interface Stats {
  totales: {
    total: number;
    pendientes: number;
    no_responde: number;
    confirmados: number;
    programados: number;
    ingresos: number;
    no_interesados: number;
    descartados: number;
    hoy: number;
    semana: number;
    asignados_total: number;
    sin_asignar: number;
  };
  porDistrito:               Array<{ distrito: string; cantidad: number }>;
  porDia:                    Array<{ fecha: string; cantidad: number }>;
  porDisponibilidad:         Array<{ disponibilidad: string; cantidad: number }>;
  porComoEntero:             Array<{ canal: string; cantidad: number }>;
  productividadReclutadores: Array<{ nombre: string; llamadas_7d: number; confirmados_7d: number }>;
}

const CHART_COLORS = ['#1B3A8A', '#0EA5E9', '#0D9488', '#D97706', '#7C3AED', '#EF4444', '#6B7280'];

function KpiCard({
  label, value, sub, icon: Icon, color, bg, trend,
}: {
  label: string; value: number; sub?: string;
  icon: React.ElementType; color: string; bg: string; trend?: 'up' | 'neutral';
}) {
  return (
    <div className="card p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-6 h-6 ${color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-stone-400 text-xs font-medium">{label}</p>
        <div className="flex items-end gap-1.5">
          <p className="text-2xl font-bold text-stone-800 font-mono leading-none mt-0.5">
            {value.toLocaleString()}
          </p>
          {trend === 'up' && (
            <span className="flex items-center text-[10px] text-teal-600 font-semibold mb-0.5">
              <ArrowUpRight className="w-3 h-3" />hoy
            </span>
          )}
        </div>
        {sub && <p className="text-[11px] text-stone-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [stats,       setStats]       = useState<Stats | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [statsError,  setStatsError]  = useState(false);
  const [exporting,   setExporting]   = useState(false);
  const [exportError, setExportError] = useState('');
  const { user } = useAuthStore();
  const navigate  = useNavigate();

  useEffect(() => {
    if (user?.rol === 'CONTRATA' || user?.rol === 'RECLUTADOR') {
      navigate('/app/mis-asignados', { replace: true });
    }
  }, [user, navigate]);

  const fetchStats = useCallback(() => {
    if (user?.rol === 'CONTRATA' || user?.rol === 'RECLUTADOR') return;
    setLoading(true);
    setStatsError(false);
    api.get('/dashboard/stats')
      .then(r => setStats(r.data.data))
      .catch(() => setStatsError(true))
      .finally(() => setLoading(false));
  }, [user]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useAutoRefresh(fetchStats, 30_000);

  async function handleExport() {
    setExporting(true);
    setExportError('');
    try {
      const res = await api.get('/postulantes/export', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = `postulantes_${new Date().toISOString().split('T')[0]}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError('Error al exportar. Intenta de nuevo.');
    } finally {
      setExporting(false);
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-agro-200 border-t-agro-600 rounded-full animate-spin mx-auto mb-3" />
        <p className="text-stone-400 text-sm">Cargando estadísticas...</p>
      </div>
    </div>
  );

  if (statsError) return (
    <div className="flex items-center justify-center h-64">
      <div className="text-center">
        <AlertCircle className="w-10 h-10 text-red-300 mx-auto mb-3" />
        <p className="text-stone-600 font-semibold">No se pudieron cargar las estadísticas</p>
        <button onClick={fetchStats} className="mt-4 btn-primary text-sm py-2">
          Reintentar
        </button>
      </div>
    </div>
  );

  const t = stats?.totales;

  // Tasa de conversión: postulantes que llegaron a Ingresó / total
  const tasaConversion = t && t.total > 0
    ? ((t.ingresos / t.total) * 100).toFixed(1)
    : '0.0';

  // Tasa de contactabilidad: quienes respondieron / asignados
  const tasaContacto = t && t.asignados_total > 0
    ? (((t.asignados_total - t.no_responde) / t.asignados_total) * 100).toFixed(1)
    : '0.0';

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-stone-400 text-sm font-medium">
            Hola, <span className="text-agro-700 font-semibold">{user?.nombre}</span> 👋
          </p>
          <h1 className="font-display text-2xl font-bold text-stone-800 mt-0.5">Dashboard</h1>
          <p className="text-stone-400 text-sm mt-0.5">Resumen operativo de reclutamiento</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchStats}
            className="btn-secondary text-sm py-2.5 px-3"
            title="Actualizar"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="btn-primary text-sm py-2.5"
          >
            {exporting
              ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              : <Download className="w-4 h-4" />
            }
            Exportar Excel
          </button>
        </div>
      </div>
      {exportError && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{exportError}
        </div>
      )}

      {/* ── KPI cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Total postulantes" value={t?.total      || 0} icon={Users}      color="text-agro-600"   bg="bg-agro-50"   />
        <KpiCard label="Ingresaron"        value={t?.ingresos   || 0} icon={UserCheck}  color="text-purple-600" bg="bg-purple-50"
          sub={`${tasaConversion}% conversión`}
        />
        <KpiCard label="Registrados hoy"  value={t?.hoy        || 0} icon={Clock}       color="text-blue-600"  bg="bg-blue-50"   trend="up" />
        <KpiCard label="Esta semana"       value={t?.semana     || 0} icon={TrendingUp}  color="text-earth-600" bg="bg-earth-50"  />
      </div>

      {/* ── Asignación + Indicadores ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4 flex items-center gap-3 col-span-2 md:col-span-1">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center flex-shrink-0">
            <AlertCircle className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <p className="text-stone-400 text-xs">Sin asignar</p>
            <p className="text-xl font-bold text-stone-800 font-mono">{t?.sin_asignar || 0}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3 col-span-2 md:col-span-1">
          <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
            <CalendarCheck className="w-5 h-5 text-teal-600" />
          </div>
          <div>
            <p className="text-stone-400 text-xs">Confirmados</p>
            <p className="text-xl font-bold text-stone-800 font-mono">{t?.confirmados || 0}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
            <UserX className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <p className="text-stone-400 text-xs">No responde</p>
            <p className="text-xl font-bold text-stone-800 font-mono">{t?.no_responde || 0}</p>
          </div>
        </div>
        <div className="card p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center flex-shrink-0">
            <CheckCircle className="w-5 h-5 text-sky-600" />
          </div>
          <div>
            <p className="text-stone-400 text-xs">Contactabilidad</p>
            <p className="text-xl font-bold text-stone-800 font-mono">{tasaContacto}%</p>
          </div>
        </div>
      </div>

      {/* ── Charts: postulaciones + departamentos ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-5">
            <BarChart3 className="w-5 h-5 text-agro-600" />
            <h3 className="font-semibold text-stone-700">Postulaciones últimos 30 días</h3>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={stats?.porDia || []} margin={{ top: 5, right: 5, bottom: 5, left: -10 }}>
              <defs>
                <linearGradient id="colorAgro" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#1B3A8A" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#1B3A8A" stopOpacity={0}   />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="fecha"
                tick={{ fontSize: 10 }}
                tickFormatter={v => {
                  const [, m, d] = String(v).split('-');
                  return `${d}/${m}`;
                }}
              />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip
                formatter={(v) => [v, 'Postulaciones']}
                labelFormatter={l => {
                  const [y, m, d] = String(l).split('-');
                  return `${d}/${m}/${y}`;
                }}
                contentStyle={{ borderRadius: '8px', border: '1px solid #e7e5e4', fontSize: 12 }}
              />
              <Area type="monotone" dataKey="cantidad" stroke="#1B3A8A" strokeWidth={2} fill="url(#colorAgro)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-6">
          <h3 className="font-semibold text-stone-700 mb-5">Top distritos</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={stats?.porDistrito?.slice(0, 8) || []}
              layout="vertical"
              margin={{ left: 0, right: 10 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
              <YAxis type="category" dataKey="distrito" tick={{ fontSize: 10 }} width={90} />
              <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e7e5e4', fontSize: 12 }} />
              <Bar dataKey="cantidad" fill="#1B3A8A" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Cómo se enteró ── */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-5">
          <BarChart3 className="w-5 h-5 text-agro-600" />
          <h3 className="font-semibold text-stone-700">Cómo se enteró</h3>
          <span className="text-xs text-stone-400 ml-1">— canal de captación de postulantes</span>
        </div>
        {(stats?.porComoEntero || []).length === 0 ? (
          <div className="h-[200px] flex items-center justify-center text-stone-300 text-sm">
            Sin datos aún
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(180, (stats?.porComoEntero || []).length * 34)}>
            <BarChart
              data={stats?.porComoEntero || []}
              layout="vertical"
              margin={{ left: 0, right: 40 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
              <YAxis type="category" dataKey="canal" tick={{ fontSize: 11 }} width={130} />
              <Tooltip
                formatter={(v) => [v, 'Postulantes']}
                contentStyle={{ borderRadius: '8px', border: '1px solid #e7e5e4', fontSize: 12 }}
              />
              <Bar dataKey="cantidad" radius={[0, 4, 4, 0]}>
                {(stats?.porComoEntero || []).map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Productividad de reclutadores ── */}
      <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-stone-700">Reclutadores</h3>
              <p className="text-xs text-stone-400">Últimos 7 días</p>
            </div>
            <span className="text-[10px] font-semibold text-agro-600 bg-agro-50 px-2 py-1 rounded-full">
              TOP 10
            </span>
          </div>

          {(stats?.productividadReclutadores || []).length === 0 ? (
            <div className="flex items-center justify-center h-[160px] text-stone-300 text-sm">
              Sin actividad aún
            </div>
          ) : (
            <div className="space-y-2.5">
              {stats!.productividadReclutadores.map((r, i) => {
                const pct = r.llamadas_7d > 0
                  ? Math.round((r.confirmados_7d / r.llamadas_7d) * 100)
                  : 0;
                return (
                  <div key={i} className="flex items-center gap-2.5">
                    <div className={`w-5 h-5 rounded-md text-[10px] font-bold flex items-center justify-center flex-shrink-0 ${
                      i === 0 ? 'bg-amber-400 text-white' :
                      i === 1 ? 'bg-stone-300 text-stone-700' :
                      i === 2 ? 'bg-amber-700 text-white' :
                                'bg-agro-50 text-agro-700'
                    }`}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-stone-700 truncate leading-tight">
                        {r.nombre}
                      </p>
                      <div className="h-1.5 bg-stone-100 rounded-full mt-1 overflow-hidden">
                        <div
                          className="h-full bg-teal-400 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-bold text-stone-800 font-mono leading-tight">{r.llamadas_7d}</p>
                      <p className="text-[10px] text-teal-600 leading-tight">{r.confirmados_7d} ✓</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
      </div>

      {/* ── Funnel de estados ── */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-5">
          <TrendingUp className="w-5 h-5 text-agro-600" />
          <h3 className="font-semibold text-stone-700">Funnel de conversión</h3>
          <span className="text-xs text-stone-400 ml-1">— del total de postulantes</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: 'Sin asignar',    value: t?.sin_asignar    || 0, color: 'bg-stone-100', text: 'text-stone-600',  bar: 'bg-stone-400'   },
            { label: 'Pendientes',     value: t?.pendientes     || 0, color: 'bg-amber-50',  text: 'text-amber-700',  bar: 'bg-amber-400'   },
            { label: 'No responde',    value: t?.no_responde    || 0, color: 'bg-red-50',    text: 'text-red-600',    bar: 'bg-red-400'     },
            { label: 'Confirmados',    value: t?.confirmados    || 0, color: 'bg-teal-50',   text: 'text-teal-700',   bar: 'bg-teal-400'    },
            { label: 'Programados',    value: t?.programados    || 0, color: 'bg-blue-50',   text: 'text-blue-700',   bar: 'bg-blue-400'    },
            { label: 'Ingresaron',     value: t?.ingresos       || 0, color: 'bg-purple-50', text: 'text-purple-700', bar: 'bg-purple-400'  },
            { label: 'No interesados', value: t?.no_interesados || 0, color: 'bg-stone-100', text: 'text-stone-500',  bar: 'bg-stone-300'   },
          ].map(({ label, value, color, text, bar }) => {
            const pct = t?.total ? Math.round((value / t.total) * 100) : 0;
            return (
              <div key={label} className={`${color} rounded-xl p-4`}>
                <p className={`text-xs font-medium ${text} mb-2 leading-tight`}>{label}</p>
                <p className={`text-2xl font-bold font-mono ${text}`}>{value.toLocaleString()}</p>
                <div className="mt-2 h-1.5 bg-white/60 rounded-full overflow-hidden">
                  <div className={`h-full ${bar} rounded-full`} style={{ width: `${pct}%` }} />
                </div>
                <p className={`text-[11px] ${text} opacity-70 mt-1`}>{pct}% del total</p>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
