import { useState, useEffect, useRef } from 'react';
import { fmtFechaLarga, fmtHoraConSegundos } from '@/utils/dates';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, LogOut, Menu, X,
  UserCog, ShieldCheck, Megaphone,
  Activity, Phone, Lock, KeyRound, BarChart2, Briefcase, ShieldBan,
  Bell, AlertTriangle, Megaphone as MegaphoneIcon, FileText,
  Eye, EyeOff, QrCode, GraduationCap,
} from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { usePermission, useIsRoot } from '@/hooks/usePermission';
import api from '@/services/api';
import { rolLabel } from '@/lib/roles';

interface Alerta {
  tipo:        'urgente' | 'campana' | 'confirmado';
  titulo:      string;
  descripcion: string;
  urgente:     boolean;
}

function NotificationBell() {
  const [alertas,  setAlertas]  = useState<Alerta[]>([]);
  const [open,     setOpen]     = useState(false);
  const [loading,  setLoading]  = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  async function fetchAlertas() {
    setLoading(true);
    try {
      const res = await api.get('/notificaciones');
      setAlertas(res.data.alertas);
    } catch {
      // silencioso — el bell no debe romper el layout
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchAlertas();
    // polling cada 2 minutos
    const t = setInterval(fetchAlertas, 2 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  // Cerrar al hacer click fuera
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const urgentes = alertas.filter(a => a.urgente).length;
  const total    = alertas.length;

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => { setOpen(o => !o); if (!open) fetchAlertas(); }}
        className="relative p-2.5 rounded-xl hover:bg-stone-100 transition-colors text-stone-400 hover:text-stone-700"
        title="Notificaciones"
      >
        <Bell className={`w-4 h-4 ${urgentes > 0 ? 'text-amber-500' : ''}`} />
        {total > 0 && (
          <span className={`absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-bold flex items-center justify-center text-white ${
            urgentes > 0 ? 'bg-red-500' : 'bg-agro-600'
          }`}>
            {total > 9 ? '9+' : total}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 sm:w-80 max-w-[calc(100vw-1rem)] bg-white rounded-2xl border border-stone-200 shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100">
            <h3 className="font-semibold text-stone-800 text-sm">Alertas del sistema</h3>
            {loading && (
              <span className="w-3.5 h-3.5 border-2 border-agro-300 border-t-agro-700 rounded-full animate-spin" />
            )}
          </div>

          {alertas.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <Bell className="w-8 h-8 text-stone-200 mx-auto mb-2" />
              <p className="text-sm text-stone-400">Sin alertas pendientes</p>
            </div>
          ) : (
            <div className="max-h-80 overflow-y-auto divide-y divide-stone-50">
              {alertas.map((a, i) => (
                <div
                  key={i}
                  className={`flex gap-3 px-4 py-3 ${a.urgente ? 'bg-red-50/60' : ''}`}
                >
                  <div className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center mt-0.5 ${
                    a.tipo === 'urgente'
                      ? a.urgente ? 'bg-red-100' : 'bg-amber-50'
                      : a.tipo === 'campana'
                        ? 'bg-purple-50'
                        : a.urgente ? 'bg-orange-100' : 'bg-orange-50'
                  }`}>
                    {a.tipo === 'urgente'
                      ? <AlertTriangle className={`w-3.5 h-3.5 ${a.urgente ? 'text-red-500' : 'text-amber-500'}`} />
                      : a.tipo === 'campana'
                        ? <MegaphoneIcon className="w-3.5 h-3.5 text-purple-500" />
                        : <Users className={`w-3.5 h-3.5 ${a.urgente ? 'text-orange-600' : 'text-orange-400'}`} />
                    }
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-stone-700 leading-tight">{a.titulo}</p>
                    <p className="text-[11px] text-stone-400 mt-0.5">{a.descripcion}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="px-4 py-2.5 border-t border-stone-100 bg-stone-50">
            <p className="text-[11px] text-stone-400 text-center">
              Actualiza cada 2 min · {new Date().toLocaleTimeString('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

const ROL_CLS: Record<string, string> = {
  ROOT:                   'bg-purple-100 text-purple-700',
  RECLUTADORA:  'bg-agro-100 text-agro-700',
  CONTRATA:               'bg-teal-100 text-teal-700',
  CONSULTA:               'bg-stone-100 text-stone-600',
  VIEWER:                 'bg-stone-100 text-stone-600',
  // legacy
  JEFA_RRHH:              'bg-agro-100 text-agro-700',
  RECLUTADOR:             'bg-teal-100 text-teal-700',
  superadmin:             'bg-purple-100 text-purple-700',
  admin:                  'bg-agro-100 text-agro-700',
  viewer:                 'bg-stone-100 text-stone-600',
};

export default function DashboardLayout() {
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [now, setNow]                   = useState(new Date());
  const [showChangePass, setShowChangePass] = useState(false);
  const [cpPass, setCpPass]             = useState('');
  const [cpConfirm, setCpConfirm]       = useState('');
  const [cpError, setCpError]           = useState('');
  const [cpLoading, setCpLoading]       = useState(false);
  const [cpSuccess, setCpSuccess]       = useState(false);
  const [cpCurrent, setCpCurrent]       = useState('');
  const [showCpCurrent, setShowCpCurrent] = useState(false);
  const [showCpPass,    setShowCpPass]    = useState(false);
  const [showCpConfirm, setShowCpConfirm] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const { user, logout, clearMustChangePassword } = useAuthStore();
  const navigate = useNavigate();
  const mustChangePassword = !!user?.must_change_password;
  const isRoot            = useIsRoot();
  const canViewUsers        = usePermission('usuarios.view');
  const canViewBlacklist    = usePermission('blacklist.view');
  const canManageBlacklist  = usePermission('blacklist.manage');
  const canViewAudit        = usePermission('audit.view');
  const canViewCampanas     = usePermission('campanas.view');
  const canManageProfesiones = usePermission('profesiones.manage');
  const canViewAsignados    = usePermission('postulantes.view_assigned');
  const canViewProductividad  = usePermission('productividad.view');
  const canManageBajas        = usePermission('bajas.manage');
  const canManageReingresos   = usePermission('reingresos.manage');
  const canViewAllPostulantes = usePermission('postulantes.view_all');
  const canViewTrabajadores   = canManageBajas || canManageReingresos || canViewAllPostulantes;
  const isContrata            = user?.rol === 'CONTRATA' || user?.rol === 'RECLUTADOR';

  async function handleLogout() {
    try { await api.post('/auth/logout'); } catch {}
    logout();
    navigate('/app/login');
  }

  async function handleChangePassword() {
    setCpError('');
    if (!cpCurrent) { setCpError('Ingresa tu contraseña actual'); return; }
    if (cpPass.length < 8) { setCpError('Mínimo 8 caracteres'); return; }
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(cpPass)) {
      setCpError('Debe tener al menos una mayúscula, una minúscula y un número');
      return;
    }
    if (cpPass !== cpConfirm) { setCpError('Las contraseñas no coinciden'); return; }
    setCpLoading(true);
    try {
      await api.post('/auth/change-password', { currentPassword: cpCurrent, password: cpPass });
      setCpSuccess(true);
      if (mustChangePassword) clearMustChangePassword();
      setTimeout(() => {
        setShowChangePass(false);
        setCpCurrent(''); setCpPass(''); setCpConfirm(''); setCpSuccess(false);
      }, 1500);
    } catch (e: any) {
      setCpError(e?.response?.data?.message || 'Error al cambiar contraseña');
    } finally {
      setCpLoading(false);
    }
  }

  const navSections = [
    [
      { to: '/app/dashboard',     icon: LayoutDashboard, label: 'Dashboard',        end: true,  show: !isContrata },
      { to: '/app/mis-asignados', icon: Phone,            label: 'Mis Asignados',   end: true,  show: canViewAsignados },
      { to: '/app/postulantes',   icon: Users,            label: 'Postulantes',      end: false, show: !isContrata },
    ],
    [
      { to: '/app/productividad', icon: BarChart2,  label: 'Productividad',         end: false, show: canViewProductividad && !isContrata },
      { to: '/app/historial',     icon: FileText,   label: 'Historial Llamadas',    end: false, show: canViewProductividad && !isContrata },
      { to: '/app/trabajadores',  icon: Briefcase,  label: 'Trabajadores',          end: false, show: canViewTrabajadores && !isContrata },
      { to: '/app/campanas',      icon: Megaphone,  label: 'Campañas',              end: false, show: canViewCampanas },
      { to: '/app/profesiones',   icon: GraduationCap, label: 'Profesiones',         end: false, show: canManageProfesiones && !isContrata },
    ],
    [
      { to: '/app/usuarios',  icon: UserCog,    label: 'Usuarios',         end: false, show: canViewUsers },
      { to: '/app/roles',     icon: Lock,       label: 'Roles y Accesos',  end: false, show: canViewUsers },
      { to: '/app/auditoria', icon: ShieldCheck, label: 'Auditoría',       end: false, show: canViewAudit },
      { to: '/app/llamado',   icon: QrCode,     label: 'Llamado QR',       end: false, show: canViewAllPostulantes && !isContrata },
      { to: '/app/blacklist', icon: ShieldBan,  label: 'Personal no Apto',      end: false, show: canViewBlacklist || canManageBlacklist },
    ],
  ].map(s => s.filter(i => i.show)).filter(s => s.length > 0);

  const rolInfo = {
    label: rolLabel(user?.rol ?? ''),
    cls:   ROL_CLS[user?.rol ?? ''] ?? 'bg-stone-100 text-stone-600',
  };

  return (
    <div className="flex h-screen bg-stone-50 overflow-hidden">

      {/* Overlay mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-20 lg:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar ── */}
      <aside className={`
        fixed lg:relative inset-y-0 left-0 z-30 w-60 flex flex-col
        bg-white border-r border-stone-200
        transform transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>

        {/* Logo */}
        <div className="px-5 py-4 border-b border-stone-100 flex-shrink-0">
          <div className="flex items-center justify-between">
            <img src="/logo.png" alt="Agroexportadora" className="h-7 w-auto" />
            <button
              className="lg:hidden p-1.5 rounded-lg hover:bg-stone-100 transition-colors text-stone-400"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-stone-400 text-[10px] mt-1.5 font-medium uppercase tracking-wider">
            Central de Reclutamiento
          </p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-3 overflow-hidden flex flex-col gap-1">
          {navSections.map((section, si) => (
            <div key={si} className={si > 0 ? 'border-t border-stone-100 pt-1' : ''}>
              {section.map(({ to, icon: Icon, label, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all
                    ${isActive
                      ? 'bg-agro-50 text-agro-700 font-semibold'
                      : 'text-stone-500 hover:bg-stone-100 hover:text-stone-800'
                    }`
                  }
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span>{label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* ROOT indicator */}
        {isRoot && (
          <div className="mx-3 mb-1.5 px-3 py-1.5 bg-purple-50 rounded-xl border border-purple-100 flex-shrink-0">
            <div className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5 text-purple-500" />
              <span className="text-purple-600 text-xs font-semibold">Acceso Root</span>
            </div>
          </div>
        )}

        {/* User */}
        <div className="px-4 py-3 border-t border-stone-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-agro-700 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              {user?.nombre.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-stone-800 text-xs font-semibold leading-snug truncate">{user?.nombre}</p>
              <span className={`inline-flex mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${rolInfo.cls}`}>
                {rolInfo.label}
              </span>
            </div>
            <div className="flex items-center gap-0.5 flex-shrink-0">
              <button
                onClick={() => { setShowChangePass(true); setCpCurrent(''); setCpPass(''); setCpConfirm(''); setCpError(''); setCpSuccess(false); setShowCpCurrent(false); setShowCpPass(false); setShowCpConfirm(false); }}
                title="Cambiar contraseña"
                className="p-1.5 rounded-lg text-stone-400 hover:text-agro-700 hover:bg-agro-50 transition-colors"
              >
                <KeyRound className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleLogout}
                title="Cerrar sesión"
                className="p-1.5 rounded-lg text-stone-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* ── Content ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Mobile header */}
        <header className="flex lg:hidden bg-white border-b border-stone-200 px-4 py-3 items-center gap-3 flex-shrink-0">
          <button
            className="p-2 rounded-xl hover:bg-stone-100 transition-colors"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="w-5 h-5 text-stone-500" />
          </button>
          <img src="/logo.png" alt="Agroexportadora" className="h-7 w-auto" />
          <div className="ml-auto flex items-center gap-2">
            {canViewProductividad && <NotificationBell />}
            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${rolInfo.cls}`}>
              {rolInfo.label}
            </span>
          </div>
        </header>

        {/* Desktop header */}
        <header className="hidden lg:flex bg-white border-b border-stone-200 px-6 py-3 items-center flex-shrink-0">
          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-stone-400">
              {fmtFechaLarga(now)}
            </span>
            <span className="text-xs font-mono font-semibold text-stone-500 bg-stone-100 px-2 py-1 rounded-lg tabular-nums">
              {fmtHoraConSegundos(now)}
            </span>
            {canViewProductividad && <NotificationBell />}
            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${rolInfo.cls}`}>
              {rolInfo.label}
            </span>
          </div>
        </header>

        {/* Main */}
        <main className={`flex-1 overflow-y-auto p-4 md:p-6 ${isContrata ? 'pb-20 lg:pb-6' : ''}`}>
          <Outlet />
        </main>
      </div>

      {/* Modal forzado: primer login con DNI como clave — no se puede cerrar */}
      {mustChangePassword && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-slide-up">
            <div className="flex flex-col items-center gap-3 mb-5 text-center">
              <div className="w-12 h-12 rounded-2xl bg-amber-100 flex items-center justify-center">
                <KeyRound className="w-6 h-6 text-amber-600" />
              </div>
              <div>
                <h2 className="font-bold text-stone-800 text-lg">Crea tu contraseña</h2>
                <p className="text-stone-400 text-sm mt-1">
                  Es tu primer acceso. Debes establecer una contraseña personal antes de continuar.
                </p>
              </div>
            </div>

            {cpSuccess ? (
              <div className="py-6 flex flex-col items-center gap-2 text-emerald-600">
                <ShieldCheck className="w-10 h-10" />
                <p className="font-semibold">¡Contraseña guardada! Bienvenido/a.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-xs text-amber-700">
                  Ingresa tu <strong>DNI</strong> como contraseña actual (fue asignada al crear tu cuenta).
                </div>
                <div>
                  <label className="label text-xs">Contraseña actual (tu DNI)</label>
                  <div className="relative">
                    <input
                      type={showCpCurrent ? 'text' : 'password'}
                      className="input pr-10"
                      placeholder="Ingresa tu DNI"
                      value={cpCurrent}
                      onChange={e => { setCpCurrent(e.target.value); setCpError(''); }}
                    />
                    <button type="button" onClick={() => setShowCpCurrent(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
                      {showCpCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="label text-xs">Nueva contraseña</label>
                  <div className="relative">
                    <input
                      type={showCpPass ? 'text' : 'password'}
                      className="input pr-10"
                      placeholder="Mín. 8 car., mayúscula y número"
                      value={cpPass}
                      onChange={e => { setCpPass(e.target.value); setCpError(''); }}
                    />
                    <button type="button" onClick={() => setShowCpPass(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
                      {showCpPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="label text-xs">Confirmar contraseña</label>
                  <div className="relative">
                    <input
                      type={showCpConfirm ? 'text' : 'password'}
                      className="input pr-10"
                      placeholder="Repite la contraseña"
                      value={cpConfirm}
                      onChange={e => { setCpConfirm(e.target.value); setCpError(''); }}
                      onKeyDown={e => e.key === 'Enter' && handleChangePassword()}
                    />
                    <button type="button" onClick={() => setShowCpConfirm(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600">
                      {showCpConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                {cpError && <p className="text-red-500 text-xs">{cpError}</p>}
                <button
                  onClick={handleChangePassword}
                  disabled={cpLoading}
                  className="btn-primary w-full py-2.5 text-sm mt-1"
                >
                  {cpLoading
                    ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    : 'Guardar contraseña'
                  }
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Cambiar contraseña (voluntario) */}
      {showChangePass && !mustChangePassword && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setShowChangePass(false)}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 animate-slide-up">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-agro-100 flex items-center justify-center">
                  <KeyRound className="w-4 h-4 text-agro-700" />
                </div>
                <h2 className="font-bold text-stone-800">Cambiar contraseña</h2>
              </div>
              <button onClick={() => setShowChangePass(false)} className="p-1.5 hover:bg-stone-100 rounded-lg transition-colors">
                <X className="w-4 h-4 text-stone-400" />
              </button>
            </div>

            {cpSuccess ? (
              <div className="py-6 flex flex-col items-center gap-2 text-emerald-600">
                <ShieldCheck className="w-10 h-10" />
                <p className="font-semibold">Contraseña actualizada</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="label text-xs">Contraseña actual</label>
                  <div className="relative">
                    <input
                      type={showCpCurrent ? 'text' : 'password'}
                      className="input pr-10"
                      placeholder="Tu contraseña actual"
                      value={cpCurrent}
                      onChange={e => { setCpCurrent(e.target.value); setCpError(''); }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowCpCurrent(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 transition-colors"
                    >
                      {showCpCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="label text-xs">Nueva contraseña</label>
                  <div className="relative">
                    <input
                      type={showCpPass ? 'text' : 'password'}
                      className="input pr-10"
                      placeholder="Mín. 8 caracteres"
                      value={cpPass}
                      onChange={e => { setCpPass(e.target.value); setCpError(''); }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowCpPass(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 transition-colors"
                    >
                      {showCpPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="label text-xs">Confirmar contraseña</label>
                  <div className="relative">
                    <input
                      type={showCpConfirm ? 'text' : 'password'}
                      className="input pr-10"
                      placeholder="Repite la contraseña"
                      value={cpConfirm}
                      onChange={e => { setCpConfirm(e.target.value); setCpError(''); }}
                      onKeyDown={e => e.key === 'Enter' && handleChangePassword()}
                    />
                    <button
                      type="button"
                      onClick={() => setShowCpConfirm(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 transition-colors"
                    >
                      {showCpConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                {cpError && <p className="text-red-500 text-xs">{cpError}</p>}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => setShowChangePass(false)} className="btn-secondary flex-1 py-2.5 text-sm">
                    Cancelar
                  </button>
                  <button onClick={handleChangePassword} disabled={cpLoading} className="btn-primary flex-1 py-2.5 text-sm">
                    {cpLoading
                      ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      : 'Guardar'
                    }
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bottom nav — solo RECLUTADOR mobile */}
      {isContrata && (
        <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-stone-200 z-30 lg:hidden">
          <div className="flex h-16">
            <NavLink
              to="/app/mis-asignados"
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center gap-0.5 transition-colors ${
                  isActive ? 'text-agro-600 font-semibold' : 'text-stone-400'
                }`
              }
            >
              <Phone className="w-5 h-5" />
              <span className="text-[11px] font-medium">Mis llamadas</span>
            </NavLink>
            <button
              onClick={handleLogout}
              className="flex-1 flex flex-col items-center justify-center gap-0.5 text-stone-400 hover:text-red-500 transition-colors"
            >
              <LogOut className="w-5 h-5" />
              <span className="text-[11px] font-medium">Salir</span>
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
