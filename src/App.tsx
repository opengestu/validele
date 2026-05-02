
import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { App as CapacitorApp } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import {
  LEGAL_FEATURE_ENABLED,
  LEGAL_CONSENT_ROUTE,
  PRIVACY_POLICY_ROUTE,
  TERMS_OF_USE_ROUTE,
  hasAcceptedLegal,
} from "@/lib/legalConsent";
import ProtectedRoute from "@/components/ProtectedRoute";
import ExitConfirmHandler from "@/components/ExitConfirmHandler";
import AppResumeRefresher from "@/components/AppResumeRefresher";
import PushNotificationSetup from "@/components/PushNotificationSetup";
import SessionTimeoutManager, { REAUTH_REQUIRED_KEY, REAUTH_RETURN_PATH_KEY } from "@/components/SessionTimeoutManager";
import LegalQuickLinks from "@/components/LegalQuickLinks";
import PinReauth from "@/components/PinReauth";
import { Spinner } from "@/components/ui/spinner";
import HomePage from "@/components/HomePage";
import AuthPage from "@/components/AuthPage";
import UpdateModal from "@/components/updates/UpdateModal";
import useAppUpdateChecker from "@/hooks/useAppUpdateChecker";

const AuthRoute: React.FC = () => {
  const { user, userProfile, loading } = useAuth();
  const location = useLocation();
  const pendingSharedProductCode = React.useMemo(() => {
    if (typeof window === 'undefined') return '';
    return String(localStorage.getItem(SHARED_PRODUCT_PENDING_CODE_KEY) || '').trim();
  }, [location.pathname, location.search]);
  const forcePhoneEntry = React.useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('entry') === 'phone' || params.get('switchAccount') === '1';
  }, [location.search]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Spinner size="sm" />
      </div>
    );
  }

  if (user && userProfile?.full_name && pendingSharedProductCode && userProfile.role === 'buyer') {
    return <Navigate to={`/buyer?productCode=${encodeURIComponent(pendingSharedProductCode)}`} replace />;
  }

  if (forcePhoneEntry) {
    return <AuthPage />;
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
import ProductSearch from "@/components/ProductSearch";
import OrderDetails from "@/components/OrderDetails";
import QRScanner from "@/components/QRScanner";
import AdminDashboard from "@/components/AdminDashboard";
import NotFound from "./pages/NotFound";
import PaymentSuccess from "./pages/PaymentSuccess";
import ColorDemo from "./components/ColorDemo";
import LegalConsentPage from "./pages/LegalConsentPage";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";
import TermsOfUsePage from "./pages/TermsOfUsePage";

const queryClient = new QueryClient();
const paydunyaMode = import.meta.env.VITE_PAYDUNYA_MODE || 'prod';
const SHARED_PRODUCT_PENDING_CODE_KEY = 'pending_shared_product_code';
const AUTH_RETURN_PATH_KEY = 'auth_return_path';
const envAdminOnlyMode = String(import.meta.env.VITE_ADMIN_ONLY_MODE || '').toLowerCase();
const hostLooksLikeAdmin =
  typeof window !== 'undefined'
  && /(^admin[.-]|admin)/i.test(window.location.hostname || '');
const adminOnlyMode = envAdminOnlyMode === 'true' || (envAdminOnlyMode !== 'false' && hostLooksLikeAdmin);

const legalRoutes = new Set([
  LEGAL_CONSENT_ROUTE,
  PRIVACY_POLICY_ROUTE,
  TERMS_OF_USE_ROUTE,
]);

const FirstLaunchLegalGate: React.FC = () => {
  const location = useLocation();
  const accepted = React.useMemo(() => hasAcceptedLegal(), [location.pathname]);

  if (!LEGAL_FEATURE_ENABLED) {
    return null;
  }

  if (accepted) {
    return null;
  }

  if (legalRoutes.has(location.pathname)) {
    return null;
  }

  return <Navigate to={LEGAL_CONSENT_ROUTE} replace state={{ from: location.pathname }} />;
};

// Wrapper interne qui déclenche l'animation CSS à chaque changement de route
const AnimatedRoutes: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  return (
    <div key={location.pathname} className="animate-page-in contents">
      {children}
    </div>
  );
};

const DeepLinkHandler: React.FC = () => {
  const lastHandledUrlRef = React.useRef<string>('');

  React.useEffect(() => {
    const routeNativeProductLink = (productCode: string) => {
      const safeCode = String(productCode || '').trim();
      if (!safeCode || typeof window === 'undefined') return;

      const buyerTarget = `/buyer?productCode=${encodeURIComponent(safeCode)}`;
      const productTarget = `/product/${encodeURIComponent(safeCode)}`;
      localStorage.setItem(SHARED_PRODUCT_PENDING_CODE_KEY, safeCode);
      localStorage.setItem(AUTH_RETURN_PATH_KEY, buyerTarget);

      const reauthRequired = localStorage.getItem(REAUTH_REQUIRED_KEY) === '1';
      const hasSmsSession = !!localStorage.getItem('sms_auth_session');
      const hasSupabaseSession = !!localStorage.getItem('supabase_persisted_session');

      let activeRole = '';
      try {
        const smsRaw = localStorage.getItem('sms_auth_session');
        if (smsRaw) {
          const sms = JSON.parse(smsRaw) as { role?: string };
          if (typeof sms?.role === 'string') {
            activeRole = sms.role;
          }
        }
      } catch {
        // ignore parse errors
      }

      if (!activeRole) {
        try {
          const profileRaw = localStorage.getItem('auth_cached_profile_v1');
          if (profileRaw) {
            const profile = JSON.parse(profileRaw) as { role?: string };
            if (typeof profile?.role === 'string') {
              activeRole = profile.role;
            }
          }
        } catch {
          // ignore parse errors
        }
      }

      const isNonBuyerSession = !!activeRole && activeRole !== 'buyer';

      let target = '/auth?entry=phone';

      if (reauthRequired && hasSmsSession) {
        localStorage.setItem(REAUTH_RETURN_PATH_KEY, isNonBuyerSession ? productTarget : buyerTarget);
        target = '/pin-reauth';
      } else if (isNonBuyerSession) {
        // For vendor/delivery/admin sessions, keep user in the product link context
        // so ProductSearch can show the dedicated account-switch notice.
        target = productTarget;
      } else if (activeRole === 'buyer' || hasSmsSession || hasSupabaseSession) {
        target = buyerTarget;
      }

      const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (currentPath !== target) {
        window.history.replaceState({}, '', target);
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
    };

    const routeFromUrl = (rawUrl?: string | null) => {
      const incoming = String(rawUrl || '').trim();
      if (!incoming || typeof window === 'undefined') return;
      if (incoming === lastHandledUrlRef.current) return;

      try {
        const parsed = new URL(incoming);
        const protocol = (parsed.protocol || '').toLowerCase();
        const host = (parsed.host || '').toLowerCase();
        const path = String(parsed.pathname || '').replace(/^\/+/, '');

        if (protocol === 'validel:' && host === 'product' && path) {
          const decoded = decodeURIComponent(path);
          if (Capacitor.isNativePlatform()) {
            lastHandledUrlRef.current = incoming;
            routeNativeProductLink(decoded);
            return;
          }
          const target = `/product/${encodeURIComponent(decoded)}`;
          if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== target) {
            lastHandledUrlRef.current = incoming;
            window.history.replaceState({}, '', target);
            window.dispatchEvent(new PopStateEvent('popstate'));
          }
          return;
        }

        const supportedWebHosts = new Set(
          [
            'validele.pages.dev',
            'www.validel.shop',
            'validel.shop',
            import.meta.env.VITE_PUBLIC_WEB_URL,
            import.meta.env.VITE_SITE_URL,
            import.meta.env.VITE_WEB_APP_URL,
            import.meta.env.VITE_FRONTEND_URL
          ]
            .map((value) => String(value || '').trim().toLowerCase())
            .filter(Boolean)
            .map((value) => {
              try {
                return new URL(value).host.toLowerCase();
              } catch {
                return value.replace(/^https?:\/\//, '').replace(/\/+$/, '');
              }
            })
            .filter(Boolean)
        );

        if ((protocol === 'https:' || protocol === 'http:') && supportedWebHosts.has(host)) {
          const normalizedPath = `/${path}`;
          if (normalizedPath.startsWith('/product/')) {
            const productCode = decodeURIComponent(normalizedPath.replace(/^\/product\//, '')).trim();
            if (Capacitor.isNativePlatform() && productCode) {
              lastHandledUrlRef.current = incoming;
              routeNativeProductLink(productCode);
              return;
            }

            const target = `${normalizedPath}${parsed.search || ''}${parsed.hash || ''}`;
            if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== target) {
              lastHandledUrlRef.current = incoming;
              window.history.replaceState({}, '', target);
              window.dispatchEvent(new PopStateEvent('popstate'));
            }
          }
        }
      } catch {
        // ignore malformed urls
      }
    };

    let disposed = false;
    let listenerHandle: { remove: () => Promise<void> | void } | null = null;

    void CapacitorApp.getLaunchUrl()
      .then((res) => {
        if (!disposed) routeFromUrl(res?.url);
      })
      .catch(() => {});

    void CapacitorApp.addListener('appUrlOpen', (event) => {
      routeFromUrl(event?.url);
    })
      .then((handle) => {
        if (disposed) {
          void handle.remove();
          return;
        }
        listenerHandle = handle;
      })
      .catch(() => {});

    return () => {
      disposed = true;
      if (listenerHandle) {
        void listenerHandle.remove();
      }
    };
  }, []);

  return null;
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
              <DeepLinkHandler />
              <FirstLaunchLegalGate />
              <AppResumeRefresher />
              <ExitConfirmHandler />
              <PushNotificationSetup />
              <SessionTimeoutManager />
              <AnimatedRoutes>
              <Routes>
                {LEGAL_FEATURE_ENABLED && (
                  <>
                    <Route path={LEGAL_CONSENT_ROUTE} element={<LegalConsentPage />} />
                    <Route path={PRIVACY_POLICY_ROUTE} element={<PrivacyPolicyPage />} />
                    <Route path={TERMS_OF_USE_ROUTE} element={<TermsOfUsePage />} />
                  </>
                )}

                {adminOnlyMode && <Route path="/" element={<Navigate to="/admin" replace />} />}

                {!adminOnlyMode && <Route path="/" element={<HomePage />} />}
                {!adminOnlyMode && <Route path="/auth" element={<AuthRoute />} />}
                {!adminOnlyMode && <Route path="/pin-reauth" element={<PinReauth />} />}
                {!adminOnlyMode && <Route path="/colors" element={<ColorDemo />} />}
                {!adminOnlyMode && <Route path="/product" element={<ProductSearch />} />}
                {!adminOnlyMode && <Route path="/product/:code" element={<ProductSearch />} />}
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
                {/* Page de succès de paiement: doit rester accessible après une redirection externe */}
                {!adminOnlyMode && <Route path="/payment-success" element={<PaymentSuccess />} />}
                <Route path="*" element={adminOnlyMode ? <Navigate to="/admin" replace /> : <NotFound />} />
              </Routes>
              </AnimatedRoutes>
              {LEGAL_FEATURE_ENABLED && <LegalQuickLinks />}

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
