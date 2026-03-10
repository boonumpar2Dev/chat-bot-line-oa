import { useState } from "react";
import { Plus, Trash2, Loader2, X, Image as ImageIcon, Save } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

function PricingRow({ tier, onChange, onRemove }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="text" placeholder="จำนวนแขก เช่น 50 ท่าน"
        value={tier.guest_count || ""}
        onChange={e => onChange({ ...tier, guest_count: e.target.value })}
        className="flex-1 px-3 py-2 rounded-lg border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <input
        type="text" placeholder="ราคา เช่น 25,000 บาท"
        value={tier.price || ""}
        onChange={e => onChange({ ...tier, price: e.target.value })}
        className="flex-1 px-3 py-2 rounded-lg border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <button onClick={onRemove} className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 shrink-0">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export default function PackageCatalogForm({ item, onSaved, onDeleted, onCancel }) {
  const [name, setName] = useState(item?.name || "");
  const [description, setDescription] = useState(item?.description || "");
  const [minCondition, setMinCondition] = useState(item?.min_condition || "");
  const [pricingTiers, setPricingTiers] = useState(
    item?.pricing_tiers?.length ? item.pricing_tiers : [{ guest_count: "", price: "" }]
  );
  const [notes, setNotes] = useState(item?.notes || "");
  const [imageUrls, setImageUrls] = useState(item?.image_urls || []);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);

  const updateTier = (idx, tier) => setPricingTiers(prev => prev.map((t, i) => i === idx ? tier : t));
  const removeTier = (idx) => setPricingTiers(prev => prev.filter((_, i) => i !== idx));
  const addTier = () => setPricingTiers(prev => [...prev, { guest_count: "", price: "" }]);

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    const results = await Promise.all(files.map(f => base44.integrations.Core.UploadFile({ file: f })));
    const newUrls = results.map(r => r.file_url).filter(Boolean);
    setImageUrls(prev => [...prev, ...newUrls]);
    toast.success(`อัปโหลด ${newUrls.length} รูปสำเร็จ`);
    setUploading(false);
    e.target.value = "";
  };

  const removeImage = (url) => setImageUrls(prev => prev.filter(u => u !== url));

  const handleSave = async () => {
    if (!name.trim()) { toast.error("ต้องกรอกชื่อแพ็กเกจ"); return; }
    setSaving(true);
    const validTiers = pricingTiers.filter(t => t.guest_count || t.price);
    const data = {
      name, description, min_condition: minCondition,
      pricing_tiers: validTiers, notes, image_urls: imageUrls, is_active: true,
    };
    if (item?.id) {
      await base44.entities.CateringPackage.update(item.id, data);
    } else {
      await base44.entities.CateringPackage.create(data);
    }
    toast.success("บันทึกแพ็กเกจสำเร็จ");
    setSaving(false);
    onSaved();
  };

  const handleDelete = async () => {
    if (!item?.id) return;
    setDeleting(true);
    await base44.entities.CateringPackage.delete(item.id);
    toast.success("ลบแพ็กเกจสำเร็จ");
    setDeleting(false);
    onDeleted();
  };

  return (
    <div className="space-y-5">
      <div>
        <label className="text-sm font-medium text-foreground">ชื่อแพ็กเกจ</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)}
          placeholder="เช่น แพ็กเกจงานบุญ + โต๊ะจีน"
          className="w-full mt-1 px-3 py-2.5 rounded-lg border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
      </div>

      {/* Brochure Images */}
      <div>
        <label className="text-sm font-medium text-foreground">รูปภาพโบรชัวร์ / เมนู</label>
        <p className="text-xs text-muted-foreground mt-0.5 mb-2">AI จะส่งรูปนี้ให้ลูกค้าเมื่อถามถึงแพ็กเกจนี้</p>
        {imageUrls.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {imageUrls.map((url, i) => (
              <div key={url} className="relative group w-20 h-20 shrink-0">
                <img src={url} alt={`รูป ${i + 1}`} className="w-20 h-20 object-cover rounded-lg border border-input" />
                <button onClick={() => removeImage(url)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-input text-sm text-muted-foreground hover:bg-muted transition-colors cursor-pointer w-fit">
          {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ImageIcon className="w-4 h-4" />}
          อัปโหลดรูปภาพ
          <input type="file" accept="image/*" multiple onChange={handleUpload} className="hidden" />
        </label>
      </div>

      {/* Min Condition */}
      <div>
        <label className="text-sm font-medium text-foreground">เงื่อนไขการรับงาน</label>
        <input type="text" value={minCondition} onChange={e => setMinCondition(e.target.value)}
          placeholder="เช่น รับจัดขั้นต่ำ 30 ท่าน / 3 โต๊ะ"
          className="w-full mt-1 px-3 py-2.5 rounded-lg border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
      </div>

      {/* Pricing Matrix */}
      <div>
        <label className="text-sm font-medium text-foreground">โครงสร้างราคา</label>
        <p className="text-xs text-muted-foreground mt-0.5 mb-2">เพิ่มแถวราคาตามจำนวนแขก</p>
        <div className="space-y-2">
          <div className="flex items-center gap-2 px-1">
            <span className="flex-1 text-xs text-muted-foreground font-medium">จำนวนแขก</span>
            <span className="flex-1 text-xs text-muted-foreground font-medium">ราคา</span>
            <div className="w-8" />
          </div>
          {pricingTiers.map((tier, idx) => (
            <PricingRow key={idx} tier={tier} onChange={t => updateTier(idx, t)} onRemove={() => removeTier(idx)} />
          ))}
          <button onClick={addTier}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-input text-sm text-green-600 hover:bg-green-50 transition-colors w-full justify-center">
            <Plus className="w-4 h-4" /> เพิ่มแถวราคา
          </button>
        </div>
      </div>

      {/* Food Description */}
      <div>
        <label className="text-sm font-medium text-foreground">รายละเอียดอาหาร</label>
        <textarea value={description} onChange={e => setDescription(e.target.value)}
          placeholder="เช่น เลือกอาหารคาวได้ 5 อย่าง ของหวาน 2 อย่าง น้ำดื่ม 1 อย่าง"
          rows={4}
          className="w-full mt-1 px-3 py-2.5 rounded-lg border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
      </div>

      {/* Notes */}
      <div>
        <label className="text-sm font-medium text-foreground">หมายเหตุ / เงื่อนไขเพิ่มเติม</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="เช่น ราคานี้ไม่รวมค่าเดินทาง / สามารถเพิ่มเมนูได้ตามต้องการ"
          rows={3}
          className="w-full mt-1 px-3 py-2.5 rounded-lg border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none" />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-3 border-t border-border">
        {item?.id ? (
          <button onClick={handleDelete} disabled={deleting}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-500 hover:bg-red-50 transition-colors">
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} ลบแพ็กเกจ
          </button>
        ) : <div />}
        <div className="flex gap-2">
          <button onClick={onCancel} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors">ยกเลิก</button>
          <button onClick={handleSave} disabled={saving || !name.trim()}
            className="px-4 py-2 rounded-lg bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            <Save className="w-4 h-4" /> บันทึก
          </button>
        </div>
      </div>
    </div>
  );
}