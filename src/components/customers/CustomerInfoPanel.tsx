import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { toast } from "sonner";
import {
  Tag, X, Copy, ExternalLink, Smartphone, BookmarkCheck, History,
  Phone, MapPin, Users as UsersIcon, Calendar, Loader2, Sparkles, Pencil
} from "lucide-react";

const LIFF_ID = (import.meta as any).env?.VITE_LIFF_ID || "";

interface CustomerInfoPanelProps {
  customer: any;
  onUpdate: (patch: any) => void;
  statusLabels?: Record<string, string>;
}

const DEFAULT_STATUS_LABELS: Record<string, string> = {
  new: "ลูกค้าใหม่",
  inquiry: "สอบถาม",
  returning: "ลูกค้าเก่า",
  pending_quote: "รอเสนอราคา",
  pending_confirm: "รอคอนเฟิร์ม",
  confirmed: "คอนเฟิร์ม",
  confirmed_returning: "คอนเฟิร์ม (ลูกค้าเก่า)",
  completed: "จัดงานจบแล้ว",
  postponed: "เลื่อนวันจัดงาน(มัดจำแล้ว)",
  cancelled: "ยกเลิก",
};

export default function CustomerInfoPanel({
  customer,
  onUpdate,
  statusLabels = DEFAULT_STATUS_LABELS,
}: CustomerInfoPanelProps) {
  const [local, setLocal] = useState(customer);
  const [tagInput, setTagInput] = useState("");
  const [tagPickerOpen, setTagPickerOpen] = useState(false);
  const [masterTags, setMasterTags] = useState<{ id: string; name: string; color: string }[]>([]);
  const [pastEvents, setPastEvents] = useState<any[]>([]);
  const [archiving, setArchiving] = useState(false);
  const [intentFields, setIntentFields] = useState<any[]>([]);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveDraft, setArchiveDraft] = useState<any>({});
  const [editEventId, setEditEventId] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractingPanel, setExtractingPanel] = useState(false);

  useEffect(() => setLocal(customer), [customer.id]);
  // sync เฉพาะ field ที่โชว์ใน dropdown/ปุ่ม (status, ai_active, admin_bot_override, manual_chat_until)
  // เพื่อกันค่าค้างทับ DB จริงเมื่อ realtime อัปเดต — ไม่แตะ input ที่กำลังพิมพ์
  useEffect(() => {
    setLocal((prev: any) => ({
      ...prev,
      status: customer.status,
      ai_active: customer.ai_active,
      admin_bot_override: customer.admin_bot_override,
      manual_chat_until: customer.manual_chat_until,
      tags: customer.tags,
    }));
  }, [customer.status, customer.ai_active, customer.admin_bot_override, customer.manual_chat_until, customer.tags]);

  const save = (k: string, v: any) => {
    setLocal({ ...local, [k]: v });
    onUpdate({ [k]: v });
  };

  useEffect(() => {
    supabase
      .from("app_settings")
      .select("intent_fields")
      .eq("key", "ai_config")
      .maybeSingle()
      .then(({ data }) =>
        setIntentFields(
          Array.isArray((data as any)?.intent_fields) ? (data as any).intent_fields : []
        )
      );
  }, []);

  const loadMasterTags = async () => {
    const { data } = await supabase
      .from("tags")
      .select("id, name, color")
      .order("sort_order")
      .order("name");
    setMasterTags((data as any) || []);
  };

  useEffect(() => {
    loadMasterTags();
  }, []);

  const intentData: Record<string, any> =
    local.intent_data && typeof local.intent_data === "object" ? local.intent_data : {};

  const saveIntent = (key: string, value: string) => {
    const next = { ...intentData };
    if (value) next[key] = value;
    else delete next[key];
    setLocal({ ...local, intent_data: next });
    onUpdate({ intent_data: next });
  };

  const loadEvents = async () => {
    const { data } = await supabase
      .from("customer_events")
      .select("*")
      .eq("customer_id", customer.id)
      .order("event_date", { ascending: false, nullsFirst: false });
    setPastEvents(data || []);
  };

  useEffect(() => {
    loadEvents();
  }, [customer.id]);

  const openArchiveDialog = () => {
    const intent = intentData || {};
    setEditEventId(null);
    setArchiveDraft({
      event_type: customer.event_type || intent.event_type || intent.service_type || "",
      guest_count: customer.guest_count || intent.guest_count || "",
      event_date: customer.event_date || intent.event_date || "",
      venue: customer.venue || intent.venue || "",
      total_amount: customer.clv_amount || intent.total_amount || 0,
      notes: "",
    });
    setArchiveOpen(true);
  };

  const openEditEventDialog = (e: any) => {
    setEditEventId(e.id);
    setArchiveDraft({
      event_type: e.event_type || "",
      guest_count: e.guest_count || "",
      event_date: e.event_date || "",
      venue: e.venue || "",
      total_amount: e.total_amount ?? 0,
      notes: e.notes || "",
    });
    setArchiveOpen(true);
  };


  const extractFromChat = async () => {
    setExtracting(true);
    try {
      const { data, error } = await supabase.functions.invoke("extract-event-from-chat", {
        body: { customer_id: customer.id },
      });
      if (error) throw error;
      const ex = data?.extracted || {};
      setArchiveDraft((prev: any) => ({
        ...prev,
        event_type: ex.event_type || prev.event_type || "",
        guest_count: ex.guest_count || prev.guest_count || "",
        event_date: ex.event_date || prev.event_date || "",
        venue: ex.venue || prev.venue || "",
        total_amount: ex.total_amount || prev.total_amount || 0,
        notes: ex.notes ? (prev.notes ? `${prev.notes}\n${ex.notes}` : ex.notes) : prev.notes,
      }));
      toast.success("ดึงข้อมูลจากแชทสำเร็จ — ตรวจสอบก่อนบันทึก");
    } catch (e: any) {
      toast.error("ดึงข้อมูลไม่สำเร็จ: " + (e?.message || e));
    } finally {
      setExtracting(false);
    }
  };

  const extractToPanel = async () => {
    setExtractingPanel(true);
    try {
      const { data, error } = await supabase.functions.invoke("extract-event-from-chat", {
        body: { customer_id: customer.id },
      });
      if (error) throw error;
      const ex = data?.extracted || {};
      // Only fill blanks — don't overwrite admin's edits
      const patch: any = {};
      if (ex.event_type && !local.event_type) patch.event_type = String(ex.event_type).slice(0, 100);
      if (ex.guest_count && !local.guest_count) patch.guest_count = parseInt(ex.guest_count) || null;
      if (ex.event_date && !local.event_date && /^\d{4}-\d{2}-\d{2}$/.test(String(ex.event_date))) {
        patch.event_date = ex.event_date;
      }
      if (ex.venue && !local.venue) patch.venue = String(ex.venue).slice(0, 200);
      if (ex.total_amount && !local.clv_amount) patch.clv_amount = parseFloat(ex.total_amount) || 0;
      const filled = Object.keys(patch).length;
      if (filled === 0) {
        toast.info("ไม่มีช่องว่างให้เติม — ข้อมูลครบหรือ AI ยังไม่เจอเพิ่ม");
        return;
      }
      await supabase.from("customers").update(patch).eq("id", customer.id);
      setLocal({ ...local, ...patch });
      onUpdate(patch);
      toast.success(`เติมข้อมูล ${filled} ช่องจากแชทแล้ว`);
    } catch (e: any) {
      toast.error("ดึงข้อมูลไม่สำเร็จ: " + (e?.message || e));
    } finally {
      setExtractingPanel(false);
    }
  };

  const archiveCurrentEvent = async () => {
    const d = archiveDraft || {};
    if (!d.event_type && !d.guest_count && !d.event_date) {
      toast.error("กรุณากรอกข้อมูลงานอย่างน้อย 1 ช่อง");
      return;
    }
    setArchiving(true);
    try {
      const eventPayload = {
        event_type: d.event_type || null,
        guest_count: d.guest_count ? parseInt(d.guest_count) : null,
        event_date: d.event_date || null,
        venue: d.venue || null,
        total_amount: parseFloat(d.total_amount) || 0,
        notes: d.notes || null,
      };

      if (editEventId) {
        // โหมดแก้ไขประวัติงานเดิม — ไม่แตะ customers, ไม่ reset สถานะ
        const { error: updErr } = await supabase
          .from("customer_events")
          .update(eventPayload)
          .eq("id", editEventId);
        if (updErr) throw updErr;
        toast.success("แก้ไขประวัติงานแล้ว");
        setArchiveOpen(false);
        setEditEventId(null);
        loadEvents();
        return;
      }

      const adminPatch = {
        event_type: eventPayload.event_type,
        guest_count: eventPayload.guest_count,
        event_date: eventPayload.event_date,
        venue: eventPayload.venue,
        clv_amount: eventPayload.total_amount,
      };
      const { error: preErr } = await supabase
        .from("customers")
        .update(adminPatch)
        .eq("id", customer.id);
      if (preErr) throw preErr;

      const { error: insErr } = await supabase.from("customer_events").insert({
        customer_id: customer.id,
        ...eventPayload,
        package_name: null,
        status: "completed",
      });
      if (insErr) throw insErr;

      const patch = {
        event_type: null,
        guest_count: null,
        venue: null,
        event_month: null,
        event_date: null,
        last_sent_image_titles: [],
        status: "inquiry" as const,
        customer_origin: "returning" as const,
      };
      const { error: updErr } = await supabase
        .from("customers")
        .update(patch)
        .eq("id", customer.id);
      if (updErr) throw updErr;
      onUpdate(patch);
      toast.success("บันทึกประวัติงานแล้ว — พร้อมรับงานใหม่");
      setArchiveOpen(false);
      loadEvents();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setArchiving(false);
    }
  };

  const deleteEvent = async (id: string) => {
    const { error } = await supabase.from("customer_events").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    loadEvents();
  };

  const tags: string[] = Array.isArray(local.tags) ? local.tags : [];

  const tagColor = (name: string) =>
    masterTags.find((m) => m.name === name)?.color || "#94a3b8";

  const addTag = async (rawName?: string) => {
    const t = (rawName ?? tagInput).trim();
    if (!t || tags.includes(t)) {
      setTagInput("");
      return;
    }
    const next = [...tags, t];
    setLocal({ ...local, tags: next });
    onUpdate({ tags: next });
    setTagInput("");
    setTagPickerOpen(false);
    // Auto-create in master list if not exists
    if (!masterTags.find((m) => m.name === t)) {
      const { error } = await supabase.from("tags").insert({ name: t, color: "#94a3b8" });
      if (!error) loadMasterTags();
    }
  };

  const removeTag = (t: string) => {
    const next = tags.filter((x) => x !== t);
    setLocal({ ...local, tags: next });
    onUpdate({ tags: next });
  };

  const liffUrl = LIFF_ID
    ? `https://liff.line.me/${LIFF_ID}?uid=${customer.line_user_id}`
    : `${window.location.origin}/liff?uid=${customer.line_user_id}`;

  const copyLiff = async () => {
    try {
      await navigator.clipboard.writeText(liffUrl);
      toast.success("คัดลอกลิงก์แล้ว");
    } catch {
      toast.error("คัดลอกไม่สำเร็จ");
    }
  };

  return (
    <div className="space-y-4 pt-6">
      <div className="flex items-center gap-3">
        <Avatar className="w-14 h-14">
          {customer.picture_url && <AvatarImage src={customer.picture_url} />}
          <AvatarFallback className="bg-brand-gradient text-primary-foreground">
            {(customer.display_name || "?")[0]}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="font-semibold truncate">{customer.display_name}</p>
          <p className="text-xs text-muted-foreground truncate">{customer.line_user_id}</p>
        </div>
      </div>

      {/* Priority alerts */}
      {(customer.last_sender === "ai" && customer.admin_unseen) && (
        <div className="flex flex-wrap gap-1.5">
          {customer.phone && (customer.admin_unseen || customer.status === "pending_quote") && (
            <Badge className="text-[11px] py-0.5 px-2 bg-[#DC2626] text-white hover:bg-[#DC2626] border-0">
              🔥 First Priority — มีเบอร์ โทรได้
            </Badge>
          )}
          <Badge className="text-[11px] py-0.5 px-2 bg-[#F59E0B] text-white hover:bg-[#F59E0B] border-0">
            🤖 รอแอดมินตอบ
          </Badge>
        </div>
      )}

      <Separator />

      {/* Tags */}
      <div>
        <Label className="text-xs flex items-center gap-1 mb-2">
          <Tag className="w-3 h-3" />
          แท็ก
        </Label>
        <div className="flex flex-wrap gap-1 mb-2">
          {tags.length === 0 && (
            <span className="text-xs text-muted-foreground">ยังไม่มีแท็ก</span>
          )}
          {tags.map((t) => (
            <Badge
              key={t}
              className="text-xs gap-1 pr-1 border-0 text-white"
              style={{ backgroundColor: tagColor(t) }}
            >
              {t}
              <button
                onClick={() => removeTag(t)}
                className="hover:bg-black/20 rounded-full p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            </Badge>
          ))}
        </div>
        <Popover open={tagPickerOpen} onOpenChange={setTagPickerOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline" className="h-8 w-full justify-start text-xs text-muted-foreground">
              <Tag className="w-3 h-3 mr-1" /> เพิ่มแท็ก...
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0" align="start">
            <Command>
              <CommandInput
                placeholder="ค้นหาหรือสร้างแท็กใหม่"
                value={tagInput}
                onValueChange={setTagInput}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && tagInput.trim()) {
                    e.preventDefault();
                    addTag(tagInput);
                  }
                }}
              />
              <CommandList>
                <CommandEmpty>
                  <button
                    onClick={() => addTag(tagInput)}
                    className="text-xs text-primary hover:underline px-2 py-1"
                  >
                    + สร้างแท็ก "{tagInput}"
                  </button>
                </CommandEmpty>
                <CommandGroup>
                  {masterTags
                    .filter((m) => !tags.includes(m.name))
                    .map((m) => (
                      <CommandItem key={m.id} value={m.name} onSelect={() => addTag(m.name)}>
                        <span
                          className="w-3 h-3 rounded-full mr-2 shrink-0"
                          style={{ backgroundColor: m.color }}
                        />
                        {m.name}
                      </CommandItem>
                    ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      <Separator />

      {/* LIFF */}
      <div>
        <Label className="text-xs flex items-center gap-1 mb-2">
          <Smartphone className="w-3 h-3" />
          ลิงก์ LIFF
        </Label>
        <div className="flex gap-1">
          <Input value={liffUrl} readOnly className="h-8 text-xs font-mono" />
          <Button size="sm" variant="outline" onClick={copyLiff} title="คัดลอก">
            <Copy className="w-3 h-3" />
          </Button>
          <Button size="sm" variant="outline" asChild title="เปิด">
            <a href={liffUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="w-3 h-3" />
            </a>
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          ส่งให้ทีมเปิดในมือถือ → จัดการสถานะลูกค้าผ่าน LIFF
        </p>
      </div>

      <Separator />

      {/* ประวัติงาน + ปุ่มปิดงาน */}
      <div>
        <Label className="text-xs flex items-center gap-1 mb-2">
          <History className="w-3 h-3" />
          ประวัติงาน ({pastEvents.length})
        </Label>
        {pastEvents.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            ยังไม่มีประวัติงาน — กดปุ่มด้านล่างเมื่อปิดงานเพื่อบันทึกเป็นลูกค้า VIP
          </p>
        ) : (
          <div className="space-y-1.5 mb-2 max-h-40 overflow-y-auto">
            {pastEvents.map((e) => (
              <div
                key={e.id}
                className="text-[11px] rounded border bg-muted/30 p-2 flex items-start gap-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">
                    {e.event_type || "(งาน)"} {e.guest_count ? `· ${e.guest_count} ท่าน` : ""}
                  </div>
                  <div className="text-muted-foreground">
                    {e.event_date || "—"} {e.venue ? `· ${e.venue}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openEditEventDialog(e)}
                    className="text-muted-foreground hover:text-primary"
                    title="แก้ไข"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => deleteEvent(e.id)}
                    className="text-muted-foreground hover:text-destructive"
                    title="ลบ"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          disabled={archiving}
          onClick={openArchiveDialog}
        >
          <BookmarkCheck className="w-3 h-3 mr-1" /> ปิดงาน / บันทึกประวัติ
        </Button>
        <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>ตรวจข้อมูลก่อนบันทึกเข้าประวัติ</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground flex-1">
                  ตรวจ/แก้ให้ถูกก่อนบันทึก — ค่าที่แก้จะอัปเดต customer + เก็บเข้าประวัติงาน
                  แล้ว reset ช่องงาน + เปลี่ยนสถานะเป็น "สอบถาม" + ตั้งหมวดเป็น "ลูกค้าเก่า"
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={extractFromChat}
                  disabled={extracting || archiving}
                  className="shrink-0"
                >
                  {extracting ? (
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  ) : (
                    "🤖"
                  )}{" "}
                  ดึงจากแชท
                </Button>
              </div>
              <div>
                <Label className="text-xs">ประเภทงาน</Label>
                {(() => {
                  const f = intentFields.find((x: any) => x?.key === "event_type");
                  const opts: string[] = Array.isArray(f?.values) ? f.values.filter(Boolean) : [];
                  if (opts.length === 0) {
                    return (
                      <Input
                        value={archiveDraft.event_type || ""}
                        onChange={(e) =>
                          setArchiveDraft({ ...archiveDraft, event_type: e.target.value })
                        }
                      />
                    );
                  }
                  const cur = archiveDraft.event_type || "";
                  const isOther = cur !== "" && !opts.includes(cur);
                  const selectVal = cur === "" ? "" : isOther ? "__other__" : cur;
                  return (
                    <div className="space-y-1.5">
                      <Select
                        value={selectVal}
                        onValueChange={(v) => {
                          if (v === "__other__") {
                            setArchiveDraft({ ...archiveDraft, event_type: isOther ? cur : "" });
                          } else {
                            setArchiveDraft({ ...archiveDraft, event_type: v });
                          }
                        }}
                      >
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="เลือกประเภทงาน" />
                        </SelectTrigger>
                        <SelectContent>
                          {opts.map((o) => (
                            <SelectItem key={o} value={o}>{o}</SelectItem>
                          ))}
                          <SelectItem value="__other__">อื่นๆ (พิมพ์เอง)</SelectItem>
                        </SelectContent>
                      </Select>
                      {(isOther || selectVal === "__other__") && (
                        <Input
                          placeholder="ระบุประเภทงาน"
                          value={cur}
                          onChange={(e) =>
                            setArchiveDraft({ ...archiveDraft, event_type: e.target.value })
                          }
                        />
                      )}
                    </div>
                  );
                })()}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">จำนวนแขก</Label>
                  <Input
                    type="number"
                    value={archiveDraft.guest_count || ""}
                    onChange={(e) =>
                      setArchiveDraft({ ...archiveDraft, guest_count: e.target.value })
                    }
                  />
                </div>
                <div>
                  <Label className="text-xs">วันจัดงาน</Label>
                  <Input
                    type="date"
                    value={archiveDraft.event_date || ""}
                    onChange={(e) =>
                      setArchiveDraft({ ...archiveDraft, event_date: e.target.value })
                    }
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">สถานที่</Label>
                <Input
                  value={archiveDraft.venue || ""}
                  onChange={(e) =>
                    setArchiveDraft({ ...archiveDraft, venue: e.target.value })
                  }
                />
              </div>
              <div>
                <Label className="text-xs">ยอดรวม (CLV)</Label>
                <Input
                  type="number"
                  value={archiveDraft.total_amount ?? ""}
                  onChange={(e) =>
                    setArchiveDraft({ ...archiveDraft, total_amount: e.target.value })
                  }
                />
              </div>
              <div>
                <Label className="text-xs">โน้ตเพิ่มเติม (ถ้ามี)</Label>
                <Textarea
                  rows={2}
                  value={archiveDraft.notes || ""}
                  onChange={(e) =>
                    setArchiveDraft({ ...archiveDraft, notes: e.target.value })
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setArchiveOpen(false)} disabled={archiving}>
                ยกเลิก
              </Button>
              <Button onClick={archiveCurrentEvent} disabled={archiving}>
                {archiving && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                บันทึก
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Separator />

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2 -mb-1">
          <Label className="text-xs text-muted-foreground">รายละเอียดลูกค้า</Label>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-[11px] px-2 gap-1 text-primary hover:text-primary"
            onClick={extractToPanel}
            disabled={extractingPanel}
            title="ให้ AI อ่านแชททั้งหมดแล้วเติมช่องว่างให้"
          >
            {extractingPanel ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Sparkles className="w-3 h-3" />
            )}
            ดึงจากแชท
          </Button>
        </div>

        <div>
          <Label className="text-xs">ชื่อเล่น</Label>
          <Input
            value={local.nickname || ""}
            onChange={(e) => setLocal({ ...local, nickname: e.target.value })}
            onBlur={() => onUpdate({ nickname: local.nickname })}
          />
        </div>
        <div>
          <Label className="text-xs flex items-center gap-1">
            <Phone className="w-3 h-3" />
            เบอร์โทร
          </Label>
          <Input
            value={local.phone || ""}
            onChange={(e) => setLocal({ ...local, phone: e.target.value })}
            onBlur={() => onUpdate({ phone: local.phone })}
          />
        </div>
        <div>
          <Label className="text-xs">เลขผู้เสียภาษี / Tag</Label>
          <Input
            value={local.tax_id || ""}
            onChange={(e) => setLocal({ ...local, tax_id: e.target.value })}
            onBlur={() => onUpdate({ tax_id: local.tax_id })}
          />
        </div>
        <div>
          <Label className="text-xs">สถานะ</Label>
          <Select value={local.status} onValueChange={(v) => save("status", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(statusLabels).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            วันจัดงาน
          </Label>
          <Input
            type="date"
            value={local.event_date || ""}
            onChange={(e) => setLocal({ ...local, event_date: e.target.value })}
            onBlur={() => onUpdate({ event_date: local.event_date || null })}
          />
        </div>
        <div>
          <Label className="text-xs">ประเภทงาน</Label>
          {(() => {
            const f = intentFields.find((x: any) => x?.key === "event_type");
            const opts: string[] = Array.isArray(f?.values) ? f.values.filter(Boolean) : [];
            if (opts.length === 0) {
              return (
                <Input
                  value={local.event_type || ""}
                  onChange={(e) => setLocal({ ...local, event_type: e.target.value })}
                  onBlur={() => onUpdate({ event_type: local.event_type })}
                />
              );
            }
            const cur = local.event_type || "";
            const isOther = cur !== "" && !opts.includes(cur);
            const selectVal = cur === "" ? "" : isOther ? "__other__" : cur;
            return (
              <div className="space-y-1.5">
                <Select
                  value={selectVal}
                  onValueChange={(v) => {
                    if (v === "__other__") {
                      setLocal({ ...local, event_type: isOther ? cur : "" });
                    } else {
                      setLocal({ ...local, event_type: v });
                      onUpdate({ event_type: v });
                    }
                  }}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="เลือกประเภทงาน" />
                  </SelectTrigger>
                  <SelectContent>
                    {opts.map((o) => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                    <SelectItem value="__other__">อื่นๆ (พิมพ์เอง)</SelectItem>
                  </SelectContent>
                </Select>
                {(isOther || selectVal === "__other__") && (
                  <Input
                    placeholder="ระบุประเภทงาน"
                    value={cur}
                    onChange={(e) => setLocal({ ...local, event_type: e.target.value })}
                    onBlur={() => onUpdate({ event_type: local.event_type })}
                  />
                )}
              </div>
            );
          })()}
        </div>
        {(() => {
          const f = intentFields.find((x: any) => x?.key === "service_type");
          if (!f) return null;
          const opts: string[] = Array.isArray(f?.values) ? f.values.filter(Boolean) : [];
          const cur = (intentData.service_type as string) || "";
          const isOther = cur !== "" && opts.length > 0 && !opts.includes(cur);
          const selectVal = cur === "" ? "" : isOther ? "__other__" : cur;
          return (
            <div>
              <Label className="text-xs">{f.label || "รูปแบบอาหาร"}</Label>
              {opts.length === 0 ? (
                <Input
                  value={cur}
                  onChange={(e) => {
                    const next = { ...intentData, service_type: e.target.value };
                    setLocal({ ...local, intent_data: next });
                  }}
                  onBlur={() => saveIntent("service_type", cur)}
                />
              ) : (
                <div className="space-y-1.5">
                  <Select
                    value={selectVal}
                    onValueChange={(v) => {
                      if (v === "__other__") {
                        if (!isOther) saveIntent("service_type", "");
                      } else {
                        saveIntent("service_type", v);
                      }
                    }}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder={`เลือก${f.label || "รูปแบบอาหาร"}`} />
                    </SelectTrigger>
                    <SelectContent>
                      {opts.map((o) => (
                        <SelectItem key={o} value={o}>{o}</SelectItem>
                      ))}
                      <SelectItem value="__other__">อื่นๆ (พิมพ์เอง)</SelectItem>
                    </SelectContent>
                  </Select>
                  {(isOther || selectVal === "__other__") && (
                    <Input
                      placeholder={`ระบุ${f.label || "รูปแบบอาหาร"}`}
                      value={cur}
                      onChange={(e) => {
                        const next = { ...intentData, service_type: e.target.value };
                        setLocal({ ...local, intent_data: next });
                      }}
                      onBlur={() => saveIntent("service_type", cur)}
                    />
                  )}
                </div>
              )}
            </div>
          );
        })()}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs flex items-center gap-1">
              <UsersIcon className="w-3 h-3" />
              จำนวน
            </Label>
            <Input
              type="number"
              value={local.guest_count || ""}
              onChange={(e) =>
                setLocal({ ...local, guest_count: parseInt(e.target.value) || null })
              }
              onBlur={() => onUpdate({ guest_count: local.guest_count })}
            />
          </div>
          <div>
            <Label className="text-xs">CLV</Label>
            <Input
              type="number"
              value={local.clv_amount || 0}
              onChange={(e) =>
                setLocal({ ...local, clv_amount: parseFloat(e.target.value) || 0 })
              }
              onBlur={() => onUpdate({ clv_amount: local.clv_amount })}
            />
          </div>
        </div>
        <div>
          <Label className="text-xs flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            สถานที่
          </Label>
          <Input
            value={local.venue || ""}
            onChange={(e) => setLocal({ ...local, venue: e.target.value })}
            onBlur={() => onUpdate({ venue: local.venue })}
          />
        </div>
        <div>
          <Label className="text-xs">โน้ตแอดมิน</Label>
          <Textarea
            rows={3}
            value={local.admin_notes || ""}
            onChange={(e) => setLocal({ ...local, admin_notes: e.target.value })}
            onBlur={() => onUpdate({ admin_notes: local.admin_notes })}
          />
        </div>

        {intentFields.filter(
          (f) => f.key && Array.isArray(f.values) && f.values.length > 0
        ).length > 0 && (
          <div className="space-y-3 pt-2 border-t">
            <Label className="text-xs text-muted-foreground">ข้อมูลจาก AI (แก้ไขได้)</Label>
            {intentFields
              .filter((f) => f.key && Array.isArray(f.values) && f.values.length > 0)
              .map((f) => (
                <div key={f.key}>
                  <Label className="text-xs">
                    {f.label || f.key}
                    {f.required && <span className="text-destructive ml-1">*</span>}
                  </Label>
                  <Select
                    value={intentData[f.key] || "__none__"}
                    onValueChange={(v) =>
                      saveIntent(f.key, v === "__none__" ? "" : v)
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="— เลือก —" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— ไม่ระบุ —</SelectItem>
                      {f.values.map((v: string) => (
                        <SelectItem key={v} value={v}>
                          {v}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
