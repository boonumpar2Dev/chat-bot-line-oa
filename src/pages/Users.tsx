import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Loader2, Shield } from "lucide-react";

export default function Users() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(()=>{
    (async()=>{
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*"),
        supabase.from("user_roles").select("*"),
      ]);
      const merged = (profiles||[]).map(p=>({ ...p, role: roles?.find(r=>r.user_id===p.id)?.role || "staff" }));
      setUsers(merged); setLoading(false);
    })();
  },[]);

  if (loading) return <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-primary"/></div>;

  return (
    <div className="p-6 lg:p-8 max-w-4xl mx-auto">
      <h1 className="font-display text-3xl font-semibold mb-1">จัดการผู้ใช้</h1>
      <p className="text-muted-foreground mb-6">รายชื่อผู้ใช้ระบบและบทบาท</p>
      <Card className="shadow-soft border-border/60 divide-y">
        {users.map(u=>(
          <div key={u.id} className="flex items-center gap-3 p-4">
            <Avatar><AvatarFallback className="bg-brand-gradient text-primary-foreground">{(u.email||"?")[0].toUpperCase()}</AvatarFallback></Avatar>
            <div className="flex-1 min-w-0">
              <p className="font-medium">{u.display_name || u.email}</p>
              <p className="text-xs text-muted-foreground">{u.email}</p>
            </div>
            <Badge variant={u.role==="admin"?"default":"secondary"}><Shield className="w-3 h-3 mr-1"/>{u.role}</Badge>
          </div>
        ))}
      </Card>
      <p className="text-xs text-muted-foreground mt-4">การเปลี่ยนบทบาทจะเปิดใช้งานในเฟสถัดไป</p>
    </div>
  );
}
