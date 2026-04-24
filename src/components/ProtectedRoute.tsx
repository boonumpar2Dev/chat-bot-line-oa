import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Loader2 } from "lucide-react";

export default function ProtectedRoute({ children, adminOnly }: { children: ReactNode; adminOnly?: boolean }) {
  const { user, role, loading } = useAuth();
  if (loading) return <div className="h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary"/></div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (adminOnly && role !== "admin") return <Navigate to="/" replace />;
  return <>{children}</>;
}
