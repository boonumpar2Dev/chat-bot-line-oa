import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, X, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";

export default function TierImageField({ url, onChange }: { url?: string | null; onChange: (v: string | null) => void }) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    setUploading(true);
    const ext = f.name.split(".").pop() || "jpg";
    const path = `knowledge/tier-${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error } = await supabase.storage.from("line-media").upload(path, f, { upsert: false });
    if (error) toast.error("อัปโหลดไม่สำเร็จ: " + error.message);
    else onChange(supabase.storage.from("line-media").getPublicUrl(path).data.publicUrl);
    setUploading(false);
    e.target.value = "";
  };

  if (url) {
    return (
      <div className="relative group w-12 h-12 rounded border bg-muted overflow-hidden">
        <img src={url} alt="" className="w-full h-full object-cover"/>
        <button type="button" onClick={() => onChange(null)}
          className="absolute top-0 right-0 w-4 h-4 rounded-bl bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100">
          <X className="w-3 h-3"/>
        </button>
      </div>
    );
  }
  return (
    <>
      <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} className="hidden"/>
      <Button type="button" variant="outline" size="icon" className="w-12 h-12"
        onClick={() => fileRef.current?.click()} disabled={uploading} title="อัปโหลดรูปประจำ tier">
        {uploading ? <Loader2 className="w-4 h-4 animate-spin"/> : <ImageIcon className="w-4 h-4 text-muted-foreground"/>}
      </Button>
    </>
  );
}
