import { X, Download } from "lucide-react";
import { useEffect } from "react";

export default function ImagePreviewModal({ url, onClose }: { url: string | null; onClose: () => void }) {
  useEffect(() => {
    if (!url) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [url, onClose]);

  if (!url) return null;
  return (
    <div className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute top-3 right-3 flex gap-2">
        <a href={url} download target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
          className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20"><Download className="w-5 h-5"/></a>
        <button onClick={onClose} className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20">
          <X className="w-5 h-5"/>
        </button>
      </div>
      <img src={url} alt="" className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg" onClick={e => e.stopPropagation()}/>
    </div>
  );
}
