import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, X, Upload, GripVertical } from "lucide-react";
import { toast } from "sonner";

const LINE_IMAGE_MAX = 10 * 1024 * 1024; // 10MB

async function uploadImg(file: File): Promise<string | null> {
  if (file.size > LINE_IMAGE_MAX) {
    toast.error(`"${file.name}" ใหญ่เกิน 10MB ส่ง LINE ไม่ได้`);
    return null;
  }
  const ext = file.name.split(".").pop() || "jpg";
  const path = `knowledge/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { error } = await supabase.storage.from("line-media").upload(path, file, { upsert: false });
  if (error) { toast.error("อัปโหลดไม่สำเร็จ: " + error.message); return null; }
  return supabase.storage.from("line-media").getPublicUrl(path).data.publicUrl;
}

export default function ImageUrlsField({ urls, onChange }: { urls: string[]; onChange: (v: string[]) => void }) {
  const [u, setU] = useState("");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragIdx = useRef<number | null>(null);

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    const newUrls = (await Promise.all(files.map(uploadImg))).filter(Boolean) as string[];
    onChange([...urls, ...newUrls]);
    setUploading(false);
    e.target.value = "";
  };

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= urls.length) return;
    const next = [...urls];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input placeholder="วาง URL หรือใช้ปุ่มอัปโหลด →" value={u}
          onChange={e => setU(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && u.trim()) { onChange([...urls, u.trim()]); setU(""); } }}/>
        <Button type="button" variant="outline" size="icon"
          onClick={() => { if (u.trim()) { onChange([...urls, u.trim()]); setU(""); } }}>
          <Plus className="w-4 h-4"/>
        </Button>
        <input ref={fileRef} type="file" accept="image/*" multiple onChange={handleFiles} className="hidden"/>
        <Button type="button" variant="outline" size="icon" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Upload className="w-4 h-4"/>}
        </Button>
      </div>
      {urls.length > 1 && <p className="text-[11px] text-muted-foreground">ลากเพื่อจัดลำดับ — AI จะส่งรูปตามลำดับนี้ให้ลูกค้า</p>}
      <div className="flex flex-wrap gap-2">
        {urls.map((url, i) => (
          <div key={url + i}
            draggable
            onDragStart={() => { dragIdx.current = i; }}
            onDragOver={e => e.preventDefault()}
            onDrop={() => { if (dragIdx.current != null) move(dragIdx.current, i); dragIdx.current = null; }}
            className="relative group w-20 h-20 rounded-lg overflow-hidden border bg-muted cursor-move">
            <img src={url} alt="" className="w-full h-full object-cover"/>
            <div className="absolute top-1 left-1 px-1 rounded bg-black/60 text-white text-[9px] flex items-center gap-0.5">
              <GripVertical className="w-2.5 h-2.5"/>{i + 1}
            </div>
            <button type="button" onClick={() => onChange(urls.filter((_, j) => j !== i))}
              className="absolute top-1 right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100">
              <X className="w-3 h-3"/>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
