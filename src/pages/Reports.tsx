import { ReportsLogSections } from "@/components/dashboard/DashboardExtraSections";

export default function Reports() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold">รายงาน</h1>
        <p className="text-muted-foreground mt-1 text-sm sm:text-base">
          Log รายวันสำหรับผู้บริหาร — ตัวเลข frozen ตามวันจริง ไม่เปลี่ยนตามสถานะปัจจุบัน
        </p>
      </div>
      <ReportsLogSections />
    </div>
  );
}
