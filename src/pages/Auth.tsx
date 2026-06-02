import { useState, FormEvent, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import boonumparLogo from "@/assets/boonumpar-logo.png.asset.json";

export default function Auth() {
  const nav = useNavigate();
  const { user, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [name, setName] = useState("");

  useEffect(() => { if (!loading && user) nav("/", { replace: true }); }, [user, loading, nav]);

  const signIn = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    setBusy(false);
    if (error) toast.error(error.message); else toast.success("เข้าสู่ระบบสำเร็จ");
  };



  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex flex-col justify-between p-12 bg-brand-gradient text-primary-foreground relative overflow-hidden">
        <div className="flex items-center gap-3 relative z-10">
          <div className="w-11 h-11 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center">
            <ChefHat className="w-6 h-6" />
          </div>
          <span className="font-display text-xl font-semibold">Catering Bot</span>
        </div>
        <div className="relative z-10 space-y-4">
          <h1 className="font-display text-4xl font-semibold leading-tight">
            ระบบจัดการแชท<br/>LINE OA สำหรับธุรกิจจัดเลี้ยง
          </h1>
          <p className="text-primary-foreground/80 text-lg max-w-md">
            ตอบลูกค้าอัตโนมัติด้วย AI · จัดการแพ็คเกจ · ติดตามลูกค้า ครบในที่เดียว
          </p>
        </div>
        <div className="absolute -right-24 -bottom-24 w-96 h-96 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute -left-12 top-1/3 w-72 h-72 rounded-full bg-primary-glow/30 blur-3xl" />
      </div>

      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md p-8 shadow-elevated border-border/60">
          <div className="lg:hidden flex items-center gap-2 mb-6">
            <div className="w-9 h-9 rounded-lg bg-brand-gradient flex items-center justify-center">
              <ChefHat className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="font-display text-lg font-semibold">Catering Bot</span>
          </div>
          <h2 className="font-display text-2xl font-semibold mb-1">ยินดีต้อนรับ</h2>
          <p className="text-sm text-muted-foreground mb-6">เข้าสู่ระบบเพื่อจัดการแชทบอท</p>

          <form onSubmit={signIn} className="space-y-4">
            <div className="space-y-1.5"><Label>อีเมล</Label><Input type="email" required value={email} onChange={e=>setEmail(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>รหัสผ่าน</Label><Input type="password" required value={pw} onChange={e=>setPw(e.target.value)} /></div>
            <Button type="submit" className="w-full" disabled={busy}>{busy && <Loader2 className="animate-spin"/>}เข้าสู่ระบบ</Button>
          </form>
          <p className="text-xs text-muted-foreground text-center mt-6">
            การเพิ่มผู้ใช้ใหม่ทำได้โดยแอดมินเท่านั้น
          </p>
        </Card>
      </div>
    </div>
  );
}
