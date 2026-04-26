import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, Loader2, X, FileText, Paperclip, Film, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type AutoResponse = {
  id: string;
  name: string;
  text: string;
  image_urls: string[];
  file_urls: string[];
  is_active: boolean;
};

function getFileType(url = "") {
  const l = url.toLowerCase();
  if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)/.test(l)) return "image";
  if (/\.(mp4|mov|avi|webm)/.test(l)) return "video";
  if (/\.pdf/.test(l)) return "pdf";
  return "file";
}

function FileThumb({ url, onRemove }: { url: string; onRemove?: () => void }) {
  const t = getFileType(url);
  const name = url.split("/").pop()?.split("?")[0] || "ไฟล์";
  return (
    <div className="relative group w-14 h-14 shrink-0">
      {t === "image" ? (
        <img src={url} alt="" className="w-14 h-14 object-cover rounded-lg border"/>
      ) : t === "video" ? (
        <div className="w-14 h-14 rounded-lg border bg-purple-50 flex flex-col items-center justify-center">
          <Film className="w-5 h-5 text-purple-500"/><span className="text-[8px] text-purple-600">VDO</span>
        </div>
      ) : (
        <div className="w-14 h-14 rounded-lg border bg-blue-50 flex flex-col items-center justify-center">
          <FileText className="w-5 h-5 text-blue-500"/>
          <span className="text-[8px] text-blue-600 truncate max-w-[52px]">{name.slice(-8)}</span>
        </div>
      )}
      {onRemove && (
        <button onClick={onRemove}
          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100">
          <X className="w-2.5 h-2.5"/>
        </button>
      )}
    </div>
  );
}

async function uploadToStorage(file: File): Promise<string | null> {
  const ext = file.name.split(".").pop() || "bin";
  const path = `quick-replies/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from("line-media").upload(path, file, { upsert: false });
  if (error) { toast.error("อัปโหลดไม่สำเร็จ: " + error.message); return null; }
  return supabase.storage.from("line-media").getPublicUrl(path).data.publicUrl;
}

export default function QuickResponsePopup({
  show, onSelect, onClose, filter,
}: {
  show: boolean;
  onSelect: (resp: AutoResponse) => void;
  onClose: () => void;
  filter?: string;
}) {
  const [responses, setResponses] = useState<AutoResponse[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", text: "", image_urls: [] as string[], file_urls: [] as string[] });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (show && !loaded) {
      supabase.from("auto_responses").select("*").eq("is_active", true).order("sort_order").then(({ data }) => {
        setResponses((data as AutoResponse[]) || []);
        setLoaded(true);
      });
    }
  }, [show, loaded]);

  useEffect(() => {
    if (!show) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [show, onClose]);

  const filtered = filter
    ? responses.filter(r => r.name.toLowerCase().includes(filter.toLowerCase()) || r.text.toLowerCase().includes(filter.toLowerCase()))
    : responses;

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    const urls = (await Promise.all(files.map(uploadToStorage))).filter(Boolean) as string[];
    const imgs: string[] = [], others: string[] = [];
    urls.forEach(u => getFileType(u) === "image" ? imgs.push(u) : others.push(u));
    setForm(p => ({ ...p, image_urls: [...p.image_urls, ...imgs], file_urls: [...p.file_urls, ...others] }));
    setUploading(false);
    e.target.value = "";
  };

  const allFiles = [...form.image_urls, ...form.file_urls];
  const removeFile = (u: string) => setForm(p => ({
    ...p, image_urls: p.image_urls.filter(x => x !== u), file_urls: p.file_urls.filter(x => x !== u),
  }));

  const resetForm = () => { setForm({ name: "", text: "", image_urls: [], file_urls: [] }); setShowForm(false); setEditingId(null); };

  const save = async () => {
    if (!form.name.trim() || !form.text.trim()) { toast.error("ต้องกรอกชื่อและข้อความ"); return; }
    setSaving(true);
    if (editingId) {
      await supabase.from("auto_responses").update(form).eq("id", editingId);
      setResponses(p => p.map(r => r.id === editingId ? { ...r, ...form } : r));
      toast.success("อัปเดตแล้ว");
    } else {
      const { data } = await supabase.from("auto_responses").insert({ ...form, is_active: true }).select().single();
      if (data) setResponses(p => [...p, data as AutoResponse]);
      toast.success("บันทึกแล้ว");
    }
    resetForm();
    setSaving(false);
  };

  const edit = (r: AutoResponse) => {
    setEditingId(r.id);
    setForm({ name: r.name, text: r.text, image_urls: r.image_urls || [], file_urls: r.file_urls || [] });
    setShowForm(true);
  };
  const del = async (id: string) => {
    await supabase.from("auto_responses").update({ is_active: false }).eq("id", id);
    setResponses(p => p.filter(r => r.id !== id));
    toast.success("ลบแล้ว");
  };

  if (!show) return null;
  return (
    <div ref={ref} className="absolute bottom-full left-0 right-0 mb-1 mx-3 bg-card border rounded-xl shadow-lg z-50 max-h-80 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-muted/30">
        <div className="flex items-center gap-2"><FileText className="w-4 h-4 text-muted-foreground"/>
          <span className="text-sm font-semibold">ข้อความสำเร็จรูป</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-600 text-white text-xs hover:bg-green-700">
            <Plus className="w-3 h-3"/> เพิ่ม
          </button>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted"><X className="w-4 h-4"/></button>
        </div>
      </div>

      {showForm && (
        <div className="p-3 border-b bg-muted/20 space-y-2">
          <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
            placeholder="ชื่อคำตอบ"
            className="w-full px-3 py-1.5 rounded-lg border bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"/>
          <textarea value={form.text} onChange={e => setForm(p => ({ ...p, text: e.target.value }))}
            placeholder="ข้อความ" rows={2}
            className="w-full px-3 py-1.5 rounded-lg border bg-background text-xs resize-none focus:outline-none focus:ring-2 focus:ring-ring"/>
          {allFiles.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {allFiles.map(u => <FileThumb key={u} url={u} onRemove={() => removeFile(u)}/>)}
            </div>
          )}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs text-muted-foreground hover:bg-muted cursor-pointer">
              {uploading ? <Loader2 className="w-3 h-3 animate-spin"/> : <Paperclip className="w-3 h-3"/>}
              แนบไฟล์
              <input type="file" accept="image/*,video/*,.pdf,.doc,.docx" multiple onChange={onUpload} className="hidden"/>
            </label>
            <div className="flex-1"/>
            <button onClick={resetForm} className="px-3 py-1 rounded-lg text-xs text-muted-foreground hover:bg-muted">ยกเลิก</button>
            <button onClick={save} disabled={saving || !form.name.trim() || !form.text.trim()}
              className="px-3 py-1 rounded-lg bg-green-600 text-white text-xs hover:bg-green-700 disabled:opacity-50 flex items-center gap-1">
              {saving && <Loader2 className="w-3 h-3 animate-spin"/>}{editingId ? "อัปเดต" : "บันทึก"}
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            {filter ? "ไม่พบคำตอบ" : "ยังไม่มีข้อความสำเร็จรูป"}
          </div>
        ) : filtered.map(r => {
          const all = [...(r.image_urls || []), ...(r.file_urls || [])];
          return (
            <div key={r.id} className="px-3 py-2 border-b hover:bg-muted/30 group">
              <div className="flex items-start gap-2">
                <button onClick={() => onSelect(r)} className="flex-1 text-left min-w-0">
                  <div className="text-xs font-medium truncate">{r.name}</div>
                  <div className="text-[11px] text-muted-foreground line-clamp-2">{r.text}</div>
                </button>
                <button onClick={() => edit(r)} className="p-1 opacity-0 group-hover:opacity-100 hover:bg-muted rounded">
                  <Pencil className="w-3 h-3 text-muted-foreground"/>
                </button>
                <button onClick={() => del(r.id)} className="p-1 opacity-0 group-hover:opacity-100 hover:bg-destructive/10 rounded">
                  <Trash2 className="w-3 h-3 text-destructive"/>
                </button>
              </div>
              {all.length > 0 && (
                <div className="flex gap-1 mt-1.5">{all.slice(0, 4).map(u => <FileThumb key={u} url={u}/>)}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
