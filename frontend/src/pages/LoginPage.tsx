import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Eye, EyeOff, AlertCircle } from 'lucide-react';
import api from '@/services/api';
import { useAuthStore } from '@/store/authStore';

interface LoginForm {
  email: string;
  password: string;
}

export default function LoginPage() {
  const navigate  = useNavigate();
  const setAuth   = useAuthStore((s) => s.setAuth);
  const [showPass, setShowPass] = useState(false);
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>();

  async function onSubmit(data: LoginForm) {
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/auth/login', data);
      setAuth(res.data.user, res.data.accessToken);
      navigate('/app/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Credenciales incorrectas');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex">

      {/* ── Panel izquierdo: imagen ── */}
      <div className="hidden lg:flex lg:w-[58%] xl:w-[62%] relative overflow-hidden">
        <img
          src="/bg-login.jpg"
          alt="Fundo Agroexportadora"
          className="absolute inset-0 w-full h-full object-cover object-center"
          draggable={false}
        />
        {/* Overlay degradado: oscuro arriba y abajo, transparente en el centro */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/75 via-black/15 to-black/55" />

        {/* Contenido sobre la imagen */}
        <div className="relative z-10 flex flex-col justify-between w-full h-full p-12">

          {/* ── Bloque superior: descripción del sistema ── */}
          <div className="max-w-md">
            {/* Empresa */}
            <div className="flex items-center gap-3 mb-8">
              <div className="w-6 h-[2px] bg-agro-400 rounded-full" />
              <span className="text-agro-300 text-[10px] font-bold tracking-[0.25em] uppercase">
                Empresa Agroexportadora S.A.
              </span>
            </div>

            {/* Título */}
            <h2 className="text-white font-extrabold text-4xl xl:text-5xl leading-[1.1] tracking-tight mb-5">
              Sistema de<br />Gestión de<br />Reclutamiento
            </h2>

            {/* Acento */}
            <div className="w-10 h-1 bg-agro-500 rounded-full mb-5" />

            {/* Descripción */}
            <p className="text-white/55 text-sm leading-relaxed max-w-xs">
              Plataforma integral para el control de postulantes, trabajadores,
              campañas y seguimiento del personal de campo.
            </p>
          </div>

          {/* ── Bloque inferior: ubicación + copyright ── */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-1 h-1 rounded-full bg-white/30" />
              <p className="text-white/40 text-[11px] tracking-widest uppercase font-medium">
                La Libertad · Perú
              </p>
            </div>
            <p className="text-white/40 text-[11px] tracking-widest uppercase font-medium">
              © {new Date().getFullYear()} Agroexportadora · Todos los derechos reservados
            </p>
          </div>

        </div>
      </div>

      {/* ── Panel derecho: formulario ── */}
      <div className="flex-1 flex items-center justify-center bg-white px-8 sm:px-12 lg:px-16">
        <div className="w-full max-w-[360px]">

          {/* Logo centrado arriba */}
          <div className="text-center mb-10">
            <img src="/logo.png" alt="Agroexportadora" className="h-12 mx-auto object-contain" />
          </div>

          {/* Encabezado */}
          <div className="mb-10">
            <h1 className="text-stone-900 font-bold text-3xl leading-tight">
              Bienvenido de vuelta
            </h1>
            <p className="text-stone-400 text-sm mt-2">
              Ingresa tus credenciales para continuar.
            </p>
          </div>

          {/* Formulario */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">

            {/* Email */}
            <div>
              <label className="block text-[11px] font-bold tracking-widest text-stone-400 uppercase mb-2">
                Correo electrónico
              </label>
              <input
                type="email"
                autoComplete="username"
                placeholder="usuario@agroexportadora.com"
                className="w-full px-4 py-3.5 rounded-xl border border-stone-200 bg-stone-50 text-stone-800 placeholder-stone-300 text-sm focus:outline-none focus:border-agro-400 focus:bg-white focus:ring-4 focus:ring-agro-400/10 transition-all"
                {...register('email', {
                  required: 'Campo requerido',
                  pattern:  { value: /^\S+@\S+$/i, message: 'Email inválido' },
                })}
              />
              {errors.email && (
                <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 flex-shrink-0" />{errors.email.message}
                </p>
              )}
            </div>

            {/* Contraseña */}
            <div>
              <label className="block text-[11px] font-bold tracking-widest text-stone-400 uppercase mb-2">
                Contraseña
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full px-4 py-3.5 pr-12 rounded-xl border border-stone-200 bg-stone-50 text-stone-800 placeholder-stone-300 text-sm focus:outline-none focus:border-agro-400 focus:bg-white focus:ring-4 focus:ring-agro-400/10 transition-all"
                  {...register('password', {
                    required:  'Campo requerido',
                    minLength: { value: 6, message: 'Mín. 6 caracteres' },
                  })}
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700 transition-colors"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 flex-shrink-0" />{errors.password.message}
                </p>
              )}
            </div>

            {/* Error servidor */}
            {error && (
              <div className="flex items-center gap-2.5 p-3.5 bg-red-50 border border-red-100 rounded-xl text-red-600">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <p className="text-sm">{error}</p>
              </div>
            )}

            {/* Botón */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-agro-700 hover:bg-agro-800 active:scale-[0.99] disabled:opacity-60 text-white font-bold rounded-xl transition-all shadow-md shadow-agro-900/20 flex items-center justify-center gap-2 text-sm mt-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Ingresando...
                </>
              ) : 'Ingresar al sistema'}
            </button>
          </form>

          {/* Pie */}
          <p className="text-stone-300 text-[11px] text-center mt-10 tracking-wide">
            Acceso restringido · Solo personal autorizado
          </p>
        </div>
      </div>
    </div>
  );
}
