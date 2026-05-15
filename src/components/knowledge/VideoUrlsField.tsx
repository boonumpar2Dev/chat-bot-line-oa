import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, X, Play, GripVertical } from "lucide-react";
import { toast } from "sonner";

export type VideoItem = { url: string; thumb_url: string };

const LINE_VIDEO_MAX = 200 * 1024 * 1024; // 200MB

async function captureThumb(file: File): Promise<Blob | null> {
  return new Promise((resolve) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.playsInline = true;
    v.src = URL.createObjectURL(file);
    v.onloadedmetadata = () => {
      // ไป frame ที่ ~0.5s (หรือกลางคลิปถ้าสั้นกว่า)
      v.currentTime = Math.min(0.5, (v.duration || 1) / 2);
    };
    v.onseeked = () => {
      const c = document.createElement("canvas");
      const w = v.videoWidth || 640, h = v.videoHeight || 360;
      const scale = Math.min(1, 720 / Math.max(w, h));
      c.width = Math.round(w * scale); c.height = Math.round(h * scale);
      c.getContext("2d")!.drawImage(v, 0, 0, c.width, c.height);
      c.toBlob((b) => { URL.revokeObjectURL(v.src); resolve(b); }, "image/jpeg", 0.85);
    };
    v.onerror = () => { URL.revokeObjectURL(v.src); resolve(null); };
  });
}

async function uploadVideo(file: File): Promise<VideoItem | null> {
  if (file.size > LINE_VIDEO_MAX) {
    toast.error(`"${file.name}" ใหญ่เกิน 200MB ส่ง LINE ไม่ได้`);
    return null;
  }
  const thumbBlob = await captureThumb(file);
  if (!thumbBlob) { toast.error("ดึงเฟรมตัวอย่างไม่สำเร็จ"); return null; }

  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const ext = file.name.split(".").pop() || "mp4";
  const vidPath = `knowledge-videos/${stamp}.${ext}`;
  const thumbPath = `knowledge-videos/${stamp}.jpg`;

  const v = await supabase.storage.from("line-media").upload(vidPath, file, { contentType: file.type || "video/mp4", upsert: false });
  if (v.error) { toast.error("อัปวิดีโอไม่สำเร็จ: " + v.error.message); return null; }
  const t = await supabase.storage.from("line-media").upload(thumbPath, thumbBlob, { contentType: "image/jpeg", upsert: false });
  if (t.error) { toast.error("อัปรูป preview ไม่สำเร็จ: " + t.error.message); return null; }

  return {
    url: supabase.storage.from("line-media").getPublicUrl(vidPath).data.publicUrl,
    thumb_url: supabase.storage.from("line-media").getPublicUrl(thumbPath).data.publicUrl,
  };
}

export default function VideoUrlsField({ videos, onChange }: { videos: VideoItem[]; onChange: (v: VideoItem[]) => void }) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragIdx = useRef<number | null>(null);

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true); setProgress(0);
    const out: VideoItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const item = await uploadVideo(files[i]);
      if (item) out.push(item);
      setProgress(Math.round(((i + 1) / files.length) * 100));
    }
    onChange([...videos, ...out]);
    setUploading(false); setProgress(0);
    e.target.value = "";
  };

  const move = (from: number, to: number) => {
    if (from === to || to < 0 || to >= videos.length) return;
    const next = [...videos];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-center">
        <input ref={fileRef} type="file" accept="video/mp4,video/quicktime,video/webm" multiple onChange={handleFiles} className="hidden"/>
        <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="w-4 h-4 animate-spin"/> : <Upload className="w-4 h-4"/>}
          {uploading ? `กำลังอัป ${progress}%` : "อัปโหลดวิดีโอ"}
        </Button>
        <span className="text-xs text-muted-foreground">mp4/mov/webm • สูงสุด 200MB (LINE limit)</span>
      </div>
      {videos.length > 0 && (
        <p className="text-[11px] text-muted-foreground">ลากการ์ดเพื่อจัดลำดับ — ลำดับนี้คือลำดับที่ AI จะส่งให้ลูกค้า</p>
      )}
      <div className="flex flex-wrap gap-2">
        {videos.map((v, i) => (
          <div
            key={v.url}
            draggable
            onDragStart={() => { dragIdx.current = i; }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => { if (dragIdx.current != null) move(dragIdx.current, i); dragIdx.current = null; }}
            className="relative group w-24 h-24 rounded-lg overflow-hidden border bg-muted cursor-move"
          >
            <img src={v.thumb_url} alt="" className="w-full h-full object-cover"/>
            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
              <Play className="w-7 h-7 text-white drop-shadow" fill="white"/>
            </div>
            <div className="absolute top-1 left-1 px-1 rounded bg-black/60 text-white text-[9px] flex items-center gap-0.5">
              <GripVertical className="w-2.5 h-2.5"/>{i + 1}
            </div>
            <a href={v.url} target="_blank" rel="noreferrer"
              className="absolute bottom-1 left-1 px-1 rounded bg-black/60 text-white text-[9px]">เปิด</a>
            <button type="button" onClick={() => onChange(videos.filter((_, j) => j !== i))}
              className="absolute top-1 right-1 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100">
              <X className="w-3 h-3"/>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
