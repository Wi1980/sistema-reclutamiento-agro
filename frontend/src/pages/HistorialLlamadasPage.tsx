import { useState, useEffect, useCallback, useRef } from 'react';
import { fmtFechaHora } from '@/utils/dates';
import {
  Phone, Download, X,
  AlertCircle, ChevronLeft, ChevronRight, Calendar,
} from 'lucide-react';
import api from '@/services/api';

interface LlamadaRow {
  id: number;
  fecha_llamada: string;
  resultado: string;
  observacion: string | null;
  fecha_programada: string | null;
  postulante_id: number;
  postulante_nombres: string;
  postulante_apellidos: string;
  postulante_dni: string;
  postulante_celular: string;
  postulante_estado: string;
  contrata_id: number;
  contrata_nombre: string;
}

interface Contrata { id: number; nombre: string; }

interface Pagination { total: number; page: number; limit: number; pages: number; }

const RESULTADO_LABEL: Record<string, string> = {
  no_responde:   'No responde',
  confirmado:    'Confirmado',
  no_interesado: 'No interesado',
  callback:      'Callback',
  programado:    'Programado',
  no_califica:   'No califica',
};

const RESULTADO_STYLE: Record<string, string> = {
  confirmado:    'bg-teal-50 text-teal-700',
  no_responde:   'bg-amber-50 text-amber-700',
  no_interesado: 'bg-stone-100 text-stone-500',
  callback:      'bg-blue-50 text-blue-700',
  programado:    'bg-purple-50 text-purple-700',
  no_califica:   'bg-red-50 text-red-500',
};

function fmt(dateStr: string) {
  return fmtFechaHora(dateStr);
}

export default function HistorialLlamadasPage() {
  const [rows,       setRows]       = useState<LlamadaRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ total: 0, page: 1, limit: 50, pages: 0 });
  const [contratas,  setContratas]  = useState<Contrata[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(false);
  const [exporting,   setExporting]   = useState(false);
  const [exportError, setExportError] = useState('');

  const [filtros, setFiltros] = useState({
    contrata_id: '',
    fecha_inicio: '',
    fecha_fin: '',
    resultado: '',
  });
  const [page, setPage] = useState(1);
  const abortRef = useRef<AbortController | null>(null);

  // Cargar lista de contratas para el selector
  useEffect(() => {
    api.get('/productividad/contratas')
      .then(r => {
        setContratas(r.data.data.map((c: any) => ({ id: c.id, nombre: c.nombre })));
      })
      .catch(() => {});
  }, []);

  const fetchData = useCallback(async (p: number) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setError(false);
    try {
      const params: Record<string, any> = { page: p, limit: 50 };
      if (filtros.contrata_id) params.contrata_id = filtros.contrata_id;
      if (filtros.fecha_inicio) params.fecha_inicio = filtros.fecha_inicio;
      if (filtros.fecha_fin)    params.fecha_fin    = filtros.fecha_fin;
      if (filtros.resultado)    params.resultado    = filtros.resultado;

      const res = await api.get('/reportes/historial-llamadas', { params, signal: ctrl.signal });
      setRows(res.data.data);
      setPagination(res.data.pagination);
    } catch (err: any) {
      if (err?.code !== 'ERR_CANCELED') setError(true);
    } finally {
      setLoading(false);
    }
  }, [filtros]);

  useEffect(() => {
    setPage(1);
    fetchData(1);
  }, [filtros, fetchData]);

  function handlePage(p: number) {
    setPage(p);
    fetchData(p);
  }

  function handleFiltro(key: keyof typeof filtros, val: string) {
    setFiltros(prev => ({ ...prev, [key]: val }));
  }

  function limpiar() {
    setFiltros({ contrata_id: '', fecha_inicio: '', fecha_fin: '', resultado: '' });
  }

  async function handleExport() {
    setExporting(true);
    try {
      const params: Record<string, any> = {};
      if (filtros.contrata_id) params.contrata_id = filtros.contrata_id;
      if (filtros.fecha_inicio) params.fecha_inicio = filtros.fecha_inicio;
      if (filtros.fecha_fin)    params.fecha_fin    = filtros.fecha_fin;
      if (filtros.resultado)    params.resultado    = filtros.resultado;

      const res = await api.get('/reportes/historial-llamadas/export', {
        params,
        responseType: 'blob',
      });

      const url = URL.createObjectURL(new Blob([res.data]));
      const a   = document.createElement('a');
      a.href     = url;
      a.download = `historial_llamadas_${new Date().toISOString().split('T')[0]}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError('Error al exportar. Intenta de nuevo.');
    } finally {
      setExporting(false);
    }
  }

  const hayFiltros = Object.values(filtros).some(Boolean);

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-stone-800">Historial de Llamadas</h1>
          <p className="text-stone-400 text-sm mt-0.5">Auditoría completa de todas las interacciones</p>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting || loading}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-agro-700 text-white text-sm font-medium hover:bg-agro-800 transition-all active:scale-95 disabled:opacity-60 self-start"
        >
          {exporting
            ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            : <Download className="w-4 h-4" />
          }
          <span className="hidden sm:inline">Exportar Excel</span>
          <span className="sm:hidden">Exportar</span>
        </button>
      </div>

      {/* Export error */}
      {exportError && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />{exportError}
        </div>
      )}

      {/* Filtros */}
      <div className="bg-white rounded-2xl border border-stone-100 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">

          {/* Contrata */}
          <div>
            <label className="label text-xs mb-1">Contrata</label>
            <select
              className="input text-sm"
              value={filtros.contrata_id}
              onChange={e => handleFiltro('contrata_id', e.target.value)}
            >
              <option value="">Todas</option>
              {contratas.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>

          {/* Fecha inicio */}
          <div>
            <label className="label text-xs mb-1">Desde</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 pointer-events-none" />
              <input
                type="date"
                className="input text-sm pl-8"
                value={filtros.fecha_inicio}
                onChange={e => handleFiltro('fecha_inicio', e.target.value)}
              />
            </div>
          </div>

          {/* Fecha fin */}
          <div>
            <label className="label text-xs mb-1">Hasta</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 pointer-events-none" />
              <input
                type="date"
                className="input text-sm pl-8"
                value={filtros.fecha_fin}
                onChange={e => handleFiltro('fecha_fin', e.target.value)}
              />
            </div>
          </div>

          {/* Resultado */}
          <div>
            <label className="label text-xs mb-1">Resultado</label>
            <select
              className="input text-sm"
              value={filtros.resultado}
              onChange={e => handleFiltro('resultado', e.target.value)}
            >
              <option value="">Todos</option>
              {Object.entries(RESULTADO_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>

        {hayFiltros && (
          <div className="mt-3 flex items-center justify-between">
            <p className="text-xs text-stone-400">
              {pagination.total.toLocaleString('es-PE')} registro{pagination.total !== 1 ? 's' : ''} encontrado{pagination.total !== 1 ? 's' : ''}
            </p>
            <button
              onClick={limpiar}
              className="flex items-center gap-1.5 text-xs text-stone-400 hover:text-stone-700 transition-colors"
            >
              <X className="w-3 h-3" />
              Limpiar filtros
            </button>
          </div>
        )}
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-stone-100 p-8">
          <div className="space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="h-10 bg-stone-100 rounded-xl flex-1" />
                <div className="h-10 bg-stone-100 rounded-xl w-32" />
                <div className="h-10 bg-stone-100 rounded-xl w-24" />
              </div>
            ))}
          </div>
        </div>
      ) : error ? (
        <div className="bg-white rounded-2xl border border-stone-100 p-12 text-center">
          <AlertCircle className="w-12 h-12 text-red-300 mx-auto mb-3" />
          <p className="font-semibold text-stone-600">No se pudo cargar el historial</p>
          <button
            onClick={() => fetchData(page)}
            className="mt-4 btn-primary text-sm py-2"
          >
            Reintentar
          </button>
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-stone-100 p-12 text-center">
          <Phone className="w-12 h-12 text-stone-200 mx-auto mb-3" />
          <p className="font-semibold text-stone-500">Sin registros</p>
          <p className="text-sm text-stone-400 mt-1">No hay llamadas con los filtros aplicados</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden">
            {/* Header tabla */}
            <div className="hidden md:grid grid-cols-[1.5fr_1fr_1fr_120px_1fr] gap-3 px-4 py-2.5 bg-stone-50 border-b border-stone-100 text-xs font-semibold text-stone-500 uppercase tracking-wider">
              <span>Postulante</span>
              <span>Contrata</span>
              <span>Fecha</span>
              <span>Resultado</span>
              <span>Observación</span>
            </div>

            <div className="divide-y divide-stone-50">
              {rows.map(row => (
                <div
                  key={row.id}
                  className="grid md:grid-cols-[1.5fr_1fr_1fr_120px_1fr] gap-2 md:gap-3 px-4 py-3 hover:bg-stone-50/60 transition-colors"
                >
                  {/* Postulante */}
                  <div>
                    <p className="font-medium text-stone-800 text-sm leading-tight">
                      {row.postulante_nombres} {row.postulante_apellidos}
                    </p>
                    <p className="text-[11px] text-stone-400 font-mono">
                      {row.postulante_dni} · {row.postulante_celular}
                    </p>
                  </div>

                  {/* Contrata */}
                  <div className="flex items-center">
                    <p className="text-sm text-stone-600">{row.contrata_nombre}</p>
                  </div>

                  {/* Fecha */}
                  <div className="flex items-center">
                    <p className="text-xs text-stone-500 font-mono tabular-nums">
                      {fmt(row.fecha_llamada)}
                    </p>
                  </div>

                  {/* Badge resultado */}
                  <div className="flex items-center">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                      RESULTADO_STYLE[row.resultado] ?? 'bg-stone-100 text-stone-500'
                    }`}>
                      {RESULTADO_LABEL[row.resultado] ?? row.resultado}
                    </span>
                  </div>

                  {/* Observación */}
                  <div className="flex items-center">
                    <p className="text-xs text-stone-500 line-clamp-2">
                      {row.observacion || <span className="text-stone-300 italic">Sin observación</span>}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Paginación */}
          {pagination.pages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-stone-400">
                Pág. {pagination.page} de {pagination.pages} ({pagination.total.toLocaleString('es-PE')} total)
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handlePage(page - 1)}
                  disabled={page <= 1 || loading}
                  className="p-2 rounded-xl border border-stone-200 hover:bg-stone-50 disabled:opacity-40 transition-all"
                >
                  <ChevronLeft className="w-4 h-4 text-stone-500" />
                </button>

                {Array.from({ length: Math.min(5, pagination.pages) }, (_, i) => {
                  const start = Math.max(1, Math.min(page - 2, pagination.pages - 4));
                  const p = start + i;
                  return (
                    <button
                      key={p}
                      onClick={() => handlePage(p)}
                      className={`w-8 h-8 rounded-xl text-xs font-medium transition-all ${
                        p === page
                          ? 'bg-agro-700 text-white shadow-sm'
                          : 'border border-stone-200 text-stone-500 hover:bg-stone-50'
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}

                <button
                  onClick={() => handlePage(page + 1)}
                  disabled={page >= pagination.pages || loading}
                  className="p-2 rounded-xl border border-stone-200 hover:bg-stone-50 disabled:opacity-40 transition-all"
                >
                  <ChevronRight className="w-4 h-4 text-stone-500" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Stats footer — conteo de la página visible */}
      {!loading && !error && rows.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] text-stone-400 font-medium flex-shrink-0">Esta página:</span>
          {Object.entries(RESULTADO_LABEL).map(([key, label]) => {
            const count = rows.filter(r => r.resultado === key).length;
            if (!count) return null;
            return (
              <span
                key={key}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                  RESULTADO_STYLE[key] ?? 'bg-stone-100 text-stone-500'
                }`}
              >
                {label}: {count}
              </span>
            );
          })}
          {pagination.pages > 1 && (
            <span className="text-[11px] text-stone-300 ml-1">
              (total: {pagination.total.toLocaleString('es-PE')} registros en {pagination.pages} págs.)
            </span>
          )}
        </div>
      )}
    </div>
  );
}
