
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

// Small helper to redirect /admin to /admin/:userId
const AdminRedirect: React.FC = () => {
  const { user } = useAuth();
  if (!user) return <Navigate to="/auth" replace />;
  return <Navigate to={`/admin/${user.id}`} replace />;
};

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

import VendorDashboard from "@/components/VendorDashboard";
import BuyerDashboard from "@/components/BuyerDashboard";
import DeliveryDashboard from "@/components/DeliveryDashboard";
import OrderDetails from "@/components/OrderDetails";
import QRScanner from "@/components/QRScanner";
import AdminDashboard from "@/components/AdminDashboard";
import AdminLoginForm from "@/components/AdminLoginForm";
import NotFound from "./pages/NotFound";
import PaymentSuccess from "./pages/PaymentSuccess";
import ColorDemo from "./components/ColorDemo";

const queryClient = new QueryClient();
const paydunyaMode = import.meta.env.VITE_PAYDUNYA_MODE || 'prod';

// Wrapper interne qui déclenche l'animation CSS à chaque changement de route
const AnimatedRoutes: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  return (
    <div key={location.pathname} className="animate-page-in contents">
      {children}
    </div>
  );
};

const App = () => (
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
              <Route path="/" element={<HomePage />} />
              <Route path="/auth" element={<AuthRoute />} />
              <Route path="/pin-reauth" element={<PinReauth />} />
              <Route path="/colors" element={<ColorDemo />} />
              <Route path="/payment-success" element={<PaymentSuccess />} />
              {/* Protected Routes for Vendors */}
              <Route 
                path="/vendor" 
                element={
                  <ProtectedRoute requiredRole="vendor">
                    <VendorDashboard />
                  </ProtectedRoute>
                } 
              />
              {/* Admin dashboard redirect and param route */}
              <Route
                path="/admin"
                element={
                  <ProtectedRoute>
                    <AdminRedirect />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/admin/:adminId"
                element={
                  <ProtectedRoute requiredRole="admin">
                    <AdminDashboard />
                  </ProtectedRoute>
                }
              />
              {/* Preview route to view the admin login form without being authenticated */}
              <Route path="/admin-login" element={<AdminLoginForm />} />
              {/* Protected Routes for Buyers */}
              <Route 
                path="/buyer" 
                element={
                  <ProtectedRoute requiredRole="buyer">
                    <BuyerDashboard />
                  </ProtectedRoute>
                } 
              />
              {/* Protected Route for Order Details */}
              <Route 
                path="/orders/:orderId" 
                element={
                  <ProtectedRoute requiredRole="buyer">
                    <OrderDetails />
                  </ProtectedRoute>
                } 
              />
              {/* Protected Routes for Delivery */}
              <Route 
                path="/delivery" 
                element={
                  <ProtectedRoute requiredRole="delivery">
                    <DeliveryDashboard />
                  </ProtectedRoute>
                } 
              />
              {/* Protected Route for QR Scanner */}
              <Route 
                path="/scanner" 
                element={
                  <ProtectedRoute requiredRole="delivery">
                    <QRScanner />
                  </ProtectedRoute>
                } 
              />
              {/* Page de succès de paiement, accessible à tous les rôles connectés */}
              <Route 
                path="/payment-success" 
                element={
                  <ProtectedRoute>
                    <PaymentSuccess />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<NotFound />} />
            </Routes>
            </AnimatedRoutes>
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </>
);

export default App;
