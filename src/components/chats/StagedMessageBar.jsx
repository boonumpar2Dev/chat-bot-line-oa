import { X, FileText, Film, Image } from "lucide-react";

function getFileType(url = "") {
  const l = url.toLowerCase();
  if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)/.test(l)) return "image";
  if (/\.(mp4|mov|avi|webm)/.test(l)) return "video";
  return "file";
}

export default function StagedMessageBar({ files, onRemoveFile, onClearAll }) {
  if (!files || files.length === 0) return null;

  return (
    <div className="px-4 py-2 border-b border-border bg-amber-50/60 flex items-center gap-2">
      <div className="flex items-center gap-1.5 flex-1 overflow-x-auto">
        {files.map((url, i) => {
          const type = getFileType(url);
          const name = url.split("/").pop().split("?")[0] || "ไฟล์";
          return (
            <div key={url} className="relative group shrink-0">
              {type === "image" ? (
                <img src={url} alt="" className="w-12 h-12 object-cover rounded-lg border border-amber-200" />
              ) : type === "video" ? (
                <div className="w-12 h-12 rounded-lg border border-amber-200 bg-purple-50 flex flex-col items-center justify-center">
                  <Film className="w-4 h-4 text-purple-500" />
                  <span className="text-[7px] text-purple-600">VDO</span>
                </div>
              ) : (
                <div className="w-12 h-12 rounded-lg border border-amber-200 bg-blue-50 flex flex-col items-center justify-center">
                  <FileText className="w-4 h-4 text-blue-500" />
                  <span className="text-[7px] text-blue-600 truncate max-w-[44px]">{name.slice(-6)}</span>
                </div>
              )}
              <button
                onClick={() => onRemoveFile(url)}
                className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          );
        })}
      </div>
      <button
        onClick={onClearAll}
        className="text-[10px] text-red-500 hover:text-red-700 shrink-0 px-2 py-1 rounded hover:bg-red-50"
      >
        ล้างทั้งหมด
      </button>
    </div>
  );
}