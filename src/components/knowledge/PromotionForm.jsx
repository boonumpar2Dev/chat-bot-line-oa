import { useState } from "react";
import { Trash2, Loader2, X, Image as ImageIcon, Save } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function PromotionForm({ item, categories, onSaved, onDeleted, onCancel }) {
  const [name, setName] = useState(item?.name || "");
  const [description, setDescription] = useState(item?.description || "");
  const [applicableCategories, setApplicableCategories] = useState(item?.applicable_categories || []);
  const [imageUrls, setImageUrls] = useState(item?.image_urls || []);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);

  const catList = categories || [];

  const toggleCategory = (catName) => {
    setApplicableCategories(prev =>
      prev.includes(catName) ? prev.filter(c => c !== catName) : [...prev, catName]
    );
  };

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    const results = await Promise.all(files.map(f => base44.integrations.Core.UploadFile({ file: f })));
    setImageUrls(prev => [...prev, ...results.map(r => r.file_url).filter(Boolean)]);
    setUploading(false);
    e.target.value = "";
  };

  const handleSave = async () => {
    if (!name.trim()) { toast.error("ต้องกรอกชื่อโปรโมชั่น"); return; }
    setSaving(true);
    const data = { name, description, applicable_categories: applicableCategories, image_urls: imageUrls, is_active: true };
    if (item?.id) {
      await base44.entities.Promotion.update(item.id, data);
    } else {
      await base44.entities.Promotion.create(data);
    }
    toast.success("บันทึกโปรโมชั่นสำเร็จ");
    setSaving(false);
    onSaved();
  };

  const handleDelete = async () => {
    if (!item?.id) return;
    setDeleting(true);
    await base44.entities.Promotion.delete(item.id);
    toast.success("ลบโปรโมชั่นสำเร็จ");
    setDeleting(false);
    onDeleted();
  };

  return (
    <div className="space-y-5">
      <div>
        <label className="text-sm font-medium text-foreground">ชื่อโปรโมชั่น</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)}
          placeholder="เช่น ส่วนลด 10% งานบุญเดือนเมษายน"
          className="w-full mt-1 px-3 py-2.5 rounded-lg border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
      </div>

      <div>
        <label className="text-sm font-medium text-foreground">รายละเอียด</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)}
          placeholder="รายละเอียดโปรโมชั่น เงื่อนไข ส่วนลด ของแถม ฯลฯ"
          rows={5}
          className="w-full mt-1 px-3 py-2.5 rounded-lg border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
      </div>

      {/* Applicable Categories */}
      <div>
        <label className="text-sm font-medium text-foreground">ใช้กับประเภทแพ็กเกจ</label>
        <p className="text-xs text-muted-foreground mt-0.5 mb-2">เลือกประเภทที่โปรโมชั่นนี้ใช้ได้ (ไม่เลือก = ใช้ได้ทุกประเภท)</p>
        <div className="flex flex-wrap gap-2">
          {catList.length === 0 ? (
            <p className="text-xs text-muted-foreground">ยังไม่มีประเภทแพ็กเกจ — ไปเพิ่มที่แท็บ "แคตตาล็อกแพ็กเกจ" ก่อน</p>
          ) : catList.map(c => (
            <button key={c.id} type="button" onClick={() => toggleCategory(c.name)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                applicableCategories.includes(c.name)
                  ? "bg-orange-500 text-white border-orange-500"
                  : "bg-card text-muted-foreground border-input hover:border-orange-300"
              }`}>
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {/* Images */}
      <div>
        <label className="text-sm font-medium text-foreground">รูปภาพโปรโมชั่น</label>
        {imageUrls.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2 mb-2">
            {imageUrls.map((url, i) => (
              <div key={url} className="relative group w-20 h-20 shrink-0">
                <img src={url} alt={`รูป ${i + 1}`} className="w-20 h-20 object-cover rounded-lg border border-input" />
                <button onClick={() => setImageUrls(prev => prev.filter(u => u !== url))}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-input text-sm text-muted-foreground hover:bg-muted transition-colors cursor-pointer w-fit mt-1">
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
          อัปโหลดรูปภาพ
          <input type="file" accept="image/*" multiple onChange={handleUpload} className="hidden" />
        </label>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-3 border-t border-border">
        <div className="flex items-center gap-2">
          {item?.id && (
            <button onClick={handleDelete} disabled={deleting}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-500 hover:bg-red-50 transition-colors">
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} ลบ
            </button>
          )}
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors">ยกเลิก</button>
          <button onClick={handleSave} disabled={saving || !name.trim()}
            className="px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-semibold hover:bg-orange-600 disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            <Save className="w-4 h-4" /> บันทึก
          </button>
        </div>
      </div>
    </div>
  );
}