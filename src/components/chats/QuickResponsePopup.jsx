import { useState, useEffect, useRef } from "react";
import { Plus, Trash2, Loader2, X, FileText } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function QuickResponsePopup({ show, onSelect, onClose, filter }) {
  const [responses, setResponses] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ name: "", text: "", image_urls: [] });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const popupRef = useRef(null);

  useEffect(() => {
    if (show && !loaded) {
      base44.entities.AutoResponse.filter({ is_active: true }).then(data => {
        setResponses(data || []);
        setLoaded(true);
      });
    }
  }, [show, loaded]);

  useEffect(() => {
    if (!show) return;
    const handler = (e) => {
      if (popupRef.current && !popupRef.current.contains(e.target)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [show, onClose]);

  const filtered = filter
    ? responses.filter(r => r.name.toLowerCase().includes(filter.toLowerCase()) || r.text.toLowerCase().includes(filter.toLowerCase()))
    : responses;

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    const results = await Promise.all(files.map(f => base44.integrations.Core.UploadFile({ file: f })));
    const newUrls = results.map(r => r.file_url).filter(Boolean);
    setFormData(prev => ({ ...prev, image_urls: [...prev.image_urls, ...newUrls] }));
    setUploading(false);
    e.target.value = "";
  };

  const handleSave = async () => {
    if (!formData.name.trim() || !formData.text.trim()) {
      toast.error("ต้องกรอกชื่อและข้อความ");
      return;
    }
    setSaving(true);
    const created = await base44.entities.AutoResponse.create({
      name: formData.name, text: formData.text, image_urls: formData.image_urls, is_active: true,
    });
    setResponses(prev => [...prev, created]);
    setFormData({ name: "", text: "", image_urls: [] });
    setShowForm(false);
    setSaving(false);
    toast.success("บันทึกคำตอบสำเร็จ");
  };

  const handleDelete = async (id) => {
    await base44.entities.AutoResponse.update(id, { is_active: false });
    setResponses(prev => prev.filter(r => r.id !== id));
    toast.success("ลบสำเร็จ");
  };

  if (!show) return null;

  return (
    <div
      ref={popupRef}
      className="absolute bottom-full left-0 right-0 mb-1 mx-3 bg-card border border-border rounded-xl shadow-lg z-50 max-h-80 flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-semibold text-foreground">ข้อความสำเร็จรูป</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowForm(!showForm)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-600 text-white text-xs hover:bg-green-700 transition-colors"
          >
            <Plus className="w-3 h-3" /> เพิ่ม
          </button>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="p-3 border-b border-border bg-muted/20 space-y-2">
          <input
            type="text" placeholder="ชื่อคำตอบ" value={formData.name}
            onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
            className="w-full px-3 py-1.5 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <textarea
            placeholder="ข้อความคำตอบ" value={formData.text}
            onChange={(e) => setFormData(prev => ({ ...prev, text: e.target.value }))}
            rows={2}
            className="w-full px-3 py-1.5 rounded-lg border border-input bg-background text-xs focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
          {formData.image_urls.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {formData.image_urls.map((url, i) => (
                <div key={url} className="relative group w-10 h-10 shrink-0">
                  <img src={url} alt="" className="w-10 h-10 object-cover rounded-lg border border-input" />
                  <button
                    onClick={() => setFormData(prev => ({ ...prev, image_urls: prev.image_urls.filter(u => u !== url) }))}
                    className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100"
                  ><X className="w-2 h-2" /></button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-input text-xs text-muted-foreground hover:bg-muted cursor-pointer">
              {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : "🖼"}
              {formData.image_urls.length > 0 ? `${formData.image_urls.length} รูป` : "เพิ่มรูป"}
              <input type="file" accept="image/*" multiple onChange={handleUpload} className="hidden" />
            </label>
            <div className="flex-1" />
            <button onClick={() => { setShowForm(false); setFormData({ name: "", text: "", image_urls: [] }); }}
              className="px-3 py-1 rounded-lg text-xs text-muted-foreground hover:bg-muted">ยกเลิก</button>
            <button onClick={handleSave} disabled={saving || !formData.name.trim() || !formData.text.trim()}
              className="px-3 py-1 rounded-lg bg-green-600 text-white text-xs hover:bg-green-700 disabled:opacity-50 flex items-center gap-1">
              {saving && <Loader2 className="w-3 h-3 animate-spin" />} บันทึก
            </button>
          </div>
        </div>
      )}

      {/* Response List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            {filter ? "ไม่พบคำตอบที่ตรงกับคำค้น" : "ยังไม่มีข้อความสำเร็จรูป"}
          </div>
        ) : filtered.map(resp => (
          <button
            key={resp.id}
            className="w-full text-left px-4 py-2.5 hover:bg-muted/50 transition-colors border-b border-border/40 group flex items-start gap-3"
            onClick={() => onSelect(resp)}
          >
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-foreground">{resp.name}</div>
              <p className="text-[11px] text-muted-foreground line-clamp-2 mt-0.5">{resp.text}</p>
              {resp.image_urls?.length > 0 && (
                <span className="text-[10px] text-muted-foreground mt-0.5">📸 {resp.image_urls.length} รูป</span>
              )}
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); handleDelete(resp.id); }}
              className="p-1 rounded text-red-400 hover:text-red-600 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </button>
        ))}
      </div>
    </div>
  );
}