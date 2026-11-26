import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import FormularioPage  from './pages/FormularioPage';
import LoginPage       from './pages/LoginPage';
import DashboardLayout from './pages/DashboardLayout';
import DashboardPage   from './pages/DashboardPage';
import PostulantesPage from './pages/PostulantesPage';
import ReclutadorPage  from './pages/ReclutadorPage';
import UsuariosPage    from './pages/UsuariosPage';
import AuditPage       from './pages/AuditPage';
import RolesPage       from './pages/RolesPage';
import ProductividadPage  from './pages/ProductividadPage';
import TrabajadoresPage   from './pages/TrabajadoresPage';
import ImportarExcelPage  from './pages/ImportarExcelPage';
import CampanasPage       from './pages/CampanasPage';
import ProfesionesPage     from './pages/ProfesionesPage';
import BlacklistPage          from './pages/BlacklistPage';
import HistorialLlamadasPage  from './pages/HistorialLlamadasPage';
import FichaPage              from './pages/FichaPage';
import LlamadoPage            from './pages/LlamadoPage';
import ProtectedRoute         from './components/ProtectedRoute';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Formulario público de postulación */}
        <Route path="/"    element={<FormularioPage />} />
        <Route path="/app/login" element={<LoginPage />} />
        <Route path="/ficha" element={<FichaPage />} />

        {/* Compat con ruta anterior */}
        <Route path="/admin/login" element={<Navigate to="/app/login" replace />} />

        {/* Panel interno protegido */}
        <Route path="/app" element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }>
          <Route index element={<Navigate to="/app/dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="postulantes" element={<PostulantesPage />} />
          <Route path="mis-asignados" element={
            <ProtectedRoute permission="postulantes.view_assigned">
              <ReclutadorPage />
            </ProtectedRoute>
          } />
          <Route path="usuarios" element={
            <ProtectedRoute permission="usuarios.view">
              <UsuariosPage />
            </ProtectedRoute>
          } />
          <Route path="auditoria" element={
            <ProtectedRoute permission="audit.view">
              <AuditPage />
            </ProtectedRoute>
          } />
          <Route path="roles" element={
            <ProtectedRoute permission="usuarios.view">
              <RolesPage />
            </ProtectedRoute>
          } />
          <Route path="productividad" element={
            <ProtectedRoute permission="productividad.view">
              <ProductividadPage />
            </ProtectedRoute>
          } />
          <Route path="trabajadores" element={
            <ProtectedRoute anyOf={['postulantes.view_all', 'bajas.manage', 'reingresos.manage']}>
              <TrabajadoresPage />
            </ProtectedRoute>
          } />
          <Route path="importar-excel" element={
            <ProtectedRoute permission="postulantes.view_all">
              <ImportarExcelPage />
            </ProtectedRoute>
          } />
          <Route path="campanas" element={
            <ProtectedRoute permission="campanas.view">
              <CampanasPage />
            </ProtectedRoute>
          } />
          <Route path="profesiones" element={
            <ProtectedRoute permission="profesiones.manage">
              <ProfesionesPage />
            </ProtectedRoute>
          } />
          <Route path="blacklist" element={
            <ProtectedRoute anyOf={['blacklist.view', 'blacklist.manage']}>
              <BlacklistPage />
            </ProtectedRoute>
          } />
          <Route path="historial" element={
            <ProtectedRoute permission="productividad.view">
              <HistorialLlamadasPage />
            </ProtectedRoute>
          } />
          <Route path="llamado" element={
            <ProtectedRoute permission="postulantes.view_all">
              <LlamadoPage />
            </ProtectedRoute>
          } />
        </Route>

        {/* Compat rutas anteriores */}
        <Route path="/dashboard"   element={<Navigate to="/app/dashboard"   replace />} />
        <Route path="/dashboard/*" element={<Navigate to="/app/dashboard"   replace />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
