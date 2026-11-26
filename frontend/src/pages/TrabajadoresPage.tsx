import { useState, useEffect, useCallback, useRef } from 'react';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { fmtFecha } from '@/utils/dates';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import {
  Search, X, ChevronLeft, ChevronRight,
  RefreshCw, UserMinus, UserPlus,
  Briefcase, TrendingDown, ArrowUpCircle,
  FileSpreadsheet, Download, CheckCircle2, AlertCircle, Upload, Trash2,
} from 'lucide-react';
import api from '@/services/api';
import { usePermission } from '@/hooks/usePermission';

interface Trabajador {
  id: number;
  nombres: string;
  apellidos: string;
  dni: string;
  celular: string;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  centro_poblado: string | null;
  fecha_ingreso: string;
  fecha_cese: string | null;
  estado: 'Activo' | 'Baja' | 'Reingreso';
  contrata_nombre: string | null;
  campana_nombre: string | null;
}

interface Stats {
  total: number;
  activos: number;
  bajas: number;
  reingresos: number;
  ingresos_semana: number;
  ingresos_mes: number;
}

interface Pagination { total: number; page: number; limit: number; pages: number; }

// "KELLY PAOLA GARCIA BANCES" → "KELLY GARCIA"
function nombreCorto(full: string | null): string {
  if (!full) return '—';
  const parts = full.trim().split(/\s+/);
  if (parts.length <= 2) return full;
  return `${parts[0]} ${parts[Math.floor(parts.length / 2)]}`;
}

const ESTADO_BADGE = {
  Activo:    'bg-teal-100 text-teal-700',
  Baja:      'bg-red-100 text-red-600',
  Reingreso: 'bg-purple-100 text-purple-700',
};

const MOTIVOS_BAJA = ['Renuncia','Fin de contrato','Abandono','Falta grave','Accidente','Enfermedad','Otro'];

export default function TrabajadoresPage() {
  const [data, setData]             = useState<Trabajador[]>([]);
  const [stats, setStats]           = useState<Stats | null>(null);
  const [pagination, setPagination] = useState<Pagination>({ total: 0, page: 1, limit: 20, pages: 1 });
  const [loading, setLoading]       = useState(true);
  const [page, setPage]             = useState(1);
  const [filters, setFilters] = useState({ search: '', estado: '', desde: '', hasta: '' });
  const [applied, setApplied] = useState(filters);
  const [exportando, setExportando] = useState(false);
  const [sortBy,  setSortBy]  = useState('fecha_ingreso');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const isMount               = useRef(true);
  const isMount3              = useRef(true);

  // Modal baja individual
  const [selectedTrab, setSelectedTrab] = useState<Trabajador | null>(null);
  const [showBajaModal, setShowBajaModal] = useState(false);
  const [fechaBaja, setFechaBaja]         = useState('');
  const [motivoBaja, setMotivoBaja]       = useState('');
  const [obseBaja, setObseBaja]           = useState('');
  const [guardandoBaja, setGuardandoBaja] = useState(false);
  const [msgBaja, setMsgBaja]             = useState('');

  // Modal importar ingresos Excel
  const [showImport, setShowImport]     = useState(false);
  const [importFile, setImportFile]     = useState<File | null>(null);
  const [importando, setImportando]     = useState(false);
  const [importResult, setImportResult] = useState<{
    summary: { registrados: number; reingresos: number; duplicados: number; noEncontrados: number; errores: number; total: number };
    rows: Array<{ fila: number; dni: string; nombre: string; estado: string; mensaje?: string }>;
  } | null>(null);

  // Modal importar bajas Excel
  const [showImportBajas, setShowImportBajas]     = useState(false);
  const [importBajaFile, setImportBajaFile]         = useState<File | null>(null);
  const [importandoBaja, setImportandoBaja]         = useState(false);
  const [importBajaResult, setImportBajaResult]     = useState<{
    summary: { procesados: number; yaEnBaja: number; noEncontrados: number; errores: number; total: number };
    rows: Array<{ fila: number; dni: string; nombre: string; estado: string; mensaje?: string }>;
  } | null>(null);

  // Modal importar activos Excel
  const [showImportActivos, setShowImportActivos]   = useState(false);
  const [importActivosFile, setImportActivosFile]   = useState<File | null>(null);
  const [importandoActivos, setImportandoActivos]   = useState(false);
  const [importActivosResult, setImportActivosResult] = useState<{
    summary: { registrados: number; actualizados: number; reingresos: number; duplicados: number; enBlacklist: number; errores: number; total: number };
    rows: Array<{ fila: number; dni: string; nombre: string; estado: string; mensaje?: string }>;
  } | null>(null);

  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  function flash(type: 'ok' | 'err', text: string) {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4000);
  }

  const canManageBajas = usePermission('bajas.manage');
  const canDeleteTrab  = usePermission('trabajadores.delete');

  // Eliminar trabajador
  const [confirmDelTrab, setConfirmDelTrab] = useState<Trabajador | null>(null);
  const [eliminandoTrab, setEliminandoTrab] = useState(false);

  async function handleDeleteTrab() {
    if (!confirmDelTrab) return;
    setEliminandoTrab(true);
    try {
      await api.delete(`/trabajadores/${confirmDelTrab.id}`);
      setData(prev => prev.filter(x => x.id !== confirmDelTrab.id));
      setPagination(prev => ({ ...prev, total: Math.max(0, prev.total - 1) }));
      setConfirmDelTrab(null);
      flash('ok', 'Trabajador eliminado correctamente');
      fetchStats();
    } catch (e: any) {
      flash('err', e?.response?.data?.message || 'Error al eliminar el trabajador');
    } finally {
      setEliminandoTrab(false);
    }
  }

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20', sortBy, sortDir });
      if (applied.search) params.set('search', applied.search);
      if (applied.estado) params.set('estado', applied.estado);
      if (applied.desde)  params.set('desde',  applied.desde);
      if (applied.hasta)  params.set('hasta',  applied.hasta);
      const res = await api.get(`/trabajadores?${params}`);
      setData(res.data.data);
      setPagination(res.data.pagination);
    } catch {
      setMsg({ type: 'err', text: 'Error al cargar trabajadores. Intenta de nuevo.' });
      setTimeout(() => setMsg(null), 4000);
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

  async function fetchStats() {
    try {
      const res = await api.get('/trabajadores/stats');
      setStats(res.data.data);
    } catch {}
  }

  useEffect(() => { fetchData(); fetchStats(); }, [fetchData]);
  useAutoRefresh(fetchData, 30_000);

  useEffect(() => {
    if (isMount.current) { isMount.current = false; return; }
    const t = setTimeout(() => {
      setApplied(prev => ({ ...prev, search: filters.search }));
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [filters.search]);

  useEffect(() => {
    if (isMount3.current) { isMount3.current = false; return; }
    setApplied(prev => ({ ...prev, estado: filters.estado, desde: filters.desde, hasta: filters.hasta }));
    setPage(1);
  }, [filters.estado, filters.desde, filters.hasta]);

  function clearFilters() {
    const empty = { search: '', estado: '', desde: '', hasta: '' };
    setFilters(empty); setApplied(empty); setPage(1);
  }

  function openBaja(t: Trabajador) {
    setSelectedTrab(t);
    setFechaBaja(new Date().toISOString().split('T')[0]);
    setMotivoBaja(''); setObseBaja(''); setMsgBaja('');
    setShowBajaModal(true);
  }

  async function handleBaja() {
    if (!selectedTrab || !fechaBaja || !motivoBaja) return;
    setGuardandoBaja(true); setMsgBaja('');
    try {
      await api.post(`/trabajadores/${selectedTrab.id}/baja`, {
        fecha_baja: fechaBaja, motivo: motivoBaja, observacion: obseBaja,
      });
      setMsgBaja('Baja registrada correctamente');
      setTimeout(() => { setShowBajaModal(false); fetchData(); fetchStats(); }, 1000);
    } catch (e: any) {
      setMsgBaja(e?.response?.data?.message || 'Error al registrar baja');
    } finally {
      setGuardandoBaja(false);
    }
  }

  // ── Ingresos Excel ────────────────────────────────────────────
  async function handleImportar() {
    if (!importFile) return;
    setImportando(true); setImportResult(null);
    try {
      const form = new FormData();
      form.append('archivo', importFile);
      const res = await api.post('/import/trabajadores-excel', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImportResult(res.data);
      fetchData(); fetchStats();
    } catch (e: any) {
      setImportResult({
        summary: { registrados: 0, reingresos: 0, duplicados: 0, noEncontrados: 0, errores: 1, total: 0 } as any,
        rows: [{ fila: 0, dni: '', nombre: '', estado: 'error', mensaje: e?.response?.data?.message || 'Error al procesar archivo' }],
      });
    } finally {
      setImportando(false);
    }
  }

  async function descargarPlantillaIngresos() {
    try {
      const res = await api.get('/import/plantilla-trabajadores', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a   = document.createElement('a');
      a.href = url; a.download = 'plantilla_ingreso_trabajadores.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      flash('err', e?.response?.data?.message || 'Error al descargar la plantilla de ingresos.');
    }
  }

  // ── Bajas Excel ───────────────────────────────────────────────
  async function handleImportarBajas() {
    if (!importBajaFile) return;
    setImportandoBaja(true); setImportBajaResult(null);
    try {
      const form = new FormData();
      form.append('archivo', importBajaFile);
      const res = await api.post('/import/bajas-excel', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImportBajaResult(res.data);
      fetchData(); fetchStats();
    } catch (e: any) {
      setImportBajaResult({
        summary: { procesados: 0, yaEnBaja: 0, noEncontrados: 0, errores: 1, total: 0 },
        rows: [{ fila: 0, dni: '', nombre: '', estado: 'error', mensaje: e?.response?.data?.message || 'Error al procesar archivo' }],
      });
    } finally {
      setImportandoBaja(false);
    }
  }

  async function descargarPlantillaBajas() {
    try {
      const res = await api.get('/import/plantilla-bajas', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a   = document.createElement('a');
      a.href = url; a.download = 'plantilla_baja_trabajadores.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      flash('err', e?.response?.data?.message || 'Error al descargar la plantilla de bajas.');
    }
  }

  // ── Activos Excel ─────────────────────────────────────────────
  async function handleImportarActivos() {
    if (!importActivosFile) return;
    setImportandoActivos(true); setImportActivosResult(null);
    try {
      const form = new FormData();
      form.append('archivo', importActivosFile);
      const res = await api.post('/import/activos-excel', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImportActivosResult(res.data);
      fetchData(); fetchStats();
    } catch (e: any) {
      setImportActivosResult({
        summary: { registrados: 0, actualizados: 0, reingresos: 0, duplicados: 0, enBlacklist: 0, errores: 1, total: 0 },
        rows: [{ fila: 0, dni: '', nombre: '', estado: 'error', mensaje: e?.response?.data?.message || 'Error al procesar archivo' }],
      });
    } finally {
      setImportandoActivos(false);
    }
  }

  async function descargarPlantillaActivos() {
    try {
      const res = await api.get('/import/plantilla-activos', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a   = document.createElement('a');
      a.href = url; a.download = 'plantilla_personal_activo.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      flash('err', e?.response?.data?.message || 'Error al descargar la plantilla de activos.');
    }
  }

  const hasFilters = Object.values(filters).some(Boolean);

  async function handleExport() {
    setExportando(true);
    try {
      const qs = new URLSearchParams();
      if (applied.estado) qs.set('estado', applied.estado);
      if (applied.desde)  qs.set('desde',  applied.desde);
      if (applied.hasta)  qs.set('hasta',  applied.hasta);
      const res = await api.get(`/trabajadores/export?${qs}`, { responseType: 'blob' });
      const url  = URL.createObjectURL(res.data);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `trabajadores_${new Date().toISOString().split('T')[0]}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // error silencioso — el usuario verá que no se descargó
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-stone-800">Trabajadores</h1>
          <p className="text-stone-400 text-sm">{pagination.total.toLocaleString()} registros totales</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => { fetchData(); fetchStats(); }} className="btn-secondary py-2 px-3">
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleExport}
            disabled={exportando}
            title="Descargar Excel con datos de ficha (banco, tallas, correo, contacto emergencia)"
            className="btn-secondary text-sm py-2.5 gap-1.5 text-emerald-700 border-emerald-200 hover:bg-emerald-50 disabled:opacity-60"
          >
            {exportando
              ? <span className="w-4 h-4 border-2 border-emerald-300 border-t-emerald-700 rounded-full animate-spin" />
              : <Download className="w-4 h-4" />
            }
            Exportar fichas
          </button>
          {canManageBajas && (
            <>
              <button
                onClick={() => { setShowImportBajas(true); setImportBajaFile(null); setImportBajaResult(null); }}
                className="btn-secondary text-sm py-2.5 border-red-200 text-red-600 hover:bg-red-50"
              >
                <TrendingDown className="w-4 h-4" /> Importar Bajas
              </button>
              <button
                onClick={() => { setShowImportActivos(true); setImportActivosFile(null); setImportActivosResult(null); }}
                className="btn-secondary text-sm py-2.5 border-forest-600 text-forest-700 hover:bg-forest-50"
              >
                <UserPlus className="w-4 h-4" /> Importar Activos
              </button>
              <button
                onClick={() => { setShowImport(true); setImportFile(null); setImportResult(null); }}
                className="btn-primary text-sm py-2.5"
              >
                <FileSpreadsheet className="w-4 h-4" /> Importar Ingresos
              </button>
            </>
          )}
        </div>
      </div>

      {/* Flash */}
      {msg && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium ${
          msg.type === 'ok'
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {msg.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {msg.text}
        </div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: 'Total',       value: stats.total,          icon: Briefcase,     cls: 'bg-stone-50   text-stone-700' },
            { label: 'Activos',     value: stats.activos,         icon: Briefcase,     cls: 'bg-teal-50    text-teal-700'  },
            { label: 'Bajas',       value: stats.bajas,           icon: TrendingDown,  cls: 'bg-red-50     text-red-600'   },
            { label: 'Reingresos',  value: stats.reingresos,      icon: ArrowUpCircle, cls: 'bg-purple-50  text-purple-600'},
            { label: 'Esta semana', value: stats.ingresos_semana, icon: UserPlus,      cls: 'bg-agro-50    text-agro-700'  },
            { label: 'Este mes',    value: stats.ingresos_mes,    icon: UserPlus,      cls: 'bg-blue-50    text-blue-600'  },
          ].map(({ label, value, icon: Icon, cls }) => (
            <div key={label} className="rounded-2xl border border-stone-100 p-3 flex items-center gap-2.5 bg-white">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${cls}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-xl font-bold font-mono leading-none text-stone-800">{value}</p>
                <p className="text-[10px] text-stone-400 mt-0.5">{label}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="card p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
            <input className="input pl-9 py-2.5 text-sm" placeholder="Nombre o DNI..."
              value={filters.search} onChange={e => setFilters(p => ({ ...p, search: e.target.value }))} />
          </div>
          <select className="input py-2.5 text-sm" value={filters.estado}
            onChange={e => setFilters(p => ({ ...p, estado: e.target.value }))}>
            <option value="">Todos los estados</option>
            <option>Activo</option><option>Baja</option><option>Reingreso</option>
          </select>
          <input type="date" className="input py-2.5 text-sm" value={filters.desde}
            onChange={e => setFilters(p => ({ ...p, desde: e.target.value }))} />
          <input type="date" className="input py-2.5 text-sm" value={filters.hasta}
            onChange={e => setFilters(p => ({ ...p, hasta: e.target.value }))} />
        </div>
        {hasFilters && (
          <div className="mt-3">
            <button onClick={clearFilters} className="btn-secondary text-sm py-2 px-4">
              <X className="w-3.5 h-3.5" /> Limpiar filtros
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm table-fixed">
          <colgroup>
            <col className="w-[20%]" />                          {/* Nombre */}
            <col className="w-[9%]" />                           {/* DNI */}
            <col className="hidden lg:table-column w-[9%]" />    {/* Celular */}
            <col className="hidden md:table-column w-[9%]" />    {/* Ubicación */}
            <col className="hidden sm:table-column w-[9%]" />    {/* Ingreso */}
            <col className="hidden xl:table-column w-[8%]" />    {/* Cese */}
            <col className="w-[9%]" />                           {/* Estado */}
            <col className="hidden lg:table-column w-[12%]" />   {/* Contrata */}
            <col className="hidden xl:table-column w-[9%]" />    {/* Campaña */}
            <col className="w-[6%]" />                           {/* Acciones */}
          </colgroup>
          <thead className="bg-stone-50 border-b border-stone-100">
            <tr>
              {([
                ['Nombre',    'nombres',       ''],
                ['DNI',       'dni',           ''],
                ['Celular',   'celular',       'hidden lg:table-cell'],
                ['Ubicación', '',              'hidden md:table-cell'],
                ['Ingreso',   'fecha_ingreso', 'hidden sm:table-cell'],
                ['Cese',      'fecha_cese',    'hidden xl:table-cell'],
                ['Estado',    'estado',        ''],
                ['Contrata',  'contrata',      'hidden lg:table-cell'],
                ['Campaña',   'campana',       'hidden xl:table-cell'],
                ['Acciones',  '',              ''],
              ] as [string, string, string][]).map(([label, col, cls]) => (
                <th key={label}
                  className={`px-4 py-3 text-left text-xs font-semibold text-stone-500 ${cls}
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
                  {['', '', 'hidden lg:table-cell', 'hidden md:table-cell', 'hidden sm:table-cell',
                    'hidden xl:table-cell', '', 'hidden lg:table-cell', 'hidden xl:table-cell', ''].map((cls, j) => (
                    <td key={j} className={`px-4 py-3 ${cls}`}><div className="h-4 bg-stone-100 rounded w-full" /></td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-stone-400">
                  No se encontraron trabajadores
                </td>
              </tr>
            ) : data.map(t => (
              <tr key={t.id} className="hover:bg-stone-50 transition-colors">
                <td className="px-4 py-3 font-medium text-stone-800 truncate">
                  {t.nombres} {t.apellidos}
                </td>
                <td className="px-4 py-3 font-mono text-xs">{t.dni}</td>
                <td className="px-4 py-3 text-stone-600 text-xs hidden lg:table-cell">{t.celular}</td>
                <td className="px-4 py-3 text-stone-500 text-xs truncate hidden md:table-cell">
                  {t.distrito || '—'}
                </td>
                <td className="px-4 py-3 text-stone-600 text-xs hidden sm:table-cell">
                  {fmtFecha(t.fecha_ingreso)}
                </td>
                <td className="px-4 py-3 text-stone-400 text-xs hidden xl:table-cell">
                  {t.fecha_cese ? fmtFecha(t.fecha_cese) : '—'}
                </td>
                <td className="px-4 py-3">
                  <span className={`badge ${ESTADO_BADGE[t.estado]}`}>{t.estado}</span>
                </td>
                <td className="px-4 py-3 text-stone-500 text-xs truncate hidden lg:table-cell">
                  {nombreCorto(t.contrata_nombre)}
                </td>
                <td className="px-4 py-3 text-stone-500 text-xs truncate hidden xl:table-cell">
                  {t.campana_nombre || '—'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    {canManageBajas && (t.estado === 'Activo' || t.estado === 'Reingreso') && (
                      <button
                        onClick={() => openBaja(t)}
                        title="Registrar baja"
                        className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors"
                      >
                        <UserMinus className="w-4 h-4" />
                      </button>
                    )}
                    {canDeleteTrab && (
                      <button
                        onClick={() => setConfirmDelTrab(t)}
                        title="Eliminar trabajador"
                        className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors"
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
          <p className="text-xs text-stone-400">{pagination.total} trabajadores</p>
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

      {/* Modal Baja individual */}
      {showBajaModal && selectedTrab && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && !guardandoBaja && setShowBajaModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-slide-up">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center">
                <UserMinus className="w-4 h-4 text-red-600" />
              </div>
              <div>
                <h2 className="font-bold text-stone-800">Registrar baja</h2>
                <p className="text-xs text-stone-400">{selectedTrab.nombres} {selectedTrab.apellidos} · {selectedTrab.dni}</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="label text-xs">Fecha de baja *</label>
                <input type="date" className="input text-sm" value={fechaBaja}
                  onChange={e => setFechaBaja(e.target.value)} />
              </div>
              <div>
                <label className="label text-xs">Motivo *</label>
                <select className="input text-sm" value={motivoBaja}
                  onChange={e => setMotivoBaja(e.target.value)}>
                  <option value="">Seleccionar motivo...</option>
                  {MOTIVOS_BAJA.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="label text-xs">Observación (opcional)</label>
                <textarea className="input text-sm resize-none h-20" value={obseBaja}
                  onChange={e => setObseBaja(e.target.value)} placeholder="Detalles adicionales..." />
              </div>
              {msgBaja && (
                <p className={`text-sm text-center font-medium ${msgBaja.includes('Error') ? 'text-red-500' : 'text-teal-600'}`}>
                  {msgBaja}
                </p>
              )}
              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowBajaModal(false)} disabled={guardandoBaja} className="btn-secondary flex-1 py-2.5 text-sm">Cancelar</button>
                <button onClick={handleBaja} disabled={!fechaBaja || !motivoBaja || guardandoBaja}
                  className="flex-1 py-2.5 text-sm font-semibold rounded-xl bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors">
                  {guardandoBaja ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block" /> : 'Confirmar baja'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Importar Ingresos Excel */}
      {showImport && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && !importando && setShowImport(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 animate-slide-up max-h-[90vh] flex flex-col">
            <div className="flex items-center gap-3 mb-5 flex-shrink-0">
              <div className="w-9 h-9 bg-teal-100 rounded-xl flex items-center justify-center">
                <Upload className="w-4 h-4 text-teal-700" />
              </div>
              <div className="flex-1">
                <h2 className="font-bold text-stone-800">Importar ingresos desde Excel</h2>
                <p className="text-xs text-stone-400">Sube un Excel con DNIs — se crean automáticamente como trabajadores</p>
              </div>
              <button onClick={() => setShowImport(false)} disabled={importando}
                className="p-1.5 hover:bg-stone-100 rounded-lg transition-colors text-stone-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4">
              <div className="bg-stone-50 rounded-xl p-4 text-xs text-stone-600 space-y-1.5">
                <p className="font-semibold text-stone-700 mb-2">¿Cómo funciona?</p>
                <p>1. Sube un Excel con una columna <strong>DNI</strong> (y opcionalmente <strong>Fecha Ingreso</strong>)</p>
                <p>2. El sistema busca cada DNI en postulantes</p>
                <p>3. Si lo encuentra → lo registra como trabajador y lo marca como <strong>Ingresó</strong></p>
                <p>4. Si estaba en Baja → lo registra como <strong>Reingreso</strong> automáticamente</p>
                <p>5. Si no está en postulantes → se omite (aparece como "No hallado")</p>
              </div>

              <button onClick={descargarPlantillaIngresos}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-stone-300 text-stone-500 text-sm hover:border-teal-400 hover:text-teal-600 hover:bg-teal-50 transition-colors">
                <Download className="w-4 h-4" />
                Descargar plantilla Excel
              </button>

              <label className={`flex flex-col items-center justify-center gap-2 w-full py-8 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
                importFile ? 'border-teal-400 bg-teal-50' : 'border-stone-200 hover:border-agro-400 hover:bg-agro-50'
              }`}>
                <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
                  onChange={e => { setImportFile(e.target.files?.[0] || null); setImportResult(null); }} />
                {importFile ? (
                  <>
                    <CheckCircle2 className="w-8 h-8 text-teal-500" />
                    <p className="text-sm font-semibold text-teal-700">{importFile.name}</p>
                    <p className="text-xs text-teal-500">{(importFile.size / 1024).toFixed(1)} KB — clic para cambiar</p>
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="w-8 h-8 text-stone-300" />
                    <p className="text-sm text-stone-500 font-medium">Arrastra tu Excel aquí o haz clic</p>
                    <p className="text-xs text-stone-400">.xlsx · .xls · .csv — máximo 10 MB</p>
                  </>
                )}
              </label>

              {importResult && (
                <div className="space-y-3">
                  <div className="grid grid-cols-5 gap-2">
                    {[
                      { label: 'Registrados', value: importResult.summary.registrados,   cls: 'bg-teal-50 text-teal-700' },
                      { label: 'Reingresos',  value: importResult.summary.reingresos,    cls: 'bg-purple-50 text-purple-700' },
                      { label: 'Duplicados',  value: importResult.summary.duplicados,    cls: 'bg-amber-50 text-amber-700' },
                      { label: 'No hallados', value: importResult.summary.noEncontrados, cls: 'bg-stone-100 text-stone-500' },
                      { label: 'Errores',     value: importResult.summary.errores,       cls: 'bg-red-50 text-red-600' },
                    ].map(({ label, value, cls }) => (
                      <div key={label} className={`rounded-xl p-3 text-center ${cls}`}>
                        <p className="text-xl font-bold font-mono">{value}</p>
                        <p className="text-[10px] font-medium mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>

                  {importResult.rows.length > 0 && (
                    <div className="border border-stone-100 rounded-xl overflow-hidden">
                      <div className="max-h-48 overflow-y-auto overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-stone-50 sticky top-0">
                            <tr>
                              <th className="px-3 py-2 text-left text-stone-500 font-semibold">Fila</th>
                              <th className="px-3 py-2 text-left text-stone-500 font-semibold">DNI</th>
                              <th className="px-3 py-2 text-left text-stone-500 font-semibold">Nombre</th>
                              <th className="px-3 py-2 text-left text-stone-500 font-semibold">Resultado</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-50">
                            {importResult.rows.map((r, i) => (
                              <tr key={i} className="hover:bg-stone-50">
                                <td className="px-3 py-1.5 text-stone-400">{r.fila}</td>
                                <td className="px-3 py-1.5 font-mono">{r.dni}</td>
                                <td className="px-3 py-1.5 text-stone-600 truncate max-w-[120px]">{r.nombre || '—'}</td>
                                <td className="px-3 py-1.5">
                                  {r.estado === 'registrado'    && <span className="text-teal-600 font-medium">✓ Registrado</span>}
                                  {r.estado === 'reingreso'     && <span className="text-purple-600 font-medium">↩ Reingreso</span>}
                                  {r.estado === 'duplicado'     && <span className="text-amber-600">⚠ Duplicado</span>}
                                  {r.estado === 'no_encontrado' && <span className="text-stone-400">— No hallado</span>}
                                  {r.estado === 'error'         && <span className="text-red-500">✗ {r.mensaje}</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-4 flex-shrink-0 border-t border-stone-100 mt-4">
              <button onClick={() => setShowImport(false)} disabled={importando}
                className="btn-secondary flex-1 py-2.5 text-sm">
                {importResult ? 'Cerrar' : 'Cancelar'}
              </button>
              {!importResult && (
                <button onClick={handleImportar} disabled={!importFile || importando}
                  className="btn-primary flex-1 py-2.5 text-sm">
                  {importando
                    ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin inline-block mr-2" />Procesando...</>
                    : <><AlertCircle className="w-4 h-4" />Procesar Excel</>
                  }
                </button>
              )}
              {importResult && importResult.summary.registrados === 0 && importResult.summary.reingresos === 0 && (
                <button onClick={() => { setImportFile(null); setImportResult(null); }}
                  className="btn-primary flex-1 py-2.5 text-sm">
                  Intentar de nuevo
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Importar Bajas Excel */}
      {showImportBajas && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && !importandoBaja && setShowImportBajas(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 animate-slide-up max-h-[90vh] flex flex-col">
            <div className="flex items-center gap-3 mb-5 flex-shrink-0">
              <div className="w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center">
                <TrendingDown className="w-4 h-4 text-red-600" />
              </div>
              <div className="flex-1">
                <h2 className="font-bold text-stone-800">Importar bajas desde Excel</h2>
                <p className="text-xs text-stone-400">Libera masivamente al personal — columnas: DNI + Fecha de Baja</p>
              </div>
              <button onClick={() => setShowImportBajas(false)} disabled={importandoBaja}
                className="p-1.5 hover:bg-stone-100 rounded-lg transition-colors text-stone-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4">
              <div className="bg-red-50 rounded-xl p-4 text-xs text-red-700 space-y-1.5">
                <p className="font-semibold text-red-800 mb-2">¿Cómo funciona?</p>
                <p>1. Sube un Excel con columnas <strong>DNI</strong> y <strong>Fecha de Baja</strong> (DD/MM/AAAA)</p>
                <p>2. Opcionalmente puedes incluir columna <strong>Motivo</strong></p>
                <p>3. El sistema registra la baja y libera al postulante al pool de reclutamiento</p>
                <p>4. Si ya está en Baja → se omite (aparece como "Ya en baja")</p>
              </div>

              <button onClick={descargarPlantillaBajas}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-stone-300 text-stone-500 text-sm hover:border-red-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                <Download className="w-4 h-4" />
                Descargar plantilla Excel
              </button>

              <label className={`flex flex-col items-center justify-center gap-2 w-full py-8 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
                importBajaFile ? 'border-red-400 bg-red-50' : 'border-stone-200 hover:border-red-300 hover:bg-red-50'
              }`}>
                <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
                  onChange={e => { setImportBajaFile(e.target.files?.[0] || null); setImportBajaResult(null); }} />
                {importBajaFile ? (
                  <>
                    <CheckCircle2 className="w-8 h-8 text-red-500" />
                    <p className="text-sm font-semibold text-red-700">{importBajaFile.name}</p>
                    <p className="text-xs text-red-400">{(importBajaFile.size / 1024).toFixed(1)} KB — clic para cambiar</p>
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="w-8 h-8 text-stone-300" />
                    <p className="text-sm text-stone-500 font-medium">Arrastra tu Excel aquí o haz clic</p>
                    <p className="text-xs text-stone-400">.xlsx · .xls · .csv — máximo 10 MB</p>
                  </>
                )}
              </label>

              {importBajaResult && (
                <div className="space-y-3">
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { label: 'Bajas',        value: importBajaResult.summary.procesados,     cls: 'bg-red-50 text-red-700' },
                      { label: 'Ya en baja',   value: importBajaResult.summary.yaEnBaja,       cls: 'bg-amber-50 text-amber-700' },
                      { label: 'No hallados',  value: importBajaResult.summary.noEncontrados,  cls: 'bg-stone-100 text-stone-500' },
                      { label: 'Errores',      value: importBajaResult.summary.errores,        cls: 'bg-red-100 text-red-600' },
                    ].map(({ label, value, cls }) => (
                      <div key={label} className={`rounded-xl p-3 text-center ${cls}`}>
                        <p className="text-xl font-bold font-mono">{value}</p>
                        <p className="text-[10px] font-medium mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>

                  {importBajaResult.rows.length > 0 && (
                    <div className="border border-stone-100 rounded-xl overflow-hidden">
                      <div className="max-h-48 overflow-y-auto overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-stone-50 sticky top-0">
                            <tr>
                              <th className="px-3 py-2 text-left text-stone-500 font-semibold">Fila</th>
                              <th className="px-3 py-2 text-left text-stone-500 font-semibold">DNI</th>
                              <th className="px-3 py-2 text-left text-stone-500 font-semibold">Nombre</th>
                              <th className="px-3 py-2 text-left text-stone-500 font-semibold">Resultado</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-50">
                            {importBajaResult.rows.map((r, i) => (
                              <tr key={i} className="hover:bg-stone-50">
                                <td className="px-3 py-1.5 text-stone-400">{r.fila}</td>
                                <td className="px-3 py-1.5 font-mono">{r.dni}</td>
                                <td className="px-3 py-1.5 text-stone-600 truncate max-w-[120px]">{r.nombre || '—'}</td>
                                <td className="px-3 py-1.5">
                                  {r.estado === 'procesado'     && <span className="text-red-600 font-medium">✓ Baja registrada</span>}
                                  {r.estado === 'ya_en_baja'    && <span className="text-amber-600">⚠ Ya en baja</span>}
                                  {r.estado === 'no_encontrado' && <span className="text-stone-400">— No hallado</span>}
                                  {r.estado === 'error'         && <span className="text-red-500">✗ {r.mensaje}</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-4 flex-shrink-0 border-t border-stone-100 mt-4">
              <button onClick={() => setShowImportBajas(false)} disabled={importandoBaja}
                className="btn-secondary flex-1 py-2.5 text-sm">
                {importBajaResult ? 'Cerrar' : 'Cancelar'}
              </button>
              {!importBajaResult && (
                <button onClick={handleImportarBajas} disabled={!importBajaFile || importandoBaja}
                  className="flex-1 py-2.5 text-sm font-semibold rounded-xl bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                  {importandoBaja
                    ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Procesando...</>
                    : <><Upload className="w-4 h-4" />Procesar bajas</>
                  }
                </button>
              )}
              {importBajaResult && importBajaResult.summary.procesados === 0 && (
                <button onClick={() => { setImportBajaFile(null); setImportBajaResult(null); }}
                  className="btn-secondary flex-1 py-2.5 text-sm">
                  Intentar de nuevo
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Importar Activos Excel */}
      {showImportActivos && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-stone-100 flex-shrink-0">
              <h2 className="font-bold text-stone-800">Importar personal activo desde Excel</h2>
              <p className="text-stone-400 text-xs mt-0.5">
                Carga masiva de trabajadores que ya están activos. No requiere postulante previo.
              </p>
            </div>

            <div className="px-6 py-5 overflow-y-auto flex-1 space-y-4">
              {/* Descargar plantilla */}
              <div className="flex items-start gap-3 p-3 bg-forest-50 border border-forest-100 rounded-xl">
                <FileSpreadsheet className="w-5 h-5 text-forest-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-forest-700">Columnas requeridas</p>
                  <p className="text-xs text-forest-600 mt-0.5">DNI · Nombres · Apellidos · Fecha Ingreso (DD/MM/AAAA)</p>
                </div>
                <button onClick={descargarPlantillaActivos}
                  className="text-xs font-medium text-forest-700 hover:text-forest-800 underline flex-shrink-0">
                  Descargar plantilla
                </button>
              </div>

              {/* Subir archivo */}
              {!importActivosResult && (
                <div>
                  <label className="block text-sm font-medium text-stone-600 mb-1.5">Archivo Excel</label>
                  <input
                    type="file" accept=".xlsx,.xls"
                    onChange={e => setImportActivosFile(e.target.files?.[0] ?? null)}
                    className="block w-full text-sm text-stone-600 file:mr-3 file:py-2 file:px-4
                      file:rounded-lg file:border-0 file:text-sm file:font-medium
                      file:bg-forest-50 file:text-forest-700 hover:file:bg-forest-100
                      border border-stone-200 rounded-xl cursor-pointer"
                  />
                  {importActivosFile && (
                    <p className="text-xs text-stone-400 mt-1">{importActivosFile.name}</p>
                  )}
                </div>
              )}

              {/* Resultado */}
              {importActivosResult && (
                <div className="space-y-3">
                  {/* Resumen */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Registrados',  value: importActivosResult.summary.registrados,  cls: 'bg-teal-50 text-teal-700' },
                      { label: 'Actualizados', value: importActivosResult.summary.actualizados, cls: 'bg-sky-50 text-sky-700' },
                      { label: 'Reingresos',   value: importActivosResult.summary.reingresos,   cls: 'bg-purple-50 text-purple-700' },
                      { label: 'Sin cambios',  value: importActivosResult.summary.duplicados,   cls: 'bg-stone-50 text-stone-500' },
                      { label: 'No apto',      value: importActivosResult.summary.enBlacklist,  cls: 'bg-amber-50 text-amber-700' },
                      { label: 'Errores',      value: importActivosResult.summary.errores,      cls: 'bg-red-50 text-red-600' },
                    ].map(({ label, value, cls }) => (
                      <div key={label} className={`${cls} rounded-xl p-2.5 text-center`}>
                        <p className="text-xl font-bold font-mono">{value}</p>
                        <p className="text-xs font-medium mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Detalle de filas */}
                  {importActivosResult.rows.length > 0 && (
                    <div className="border border-stone-200 rounded-xl overflow-hidden">
                      <div className="overflow-x-auto max-h-52">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-stone-50 border-b border-stone-200">
                              <th className="px-3 py-2 text-left text-stone-500">Fila</th>
                              <th className="px-3 py-2 text-left text-stone-500">DNI</th>
                              <th className="px-3 py-2 text-left text-stone-500">Nombre</th>
                              <th className="px-3 py-2 text-left text-stone-500">Estado</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-100">
                            {importActivosResult.rows.map((r, i) => (
                              <tr key={i} className={
                                r.estado === 'registrado'  ? 'bg-teal-50/50' :
                                r.estado === 'actualizado' ? 'bg-sky-50/50' :
                                r.estado === 'reingreso'   ? 'bg-purple-50/50' :
                                r.estado === 'error' || r.estado === 'blacklist' ? 'bg-red-50/50' : ''
                              }>
                                <td className="px-3 py-1.5 text-stone-500">{r.fila}</td>
                                <td className="px-3 py-1.5 font-mono text-stone-700">{r.dni}</td>
                                <td className="px-3 py-1.5 text-stone-700">{r.nombre || '—'}</td>
                                <td className="px-3 py-1.5">
                                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                    r.estado === 'registrado'  ? 'bg-teal-100 text-teal-700' :
                                    r.estado === 'actualizado' ? 'bg-sky-100 text-sky-700' :
                                    r.estado === 'reingreso'   ? 'bg-purple-100 text-purple-700' :
                                    r.estado === 'duplicado'   ? 'bg-stone-100 text-stone-600' :
                                    r.estado === 'blacklist'   ? 'bg-amber-100 text-amber-700' :
                                    'bg-red-100 text-red-600'
                                  }`}>
                                    {r.estado === 'blacklist' ? 'no apto' : r.estado}{r.mensaje ? ` · ${r.mensaje}` : ''}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-4 px-6 pb-5 flex-shrink-0 border-t border-stone-100">
              <button onClick={() => setShowImportActivos(false)} disabled={importandoActivos}
                className="btn-secondary flex-1 py-2.5 text-sm">
                {importActivosResult ? 'Cerrar' : 'Cancelar'}
              </button>
              {!importActivosResult && (
                <button onClick={handleImportarActivos} disabled={!importActivosFile || importandoActivos}
                  className="flex-1 py-2.5 text-sm font-semibold rounded-xl bg-forest-700 text-white hover:bg-forest-800 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                  {importandoActivos
                    ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Procesando...</>
                    : <><Upload className="w-4 h-4" />Importar activos</>
                  }
                </button>
              )}
              {importActivosResult && (importActivosResult.summary.registrados > 0 || importActivosResult.summary.reingresos > 0) && (
                <button onClick={() => { setImportActivosFile(null); setImportActivosResult(null); }}
                  className="btn-secondary flex-1 py-2.5 text-sm">
                  Importar otro
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmar eliminar trabajador */}
      {confirmDelTrab && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget && !eliminandoTrab) setConfirmDelTrab(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-slide-up">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-bold text-stone-800">Eliminar trabajador</h3>
                <p className="text-xs text-stone-400">Esta acción no se puede deshacer</p>
              </div>
            </div>
            <div className="bg-stone-50 rounded-xl px-4 py-3 mb-3 text-sm">
              <p className="font-semibold text-stone-800">{confirmDelTrab.nombres} {confirmDelTrab.apellidos}</p>
              <p className="text-stone-400 text-xs font-mono mt-0.5">DNI {confirmDelTrab.dni} · #{confirmDelTrab.id}</p>
            </div>
            <p className="text-xs text-amber-600 mb-4">
              También se eliminará su historial de bajas y reingresos. Si solo dejó de trabajar,
              usa "Registrar baja" en su lugar.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDelTrab(null)} disabled={eliminandoTrab}
                className="btn-secondary flex-1 py-2.5 text-sm">
                Cancelar
              </button>
              <button onClick={handleDeleteTrab} disabled={eliminandoTrab}
                className="flex-1 py-2.5 text-sm font-semibold rounded-xl bg-red-600 text-white hover:bg-red-700 active:scale-95 transition-all disabled:opacity-60 flex items-center justify-center gap-2">
                {eliminandoTrab
                  ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <Trash2 className="w-4 h-4" />}
                {eliminandoTrab ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
