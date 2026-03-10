import { useState } from "react";
import { X, Download, Loader2 } from "lucide-react";

export default function ImagePreviewModal({ url, onClose }) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const name = url.split("/").pop().split("?")[0] || "image.jpg";
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    } catch {
      window.open(url, "_blank");
    }
    setDownloading(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div className="relative max-w-[90vw] max-h-[90vh] flex flex-col items-center" onClick={e => e.stopPropagation()}>
        <div className="absolute top-2 right-2 flex gap-2 z-10">
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="p-2 rounded-full bg-white/90 hover:bg-white shadow text-gray-700 transition-colors"
            title="ดาวน์โหลด"
          >
            {downloading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
          </button>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/90 hover:bg-white shadow text-gray-700 transition-colors"
            title="ปิด"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <img
          src={url}
          alt="พรีวิว"
          className="max-w-[90vw] max-h-[85vh] rounded-lg object-contain shadow-2xl"
        />
      </div>
    </div>
  );
}