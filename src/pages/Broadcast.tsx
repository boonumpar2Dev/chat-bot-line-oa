import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Megaphone, Plus, Trash2, Image as ImageIcon, Video, Type, FileJson, ChevronUp, ChevronDown, Send, Clock, Loader2, Eye, RefreshCw, X, Search, Smartphone, FlaskConical, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";


type BubbleType = "text" | "image" | "video" | "flex";
type Bubble =
  | { type: "text"; text: string }
  | { type: "image"; url: string; preview_url?: string }
  | { type: "video"; url: string; thumb_url?: string }
  | { type: "flex"; alt_text: string; contents: any };

type Campaign = {
  id: string;
  name: string;
  status: string;
  target_tags: string[];
  target_statuses: string[];
  target_match_mode: "any" | "all";
  messages: Bubble[];
  scheduled_at: string | null;
  sent_at: string | null;
  total_recipients: number;
  success_count: number;
  failed_count: number;
  created_at: string;
};

const STATUS_OPTIONS = [
  { v: "new", label: "ลูกค้าใหม่" },
  { v: "inquiry", label: "ลูกค้ากลุ่มคาดหวัง" },
  { v: "pending_quote", label: "รอเสนอราคา" },
  { v: "pending_confirm", label: "รอคอนเฟิร์ม" },
  { v: "confirmed", label: "คอนเฟิร์ม" },
  { v: "returning", label: "ลูกค้าเก่า" },
  { v: "cancelled", label: "ยกเลิก" },
];

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  scheduled: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  sending: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  sent: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  canceled: "bg-gray-100 text-gray-700",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "ร่าง", scheduled: "ตั้งเวลา", sending: "กำลังส่ง", sent: "ส่งสำเร็จ", failed: "ล้มเหลว", canceled: "ยกเลิก",
};

function formatDateTime(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
}

function toLocalInput(d: Date) {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function uploadMedia(file: File, kind: "image" | "video"): Promise<string | null> {
  const ext = file.name.split(".").pop() || "bin";
  const path = `broadcast/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from("line-media").upload(path, file, { upsert: false });
  if (error) { toast.error("อัปโหลดไม่สำเร็จ: " + error.message); return null; }
  return supabase.storage.from("line-media").getPublicUrl(path).data.publicUrl;
}

export default function Broadcast() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [composerOpen, setComposerOpen] = useState(false);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const loadCampaigns = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("broadcast_campaigns")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    setCampaigns((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { loadCampaigns(); }, []);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Megaphone className="w-6 h-6 text-primary" />
            Broadcast
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            ส่งข้อความถึงลูกค้าหลายคนพร้อมกัน — รองรับข้อความ รูป วิดีโอ Flex และตั้งเวลาส่งได้
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={loadCampaigns} title="รีโหลด">
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button onClick={() => { setEditing(null); setComposerOpen(true); }}>
            <Plus className="w-4 h-4 mr-1" /> สร้างแคมเปญใหม่
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">ประวัติแคมเปญ</CardTitle>
          <CardDescription>{campaigns.length} แคมเปญ</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 text-center text-muted-foreground"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div>
          ) : campaigns.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm">
              ยังไม่มีแคมเปญ — กด "สร้างแคมเปญใหม่" เพื่อเริ่มต้น
            </div>
          ) : (
            <div className="overflow-x-auto -mx-6 px-6">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="text-left py-2 pr-3 font-medium">ชื่อ</th>
                    <th className="text-left py-2 px-3 font-medium">สถานะ</th>
                    <th className="text-right py-2 px-3 font-medium">ผู้รับ</th>
                    <th className="text-right py-2 px-3 font-medium">สำเร็จ/ล้มเหลว</th>
                    <th className="text-left py-2 px-3 font-medium">เวลา</th>
                    <th className="text-right py-2 pl-3 font-medium">การกระทำ</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={c.id} className="border-b hover:bg-accent/30 transition">
                      <td className="py-2.5 pr-3 font-medium">{c.name || "(ไม่มีชื่อ)"}</td>
                      <td className="py-2.5 px-3">
                        <span className={cn("inline-block px-2 py-0.5 rounded-full text-xs font-medium", STATUS_COLOR[c.status] || "bg-muted")}>
                          {STATUS_LABEL[c.status] || c.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right tabular-nums">{c.total_recipients}</td>
                      <td className="py-2.5 px-3 text-right tabular-nums">
                        <span className="text-emerald-600">{c.success_count}</span>
                        {c.failed_count > 0 && <span className="text-red-600"> / {c.failed_count}</span>}
                      </td>
                      <td className="py-2.5 px-3 text-xs text-muted-foreground">
                        {c.status === "scheduled" ? `📅 ${formatDateTime(c.scheduled_at)}` :
                         c.status === "sent" || c.status === "failed" ? formatDateTime(c.sent_at) :
                         formatDateTime(c.created_at)}
                      </td>
                      <td className="py-2.5 pl-3 text-right">
                        <Button size="sm" variant="ghost" onClick={() => setDetailId(c.id)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        {(c.status === "draft" || c.status === "scheduled" || c.status === "failed") && (
                          <Button size="sm" variant="ghost" onClick={() => { setEditing(c); setComposerOpen(true); }}>
                            แก้ไข
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <ComposerDialog
        open={composerOpen}
        onOpenChange={setComposerOpen}
        editing={editing}
        onSaved={() => { setComposerOpen(false); setEditing(null); loadCampaigns(); }}
      />

      <CampaignDetail
        id={detailId}
        onClose={() => setDetailId(null)}
        onReload={loadCampaigns}
      />
    </div>
  );
}

// ============================================================
// Composer
// ============================================================
function ComposerDialog({
  open, onOpenChange, editing, onSaved,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; editing: Campaign | null; onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [matchMode, setMatchMode] = useState<"any" | "all">("any");
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState<string>(() => {
    const d = new Date(Date.now() + 30 * 60_000);
    return toLocalInput(d);
  });
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    supabase.from("tags").select("name").order("sort_order").then(({ data }) => {
      setAllTags((data || []).map((t: any) => t.name));
    });
    if (editing) {
      setName(editing.name || "");
      setBubbles((editing.messages as any) || []);
      setTags(editing.target_tags || []);
      setStatuses(editing.target_statuses || []);
      setMatchMode((editing.target_match_mode as any) || "any");
      if (editing.scheduled_at) {
        setScheduleMode("later");
        setScheduledAt(toLocalInput(new Date(editing.scheduled_at)));
      } else {
        setScheduleMode("now");
      }
    } else {
      setName(""); setBubbles([]); setTags([]); setStatuses([]); setMatchMode("any"); setScheduleMode("now");
      setScheduledAt(toLocalInput(new Date(Date.now() + 30 * 60_000)));
    }
    setRecipientCount(null);
  }, [open, editing]);

  // Recipient preview
  useEffect(() => {
    if (!open) return;
    if (tags.length === 0 && statuses.length === 0) { setRecipientCount(0); return; }
    setCountLoading(true);
    const t = setTimeout(async () => {
      let q = supabase.from("customers").select("id", { count: "exact", head: true }).not("line_user_id", "is", null);
      if (matchMode === "all") {
        if (tags.length) q = q.contains("tags", tags);
        if (statuses.length) q = q.in("status", statuses as any);
      } else {
        if (tags.length && statuses.length) {
          const tagList = tags.map((t) => `"${t.replace(/"/g, '\\"')}"`).join(",");
          const statusList = statuses.map((s) => `"${s}"`).join(",");
          q = q.or(`tags.ov.{${tagList}},status.in.(${statusList})`);
        } else if (tags.length) {
          q = q.overlaps("tags", tags);
        } else if (statuses.length) {
          q = q.in("status", statuses as any);
        }
      }
      const { count } = await q;
      setRecipientCount(count || 0);
      setCountLoading(false);
    }, 400);
    return () => clearTimeout(t);
  }, [tags, statuses, matchMode, open]);

  const addBubble = (type: BubbleType) => {
    if (bubbles.length >= 5) { toast.error("ส่งได้สูงสุด 5 บับเบิลต่อแคมเปญ"); return; }
    if (type === "text") setBubbles([...bubbles, { type: "text", text: "" }]);
    if (type === "image") setBubbles([...bubbles, { type: "image", url: "" }]);
    if (type === "video") setBubbles([...bubbles, { type: "video", url: "" }]);
    if (type === "flex") setBubbles([...bubbles, { type: "flex", alt_text: "", contents: {} }]);
  };

  const updateBubble = (i: number, patch: Partial<Bubble>) => {
    setBubbles(bubbles.map((b, idx) => idx === i ? ({ ...b, ...patch } as Bubble) : b));
  };
  const removeBubble = (i: number) => setBubbles(bubbles.filter((_, idx) => idx !== i));
  const moveBubble = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= bubbles.length) return;
    const arr = [...bubbles];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setBubbles(arr);
  };

  const save = async (action: "draft" | "send") => {
    if (!name.trim()) { toast.error("กรุณาใส่ชื่อแคมเปญ"); return; }
    if (action === "send") {
      if (bubbles.length === 0) { toast.error("ต้องมีอย่างน้อย 1 บับเบิล"); return; }
      if (tags.length === 0 && statuses.length === 0) { toast.error("ต้องเลือก tag หรือ status อย่างน้อย 1"); return; }
      // Validate bubbles
      for (const b of bubbles) {
        if (b.type === "text" && !b.text.trim()) { toast.error("บับเบิลข้อความว่าง"); return; }
        if (b.type === "image" && !b.url) { toast.error("ต้องอัปโหลดรูป"); return; }
        if (b.type === "video" && !b.url) { toast.error("ต้องอัปโหลดวิดีโอ"); return; }
        if (b.type === "flex") {
          if (!b.alt_text.trim()) { toast.error("Flex ต้องมี alt text"); return; }
          if (!b.contents || typeof b.contents !== "object") { toast.error("Flex contents ไม่ถูกต้อง"); return; }
        }
      }
    }

    setSaving(true);
    try {
      const status =
        action === "draft" ? "draft" :
        scheduleMode === "later" ? "scheduled" : "sending";

      const payload: any = {
        name: name.trim(),
        status,
        target_tags: tags,
        target_statuses: statuses,
        target_match_mode: matchMode,
        messages: bubbles,
        scheduled_at: action === "send" && scheduleMode === "later" ? new Date(scheduledAt).toISOString() : null,
      };

      let campaignId = editing?.id;
      if (editing) {
        const { error } = await supabase.from("broadcast_campaigns").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        const { data, error } = await supabase.from("broadcast_campaigns").insert({
          ...payload, created_by: user?.id,
        }).select("id").single();
        if (error) throw error;
        campaignId = data.id;
      }

      if (action === "send" && scheduleMode === "now" && campaignId) {
        // Fire broadcast-send
        toast.success("กำลังส่ง...");
        supabase.functions.invoke("broadcast-send", { body: { campaign_id: campaignId } })
          .then(({ data, error }) => {
            if (error) toast.error("ส่งล้มเหลว: " + error.message);
            else toast.success(`ส่งเสร็จ — สำเร็จ ${data?.success || 0} / ล้มเหลว ${data?.failed || 0}`);
            onSaved();
          });
      } else {
        toast.success(
          action === "draft" ? "บันทึก draft แล้ว" :
          scheduleMode === "later" ? `ตั้งเวลาส่ง ${formatDateTime(payload.scheduled_at)} แล้ว` :
          "บันทึกแล้ว"
        );
      }
      onSaved();
    } catch (e: any) {
      toast.error("บันทึกไม่สำเร็จ: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "แก้ไขแคมเปญ" : "สร้างแคมเปญใหม่"}</DialogTitle>
          <DialogDescription>เลือกกลุ่มลูกค้า เนื้อหา และตั้งเวลาส่งได้</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Name */}
          <div className="space-y-1.5">
            <Label>ชื่อแคมเปญ <span className="text-red-500">*</span></Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="เช่น โปรเดือนมิถุนายน" />
          </div>

          {/* Target */}
          <div className="space-y-3 p-4 rounded-lg border bg-card/50">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">กลุ่มผู้รับ</Label>
              <div className="text-xs">
                {countLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin inline" />
                ) : recipientCount !== null ? (
                  <span className="font-medium">
                    พบ <span className="text-primary">{recipientCount}</span> คน
                  </span>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Tags ({tags.length} เลือกแล้ว · {allTags.length} ทั้งหมด)</Label>
              <TagPicker allTags={allTags} selected={tags} onChange={setTags} />
            </div>


            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">สถานะ</Label>
              <div className="flex flex-wrap gap-2">
                {STATUS_OPTIONS.map((s) => (
                  <label key={s.v} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <Checkbox
                      checked={statuses.includes(s.v)}
                      onCheckedChange={(c) => setStatuses(c ? [...statuses, s.v] : statuses.filter(x => x !== s.v))}
                    />
                    {s.label}
                  </label>
                ))}
              </div>
            </div>

            {tags.length > 0 && statuses.length > 0 && (
              <div className="pt-2 border-t">
                <Label className="text-xs text-muted-foreground mb-1.5 block">โหมดจับคู่</Label>
                <RadioGroup value={matchMode} onValueChange={(v) => setMatchMode(v as any)} className="flex gap-4">
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <RadioGroupItem value="any" /> มี tag หรือ status อย่างใดอย่างหนึ่ง
                  </label>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <RadioGroupItem value="all" /> ต้องมีทั้ง tag และ status
                  </label>
                </RadioGroup>
              </div>
            )}
          </div>

          {/* Messages */}
          <div className="space-y-3 p-4 rounded-lg border bg-card/50">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">เนื้อหาข้อความ ({bubbles.length}/5)</Label>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={() => addBubble("text")} disabled={bubbles.length >= 5}>
                  <Type className="w-3.5 h-3.5 mr-1" /> ข้อความ
                </Button>
                <Button size="sm" variant="outline" onClick={() => addBubble("image")} disabled={bubbles.length >= 5}>
                  <ImageIcon className="w-3.5 h-3.5 mr-1" /> รูป
                </Button>
                <Button size="sm" variant="outline" onClick={() => addBubble("video")} disabled={bubbles.length >= 5}>
                  <Video className="w-3.5 h-3.5 mr-1" /> วิดีโอ
                </Button>
                <Button size="sm" variant="outline" onClick={() => addBubble("flex")} disabled={bubbles.length >= 5}>
                  <FileJson className="w-3.5 h-3.5 mr-1" /> Flex
                </Button>
              </div>
            </div>

            {bubbles.length === 0 && (
              <div className="text-center py-6 text-xs text-muted-foreground">
                ยังไม่มีบับเบิล — เพิ่มจากปุ่มด้านบน
              </div>
            )}

            <div className="space-y-2">
              {bubbles.map((b, i) => (
                <BubbleEditor
                  key={i}
                  bubble={b}
                  index={i}
                  total={bubbles.length}
                  onUpdate={(patch) => updateBubble(i, patch)}
                  onRemove={() => removeBubble(i)}
                  onMove={(dir) => moveBubble(i, dir)}
                />
              ))}
            </div>
          </div>

          {/* Schedule */}
          <div className="space-y-3 p-4 rounded-lg border bg-card/50">
            <Label className="text-sm font-semibold">เวลาส่ง</Label>
            <RadioGroup value={scheduleMode} onValueChange={(v) => setScheduleMode(v as any)} className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="now" /> ส่งทันที
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <RadioGroupItem value="later" /> ตั้งเวลาส่ง
              </label>
            </RadioGroup>
            {scheduleMode === "later" && (
              <Input
                type="datetime-local"
                value={scheduledAt}
                onChange={(e) => setScheduledAt(e.target.value)}
                min={toLocalInput(new Date())}
              />
            )}
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>ยกเลิก</Button>
          <Button variant="outline" onClick={() => save("draft")} disabled={saving}>
            บันทึก draft
          </Button>
          <Button onClick={() => save("send")} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> :
              scheduleMode === "later" ? <Clock className="w-4 h-4 mr-1" /> :
              <Send className="w-4 h-4 mr-1" />}
            {scheduleMode === "later" ? "ตั้งเวลาส่ง" : `ส่งทันที${recipientCount !== null ? ` (${recipientCount})` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Bubble editor
// ============================================================
function BubbleEditor({
  bubble, index, total, onUpdate, onRemove, onMove,
}: {
  bubble: Bubble; index: number; total: number;
  onUpdate: (patch: Partial<Bubble>) => void; onRemove: () => void; onMove: (dir: -1 | 1) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file: File, kind: "image" | "video") => {
    if (kind === "image" && file.size > 10 * 1024 * 1024) {
      toast.error("รูปต้องไม่เกิน 10MB (ข้อจำกัด LINE)"); return;
    }
    if (kind === "video" && file.size > 200 * 1024 * 1024) {
      toast.error("วิดีโอต้องไม่เกิน 200MB (ข้อจำกัด LINE)"); return;
    }
    setUploading(true);
    const url = await uploadMedia(file, kind);
    setUploading(false);
    if (!url) return;
    if (kind === "image") onUpdate({ url, preview_url: url } as any);
    else onUpdate({ url, thumb_url: url } as any);
  };

  return (
    <div className="p-3 rounded-lg border bg-background space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <span>#{index + 1}</span>
          <Badge variant="outline" className="text-[10px]">{bubble.type}</Badge>
        </div>
        <div className="flex items-center gap-0.5">
          <Button size="icon" variant="ghost" className="h-7 w-7" disabled={index === 0} onClick={() => onMove(-1)}>
            <ChevronUp className="w-3.5 h-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" disabled={index === total - 1} onClick={() => onMove(1)}>
            <ChevronDown className="w-3.5 h-3.5" />
          </Button>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={onRemove}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {bubble.type === "text" && (
        <Textarea
          value={bubble.text}
          onChange={(e) => onUpdate({ text: e.target.value } as any)}
          placeholder="ข้อความที่จะส่ง..."
          rows={3}
          maxLength={5000}
        />
      )}

      {bubble.type === "image" && (
        <div className="space-y-2">
          {bubble.url ? (
            <div className="relative inline-block">
              <img src={bubble.url} className="max-h-32 rounded border" />
              <Button size="icon" variant="destructive" className="absolute top-1 right-1 h-6 w-6"
                onClick={() => onUpdate({ url: "", preview_url: "" } as any)}>
                <X className="w-3 h-3" />
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ImageIcon className="w-4 h-4 mr-1" />}
              อัปโหลดรูป (≤10MB)
            </Button>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden"
            onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], "image")} />
        </div>
      )}

      {bubble.type === "video" && (
        <div className="space-y-2">
          {bubble.url ? (
            <div className="relative inline-block">
              <video src={bubble.url} className="max-h-32 rounded border" controls />
              <Button size="icon" variant="destructive" className="absolute top-1 right-1 h-6 w-6"
                onClick={() => onUpdate({ url: "", thumb_url: "" } as any)}>
                <X className="w-3 h-3" />
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Video className="w-4 h-4 mr-1" />}
              อัปโหลดวิดีโอ (≤200MB)
            </Button>
          )}
          <input ref={fileRef} type="file" accept="video/*" className="hidden"
            onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], "video")} />
        </div>
      )}

      {bubble.type === "flex" && (
        <div className="space-y-2">
          <Input
            value={bubble.alt_text}
            onChange={(e) => onUpdate({ alt_text: e.target.value } as any)}
            placeholder="Alt text (แสดงในแจ้งเตือน)"
          />
          <Textarea
            value={JSON.stringify(bubble.contents || {}, null, 2)}
            onChange={(e) => {
              try {
                const v = JSON.parse(e.target.value || "{}");
                onUpdate({ contents: v } as any);
              } catch {
                // keep raw — user typing
                onUpdate({ contents: e.target.value as any } as any);
              }
            }}
            placeholder='Flex JSON (เช่น {"type":"bubble",...})'
            rows={6}
            className="font-mono text-xs"
          />
          {typeof bubble.contents === "string" && (
            <p className="text-xs text-red-500">JSON ไม่ถูกต้อง</p>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Campaign Detail
// ============================================================
function CampaignDetail({
  id, onClose, onReload,
}: { id: string | null; onClose: () => void; onReload: () => void }) {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [recipients, setRecipients] = useState<any[]>([]);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: c } = await supabase.from("broadcast_campaigns").select("*").eq("id", id).maybeSingle();
      setCampaign(c as any);
      const { data: r } = await supabase
        .from("broadcast_recipients")
        .select("*, customers(nickname, phone)")
        .eq("campaign_id", id)
        .order("status", { ascending: true })
        .limit(500);
      setRecipients(r || []);
    })();
  }, [id]);

  const cancelScheduled = async () => {
    if (!campaign) return;
    if (!confirm("ยกเลิกการส่งแคมเปญนี้?")) return;
    await supabase.from("broadcast_campaigns").update({ status: "canceled" }).eq("id", campaign.id);
    toast.success("ยกเลิกแล้ว");
    onClose(); onReload();
  };

  const resend = async () => {
    if (!campaign) return;
    if (!confirm("ส่งซ้ำ? จะส่งหาทุกคนตามเงื่อนไขเดิม")) return;
    await supabase.from("broadcast_campaigns").update({ status: "scheduled" }).eq("id", campaign.id);
    toast.success("กำลังส่งซ้ำ...");
    supabase.functions.invoke("broadcast-send", { body: { campaign_id: campaign.id } })
      .then(({ data, error }) => {
        if (error) toast.error(error.message);
        else toast.success(`ส่งเสร็จ — สำเร็จ ${data?.success || 0} / ล้มเหลว ${data?.failed || 0}`);
        onClose(); onReload();
      });
  };

  return (
    <Dialog open={!!id} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        {campaign && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {campaign.name}
                <span className={cn("px-2 py-0.5 rounded-full text-xs", STATUS_COLOR[campaign.status])}>
                  {STATUS_LABEL[campaign.status] || campaign.status}
                </span>
              </DialogTitle>
              <DialogDescription>
                สร้าง {formatDateTime(campaign.created_at)} {campaign.sent_at && `· ส่ง ${formatDateTime(campaign.sent_at)}`}
              </DialogDescription>
            </DialogHeader>

            <Tabs defaultValue="content">
              <TabsList>
                <TabsTrigger value="content">เนื้อหา</TabsTrigger>
                <TabsTrigger value="recipients">ผู้รับ ({recipients.length})</TabsTrigger>
              </TabsList>

              <TabsContent value="content" className="space-y-3 pt-2">
                <div className="text-xs text-muted-foreground">
                  เงื่อนไข: {campaign.target_tags.length > 0 && <Badge variant="outline" className="mr-1">tags: {campaign.target_tags.join(", ")}</Badge>}
                  {campaign.target_statuses.length > 0 && <Badge variant="outline">status: {campaign.target_statuses.map(s => STATUS_OPTIONS.find(x=>x.v===s)?.label || s).join(", ")}</Badge>}
                </div>
                <div className="space-y-2">
                  {(campaign.messages || []).map((b, i) => (
                    <div key={i} className="p-3 rounded-lg border bg-muted/30">
                      <Badge variant="outline" className="text-[10px] mb-1.5">{b.type}</Badge>
                      {b.type === "text" && <p className="text-sm whitespace-pre-wrap">{b.text}</p>}
                      {b.type === "image" && <img src={b.url} className="max-h-40 rounded" />}
                      {b.type === "video" && <video src={b.url} className="max-h-40 rounded" controls />}
                      {b.type === "flex" && (
                        <>
                          <p className="text-xs text-muted-foreground mb-1">Alt: {b.alt_text}</p>
                          <pre className="text-[10px] bg-background rounded p-2 overflow-x-auto">{JSON.stringify(b.contents, null, 2)}</pre>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="recipients" className="pt-2">
                <div className="flex gap-3 text-xs mb-2">
                  <span>ทั้งหมด: <b>{campaign.total_recipients}</b></span>
                  <span className="text-emerald-600">สำเร็จ: <b>{campaign.success_count}</b></span>
                  <span className="text-red-600">ล้มเหลว: <b>{campaign.failed_count}</b></span>
                </div>
                <div className="max-h-80 overflow-y-auto border rounded">
                  <table className="w-full text-xs">
                    <thead className="bg-muted sticky top-0">
                      <tr>
                        <th className="text-left p-2">ลูกค้า</th>
                        <th className="text-left p-2">สถานะ</th>
                        <th className="text-left p-2">หมายเหตุ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recipients.map((r) => (
                        <tr key={r.id} className="border-t">
                          <td className="p-2">{r.customers?.nickname || r.line_user_id.slice(0, 12)}</td>
                          <td className="p-2">
                            <span className={cn(
                              "px-1.5 py-0.5 rounded text-[10px]",
                              r.status === "sent" ? "bg-emerald-100 text-emerald-700" :
                              r.status === "failed" ? "bg-red-100 text-red-700" :
                              "bg-muted"
                            )}>{r.status}</span>
                          </td>
                          <td className="p-2 text-muted-foreground truncate max-w-xs">{r.error_message || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter className="gap-2">
              {campaign.status === "scheduled" && (
                <Button variant="outline" onClick={cancelScheduled}>ยกเลิกการส่ง</Button>
              )}
              {(campaign.status === "sent" || campaign.status === "failed") && (
                <Button variant="outline" onClick={resend}>
                  <RefreshCw className="w-4 h-4 mr-1" /> ส่งซ้ำ
                </Button>
              )}
              <Button onClick={onClose}>ปิด</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
