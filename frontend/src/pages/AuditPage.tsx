import { useState, useEffect, useCallback, useRef } from 'react';
import { Shield, RefreshCw, Search, X, ChevronLeft, ChevronRight, Eye, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { fmtFechaHora } from '@/utils/dates';
import api from '@/services/api';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogBody,
} from '@/components/ui/dialog';

interface AuditLog {
  id: number;
  usuario_id: number | null;
  usuario_nombre: string | null;
  usuario_email: string | null;
  accion: string;
  entidad_tipo: string | null;
  entidad_id: number | null;
  valores_anteriores: Record<string, unknown> | null;
  valores_nuevos: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

interface AuditStats {
  totales: {
    total: number;
    hoy: number;
    semana: number;
    login_fallidos: number;
    exportaciones: number;
  };
  porAccion: Array<{ accion: string; cantidad: number }>;
  porUsuario: Array<{ usuario_nombre: string; cantidad: number }>;
}

interface Pagination { total: number; page: number; limit: number; pages: number; }

const ACCION_VARIANT: Record<string, 'default' | 'danger' | 'warning' | 'success' | 'info' | 'secondary'> = {
  AUTH_LOGIN:          'success',
  AUTH_LOGIN_FAILED:   'danger',
  AUTH_LOGOUT:         'secondary',
  USER_BLOCK:          'danger',
  USER_UNBLOCK:        'success',
  USER_CREATE:         'info',
  USER_RESET_PASSWORD: 'warning',
  POST_EXPORT:         'warning',
  POST_ASSIGN:         'info',
  POST_ESTADO_CHANGE:  'default',
  SESSION_REVOKE:      'danger',
};

function accionVariant(accion: string) {
  return ACCION_VARIANT[accion] ?? 'secondary';
}

function accionLabel(accion: string) {
  return accion.replace(/_/g, ' ').toLowerCase();
}

export default function AuditPage() {
  const [logs, setLogs]             = useState<AuditLog[]>([]);
  const [stats, setStats]           = useState<AuditStats | null>(null);
  const [pagination, setPagination] = useState<Pagination>({ total: 0, page: 1, limit: 25, pages: 1 });
  const [loading, setLoading]       = useState(true);
  const [acciones, setAcciones]     = useState<string[]>([]);
  const [selected, setSelected]     = useState<AuditLog | null>(null);
  const [page, setPage]             = useState(1);

  const [filters, setFilters] = useState({ search: '', accion: '', entidad_tipo: '', desde: '', hasta: '' });
  const [applied, setApplied] = useState(filters);
  const [sortBy,  setSortBy]  = useState('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const isMount               = useRef(true);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25', sortBy, sortDir });
      if (applied.search)       params.set('search',       applied.search);
      if (applied.accion)       params.set('accion',       applied.accion);
      if (applied.entidad_tipo) params.set('entidad_tipo', applied.entidad_tipo);
      if (applied.desde)        params.set('desde',        applied.desde);
      if (applied.hasta)        params.set('hasta',        applied.hasta);

      const res = await api.get(`/audit?${params}`);
      setLogs(res.data.data);
      setPagination(res.data.pagination);
    } finally {
      setLoading(false);
    }
  }, [page, applied, sortBy, sortDir]);

  function handleSort(col: string) {
    if (sortBy === col) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); }
    else { setSortBy(col); setSortDir('asc'); }
    setPage(1);
  }

  function SortIcon({ col }: { col: string }) {
    if (sortBy !== col) return <ChevronsUpDown className="w-3 h-3 ml-1 text-stone-300 inline" />;
    return sortDir === 'asc'
      ? <ChevronUp   className="w-3 h-3 ml-1 text-agro-600 inline" />
      : <ChevronDown className="w-3 h-3 ml-1 text-agro-600 inline" />;
  }

  const fetchStats = useCallback(async () => {
    const res = await api.get('/audit/stats');
    setStats(res.data.data);
  }, []);

  const fetchAcciones = useCallback(async () => {
    const res = await api.get('/audit/acciones');
    setAcciones(res.data.data);
  }, []);

  useEffect(() => {
    fetchLogs();
    fetchStats();
    fetchAcciones();
  }, [fetchLogs, fetchStats, fetchAcciones]);

  // Filtros reactivos: texto con debounce 350ms, selects/fechas inmediatos
  useEffect(() => {
    if (isMount.current) { isMount.current = false; return; }
    const t = setTimeout(() => {
      setApplied(prev => ({ ...prev, search: filters.search }));
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [filters.search]);

  useEffect(() => {
    if (isMount.current) return;
    setApplied(prev => ({ ...prev, accion: filters.accion, entidad_tipo: filters.entidad_tipo, desde: filters.desde, hasta: filters.hasta }));
    setPage(1);
  }, [filters.accion, filters.entidad_tipo, filters.desde, filters.hasta]);

  function clearFilters() {
    const empty = { search: '', accion: '', entidad_tipo: '', desde: '', hasta: '' };
    setFilters(empty); setApplied(empty); setPage(1);
  }
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold text-stone-800 flex items-center gap-2">
            <Shield className="w-6 h-6 text-agro-600" /> Auditoría del Sistema
          </h1>
          <p className="text-stone-400 text-sm mt-0.5">Historial inmutable de toda la actividad</p>
        </div>
        <button onClick={() => { fetchLogs(); fetchStats(); }} className="btn-secondary py-2 px-3">
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <Tabs defaultValue="logs">
        <TabsList>
          <TabsTrigger value="logs">Registro de eventos</TabsTrigger>
          <TabsTrigger value="stats">Estadísticas</TabsTrigger>
        </TabsList>

        {/* ── TAB: LOGS ─────────────────────────────── */}
        <TabsContent value="logs">
          {/* Filtros */}
          <div className="card p-4 mb-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <input
                  className="input pl-9 py-2.5 text-sm"
                  placeholder="Buscar usuario o acción..."
                  value={filters.search}
                  onChange={e => setFilters(p => ({ ...p, search: e.target.value }))}
                />
              </div>
              <select
                className="input py-2.5 text-sm"
                value={filters.accion}
                onChange={e => setFilters(p => ({ ...p, accion: e.target.value }))}
              >
                <option value="">Todas las acciones</option>
                {acciones.map(a => <option key={a} value={a}>{accionLabel(a)}</option>)}
              </select>
              <select
                className="input py-2.5 text-sm"
                value={filters.entidad_tipo}
                onChange={e => setFilters(p => ({ ...p, entidad_tipo: e.target.value }))}
              >
                <option value="">Todos los tipos</option>
                {['usuario', 'postulante', 'llamada', 'campana', 'session'].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <input
                type="date"
                className="input py-2.5 text-sm"
                value={filters.desde}
                onChange={e => setFilters(p => ({ ...p, desde: e.target.value }))}
              />
              <input
                type="date"
                className="input py-2.5 text-sm"
                value={filters.hasta}
                onChange={e => setFilters(p => ({ ...p, hasta: e.target.value }))}
              />
            </div>
            {hasFilters && (
              <div className="mt-3">
                <button onClick={clearFilters} className="btn-secondary text-sm py-2 px-4">
                  <X className="w-3.5 h-3.5" /> Limpiar filtros
                </button>
              </div>
            )}
          </div>

          {/* Tabla */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-stone-50 border-b border-stone-100">
                  <tr>
                    {([
                      ['Fecha',    'created_at',     ''],
                      ['Usuario',  'usuario_nombre', ''],
                      ['Acción',   'accion',         ''],
                      ['Entidad',  'entidad_tipo',   'hidden md:table-cell'],
                      ['IP',       '',               'hidden lg:table-cell'],
                      ['Detalle',  '',               ''],
                    ] as [string, string, string][]).map(([label, col, hideCls]) => (
                      <th key={label}
                        className={`px-4 py-3 text-left text-xs font-semibold text-stone-500 whitespace-nowrap
                          ${col ? 'cursor-pointer select-none hover:text-agro-700 hover:bg-stone-100 transition-colors' : ''}
                          ${hideCls}`}
                        onClick={() => col && handleSort(col)}
                      >
                        {label}{col && <SortIcon col={col} />}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {loading ? (
                    Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 6 }).map((_, j) => (
                          <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-28" /></td>
                        ))}
                      </tr>
                    ))
                  ) : logs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-stone-400">
                        No se encontraron registros
                      </td>
                    </tr>
                  ) : logs.map(log => (
                    <tr key={log.id} className="hover:bg-stone-50 transition-colors">
                      <td className="px-4 py-3 text-stone-400 text-xs whitespace-nowrap font-mono">
                        {fmtFechaHora(log.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-stone-800 font-medium text-xs">{log.usuario_nombre ?? '—'}</p>
                        <p className="text-stone-400 text-xs">{log.usuario_email ?? ''}</p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={accionVariant(log.accion)}>
                          {accionLabel(log.accion)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-stone-500 text-xs hidden md:table-cell">
                        {log.entidad_tipo ? `${log.entidad_tipo} #${log.entidad_id}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-stone-400 text-xs font-mono hidden lg:table-cell">
                        {log.ip_address ?? '—'}
                      </td>
                      <td className="px-4 py-3">
                        {(log.valores_anteriores || log.valores_nuevos || log.metadata) && (
                          <button
                            onClick={() => setSelected(log)}
                            className="p-1.5 rounded-lg hover:bg-agro-50 text-agro-600 transition-colors"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Paginación */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-stone-100">
              <p className="text-xs text-stone-400">
                {pagination.total.toLocaleString()} eventos totales
              </p>
              <div className="flex gap-1">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 rounded-lg hover:bg-stone-100 disabled:opacity-30 transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-3 py-2 text-xs text-stone-600">
                  {page} / {pagination.pages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                  disabled={page === pagination.pages}
                  className="p-2 rounded-lg hover:bg-stone-100 disabled:opacity-30 transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ── TAB: STATS ────────────────────────────── */}
        <TabsContent value="stats">
          {stats && (
            <div className="space-y-6">
              {/* KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {[
                  { label: 'Total eventos',    value: stats.totales.total,          color: 'text-stone-800' },
                  { label: 'Hoy',              value: stats.totales.hoy,            color: 'text-agro-700' },
                  { label: 'Esta semana',      value: stats.totales.semana,         color: 'text-blue-700' },
                  { label: 'Login fallidos',   value: stats.totales.login_fallidos, color: 'text-red-600' },
                  { label: 'Exportaciones',    value: stats.totales.exportaciones,  color: 'text-earth-700' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="card p-4 text-center">
                    <p className="text-stone-400 text-xs mb-1">{label}</p>
                    <p className={`text-2xl font-bold font-mono ${color}`}>{value}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Por acción */}
                <div className="card p-5">
                  <h3 className="font-semibold text-stone-700 mb-4">Top acciones (30 días)</h3>
                  <div className="space-y-2">
                    {stats.porAccion.map(({ accion, cantidad }) => (
                      <div key={accion} className="flex items-center justify-between">
                        <Badge variant={accionVariant(accion)}>{accionLabel(accion)}</Badge>
                        <span className="text-sm font-mono font-semibold text-stone-700">{cantidad}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Por usuario */}
                <div className="card p-5">
                  <h3 className="font-semibold text-stone-700 mb-4">Usuarios más activos (7 días)</h3>
                  <div className="space-y-2">
                    {stats.porUsuario.map(({ usuario_nombre, cantidad }) => (
                      <div key={usuario_nombre} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-agro-100 flex items-center justify-center text-agro-700 text-xs font-bold">
                            {usuario_nombre?.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm text-stone-700">{usuario_nombre}</span>
                        </div>
                        <span className="text-sm font-mono font-semibold text-stone-700">{cantidad} eventos</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Dialog: Detalle del log */}
      <Dialog open={!!selected} onOpenChange={open => !open && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalle del evento #{selected?.id}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {selected && (
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ['Acción',   accionLabel(selected.accion)],
                    ['Usuario',  selected.usuario_nombre ?? '—'],
                    ['IP',       selected.ip_address ?? '—'],
                    ['Fecha',    fmtFechaHora(selected.created_at)],
                  ].map(([k, v]) => (
                    <div key={k} className="bg-stone-50 rounded-xl px-4 py-2.5">
                      <p className="text-xs text-stone-400">{k}</p>
                      <p className="font-medium text-stone-700 mt-0.5 font-mono text-xs">{String(v)}</p>
                    </div>
                  ))}
                </div>
                {selected.valores_anteriores && (
                  <div>
                    <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Valores anteriores</p>
                    <pre className="bg-red-50 border border-red-100 rounded-xl p-3 text-xs overflow-x-auto text-red-800">
                      {JSON.stringify(selected.valores_anteriores, null, 2)}
                    </pre>
                  </div>
                )}
                {selected.valores_nuevos && (
                  <div>
                    <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Valores nuevos</p>
                    <pre className="bg-agro-50 border border-agro-100 rounded-xl p-3 text-xs overflow-x-auto text-agro-800">
                      {JSON.stringify(selected.valores_nuevos, null, 2)}
                    </pre>
                  </div>
                )}
                {selected.metadata && (
                  <div>
                    <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">Metadata</p>
                    <pre className="bg-stone-50 border border-stone-100 rounded-xl p-3 text-xs overflow-x-auto text-stone-700">
                      {JSON.stringify(selected.metadata, null, 2)}
                    </pre>
                  </div>
                )}
                {selected.user_agent && (
                  <div>
                    <p className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">User Agent</p>
                    <p className="text-xs text-stone-500 font-mono break-all">{selected.user_agent}</p>
                  </div>
                )}
              </div>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}
