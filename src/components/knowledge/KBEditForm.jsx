import { useState } from "react";
import { Trash2, Loader2, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

const MAX_CONTENT = 5000;

export default function KBEditForm({ item, onSaved, onDeleted, onCancel }) {
  const [title, setTitle] = useState(item.title);
  const [content, setContent] = useState(item.content || "");
  // Merge legacy file_url + image_urls array
  const initImages = () => {
    const arr = Array.isArray(item.image_urls) ? [...item.image_urls] : [];
    if (item.file_url && !arr.includes(item.file_url)) arr.unshift(item.file_url);
    return arr;
  };
  const [imageUrls, setImageUrls] = useState(initImages);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    const results = await Promise.all(files.map(f => base44.integrations.Core.UploadFile({ file: f })));
    const newUrls = results.map(r => r.file_url).filter(Boolean);
    setImageUrls(prev => [...prev, ...newUrls]);
    toast.success(`อัพโหลด ${newUrls.length} รูปสำเร็จ`);
    setUploading(false);
    e.target.value = "";
  };

  const removeImage = (url) => setImageUrls(prev => prev.filter(u => u !== url));

  const handleSave = async () => {
    if (!title.trim()) return;
    setSaving(true);
    await base44.entities.KnowledgeBase.update(item.id, {
      title, content,
      image_urls: imageUrls,
      file_url: imageUrls[0] || null,
      status: "active"
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

      {/* Image thumbnails - compact */}
      {imageUrls.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {imageUrls.map((url, i) => (
            <div key={url} className="relative group w-14 h-14 shrink-0">
              <img src={url} alt={`รูป ${i + 1}`} className="w-14 h-14 object-cover rounded-lg border border-input" />
              <button
                onClick={() => removeImage(url)}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload button */}
      <div>
        <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-input text-sm text-muted-foreground hover:bg-muted transition-colors cursor-pointer w-fit">
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <span>🖼</span>}
          เพิ่มรูปภาพ {imageUrls.length > 0 && <span className="text-xs text-muted-foreground">({imageUrls.length} รูป)</span>}
          <input type="file" accept="image/*" multiple onChange={handleUpload} className="hidden" />
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