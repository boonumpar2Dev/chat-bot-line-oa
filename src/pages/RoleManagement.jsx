import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Users, Shield, Loader2, UserPlus, Trash2, X } from "lucide-react";

export default function RoleManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState("user");
  const [addingUser, setAddingUser] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    const data = await base44.entities.User.list();
    setUsers(data || []);
    setLoading(false);
  };

  const changeRole = async (userId, newRoleVal) => {
    setSaving(userId);
    await base44.entities.User.update(userId, { role: newRoleVal });
    toast.success("อัปเดตสำเร็จ");
    await fetchUsers();
    setSaving(null);
  };

  const handleAddUser = async () => {
    if (!newEmail.trim()) {
      toast.error("กรุณากรอกอีเมล");
      return;
    }
    setAddingUser(true);
    await base44.users.inviteUser(newEmail.trim(), newRole);
    toast.success("ส่งคำเชิญสำเร็จ");
    setShowAddModal(false);
    setNewEmail("");
    setNewRole("user");
    setAddingUser(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 space-y-6 max-w-4xl">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-foreground flex items-center gap-2">
            <Users className="w-6 h-6 text-green-600" /> จัดการผู้ใช้และสิทธิ์
          </h1>
          <p className="text-muted-foreground text-sm mt-1">เชิญหรือกำหนด Role ให้ผู้ใช้ในระบบ</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-green-600 text-white text-sm font-semibold hover:opacity-90 transition-opacity self-start"
        >
          <UserPlus className="w-4 h-4" /> เชิญผู้ใช้
        </button>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 lg:hidden">
        {users.map((u) => (
          <div key={u.id} className="stat-card !p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                <Shield className="w-4 h-4 text-green-600" />
              </div>
              <div className="min-w-0">
                <div className="font-medium text-foreground truncate">{u.full_name || u.email}</div>
                <div className="text-xs text-muted-foreground">{u.email}</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {saving === u.id ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              ) : (
                <select
                  value={u.role || "user"}
                  onChange={(e) => changeRole(u.id, e.target.value)}
                  className="flex-1 px-3 py-1.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                  <option value="executive">Executive</option>
                </select>
              )}
            </div>
          </div>
        ))}
        {users.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">ยังไม่มีผู้ใช้ในระบบ</div>
        )}
      </div>

      {/* Desktop table */}
      <div className="stat-card overflow-hidden !p-0 hidden lg:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">ผู้ใช้</th>
              <th className="text-left px-4 py-3 text-muted-foreground font-medium">Role</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                      <Shield className="w-4 h-4 text-green-600" />
                    </div>
                    <div>
                      <div className="font-medium text-foreground">{u.full_name || "ไม่มีชื่อ"}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {saving === u.id ? (
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  ) : (
                    <select
                      value={u.role || "user"}
                      onChange={(e) => changeRole(u.id, e.target.value)}
                      className="px-3 py-1.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                      <option value="executive">Executive</option>
                    </select>
                  )}
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={2} className="text-center py-8 text-muted-foreground">ยังไม่มีผู้ใช้ในระบบ</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl p-6 w-full max-w-md shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-foreground text-lg">เชิญผู้ใช้ใหม่</h3>
              <button onClick={() => setShowAddModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-foreground">อีเมล</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="user@example.com"
                  className="w-full mt-1 px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-foreground">Role</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full mt-1 px-3 py-2.5 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                  <option value="executive">Executive</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowAddModal(false)} className="flex-1 px-4 py-2.5 rounded-lg border border-input text-sm text-muted-foreground hover:bg-muted">
                ยกเลิก
              </button>
              <button
                onClick={handleAddUser}
                disabled={addingUser}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-green-600 text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50"
              >
                {addingUser && <Loader2 className="w-4 h-4 animate-spin" />}
                เชิญ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}