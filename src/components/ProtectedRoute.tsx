import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useMenuPermissions, MenuKey } from "@/hooks/useMenuPermissions";
import { Loader2 } from "lucide-react";

export default function ProtectedRoute({
  children,
  adminOnly,
  ownerOnly,
  menuKey,
}: {
  children: ReactNode;
  adminOnly?: boolean;
  ownerOnly?: boolean;
  menuKey?: MenuKey;
}) {
  const { user, role, loading } = useAuth();
  const { menus, loading: permsLoading } = useMenuPermissions();

  if (loading || (menuKey && permsLoading))
    return <div className="h-screen flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-primary"/></div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (ownerOnly && role !== "owner") return <Navigate to="/" replace />;
  if (adminOnly && role !== "admin" && role !== "owner") return <Navigate to="/" replace />;
  if (menuKey && role && role !== "admin" && role !== "owner" && !menus.includes(menuKey)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}
