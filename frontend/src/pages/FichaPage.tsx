import { useState, useRef } from 'react';
import { CheckCircle2, AlertCircle, Search, ChevronRight } from 'lucide-react';
import api from '@/services/api';

type Step = 'dni' | 'datos' | 'exito' | 'ya_confirmo';
type CuentaOpcion = '' | 'apertura' | 'bcp' | 'cci';

const TALLAS_ROPA = ['XS', 'S', 'M', 'L', 'XL', 'XXL'];
const TALLAS_GTE  = [
  { value: 'XS',  label: '6 (XS)'  },
  { value: 'S',   label: '7 (S)'   },
  { value: 'M',   label: '8 (M)'   },
  { value: 'L',   label: '9 (L)'   },
  { value: 'XL',  label: '10 (XL)' },
  { value: 'XXL', label: '11 (XXL)' },
];
const DOMINIOS    = ['@gmail.com', '@hotmail.com', '@outlook.com'];

// ── helpers de validación ──────────────────────────────────────
function validarCelular(v: string) {
  if (!v) return '';
  const d = v.replace(/\D/g, '');
  if (d.length !== 9)     return 'Debe tener exactamente 9 dígitos';
  if (!d.startsWith('9')) return 'Debe empezar con 9';
  return '';
}

// BCP: XXX-XXXXXXX-X-XX  (13 dígitos)
function formatBCP(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 13);
  if (d.length <= 3)  return d;
  if (d.length <= 10) return `${d.slice(0,3)}-${d.slice(3)}`;
  if (d.length <= 11) return `${d.slice(0,3)}-${d.slice(3,10)}-${d.slice(10)}`;
  return `${d.slice(0,3)}-${d.slice(3,10)}-${d.slice(10,11)}-${d.slice(11)}`;
}

// CCI: XXX-XXXXXXX-X-XXXXXXXXX  (20 dígitos)
function formatCCI(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 20);
  if (d.length <= 3)  return d;
  if (d.length <= 10) return `${d.slice(0,3)}-${d.slice(3)}`;
  if (d.length <= 11) return `${d.slice(0,3)}-${d.slice(3,10)}-${d.slice(10)}`;
  return `${d.slice(0,3)}-${d.slice(3,10)}-${d.slice(10,11)}-${d.slice(11)}`;
}

function validarCuenta(opcion: 'bcp' | 'cci', cuenta: string) {
  if (!cuenta) return '';
  const d = cuenta.replace(/\D/g, '');
  if (opcion === 'bcp' && d.length !== 13) return 'El número de cuenta BCP debe tener exactamente 13 dígitos';
  if (opcion === 'cci' && d.length !== 20) return 'El CCI debe tener exactamente 20 dígitos';
  return '';
}

function validarNombreEmergencia(v: string) {
  if (!v) return '';
  const t = v.trim();
  if (t.length < 3) return 'Mínimo 3 caracteres';
  if (t.split(/\s+/).filter(Boolean).length < 2) return 'Escribe nombre y apellido';
  return '';
}

function validarCorreo(correo: string) {
  if (!correo.trim()) return '';
  const c = correo.trim();
  const at = c.indexOf('@');
  if (at < 2) return 'El correo es muy corto — ej: nombre@gmail.com';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c))
    return 'Correo inválido — ej: nombre@gmail.com';
  return '';
}

function toTitleCase(str: string): string {
  return str.replace(/(^|\s)(\S)/g, (_, sp, ch) => sp + ch.toUpperCase());
}

// Reconoce el banco guardado previamente y lo mapea a la opción del selector
function detectarOpcion(banco: string): CuentaOpcion {
  if (banco === 'BCP') return 'bcp';
  if (banco === 'Solicitar apertura BCP') return 'apertura';
  if (banco === 'Otros bancos' || banco === 'Otro') return 'cci';
  return '';
}

// ── componente campo con error ─────────────────────────────────
function Campo({
  label, error, required, children,
}: { label: string; error?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wider mb-1.5">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
      {error && (
        <p className="mt-1 text-[11px] text-red-500 flex items-center gap-1">
          <AlertCircle className="w-3 h-3 flex-shrink-0" />{error}
        </p>
      )}
    </div>
  );
}

const inputCls = (err?: string) =>
  `w-full px-3 py-3 rounded-xl border text-stone-800 text-sm bg-stone-50
   focus:outline-none focus:bg-white transition-all
   ${err
     ? 'border-red-300 focus:border-red-400 focus:ring-4 focus:ring-red-400/10'
     : 'border-stone-200 focus:border-agro-400 focus:ring-4 focus:ring-agro-400/10'
   }`;

const selectCls = (err?: string) =>
  `w-full px-3 py-3 rounded-xl border text-stone-800 text-sm bg-stone-50
   focus:outline-none focus:bg-white transition-all appearance-none
   ${err
     ? 'border-red-300 focus:border-red-400'
     : 'border-stone-200 focus:border-agro-400'
   }`;

// ── Tarjeta radio exclusiva ────────────────────────────────────
function RadioCard({
  selected, onClick, title, subtitle,
}: { selected: boolean; onClick: () => void; title: string; subtitle: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 text-left transition-all
        ${selected
          ? 'border-agro-600 bg-agro-50'
          : 'border-stone-200 bg-stone-50 hover:border-stone-300 active:bg-stone-100'
        }`}
    >
      <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all
        ${selected ? 'border-agro-600 bg-agro-600' : 'border-stone-300'}`}>
        {selected && <div className="w-2 h-2 rounded-full bg-white" />}
      </div>
      <div className="min-w-0">
        <p className={`text-sm font-semibold leading-tight ${selected ? 'text-agro-800' : 'text-stone-700'}`}>
          {title}
        </p>
        <p className="text-xs text-stone-400 mt-0.5 leading-snug">{subtitle}</p>
      </div>
    </button>
  );
}

// ── página principal ───────────────────────────────────────────
export default function FichaPage() {
  const [step, setStep]         = useState<Step>('dni');
  const [dniInput, setDniInput] = useState('');
  const [dniError, setDniError] = useState('');
  const [postulante, setPost]   = useState<{
    id: number; nombres: string; apellidos: string; dni: string; ya_confirmo: boolean;
    datos_previos?: boolean;
    banco?: string; numero_cuenta?: string; talla_ropa?: string; talla_guantes?: string;
    correo?: string; contacto_emergencia_nombre?: string; contacto_emergencia_celular?: string;
  } | null>(null);
  const [buscando, setBuscando]   = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Opción de cuenta bancaria — mutuamente exclusiva
  const [cuentaOpcion, setCuentaOpcion] = useState<CuentaOpcion>('');

  const [form, setForm] = useState({
    numero_cuenta: '',
    talla_ropa: '', talla_guantes: '',
    contacto_emergencia_nombre: '', contacto_emergencia_celular: '',
    correo: '',
  });

  const [consentimiento, setConsentimiento]       = useState(false);
  const [consentimientoErr, setConsentimientoErr] = useState(false);
  const [modalConsentimiento, setModalConsentimiento] = useState(false);

  const [errs, setErrs] = useState<Partial<Record<string, string>>>({});

  // refs para scroll-to-error en móvil
  const bancoRef   = useRef<HTMLDivElement>(null);
  const tallasRef  = useRef<HTMLDivElement>(null);
  const correoRef  = useRef<HTMLDivElement>(null);
  const nombreRef  = useRef<HTMLDivElement>(null);
  const celularRef = useRef<HTMLDivElement>(null);

  // Derivados para el contador de cuenta bancaria
  const cuentaTarget = cuentaOpcion === 'bcp' ? 13 : 20;
  const cuentaDigits = form.numero_cuenta.replace(/\D/g, '').length;
  const cuentaOk     = (cuentaOpcion === 'bcp' || cuentaOpcion === 'cci') && cuentaDigits === cuentaTarget;

  // Derivados para contador celular, validez correo y nombre
  const celularLen = form.contacto_emergencia_celular.length;
  const celularOk  = celularLen === 9 && form.contacto_emergencia_celular.startsWith('9');
  const correoOk   = form.correo.length >= 5 && form.correo.includes('@') && !validarCorreo(form.correo);
  const nombrePalabras = form.contacto_emergencia_nombre.trim().split(/\s+/).filter(Boolean).length;
  const nombreOk   = nombrePalabras >= 2 && !validarNombreEmergencia(form.contacto_emergencia_nombre);

  // ── Paso 1: buscar DNI ──────────────────────────────────────
  function validarDni(v: string) {
    if (!v) return 'Ingresa tu DNI';
    if (v.length < 8) {
      const faltan = 8 - v.length;
      return faltan === 1 ? 'Falta 1 dígito' : `Faltan ${faltan} dígitos`;
    }
    return '';
  }

  async function handleBuscar() {
    const dni = dniInput.replace(/\D/g, '');
    const err = validarDni(dni);
    if (err) { setDniError(err); return; }
    setDniError(''); setBuscando(true);
    try {
      const { data } = await api.get(`/ficha/buscar?dni=${dni}`);
      setPost(data.data);
      // Restaurar opción bancaria y cuenta si el colaborador ya tiene datos previos
      setCuentaOpcion(detectarOpcion(data.data.banco || ''));
      setForm({
        numero_cuenta:               data.data.numero_cuenta               || '',
        talla_ropa:                  data.data.talla_ropa                  || '',
        talla_guantes:               data.data.talla_guantes               || '',
        correo:                      data.data.correo                      || '',
        contacto_emergencia_nombre:  data.data.contacto_emergencia_nombre  || '',
        contacto_emergencia_celular: data.data.contacto_emergencia_celular || '',
      });
      setStep('datos');
    } catch (e: any) {
      const msg    = e?.response?.data?.message || '';
      const nombre = e?.response?.data?.nombre  || '';
      if (msg === 'ya_confirmo') {
        setPost({ id: 0, nombres: nombre.split(' ').slice(0, 2).join(' ') || '', apellidos: '', dni, ya_confirmo: true });
        setStep('ya_confirmo');
      } else {
        setDniError(msg || 'DNI no encontrado o no habilitado para este llamado');
      }
    } finally {
      setBuscando(false);
    }
  }

  // ── Paso 2: validar y confirmar ──────────────────────────────
  function setField<K extends keyof typeof form>(k: K, v: string) {
    setForm(f => ({ ...f, [k]: v }));
    setErrs(e => ({ ...e, [k]: '' }));
  }

  function seleccionarOpcion(op: CuentaOpcion) {
    if (op !== cuentaOpcion) setForm(f => ({ ...f, numero_cuenta: '' }));
    setCuentaOpcion(op);
    setErrs(e => ({ ...e, banco: '', cuenta: '' }));
  }

  function blurCuenta() {
    if (cuentaOpcion === 'bcp' || cuentaOpcion === 'cci') {
      setErrs(e => ({ ...e, cuenta: validarCuenta(cuentaOpcion, form.numero_cuenta) }));
    }
  }

  function blurCelular() {
    setErrs(e => ({ ...e, contacto_emergencia_celular: validarCelular(form.contacto_emergencia_celular) }));
  }

  function blurNombre() {
    setErrs(e => ({ ...e, contacto_emergencia_nombre: validarNombreEmergencia(form.contacto_emergencia_nombre) }));
  }

  function blurCorreo() {
    setErrs(e => ({ ...e, correo: validarCorreo(form.correo) }));
  }

  function validarTodo(): boolean {
    const newErrs: Partial<Record<string, string>> = {};

    // Cuenta bancaria
    if (!cuentaOpcion) {
      newErrs.banco = 'Elige una opción de cuenta bancaria';
    } else if (cuentaOpcion === 'bcp' || cuentaOpcion === 'cci') {
      if (!form.numero_cuenta.trim()) {
        newErrs.cuenta = cuentaOpcion === 'bcp'
          ? 'Ingresa tu número de cuenta BCP'
          : 'Ingresa tu CCI (20 dígitos)';
      } else {
        const eCuenta = validarCuenta(cuentaOpcion, form.numero_cuenta);
        if (eCuenta) newErrs.cuenta = eCuenta;
      }
    }

    if (!form.talla_ropa)    newErrs.talla_ropa    = 'Selecciona tu talla de polo';
    if (!form.talla_guantes) newErrs.talla_guantes = 'Selecciona tu talla de guantes';

    if (!form.correo.trim()) {
      newErrs.correo = 'Ingresa tu correo electrónico';
    } else {
      const eCorreo = validarCorreo(form.correo);
      if (eCorreo) newErrs.correo = eCorreo;
    }

    if (!form.contacto_emergencia_nombre.trim()) {
      newErrs.contacto_emergencia_nombre = 'Ingresa el nombre del contacto';
    } else {
      const eNom = validarNombreEmergencia(form.contacto_emergencia_nombre);
      if (eNom) newErrs.contacto_emergencia_nombre = eNom;
    }

    if (!form.contacto_emergencia_celular.trim()) {
      newErrs.contacto_emergencia_celular = 'Ingresa el celular del contacto';
    } else {
      const eCel = validarCelular(form.contacto_emergencia_celular);
      if (eCel) newErrs.contacto_emergencia_celular = eCel;
    }

    setErrs(newErrs);

    // scroll al primer error en móvil
    if (newErrs.banco || newErrs.cuenta) {
      bancoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (newErrs.talla_ropa || newErrs.talla_guantes) {
      tallasRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (newErrs.correo) {
      correoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (newErrs.contacto_emergencia_nombre) {
      nombreRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (newErrs.contacto_emergencia_celular) {
      celularRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    return Object.keys(newErrs).length === 0;
  }

  async function handleConfirmar() {
    if (!validarTodo()) return;
    if (!consentimiento) { setConsentimientoErr(true); return; }
    if (!postulante) return;
    setGuardando(true); setSubmitError('');

    // Derivar valores de banco/cuenta según la opción elegida
    const banco        = cuentaOpcion === 'apertura' ? 'Solicitar apertura BCP'
                       : cuentaOpcion === 'bcp'      ? 'BCP'
                       :                               'Otros bancos';
    const numeroCuenta = cuentaOpcion === 'apertura' ? '' : form.numero_cuenta;

    try {
      await api.post('/ficha/confirmar', {
        dni:                         postulante.dni,
        banco,
        numero_cuenta:               numeroCuenta,
        talla_ropa:                  form.talla_ropa,
        talla_guantes:               form.talla_guantes,
        correo:                      form.correo,
        contacto_emergencia_nombre:  form.contacto_emergencia_nombre,
        contacto_emergencia_celular: form.contacto_emergencia_celular,
      });
      setStep('exito');
    } catch (e: any) {
      const msg = e?.response?.data?.message || '';
      if (msg === 'ya_confirmo') {
        setStep('ya_confirmo');
      } else {
        setSubmitError(msg || 'Error al guardar. Intenta de nuevo.');
      }
    } finally {
      setGuardando(false);
    }
  }

  function resetear() {
    setStep('dni'); setPost(null); setDniInput(''); setDniError('');
    setCuentaOpcion(''); setErrs({}); setSubmitError('');
    setConsentimiento(false); setConsentimientoErr(false);
  }

  // ── Render ──────────────────────────────────────────────────
  return (
    <>
    <div className="min-h-screen bg-stone-50 flex flex-col items-center py-8 px-4">

      {/* Logo */}
      <div className="mb-6 text-center">
        <img src="/logo.png" alt="Agroexportadora" className="h-10 mx-auto" />
      </div>

      <div className="w-full max-w-sm">

        {/* ── Paso 1: Ingresar DNI ── */}
        {step === 'dni' && (
          <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-6 space-y-5">
            <div>
              <h1 className="text-xl font-bold text-stone-800">Confirma tu asistencia</h1>
              <p className="text-stone-400 text-sm mt-1">Ingresa tu DNI para registrarte al llamado de hoy.</p>
            </div>

            <Campo label="Número de DNI" error={dniError} required>
              <div className="relative">
                <input
                  autoFocus
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={8}
                  autoComplete="off"
                  className={`${inputCls(dniError)} text-lg font-mono pr-14 ${
                    dniInput.length === 8 && !dniError
                      ? 'border-agro-400 ring-4 ring-agro-400/10'
                      : ''
                  }`}
                  placeholder="12345678"
                  value={dniInput}
                  onChange={e => {
                    const v = e.target.value.replace(/\D/g, '');
                    setDniInput(v);
                    if (v.length === 8) {
                      setDniError('');
                    } else if (dniError) {
                      const faltan = 8 - v.length;
                      setDniError(faltan === 1 ? 'Falta 1 dígito' : `Faltan ${faltan} dígitos`);
                    }
                  }}
                  onBlur={() => {
                    if (dniInput.length > 0 && dniInput.length < 8) {
                      const faltan = 8 - dniInput.length;
                      setDniError(faltan === 1 ? 'Falta 1 dígito' : `Faltan ${faltan} dígitos`);
                    }
                  }}
                  onKeyDown={e => e.key === 'Enter' && handleBuscar()}
                />
                <div className={`absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none ${
                  dniInput.length === 8 ? 'text-agro-500' : 'text-stone-300'
                }`}>
                  {dniInput.length === 8 ? (
                    <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <span className="text-xs font-mono font-semibold tabular-nums">
                      {dniInput.length}/8
                    </span>
                  )}
                </div>
              </div>
            </Campo>

            <button
              onClick={handleBuscar}
              disabled={buscando}
              className="w-full py-3.5 bg-agro-700 hover:bg-agro-800 active:bg-agro-900 disabled:opacity-60 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
            >
              {buscando
                ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                : <><Search className="w-4 h-4" /> Buscar</>
              }
            </button>
          </div>
        )}

        {/* ── Paso 2: Confirmar + datos ── */}
        {step === 'datos' && postulante && (
          <div className="space-y-4">

            {/* Nombre encontrado */}
            <div className="bg-agro-50 border border-agro-200 rounded-2xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-agro-700 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                {postulante.nombres.charAt(0)}
              </div>
              <div>
                <p className="text-xs text-agro-600 font-medium">DNI encontrado</p>
                <p className="font-bold text-agro-800 leading-tight">
                  {postulante.nombres} {postulante.apellidos}
                </p>
              </div>
            </div>

            {postulante.datos_previos && (
              <div className="flex items-start gap-2.5 p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-blue-700 text-sm">
                <svg className="w-4 h-4 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Cargamos tus datos del registro anterior. Revísalos y actualiza lo que haya cambiado.</span>
              </div>
            )}

            {/* Formulario de datos */}
            <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-5 space-y-5">
              <p className="text-sm font-semibold text-stone-700">
                Completa todos tus datos
                <span className="text-red-400 ml-1 text-xs font-normal">* Todos los campos son obligatorios</span>
              </p>

              {/* ── Cuenta bancaria — selector exclusivo ── */}
              <div ref={bancoRef} className="space-y-2">
                <label className="block text-xs font-semibold text-stone-500 uppercase tracking-wider">
                  Cuenta bancaria<span className="text-red-400 ml-0.5">*</span>
                </label>

                <RadioCard
                  selected={cuentaOpcion === 'apertura'}
                  onClick={() => seleccionarOpcion('apertura')}
                  title="Quiero que me abran una cuenta BCP"
                  subtitle="No tengo cuenta en ningún banco"
                />
                <RadioCard
                  selected={cuentaOpcion === 'bcp'}
                  onClick={() => seleccionarOpcion('bcp')}
                  title="Tengo cuenta BCP"
                  subtitle="Ingresaré mi número de 13 dígitos"
                />
                <RadioCard
                  selected={cuentaOpcion === 'cci'}
                  onClick={() => seleccionarOpcion('cci')}
                  title="Tengo cuenta en otro banco"
                  subtitle="Ingresaré mi CCI interbancario (20 dígitos)"
                />

                {errs.banco && (
                  <p className="text-[11px] text-red-500 flex items-center gap-1 pt-0.5">
                    <AlertCircle className="w-3 h-3 flex-shrink-0" />{errs.banco}
                  </p>
                )}

                {/* Campo numérico — solo visible para bcp o cci */}
                {(cuentaOpcion === 'bcp' || cuentaOpcion === 'cci') && (
                  <div className="pt-1 space-y-1">
                    <div className="relative">
                      <input
                        autoFocus
                        type="text"
                        inputMode="numeric"
                        maxLength={cuentaOpcion === 'bcp' ? 16 : 23}
                        autoComplete="off"
                        className={[
                          inputCls(errs.cuenta),
                          'font-mono tracking-wider pr-14',
                          cuentaOk && !errs.cuenta ? 'border-agro-400 ring-4 ring-agro-400/10' : '',
                        ].join(' ')}
                        placeholder={cuentaOpcion === 'bcp' ? 'XXX-XXXXXXX-X-XX' : 'XXX-XXXXXXX-X-XXXXXXXXX'}
                        value={form.numero_cuenta}
                        onChange={e => {
                          const val = cuentaOpcion === 'bcp'
                            ? formatBCP(e.target.value)
                            : formatCCI(e.target.value);
                          setField('numero_cuenta', val);
                          setErrs(v => ({ ...v, cuenta: '' }));
                        }}
                        onBlur={blurCuenta}
                      />
                      <div className={`absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none ${
                        cuentaOk ? 'text-agro-500' : 'text-stone-300'
                      }`}>
                        {cuentaOk ? (
                          <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          <span className="text-xs font-mono font-semibold tabular-nums">
                            {cuentaDigits}/{cuentaTarget}
                          </span>
                        )}
                      </div>
                    </div>
                    {errs.cuenta && (
                      <p className="text-[11px] text-red-500 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3 flex-shrink-0" />{errs.cuenta}
                      </p>
                    )}
                    {cuentaOpcion === 'cci' && !cuentaOk && (
                      <p className="text-[11px] text-stone-400">
                        El CCI tiene 20 dígitos. Lo encuentras en la app de tu banco o en tu estado de cuenta.
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* ── Tallas ── */}
              <div ref={tallasRef} className="grid grid-cols-2 gap-3">
                <Campo label="Talla de polo" error={errs.talla_ropa} required>
                  <div className="relative">
                    <select
                      className={selectCls(errs.talla_ropa)}
                      value={form.talla_ropa}
                      onChange={e => setField('talla_ropa', e.target.value)}
                    >
                      <option value="">—</option>
                      {TALLAS_ROPA.map(t => <option key={t}>{t}</option>)}
                    </select>
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-stone-400">▾</span>
                  </div>
                </Campo>
                <Campo label="Talla guantes" error={errs.talla_guantes} required>
                  <div className="relative">
                    <select
                      className={selectCls(errs.talla_guantes)}
                      value={form.talla_guantes}
                      onChange={e => setField('talla_guantes', e.target.value)}
                    >
                      <option value="">—</option>
                      {TALLAS_GTE.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-stone-400">▾</span>
                  </div>
                </Campo>
              </div>

              {/* ── Correo electrónico ── */}
              <div ref={correoRef}>
                <Campo label="Correo electrónico" error={errs.correo} required>
                  <div className="flex flex-col gap-2">
                    <div className="relative">
                      <input
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        maxLength={80}
                        className={[
                          inputCls(errs.correo),
                          'pr-10',
                          correoOk && !errs.correo ? 'border-agro-400 ring-4 ring-agro-400/10' : '',
                        ].join(' ')}
                        placeholder="ejemplo@gmail.com"
                        value={form.correo}
                        onChange={e => {
                          const v = e.target.value.replace(/\s/g, '').toLowerCase();
                          setForm(f => ({ ...f, correo: v }));
                          if (errs.correo && !validarCorreo(v)) setErrs(p => ({ ...p, correo: '' }));
                        }}
                        onBlur={blurCorreo}
                      />
                      {correoOk && !errs.correo && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-agro-500">
                          <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </div>
                    {/* Sugerencias de dominio mientras escribe antes del @ */}
                    {form.correo && !form.correo.includes('@') && (
                      <div className="flex flex-col gap-1.5">
                        {DOMINIOS.map(d => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => {
                              const v = `${form.correo.trim()}${d}`;
                              setForm(f => ({ ...f, correo: v }));
                              setErrs(p => ({ ...p, correo: '' }));
                            }}
                            className="flex items-center gap-2 px-3 py-2.5 rounded-xl border
                              bg-stone-50 text-stone-700 border-stone-200 text-sm text-left
                              hover:border-agro-400 hover:bg-agro-50 hover:text-agro-800 transition-all"
                          >
                            <span className="text-stone-400 text-xs shrink-0">→</span>
                            <span className="font-mono">{form.correo.trim()}{d}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </Campo>
              </div>

              {/* ── Contacto de emergencia ── */}
              <div ref={nombreRef}>
                <Campo label="Contacto de emergencia — Nombre" error={errs.contacto_emergencia_nombre} required>
                  <div className="relative">
                    <input
                      type="text"
                      autoComplete="off"
                      maxLength={100}
                      className={[
                        inputCls(errs.contacto_emergencia_nombre),
                        'pr-10',
                        nombreOk && !errs.contacto_emergencia_nombre ? 'border-agro-400 ring-4 ring-agro-400/10' : '',
                      ].join(' ')}
                      placeholder="Ej: Juan García"
                      value={form.contacto_emergencia_nombre}
                      onChange={e => {
                        // Bloquear números y símbolos — solo letras y espacios
                        const soloLetras = e.target.value.replace(/[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ\s]/g, '');
                        const val = toTitleCase(soloLetras);
                        setForm(f => ({ ...f, contacto_emergencia_nombre: val }));
                        if (errs.contacto_emergencia_nombre)
                          setErrs(p => ({ ...p, contacto_emergencia_nombre: validarNombreEmergencia(val) }));
                      }}
                      onBlur={blurNombre}
                    />
                    {nombreOk && !errs.contacto_emergencia_nombre && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-agro-500">
                        <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      </div>
                    )}
                  </div>
                  {!nombreOk && !errs.contacto_emergencia_nombre && form.contacto_emergencia_nombre.length > 0 && (
                    <p className="mt-1 text-[11px] text-stone-400">
                      Escribe nombre y apellido del contacto
                    </p>
                  )}
                </Campo>
              </div>

              <div ref={celularRef}>
                <Campo label="Contacto de emergencia — Celular" error={errs.contacto_emergencia_celular} required>
                  <div className="relative">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={9}
                      autoComplete="tel"
                      className={[
                        inputCls(errs.contacto_emergencia_celular),
                        'font-mono pr-14',
                        celularOk && !errs.contacto_emergencia_celular ? 'border-agro-400 ring-4 ring-agro-400/10' : '',
                      ].join(' ')}
                      placeholder="9XXXXXXXX"
                      value={form.contacto_emergencia_celular}
                      onChange={e => {
                        const v = e.target.value.replace(/\D/g, '');
                        // Bloquear si el primer dígito no es 9
                        if (v.length > 0 && !v.startsWith('9')) return;
                        setForm(f => ({ ...f, contacto_emergencia_celular: v }));
                        setErrs(p => ({ ...p, contacto_emergencia_celular: '' }));
                      }}
                      onBlur={blurCelular}
                    />
                    <div className={`absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none ${
                      celularOk ? 'text-agro-500' : 'text-stone-300'
                    }`}>
                      {celularOk ? (
                        <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      ) : (
                        <span className="text-xs font-mono font-semibold tabular-nums">
                          {celularLen}/9
                        </span>
                      )}
                    </div>
                  </div>
                </Campo>
              </div>
            </div>

            {/* ── Consentimiento Ley 29733 ── */}
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => consentimiento ? setConsentimiento(false) : setModalConsentimiento(true)}
                className={`mt-0.5 w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center transition-all
                  ${consentimiento
                    ? 'bg-agro-700 border-agro-700'
                    : consentimientoErr
                      ? 'border-red-400 bg-red-50'
                      : 'border-stone-300 hover:border-agro-500'
                  }`}
              >
                {consentimiento && (
                  <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </button>
              <div className="flex-1 text-sm text-stone-600 leading-snug">
                He leído y acepto{' '}
                <button
                  type="button"
                  onClick={() => setModalConsentimiento(true)}
                  className="text-agro-700 underline font-medium hover:text-agro-900 transition-colors"
                >
                  las políticas de consentimiento de datos
                </button>
                <span className="text-red-500"> *</span>
                {consentimientoErr && (
                  <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 flex-shrink-0" />
                    Debes aceptar para continuar
                  </p>
                )}
              </div>
            </div>

            {submitError && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />{submitError}
              </div>
            )}

            <button
              onClick={handleConfirmar}
              disabled={guardando}
              className="w-full py-3.5 bg-agro-700 hover:bg-agro-800 active:bg-agro-900 disabled:opacity-60 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
            >
              {guardando
                ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                : <><CheckCircle2 className="w-4 h-4" /> Confirmar asistencia</>
              }
            </button>

            <button
              onClick={resetear}
              className="w-full py-2.5 text-stone-400 text-sm flex items-center justify-center gap-1 hover:text-stone-600 transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5 rotate-180" /> Volver
            </button>
          </div>
        )}

        {/* ── Paso 3b: Ya confirmó ── */}
        {step === 'ya_confirmo' && (() => {
          const nombre = postulante?.nombres || '';
          const dni    = postulante?.dni || dniInput.replace(/\D/g, '');
          const msgWA  = encodeURIComponent(
            `Hola, soy ${nombre} (DNI: ${dni}). Me registré en el llamado de hoy pero necesito corregir algunos de mis datos. ¿Me pueden ayudar por favor?`
          );
          const waLink = `https://wa.me/51998750144?text=${msgWA}`;
          return (
            <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-8 space-y-6">
              <div className="text-center space-y-2">
                <div className="w-14 h-14 bg-agro-100 rounded-2xl flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-7 h-7 text-agro-700" />
                </div>
                <h2 className="text-lg font-bold text-stone-800">
                  {nombre ? `¡Hola, ${nombre}!` : 'Asistencia registrada'}
                </h2>
                <p className="text-stone-400 text-sm">Tu asistencia y datos ya están guardados en el sistema.</p>
              </div>

              <div className="border-t border-stone-100 pt-5 space-y-3">
                <p className="text-xs font-semibold text-stone-400 uppercase tracking-wider">¿Necesitas corregir algún dato?</p>
                <p className="text-sm text-stone-500 leading-relaxed">
                  Si cometiste un error en tu cuenta bancaria, tallas, correo u otro campo, envía un mensaje a{' '}
                  <span className="font-semibold text-stone-700">Gestión Humana</span> con los datos correctos y lo actualizamos por ti.
                </p>
                <a
                  href={waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2.5 w-full py-3.5 bg-[#25D366] hover:bg-[#1ebe5d] text-white font-bold rounded-xl transition-all text-sm shadow-sm"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                  </svg>
                  Enviar datos a corregir
                </a>
              </div>

              <p className="text-center text-stone-300 text-xs">Empresa Agroexportadora S.A.</p>
            </div>
          );
        })()}

        {/* ── Paso 3: Éxito ── */}
        {step === 'exito' && postulante && (
          <div className="bg-white rounded-2xl shadow-sm border border-stone-100 p-8 text-center space-y-4">
            <div className="w-16 h-16 bg-agro-100 rounded-2xl flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-agro-700" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-stone-800">¡Asistencia confirmada!</h2>
              <p className="text-stone-500 text-sm mt-1">{postulante.nombres} {postulante.apellidos}</p>
            </div>
            <p className="text-stone-400 text-sm">Ya puedes guardar tu celular. Bienvenido al equipo.</p>
            <div className="pt-2">
              <div className="w-10 h-1 bg-agro-500 rounded-full mx-auto" />
            </div>
            <p className="text-stone-300 text-xs">Empresa Agroexportadora S.A.</p>
          </div>
        )}

      </div>
    </div>

    {/* ── Modal consentimiento Ley 29733 ── */}
    {modalConsentimiento && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-5">
          <div>
            <h3 className="text-base font-bold text-stone-800">Política de Consentimiento</h3>
            <p className="text-xs text-stone-400 mt-0.5">Ley N° 29733 — Protección de Datos Personales</p>
          </div>

          <div className="bg-indigo-50 border-2 border-indigo-200 rounded-2xl p-4 flex items-start gap-3">
            <div className="w-6 h-6 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-3.5 h-3.5 text-white" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-stone-800">Autorizo el uso de mis datos personales</p>
              <p className="text-xs text-stone-500 mt-1.5 leading-relaxed">
                Autorizo a <b className="text-stone-700">Empresa Agroexportadora S.A.</b> a recopilar
                y utilizar mis datos personales (cuenta bancaria, tallas, correo electrónico y contacto de
                emergencia) exclusivamente para fines de contratación y planilla, de acuerdo con la{' '}
                <b className="text-stone-700">Ley N° 29733</b> de Protección de Datos Personales.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setModalConsentimiento(false)}
              className="flex-1 py-2.5 border border-stone-200 text-stone-600 text-sm font-medium rounded-xl hover:bg-stone-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => { setConsentimiento(true); setConsentimientoErr(false); setModalConsentimiento(false); }}
              className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-all"
            >
              Acepto y autorizo
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
