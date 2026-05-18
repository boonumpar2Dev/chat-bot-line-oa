import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useMenuPermissions, MenuKey } from "@/hooks/useMenuPermissions";
import { Loader2 } from "lucide-react";

export default function ProtectedRoute({
  children,
  adminOnly,
  menuKey,
}: {
  children: ReactNode;
  adminOnly?: boolean;
  menuKey?: MenuKey;
}) {
  const { user, role, loading } = useAuth();
  const { perms, loading: permsLoading } = useMenuPermissions();

  if (loading || (menuKey && permsLoading))
    return <div className="h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary"/></div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (adminOnly && role !== "admin") return <Navigate to="/" replace />;
  if (menuKey && role && role !== "admin") {
    const allowed = perms[role as "manager" | "staff"] || [];
    if (!allowed.includes(menuKey)) return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
