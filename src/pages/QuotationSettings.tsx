import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Loader2, Save, Receipt, Plus, Pencil, Trash2, AlertTriangle, X, Lock, RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import {
  validateQuotationConfig,
  invalidateQuotationConfigCache,
  DEFAULT_QUOTATION_CONFIG,
  type QuotationConfig,
} from "@/lib/quotationDetection";

// ---------------- Regex builder / parser ----------------
// รูปแบบมาตรฐาน: <prefixPart>(\d{4})(\d{2})<suffixPart?>
//  - prefixPart = single literal | (?:A|B|...) | <literal>[chars]
//  - group 1 = ปี พ.ศ. 4 หลัก, group 2 = เดือน 2 หลัก
//  - suffixPart = "" | "-\d+"

const RE_SPECIALS = /[.*+?^${}()|[\]\\]/g;
const escapeRe = (s: string) => s.replace(RE_SPECIALS, "\\$&");
const unescapeRe = (s: string) => s.replace(/\\([.*+?^${}()|[\]\\-])/g, "$1");

export type PatternForm = {
  name: string;
  enabled: boolean;
  prefixes: string[];
  hasSuffix: boolean; // "-\d+"
  quoteType: string;
};

export function buildPatternRegex(form: PatternForm): string {
  const prefixes = form.prefixes.map(p => p.trim()).filter(Boolean);
  if (prefixes.length === 0) throw new Error("ต้องมีคำนำหน้าอย่างน้อย 1 รายการ");
  const escaped = prefixes.map(escapeRe);
  const prefixPart = escaped.length === 1 ? escaped[0] : `(?:${escaped.join("|")})`;
  const suffixPart = form.hasSuffix ? "-\\d+" : "";
  return `${prefixPart}(\\d{4})(\\d{2})${suffixPart}`;
}

// พยายาม parse regex เดิมกลับเป็น form
// return null ถ้า parse ไม่ได้ (custom advanced)
export function parsePatternRegex(regex: string): { prefixes: string[]; hasSuffix: boolean } | null {
  // หา anchor (\d{4})(\d{2})
  const anchor = "(\\d{4})(\\d{2})";
  const idx = regex.indexOf(anchor);
  if (idx < 0) return null;
  const prefixRaw = regex.slice(0, idx);
  const suffixRaw = regex.slice(idx + anchor.length);
  if (suffixRaw !== "" && suffixRaw !== "-\\d+") return null;
  const hasSuffix = suffixRaw === "-\\d+";
  const prefixes = parsePrefixPart(prefixRaw);
  if (!prefixes) return null;
  return { prefixes, hasSuffix };
}

function parsePrefixPart(s: string): string[] | null {
  if (!s) return null;
  // form 1: (?:A|B|C)
  const g = s.match(/^\(\?:(.+)\)$/);
  if (g) {
    const parts = splitAlternation(g[1]);
    if (!parts) return null;
    return parts.map(unescapeRe);
  }
  // form 2: literal[chars]  → expand เป็น [literal+ch1, literal+ch2, ...]
  const cc = s.match(/^(.*?)\[([^\]]+)\]$/);
  if (cc) {
    const lit = unescapeRe(cc[1]);
    const chars = cc[2].split("");
    // reject range like [A-Z]
    if (cc[2].includes("-")) return null;
    if (chars.length === 0) return null;
    return chars.map(c => lit + c);
  }
  // form 3: single literal (no unescaped regex metachar)
  if (/[(){}|*+?^$\[\]]/.test(s.replace(/\\./g, ""))) return null;
  return [unescapeRe(s)];
}

// split A|B|C by top-level | (ไม่มี nested เพราะเราสร้างเอง แต่กัน escaped \|)
function splitAlternation(s: string): string[] | null {
  const out: string[] = [];
  let buf = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\\" && i + 1 < s.length) { buf += ch + s[i + 1]; i++; continue; }
    if (ch === "|") { out.push(buf); buf = ""; continue; }
    if (ch === "(" || ch === ")" || ch === "[" || ch === "]") return null;
    buf += ch;
  }
  out.push(buf);
  return out.filter(x => x.length > 0);
}

// ---------------- Tag input ----------------
function TagInput({
  value, onChange, placeholder,
}: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [text, setText] = useState("");
  const commit = () => {
    const t = text.trim();
    if (!t) return;
    if (value.includes(t)) { setText(""); return; }
    onChange([...value, t]);
    setText("");
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 min-h-10">
      {value.map((v, i) => (
        <Badge key={i} variant="secondary" className="gap-1 py-0.5">
          <span className="font-mono text-xs">{v}</span>
          <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="hover:text-destructive">
            <X className="w-3 h-3" />
          </button>
        </Badge>
      ))}
      <input
        className="flex-1 min-w-[120px] bg-transparent outline-none text-sm py-0.5"
        placeholder={placeholder}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); commit(); }
          else if (e.key === "Backspace" && !text && value.length) { onChange(value.slice(0, -1)); }
        }}
        onBlur={commit}
      />
    </div>
  );
}

// ---------------- Pattern edit dialog ----------------
const QUOTE_TYPE_PRESETS = [
  { value: "bnp_quote", label: "bnp_quote" },
  { value: "food_quote", label: "food_quote" },
];

function PatternDialog({
  open, initial, onClose, onSave,
}: {
  open: boolean;
  initial: PatternForm | null;
  onClose: () => void;
  onSave: (form: PatternForm) => void;
}) {
  const [name, setName] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [prefixes, setPrefixes] = useState<string[]>([]);
  const [hasSuffix, setHasSuffix] = useState(false);
  const [quoteTypeMode, setQuoteTypeMode] = useState<"preset" | "custom">("preset");
  const [quoteTypePreset, setQuoteTypePreset] = useState("bnp_quote");
  const [quoteTypeCustom, setQuoteTypeCustom] = useState("");

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setName(initial.name);
      setEnabled(initial.enabled);
      setPrefixes(initial.prefixes);
      setHasSuffix(initial.hasSuffix);
      const preset = QUOTE_TYPE_PRESETS.find(p => p.value === initial.quoteType);
      if (preset) { setQuoteTypeMode("preset"); setQuoteTypePreset(preset.value); setQuoteTypeCustom(""); }
      else { setQuoteTypeMode("custom"); setQuoteTypeCustom(initial.quoteType || ""); setQuoteTypePreset("bnp_quote"); }
    } else {
      setName(""); setEnabled(true); setPrefixes([]); setHasSuffix(false);
      setQuoteTypeMode("preset"); setQuoteTypePreset("bnp_quote"); setQuoteTypeCustom("");
    }
  }, [open, initial]);

  const quoteType = quoteTypeMode === "preset" ? quoteTypePreset : quoteTypeCustom.trim();
  const errors: string[] = [];
  if (!name.trim()) errors.push("ต้องระบุชื่อ");
  if (prefixes.length === 0) errors.push("ต้องมีคำนำหน้าอย่างน้อย 1 รายการ");
  if (!quoteType) errors.push("quoteType ต้องไม่ว่าง");
  if (/\s/.test(quoteType)) errors.push("quoteType ต้องไม่มีช่องว่าง");

  const previewRegex = useMemo(() => {
    if (prefixes.length === 0) return "";
    try { return buildPatternRegex({ name: "x", enabled: true, prefixes, hasSuffix, quoteType: "x" }); }
    catch { return ""; }
  }, [prefixes, hasSuffix]);

  const submit = () => {
    if (errors.length) return;
    onSave({ name: name.trim(), enabled, prefixes, hasSuffix, quoteType });
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "แก้ไข pattern" : "เพิ่ม pattern ใหม่"}</DialogTitle>
          <DialogDescription className="text-xs">
            ระบบจะสร้าง regex ให้อัตโนมัติ — คุณกำหนดแค่คำนำหน้าและว่าเลขท้ายมีหรือไม่
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>ชื่อ pattern</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="เช่น BNP Quote" />
          </div>

          <div className="space-y-1.5">
            <Label>คำนำหน้าไฟล์ (กด Enter เพื่อเพิ่ม)</Label>
            <TagInput value={prefixes} onChange={setPrefixes} placeholder="เช่น BNP-N, BNP-V" />
            <p className="text-[11px] text-muted-foreground">รองรับหลายค่า — แต่ละคำนำหน้าจะถูกจับแยกกัน</p>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
            <div>
              <div className="text-sm font-medium">ลงท้ายด้วยลำดับตัวเลข (เช่น -1, -02)</div>
              <div className="text-[11px] text-muted-foreground">เปิดถ้าชื่อไฟล์มีรูปแบบ H-N256801-1</div>
            </div>
            <Switch checked={hasSuffix} onCheckedChange={setHasSuffix} />
          </div>

          <div className="space-y-1.5">
            <Label>ประเภทใบเสนอราคา (quoteType)</Label>
            <div className="flex gap-2">
              <Select value={quoteTypeMode} onValueChange={v => setQuoteTypeMode(v as any)}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="preset">Preset</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
              {quoteTypeMode === "preset" ? (
                <Select value={quoteTypePreset} onValueChange={setQuoteTypePreset}>
                  <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {QUOTE_TYPE_PRESETS.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  className="flex-1 font-mono"
                  value={quoteTypeCustom}
                  onChange={e => setQuoteTypeCustom(e.target.value)}
                  placeholder="เช่น catering_quote"
                />
              )}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
            <div className="text-sm font-medium">เปิดใช้งาน pattern นี้</div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>

          {previewRegex && (
            <div className="rounded-md bg-muted/40 px-3 py-2">
              <div className="text-[11px] text-muted-foreground mb-1">Regex ที่จะบันทึก</div>
              <code className="text-xs font-mono break-all">{previewRegex}</code>
            </div>
          )}

          {errors.length > 0 && (
            <ul className="space-y-0.5 text-xs text-destructive">
              {errors.map((e, i) => <li key={i} className="flex items-start gap-1"><AlertTriangle className="w-3 h-3 mt-0.5"/>{e}</li>)}
            </ul>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ยกเลิก</Button>
          <Button onClick={submit} disabled={errors.length > 0}>บันทึก</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Main page ----------------

type PatternEntry = {
  key: number;
  raw: QuotationConfig["patterns"][number]; // original
  form: PatternForm | null; // null = custom (advanced) — read-only
};

let entryCounter = 0;
const rawToEntry = (raw: QuotationConfig["patterns"][number]): PatternEntry => {
  const parsed = parsePatternRegex(raw.regex);
  return {
    key: ++entryCounter,
    raw,
    form: parsed
      ? { name: raw.name, enabled: raw.enabled, prefixes: parsed.prefixes, hasSuffix: parsed.hasSuffix, quoteType: raw.quoteType || "" }
      : null,
  };
};

export default function QuotationSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [backdate, setBackdate] = useState(7);
  const [refPrefixes, setRefPrefixes] = useState<string[]>([]);
  const [entries, setEntries] = useState<PatternEntry[]>([]);
  // preserved (ซ่อนจาก UI)
  const [preservedDatePrefix, setPreservedDatePrefix] = useState<QuotationConfig["datePrefix"]>(DEFAULT_QUOTATION_CONFIG.datePrefix);
  const [preservedAllowCompleted, setPreservedAllowCompleted] = useState<boolean>(DEFAULT_QUOTATION_CONFIG.allowCompletedToPendingConfirm);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editKey, setEditKey] = useState<number | null>(null);
  const [testName, setTestName] = useState("");

  // dirty tracking
  const [initialSnapshot, setInitialSnapshot] = useState<string>("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("app_settings").select("quotation_auto_detection").limit(1).maybeSingle();
      const raw = (data as any)?.quotation_auto_detection;
      const v = validateQuotationConfig(raw);
      const cfg = v.ok ? v.config : DEFAULT_QUOTATION_CONFIG;
      applyConfig(cfg, true);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyConfig = (cfg: QuotationConfig, snapshot: boolean) => {
    setEnabled(cfg.enabled);
    setBackdate(cfg.allowedBackdateDays);
    setRefPrefixes(cfg.referenceFilePrefixes || []);
    setEntries(cfg.patterns.map(rawToEntry));
    setPreservedDatePrefix(cfg.datePrefix);
    setPreservedAllowCompleted(cfg.allowCompletedToPendingConfirm);
    if (snapshot) setInitialSnapshot(JSON.stringify(cfg));
  };

  const buildConfig = (): QuotationConfig => ({
    enabled,
    allowedBackdateDays: backdate,
    allowCompletedToPendingConfirm: preservedAllowCompleted,
    patterns: entries.map(e => e.raw),
    datePrefix: preservedDatePrefix,
    referenceFilePrefixes: refPrefixes,
  });

  const currentJson = JSON.stringify(buildConfig());
  const dirty = currentJson !== initialSnapshot;

  const onSavePattern = (form: PatternForm) => {
    try {
      const regex = buildPatternRegex(form);
      const rawPattern = { name: form.name, enabled: form.enabled, regex, quoteType: form.quoteType };
      if (editKey === null) {
        setEntries(prev => [...prev, { key: ++entryCounter, raw: rawPattern, form }]);
      } else {
        setEntries(prev => prev.map(e => e.key === editKey ? { ...e, raw: rawPattern, form } : e));
      }
      setDialogOpen(false);
      setEditKey(null);
    } catch (e: any) {
      toast.error(e.message || "สร้าง regex ไม่สำเร็จ");
    }
  };

  const toggleEntry = (key: number, val: boolean) =>
    setEntries(prev => prev.map(e => e.key === key ? { ...e, raw: { ...e.raw, enabled: val } } : e));

  const deleteEntry = (key: number) => setEntries(prev => prev.filter(e => e.key !== key));

  const saveAll = async () => {
    const cfg = buildConfig();
    const v = validateQuotationConfig(cfg);
    if (!v.ok) { toast.error((v as any).error); return; }
    setSaving(true);
    const { error } = await supabase.from("app_settings").update({ quotation_auto_detection: cfg }).eq("key", "ai_config");
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    invalidateQuotationConfigCache();
    setInitialSnapshot(JSON.stringify(cfg));
    toast.success("บันทึกแล้ว");
  };

  const resetDefault = () => {
    applyConfig(DEFAULT_QUOTATION_CONFIG, false);
    toast.info("โหลดค่าเริ่มต้นแล้ว — กด 'บันทึก' เพื่อยืนยัน");
  };

  // File-name tester
  const testResult = useMemo(() => {
    const name = testName.trim();
    if (!name) return null;
    if (refPrefixes.some(p => p && name.startsWith(p))) {
      return { hit: false, label: "ข้าม — เป็นไฟล์อ้างอิง", tone: "muted" as const };
    }
    for (const e of entries) {
      if (!e.raw.enabled) continue;
      let re: RegExp;
      try { re = new RegExp(e.raw.regex, "i"); } catch { continue; }
      if (re.test(name)) return { hit: true, label: `จับได้: ${e.raw.name} (${e.raw.quoteType || "-"})`, tone: "ok" as const };
    }
    return { hit: false, label: "ไม่ตรง pattern ใดเลย", tone: "warn" as const };
  }, [testName, entries, refPrefixes]);

  const editingEntry = editKey !== null ? entries.find(e => e.key === editKey) : null;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary"><Receipt className="w-5 h-5" /></div>
          <div>
            <h1 className="font-display text-2xl font-semibold">จับใบเสนอราคาอัตโนมัติ</h1>
            <p className="text-sm text-muted-foreground">ตั้งค่ารูปแบบชื่อไฟล์ที่ให้ระบบจับเป็น "ใบเสนอราคาส่งแล้ว" อัตโนมัติ</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={resetDefault} disabled={saving}><RotateCcw className="w-4 h-4"/>คืนค่าเริ่มต้น</Button>
          <Button size="sm" onClick={saveAll} disabled={saving || !dirty}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin"/> : <Save className="w-4 h-4"/>}บันทึก
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center p-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground"/></div>
      ) : (
        <>
          {/* Basic */}
          <Card className="p-6 shadow-soft border-border/60 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">เปิดใช้งานระบบจับอัตโนมัติ</div>
                <div className="text-xs text-muted-foreground">ถ้าปิด ระบบจะไม่เปลี่ยนสถานะลูกค้าเมื่อแอดมินส่งไฟล์</div>
              </div>
              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>อนุญาตวันย้อนหลัง (วัน)</Label>
                <Input
                  type="number" min={0} max={365}
                  value={backdate}
                  onChange={e => setBackdate(Math.max(0, Math.min(365, parseInt(e.target.value) || 0)))}
                />
                <p className="text-[11px] text-muted-foreground">ถ้าวันที่หน้าไฟล์เก่ากว่านี้ ระบบจะถือว่าเป็นใบเก่าและไม่จับ</p>
              </div>
              <div className="space-y-1.5">
                <Label>คำนำหน้าไฟล์อ้างอิง (ข้ามการจับ)</Label>
                <TagInput value={refPrefixes} onChange={setRefPrefixes} placeholder="เช่น OLD-, REF-" />
              </div>
            </div>
          </Card>

          {/* Patterns */}
          <Card className="p-6 shadow-soft border-border/60 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-display text-lg font-semibold">รูปแบบชื่อไฟล์</h2>
                <p className="text-xs text-muted-foreground">ระบบจะจับปี พ.ศ. 4 หลัก + เดือน 2 หลัก ต่อจากคำนำหน้าโดยอัตโนมัติ</p>
              </div>
              <Button size="sm" onClick={() => { setEditKey(null); setDialogOpen(true); }}><Plus className="w-4 h-4"/>เพิ่ม pattern</Button>
            </div>

            {entries.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground border border-dashed rounded-md">
                ยังไม่มี pattern — กด "เพิ่ม pattern"
              </div>
            ) : (
              <div className="space-y-2">
                {entries.map(e => (
                  <div key={e.key} className="flex items-start justify-between gap-3 p-3 rounded-md border border-border/60 bg-card">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{e.raw.name}</span>
                        {e.raw.quoteType && <Badge variant="outline" className="text-[10px] font-mono">{e.raw.quoteType}</Badge>}
                        {!e.form && (
                          <Badge variant="secondary" className="gap-1 text-[10px]"><Lock className="w-2.5 h-2.5"/>Custom (advanced) — read-only</Badge>
                        )}
                      </div>
                      {e.form ? (
                        <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5">
                          <span>คำนำหน้า: <span className="font-mono">{e.form.prefixes.join(", ")}</span></span>
                          <span>ลำดับเลขท้าย: <span className="font-mono">{e.form.hasSuffix ? "มี" : "ไม่มี"}</span></span>
                        </div>
                      ) : (
                        <code className="text-[11px] font-mono text-muted-foreground break-all block">{e.raw.regex}</code>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Switch checked={e.raw.enabled} onCheckedChange={v => toggleEntry(e.key, v)} />
                      {e.form && (
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditKey(e.key); setDialogOpen(true); }}>
                          <Pencil className="w-4 h-4"/>
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteEntry(e.key)}>
                        <Trash2 className="w-4 h-4"/>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Tester */}
          <Card className="p-6 shadow-soft border-border/60 space-y-3">
            <div>
              <h2 className="font-display text-lg font-semibold">ทดสอบชื่อไฟล์</h2>
              <p className="text-xs text-muted-foreground">พิมพ์ชื่อไฟล์เพื่อดูว่าจะถูกจับหรือไม่ (ไม่นับ backdate/วันที่นำหน้า — ทดสอบ pattern เท่านั้น)</p>
            </div>
            <Input
              value={testName}
              onChange={e => setTestName(e.target.value)}
              placeholder="เช่น BNP-N256801, H-N256801-1"
              className="font-mono"
            />
            {testResult && (
              <div className={
                "text-sm rounded-md px-3 py-2 border " + (
                  testResult.tone === "ok" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                  : testResult.tone === "warn" ? "bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-400"
                  : "bg-muted border-border text-muted-foreground"
                )
              }>
                {testResult.label}
              </div>
            )}
          </Card>

          {dirty && (
            <p className="text-xs text-muted-foreground text-right">มีการแก้ไขที่ยังไม่ได้บันทึก</p>
          )}
        </>
      )}

      <PatternDialog
        open={dialogOpen}
        initial={editingEntry?.form ?? null}
        onClose={() => { setDialogOpen(false); setEditKey(null); }}
        onSave={onSavePattern}
      />
    </div>
  );
}
