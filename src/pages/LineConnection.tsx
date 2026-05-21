import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Save, Plug, CheckCircle2, XCircle, Eye, EyeOff, Copy, ExternalLink, Info } from "lucide-react";
import { toast } from "sonner";

type Cfg = { channel_access_token: string; channel_secret: string; channel_id: string };

const WEBHOOK_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/line-webhook`;

export default function LineConnection() {
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
    if (error) toast.error(error.message); else toast.success("บันทึกค่า LINE แล้ว (มีผลภายใน 1 นาที)");
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

  const copyWebhook = () => {
    navigator.clipboard.writeText(WEBHOOK_URL);
    toast.success("คัดลอก Webhook URL แล้ว");
  };

  if (loading || !cfg) return <div className="h-full flex items-center justify-center"><Loader2 className="animate-spin text-primary"/></div>;

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-4xl mx-auto pb-24">
      <div>
        <h1 className="font-display text-3xl font-semibold flex items-center gap-2">
          <Plug className="text-primary"/> เชื่อมต่อ LINE
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          ตั้งค่าเชื่อมต่อ LINE Official Account — แก้ค่าได้ตลอด ไม่ต้อง redeploy
        </p>
      </div>

      {/* คำแนะนำ */}
      <Card className="p-6 shadow-soft border-primary/30 bg-primary/5">
        <div className="flex items-center gap-2 mb-3">
          <Info className="w-5 h-5 text-primary"/>
          <h2 className="font-display text-lg font-semibold">วิธีหาข้อมูลจาก LINE Developers Console</h2>
        </div>

        <ol className="space-y-3 text-sm list-decimal pl-5">
          <li>
            เข้า{" "}
            <a href="https://developers.line.biz/console/" target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-1">
              LINE Developers Console <ExternalLink className="w-3 h-3"/>
            </a>{" "}
            แล้ว login ด้วยบัญชีที่เป็นเจ้าของ Provider
          </li>
          <li>เลือก <b>Provider</b> ของคุณ → เลือก <b>Messaging API channel</b> ของ OA ที่ต้องการเชื่อม</li>
          <li>
            แท็บ <b>"Basic settings"</b>:
            <ul className="list-disc pl-5 mt-1 space-y-1 text-muted-foreground">
              <li><b>Channel secret</b> — copy มาวางในช่อง "Channel Secret" ด้านล่าง</li>
              <li><b>Channel ID</b> หรือ <b>Bot basic ID</b> (เริ่มด้วย @) — optional</li>
            </ul>
          </li>
          <li>
            แท็บ <b>"Messaging API"</b>:
            <ul className="list-disc pl-5 mt-1 space-y-1 text-muted-foreground">
              <li>หา <b>"Channel access token (long-lived)"</b> → กด <b>Issue</b> ถ้ายังไม่มี → copy มาวางในช่อง "Channel Access Token"</li>
              <li>ใน <b>"Webhook settings"</b> → กด <b>Edit</b> → วาง Webhook URL ด้านล่าง → กด <b>Verify</b> ให้ขึ้น Success</li>
              <li>เปิดสวิตช์ <b>"Use webhook"</b> ให้เป็นสีเขียว</li>
              <li>ที่หัวข้อ <b>"LINE Official Account features"</b> → กด <b>Edit</b> → ปิด <b>"Auto-reply messages"</b> และ <b>"Greeting messages"</b> (ไม่งั้นบอท default จะตอบทับ AI)</li>
            </ul>
          </li>
          <li>กลับมาที่หน้านี้ → วาง Token + Secret → กด <b>"ทดสอบเชื่อมต่อ"</b> → ถ้าเขียวแปลว่าใช้ได้ → กด <b>"บันทึก"</b></li>
        </ol>

        <div className="mt-5 pt-4 border-t border-primary/20">
          <Label className="text-xs">Webhook URL (ก็อปไปวางใน LINE Console)</Label>
          <div className="flex gap-2 mt-1.5">
            <Input readOnly value={WEBHOOK_URL} className="font-mono text-xs bg-background"/>
            <Button type="button" variant="outline" size="icon" onClick={copyWebhook}>
              <Copy className="w-4 h-4"/>
            </Button>
          </div>
        </div>
      </Card>

      {/* ฟอร์ม */}
      <Card className="p-6 shadow-soft border-border/60">
        <h2 className="font-display text-lg font-semibold mb-4">ข้อมูล Channel</h2>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Channel Access Token (Long-lived) <span className="text-destructive">*</span></Label>
            <div className="flex gap-2">
              <Input
                type={showToken ? "text" : "password"}
                value={cfg.channel_access_token}
                onChange={e => upd("channel_access_token", e.target.value)}
                placeholder="วาง token ยาวๆ ที่ Issue จาก Messaging API tab"
                className="font-mono text-xs"
              />
              <Button type="button" variant="outline" size="icon" onClick={() => setShowToken(s => !s)}>
                {showToken ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">ใช้สำหรับส่งข้อความออก (push/reply)</p>
          </div>

          <div className="space-y-1.5">
            <Label>Channel Secret <span className="text-destructive">*</span></Label>
            <div className="flex gap-2">
              <Input
                type={showSecret ? "text" : "password"}
                value={cfg.channel_secret}
                onChange={e => upd("channel_secret", e.target.value)}
                placeholder="ค่าจาก Basic settings tab"
                className="font-mono text-xs"
              />
              <Button type="button" variant="outline" size="icon" onClick={() => setShowSecret(s => !s)}>
                {showSecret ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">ใช้ verify ว่า webhook ที่เข้ามาเป็นของ LINE จริง (ถ้าเว้นว่าง = ไม่ verify)</p>
          </div>

          <div className="space-y-1.5">
            <Label>Channel ID / Bot Basic ID <span className="text-muted-foreground text-xs font-normal">(optional)</span></Label>
            <Input
              value={cfg.channel_id}
              onChange={e => upd("channel_id", e.target.value)}
              placeholder="@boonumpar หรือ 1234567890"
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">ไว้อ้างอิงเฉยๆ ปัจจุบันยังไม่ได้ใช้งาน</p>
          </div>

          {testResult && (
            <div className={`flex items-start gap-2 text-sm p-3 rounded-md ${testResult.ok ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
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
        </div>
      </Card>
    </div>
  );
}
