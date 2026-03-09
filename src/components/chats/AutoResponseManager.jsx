import { useState } from "react";
import { Plus, Trash2, Loader2, X } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function AutoResponseManager({ selectedCustomer, onUseResponse }) {
  const [responses, setResponses] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: "", text: "", image_urls: [] });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  if (!loaded) {
    base44.entities.AutoResponse.filter({ is_active: true }).then(data => {
      setResponses(data || []);
      setLoaded(true);
    });
  }

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    const results = await Promise.all(files.map(f => base44.integrations.Core.UploadFile({ file: f })));
    const newUrls = results.map(r => r.file_url).filter(Boolean);
    setFormData(prev => ({ ...prev, image_urls: [...prev.image_urls, ...newUrls] }));
    toast.success(`อัพโหลด ${newUrls.length} รูปสำเร็จ`);
    setUploading(false);
    e.target.value = "";
  };

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.text.trim()) {
      toast.error("ต้องกรอกชื่อและข้อความ");
      return;
    }
    setSaving(true);
    await base44.entities.AutoResponse.create({
      name: formData.name,
      text: formData.text,
      image_urls: formData.image_urls,
      is_active: true,
    });
    toast.success("บันทึกคำตอบสำเร็จ");
    setFormData({ name: "", text: "", image_urls: [] });
    setShowForm(false);
    const updated = await base44.entities.AutoResponse.filter({ is_active: true });
    setResponses(updated);
    setSaving(false);
  };

  const handleDelete = async (id) => {
    await base44.entities.AutoResponse.update(id, { is_active: false });
    setResponses(prev => prev.filter(r => r.id !== id));
    toast.success("ลบสำเร็จ");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">คำตอบอัตโนมัติ</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-green-600 text-white text-xs hover:bg-green-700"
        >
          <Plus className="w-3 h-3" /> เพิ่ม
        </button>
      </div>

      {/* Form */}
      {showForm && (
        <div className="p-3 border border-border rounded-lg bg-muted/30 space-y-2">
          <input
            type="text"
            placeholder="ชื่อคำตอบ"
            value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            className="w-full px-2.5 py-1.5 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <textarea
            placeholder="ข้อความคำตอบ"
            value={formData.text}
            onChange={(e) => setFormData(prev => ({ ...prev, text: e.target.value }))}
            rows={3}
            className="w-full px-2.5 py-1.5 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />

          {/* Image thumbnails */}
          {formData.image_urls.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {formData.image_urls.map((url, i) => (
                <div key={url} className="relative group w-10 h-10 shrink-0">
                  <img src={url} alt={`รูป ${i + 1}`} className="w-10 h-10 object-cover rounded-lg border border-input" />
                  <button
                    onClick={() => setFormData(prev => ({ ...prev, image_urls: prev.image_urls.filter(u => u !== url) }))}
                    className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-1.5 h-1.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <label className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-input text-xs text-muted-foreground hover:bg-muted transition-colors cursor-pointer w-fit">
            {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <span>🖼</span>}
            {formData.image_urls.length > 0 ? `${formData.image_urls.length} รูป` : "เพิ่มรูป"}
            <input type="file" accept="image/*" multiple onChange={handleUpload} className="hidden" />
          </label>

          <div className="flex gap-1.5">
            <button
              onClick={() => { setShowForm(false); setFormData({ name: "", text: "", image_urls: [] }); }}
              className="flex-1 px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-muted transition-colors"
            >
              ยกเลิก
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !formData.name.trim() || !formData.text.trim()}
              className="flex-1 px-2 py-1.5 rounded-lg bg-green-600 text-white text-xs hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-1"
            >
              {saving && <Loader2 className="w-3 h-3 animate-spin" />}
              บันทึก
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div className="space-y-2 max-h-40 overflow-y-auto">
        {responses.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">ยังไม่มีคำตอบอัตโนมัติ</p>
        ) : responses.map(resp => (
          <div key={resp.id} className="p-2 rounded-lg border border-border hover:bg-muted/40 transition-colors">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-xs text-foreground truncate">{resp.name}</div>
                <p className="text-[10px] text-muted-foreground line-clamp-2">{resp.text}</p>
                {resp.image_urls?.length > 0 && (
                  <span className="text-[10px] text-muted-foreground">📸 {resp.image_urls.length} รูป</span>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                {selectedCustomer && (
                  <button
                    onClick={() => onUseResponse(resp)}
                    className="px-1.5 py-0.5 rounded text-[10px] bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                  >
                    ใช้
                  </button>
                )}
                <button
                  onClick={() => handleDelete(resp.id)}
                  className="px-1 py-0.5 rounded text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}