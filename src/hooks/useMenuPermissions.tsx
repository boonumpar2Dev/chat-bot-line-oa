import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type MenuKey = "dashboard" | "chats" | "knowledge" | "ai_settings" | "tags" | "users" | "ai_tokens" | "settings";

export const ALL_MENUS: { key: MenuKey; label: string; adminOnly?: boolean; ownerOnly?: boolean }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "chats", label: "จัดการแชท" },
  { key: "knowledge", label: "สอน AI" },
  { key: "ai_settings", label: "ตั้งค่า AI" },
  { key: "tags", label: "แท็กลูกค้า" },
  { key: "settings", label: "ตั้งค่า" },
  { key: "users", label: "จัดการผู้ใช้", adminOnly: true },
  { key: "ai_tokens", label: "AI Tokens", ownerOnly: true },
];

export const ROLE_DEFAULTS: Record<"owner" | "admin" | "manager" | "staff", MenuKey[]> = {
  owner: ["dashboard", "chats", "knowledge", "ai_settings", "tags", "settings", "users", "ai_tokens"],
  admin: ["dashboard", "chats", "knowledge", "ai_settings", "tags", "settings", "users"],
  manager: ["dashboard", "chats", "knowledge", "ai_settings", "tags", "settings"],
  staff: ["chats"],
};

interface Ctx {
  menus: MenuKey[];
  loading: boolean;
  reload: () => Promise<void>;
}

const C = createContext<Ctx>({ menus: [], loading: true, reload: async () => {} });

export const MenuPermissionsProvider = ({ children }: { children: ReactNode }) => {
  const { user, role } = useAuth();
  const [menus, setMenus] = useState<MenuKey[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    if (!user || !role) { setMenus([]); setLoading(false); return; }

    if (role === "owner") {
      setMenus(ROLE_DEFAULTS.owner);
      setLoading(false);
      return;
    }
    if (role === "admin") {
      setMenus(ROLE_DEFAULTS.admin);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("user_menu_permissions")
      .select("menu_keys")
      .eq("user_id", user.id)
      .maybeSingle();
    if (data?.menu_keys) {
      setMenus(data.menu_keys as MenuKey[]);
    } else {
      setMenus(ROLE_DEFAULTS[role as "manager" | "staff"] || []);
    }
    setLoading(false);
  }, [user, role]);

  useEffect(() => { reload(); }, [reload]);

  return <C.Provider value={{ menus, loading, reload }}>{children}</C.Provider>;
};

export const useMenuPermissions = () => useContext(C);
