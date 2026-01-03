import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { AuthProvider } from "@/hooks/useAuth";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { AdminRoute } from "@/components/auth/AdminRoute";
import Index from "./pages/Index";
import Login from "./pages/Login";
import NoAccess from "./pages/NoAccess";
import Clients from "./pages/Clients";
import Cars from "./pages/Cars";
import Policies from "./pages/Policies";
import Companies from "./pages/Companies";
import Brokers from "./pages/Brokers";
import BrokerWallet from "./pages/BrokerWallet";
import Cheques from "./pages/Cheques";
import Media from "./pages/Media";
import AdminUsers from "./pages/AdminUsers";
import CompanySettlement from "./pages/CompanySettlement";
import CompanySettlementDetail from "./pages/CompanySettlementDetail";

import InvoiceTemplates from "./pages/InvoiceTemplates";
import InsuranceCategories from "./pages/InsuranceCategories";
import RoadServices from "./pages/RoadServices";
import AccidentFeeServices from "./pages/AccidentFeeServices";
import PaymentSettings from "./pages/PaymentSettings";
import SmsSettings from "./pages/SmsSettings";
import CustomerSignatures from "./pages/CustomerSignatures";
import PaymentSuccess from "./pages/PaymentSuccess";
import PaymentFail from "./pages/PaymentFail";
import SignaturePage from "./pages/SignaturePage";
import Notifications from "./pages/Notifications";
import WordPressImport from "./pages/WordPressImport";
import DatabaseMigration from "./pages/DatabaseMigration";
import NotFound from "./pages/NotFound";
import SmsHistory from "./pages/SmsHistory";
import DebtTracking from "./pages/DebtTracking";
import AuthSettings from "./pages/AuthSettings";
import FinancialReports from "./pages/FinancialReports";
import CompanyWallet from "./pages/CompanyWallet";
import ElzamiCostsReport from "./pages/ElzamiCostsReport";
import PolicyReports from "./pages/PolicyReports";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Prevent "reload-like" behavior when returning to the tab
      refetchOnWindowFocus: false,
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <HelmetProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/no-access" element={<NoAccess />} />
              <Route path="/" element={
                <ProtectedRoute>
                  <Index />
                </ProtectedRoute>
              } />
              <Route path="/clients" element={
                <ProtectedRoute>
                  <Clients />
                </ProtectedRoute>
              } />
              <Route path="/cars" element={
                <ProtectedRoute>
                  <Cars />
                </ProtectedRoute>
              } />
              <Route path="/policies" element={
                <ProtectedRoute>
                  <Policies />
                </ProtectedRoute>
              } />
              {/* Admin-only route: Companies */}
              <Route path="/companies" element={
                <AdminRoute>
                  <Companies />
                </AdminRoute>
              } />
              {/* Admin-only routes: Brokers, BrokerWallet */}
              <Route path="/brokers" element={
                <AdminRoute>
                  <Brokers />
                </AdminRoute>
              } />
              <Route path="/brokers/:brokerId/wallet" element={
                <AdminRoute>
                  <BrokerWallet />
                </AdminRoute>
              } />
              <Route path="/cheques" element={
                <ProtectedRoute>
                  <Cheques />
                </ProtectedRoute>
              } />
              <Route path="/media" element={
                <ProtectedRoute>
                  <Media />
                </ProtectedRoute>
              } />
              {/* Admin-only routes */}
              <Route path="/admin/users" element={
                <AdminRoute>
                  <AdminUsers />
                </AdminRoute>
              } />
              <Route path="/reports/company-settlement" element={
                <AdminRoute>
                  <CompanySettlement />
                </AdminRoute>
              } />
              <Route path="/reports/company-settlement/:companyId" element={
                <AdminRoute>
                  <CompanySettlementDetail />
                </AdminRoute>
              } />
              <Route path="/companies/:companyId/wallet" element={
                <AdminRoute>
                  <CompanyWallet />
                </AdminRoute>
              } />
              <Route path="/admin/invoice-templates" element={
                <AdminRoute>
                  <InvoiceTemplates />
                </AdminRoute>
              } />
              <Route path="/admin/insurance-categories" element={
                <AdminRoute>
                  <InsuranceCategories />
                </AdminRoute>
              } />
              <Route path="/admin/road-services" element={
                <AdminRoute>
                  <RoadServices />
                </AdminRoute>
              } />
              <Route path="/admin/accident-fee-services" element={
                <AdminRoute>
                  <AccidentFeeServices />
                </AdminRoute>
              } />
              <Route path="/admin/payment-settings" element={
                <AdminRoute>
                  <PaymentSettings />
                </AdminRoute>
              } />
              <Route path="/admin/sms-settings" element={
                <AdminRoute>
                  <SmsSettings />
                </AdminRoute>
              } />
              <Route path="/admin/customer-signatures" element={
                <AdminRoute>
                  <CustomerSignatures />
                </AdminRoute>
              } />
              <Route path="/notifications" element={
                <ProtectedRoute>
                  <Notifications />
                </ProtectedRoute>
              } />
              <Route path="/admin/wordpress-import" element={
                <AdminRoute>
                  <WordPressImport />
                </AdminRoute>
              } />
              <Route path="/admin/database-migration" element={
                <AdminRoute>
                  <DatabaseMigration />
                </AdminRoute>
              } />
              <Route path="/sms-history" element={
                <AdminRoute>
                  <SmsHistory />
                </AdminRoute>
              } />
              <Route path="/debt-tracking" element={
                <ProtectedRoute>
                  <DebtTracking />
                </ProtectedRoute>
              } />
              <Route path="/admin/auth-settings" element={
                <AdminRoute>
                  <AuthSettings />
                </AdminRoute>
              } />
              <Route path="/reports/financial" element={
                <AdminRoute>
                  <FinancialReports />
                </AdminRoute>
              } />
              <Route path="/reports/elzami-costs" element={
                <AdminRoute>
                  <ElzamiCostsReport />
                </AdminRoute>
              } />
              <Route path="/reports/policies" element={
                <ProtectedRoute>
                  <PolicyReports />
                </ProtectedRoute>
              } />
              {/* Public payment callback routes (loaded in iframe) */}
              <Route path="/payment/success" element={<PaymentSuccess />} />
              <Route path="/payment/fail" element={<PaymentFail />} />
              {/* Public signature page */}
              <Route path="/sign/:token" element={<SignaturePage />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </HelmetProvider>
  </QueryClientProvider>
);

export default App;
