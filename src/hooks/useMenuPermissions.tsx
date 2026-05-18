import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type MenuKey = "dashboard" | "chats" | "knowledge" | "users" | "settings";
export const ALL_MENUS: { key: MenuKey; label: string }[] = [
  { key: "dashboard", label: "Dashboard" },
  { key: "chats", label: "จัดการแชท" },
  { key: "knowledge", label: "สอน AI" },
  { key: "users", label: "จัดการผู้ใช้" },
  { key: "settings", label: "ตั้งค่า" },
];

type PermMap = Partial<Record<"manager" | "staff", MenuKey[]>>;

interface Ctx {
  perms: PermMap;
  loading: boolean;
  reload: () => Promise<void>;
}

const C = createContext<Ctx>({ perms: {}, loading: true, reload: async () => {} });

export const MenuPermissionsProvider = ({ children }: { children: ReactNode }) => {
  const [perms, setPerms] = useState<PermMap>({});
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const { data } = await supabase.from("role_menu_permissions").select("role, menu_keys");
    const m: PermMap = {};
    (data || []).forEach((r: any) => { m[r.role as "manager" | "staff"] = r.menu_keys as MenuKey[]; });
    setPerms(m);
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  return <C.Provider value={{ perms, loading, reload }}>{children}</C.Provider>;
};

export const useMenuPermissions = () => useContext(C);
