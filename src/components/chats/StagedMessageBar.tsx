import { X, FileText, Film, Loader2 } from "lucide-react";

function getFileType(url = "", name = "") {
  const l = (name || url).toLowerCase();
  if (/\.(jpg|jpeg|png|gif|webp|bmp|svg|heic)/.test(l)) return "image";
  if (/\.(mp4|mov|avi|webm|mkv)/.test(l)) return "video";
  // For blob/pending URLs without extension, infer from name fallback
  if (url.startsWith("blob:") || url.startsWith("pending:")) {
    if (/\.(jpg|jpeg|png|gif|webp|bmp|svg|heic)$/.test(l)) return "image";
    if (/\.(mp4|mov|avi|webm|mkv)$/.test(l)) return "video";
  }
  return "file";
}

type Item = { url: string; uploading?: boolean; name?: string };

export default function StagedMessageBar({ items, onRemoveFile, onClearAll }:
  { items: Item[]; onRemoveFile: (url: string) => void; onClearAll: () => void }) {
  if (!items?.length) return null;
  return (
    <div className="px-4 py-2 border-b bg-amber-50/60 flex items-center gap-2">
      <div className="flex items-center gap-1.5 flex-1 overflow-x-auto">
        {items.map(({ url, uploading, name: itemName }) => {
          const t = getFileType(url, itemName);
          const name = itemName || url.split("/").pop()?.split("?")[0] || "ไฟล์";
          const isPending = url.startsWith("pending:");
          return (
            <div key={url} className="relative group shrink-0">
              {t === "image" && !isPending ? (
                <img src={url} alt="" className="w-12 h-12 object-cover rounded-lg border border-amber-200"/>
              ) : t === "video" ? (
                <div className="w-12 h-12 rounded-lg border border-amber-200 bg-purple-50 flex flex-col items-center justify-center">
                  <Film className="w-4 h-4 text-purple-500"/><span className="text-[7px] text-purple-600">VDO</span>
                </div>
              ) : (
                <div className="w-12 h-12 rounded-lg border border-amber-200 bg-blue-50 flex flex-col items-center justify-center">
                  <FileText className="w-4 h-4 text-blue-500"/>
                  <span className="text-[7px] text-blue-600 truncate max-w-[44px]">{name.slice(-6)}</span>
                </div>
              )}
              {uploading && (
                <div className="absolute inset-0 rounded-lg bg-black/40 flex items-center justify-center">
                  <Loader2 className="w-4 h-4 text-white animate-spin"/>
                </div>
              )}
              <button onClick={() => onRemoveFile(url)}
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                <X className="w-2.5 h-2.5"/>
              </button>
            </div>
          );
        })}
      </div>
      <button onClick={onClearAll}
        className="text-[10px] text-red-500 hover:text-red-700 shrink-0 px-2 py-1 rounded hover:bg-red-50">
        ล้างทั้งหมด
      </button>
    </div>
  );
}
