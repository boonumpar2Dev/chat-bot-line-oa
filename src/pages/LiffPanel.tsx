import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Loader2, Smartphone, Bot, BotOff, Calendar, X, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

declare global { interface Window { liff: any } }

const LIFF_ID = (import.meta as any).env?.VITE_LIFF_ID || "";

const STATUS_LABEL: Record<string, string> = {
  new: "ลูกค้าใหม่", inquiry: "สอบถาม", returning: "ลูกค้าเก่า", pending_quote: "รอเสนอราคา", pending_confirm: "รอคอนเฟิร์ม", confirmed: "คอนเฟิร์ม", confirmed_returning: "คอนเฟิร์ม (ลูกค้าเก่า)", postponed: "เลื่อนวันจัดงาน(มัดจำแล้ว)", cancelled: "ยกเลิก",
};

export default function LiffPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customer, setCustomer] = useState<any>(null);
  const [eventDate, setEventDate] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // Try LIFF SDK
        if (LIFF_ID && !window.liff) {
          await new Promise<void>((res, rej) => {
            const s = document.createElement("script");
            s.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
            s.onload = () => res(); s.onerror = () => rej(new Error("LIFF script load failed"));
            document.head.appendChild(s);
          });
        }
        let lineUserId: string | null = null;
        if (LIFF_ID && window.liff) {
          await window.liff.init({ liffId: LIFF_ID });
          if (!window.liff.isLoggedIn()) { window.liff.login(); return; }
          const profile = await window.liff.getProfile();
          lineUserId = profile.userId;
        } else {
          // Fallback: read from query param ?uid=...
          const params = new URLSearchParams(location.search);
          lineUserId = params.get("uid");
        }
        if (!lineUserId) throw new Error("ไม่พบ LINE User ID — กรุณาเปิดผ่าน LINE App");
        await callPanel("get_customer", lineUserId);
      } catch (e: any) {
        setError(e.message);
      } finally { setLoading(false); }
    })();
  }, []);

  const callPanel = async (action: string, lineUserId: string, extra: any = {}) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("liff-admin-panel", {
        body: { action, line_user_id: lineUserId, ...extra },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      setCustomer(data.customer);
      if (data.message) toast.success(data.message);
      return data;
    } catch (e: any) {
      toast.error(e.message);
    } finally { setBusy(false); }
  };

  const lineUserId = customer?.line_user_id;

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-warm-gradient"><Loader2 className="animate-spin text-primary"/></div>;
  if (error) return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-warm-gradient">
      <Card className="p-8 max-w-sm text-center"><X className="w-10 h-10 mx-auto text-destructive mb-3"/><p className="text-sm">{error}</p></Card>
    </div>
  );

  return (
    <div className="min-h-screen p-4 bg-warm-gradient">
      <Card className="max-w-md mx-auto p-6 shadow-elevated">
        <div className="flex items-center gap-3 mb-4">
          <Avatar className="w-14 h-14">
            {customer.picture_url && <AvatarImage src={customer.picture_url}/>}
            <AvatarFallback className="bg-brand-gradient text-primary-foreground">{(customer.display_name || "?")[0]}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h1 className="font-display text-lg font-semibold truncate">{customer.display_name}</h1>
            <div className="flex items-center gap-1 mt-1">
              <Badge variant="outline" className="text-xs">{STATUS_LABEL[customer.status] || customer.status}</Badge>
              {customer.ai_active
                ? <Badge className="text-xs bg-success text-success-foreground"><Bot className="w-3 h-3 mr-1"/>AI ON</Badge>
                : <Badge variant="secondary" className="text-xs"><BotOff className="w-3 h-3 mr-1"/>AI OFF</Badge>}
            </div>
          </div>
        </div>

        <div className="space-y-4 mt-6">
          {/* Start job */}
          <div className="space-y-2">
            <Label className="flex items-center gap-1"><Calendar className="w-4 h-4"/>วันจัดงาน</Label>
            <Input type="date" value={eventDate || customer.event_date || ""} onChange={e => setEventDate(e.target.value)}/>
            <Button className="w-full" disabled={busy || !(eventDate || customer.event_date)}
              onClick={() => callPanel("start_job", lineUserId, { event_date: eventDate || customer.event_date })}>
              เริ่มงาน (ปิด AI อัตโนมัติ)
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" disabled={busy} onClick={() => callPanel("cancel_job", lineUserId)}>
              <X className="w-4 h-4 mr-1"/>ยกเลิกงาน
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => callPanel(customer.ai_active ? "mute" : "unmute", lineUserId)}>
              {customer.ai_active ? <><BotOff className="w-4 h-4 mr-1"/>ปิด AI</> : <><Bot className="w-4 h-4 mr-1"/>เปิด AI</>}
            </Button>
          </div>

          <Button variant="secondary" className="w-full" disabled={busy} onClick={() => callPanel("resume_bot", lineUserId)}>
            <RefreshCw className="w-4 h-4 mr-1"/>ปลุกบอททันที
          </Button>
        </div>

        <p className="text-[10px] text-center text-muted-foreground mt-6 flex items-center justify-center gap-1">
          <Smartphone className="w-3 h-3"/>LIFF Admin Panel • {customer.line_user_id?.slice(0, 8)}…
        </p>
      </Card>
    </div>
  );
}
