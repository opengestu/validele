
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import ExitConfirmHandler from "@/components/ExitConfirmHandler";
import AppResumeRefresher from "@/components/AppResumeRefresher";
import PushNotificationSetup from "@/components/PushNotificationSetup";
import HomePage from "@/components/HomePage";
import AuthPage from "@/components/AuthPage";
import VendorDashboard from "@/components/VendorDashboard";
import BuyerDashboard from "@/components/BuyerDashboard";
import DeliveryDashboard from "@/components/DeliveryDashboard";
import OrderDetails from "@/components/OrderDetails";
import QRScanner from "@/components/QRScanner";
import NotFound from "./pages/NotFound";
import PaymentSuccess from "./pages/PaymentSuccess";
import ColorDemo from "./components/ColorDemo";

const queryClient = new QueryClient();
const paydunyaMode = import.meta.env.VITE_PAYDUNYA_MODE || 'prod';

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
          <BrowserRouter>
            <AppResumeRefresher />
            <ExitConfirmHandler />
            <PushNotificationSetup />
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/colors" element={<ColorDemo />} />
              {/* Protected Routes for Vendors */}
              <Route 
                path="/vendor" 
                element={
                  <ProtectedRoute requiredRole="vendor">
                    <VendorDashboard />
                  </ProtectedRoute>
                } 
              />
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
          </BrowserRouter>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  </>
);

export default App;
