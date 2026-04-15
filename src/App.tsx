
import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import ExitConfirmHandler from "@/components/ExitConfirmHandler";
import AppResumeRefresher from "@/components/AppResumeRefresher";
import PushNotificationSetup from "@/components/PushNotificationSetup";
import SessionTimeoutManager from "@/components/SessionTimeoutManager";
import PinReauth from "@/components/PinReauth";
import HomePage from "@/components/HomePage";
import AuthPage from "@/components/AuthPage";
import UpdateModal from "@/components/updates/UpdateModal";
import useAppUpdateChecker from "@/hooks/useAppUpdateChecker";

const AuthRoute: React.FC = () => {
  const { user, userProfile, loading } = useAuth();

  if (loading) {
    return null;
  }

  if (user && userProfile?.full_name && userProfile.full_name.trim() !== '') {
    const redirectPath = userProfile.role === 'vendor' ? '/vendor' :
      userProfile.role === 'delivery' ? '/delivery' : '/buyer';
    return <Navigate to={redirectPath} replace />;
  }

  return <AuthPage />;
};

const AuthReadySignal: React.FC = () => {
  const { loading } = useAuth();
  const alreadySentRef = React.useRef(false);

  React.useEffect(() => {
    if (!loading && !alreadySentRef.current) {
      alreadySentRef.current = true;
      window.dispatchEvent(new Event('app:auth-ready'));
    }
  }, [loading]);

  return null;
};

import VendorDashboard from "@/components/VendorDashboard";
import BuyerDashboard from "@/components/BuyerDashboard";
import DeliveryDashboard from "@/components/DeliveryDashboard";
import OrderDetails from "@/components/OrderDetails";
import QRScanner from "@/components/QRScanner";
import AdminDashboard from "@/components/AdminDashboard";
import NotFound from "./pages/NotFound";
import PaymentSuccess from "./pages/PaymentSuccess";
import ColorDemo from "./components/ColorDemo";

const queryClient = new QueryClient();
const paydunyaMode = import.meta.env.VITE_PAYDUNYA_MODE || 'prod';
const envAdminOnlyMode = String(import.meta.env.VITE_ADMIN_ONLY_MODE || '').toLowerCase();
const hostLooksLikeAdmin =
  typeof window !== 'undefined'
  && /(^admin[.-]|admin)/i.test(window.location.hostname || '');
const adminOnlyMode = envAdminOnlyMode === 'true' || (envAdminOnlyMode !== 'false' && hostLooksLikeAdmin);

// Wrapper interne qui déclenche l'animation CSS à chaque changement de route
const AnimatedRoutes: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  return (
    <div key={location.pathname} className="animate-page-in contents">
      {children}
    </div>
  );
};

const App = () => {
  const {
    currentVersion,
    updateInfo,
    isOpen,
    isOpeningStore,
    handleUpdateNow,
    handleLater,
  } = useAppUpdateChecker();

  return (
    <>
      {paydunyaMode === 'sandbox' && (
        <div style={{ background: '#ff9800', color: '#fff', padding: '8px', textAlign: 'center', fontWeight: 'bold', letterSpacing: 1, zIndex: 9999 }}>
          MODE TEST PAYDUNYA (SANDBOX)
        </div>
      )}
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <AuthProvider>
            <AuthReadySignal />
            <BrowserRouter
              future={{
                v7_startTransition: true,
                v7_relativeSplatPath: true,
              }}
            >
              <AppResumeRefresher />
              <ExitConfirmHandler />
              <PushNotificationSetup />
              <SessionTimeoutManager />
              <AnimatedRoutes>
              <Routes>
                {adminOnlyMode && <Route path="/" element={<Navigate to="/admin" replace />} />}

                {!adminOnlyMode && <Route path="/" element={<HomePage />} />}
                {!adminOnlyMode && <Route path="/auth" element={<AuthRoute />} />}
                {!adminOnlyMode && <Route path="/pin-reauth" element={<PinReauth />} />}
                {!adminOnlyMode && <Route path="/colors" element={<ColorDemo />} />}
                {!adminOnlyMode && <Route path="/payment-success" element={<PaymentSuccess />} />}
                {/* Protected Routes for Vendors */}
                {!adminOnlyMode && (
                  <Route 
                    path="/vendor" 
                    element={
                      <ProtectedRoute requiredRole="vendor">
                        <VendorDashboard />
                      </ProtectedRoute>
                    } 
                  />
                )}
                {/* Admin dashboard redirect and param route */}
                <Route
                  path="/admin"
                  element={
                    <ProtectedRoute requiredRole="admin">
                      <AdminDashboard />
                    </ProtectedRoute>
                  }
                />
                <Route path="/admin-login" element={<Navigate to="/admin" replace />} />
                <Route path="/admin/login" element={<Navigate to="/admin" replace />} />
                <Route
                  path="/admin/:adminId"
                  element={
                    <ProtectedRoute requiredRole="admin">
                      <AdminDashboard />
                    </ProtectedRoute>
                  }
                />
                {/* Protected Routes for Buyers */}
                {!adminOnlyMode && (
                  <Route 
                    path="/buyer" 
                    element={
                      <ProtectedRoute requiredRole="buyer">
                        <BuyerDashboard />
                      </ProtectedRoute>
                    } 
                  />
                )}
                {/* Protected Route for Order Details */}
                {!adminOnlyMode && (
                  <Route 
                    path="/orders/:orderId" 
                    element={
                      <ProtectedRoute requiredRole="buyer">
                        <OrderDetails />
                      </ProtectedRoute>
                    } 
                  />
                )}
                {/* Protected Routes for Delivery */}
                {!adminOnlyMode && (
                  <Route 
                    path="/delivery" 
                    element={
                      <ProtectedRoute requiredRole="delivery">
                        <DeliveryDashboard />
                      </ProtectedRoute>
                    } 
                  />
                )}
                {/* Protected Route for QR Scanner */}
                {!adminOnlyMode && (
                  <Route 
                    path="/scanner" 
                    element={
                      <ProtectedRoute requiredRole="delivery">
                        <QRScanner />
                      </ProtectedRoute>
                    } 
                  />
                )}
                {/* Page de succès de paiement, accessible à tous les rôles connectés */}
                {!adminOnlyMode && (
                  <Route 
                    path="/payment-success" 
                    element={
                      <ProtectedRoute>
                        <PaymentSuccess />
                      </ProtectedRoute>
                    }
                  />
                )}
                <Route path="*" element={adminOnlyMode ? <Navigate to="/admin" replace /> : <NotFound />} />
              </Routes>
              </AnimatedRoutes>

              {updateInfo && (
                <UpdateModal
                  open={isOpen}
                  latestVersion={updateInfo.latestVersion}
                  currentVersion={currentVersion}
                  message={updateInfo.message}
                  forceUpdate={updateInfo.forceUpdate}
                  isOpeningStore={isOpeningStore}
                  onUpdateNow={handleUpdateNow}
                  onLater={handleLater}
                />
              )}
            </BrowserRouter>
          </AuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </>
  );
};

export default App;
