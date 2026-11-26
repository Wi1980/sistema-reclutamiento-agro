import { useState, useEffect, useCallback } from 'react';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { fmtHora } from '@/utils/dates';
import {
  Users, RefreshCw, CheckCircle2, AlertCircle,
  ArrowRightCircle, QrCode, Copy, Check, Download, Clock,
  Search, ChevronLeft, ChevronRight, X,
} from 'lucide-react';
import api from '@/services/api';

interface Asistente {
  id: number;
  nombres: string;
  apellidos: string;
  dni: string;
  celular: string;
  banco: string | null;
  numero_cuenta: string | null;
  talla_ropa: string | null;
  talla_guantes: string | null;
  correo: string | null;
  contacto_emergencia_nombre: string | null;
  contacto_emergencia_celular: string | null;
  asistio_at: string;
}

interface Esperado {
  id: number;
  nombres: string;
  apellidos: string;
  dni: string;
  celular: string;
  estado: 'Confirmado' | 'Programado';
  contrata_nombre: string | null;
}

const FICHA_URL = `${window.location.origin}/ficha`;
const QR_SRC   = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(FICHA_URL)}&bgcolor=ffffff&color=1a3a1a&margin=12`;

export default function LlamadoPage() {
  const [llegaron,   setLlegaron]   = useState<Asistente[]>([]);
  const [esperados,  setEsperados]  = useState<Esperado[]>([]);
  const [tab,        setTab]        = useState<'llegaron' | 'esperados'>('llegaron');
  const [loading,    setLoading]    = useState(false);
  const [pasando,    setPasando]    = useState(false);
  const [resultado,  setResultado]  = useState<{ registrados: number; duplicados: number; no_presentados: number } | null>(null);
  const [error,      setError]      = useState('');
  const [confirmando,setConfirmando]= useState(false);
  const [copied,     setCopied]     = useState(false);
  const [exportando, setExportando] = useState(false);
  const [busqueda,   setBusqueda]   = useState('');
  const [pagLleg,    setPagLleg]    = useState(1);
  const [pagEsp,     setPagEsp]     = useState(1);
  const POR_PAGINA = 15;

  const fetchAsistentes = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const { data } = await api.get('/ficha/asistencias');
      setLlegaron(data.llegaron ?? data.data ?? []);
      setEsperados(data.esperados ?? []);
    } catch {
      // silencioso en polling
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAsistentes(); }, [fetchAsistentes]);
  useAutoRefresh(() => fetchAsistentes(true), 15_000);

  async function handlePasar() {
    setPasando(true); setError(''); setResultado(null);
    try {
      const { data } = await api.post('/ficha/pasar-trabajadores');
      setResultado({
        registrados:    data.registrados,
        duplicados:     data.duplicados,
        no_presentados: data.no_presentados ?? 0,
      });
      await fetchAsistentes();
      setConfirmando(false);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Error al pasar trabajadores');
    } finally {
      setPasando(false);
    }
  }

  async function exportar() {
    setExportando(true);
    try {
      const res = await api.get('/ficha/asistencias/export', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a   = document.createElement('a');
      a.href    = url;
      a.download = `asistentes_${new Date().toLocaleDateString('es-PE', { timeZone: 'America/Lima' }).replace(/\//g, '-')}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* silencioso */ }
    finally { setExportando(false); }
  }

  async function copiarLink() {
    await navigator.clipboard.writeText(FICHA_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const confirmadosNoLlegaron = esperados.filter(e => e.estado === 'Confirmado').length;

  // Búsqueda + paginación client-side
  const q = busqueda.trim().toLowerCase();
  const llegFilt = q
    ? llegaron.filter(a => a.dni.includes(q) || `${a.nombres} ${a.apellidos}`.toLowerCase().includes(q))
    : llegaron;
  const espFilt = q
    ? esperados.filter(e => e.dni.includes(q) || `${e.nombres} ${e.apellidos}`.toLowerCase().includes(q))
    : esperados;

  const llegPag      = llegFilt.slice((pagLleg - 1) * POR_PAGINA, pagLleg * POR_PAGINA);
  const espPag       = espFilt.slice((pagEsp  - 1) * POR_PAGINA, pagEsp  * POR_PAGINA);
  const totalPagsLleg = Math.ceil(llegFilt.length / POR_PAGINA);
  const totalPagsEsp  = Math.ceil(espFilt.length  / POR_PAGINA);

  function limpiarBusqueda() { setBusqueda(''); setPagLleg(1); setPagEsp(1); }
  function buscar(v: string) { setBusqueda(v); setPagLleg(1); setPagEsp(1); }

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* Encabezado */}
      <div>
        <h1 className="text-2xl font-bold text-stone-800">Llamado QR</h1>
        <p className="text-stone-400 text-sm mt-1">
          Muestra el QR a los colaboradores para que confirmen su asistencia desde su celular.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* ── Panel QR ── */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-6 flex flex-col items-center gap-4">
            <div className="flex items-center gap-2 self-start">
              <QrCode className="w-4 h-4 text-agro-700" />
              <span className="text-sm font-semibold text-stone-700">Código QR de hoy</span>
            </div>

            <div className="p-3 bg-stone-50 rounded-2xl border border-stone-100">
              <img
                src={QR_SRC}
                alt="QR Ficha"
                className="w-[180px] h-[180px] rounded-lg"
                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>

            <p className="text-[11px] text-stone-400 text-center leading-relaxed">
              Escanear abre la página de confirmación.<br />
              Solo colaboradores <b>Confirmados</b> o <b>Programados</b> pueden registrarse.
            </p>

            <div className="w-full">
              <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wider mb-1.5">Link directo</p>
              <div className="flex items-center gap-2 bg-stone-50 border border-stone-200 rounded-xl px-3 py-2">
                <span className="flex-1 text-[11px] text-stone-500 font-mono truncate">{FICHA_URL}</span>
                <button
                  onClick={copiarLink}
                  className="flex-shrink-0 p-1 rounded-lg hover:bg-stone-200 transition-colors text-stone-400 hover:text-stone-700"
                  title="Copiar link"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-agro-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {/* Pasar a trabajadores */}
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm p-5 space-y-4">
            <div>
              <p className="font-semibold text-stone-800 text-sm">Pasar a Trabajadores</p>
              <p className="text-stone-400 text-xs mt-1">
                Cierra el llamado de hoy: registra los que llegaron y marca los ausentes.
              </p>
            </div>

            {/* Resumen rápido */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-agro-50 border border-agro-100 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-agro-700">{llegaron.length}</p>
                <p className="text-[11px] text-agro-600 font-medium">Llegaron</p>
              </div>
              <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-center">
                <p className="text-2xl font-bold text-amber-600">{confirmadosNoLlegaron}</p>
                <p className="text-[11px] text-amber-600 font-medium">No llegaron</p>
              </div>
            </div>

            {resultado && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-700 text-sm">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>
                    {resultado.registrados} registrado(s) como trabajadores
                    {resultado.duplicados > 0 ? `, ${resultado.duplicados} ya existían` : ''}
                  </span>
                </div>
                {resultado.no_presentados > 0 && (
                  <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl text-amber-700 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{resultado.no_presentados} marcado(s) como "No se presentó"</span>
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
              </div>
            )}

            {!confirmando ? (
              <button
                onClick={() => { setConfirmando(true); setResultado(null); setError(''); }}
                disabled={llegaron.length === 0}
                className="w-full py-2.5 bg-agro-700 hover:bg-agro-800 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <ArrowRightCircle className="w-4 h-4" />
                Cerrar llamado{llegaron.length > 0 ? ` (${llegaron.length})` : ''}
              </button>
            ) : (
              <div className="space-y-3">
                <div className="bg-stone-50 rounded-xl p-3 space-y-1 text-xs text-stone-600 text-center">
                  <p>✅ <b>{llegaron.length}</b> pasan a Trabajadores</p>
                  {confirmadosNoLlegaron > 0 && (
                    <p>⚠️ <b>{confirmadosNoLlegaron}</b> Confirmado(s) quedarán como <span className="text-amber-600 font-semibold">"No se presentó"</span></p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmando(false)} className="flex-1 py-2.5 border border-stone-200 text-stone-600 text-sm font-medium rounded-xl hover:bg-stone-50 transition-colors">
                    Cancelar
                  </button>
                  <button onClick={handlePasar} disabled={pasando} className="flex-1 py-2.5 bg-agro-700 hover:bg-agro-800 disabled:opacity-60 text-white text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2">
                    {pasando
                      ? <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      : 'Confirmar'
                    }
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Panel derecho: tabs llegaron / esperados ── */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">

            {/* Header con tabs */}
            <div className="flex items-center justify-between px-5 pt-4 pb-0 border-b border-stone-100">
              <div className="flex gap-1">
                <button
                  onClick={() => setTab('llegaron')}
                  className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                    tab === 'llegaron'
                      ? 'border-agro-600 text-agro-700'
                      : 'border-transparent text-stone-400 hover:text-stone-600'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Llegaron
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none ${
                    tab === 'llegaron' ? 'bg-agro-100 text-agro-700' : 'bg-stone-100 text-stone-500'
                  }`}>{q ? `${llegFilt.length}/` : ''}{llegaron.length}</span>
                </button>
                <button
                  onClick={() => setTab('esperados')}
                  className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition-colors ${
                    tab === 'esperados'
                      ? 'border-amber-500 text-amber-600'
                      : 'border-transparent text-stone-400 hover:text-stone-600'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  No llegaron
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none ${
                    tab === 'esperados' ? 'bg-amber-100 text-amber-700' : 'bg-stone-100 text-stone-500'
                  }`}>{q ? `${espFilt.length}/` : ''}{esperados.length}</span>
                </button>
              </div>

              <div className="flex items-center gap-2 pb-2">
                {tab === 'llegaron' && llegaron.length > 0 && (
                  <button
                    onClick={exportar}
                    disabled={exportando}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-agro-700 hover:bg-agro-800 disabled:opacity-60 text-white text-xs font-semibold rounded-lg transition-all"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {exportando ? 'Exportando...' : 'Exportar'}
                  </button>
                )}
                <button
                  onClick={() => fetchAsistentes()}
                  disabled={loading}
                  className="p-1.5 rounded-lg hover:bg-stone-100 transition-colors text-stone-400 hover:text-stone-700"
                  title="Actualizar"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* ── Búsqueda ── */}
            <div className="px-4 py-2.5 border-b border-stone-100">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Buscar por nombre o DNI..."
                  value={busqueda}
                  onChange={e => buscar(e.target.value)}
                  className="w-full pl-8 pr-8 py-2 text-sm border border-stone-200 rounded-xl bg-stone-50
                    focus:outline-none focus:border-agro-400 focus:ring-2 focus:ring-agro-400/10
                    placeholder:text-stone-300"
                />
                {busqueda && (
                  <button
                    onClick={limpiarBusqueda}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* ── Tab: Llegaron ── */}
            {tab === 'llegaron' && (
              llegaron.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="w-12 h-12 bg-stone-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <Users className="w-6 h-6 text-stone-300" />
                  </div>
                  <p className="text-stone-400 text-sm font-medium">Ningún colaborador ha confirmado aún</p>
                  <p className="text-stone-300 text-xs mt-1">Se actualiza automáticamente cada 30 seg.</p>
                </div>
              ) : llegFilt.length === 0 ? (
                <div className="py-12 text-center">
                  <Search className="w-8 h-8 text-stone-200 mx-auto mb-2" />
                  <p className="text-stone-400 text-sm">Sin resultados para <span className="font-semibold">"{busqueda}"</span></p>
                </div>
              ) : (
                <>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-stone-50 border-b border-stone-100">
                        <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-stone-400 uppercase tracking-wider">Colaborador</th>
                        <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-stone-400 uppercase tracking-wider hidden sm:table-cell">DNI</th>
                        <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-stone-400 uppercase tracking-wider">Banco / Cuenta</th>
                        <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-stone-400 uppercase tracking-wider">Tallas</th>
                        <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-stone-400 uppercase tracking-wider">Hora</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-50">
                      {llegPag.map(a => (
                        <tr key={a.id} className="hover:bg-stone-50/50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-lg bg-agro-100 flex items-center justify-center text-agro-700 font-bold text-xs flex-shrink-0">
                                {a.nombres.charAt(0)}
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-stone-800 text-xs leading-tight truncate">
                                  {a.nombres} {a.apellidos}
                                </p>
                                <p className="text-stone-400 text-[11px]">{a.celular}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-stone-600 hidden sm:table-cell">{a.dni}</td>
                          <td className="px-4 py-3 text-xs">
                            {a.banco
                              ? <div>
                                  <p className="text-stone-700 font-medium">{a.banco}</p>
                                  <p className="text-stone-400 font-mono text-[11px] break-all">{a.numero_cuenta || '—'}</p>
                                </div>
                              : <span className="text-stone-300">—</span>
                            }
                          </td>
                          <td className="px-4 py-3 text-xs text-stone-500">
                            <p>{a.talla_ropa || <span className="text-stone-300">—</span>}</p>
                            <p className="text-stone-400 text-[11px]">{a.talla_guantes || '—'}</p>
                          </td>
                          <td className="px-4 py-3 text-[11px] text-stone-400 tabular-nums whitespace-nowrap">
                            {fmtHora(a.asistio_at)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {totalPagsLleg > 1 && (
                    <div className="flex items-center justify-between px-4 py-2.5 border-t border-stone-100 bg-stone-50/50">
                      <p className="text-[11px] text-stone-400">
                        {(pagLleg - 1) * POR_PAGINA + 1}–{Math.min(pagLleg * POR_PAGINA, llegFilt.length)} de {llegFilt.length}
                      </p>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setPagLleg(p => p - 1)} disabled={pagLleg === 1}
                          className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-100 disabled:opacity-40 transition-all">
                          <ChevronLeft className="w-3.5 h-3.5 text-stone-500" />
                        </button>
                        <span className="text-[11px] text-stone-500 px-2 font-medium tabular-nums">
                          {pagLleg} / {totalPagsLleg}
                        </span>
                        <button onClick={() => setPagLleg(p => p + 1)} disabled={pagLleg >= totalPagsLleg}
                          className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-100 disabled:opacity-40 transition-all">
                          <ChevronRight className="w-3.5 h-3.5 text-stone-500" />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )
            )}

            {/* ── Tab: No llegaron ── */}
            {tab === 'esperados' && (
              esperados.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="w-12 h-12 bg-agro-50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <CheckCircle2 className="w-6 h-6 text-agro-400" />
                  </div>
                  <p className="text-stone-500 text-sm font-medium">¡Todos los confirmados llegaron!</p>
                  <p className="text-stone-300 text-xs mt-1">No hay pendientes de llegar.</p>
                </div>
              ) : espFilt.length === 0 ? (
                <div className="py-12 text-center">
                  <Search className="w-8 h-8 text-stone-200 mx-auto mb-2" />
                  <p className="text-stone-400 text-sm">Sin resultados para <span className="font-semibold">"{busqueda}"</span></p>
                </div>
              ) : (
                <>
                  <div className="px-5 py-2.5 bg-amber-50 border-b border-amber-100">
                    <p className="text-[11px] text-amber-700">
                      <b>{confirmadosNoLlegaron}</b> Confirmado(s) serán marcados como "No se presentó" al cerrar el llamado.
                      Los Programados mantienen su estado.
                    </p>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-stone-50 border-b border-stone-100">
                        <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-stone-400 uppercase tracking-wider">Colaborador</th>
                        <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-stone-400 uppercase tracking-wider hidden sm:table-cell">DNI</th>
                        <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-stone-400 uppercase tracking-wider">Estado</th>
                        <th className="text-left px-4 py-2.5 text-[11px] font-semibold text-stone-400 uppercase tracking-wider">Contrata</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-50">
                      {espPag.map(e => (
                        <tr key={e.id} className="hover:bg-stone-50/50 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-xs flex-shrink-0">
                                {e.nombres.charAt(0)}
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium text-stone-800 text-xs leading-tight truncate">
                                  {e.nombres} {e.apellidos}
                                </p>
                                <p className="text-stone-400 text-[11px]">{e.celular}</p>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono text-xs text-stone-600 hidden sm:table-cell">{e.dni}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                              e.estado === 'Confirmado'
                                ? 'bg-teal-50 text-teal-700'
                                : 'bg-blue-50 text-blue-700'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${e.estado === 'Confirmado' ? 'bg-teal-500' : 'bg-blue-400'}`} />
                              {e.estado}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-stone-500">
                            {e.contrata_nombre || <span className="text-stone-300">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {totalPagsEsp > 1 && (
                    <div className="flex items-center justify-between px-4 py-2.5 border-t border-stone-100 bg-stone-50/50">
                      <p className="text-[11px] text-stone-400">
                        {(pagEsp - 1) * POR_PAGINA + 1}–{Math.min(pagEsp * POR_PAGINA, espFilt.length)} de {espFilt.length}
                      </p>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setPagEsp(p => p - 1)} disabled={pagEsp === 1}
                          className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-100 disabled:opacity-40 transition-all">
                          <ChevronLeft className="w-3.5 h-3.5 text-stone-500" />
                        </button>
                        <span className="text-[11px] text-stone-500 px-2 font-medium tabular-nums">
                          {pagEsp} / {totalPagsEsp}
                        </span>
                        <button onClick={() => setPagEsp(p => p + 1)} disabled={pagEsp >= totalPagsEsp}
                          className="p-1.5 rounded-lg border border-stone-200 hover:bg-stone-100 disabled:opacity-40 transition-all">
                          <ChevronRight className="w-3.5 h-3.5 text-stone-500" />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )
            )}

            <div className="px-5 py-2.5 border-t border-stone-50 bg-stone-50/50">
              <p className="text-[10px] text-stone-300">Actualización automática cada 30 segundos</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
