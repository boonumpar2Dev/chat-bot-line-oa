import { Card } from "@/components/ui/card";
import { MessageSquare, Construction } from "lucide-react";

export default function Chats() {
  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto">
      <h1 className="font-display text-3xl font-semibold mb-1">จัดการแชท</h1>
      <p className="text-muted-foreground mb-6">รายการสนทนากับลูกค้า LINE OA แบบเรียลไทม์</p>
      <Card className="p-12 text-center shadow-soft border-border/60 border-dashed">
        <Construction className="w-12 h-12 mx-auto text-warning mb-3"/>
        <h2 className="font-display text-xl font-semibold mb-2">กำลังพัฒนาในเฟสถัดไป</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">หน้านี้จะแสดงรายชื่อลูกค้า + กล่องแชทเรียลไทม์ + ปุ่มสลับ Manual/AI<br/>หลังเชื่อม LINE Webhook เสร็จแล้ว ข้อความจะเข้ามาที่นี่อัตโนมัติ</p>
      </Card>
    </div>
  );
}
