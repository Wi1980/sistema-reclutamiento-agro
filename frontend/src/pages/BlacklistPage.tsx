import { useState, useCallback, useEffect, useRef } from 'react';
import { fmtFecha } from '@/utils/dates';
import {
  ShieldBan, Plus, Download, Trash2, Search, X,
  AlertTriangle, CheckCircle2, FileSpreadsheet, Upload, AlertCircle,
  ChevronUp, ChevronDown, ChevronsUpDown, Pencil,
} from 'lucide-react';
import api from '@/services/api';
import { usePermission } from '@/hooks/usePermission';

interface BLEntry {
  id: number;
  apellidos: string;
  nombres: string;
  dni: string;
  motivo: string | null;
  creado_por_nombre: string | null;
  created_at: string;
}

interface Pagination { total: number; page: number; limit: number; pages: number; }

const emptyForm = { apellidos: '', nombres: '', dni: '', motivo: '' };

export default function BlacklistPage() {
  const [rows, setRows]             = useState<BLEntry[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ total: 0, page: 1, limit: 20, pages: 1 });
  const [search, setSearch]         = useState('');
  const [loading, setLoading]       = useState(false);
  const [msg, setMsg]               = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Modal agregar
  const [showAdd, setShowAdd]   = useState(false);
  const [form, setForm]         = useState(emptyForm);
  const [saving, setSaving]     = useState(false);

  // Modal editar
  const [editEntry, setEditEntry] = useState<BLEntry | null>(null);
  const [editForm, setEditForm]   = useState(emptyForm);
  const [editSaving, setEditSaving] = useState(false);

  // Modal eliminar
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isMount   = useRef(true);
  const [sortBy,  setSortBy]  = useState('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const canManage = usePermission('blacklist.manage');

  // Modal importar
  const [showImport, setShowImport]   = useState(false);
  const [importFile, setImportFile]   = useState<File | null>(null);
  const [importando, setImportando]   = useState(false);
  const [importResult, setImportResult] = useState<{
    insertados: number;
    errores: string[];
  } | null>(null);

  const flash = (type: 'ok' | 'err', text: string) => {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4000);
  };

  const load = useCallback(async (page = 1, q = '') => {
    setLoading(true);
    try {
      const { data } = await api.get('/blacklist', { params: { page, limit: 20, search: q || undefined, sortBy, sortDir } });
      if (data.success) { setRows(data.data); setPagination(data.pagination); }
    } catch {
      flash('err', 'Error al cargar Personal no Apto');
    } finally {
      setLoading(false);
    }
  }, [sortBy, sortDir]);

  function handleSort(col: string) {
    if (sortBy === col) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); }
    else { setSortBy(col); setSortDir('asc'); }
  }

  function SortIcon({ col }: { col: string }) {
    if (sortBy !== col) return <ChevronsUpDown className="w-3 h-3 ml-1 text-stone-300 inline" />;
    return sortDir === 'asc'
      ? <ChevronUp   className="w-3 h-3 ml-1 text-red-500 inline" />
      : <ChevronDown className="w-3 h-3 ml-1 text-red-500 inline" />;
  }

  useEffect(() => { load(1, search); }, [load]);

  useEffect(() => {
    if (isMount.current) { isMount.current = false; return; }
    const t = setTimeout(() => load(1, search), 350);
    return () => clearTimeout(t);
  }, [search]);

  // ── Agregar uno ──────────────────────────────────────────────
  const handleAdd = async () => {
    if (!form.apellidos.trim() || !form.nombres.trim() || form.dni.trim().length < 8) {
      flash('err', 'Apellidos, nombres y DNI (mín. 8 dígitos) son requeridos');
      return;
    }
    setSaving(true);
    try {
      await api.post('/blacklist', form);
      flash('ok', 'Persona agregada a Personal no Apto');
      setShowAdd(false);
      setForm(emptyForm);
      load(1, search);
    } catch (e: any) {
      flash('err', e?.response?.data?.message || 'Error al agregar');
    } finally {
      setSaving(false);
    }
  };

  // ── Importar Excel ───────────────────────────────────────────
  async function handleImportar() {
    if (!importFile) return;
    setImportando(true);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append('archivo', importFile);
      const { data } = await api.post('/blacklist/import', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const insertados = Number((data.message || '').match(/\d+/)?.[0] ?? 0);
      setImportResult({ insertados, errores: data.errores || [] });
      load(1, search);
    } catch (e: any) {
      setImportResult({
        insertados: 0,
        errores: [e?.response?.data?.message || 'Error al procesar archivo'],
      });
    } finally {
      setImportando(false);
    }
  }

  async function descargarPlantilla() {
    try {
      const res = await api.get('/blacklist/plantilla', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = 'plantilla_blacklist.xlsx'; a.click();
      URL.revokeObjectURL(url);
    } catch {
      flash('err', 'Error al descargar la plantilla. Intenta de nuevo.');
    }
  }

  // ── Editar ───────────────────────────────────────────────────
  const handleEditSave = async () => {
    if (!editEntry) return;
    if (!editForm.apellidos.trim() || !editForm.nombres.trim() || editForm.dni.trim().length < 8) {
      flash('err', 'Apellidos, nombres y DNI (mín. 8 dígitos) son requeridos');
      return;
    }
    setEditSaving(true);
    try {
      await api.put(`/blacklist/${editEntry.id}`, editForm);
      flash('ok', 'Registro actualizado');
      setEditEntry(null);
      load(pagination.page, search);
    } catch (e: any) {
      flash('err', e?.response?.data?.message || 'Error al actualizar');
    } finally {
      setEditSaving(false);
    }
  };

  // ── Eliminar ─────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      await api.delete(`/blacklist/${deleteId}`);
      flash('ok', 'Persona eliminada de Personal no Apto');
      setDeleteId(null);
      load(pagination.page, search);
    } catch (e: any) {
      flash('err', e?.response?.data?.message || 'Error al eliminar');
    } finally {
      setDeleting(false);
    }
  };

  const fmt = (d: string) => fmtFecha(d);

  return (
    <div className="space-y-5 animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-stone-800">Personal no Apto</h1>
          <p className="text-stone-400 text-sm">{pagination.total} persona(s) registrada(s)</p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <button
              onClick={() => { setShowImport(true); setImportFile(null); setImportResult(null); }}
              className="btn-primary text-sm py-2.5 flex items-center gap-2"
            >
              <FileSpreadsheet className="w-4 h-4" /> Importar Excel
            </button>
            <button
              onClick={() => { setShowAdd(true); setForm(emptyForm); }}
              className="btn-primary text-sm py-2.5 flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Agregar
            </button>
          </div>
        )}
      </div>

      {/* Flash */}
      {msg && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium ${
          msg.type === 'ok'
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {msg.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
          {msg.text}
        </div>
      )}

      {/* Buscador */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
        <input
          type="text" className="input pl-9"
          placeholder="Buscar DNI, nombre, apellido..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        {search && (
          <button type="button" onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Tabla */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 border-b border-stone-100">
              <tr>
                {([
                  ['Apellidos',     'apellidos'],
                  ['Nombres',       'nombres'],
                  ['DNI',           'dni'],
                  ['Motivo',        'motivo'],
                  ['Registrado por',''],
                  ['Fecha',         'created_at'],
                  ['',              ''],
                ] as [string, string][]).map(([label, col]) => (
                  <th key={label}
                    className={`px-4 py-3 text-left text-xs font-semibold text-stone-500 uppercase tracking-wider whitespace-nowrap
                      ${col ? 'cursor-pointer select-none hover:text-red-600 hover:bg-stone-100 transition-colors' : ''}`}
                    onClick={() => col && handleSort(col)}
                  >
                    {label}{col && <SortIcon col={col} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 7 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-stone-100 rounded w-24" /></td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <ShieldBan className="w-10 h-10 text-stone-200 mx-auto mb-2" />
                    <p className="text-stone-400 text-sm">Sin registros en Personal no Apto</p>
                  </td>
                </tr>
              ) : rows.map(r => (
                <tr key={r.id} className="hover:bg-stone-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-stone-800">{r.apellidos}</td>
                  <td className="px-4 py-3 text-stone-700">{r.nombres}</td>
                  <td className="px-4 py-3 font-mono text-xs text-stone-700">{r.dni}</td>
                  <td className="px-4 py-3 text-stone-500 max-w-[180px] truncate" title={r.motivo || ''}>
                    {r.motivo || <span className="text-stone-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-stone-500 text-xs">{r.creado_por_nombre || '—'}</td>
                  <td className="px-4 py-3 text-stone-400 text-xs whitespace-nowrap">{fmt(r.created_at)}</td>
                  <td className="px-4 py-3">
                    {canManage && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { setEditEntry(r); setEditForm({ apellidos: r.apellidos, nombres: r.nombres, dni: r.dni, motivo: r.motivo || '' }); }}
                          className="p-1.5 rounded-lg text-stone-300 hover:text-amber-500 hover:bg-amber-50 transition-colors"
                          title="Editar"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setDeleteId(r.id)}
                          className="p-1.5 rounded-lg text-stone-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                          title="Eliminar de Personal no Apto"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-stone-100">
          <p className="text-xs text-stone-400">{pagination.total} registros</p>
          {pagination.pages > 1 && (
            <div className="flex gap-1">
              {Array.from({ length: pagination.pages }, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => load(p, search)}
                  className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                    p === pagination.page ? 'bg-red-600 text-white' : 'text-stone-500 hover:bg-stone-100'
                  }`}>
                  {p}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Modal Agregar ──────────────────────────────────────── */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setShowAdd(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-slide-up">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center">
                  <ShieldBan className="w-4 h-4 text-red-600" />
                </div>
                <h2 className="font-bold text-stone-800">Agregar a Personal no Apto</h2>
              </div>
              <button onClick={() => setShowAdd(false)} className="p-1.5 hover:bg-stone-100 rounded-lg transition-colors">
                <X className="w-4 h-4 text-stone-400" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="label text-xs">Apellidos *</label>
                <input className="input" value={form.apellidos}
                  onChange={e => setForm(f => ({ ...f, apellidos: e.target.value.toUpperCase() }))} />
              </div>
              <div>
                <label className="label text-xs">Nombres *</label>
                <input className="input" value={form.nombres}
                  onChange={e => setForm(f => ({ ...f, nombres: e.target.value.toUpperCase() }))} />
              </div>
              <div>
                <label className="label text-xs">DNI *</label>
                <input className="input" maxLength={12} value={form.dni}
                  onChange={e => setForm(f => ({ ...f, dni: e.target.value.replace(/\D/g, '') }))} />
              </div>
              <div>
                <label className="label text-xs">Motivo</label>
                <input className="input" placeholder="Ej: Abandono de trabajo..."
                  value={form.motivo}
                  onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))} />
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowAdd(false)} className="btn-secondary flex-1 py-2.5 text-sm">
                Cancelar
              </button>
              <button onClick={handleAdd} disabled={saving}
                className="flex-1 py-2.5 text-sm font-semibold rounded-xl bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center">
                {saving
                  ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : 'Agregar'
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Importar Excel ───────────────────────────────── */}
      {showImport && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && !importando && setShowImport(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 animate-slide-up max-h-[90vh] flex flex-col">

            {/* Header */}
            <div className="flex items-center gap-3 mb-5 flex-shrink-0">
              <div className="w-9 h-9 bg-red-100 rounded-xl flex items-center justify-center">
                <Upload className="w-4 h-4 text-red-600" />
              </div>
              <div className="flex-1">
                <h2 className="font-bold text-stone-800">Importar Personal no Apto desde Excel</h2>
                <p className="text-xs text-stone-400">Sube un Excel con Apellidos, Nombres y DNI</p>
              </div>
              <button onClick={() => setShowImport(false)} disabled={importando}
                className="p-1.5 hover:bg-stone-100 rounded-lg transition-colors text-stone-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4">
              {/* Instrucciones */}
              <div className="bg-stone-50 rounded-xl p-4 text-xs text-stone-600 space-y-1.5">
                <p className="font-semibold text-stone-700 mb-2">¿Cómo funciona?</p>
                <p>1. Descarga la plantilla y llena las columnas <strong>Apellidos</strong>, <strong>Nombres</strong> y <strong>DNI</strong></p>
                <p>2. La columna <strong>Motivo</strong> es opcional</p>
                <p>3. El sistema agrega cada persona a Personal no Apto</p>
                <p>4. Si el DNI ya existe en postulantes → se marca automáticamente como <strong>Denegado</strong></p>
              </div>

              {/* Plantilla */}
              <button onClick={descargarPlantilla}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-stone-300 text-stone-500 text-sm hover:border-red-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                <Download className="w-4 h-4" />
                Descargar plantilla Excel
              </button>

              {/* Drop zone */}
              <label className={`flex flex-col items-center justify-center gap-2 w-full py-8 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
                importFile ? 'border-red-400 bg-red-50' : 'border-stone-200 hover:border-red-300 hover:bg-red-50'
              }`}>
                <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
                  onChange={e => { setImportFile(e.target.files?.[0] || null); setImportResult(null); }} />
                {importFile ? (
                  <>
                    <CheckCircle2 className="w-8 h-8 text-red-500" />
                    <p className="text-sm font-semibold text-red-700">{importFile.name}</p>
                    <p className="text-xs text-red-400">{(importFile.size / 1024).toFixed(1)} KB — clic para cambiar</p>
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="w-8 h-8 text-stone-300" />
                    <p className="text-sm text-stone-500 font-medium">Arrastra tu Excel aquí o haz clic</p>
                    <p className="text-xs text-stone-400">.xlsx · .xls · .csv — máximo 10 MB</p>
                  </>
                )}
              </label>

              {/* Resultado */}
              {importResult && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-xl p-3 text-center bg-red-50 text-red-700">
                      <p className="text-2xl font-bold font-mono">{importResult.insertados}</p>
                      <p className="text-[10px] font-medium mt-0.5">Agregados</p>
                    </div>
                    <div className="rounded-xl p-3 text-center bg-amber-50 text-amber-700">
                      <p className="text-2xl font-bold font-mono">{importResult.errores.length}</p>
                      <p className="text-[10px] font-medium mt-0.5">Con error</p>
                    </div>
                  </div>

                  {importResult.errores.length > 0 && (
                    <div className="border border-stone-100 rounded-xl overflow-hidden">
                      <div className="max-h-40 overflow-y-auto">
                        <table className="w-full text-xs">
                          <thead className="bg-stone-50 sticky top-0">
                            <tr>
                              <th className="px-3 py-2 text-left text-stone-500 font-semibold">Detalle del error</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-50">
                            {importResult.errores.map((e, i) => (
                              <tr key={i}>
                                <td className="px-3 py-1.5 text-red-500">✗ {e}</td>
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

            {/* Footer */}
            <div className="flex gap-2 pt-4 flex-shrink-0 border-t border-stone-100 mt-4">
              <button onClick={() => setShowImport(false)} disabled={importando}
                className="btn-secondary flex-1 py-2.5 text-sm">
                {importResult ? 'Cerrar' : 'Cancelar'}
              </button>
              {!importResult && (
                <button onClick={handleImportar} disabled={!importFile || importando}
                  className="flex-1 py-2.5 text-sm font-semibold rounded-xl bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                  {importando
                    ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Procesando...</>
                    : <><AlertCircle className="w-4 h-4" />Procesar Excel</>
                  }
                </button>
              )}
              {importResult && importResult.insertados === 0 && importResult.errores.length > 0 && (
                <button onClick={() => { setImportFile(null); setImportResult(null); }}
                  className="flex-1 py-2.5 text-sm font-semibold rounded-xl bg-red-600 text-white hover:bg-red-700 transition-colors">
                  Intentar de nuevo
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Editar ──────────────────────────────────────── */}
      {editEntry && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setEditEntry(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 animate-slide-up">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center">
                  <Pencil className="w-4 h-4 text-amber-600" />
                </div>
                <h2 className="font-bold text-stone-800">Editar registro</h2>
              </div>
              <button onClick={() => setEditEntry(null)} className="p-1.5 hover:bg-stone-100 rounded-lg transition-colors">
                <X className="w-4 h-4 text-stone-400" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="label text-xs">Apellidos *</label>
                <input className="input" value={editForm.apellidos}
                  onChange={e => setEditForm(f => ({ ...f, apellidos: e.target.value.toUpperCase() }))} />
              </div>
              <div>
                <label className="label text-xs">Nombres *</label>
                <input className="input" value={editForm.nombres}
                  onChange={e => setEditForm(f => ({ ...f, nombres: e.target.value.toUpperCase() }))} />
              </div>
              <div>
                <label className="label text-xs">DNI *</label>
                <input className="input" maxLength={12} value={editForm.dni}
                  onChange={e => setEditForm(f => ({ ...f, dni: e.target.value.replace(/\D/g, '') }))} />
              </div>
              <div>
                <label className="label text-xs">Motivo</label>
                <input className="input" placeholder="Ej: Abandono de trabajo..."
                  value={editForm.motivo}
                  onChange={e => setEditForm(f => ({ ...f, motivo: e.target.value }))} />
              </div>
            </div>

            <div className="flex gap-2 mt-5">
              <button onClick={() => setEditEntry(null)} className="btn-secondary flex-1 py-2.5 text-sm">
                Cancelar
              </button>
              <button onClick={handleEditSave} disabled={editSaving}
                className="flex-1 py-2.5 text-sm font-semibold rounded-xl bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50 transition-colors flex items-center justify-center">
                {editSaving
                  ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : 'Guardar cambios'
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Confirmar eliminación ────────────────────────── */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setDeleteId(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-slide-up">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h2 className="font-bold text-stone-800">¿Eliminar de Personal no Apto?</h2>
                <p className="text-xs text-stone-500 mt-0.5">El postulante volverá a estado Pendiente</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDeleteId(null)} className="btn-secondary flex-1 py-2.5 text-sm">
                Cancelar
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 py-2.5 text-sm font-semibold rounded-xl bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center">
                {deleting
                  ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : 'Sí, eliminar'
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
