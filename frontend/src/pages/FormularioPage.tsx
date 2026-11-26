import { useState, useEffect } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle, AlertCircle, Loader2, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SelectNative } from '@/components/ui/select-native';
import { GeoCombobox } from '@/components/ui/geo-combobox';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import api from '@/services/api';

// ─── tipos ───────────────────────────────────────────────────
interface GeoOption { id: number; nombre: string; }

// ─── helpers edad ────────────────────────────────────────────
function calcularEdad(fecha: string): number {
  const birth = new Date(fecha);
  if (isNaN(birth.getTime())) return NaN;
  const hoy = new Date();
  let edad = hoy.getFullYear() - birth.getFullYear();
  const m = hoy.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && hoy.getDate() < birth.getDate())) edad--;
  return edad;
}

// ─── zod schema ──────────────────────────────────────────────
const schema = z.object({
  dni: z
    .string()
    .min(1, 'El DNI es obligatorio')
    .regex(/^\d{8}$/, 'Debe tener exactamente 8 dígitos'),

  celular: z
    .string()
    .min(1, 'El celular es obligatorio')
    .regex(/^9\d{8}$/, 'Debe tener 9 dígitos e iniciar con 9'),

  nombres: z
    .string()
    .min(1, 'Los nombres son obligatorios')
    .min(2, 'Mínimo 2 caracteres')
    .max(100, 'Máximo 100 caracteres')
    .regex(/^[\p{L}\s]+$/u, 'Solo letras, sin números ni símbolos')
    .refine(v => /[aeiouáéíóúäëïöüàèìòùâêîôûãõ]/i.test(v), 'Debe contener al menos una vocal')
    .refine(v => !/(.)\1{3,}/i.test(v), 'Evita repetir el mismo carácter más de 3 veces'),

  apellidos: z
    .string()
    .min(1, 'Los apellidos son obligatorios')
    .min(2, 'Mínimo 2 caracteres')
    .max(100, 'Máximo 100 caracteres')
    .regex(/^[\p{L}\s]+$/u, 'Solo letras, sin números ni símbolos')
    .refine(v => /[aeiouáéíóúäëïöüàèìòùâêîôûãõ]/i.test(v), 'Debe contener al menos una vocal')
    .refine(v => !/(.)\1{3,}/i.test(v), 'Evita repetir el mismo carácter más de 3 veces'),

  // ── Perfil y datos comunes (v10) ──
  // <select> con opciones fijas: basta exigir que no esté vacío.
  // El conjunto de valores válidos lo valida el backend.
  area_interes: z.string().min(1, 'Selecciona un área de interés'),

  sexo: z.string().min(1, 'Selecciona el género'),

  fecha_nacimiento: z
    .string()
    .min(1, 'Ingresa tu fecha de nacimiento'),

  discapacidad: z
    .string()
    .min(1, 'Indícanos si tienes alguna discapacidad'),

  // Solo aplica a Administrativo/Operativo (validado en superRefine).
  profesion: z.string().optional(),       // id del catálogo

  departamento_id:   z.string().min(1, 'Selecciona un departamento'),
  provincia_id:      z.string().min(1, 'Selecciona una provincia'),
  distrito_id:       z.string().min(1, 'Selecciona un distrito'),
  centro_poblado_id: z.string().min(1, 'Selecciona un centro poblado'),

  como_entero: z.string().min(1, 'Selecciona cómo conociste a Agroexportadora'),

  acepta_politicas: z
    .boolean()
    .refine(v => v === true, 'Debes aceptar las políticas para continuar'),
}).superRefine((val, ctx) => {
  // Edad: mensaje dinámico que le dice al postulante su edad actual.
  if (val.fecha_nacimiento) {
    const edad = calcularEdad(val.fecha_nacimiento);
    if (!Number.isFinite(edad) || edad > 100) {
      ctx.addIssue({ code: 'custom', path: ['fecha_nacimiento'], message: 'Fecha de nacimiento inválida' });
    } else if (edad < 18) {
      ctx.addIssue({
        code: 'custom',
        path: ['fecha_nacimiento'],
        message: `Debes tener al menos 18 años (actualmente tienes ${edad})`,
      });
    }
  }

  // Profesión / especialidad: obligatoria solo para Administrativo/Operativo.
  if (val.area_interes === 'Administrativo/Operativo' && !val.profesion) {
    ctx.addIssue({ code: 'custom', path: ['profesion'], message: 'Selecciona tu profesión o especialidad' });
  }
});

type FormValues = z.infer<typeof schema>;

// ─── constantes ──────────────────────────────────────────────
const COMO_ENTERO_OPTIONS = [
  'Facebook', 'Instagram', 'TikTok', 'Amigo/Familiar',
  'Volante', 'Periódico', 'Radio', 'Otro',
];

const CV_MAX_BYTES = 3 * 1024 * 1024; // 3 MB

// Límites del selector de fecha de nacimiento: entre 18 y 100 años.
const _hoy = new Date();
const MAX_FECHA_NAC = new Date(_hoy.getFullYear() - 18,  _hoy.getMonth(), _hoy.getDate()).toISOString().split('T')[0];
const MIN_FECHA_NAC = new Date(_hoy.getFullYear() - 100, _hoy.getMonth(), _hoy.getDate()).toISOString().split('T')[0];

const POLITICA_TEXTO = `Autorizo de manera libre, expresa, previa e informada a EMPRESA AGROEXPORTADORA S.A. (en adelante "Empresa Agroexportadora"), domiciliada en CAR. PANAMERICANA NORTE KM. 730 FND. CERRO COLORADO, LA LIBERTAD - CHEPEN - PACANGA, para que recolecte, recopile y almacene en su banco de datos de Potenciales Trabajadores, los datos personales que suministre, tales como nombres completos, teléfonos, correos, dirección, documento nacional de identidad y cualquier otro que proporcione con ocasión de la firma de este documento.

Su autorización y almacenamiento es por el plazo de 10 años y el tiempo necesario para cumplir con las leyes aplicables. Su información será almacenada en nuestros sistemas informáticos.

EMPRESA AGROEXPORTADORA garantiza la seguridad y confidencialidad del tratamiento de sus datos personales.

La finalidad del tratamiento y usos previstos son: (i) informarle sobre campañas de reclutamiento para un puesto de trabajo o de servicio; (ii) informarle sobre campañas institucionales de EMPRESA AGROEXPORTADORA; y, (iii) informarle sobre eventos sociales para la comunidad.

Usted puede ejercer gratuitamente sus derechos como titular de datos personales enviando una comunicación escrita al correo informes@empresa.com, con el asunto "Derechos Datos Personales".`;

// ─── FieldError ───────────────────────────────────────────────
function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="flex items-center justify-center gap-1 text-xs text-red-500 mt-1 text-center px-2">
      <AlertCircle className="w-3 h-3 flex-shrink-0" />{message}
    </p>
  );
}

// ─── Field wrapper ────────────────────────────────────────────
// El nombre del campo va DENTRO del recuadro (placeholder), por eso el
// wrapper ya no dibuja una etiqueta encima: solo agrupa el control y su error.
function Field({ error, children }: {
  error?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      {children}
      <FieldError message={error} />
    </div>
  );
}

// ─── Estilo "píldora" ─────────────────────────────────────────
// Recuadro redondeado con borde verde y texto centrado. Cuando el campo
// tiene error dejamos que el borde rojo del componente base prevalezca.
const pill = (err?: boolean) =>
  cn('h-9 rounded-full text-center', !err && 'border-agro-500 hover:border-agro-600');
const pillSelect = (err?: boolean) =>
  cn('h-9 rounded-full text-center pl-9', !err && 'border-agro-500 hover:border-agro-600');

// ─── Modal política ───────────────────────────────────────────
function ModalPolitica({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col"
        style={{ maxHeight: '82vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
          <h3 className="font-bold text-stone-800">Políticas de Consentimiento</h3>
          <button type="button" onClick={onClose} className="text-stone-400 hover:text-stone-700 p-1 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto text-sm text-stone-600 leading-relaxed whitespace-pre-line flex-1">
          {POLITICA_TEXTO}
        </div>
        <div className="px-6 py-4 border-t border-stone-100">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-3 rounded-xl bg-agro-600 text-white font-semibold hover:bg-agro-700 transition-colors"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Pantalla éxito ───────────────────────────────────────────
const COUNTDOWN = 5;

function PantallaExito({ onReset }: { onReset: () => void }) {
  const [segundos, setSegundos] = useState(COUNTDOWN);

  useEffect(() => {
    const interval = setInterval(() => {
      setSegundos(s => {
        if (s <= 1) { clearInterval(interval); onReset(); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [onReset]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50 p-6">
      <div className="text-center max-w-sm w-full animate-slide-up">
        <div className="w-20 h-20 bg-agro-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <CheckCircle className="w-10 h-10 text-agro-600" />
        </div>
        <img src="/logo.png" alt="Agroexportadora" className="h-10 mx-auto mb-6 object-contain" />
        <h2 className="font-poppins font-extrabold text-2xl text-stone-900 mb-3">¡Registro exitoso!</h2>
        <p className="text-stone-500 leading-relaxed mb-4">
          Gracias por postular a Empresa Agroexportadora. Nos comunicaremos contigo a la brevedad.
        </p>
        <div className="w-full bg-stone-200 rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-agro-600 h-1.5 rounded-full transition-all duration-1000 ease-linear"
            style={{ width: `${(segundos / COUNTDOWN) * 100}%` }}
          />
        </div>
        <p className="text-xs text-stone-400 mt-2">
          Volviendo al formulario en{' '}
          <span className="font-semibold text-stone-600">{segundos}s</span>...
        </p>
      </div>
    </div>
  );
}


// ─── Componente principal ─────────────────────────────────────
export default function FormularioPage() {
  const [submitted, setSubmitted]       = useState(false);
  const [serverError, setServerError]   = useState('');
  const [modalAbierto, setModalAbierto] = useState(false);

  // CV (solo administrativos) — fuera de react-hook-form por ser archivo
  const [cvFile, setCvFile]   = useState<File | null>(null);
  const [cvError, setCvError] = useState('');

  const [shakeNombres,   setShakeNombres]   = useState(false);
  const [shakeApellidos, setShakeApellidos] = useState(false);

  function shake(field: 'nombres' | 'apellidos') {
    const set = field === 'nombres' ? setShakeNombres : setShakeApellidos;
    set(false);
    // Doble RAF para forzar que el navegador resetee la animación si ya estaba activa
    requestAnimationFrame(() => requestAnimationFrame(() => {
      set(true);
      setTimeout(() => set(false), 400);
    }));
  }

  const [departamentos, setDepartamentos] = useState<GeoOption[]>([]);
  const [provincias, setProvincias]       = useState<GeoOption[]>([]);
  const [distritos, setDistritos]         = useState<GeoOption[]>([]);
  const [centros, setCentros]             = useState<GeoOption[]>([]);
  const [loadingGeo, setLoadingGeo]       = useState<'prov' | 'dist' | 'centro' | null>(null);

  const [profesiones, setProfesiones]           = useState<GeoOption[]>([]);
  const [loadingProfesiones, setLoadingProfesiones] = useState(false);

  const {
    register, handleSubmit, control, watch, setValue, reset, trigger,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      dni: '', celular: '', nombres: '', apellidos: '',
      area_interes: '', sexo: '', fecha_nacimiento: '', discapacidad: '',
      profesion: '',
      departamento_id: '', provincia_id: '', distrito_id: '',
      centro_poblado_id: '', como_entero: '', acepta_politicas: false,
    },
  });

  const deptId = watch('departamento_id');
  const provId = watch('provincia_id');
  const distId = watch('distrito_id');
  const areaInteres = watch('area_interes');
  const esAdministrativo = areaInteres === 'Administrativo/Operativo';

  // Edad en vivo para feedback inmediato bajo el campo de fecha de nacimiento.
  const fechaNacValue = watch('fecha_nacimiento');
  const edadEnVivo = fechaNacValue ? calcularEdad(fechaNacValue) : NaN;

  useEffect(() => {
    api.get('/geo/departamentos')
      .then(r => setDepartamentos(r.data.data))
      .catch(() => setServerError('Error al cargar los departamentos. Recarga la página.'));
  }, []);

  useEffect(() => {
    setLoadingProfesiones(true);
    api.get('/profesiones')
      .then(r => setProfesiones(r.data.data))
      .catch(() => {})
      .finally(() => setLoadingProfesiones(false));
  }, []);

  useEffect(() => {
    if (!deptId) { setProvincias([]); return; }
    setLoadingGeo('prov');
    setValue('provincia_id', ''); setValue('distrito_id', ''); setValue('centro_poblado_id', '');
    setDistritos([]); setCentros([]);
    api.get(`/geo/provincias/${deptId}`)
      .then(r => setProvincias(r.data.data))
      .catch(() => setServerError('Error al cargar provincias. Intenta de nuevo.'))
      .finally(() => setLoadingGeo(null));
  }, [deptId]);

  useEffect(() => {
    if (!provId) { setDistritos([]); return; }
    setLoadingGeo('dist');
    setValue('distrito_id', ''); setValue('centro_poblado_id', '');
    setCentros([]);
    api.get(`/geo/distritos/${provId}`)
      .then(r => setDistritos(r.data.data))
      .catch(() => setServerError('Error al cargar distritos. Intenta de nuevo.'))
      .finally(() => setLoadingGeo(null));
  }, [provId]);

  useEffect(() => {
    if (!distId) { setCentros([]); return; }
    setLoadingGeo('centro');
    setValue('centro_poblado_id', '');
    api.get(`/geo/centros-poblados/${distId}`)
      .then(r => setCentros(r.data.data))
      .catch(() => {})
      .finally(() => setLoadingGeo(null));
  }, [distId]);

  function handleCvChange(e: React.ChangeEvent<HTMLInputElement>) {
    setCvError('');
    const f = e.target.files?.[0] || null;
    if (!f) { setCvFile(null); return; }
    const esPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
    if (!esPdf)                 { setCvError('El CV debe ser un archivo PDF'); setCvFile(null); e.target.value = ''; return; }
    if (f.size > CV_MAX_BYTES)  { setCvError('El CV no debe superar los 3 MB'); setCvFile(null); e.target.value = ''; return; }
    setCvFile(f);
  }

  async function onSubmit(data: FormValues) {
    setServerError('');
    const esAdmin = data.area_interes === 'Administrativo/Operativo';
    if (esAdmin && !cvFile) { setCvError('Adjunta tu CV en PDF'); return; }
    try {
      const deptNombre   = departamentos.find(d => String(d.id) === data.departamento_id)?.nombre ?? '';
      const provNombre   = provincias.find(p => String(p.id) === data.provincia_id)?.nombre ?? '';
      const distNombre   = distritos.find(d => String(d.id) === data.distrito_id)?.nombre ?? '';
      const centroNombre = centros.find(c => String(c.id) === data.centro_poblado_id)?.nombre ?? null;

      // Profesión: del catálogo (id → nombre). Solo administrativos.
      const profNombre = esAdmin
        ? (profesiones.find(p => String(p.id) === data.profesion)?.nombre ?? null)
        : null;

      const res = await api.post('/postulantes', {
        nombres: data.nombres.trim(), apellidos: data.apellidos.trim(),
        dni: data.dni, celular: data.celular,
        departamento: deptNombre, provincia: provNombre,
        distrito: distNombre, centro_poblado: centroNombre,
        como_entero: data.como_entero, acepta_politicas: true,
        // Perfiles Campo / Administrativo (v10)
        area_interes: data.area_interes,
        sexo: data.sexo,
        fecha_nacimiento: data.fecha_nacimiento,
        discapacidad: data.discapacidad === 'Sí',
        profesion: profNombre,
      });

      // Subir el CV (administrativos) tras crear el registro (Ola 2).
      const nuevoId = res.data?.id;
      if (esAdmin && cvFile && nuevoId) {
        const fd = new FormData();
        fd.append('cv', cvFile);
        try {
          await api.post(`/postulantes/${nuevoId}/cv`, fd, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
        } catch {
          // El registro ya quedó creado; si el CV falla no perdemos la postulación.
        }
      }
      setSubmitted(true);
    } catch (err: any) {
      setServerError(err.response?.data?.message || 'Error al enviar. Intenta nuevamente.');
    }
  }

  if (submitted) return <PantallaExito onReset={() => { setSubmitted(false); reset(); setCvFile(null); setCvError(''); }} />;

  const dniField     = register('dni');
  const celularField = register('celular');
  const nombresField  = register('nombres');
  const apellidosField = register('apellidos');

  return (
    <div className="min-h-screen flex flex-col lg:flex-row bg-white">

      {/* ─── Panel izquierdo: imagen de fondo (fija mientras se desplaza el form) ─── */}
      <div className="hidden lg:block lg:w-[50%] xl:w-[54%] relative lg:sticky lg:top-0 lg:h-screen self-start">
        <img
          src="/img.jpg"
          alt="Equipo Empresa Agroexportadora"
          className="absolute inset-0 w-full h-full object-cover"
        />
      </div>

      {/* ─── Panel derecho: formulario (scroll del documento, sin scroll interno) ─── */}
      <div className="w-full lg:w-[50%] xl:w-[46%] flex flex-col lg:min-h-screen font-body">

        {/* fondo texturizado sutil */}
        <div
          className="flex-1 px-6 sm:px-10 lg:px-12 py-8 lg:py-5 flex flex-col lg:justify-center"
          style={{
            background: 'radial-gradient(ellipse at 80% 0%, #eef2ff 0%, #ffffff 60%)',
          }}
        >
          <div className="max-w-md w-full mx-auto">

            {/* logo + título centrados */}
            <div className="text-center mb-5">
              <img
                src="/logo.png"
                alt="Agroexportadora"
                className="h-10 object-contain mx-auto mb-3"
              />
              <h1 className="font-poppins font-extrabold text-[1.65rem] text-stone-900 leading-tight tracking-tight mb-1">
                ¡Trabaja con nosotros!
              </h1>
              <p className="font-poppins text-stone-400 text-[0.82rem] font-medium tracking-wide">
                Ingresa tus datos para que podamos contactarte.
              </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-3">

              {/* DNI + Celular */}
              <div className="grid grid-cols-2 gap-3">
                <Field error={errors.dni?.message}>
                  <Input
                    placeholder="DNI"
                    aria-label="DNI"
                    maxLength={8}
                    inputMode="numeric"
                    error={!!errors.dni}
                    className={pill(!!errors.dni)}
                    {...dniField}
                    onChange={e => {
                      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 8);
                      dniField.onChange(e);
                    }}
                    onKeyDown={e => {
                      const allowed = ['Backspace','Delete','Tab','ArrowLeft','ArrowRight','Home','End'];
                      if (!allowed.includes(e.key) && !/^\d$/.test(e.key)) e.preventDefault();
                    }}
                    onPaste={e => { if (!/^\d+$/.test(e.clipboardData.getData('text'))) e.preventDefault(); }}
                  />
                </Field>
                <Field error={errors.celular?.message}>
                  <Input
                    placeholder="Celular"
                    aria-label="Celular"
                    maxLength={9}
                    inputMode="tel"
                    error={!!errors.celular}
                    className={pill(!!errors.celular)}
                    {...celularField}
                    onChange={e => {
                      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 9);
                      celularField.onChange(e);
                    }}
                    onKeyDown={e => {
                      const val = e.currentTarget.value;
                      const allowed = ['Backspace','Delete','Tab','ArrowLeft','ArrowRight','Home','End'];
                      if (allowed.includes(e.key)) return;
                      if (!/^\d$/.test(e.key)) { e.preventDefault(); return; }
                      if (val.length === 0 && e.key !== '9') e.preventDefault();
                    }}
                    onPaste={e => {
                      const t = e.clipboardData.getData('text');
                      if (!/^\d+$/.test(t) || !t.startsWith('9')) e.preventDefault();
                    }}
                  />
                </Field>
              </div>

              {/* Nombres + Apellidos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field error={errors.nombres?.message}>
                  <div className={shakeNombres ? 'animate-shake' : ''}>
                    <Input
                      placeholder="Nombres"
                      aria-label="Nombres"
                      error={!!errors.nombres}
                      className={cn('uppercase', pill(!!errors.nombres))}
                      {...nombresField}
                      onKeyDown={e => {
                        const val = e.currentTarget.value;
                        const allowed = ['Backspace','Delete','Tab','ArrowLeft','ArrowRight','Home','End'];
                        if (allowed.includes(e.key)) return;
                        if (e.key === ' ') { if (val.length === 0 || val.endsWith(' ')) { shake('nombres'); e.preventDefault(); } return; }
                        if (!/^\p{L}$/u.test(e.key)) { shake('nombres'); e.preventDefault(); return; }
                        const start = e.currentTarget.selectionStart ?? val.length;
                        const before = val.slice(0, start).toUpperCase();
                        const key = e.key.toUpperCase();
                        let count = 0;
                        for (let i = before.length - 1; i >= 0; i--) {
                          if (before[i] === key) count++; else break;
                        }
                        if (count >= 3) { shake('nombres'); e.preventDefault(); }
                      }}
                      onPaste={e => {
                        const t = e.clipboardData.getData('text');
                        if (!/^[\p{L}\s]+$/u.test(t) || /\s{2,}/.test(t) || /(.)\1{3,}/i.test(t)) {
                          shake('nombres'); e.preventDefault();
                        }
                      }}
                      onChange={e => { e.target.value = e.target.value.replace(/[^\p{L}\s]/gu, '').toUpperCase(); nombresField.onChange(e); }}
                    />
                  </div>
                </Field>
                <Field error={errors.apellidos?.message}>
                  <div className={shakeApellidos ? 'animate-shake' : ''}>
                    <Input
                      placeholder="Apellidos"
                      aria-label="Apellidos"
                      error={!!errors.apellidos}
                      className={cn('uppercase', pill(!!errors.apellidos))}
                      {...apellidosField}
                      onKeyDown={e => {
                        const val = e.currentTarget.value;
                        const allowed = ['Backspace','Delete','Tab','ArrowLeft','ArrowRight','Home','End'];
                        if (allowed.includes(e.key)) return;
                        if (e.key === ' ') { if (val.length === 0 || val.endsWith(' ')) { shake('apellidos'); e.preventDefault(); } return; }
                        if (!/^\p{L}$/u.test(e.key)) { shake('apellidos'); e.preventDefault(); return; }
                        const start = e.currentTarget.selectionStart ?? val.length;
                        const before = val.slice(0, start).toUpperCase();
                        const key = e.key.toUpperCase();
                        let count = 0;
                        for (let i = before.length - 1; i >= 0; i--) {
                          if (before[i] === key) count++; else break;
                        }
                        if (count >= 3) { shake('apellidos'); e.preventDefault(); }
                      }}
                      onPaste={e => {
                        const t = e.clipboardData.getData('text');
                        if (!/^[\p{L}\s]+$/u.test(t) || /\s{2,}/.test(t) || /(.)\1{3,}/i.test(t)) {
                          shake('apellidos'); e.preventDefault();
                        }
                      }}
                      onChange={e => { e.target.value = e.target.value.replace(/[^\p{L}\s]/gu, '').toUpperCase(); apellidosField.onChange(e); }}
                    />
                  </div>
                </Field>
              </div>

              {/* Área de interés — define el flujo (Campo vs Administrativo) */}
              <Field error={errors.area_interes?.message}>
                <SelectNative aria-label="Área de interés" error={!!errors.area_interes} className={pillSelect(!!errors.area_interes)} {...register('area_interes')}>
                  <option value="">Área de interés</option>
                  <option value="Campo">Campo</option>
                  <option value="Administrativo/Operativo">Administrativo / Operativo</option>
                </SelectNative>
              </Field>

              {/* Género + Fecha de nacimiento */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field error={errors.sexo?.message}>
                  <SelectNative aria-label="Género" error={!!errors.sexo} className={pillSelect(!!errors.sexo)} {...register('sexo')}>
                    <option value="">Género</option>
                    <option value="M">Masculino</option>
                    <option value="F">Femenino</option>
                  </SelectNative>
                </Field>
                <Field error={errors.fecha_nacimiento?.message}>
                  {(() => {
                    const fechaField = register('fecha_nacimiento', { onChange: () => trigger('fecha_nacimiento') });
                    return (
                      <Input
                        type="text"
                        placeholder="Fecha de nacimiento"
                        aria-label="Fecha de nacimiento"
                        max={MAX_FECHA_NAC}
                        min={MIN_FECHA_NAC}
                        error={!!errors.fecha_nacimiento}
                        className={pill(!!errors.fecha_nacimiento)}
                        onFocus={e => { e.target.type = 'date'; }}
                        {...fechaField}
                        onBlur={e => { if (!e.target.value) e.target.type = 'text'; fechaField.onBlur(e); }}
                      />
                    );
                  })()}
                  {!errors.fecha_nacimiento && Number.isFinite(edadEnVivo) && edadEnVivo >= 18 && (
                    <p className="text-xs text-agro-600 mt-1">Tienes {edadEnVivo} años</p>
                  )}
                </Field>
              </div>

              {/* Discapacidad */}
              <Field error={errors.discapacidad?.message}>
                <SelectNative aria-label="¿Tienes alguna discapacidad?" error={!!errors.discapacidad} className={pillSelect(!!errors.discapacidad)} {...register('discapacidad')}>
                  <option value="">¿Tienes alguna discapacidad?</option>
                  <option value="No">No</option>
                  <option value="Sí">Sí</option>
                </SelectNative>
              </Field>

              {/* Bloque exclusivo Administrativo/Operativo */}
              {esAdministrativo && (
                <div className="rounded-xl border border-agro-200 bg-agro-50/40 p-3 space-y-3 animate-slide-up">
                  <p className="text-[10px] font-bold tracking-widest uppercase text-agro-700">
                    Datos para puesto administrativo / operativo
                  </p>
                  <Field error={errors.profesion?.message}>
                    <Controller
                      name="profesion"
                      control={control}
                      render={({ field }) => (
                        <GeoCombobox
                          pill
                          options={profesiones}
                          value={field.value || ''}
                          onChange={field.onChange}
                          loading={loadingProfesiones}
                          error={!!errors.profesion}
                          placeholder="Profesión / Especialidad"
                        />
                      )}
                    />
                  </Field>

                  <div className="space-y-0.5">
                    <Label className="text-stone-500 text-[10px] font-bold tracking-widest uppercase">
                      Adjuntar hoja de vida / CV (PDF, máx 3 MB)<span className="text-red-500 ml-0.5">*</span>
                    </Label>
                    <p className="text-[11px] text-stone-400 leading-snug -mt-0.5 mb-1 normal-case tracking-normal font-normal">
                      Sube tu hoja de vida <span className="font-semibold text-stone-500">simple</span>.
                      Aún no necesitas adjuntar certificados ni diplomas.
                    </p>
                    <label className={`flex items-center gap-2 cursor-pointer rounded-xl border px-3 py-2 text-sm bg-white transition-colors
                      ${cvError ? 'border-red-400' : 'border-stone-200 hover:border-agro-300'}`}>
                      <input type="file" accept="application/pdf,.pdf" onChange={handleCvChange} className="hidden" />
                      {cvFile
                        ? <span className="truncate text-stone-800">{cvFile.name}</span>
                        : <span className="text-stone-400">Seleccionar archivo PDF...</span>}
                    </label>
                    {cvFile && (
                      <button
                        type="button"
                        onClick={() => { setCvFile(null); setCvError(''); }}
                        className="text-xs text-red-500 hover:underline mt-0.5"
                      >
                        Quitar archivo
                      </button>
                    )}
                    <FieldError message={cvError} />
                  </div>
                </div>
              )}

              {/* Departamento */}
              <Field error={errors.departamento_id?.message}>
                <Controller
                  name="departamento_id"
                  control={control}
                  render={({ field }) => (
                    <GeoCombobox
                      pill
                      placeholder="Departamento"
                      options={departamentos}
                      value={field.value}
                      onChange={field.onChange}
                      error={!!errors.departamento_id}
                    />
                  )}
                />
              </Field>

              {/* Provincia + Distrito */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field error={errors.provincia_id?.message}>
                  <Controller
                    name="provincia_id"
                    control={control}
                    render={({ field }) => (
                      <GeoCombobox
                        pill
                        placeholder="Provincia"
                        options={provincias}
                        value={field.value}
                        onChange={field.onChange}
                        disabled={!deptId}
                        loading={loadingGeo === 'prov'}
                        error={!!errors.provincia_id}
                      />
                    )}
                  />
                </Field>
                <Field error={errors.distrito_id?.message}>
                  <Controller
                    name="distrito_id"
                    control={control}
                    render={({ field }) => (
                      <GeoCombobox
                        pill
                        placeholder="Distrito"
                        options={distritos}
                        value={field.value}
                        onChange={field.onChange}
                        disabled={!provId}
                        loading={loadingGeo === 'dist'}
                        error={!!errors.distrito_id}
                      />
                    )}
                  />
                </Field>
              </div>

              {/* Centro Poblado */}
              <Field error={errors.centro_poblado_id?.message}>
                <Controller
                  name="centro_poblado_id"
                  control={control}
                  render={({ field }) => (
                    <GeoCombobox
                      pill
                      placeholder="Centro Poblado"
                      options={centros}
                      value={field.value}
                      onChange={field.onChange}
                      disabled={!distId || loadingGeo === 'centro'}
                      loading={loadingGeo === 'centro'}
                      error={!!errors.centro_poblado_id}
                    />
                  )}
                />
              </Field>

              {/* Cómo conociste */}
              <Field error={errors.como_entero?.message}>
                <SelectNative aria-label="¿Cómo conociste a Agroexportadora?" error={!!errors.como_entero} className={pillSelect(!!errors.como_entero)} {...register('como_entero')}>
                  <option value="">¿Cómo conociste a Agroexportadora?</option>
                  {COMO_ENTERO_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </SelectNative>
              </Field>

              {/* Checkbox políticas */}
              <Controller
                name="acepta_politicas"
                control={control}
                render={({ field }) => (
                  <div>
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <Checkbox
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        className={`mt-0.5 ${errors.acepta_politicas ? 'border-red-400' : ''}`}
                      />
                      <span className="text-sm text-stone-500 leading-snug group-hover:text-stone-700 transition-colors">
                        He leído y acepto{' '}
                        <button
                          type="button"
                          onClick={() => setModalAbierto(true)}
                          className="text-agro-600 underline underline-offset-2 font-semibold hover:text-agro-700 transition-colors"
                        >
                          las políticas de consentimiento de datos
                        </button>
                        <span className="text-red-500 ml-0.5">*</span>
                      </span>
                    </label>
                    <FieldError message={errors.acepta_politicas?.message} />
                  </div>
                )}
              />

              {/* Error servidor */}
              {serverError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />{serverError}
                </div>
              )}

              {/* Botón enviar */}
              <Button type="submit" disabled={isSubmitting} className="w-full h-10 text-sm font-bold rounded-xl">
                {isSubmitting
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
                  : 'Enviar Postulación'
                }
              </Button>


            </form>
          </div>
        </div>
      </div>

      {/* Modal política */}
      {modalAbierto && <ModalPolitica onClose={() => setModalAbierto(false)} />}
    </div>
  );
}
