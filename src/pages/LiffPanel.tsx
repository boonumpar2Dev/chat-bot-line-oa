import { Card } from "@/components/ui/card";
import { Smartphone } from "lucide-react";

export default function LiffPanel() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-warm-gradient">
      <Card className="p-10 text-center max-w-sm shadow-elevated">
        <Smartphone className="w-12 h-12 mx-auto text-primary mb-3"/>
        <h1 className="font-display text-xl font-semibold mb-2">LIFF Admin Panel</h1>
        <p className="text-sm text-muted-foreground">หน้าสำหรับเปิดใน LINE App — จะพัฒนาในเฟสถัดไปพร้อมระบบ LIFF integration</p>
      </Card>
    </div>
  );
}
