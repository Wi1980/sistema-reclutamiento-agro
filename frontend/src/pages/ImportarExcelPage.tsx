import { useState, useRef, useCallback } from 'react';
import {
  Upload, Download, FileSpreadsheet, CheckCircle2,
  AlertCircle, XCircle, RefreshCw, ChevronDown, ChevronUp,
} from 'lucide-react';
import api from '@/services/api';

interface RowResult {
  fila: number;
  dni: string;
  estado: 'importado' | 'duplicado' | 'error';
  mensaje?: string;
}

interface ImportResult {
  summary: { importados: number; duplicados: number; errores: number; total: number };
  rows: RowResult[];
  message: string;
}

const ESTADO_CFG = {
  importado: { label: 'Importado',  cls: 'bg-teal-100 text-teal-700',   icon: CheckCircle2 },
  duplicado: { label: 'Duplicado',  cls: 'bg-amber-100 text-amber-700', icon: AlertCircle  },
  error:     { label: 'Error',      cls: 'bg-red-100   text-red-600',    icon: XCircle      },
};

export default function ImportarExcelPage() {
  const [dragging, setDragging]     = useState(false);
  const [file, setFile]             = useState<File | null>(null);
  const [uploading, setUploading]   = useState(false);
  const [result, setResult]         = useState<ImportResult | null>(null);
  const [error, setError]           = useState('');
  const [showRows, setShowRows]     = useState<'all' | 'error' | 'duplicado' | 'importado'>('all');
  const [expandRows, setExpandRows] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function acceptFile(f: File) {
    const ok = /\.(xlsx|xls|csv)$/i.test(f.name);
    if (!ok) { setError('Solo se aceptan archivos .xlsx, .xls o .csv'); return; }
    setFile(f);
    setResult(null);
    setError('');
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) acceptFile(f);
  }, []);

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError('');
    setResult(null);
    try {
      const form = new FormData();
      form.append('archivo', file);
      const res = await api.post('/import/dni-excel', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(res.data);
      setExpandRows(false);
      setShowRows('all');
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Error al procesar el archivo');
    } finally {
      setUploading(false);
    }
  }

  async function handlePlantilla() {
    try {
      const res = await api.get('/import/plantilla', { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a   = document.createElement('a');
      a.href     = url;
      a.download = 'plantilla_importacion_dni.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('No se pudo descargar la plantilla');
    }
  }

  function reset() {
    setFile(null);
    setResult(null);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  }

  const filteredRows = result
    ? (showRows === 'all' ? result.rows : result.rows.filter(r => r.estado === showRows))
    : [];

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-stone-800">Importar DNIs</h1>
          <p className="text-stone-400 text-sm">Carga masiva de postulantes desde Excel</p>
        </div>
        <button onClick={handlePlantilla} className="btn-secondary text-sm py-2.5 self-start">
          <Download className="w-4 h-4" /> Descargar plantilla
        </button>
      </div>

      {/* Instrucciones */}
      <div className="card p-4 bg-blue-50 border-blue-100">
        <h3 className="text-sm font-semibold text-blue-800 mb-1.5">Formato del archivo</h3>
        <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
          <li>Columna <strong>DNI</strong> obligatoria (también acepta "Numero de Documento", "Documento")</li>
          <li>Columnas opcionales: Nombres, Apellidos, Celular, Departamento, Provincia, Distrito</li>
          <li>Formatos aceptados: <strong>.xlsx</strong>, <strong>.xls</strong>, <strong>.csv</strong> — máx. 10 MB</li>
          <li>Los DNIs duplicados en el sistema se omiten automáticamente</li>
        </ul>
      </div>

      {/* Dropzone */}
      {!result && (
        <div
          className={`card p-8 flex flex-col items-center gap-4 cursor-pointer transition-all border-2 border-dashed
            ${dragging ? 'border-agro-400 bg-agro-50' : 'border-stone-200 hover:border-agro-300 hover:bg-stone-50'}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) acceptFile(f); }}
          />
          {file ? (
            <>
              <div className="w-14 h-14 rounded-2xl bg-agro-100 flex items-center justify-center">
                <FileSpreadsheet className="w-7 h-7 text-agro-700" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-stone-800">{file.name}</p>
                <p className="text-sm text-stone-400">{(file.size / 1024).toFixed(0)} KB</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={e => { e.stopPropagation(); reset(); }}
                  className="btn-secondary text-sm py-2 px-4"
                >
                  Cambiar archivo
                </button>
                <button
                  onClick={e => { e.stopPropagation(); handleUpload(); }}
                  disabled={uploading}
                  className="btn-primary text-sm py-2 px-5"
                >
                  {uploading
                    ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Procesando...</>
                    : <><Upload className="w-4 h-4" /> Importar</>
                  }
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="w-14 h-14 rounded-2xl bg-stone-100 flex items-center justify-center">
                <Upload className="w-7 h-7 text-stone-400" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-stone-700">Arrastra tu archivo aquí</p>
                <p className="text-sm text-stone-400 mt-1">o haz clic para seleccionar</p>
                <p className="text-xs text-stone-300 mt-2">.xlsx · .xls · .csv · máx. 10 MB</p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Error global */}
      {error && (
        <div className="card p-4 bg-red-50 border-red-100 flex items-start gap-3">
          <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-700">Error al importar</p>
            <p className="text-sm text-red-600">{error}</p>
          </div>
          <button onClick={reset} className="ml-auto p-1 hover:bg-red-100 rounded-lg transition-colors">
            <RefreshCw className="w-4 h-4 text-red-400" />
          </button>
        </div>
      )}

      {/* Resultado */}
      {result && (
        <div className="space-y-4 animate-fade-in">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total filas',  value: result.summary.total,      cls: 'text-stone-700 bg-stone-50'  },
              { label: 'Importados',   value: result.summary.importados,  cls: 'text-teal-700  bg-teal-50'   },
              { label: 'Duplicados',   value: result.summary.duplicados,  cls: 'text-amber-700 bg-amber-50'  },
              { label: 'Errores',      value: result.summary.errores,     cls: 'text-red-600   bg-red-50'    },
            ].map(({ label, value, cls }) => (
              <div key={label} className={`rounded-2xl border border-stone-100 p-4 text-center ${cls}`}>
                <p className="text-2xl font-bold font-mono">{value}</p>
                <p className="text-xs mt-0.5 opacity-70">{label}</p>
              </div>
            ))}
          </div>

          {/* Success banner */}
          <div className="card p-3 bg-teal-50 border-teal-100 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-teal-600 flex-shrink-0" />
            <p className="text-sm text-teal-700 flex-1">{result.message}</p>
            <button onClick={reset} className="btn-secondary text-xs py-1.5 px-3">
              Nueva importación
            </button>
          </div>

          {/* Row details */}
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between gap-3">
              <p className="font-semibold text-stone-700 text-sm">Detalle por fila</p>
              <div className="flex items-center gap-2">
                {(['all', 'importado', 'duplicado', 'error'] as const).map(f => (
                  <button
                    key={f}
                    onClick={() => setShowRows(f)}
                    className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors
                      ${showRows === f ? 'bg-agro-600 text-white' : 'bg-stone-100 text-stone-500 hover:bg-stone-200'}`}
                  >
                    {f === 'all' ? 'Todos' : ESTADO_CFG[f].label}
                  </button>
                ))}
                <button
                  onClick={() => setExpandRows(p => !p)}
                  className="p-1.5 hover:bg-stone-100 rounded-lg transition-colors text-stone-400"
                >
                  {expandRows ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className={`overflow-y-auto overflow-x-auto transition-all ${expandRows ? 'max-h-[500px]' : 'max-h-48'}`}>
              <table className="w-full text-xs">
                <thead className="bg-stone-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-stone-500 font-semibold">Fila</th>
                    <th className="px-4 py-2.5 text-left text-stone-500 font-semibold">DNI</th>
                    <th className="px-4 py-2.5 text-left text-stone-500 font-semibold">Estado</th>
                    <th className="px-4 py-2.5 text-left text-stone-500 font-semibold">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {filteredRows.slice(0, expandRows ? undefined : 20).map(row => {
                    const cfg = ESTADO_CFG[row.estado];
                    const Icon = cfg.icon;
                    return (
                      <tr key={`${row.fila}-${row.dni}`} className="hover:bg-stone-50">
                        <td className="px-4 py-2 text-stone-400 font-mono">{row.fila}</td>
                        <td className="px-4 py-2 font-mono text-stone-700">{row.dni}</td>
                        <td className="px-4 py-2">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${cfg.cls}`}>
                            <Icon className="w-3 h-3" />
                            {cfg.label}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-stone-400">{row.mensaje || '—'}</td>
                      </tr>
                    );
                  })}
                  {!expandRows && filteredRows.length > 20 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-3 text-center text-stone-400">
                        ... {filteredRows.length - 20} filas más. Expande para ver todas.
                      </td>
                    </tr>
                  )}
                  {filteredRows.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-6 text-center text-stone-400">
                        No hay filas en esta categoría
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
