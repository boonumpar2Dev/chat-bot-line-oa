import { useState } from "react";
import { Github, Download, Loader2, CheckCircle, X, ChevronDown, ChevronUp } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function KBGithubImport({ onImported }) {
  const [open, setOpen] = useState(false);
  const [owner, setOwner] = useState("");
  const [repo, setRepo] = useState("");
  const [path, setPath] = useState("");
  const [maxFiles, setMaxFiles] = useState(20);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleImport = async () => {
    if (!owner.trim() || !repo.trim()) {
      toast.error("กรุณากรอก Owner และ Repository");
      return;
    }
    setLoading(true);
    setResult(null);
    const res = await base44.functions.invoke("importFromGithub", {
      owner: owner.trim(),
      repo: repo.trim(),
      path: path.trim(),
      maxFiles,
    });
    setResult(res.data);
    toast.success(`นำเข้าสำเร็จ ${res.data.imported} ไฟล์`);
    onImported?.();
    setLoading(false);
  };

  return (
    <div className="border border-input rounded-xl bg-card overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Github className="w-4 h-4" />
          นำเข้าจาก GitHub Repository
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-3 border-t border-input">
          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <label className="text-xs text-muted-foreground">Owner / Organization</label>
              <input
                type="text" value={owner} onChange={(e) => setOwner(e.target.value)}
                placeholder="เช่น octocat"
                className="w-full mt-1 px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Repository</label>
              <input
                type="text" value={repo} onChange={(e) => setRepo(e.target.value)}
                placeholder="เช่น my-repo"
                className="w-full mt-1 px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Path (ไม่บังคับ — ระบุโฟลเดอร์ย่อยได้)</label>
            <input
              type="text" value={path} onChange={(e) => setPath(e.target.value)}
              placeholder="เช่น docs หรือ src/data"
              className="w-full mt-1 px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">จำนวนไฟล์สูงสุด: {maxFiles}</label>
            <input type="range" min="1" max="50" value={maxFiles} onChange={(e) => setMaxFiles(Number(e.target.value))}
              className="w-full mt-1 accent-green-600" />
          </div>

          {result && (
            <div className="flex items-center gap-2 px-3 py-2 bg-green-50 rounded-lg text-sm text-green-700">
              <CheckCircle className="w-4 h-4 shrink-0" />
              นำเข้าสำเร็จ {result.imported} ไฟล์
            </div>
          )}

          <button
            onClick={handleImport}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {loading ? "กำลังนำเข้า..." : "นำเข้าไฟล์"}
          </button>
        </div>
      )}
    </div>
  );
}