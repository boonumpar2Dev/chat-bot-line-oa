import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Save, Plug, CheckCircle2, XCircle, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

type Cfg = { channel_access_token: string; channel_secret: string; channel_id: string };

export default function LineConnectionCard() {
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    supabase.from("line_config").select("channel_access_token, channel_secret, channel_id").eq("id", 1).maybeSingle()
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        setCfg(data ?? { channel_access_token: "", channel_secret: "", channel_id: "" });
        setLoading(false);
      });
  }, []);

  const upd = (k: keyof Cfg, v: string) => setCfg(p => p ? { ...p, [k]: v } : p);

  const save = async () => {
    if (!cfg) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("line_config").update({
      channel_access_token: cfg.channel_access_token.trim(),
      channel_secret: cfg.channel_secret.trim(),
      channel_id: cfg.channel_id.trim(),
      updated_by: user?.id,
    }).eq("id", 1);
    setSaving(false);
    if (error) toast.error(error.message); else toast.success("บันทึกค่า LINE แล้ว");
  };

  const test = async () => {
    setTesting(true); setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("line-test-connection", {
        body: { token: cfg?.channel_access_token },
      });
      if (error) throw error;
      if (data?.ok) {
        setTestResult({ ok: true, msg: `เชื่อมต่อสำเร็จ — Bot: ${data.bot?.displayName || data.bot?.basicId || "OK"}` });
      } else {
        setTestResult({ ok: false, msg: data?.error || "ทดสอบล้มเหลว" });
      }
    } catch (e: any) {
      setTestResult({ ok: false, msg: e.message });
    } finally { setTesting(false); }
  };

  if (loading || !cfg) return <Card className="p-6"><Loader2 className="animate-spin"/></Card>;

  return (
    <Card className="p-6 shadow-soft border-border/60">
      <div className="flex items-center gap-2 mb-1">
        <Plug className="text-primary w-5 h-5"/>
        <h2 className="font-display text-lg font-semibold">เชื่อมต่อ LINE Official Account</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-5">
        ค่าที่กรอกจะมีผลทันทีหลังบันทึก (ระบบ cache ~1 นาที) — แก้แล้วไม่ต้อง redeploy
      </p>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Channel Access Token (Long-lived)</Label>
          <div className="flex gap-2">
            <Input
              type={showToken ? "text" : "password"}
              value={cfg.channel_access_token}
              onChange={e => upd("channel_access_token", e.target.value)}
              placeholder="วาง token จาก LINE Developers Console"
              className="font-mono text-xs"
            />
            <Button type="button" variant="outline" size="icon" onClick={() => setShowToken(s => !s)}>
              {showToken ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Channel Secret</Label>
          <div className="flex gap-2">
            <Input
              type={showSecret ? "text" : "password"}
              value={cfg.channel_secret}
              onChange={e => upd("channel_secret", e.target.value)}
              placeholder="Channel secret สำหรับ verify webhook signature"
              className="font-mono text-xs"
            />
            <Button type="button" variant="outline" size="icon" onClick={() => setShowSecret(s => !s)}>
              {showSecret ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Channel ID / Bot Basic ID <span className="text-muted-foreground text-xs">(optional)</span></Label>
          <Input
            value={cfg.channel_id}
            onChange={e => upd("channel_id", e.target.value)}
            placeholder="@boonumpar หรือ 1234567890"
            className="font-mono text-xs"
          />
        </div>

        {testResult && (
          <div className={`flex items-start gap-2 text-sm p-3 rounded-md ${testResult.ok ? "bg-success/10 text-success-foreground" : "bg-destructive/10 text-destructive"}`}>
            {testResult.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0"/> : <XCircle className="w-4 h-4 mt-0.5 shrink-0"/>}
            <span>{testResult.msg}</span>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}
            บันทึก
          </Button>
          <Button variant="outline" onClick={test} disabled={testing || !cfg.channel_access_token}>
            {testing ? <Loader2 className="w-4 h-4 animate-spin"/> : <Plug className="w-4 h-4"/>}
            ทดสอบเชื่อมต่อ
          </Button>
        </div>

        <p className="text-xs text-muted-foreground border-t pt-3 mt-2">
          📍 Webhook URL ให้ตั้งใน LINE Developers Console:
          <br/>
          <code className="text-[11px] bg-muted px-1.5 py-0.5 rounded font-mono break-all">
            {import.meta.env.VITE_SUPABASE_URL}/functions/v1/line-webhook
          </code>
        </p>
      </div>
    </Card>
  );
}
