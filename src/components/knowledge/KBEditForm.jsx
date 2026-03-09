import { useState } from "react";
import { Trash2, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

const MAX_CONTENT = 5000;

export default function KBEditForm({ item, onSaved, onDeleted, onCancel }) {
  const [title, setTitle] = useState(item.title);
  const [content, setContent] = useState(item.content || "");
  const [fileUrl, setFileUrl] = useState(item.file_url || "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    setFileUrl(file_url);
    toast.success("อัพโหลดสำเร็จ");
    setUploading(false);
  };

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await base44.entities.KnowledgeBase.update(item.id, {
      title, content, file_url: fileUrl || null, status: "active"
    });
    toast.success("บันทึกสำเร็จ");
    onSaved();
    setSaving(false);
  };

  const handleDelete = async () => {
    setDeleting(true);
    await base44.entities.KnowledgeBase.delete(item.id);
    toast.success("ลบสำเร็จ");
    onDeleted();
    setDeleting(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium text-foreground">ชื่อ</label>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
          className="w-full mt-1 px-3 py-2.5 rounded-lg border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
      </div>
      <div>
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-foreground">รายละเอียด</label>
          <span className="text-xs text-muted-foreground">{content.length}/{MAX_CONTENT}</span>
        </div>
        <textarea value={content} onChange={(e) => { if (e.target.value.length <= MAX_CONTENT) setContent(e.target.value); }}
          rows={10} className="w-full mt-1 px-3 py-2.5 rounded-lg border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
      </div>

      {fileUrl && (
        <div className="relative inline-block">
          <img src={fileUrl} alt="KB attachment" className="max-h-40 rounded-lg border border-input" />
          <button onClick={() => setFileUrl("")}
            className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center text-xs">×</button>
        </div>
      )}

      <div>
        <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-input text-sm text-muted-foreground hover:bg-muted transition-colors cursor-pointer w-fit">
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>🖼</span>}
          เพิ่มรูปภาพ
          <input type="file" accept="image/*,.pdf,.doc,.docx,.txt" onChange={handleUpload} className="hidden" />
        </label>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-border">
        <button onClick={handleDelete} disabled={deleting}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-500 hover:bg-red-50 transition-colors">
          {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} ลบข้อมูล
        </button>
        <div className="flex gap-2">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors">ยกเลิก</button>
          <button onClick={handleSave} disabled={saving || !title.trim()}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} บันทึก
          </button>
        </div>
      </div>
    </div>
  );
}