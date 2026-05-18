import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMenuPermissions, ALL_MENUS, MenuKey } from "@/hooks/useMenuPermissions";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Loader2, Shield, Trash2, Lock, Save } from "lucide-react";

type AppRole = "admin" | "manager" | "staff";
const ROLE_LABEL: Record<AppRole, string> = { admin: "Admin", manager: "Manager", staff: "Staff" };

export default function Users() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [{ data: profiles }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("*"),
    ]);
    const merged = (profiles || []).map(p => ({
      ...p,
      role: (roles?.find(r => r.user_id === p.id)?.role || "staff") as AppRole,
    }));
    setUsers(merged);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const changeRole = async (userId: string, newRole: AppRole) => {
    // Replace any existing role
    const { error: delErr } = await supabase.from("user_roles").delete().eq("user_id", userId);
    if (delErr) { toast.error(delErr.message); return; }
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: newRole });
    if (error) { toast.error(error.message); return; }
    toast.success("เปลี่ยนบทบาทแล้ว");
    load();
  };

  const removeUserRole = async (userId: string) => {
    const { error } = await supabase.from("user_roles").delete().eq("user_id", userId);
    if (error) { toast.error(error.message); return; }
    toast.success("ลบบทบาทแล้ว — ผู้ใช้ยังเข้าระบบได้แต่ไม่มีสิทธิ์");
    load();
  };

  if (loading) return <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-primary"/></div>;

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <h1 className="font-display text-3xl font-semibold mb-1">จัดการผู้ใช้</h1>
      <p className="text-muted-foreground mb-6">รายชื่อผู้ใช้ระบบและบทบาท ({users.length} คน)</p>
      <Card className="shadow-soft border-border/60 divide-y">
        {users.map(u => (
          <div key={u.id} className="flex items-center gap-3 p-4 flex-wrap">
            <Avatar><AvatarFallback className="bg-brand-gradient text-primary-foreground">{(u.email || "?")[0].toUpperCase()}</AvatarFallback></Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{u.display_name || u.email}{u.id === me?.id && <span className="text-xs text-muted-foreground ml-2">(คุณ)</span>}</p>
              <p className="text-xs text-muted-foreground truncate">{u.email}</p>
            </div>
            <Badge variant={u.role === "admin" ? "default" : "secondary"} className="hidden sm:flex"><Shield className="w-3 h-3 mr-1"/>{ROLE_LABEL[u.role]}</Badge>
            <Select value={u.role} onValueChange={(v) => changeRole(u.id, v as AppRole)} disabled={u.id === me?.id}>
              <SelectTrigger className="w-32"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
              </SelectContent>
            </Select>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="icon" variant="ghost" disabled={u.id === me?.id} title="ลบบทบาท">
                  <Trash2 className="w-4 h-4 text-destructive"/>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>ลบบทบาทของ {u.email}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    ผู้ใช้จะยังเข้าระบบได้ แต่ไม่มีสิทธิ์ใดๆ การลบบัญชีจริงต้องทำในหน้าตั้งค่าระบบ Backend
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
                  <AlertDialogAction onClick={() => removeUserRole(u.id)}>ลบบทบาท</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ))}
        {users.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">ยังไม่มีผู้ใช้</p>}
      </Card>
      <Card className="mt-4 p-4 bg-muted/30 border-dashed">
        <p className="text-xs text-muted-foreground">
          💡 <strong>วิธีเพิ่มผู้ใช้</strong>: ให้คนใหม่สมัครผ่านหน้า <code className="text-xs">/auth</code> — จะได้บทบาท "Staff" อัตโนมัติ จากนั้นแอดมินมาเปลี่ยนบทบาทที่นี่
        </p>
      </Card>

      <RolePermissionsCard />
    </div>
  );
}

function RolePermissionsCard() {
  const { perms, reload } = useMenuPermissions();
  const [local, setLocal] = useState<Record<"manager" | "staff", MenuKey[]>>({ manager: [], staff: [] });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLocal({
      manager: (perms.manager || []) as MenuKey[],
      staff: (perms.staff || []) as MenuKey[],
    });
  }, [perms]);

  const toggle = (role: "manager" | "staff", key: MenuKey) => {
    setLocal(prev => {
      const has = prev[role].includes(key);
      return { ...prev, [role]: has ? prev[role].filter(k => k !== key) : [...prev[role], key] };
    });
  };

  const save = async () => {
    setSaving(true);
    const rows = (["manager", "staff"] as const).map(role => ({ role, menu_keys: local[role] }));
    const { error } = await supabase.from("role_menu_permissions").upsert(rows, { onConflict: "role" });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("บันทึกสิทธิ์เมนูแล้ว");
    reload();
  };

  return (
    <Card className="mt-6 p-6 shadow-soft border-border/60">
      <div className="flex items-center gap-2 mb-1">
        <Lock className="text-primary w-5 h-5"/>
        <h2 className="font-display text-lg font-semibold">สิทธิ์เมนูตามบทบาท</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">เลือกว่าผู้ใช้ระดับ Manager / Staff เห็นเมนูใดได้บ้าง (Admin เห็นทุกเมนูเสมอ — เมนู "จัดการผู้ใช้" เฉพาะ Admin)</p>
      <div className="space-y-4">
        {(["manager", "staff"] as const).map(role => (
          <div key={role} className="border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="secondary" className="capitalize">{role}</Badge>
              <span className="text-xs text-muted-foreground">{local[role].length} เมนู</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {ALL_MENUS.filter(m => m.key !== "users").map(m => (
                <label key={m.key} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={local[role].includes(m.key)}
                    onCheckedChange={() => toggle(role, m.key)}
                  />
                  <span>{m.label}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
      <Button onClick={save} disabled={saving} className="mt-4">
        {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1"/> : <Save className="w-4 h-4 mr-1"/>}
        บันทึก
      </Button>
    </Card>
  );
}
