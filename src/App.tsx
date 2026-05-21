import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/hooks/useAuth";
import { MenuPermissionsProvider } from "@/hooks/useMenuPermissions";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/AppLayout";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Chats from "./pages/Chats";
import Knowledge from "./pages/Knowledge";
import Settings from "./pages/Settings";
import Users from "./pages/Users";
import LiffPanel from "./pages/LiffPanel";
import AiTokens from "./pages/AiTokens";
import LineConnection from "./pages/LineConnection";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <MenuPermissionsProvider>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/liff" element={<LiffPanel />} />
              <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
                <Route path="/" element={<ProtectedRoute menuKey="dashboard"><Dashboard /></ProtectedRoute>} />
                <Route path="/chats" element={<ProtectedRoute menuKey="chats"><Chats /></ProtectedRoute>} />
                <Route path="/knowledge" element={<ProtectedRoute menuKey="knowledge"><Knowledge /></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute menuKey="settings"><Settings /></ProtectedRoute>} />
                <Route path="/users" element={<ProtectedRoute adminOnly><Users /></ProtectedRoute>} />
                <Route path="/ai-tokens" element={<ProtectedRoute adminOnly><AiTokens /></ProtectedRoute>} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Routes>
          </MenuPermissionsProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
