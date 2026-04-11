import { useState } from "react";
import { Plus, Trash2, Loader2, X, Image as ImageIcon, Save, Bot, Copy } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import CustomAttributesEditor from "./CustomAttributesEditor";

function PricingRow({ tier, onChange, onRemove }) {
  const handleTotalChange = (val) => {
    const total = parseInt(val) || 0;
    const monk = parseInt(tier.monk_pax) || 0;
    const guest = Math.max(0, total - monk);
    onChange({
      ...tier,
      total_pax: total || "",
      guest_pax: total ? guest : "",
      guest_count: total ? `${total} ท่าน${monk > 0 ? ` (รวมพระ ${monk} รูป + แขก ${guest} ท่าน)` : ""}` : "",
    });
  };

  const handleMonkChange = (val) => {
    const monk = parseInt(val) || 0;
    const total = parseInt(tier.total_pax) || 0;
    const guest = Math.max(0, total - monk);
    onChange({
      ...tier,
      monk_pax: monk || "",
      guest_pax: total ? guest : "",
      guest_count: total ? `${total} ท่าน${monk > 0 ? ` (รวมพระ ${monk} รูป + แขก ${guest} ท่าน)` : ""}` : "",
    });
  };

  const guestPax = (parseInt(tier.total_pax) || 0) - (parseInt(tier.monk_pax) || 0);

  return (
    <div className="p-3 rounded-lg border border-input bg-card/50 space-y-2">
      <div className="flex items-center gap-2">
        <div className="w-40 space-y-1">
          <label className="text-[11px] text-purple-600 font-medium">เกรด/เมนู</label>
          <input type="text" placeholder="เช่น เกรด A" value={tier.tier_name || ""}
            onChange={e => onChange({ ...tier, tier_name: e.target.value })}
            className="w-full px-2.5 py-1.5 rounded-md border border-purple-200 bg-purple-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300" />
        </div>
        <div className="flex-1 space-y-1">
          <label className="text-[11px] text-muted-foreground font-medium">จำนวนรวม</label>
          <input type="number" min="0" placeholder="เช่น 40" value={tier.total_pax || ""}
            onChange={e => handleTotalChange(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <div className="flex-1 space-y-1">
          <label className="text-[11px] text-amber-600 font-medium">พระสงฆ์</label>
          <input type="number" min="0" placeholder="เช่น 9" value={tier.monk_pax || ""}
            onChange={e => handleMonkChange(e.target.value)}
            className="w-full px-2.5 py-1.5 rounded-md border border-amber-200 bg-amber-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-amber-300" />
        </div>
        <div className="w-16 space-y-1">
          <label className="text-[11px] text-blue-600 font-medium">แขก</label>
          <div className="px-2.5 py-1.5 rounded-md border border-blue-200 bg-blue-50/50 text-sm text-blue-700 font-medium">
            {tier.total_pax ? (guestPax >= 0 ? guestPax : 0) : "—"}
          </div>
        </div>
        <div className="flex-1 space-y-1">
          <label className="text-[11px] text-muted-foreground font-medium">ราคา</label>
          <input type="text" placeholder="25,000 บาท" value={tier.price || ""}
            onChange={e => onChange({ ...tier, price: e.target.value })}
            className="w-full px-2.5 py-1.5 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>
        <button onClick={onRemove} className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 shrink-0 mt-4">
          <X className="w-4 h-4" />
        </button>
      </div>
      {tier.total_pax > 0 && (
        <div className="text-[11px] text-muted-foreground bg-muted/50 px-2.5 py-1 rounded">
          {tier.tier_name && <><span className="font-medium text-purple-600">{tier.tier_name}</span> — </>}สรุป: <span className="font-medium text-foreground">{tier.total_pax} ท่าน</span>
          {(tier.monk_pax || 0) > 0 && (
            <> = พระสงฆ์ <span className="font-medium text-amber-600">{tier.monk_pax} รูป</span> + แขก <span className="font-medium text-blue-600">{guestPax >= 0 ? guestPax : 0} ท่าน</span></>
          )}
        </div>
      )}
    </div>
  );
}

export default function PackageCatalogForm({ item, categories, onSaved, onDeleted, onCancel, onDuplicate }) {
  const [name, setName] = useState(item?.name || "");
  const [category, setCategory] = useState(item?.category || "");
  const [description, setDescription] = useState(item?.description || "");
  const [minCondition, setMinCondition] = useState(item?.min_condition || "");
  const [pricingTiers, setPricingTiers] = useState(
    item?.pricing_tiers?.length ? item.pricing_tiers : [{ tier_name: "", total_pax: "", monk_pax: "", guest_pax: "", guest_count: "", price: "" }]
  );
  const [customAttributes, setCustomAttributes] = useState(item?.custom_attributes || []);
  const [aiInstruction, setAiInstruction] = useState(item?.ai_instruction || "");
  const [notes, setNotes] = useState(item?.notes || "");
  const [imageUrls, setImageUrls] = useState(item?.image_urls || []);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);

  const updateTier = (idx, tier) => setPricingTiers(prev => prev.map((t, i) => i === idx ? tier : t));
  const removeTier = (idx) => setPricingTiers(prev => prev.filter((_, i) => i !== idx));
  const addTier = () => setPricingTiers(prev => [...prev, { tier_name: "", total_pax: "", monk_pax: "", guest_pax: "", guest_count: "", price: "" }]);

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
    const validAttrs = customAttributes.filter(a => a.label && a.value);
    const data = {
      name, category, description, min_condition: minCondition,
      pricing_tiers: validTiers, custom_attributes: validAttrs,
      ai_instruction: aiInstruction, notes, image_urls: imageUrls, is_active: true,
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

  const catList = categories || [];

  return (
    <div className="space-y-5">
      {/* Name */}
      <div>
        <label className="text-sm font-medium text-foreground">ชื่อแพ็กเกจ</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)}
          placeholder="เช่น แพ็กเกจงานบุญ + โต๊ะจีน"
          className="w-full mt-1 px-3 py-2.5 rounded-lg border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
      </div>

      {/* Category */}
      <div>
        <label className="text-sm font-medium text-foreground">ประเภทแพ็กเกจ</label>
        {catList.length > 0 ? (
          <select value={category} onChange={e => setCategory(e.target.value)}
            className="w-full mt-1 px-3 py-2.5 rounded-lg border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring">
            <option value="">-- เลือกประเภท --</option>
            {catList.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        ) : (
          <input type="text" value={category} onChange={e => setCategory(e.target.value)}
            placeholder="เช่น งานบุญ, โต๊ะจีน"
            className="w-full mt-1 px-3 py-2.5 rounded-lg border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
        )}
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
        <p className="text-xs text-muted-foreground mt-0.5 mb-2">กรอกจำนวนรวม + พระสงฆ์ → ระบบจะคำนวณจำนวนแขกอัตโนมัติ</p>
        <div className="space-y-2">
          {pricingTiers.map((tier, idx) => (
            <PricingRow key={idx} tier={tier} onChange={t => updateTier(idx, t)} onRemove={() => removeTier(idx)} />
          ))}
          <button onClick={addTier}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-input text-sm text-green-600 hover:bg-green-50 transition-colors w-full justify-center">
            <Plus className="w-4 h-4" /> เพิ่มแถวราคา
          </button>
        </div>
      </div>

      {/* Custom Attributes */}
      <CustomAttributesEditor attributes={customAttributes} onChange={setCustomAttributes} />

      {/* Food Description (Rich Text / Bullet Points) */}
      <div>
        <label className="text-sm font-medium text-foreground">รายละเอียดอาหาร</label>
        <p className="text-xs text-muted-foreground mt-0.5 mb-1">ใส่รายการเมนูทีละบรรทัด — AI จะแยกแยะรายการได้ง่าย</p>
        <textarea value={description} onChange={e => setDescription(e.target.value)}
          placeholder={"- ข้าวสวย\n- แกงเขียวหวานไก่\n- ผัดกะเพราหมูสับ\n- ส้มตำ\n- ผลไม้รวม\n- น้ำดื่ม"}
          rows={6}
          className="w-full px-3 py-2.5 rounded-lg border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none font-mono leading-relaxed" />
      </div>

      {/* AI Instruction */}
      <div className="p-4 rounded-lg border border-purple-200 bg-purple-50/50 space-y-2">
        <div className="flex items-center gap-2">
          <Bot className="w-4 h-4 text-purple-600" />
          <label className="text-sm font-medium text-purple-800">Instruction พิเศษสำหรับ AI</label>
        </div>
        <p className="text-xs text-purple-600">คำสั่งเฉพาะที่ AI จะปฏิบัติตามเมื่อลูกค้าถามเกี่ยวกับแพ็กเกจนี้</p>
        <textarea value={aiInstruction} onChange={e => setAiInstruction(e.target.value)}
          placeholder={"เช่น ถ้าลูกค้าถามเรื่องที่จอดรถ ให้ตอบว่าแพ็กเกจนี้รวมค่าบริการขนส่งแล้ว\nหรือ ห้ามลดราคาจากที่ระบุไว้ ให้แนะนำติดต่อแอดมินแทน"}
          rows={3}
          className="w-full px-3 py-2.5 rounded-lg border border-purple-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-300 resize-none" />
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
        <div className="flex items-center gap-2">
          {item?.id && (
            <button onClick={handleDelete} disabled={deleting}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-500 hover:bg-red-50 transition-colors">
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} ลบ
            </button>
          )}
          {item?.id && onDuplicate && (
            <button onClick={() => onDuplicate(item)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-blue-600 hover:bg-blue-50 transition-colors">
              <Copy className="w-4 h-4" /> คัดลอก
            </button>
          )}
        </div>
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