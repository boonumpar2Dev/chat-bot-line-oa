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

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    const newUrls = (await Promise.all(files.map(uploadImg))).filter(Boolean) as string[];
    onChange([...urls, ...newUrls]);
    setUploading(false);
    e.target.value = "";
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
      <div className="flex flex-wrap gap-2">
        {urls.map((url, i) => (
          <div key={i} className="relative group w-20 h-20 rounded-lg overflow-hidden border bg-muted">
            <img src={url} alt="" className="w-full h-full object-cover"/>
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
