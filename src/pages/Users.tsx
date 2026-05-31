import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMenuPermissions, ALL_MENUS, MenuKey, ROLE_DEFAULTS } from "@/hooks/useMenuPermissions";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Loader2, Shield, Trash2, Plus, Lock, Save, Pencil, KeyRound } from "lucide-react";

type AppRole = "owner" | "admin" | "manager" | "staff";
const ROLE_LABEL: Record<AppRole, string> = { owner: "Owner", admin: "Admin", manager: "Manager", staff: "Staff" };
const ASSIGNABLE_MENUS = ALL_MENUS.filter(m => !m.adminOnly && !m.ownerOnly);

export default function Users() {
  const { user: me, role: myRole } = useAuth();
  const isOwner = myRole === "owner";
  const { reload: reloadMenus } = useMenuPermissions();
  const [users, setUsers] = useState<any[]>([]);
  const [perms, setPerms] = useState<Record<string, MenuKey[]>>({});
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [{ data: profiles }, { data: roles }, { data: ps }] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("*"),
      supabase.from("user_menu_permissions").select("*"),
    ]);
    const merged = (profiles || []).map(p => ({
      ...p,
      role: (roles?.find(r => r.user_id === p.id)?.role || "staff") as AppRole,
    }));
    // Hide owner users from non-owner viewers
    const filtered = isOwner ? merged : merged.filter(u => u.role !== "owner");
    const pmap: Record<string, MenuKey[]> = {};
    (ps || []).forEach((r: any) => { pmap[r.user_id] = r.menu_keys as MenuKey[]; });
    setUsers(filtered);
    setPerms(pmap);
    setLoading(false);
  };

  useEffect(() => { load(); }, [isOwner]);

  const changeRole = async (userId: string, newRole: AppRole) => {
    await supabase.from("user_roles").delete().eq("user_id", userId);
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: newRole });
    if (error) { toast.error(error.message); return; }
    toast.success("เปลี่ยนบทบาทแล้ว");
    load();
  };

  const deleteUser = async (userId: string) => {
    const { data, error } = await supabase.functions.invoke("admin-delete-user", { body: { user_id: userId } });
    if (error || (data as any)?.error) { toast.error((data as any)?.error || error?.message || "ลบไม่สำเร็จ"); return; }
    toast.success("ลบผู้ใช้แล้ว");
    load();
  };

  if (loading) return <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-primary"/></div>;

  return (
    <div className="p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-3 mb-6 flex-wrap">
        <div>
          <h1 className="font-display text-3xl font-semibold mb-1">จัดการผู้ใช้</h1>
          <p className="text-muted-foreground">รายชื่อผู้ใช้ระบบและบทบาท ({users.length} คน)</p>
        </div>
        <AddUserDialog onCreated={() => { load(); reloadMenus(); }} />
      </div>

      <Card className="shadow-soft border-border/60 divide-y">
        {users.map(u => (
          <div key={u.id} className="flex items-center gap-3 p-4 flex-wrap">
            <Avatar><AvatarFallback className="bg-brand-gradient text-primary-foreground">{(u.email || "?")[0].toUpperCase()}</AvatarFallback></Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{u.display_name || u.email}{u.id === me?.id && <span className="text-xs text-muted-foreground ml-2">(คุณ)</span>}</p>
              <p className="text-xs text-muted-foreground truncate">{u.email}</p>
            </div>
            <Badge variant={u.role === "owner" || u.role === "admin" ? "default" : "secondary"} className="hidden sm:flex"><Shield className="w-3 h-3 mr-1"/>{ROLE_LABEL[u.role]}</Badge>
            <Select value={u.role} onValueChange={(v) => changeRole(u.id, v as AppRole)} disabled={u.id === me?.id || (u.role === "owner" && !isOwner)}>
              <SelectTrigger className="w-32"><SelectValue/></SelectTrigger>
              <SelectContent>
                {isOwner && <SelectItem value="owner">Owner</SelectItem>}
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
              </SelectContent>
            </Select>
            {u.role !== "admin" && u.role !== "owner" && (
              <EditMenuDialog
                userId={u.id}
                userLabel={u.display_name || u.email}
                role={u.role}
                current={perms[u.id] || ROLE_DEFAULTS[u.role]}
                onSaved={() => { load(); reloadMenus(); }}
              />
            )}
            <EditUserDialog user={u} onSaved={load} disabled={u.role === "owner" && !isOwner} />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="icon" variant="ghost" disabled={u.id === me?.id || (u.role === "owner" && !isOwner)} title="ลบผู้ใช้">
                  <Trash2 className="w-4 h-4 text-destructive"/>
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>ลบผู้ใช้ {u.email}?</AlertDialogTitle>
                  <AlertDialogDescription>ผู้ใช้จะถูกลบออกจากระบบทั้งหมด (auth, profile, roles, สิทธิ์เมนู) — การกระทำนี้ไม่สามารถย้อนกลับได้</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
                  <AlertDialogAction onClick={() => deleteUser(u.id)} className="bg-destructive hover:bg-destructive/90">ลบถาวร</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ))}
        {users.length === 0 && <p className="p-8 text-center text-sm text-muted-foreground">ยังไม่มีผู้ใช้</p>}
      </Card>

      <Card className="mt-6 p-5 bg-muted/30 border-dashed">
        <div className="flex items-center gap-2 mb-2"><Lock className="w-4 h-4 text-primary"/><h3 className="font-semibold">บทบาทและสิทธิ์เริ่มต้น</h3></div>
        <ul className="text-sm text-muted-foreground space-y-1 ml-6 list-disc">
          {isOwner && <li><strong>Owner</strong> — เจ้าของระบบ (เห็นทุกอย่างรวม AI Tokens) — ซ่อนจากผู้ใช้อื่น</li>}
          <li><strong>Admin</strong> — เห็นและจัดการทุกเมนู (รวม "จัดการผู้ใช้")</li>
          <li><strong>Manager</strong> — Dashboard, จัดการแชท, สอน AI, ตั้งค่า</li>
          <li><strong>Staff</strong> — จัดการแชท เท่านั้น</li>
        </ul>
        <p className="text-xs text-muted-foreground mt-3">ค่าเริ่มต้นใช้เมื่อยังไม่กำหนดสิทธิ์เฉพาะคน — กดปุ่ม "สิทธิ์เมนู" หลังรายชื่อเพื่อปรับเฉพาะรายบุคคล</p>
      </Card>
    </div>
  );
}

function AddUserDialog({ onCreated, isOwner }: { onCreated: () => void; isOwner: boolean }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<AppRole>("staff");
  const [menus, setMenus] = useState<MenuKey[]>(ROLE_DEFAULTS.staff);
  const [busy, setBusy] = useState(false);

  // Reset menus when role changes
  useEffect(() => { setMenus(ROLE_DEFAULTS[role]); }, [role]);

  const reset = () => {
    setEmail(""); setPassword(""); setDisplayName("");
    setRole("staff"); setMenus(ROLE_DEFAULTS.staff);
  };

  const toggle = (k: MenuKey) => setMenus(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]);

  const submit = async () => {
    if (!email || !password) { toast.error("กรอก email และ password"); return; }
    if (password.length < 6) { toast.error("password อย่างน้อย 6 ตัวอักษร"); return; }
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("admin-create-user", {
      body: { email, password, display_name: displayName, role, menu_keys: menus },
    });
    setBusy(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || "สร้างไม่สำเร็จ");
      return;
    }
    toast.success("เพิ่มผู้ใช้สำเร็จ");
    setOpen(false); reset(); onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button><Plus className="w-4 h-4 mr-1"/>เพิ่มผู้ใช้</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>เพิ่มผู้ใช้ใหม่</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Email *</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="user@example.com" />
          </div>
          <div>
            <Label>Password * (อย่างน้อย 6 ตัว)</Label>
            <Input type="text" value={password} onChange={e => setPassword(e.target.value)} placeholder="กำหนด password เริ่มต้น" />
          </div>
          <div>
            <Label>ชื่อแสดง</Label>
            <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="ชื่อที่จะแสดง" />
          </div>
          <div>
            <Label>บทบาท</Label>
            <Select value={role} onValueChange={(v) => setRole(v as AppRole)}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>
                {isOwner && <SelectItem value="owner">Owner (เจ้าของระบบ — เห็นทุกอย่าง)</SelectItem>}
                <SelectItem value="admin">Admin (เห็นทุกเมนูปกติ)</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {role !== "admin" && role !== "owner" && (
            <div>
              <Label className="mb-2 block">สิทธิ์เมนู</Label>
              <div className="grid grid-cols-2 gap-2 p-3 border rounded-lg">
                {ASSIGNABLE_MENUS.map(m => (
                  <label key={m.key} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={menus.includes(m.key)} onCheckedChange={() => toggle(m.key)} />
                    <span>{m.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>ยกเลิก</Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1"/> : <Save className="w-4 h-4 mr-1"/>}
            สร้างผู้ใช้
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditMenuDialog({
  userId, userLabel, role, current, onSaved,
}: { userId: string; userLabel: string; role: AppRole; current: MenuKey[]; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [menus, setMenus] = useState<MenuKey[]>(current);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) setMenus(current); }, [open, current]);

  const toggle = (k: MenuKey) => setMenus(prev => prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]);

  const save = async () => {
    setBusy(true);
    const { error } = await supabase
      .from("user_menu_permissions")
      .upsert({ user_id: userId, menu_keys: menus }, { onConflict: "user_id" });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("บันทึกสิทธิ์เมนูแล้ว");
    setOpen(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Lock className="w-3.5 h-3.5 mr-1"/>สิทธิ์เมนู</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>สิทธิ์เมนูของ {userLabel}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">บทบาท: {ROLE_LABEL[role]} · เลือกเมนูที่ผู้ใช้นี้เห็นได้</p>
        <div className="grid grid-cols-2 gap-2 p-3 border rounded-lg">
          {ASSIGNABLE_MENUS.map(m => (
            <label key={m.key} className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={menus.includes(m.key)} onCheckedChange={() => toggle(m.key)} />
              <span>{m.label}</span>
            </label>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>ยกเลิก</Button>
          <Button onClick={save} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1"/> : <Save className="w-4 h-4 mr-1"/>}
            บันทึก
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({ user, onSaved, disabled }: { user: any; onSaved: () => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(user.email || "");
  const [displayName, setDisplayName] = useState(user.display_name || "");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setEmail(user.email || "");
      setDisplayName(user.display_name || "");
      setPassword("");
    }
  }, [open, user]);

  const submit = async () => {
    if (password && password.length < 6) { toast.error("password อย่างน้อย 6 ตัวอักษร"); return; }
    setBusy(true);
    const body: any = { user_id: user.id };
    if (email.trim() !== (user.email || "")) body.email = email.trim();
    if (displayName !== (user.display_name || "")) body.display_name = displayName;
    if (password) body.password = password;
    const { data, error } = await supabase.functions.invoke("admin-update-user", { body });
    setBusy(false);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || "อัปเดตไม่สำเร็จ");
      return;
    }
    toast.success("อัปเดตผู้ใช้แล้ว");
    setOpen(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={disabled}><Pencil className="w-3.5 h-3.5 mr-1"/>แก้ไข</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>แก้ไขผู้ใช้</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={e => setEmail(e.target.value)} />
          </div>
          <div>
            <Label>ชื่อแสดง</Label>
            <Input value={displayName} onChange={e => setDisplayName(e.target.value)} />
          </div>
          <div>
            <Label className="flex items-center gap-1"><KeyRound className="w-3.5 h-3.5"/>รีเซ็ตรหัสผ่าน (เว้นว่างถ้าไม่เปลี่ยน)</Label>
            <Input type="text" value={password} onChange={e => setPassword(e.target.value)} placeholder="รหัสผ่านใหม่ อย่างน้อย 6 ตัว" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>ยกเลิก</Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin mr-1"/> : <Save className="w-4 h-4 mr-1"/>}
            บันทึก
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

