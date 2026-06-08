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
import { Megaphone, Plus, Trash2, Image as ImageIcon, Video, Type, FileJson, ChevronUp, ChevronDown, Send, Clock, Loader2, Eye, RefreshCw, X, Search, Smartphone, FlaskConical, Check, Copy, Sparkles, Film, LayoutGrid, Link as LinkIcon, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";


type BubbleType = "text" | "image" | "video" | "flex" | "rich_message" | "rich_video" | "card_message";
export type ActionItem = { label: string; type: "uri" | "message"; uri?: string; text?: string };
export type CardItem = { image_url: string; title: string; description: string; actions: ActionItem[] };
type Bubble =
  | { type: "text"; text: string }
  | { type: "image"; url: string; preview_url?: string }
  | { type: "video"; url: string; thumb_url?: string }
  | { type: "flex"; alt_text: string; contents: any }
  | { type: "rich_message"; image_url: string; alt_text: string; actions: ActionItem[] }
  | { type: "rich_video"; video_url: string; preview_url: string; alt_text: string; actions: ActionItem[] }
  | { type: "card_message"; alt_text: string; cards: CardItem[] };

type Campaign = {
  id: string;
  name: string;
  status: string;
  target_tags: string[];
  target_statuses: string[];
  exclude_tags?: string[];
  exclude_statuses?: string[];
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
  { v: "confirmed_returning", label: "คอนเฟิร์ม (ลูกค้าเก่า)" },
  { v: "returning", label: "ลูกค้าเก่า" },
  { v: "postponed", label: "เลื่อนวันจัดงาน(มัดจำแล้ว)" },
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
  const [duplicating, setDuplicating] = useState<Campaign | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("active");

  const loadCampaigns = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("broadcast_campaigns")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    setCampaigns((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { loadCampaigns(); }, []);

  const groups = useMemo(() => ({
    active: campaigns.filter((c) => c.status === "sending" || c.status === "scheduled"),
    sent: campaigns.filter((c) => c.status === "sent"),
    failed: campaigns.filter((c) => c.status === "failed"),
    draft: campaigns.filter((c) => c.status === "draft" || c.status === "canceled"),
  }), [campaigns]);

  const handleDuplicate = (c: Campaign) => {
    setEditing(null);
    setDuplicating(c);
    setComposerOpen(true);
  };

  const renderRow = (c: Campaign) => (
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
      <td className="py-2.5 px-3 text-xs text-muted-foreground whitespace-nowrap">
        {c.status === "scheduled" ? `📅 ${formatDateTime(c.scheduled_at)}` :
         c.status === "sent" || c.status === "failed" ? formatDateTime(c.sent_at) :
         formatDateTime(c.created_at)}
      </td>
      <td className="py-2.5 pl-3 text-right whitespace-nowrap">
        <Button size="sm" variant="ghost" onClick={() => setDetailId(c.id)} title="ดูรายละเอียด">
          <Eye className="w-4 h-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => handleDuplicate(c)} title="ทำสำเนา">
          <Copy className="w-4 h-4" />
        </Button>
        {(c.status === "draft" || c.status === "scheduled" || c.status === "failed") && (
          <Button size="sm" variant="ghost" onClick={() => { setDuplicating(null); setEditing(c); setComposerOpen(true); }}>
            แก้ไข
          </Button>
        )}
      </td>
    </tr>
  );

  const renderTable = (rows: Campaign[], emptyText: string) => {
    if (rows.length === 0) {
      return <div className="py-10 text-center text-muted-foreground text-sm">{emptyText}</div>;
    }
    return (
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
          <tbody>{rows.map(renderRow)}</tbody>
        </table>
      </div>
    );
  };

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
          <Button onClick={() => { setEditing(null); setDuplicating(null); setComposerOpen(true); }}>
            <Plus className="w-4 h-4 mr-1" /> สร้างแคมเปญใหม่
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">ประวัติแคมเปญ</CardTitle>
          <CardDescription>ทั้งหมด {campaigns.length} แคมเปญ</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-10 text-center text-muted-foreground"><Loader2 className="w-5 h-5 mx-auto animate-spin" /></div>
          ) : campaigns.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm">
              ยังไม่มีแคมเปญ — กด "สร้างแคมเปญใหม่" เพื่อเริ่มต้น
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-4 h-auto gap-1">
                <TabsTrigger value="active" className="flex-col sm:flex-row gap-0.5 sm:gap-1.5 py-1.5 px-1 text-xs sm:text-sm">
                  <span>📤 กำลังส่ง</span> <Badge variant="secondary" className="h-4 px-1 text-[10px] sm:h-5 sm:px-1.5 sm:text-xs">{groups.active.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="sent" className="flex-col sm:flex-row gap-0.5 sm:gap-1.5 py-1.5 px-1 text-xs sm:text-sm">
                  <span>✅ สำเร็จ</span> <Badge variant="secondary" className="h-4 px-1 text-[10px] sm:h-5 sm:px-1.5 sm:text-xs">{groups.sent.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="failed" className="flex-col sm:flex-row gap-0.5 sm:gap-1.5 py-1.5 px-1 text-xs sm:text-sm">
                  <span>❌ ล้มเหลว</span> <Badge variant="secondary" className="h-4 px-1 text-[10px] sm:h-5 sm:px-1.5 sm:text-xs">{groups.failed.length}</Badge>
                </TabsTrigger>
                <TabsTrigger value="draft" className="flex-col sm:flex-row gap-0.5 sm:gap-1.5 py-1.5 px-1 text-xs sm:text-sm">
                  <span>📝 ร่าง</span> <Badge variant="secondary" className="h-4 px-1 text-[10px] sm:h-5 sm:px-1.5 sm:text-xs">{groups.draft.length}</Badge>
                </TabsTrigger>
              </TabsList>

              <TabsContent value="active">{renderTable(groups.active, "ไม่มีแคมเปญที่กำลังส่งหรือตั้งเวลาไว้")}</TabsContent>
              <TabsContent value="sent">{renderTable(groups.sent, "ยังไม่มีแคมเปญที่ส่งสำเร็จ")}</TabsContent>
              <TabsContent value="failed">{renderTable(groups.failed, "ไม่มีแคมเปญที่ล้มเหลว")}</TabsContent>
              <TabsContent value="draft">{renderTable(groups.draft, "ไม่มีฉบับร่าง")}</TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      <ComposerDialog
        open={composerOpen}
        onOpenChange={setComposerOpen}
        editing={editing}
        duplicating={duplicating}
        onSaved={() => { setComposerOpen(false); setEditing(null); setDuplicating(null); loadCampaigns(); }}
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
  open, onOpenChange, editing, duplicating, onSaved,
}: {
  open: boolean; onOpenChange: (v: boolean) => void; editing: Campaign | null; duplicating?: Campaign | null; onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [excludeTags, setExcludeTags] = useState<string[]>([]);
  const [excludeStatuses, setExcludeStatuses] = useState<string[]>([]);
  const [matchMode, setMatchMode] = useState<"any" | "all">("any");
  const [scheduleMode, setScheduleMode] = useState<"now" | "later">("now");
  const [scheduledAt, setScheduledAt] = useState<string>(() => {
    const d = new Date(Date.now() + 30 * 60_000);
    return toLocalInput(d);
  });
  const [rawCount, setRawCount] = useState<number | null>(null);
  const [excludedCount, setExcludedCount] = useState<number>(0);
  const [recipientCount, setRecipientCount] = useState<number | null>(null);
  const [countLoading, setCountLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    supabase.from("tags").select("name").order("sort_order").then(({ data }) => {
      setAllTags((data || []).map((t: any) => t.name));
    });
    const source = editing || duplicating;
    if (source) {
      setName(duplicating ? `${source.name} (สำเนา)` : (source.name || ""));
      setBubbles((source.messages as any) || []);
      setTags(source.target_tags || []);
      setStatuses(source.target_statuses || []);
      setExcludeTags((source as any).exclude_tags || []);
      setExcludeStatuses((source as any).exclude_statuses || []);
      setMatchMode((source.target_match_mode as any) || "any");
      if (editing && editing.scheduled_at) {
        setScheduleMode("later");
        setScheduledAt(toLocalInput(new Date(editing.scheduled_at)));
      } else {
        setScheduleMode("now");
        setScheduledAt(toLocalInput(new Date(Date.now() + 30 * 60_000)));
      }
    } else {
      setName(""); setBubbles([]); setTags([]); setStatuses([]);
      setExcludeTags([]); setExcludeStatuses([]);
      setMatchMode("any"); setScheduleMode("now");
      setScheduledAt(toLocalInput(new Date(Date.now() + 30 * 60_000)));
    }
    setRecipientCount(null);
    setRawCount(null);
    setExcludedCount(0);
  }, [open, editing, duplicating]);

  // Recipient preview (with exclude filter)
  useEffect(() => {
    if (!open) return;
    if (tags.length === 0 && statuses.length === 0) {
      setRecipientCount(0); setRawCount(0); setExcludedCount(0); return;
    }
    setCountLoading(true);
    const t = setTimeout(async () => {
      // Fetch tags + status of matched customers so we can apply exclude in JS
      let q = supabase.from("customers").select("id, tags, status").not("line_user_id", "is", null);
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
      const { data } = await q.limit(5000);
      const rows = (data as any[]) || [];
      const exTagSet = new Set(excludeTags);
      const exStatusSet = new Set(excludeStatuses);
      let excluded = 0;
      const kept = rows.filter((r) => {
        const hitStatus = exStatusSet.size > 0 && exStatusSet.has(r.status);
        const hitTag = exTagSet.size > 0 && Array.isArray(r.tags) && r.tags.some((t: string) => exTagSet.has(t));
        if (hitStatus || hitTag) { excluded++; return false; }
        return true;
      });
      setRawCount(rows.length);
      setExcludedCount(excluded);
      setRecipientCount(kept.length);
      setCountLoading(false);
    }, 400);
    return () => clearTimeout(t);
  }, [tags, statuses, excludeTags, excludeStatuses, matchMode, open]);

  const addBubble = (type: BubbleType) => {
    if (bubbles.length >= 5) { toast.error("ส่งได้สูงสุด 5 บับเบิลต่อแคมเปญ"); return; }
    if (type === "text") setBubbles([...bubbles, { type: "text", text: "" }]);
    if (type === "image") setBubbles([...bubbles, { type: "image", url: "" }]);
    if (type === "video") setBubbles([...bubbles, { type: "video", url: "" }]);
    if (type === "flex") setBubbles([...bubbles, { type: "flex", alt_text: "", contents: {} }]);
    if (type === "rich_message") setBubbles([...bubbles, { type: "rich_message", image_url: "", alt_text: "Rich Message", actions: [{ label: "ดูเพิ่มเติม", type: "uri", uri: "" }] }]);
    if (type === "rich_video") setBubbles([...bubbles, { type: "rich_video", video_url: "", preview_url: "", alt_text: "Rich Video", actions: [{ label: "ดูเพิ่มเติม", type: "uri", uri: "" }] }]);
    if (type === "card_message") setBubbles([...bubbles, { type: "card_message", alt_text: "Card Message", cards: [{ image_url: "", title: "หัวข้อ", description: "รายละเอียด", actions: [{ label: "ดูเพิ่มเติม", type: "uri", uri: "" }] }] }]);
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
        if (b.type === "rich_message" && !b.image_url) { toast.error("Rich Message ต้องมีรูป"); return; }
        if (b.type === "rich_video" && (!b.video_url || !b.preview_url)) { toast.error("Rich Video ต้องมีวิดีโอ+รูปปก"); return; }
        if (b.type === "card_message") {
          if (!b.cards?.length) { toast.error("Card Message ต้องมีอย่างน้อย 1 การ์ด"); return; }
          for (const c of b.cards) {
            if (!c.image_url) { toast.error("ทุกการ์ดต้องมีรูป"); return; }
          }
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
        exclude_tags: excludeTags,
        exclude_statuses: excludeStatuses,
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
        // CRITICAL: must await — otherwise component unmounts and fetch is aborted
        toast.loading("กำลังส่ง broadcast...", { id: "bcast-send" });
        const { data, error } = await supabase.functions.invoke("broadcast-send", { body: { campaign_id: campaignId } });
        toast.dismiss("bcast-send");
        if (error) toast.error("ส่งล้มเหลว: " + error.message);
        else toast.success(`ส่งเสร็จ — สำเร็จ ${data?.success || 0} / ล้มเหลว ${data?.failed || 0}`);
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
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <Label className="text-sm font-semibold">กลุ่มผู้รับ</Label>
              <div className="text-xs">
                {countLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin inline" />
                ) : recipientCount !== null ? (
                  <span className="font-medium flex items-center gap-1.5 flex-wrap">
                    <span className="text-muted-foreground">รวม</span>
                    <span className="tabular-nums">{rawCount ?? 0}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">ยกเว้น</span>
                    <span className="tabular-nums text-amber-600">{excludedCount}</span>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">สุทธิ</span>
                    <span className="tabular-nums text-primary text-sm font-semibold">{recipientCount}</span>
                    <span className="text-muted-foreground">คน</span>
                  </span>
                ) : null}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Tags ที่ต้องมี ({tags.length} เลือกแล้ว · {allTags.length} ทั้งหมด)</Label>
              <TagPicker allTags={allTags} selected={tags} onChange={setTags} />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">สถานะที่ต้องมี</Label>
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

            {/* Exclude */}
            <div className="pt-3 mt-1 border-t border-dashed space-y-3">
              <Label className="text-sm font-semibold text-amber-700 dark:text-amber-400">
                ยกเว้น (ไม่ส่งหา)
              </Label>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Tags ที่จะยกเว้น ({excludeTags.length} เลือกแล้ว)</Label>
                <TagPicker allTags={allTags} selected={excludeTags} onChange={setExcludeTags} />
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">สถานะที่จะยกเว้น</Label>
                <div className="flex flex-wrap gap-2">
                  {STATUS_OPTIONS.map((s) => (
                    <label key={s.v} className="flex items-center gap-1.5 text-xs cursor-pointer">
                      <Checkbox
                        checked={excludeStatuses.includes(s.v)}
                        onCheckedChange={(c) => setExcludeStatuses(c ? [...excludeStatuses, s.v] : excludeStatuses.filter(x => x !== s.v))}
                      />
                      {s.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div className="space-y-3 p-4 rounded-lg border bg-card/50">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-sm font-semibold">เนื้อหาข้อความ ({bubbles.length}/5)</Label>
            </div>
            <div className="space-y-2">
              <div>
                <div className="text-[11px] text-muted-foreground mb-1">ข้อความพื้นฐาน</div>
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" variant="outline" onClick={() => addBubble("text")} disabled={bubbles.length >= 5}>
                    <Type className="w-3.5 h-3.5 mr-1" /> ข้อความ
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => addBubble("image")} disabled={bubbles.length >= 5}>
                    <ImageIcon className="w-3.5 h-3.5 mr-1" /> รูป
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => addBubble("video")} disabled={bubbles.length >= 5}>
                    <Video className="w-3.5 h-3.5 mr-1" /> วิดีโอ
                  </Button>
                </div>
              </div>
              <div>
                <div className="text-[11px] text-muted-foreground mb-1">Rich Content (มีปุ่มกด)</div>
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" variant="outline" onClick={() => addBubble("rich_message")} disabled={bubbles.length >= 5} className="border-primary/40">
                    <Sparkles className="w-3.5 h-3.5 mr-1 text-primary" /> Rich Message
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => addBubble("rich_video")} disabled={bubbles.length >= 5} className="border-primary/40">
                    <Film className="w-3.5 h-3.5 mr-1 text-primary" /> Rich Video
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => addBubble("card_message")} disabled={bubbles.length >= 5} className="border-primary/40">
                    <LayoutGrid className="w-3.5 h-3.5 mr-1 text-primary" /> Card (carousel)
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => addBubble("flex")} disabled={bubbles.length >= 5} title="สำหรับ developer">
                    <FileJson className="w-3.5 h-3.5 mr-1" /> Flex JSON
                  </Button>
                </div>
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

          {/* Preview */}
          {bubbles.length > 0 && (
            <div className="space-y-3 p-4 rounded-lg border bg-card/50">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-primary" />
                <Label className="text-sm font-semibold">ตัวอย่างที่ลูกค้าจะเห็น</Label>
              </div>
              <PreviewPhone bubbles={bubbles} />
            </div>
          )}

          {/* Test Send */}
          <div className="space-y-3 p-4 rounded-lg border bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-amber-600" />
              <Label className="text-sm font-semibold">ทดสอบส่งก่อน (แนะนำ)</Label>
            </div>
            <TestSendPanel bubbles={bubbles} />
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

      {bubble.type === "rich_message" && (
        <RichMessageEditor bubble={bubble as any} onUpdate={onUpdate} />
      )}
      {bubble.type === "rich_video" && (
        <RichVideoEditor bubble={bubble as any} onUpdate={onUpdate} />
      )}
      {bubble.type === "card_message" && (
        <CardMessageEditor bubble={bubble as any} onUpdate={onUpdate} />
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
    toast.loading("กำลังส่งซ้ำ...", { id: "bcast-resend" });
    const { data, error } = await supabase.functions.invoke("broadcast-send", { body: { campaign_id: campaign.id } });
    toast.dismiss("bcast-resend");
    if (error) toast.error(error.message);
    else toast.success(`ส่งเสร็จ — สำเร็จ ${data?.success || 0} / ล้มเหลว ${data?.failed || 0}`);
    onClose(); onReload();
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
              {(campaign.status === "sent" || campaign.status === "failed" || campaign.status === "sending") && (
                <Button variant="outline" onClick={resend}>
                  <RefreshCw className="w-4 h-4 mr-1" /> {campaign.status === "sending" ? "บังคับส่งใหม่" : "ส่งซ้ำ"}
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

// ============================================================
// TagPicker — search + scrollable list + selected chips
// ============================================================
function TagPicker({ allTags, selected, onChange }: { allTags: string[]; selected: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return allTags;
    return allTags.filter((t) => t.toLowerCase().includes(term));
  }, [allTags, q]);

  const toggle = (t: string) => {
    onChange(selected.includes(t) ? selected.filter((x) => x !== t) : [...selected, t]);
  };

  return (
    <div className="space-y-2">
      {/* Selected chips */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 p-2 rounded-md border bg-background">
          {selected.map((t) => (
            <Badge key={t} variant="default" className="gap-1 pr-1">
              {t}
              <button onClick={() => toggle(t)} className="hover:bg-primary-foreground/20 rounded-full p-0.5">
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
          <button onClick={() => onChange([])} className="text-xs text-muted-foreground hover:text-foreground underline ml-1">
            ล้างทั้งหมด
          </button>
        </div>
      )}

      {/* Picker */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="w-full justify-start text-xs h-9">
            <Search className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
            {selected.length === 0 ? "เลือก tag..." : `เพิ่ม/ลด tag (เลือกแล้ว ${selected.length})`}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ค้นหา tag..."
                className="h-8 pl-7 text-xs"
                autoFocus
              />
            </div>
          </div>
          <ScrollArea className="max-h-64">
            {allTags.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">ยังไม่มี tag ในระบบ</div>
            ) : filtered.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">ไม่พบ "{q}"</div>
            ) : (
              <div className="p-1">
                {filtered.map((t) => {
                  const on = selected.includes(t);
                  return (
                    <button
                      key={t}
                      onClick={() => toggle(t)}
                      className={cn(
                        "w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-xs hover:bg-accent transition text-left",
                        on && "bg-primary/10"
                      )}
                    >
                      <span>{t}</span>
                      {on && <Check className="w-3.5 h-3.5 text-primary" />}
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
          <div className="p-2 border-t flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{filtered.length} จาก {allTags.length}</span>
            <button onClick={() => setOpen(false)} className="hover:text-foreground">เสร็จ</button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

// ============================================================
// PreviewPhone — LINE-style mockup
// ============================================================
function PreviewPhone({ bubbles }: { bubbles: Bubble[] }) {
  return (
    <div className="mx-auto max-w-[300px] rounded-[2rem] border-4 border-foreground/80 bg-[#8cabd9] p-3 shadow-lg">
      {/* Status bar */}
      <div className="flex items-center justify-between text-[10px] text-white/90 px-2 pb-2">
        <span>9:41</span>
        <span>LINE</span>
      </div>
      {/* Chat area */}
      <div className="rounded-2xl bg-[#8cabd9] min-h-[200px] py-3 space-y-2">
        {bubbles.map((b, i) => (
          <div key={i} className="flex items-end gap-1.5 px-2">
            {/* Avatar */}
            <div className="w-7 h-7 rounded-full bg-white/90 flex items-center justify-center text-[10px] shrink-0">
              OA
            </div>
            <div className="max-w-[75%]">
              {b.type === "text" && (
                <div className="bg-white rounded-2xl rounded-bl-md px-3 py-2 text-[12px] text-gray-800 whitespace-pre-wrap break-words shadow-sm">
                  {b.text || <span className="text-gray-400 italic">(ข้อความว่าง)</span>}
                </div>
              )}
              {b.type === "image" && (
                b.url ? (
                  <img src={b.url} className="rounded-lg max-h-40 shadow-sm" />
                ) : (
                  <div className="bg-white/60 rounded-lg w-32 h-24 flex items-center justify-center text-[10px] text-gray-500">
                    <ImageIcon className="w-5 h-5" />
                  </div>
                )
              )}
              {b.type === "video" && (
                b.url ? (
                  <video src={b.url} className="rounded-lg max-h-40 shadow-sm" controls />
                ) : (
                  <div className="bg-white/60 rounded-lg w-32 h-24 flex items-center justify-center text-[10px] text-gray-500">
                    <Video className="w-5 h-5" />
                  </div>
                )
              )}
              {b.type === "flex" && (
                <div className="bg-white rounded-lg p-2 shadow-sm">
                  <div className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                    <FileJson className="w-3 h-3" /> Flex Message
                  </div>
                  <div className="text-[11px] text-gray-700 line-clamp-2">{b.alt_text || "(ไม่มี alt text)"}</div>
                </div>
              )}
            </div>
          </div>
        ))}
        {bubbles.length === 0 && (
          <div className="text-center text-white/70 text-xs py-10">ยังไม่มีข้อความ</div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// TestSendPanel — send to specific LINE user IDs
// ============================================================
function TestSendPanel({ bubbles }: { bubbles: Bubble[] }) {
  const [ids, setIds] = useState("");
  const [sending, setSending] = useState(false);

  const handleTest = async () => {
    if (bubbles.length === 0) { toast.error("ยังไม่มีข้อความที่จะส่ง"); return; }
    const list = ids.split(/[\s,\n]+/).map((s) => s.trim()).filter(Boolean);
    if (list.length === 0) { toast.error("กรุณาใส่ LINE User ID อย่างน้อย 1"); return; }
    // Validate bubble content
    for (const b of bubbles) {
      if (b.type === "text" && !b.text.trim()) { toast.error("บับเบิลข้อความว่าง"); return; }
      if ((b.type === "image" || b.type === "video") && !b.url) { toast.error("ยังไม่ได้อัปโหลดสื่อ"); return; }
    }

    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("broadcast-send", {
        body: { test: true, test_user_ids: list, messages: bubbles },
      });
      if (error) throw error;
      const s = data?.success || 0, f = data?.failed || 0;
      if (f === 0) toast.success(`ส่งทดสอบสำเร็จทั้ง ${s} คน`);
      else toast.error(`สำเร็จ ${s} · ล้มเหลว ${f}: ${data?.errors?.[0]?.error || "ดู logs"}`);
    } catch (e: any) {
      toast.error("ทดสอบไม่สำเร็จ: " + e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-2">
      <Textarea
        value={ids}
        onChange={(e) => setIds(e.target.value)}
        placeholder="LINE User ID (U... 33 ตัว) — ใส่ได้หลายอันคั่นด้วย comma หรือบรรทัดใหม่&#10;ตัวอย่าง: U1234567890abcdef..."
        rows={2}
        className="text-xs font-mono"
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground">
          ส่งข้อความทดสอบจริงผ่าน LINE — ไม่กระทบสถิติแคมเปญ
        </p>
        <Button size="sm" variant="outline" onClick={handleTest} disabled={sending}>
          {sending ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <FlaskConical className="w-3.5 h-3.5 mr-1" />}
          ส่งทดสอบ
        </Button>
      </div>
    </div>
  );
}


// ============================================================
// Rich Content Editors (Rich Message / Rich Video / Card)
// ============================================================

function ActionsEditor({
  actions, onChange, max = 6, min = 1,
}: { actions: ActionItem[]; onChange: (a: ActionItem[]) => void; max?: number; min?: number }) {
  const update = (i: number, patch: Partial<ActionItem>) =>
    onChange(actions.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  const remove = (i: number) => onChange(actions.filter((_, idx) => idx !== i));
  const add = () => {
    if (actions.length >= max) { toast.error(`สูงสุด ${max} ปุ่ม`); return; }
    onChange([...actions, { label: "ปุ่ม", type: "uri", uri: "" }]);
  };
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-muted-foreground">ปุ่ม ({actions.length}/{max})</Label>
        <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={add} disabled={actions.length >= max}>
          <Plus className="w-3 h-3 mr-0.5" /> เพิ่มปุ่ม
        </Button>
      </div>
      {actions.map((a, i) => (
        <div key={i} className="flex items-center gap-1.5 p-1.5 rounded border bg-background">
          <Input
            value={a.label}
            onChange={(e) => update(i, { label: e.target.value.slice(0, 20) })}
            placeholder="ข้อความปุ่ม (≤20)"
            className="h-7 text-xs flex-1"
            maxLength={20}
          />
          <select
            value={a.type}
            onChange={(e) => update(i, { type: e.target.value as "uri" | "message" })}
            className="h-7 rounded border bg-background text-xs px-1"
          >
            <option value="uri">เปิด URL</option>
            <option value="message">ส่งข้อความกลับ</option>
          </select>
          {a.type === "uri" ? (
            <Input
              value={a.uri || ""}
              onChange={(e) => update(i, { uri: e.target.value })}
              placeholder="https://..."
              className="h-7 text-xs flex-1"
            />
          ) : (
            <Input
              value={a.text || ""}
              onChange={(e) => update(i, { text: e.target.value })}
              placeholder="ข้อความที่ส่งกลับ"
              className="h-7 text-xs flex-1"
            />
          )}
          <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500"
            onClick={() => remove(i)} disabled={actions.length <= min}>
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      ))}
    </div>
  );
}

function MediaUpload({
  url, kind, onChange, accept, maxMB,
}: { url: string; kind: "image" | "video"; onChange: (url: string) => void; accept: string; maxMB: number }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div>
      {url ? (
        <div className="relative inline-block">
          {kind === "image"
            ? <img src={url} className="max-h-32 rounded border" />
            : <video src={url} className="max-h-32 rounded border" controls />}
          <Button size="icon" variant="destructive" className="absolute top-1 right-1 h-6 w-6" onClick={() => onChange("")}>
            <X className="w-3 h-3" />
          </Button>
        </div>
      ) : (
        <Button size="sm" variant="outline" disabled={busy} onClick={() => ref.current?.click()}>
          {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> :
            kind === "image" ? <ImageIcon className="w-3.5 h-3.5 mr-1" /> : <Video className="w-3.5 h-3.5 mr-1" />}
          อัปโหลด{kind === "image" ? "รูป" : "วิดีโอ"} (≤{maxMB}MB)
        </Button>
      )}
      <input ref={ref} type="file" accept={accept} className="hidden" onChange={async (e) => {
        const f = e.target.files?.[0]; if (!f) return;
        if (f.size > maxMB * 1024 * 1024) { toast.error(`ไฟล์ใหญ่เกิน ${maxMB}MB`); return; }
        setBusy(true);
        const u = await uploadMedia(f, kind);
        setBusy(false);
        if (u) onChange(u);
      }} />
    </div>
  );
}

function RichMessageEditor({
  bubble, onUpdate,
}: { bubble: { type: "rich_message"; image_url: string; alt_text: string; actions: ActionItem[] }; onUpdate: (p: any) => void }) {
  return (
    <div className="space-y-2.5">
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">รูป (แนะนำสี่เหลี่ยมจัตุรัส 1040×1040)</Label>
        <MediaUpload url={bubble.image_url} kind="image" accept="image/*" maxMB={10}
          onChange={(u) => onUpdate({ image_url: u } as any)} />
      </div>
      <Input
        value={bubble.alt_text}
        onChange={(e) => onUpdate({ alt_text: e.target.value } as any)}
        placeholder="ข้อความแจ้งเตือน (alt text)"
        className="text-xs"
      />
      <ActionsEditor
        actions={bubble.actions}
        onChange={(a) => onUpdate({ actions: a } as any)}
        max={6}
      />
    </div>
  );
}

function RichVideoEditor({
  bubble, onUpdate,
}: { bubble: { type: "rich_video"; video_url: string; preview_url: string; alt_text: string; actions: ActionItem[] }; onUpdate: (p: any) => void }) {
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">วิดีโอ (mp4, ≤200MB)</Label>
          <MediaUpload url={bubble.video_url} kind="video" accept="video/mp4"
            maxMB={200} onChange={(u) => onUpdate({ video_url: u } as any)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">รูปปก (preview) <span className="text-red-500">*</span></Label>
          <MediaUpload url={bubble.preview_url} kind="image" accept="image/*"
            maxMB={10} onChange={(u) => onUpdate({ preview_url: u } as any)} />
        </div>
      </div>
      <Input
        value={bubble.alt_text}
        onChange={(e) => onUpdate({ alt_text: e.target.value } as any)}
        placeholder="ข้อความแจ้งเตือน (alt text)"
        className="text-xs"
      />
      <ActionsEditor
        actions={bubble.actions}
        onChange={(a) => onUpdate({ actions: a } as any)}
        max={3}
      />
    </div>
  );
}

function CardMessageEditor({
  bubble, onUpdate,
}: { bubble: { type: "card_message"; alt_text: string; cards: CardItem[] }; onUpdate: (p: any) => void }) {
  const updateCard = (i: number, patch: Partial<CardItem>) =>
    onUpdate({ cards: bubble.cards.map((c, idx) => (idx === i ? { ...c, ...patch } : c)) } as any);
  const removeCard = (i: number) =>
    onUpdate({ cards: bubble.cards.filter((_, idx) => idx !== i) } as any);
  const addCard = () => {
    if (bubble.cards.length >= 10) { toast.error("สูงสุด 10 การ์ด"); return; }
    onUpdate({ cards: [...bubble.cards, { image_url: "", title: "หัวข้อ", description: "รายละเอียด", actions: [{ label: "ดูเพิ่มเติม", type: "uri", uri: "" }] }] } as any);
  };
  return (
    <div className="space-y-2.5">
      <Input
        value={bubble.alt_text}
        onChange={(e) => onUpdate({ alt_text: e.target.value } as any)}
        placeholder="ข้อความแจ้งเตือน (alt text)"
        className="text-xs"
      />
      <div className="space-y-2">
        {bubble.cards.map((c, i) => (
          <div key={i} className="p-2.5 rounded border bg-background space-y-2">
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="text-[10px]">การ์ด #{i + 1}</Badge>
              <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500"
                onClick={() => removeCard(i)} disabled={bubble.cards.length <= 1}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">รูป (16:9 หรือสี่เหลี่ยมจัตุรัส)</Label>
              <MediaUpload url={c.image_url} kind="image" accept="image/*" maxMB={10}
                onChange={(u) => updateCard(i, { image_url: u })} />
            </div>
            <Input
              value={c.title}
              onChange={(e) => updateCard(i, { title: e.target.value.slice(0, 40) })}
              placeholder="หัวข้อ"
              className="text-xs font-medium"
            />
            <Textarea
              value={c.description}
              onChange={(e) => updateCard(i, { description: e.target.value.slice(0, 60) })}
              placeholder="รายละเอียดสั้นๆ (≤60 ตัว)"
              rows={2}
              className="text-xs"
            />
            <ActionsEditor
              actions={c.actions}
              onChange={(a) => updateCard(i, { actions: a })}
              max={3}
              min={0}
            />
          </div>
        ))}
      </div>
      <Button size="sm" variant="outline" onClick={addCard} disabled={bubble.cards.length >= 10} className="w-full">
        <Plus className="w-3.5 h-3.5 mr-1" /> เพิ่มการ์ด ({bubble.cards.length}/10)
      </Button>
    </div>
  );
}
