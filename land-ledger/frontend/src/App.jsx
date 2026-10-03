import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import PublicLayout from './layouts/PublicLayout.jsx';
import DashboardLayout from './layouts/DashboardLayout.jsx';
import { LoadingState } from './components/registry/States.jsx';

const HomePage = lazy(() => import('./pages/public/HomePage.jsx'));
const LoginPage = lazy(() => import('./pages/public/LoginPage.jsx'));
const RegisterPage = lazy(() => import('./pages/public/RegisterPage.jsx'));
const NotFoundPage = lazy(() => import('./pages/public/NotFoundPage.jsx'));

const CitizenDashboard = lazy(() => import('./pages/citizen/DashboardPage.jsx'));
const CitizenProperties = lazy(() => import('./pages/citizen/PropertiesPage.jsx'));
const CitizenPropertyDetail = lazy(() => import('./pages/citizen/PropertyDetailPage.jsx'));
const CitizenPropertyRegister = lazy(() => import('./pages/citizen/PropertyRegisterPage.jsx'));
const CitizenDocuments = lazy(() => import('./pages/citizen/DocumentsPage.jsx'));
const CitizenTransfers = lazy(() => import('./pages/citizen/TransfersPage.jsx'));
const CitizenTransferNew = lazy(() => import('./pages/citizen/TransferNewPage.jsx'));
const CitizenTransferDetail = lazy(() => import('./pages/citizen/TransferDetailPage.jsx'));
const CitizenBlockchain = lazy(() => import('./pages/citizen/BlockchainPage.jsx'));
const CitizenProfile = lazy(() => import('./pages/shared/ProfilePage.jsx'));

const RegistrarDashboard = lazy(() => import('./pages/registrar/DashboardPage.jsx'));
const RegistrarProperties = lazy(() => import('./pages/registrar/PropertiesPage.jsx'));
const RegistrarPropertyDetail = lazy(() => import('./pages/registrar/PropertyDetailPage.jsx'));
const RegistrarDocuments = lazy(() => import('./pages/registrar/DocumentsPage.jsx'));
const RegistrarTransfers = lazy(() => import('./pages/registrar/TransfersPage.jsx'));
const RegistrarTransferDetail = lazy(() => import('./pages/registrar/TransferDetailPage.jsx'));
const ReviewQueue = lazy(() => import('./pages/registrar/ReviewQueuePage.jsx'));
const Ledger = lazy(() => import('./pages/registrar/LedgerPage.jsx'));
const Audit = lazy(() => import('./pages/registrar/AuditPage.jsx'));
const RegistrarProfile = lazy(() => import('./pages/shared/ProfilePage.jsx'));

const SurveyorDashboard = lazy(() => import('./pages/workflow/SurveyorDashboard.jsx'));
const ClerkDashboard = lazy(() => import('./pages/workflow/ClerkDashboard.jsx'));
const AdminDashboard = lazy(() => import('./pages/workflow/AdminDashboard.jsx'));
const OfficeProfile = lazy(() => import('./pages/shared/ProfilePage.jsx'));

/** Where each role lands after sign-in. */
const ROLE_HOME = {
  citizen: '/citizen',
  surveyor: '/surveyor',
  clerk: '/clerk',
  registrar: '/registrar',
  admin: '/admin',
};

function FullPageLoading() {
  return (
    <div className="min-h-screen grid place-items-center bg-background site-noise">
      <LoadingState label="Preparing the registry…" />
    </div>
  );
}

function ProtectedRoute({ role, children }) {
  const { user, initializing } = useAuth();
  const location = useLocation();
  if (initializing) return <FullPageLoading />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (role && user.role !== role) {
    return <Navigate to={ROLE_HOME[user.role] || '/citizen'} replace />;
  }
  return children;
}

function AuthRoute({ children }) {
  const { user, initializing } = useAuth();
  if (initializing) return <FullPageLoading />;
  if (user) return <Navigate to={ROLE_HOME[user.role] || '/citizen'} replace />;
  return children;
}

export default function App() {
  return (
    <Suspense fallback={<FullPageLoading />}>
      <Routes>
        {/* Public */}
        <Route element={<PublicLayout />}>
          <Route path="/" element={<HomePage />} />
        </Route>
        <Route path="/login" element={<AuthRoute><LoginPage /></AuthRoute>} />
        <Route path="/register" element={<AuthRoute><RegisterPage /></AuthRoute>} />

        {/* Citizen */}
        <Route path="/citizen" element={<ProtectedRoute role="citizen"><DashboardLayout /></ProtectedRoute>}>
          <Route index element={<CitizenDashboard />} />
          <Route path="properties" element={<CitizenProperties />} />
          <Route path="properties/register" element={<CitizenPropertyRegister />} />
          <Route path="properties/:id" element={<CitizenPropertyDetail />} />
          <Route path="documents" element={<CitizenDocuments />} />
          <Route path="transfers" element={<CitizenTransfers />} />
          <Route path="transfers/new" element={<CitizenTransferNew />} />
          <Route path="transfers/:id" element={<CitizenTransferDetail />} />
          <Route path="blockchain" element={<CitizenBlockchain />} />
          <Route path="profile" element={<CitizenProfile />} />
        </Route>

        {/* Registrar */}
        <Route path="/registrar" element={<ProtectedRoute role="registrar"><DashboardLayout /></ProtectedRoute>}>
          <Route index element={<RegistrarDashboard />} />
          <Route path="properties" element={<RegistrarProperties />} />
          <Route path="properties/:id" element={<RegistrarPropertyDetail />} />
          <Route path="documents" element={<RegistrarDocuments />} />
          <Route path="transfers" element={<RegistrarTransfers />} />
          <Route path="transfers/:id" element={<RegistrarTransferDetail />} />
          <Route path="review" element={<ReviewQueue />} />
          <Route path="ledger" element={<Ledger />} />
          <Route path="audit" element={<Audit />} />
          <Route path="profile" element={<RegistrarProfile />} />
        </Route>

        {/* Surveyor - field verification office */}
        <Route path="/surveyor" element={<ProtectedRoute role="surveyor"><DashboardLayout /></ProtectedRoute>}>
          <Route index element={<SurveyorDashboard />} />
          <Route path="profile" element={<OfficeProfile />} />
        </Route>

        {/* Clerk - document verification office */}
        <Route path="/clerk" element={<ProtectedRoute role="clerk"><DashboardLayout /></ProtectedRoute>}>
          <Route index element={<ClerkDashboard />} />
          <Route path="profile" element={<OfficeProfile />} />
        </Route>

        {/* Admin - oversight / control tower */}
        <Route path="/admin" element={<ProtectedRoute role="admin"><DashboardLayout /></ProtectedRoute>}>
          <Route index element={<AdminDashboard />} />
          <Route path="audit" element={<Audit />} />
          <Route path="profile" element={<OfficeProfile />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  );
}
