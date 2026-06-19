import { X, Film, Loader2, Download } from "lucide-react";

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

type Item = { url: string; uploading?: boolean; name?: string; size?: number };

function formatBytes(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getExtension(name = "") {
  const ext = name.split(".").pop()?.trim();
  if (!ext || ext === name) return "FILE";
  return ext.toUpperCase().slice(0, 5);
}

export default function StagedMessageBar({ items, onRemoveFile, onClearAll }:
  { items: Item[]; onRemoveFile: (url: string) => void; onClearAll: () => void }) {
  if (!items?.length) return null;
  return (
    <div className="px-4 py-2 border-b bg-amber-50/60 flex items-center gap-2">
      <div className="flex items-center gap-2 flex-1 overflow-x-auto pb-1">
        {items.map(({ url, uploading, name: itemName, size }) => {
          const t = getFileType(url, itemName);
          const name = itemName || url.split("/").pop()?.split("?")[0] || "ไฟล์";
          const sizeText = formatBytes(size);
          const ext = getExtension(name);
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
                <div className="w-[304px] max-w-[72vw] rounded-lg border border-border bg-background p-3 shadow-sm">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary/10">
                      <span className="max-w-[42px] truncate text-xs font-bold text-primary" title={ext}>{ext}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="line-clamp-2 break-all text-sm font-semibold leading-5 text-foreground" title={name}>{name}</div>
                      {sizeText && <div className="mt-0.5 truncate text-xs text-muted-foreground">{sizeText}</div>}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => !uploading && !isPending && window.open(url, "_blank", "noopener,noreferrer")}
                    disabled={uploading || isPending}
                    className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:cursor-wait disabled:opacity-70"
                  >
                    {uploading || isPending ? <Loader2 className="h-4 w-4 animate-spin"/> : <Download className="h-4 w-4"/>}
                    {uploading || isPending ? "กำลังอัปโหลด" : "ดาวน์โหลดไฟล์"}
                  </button>
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
