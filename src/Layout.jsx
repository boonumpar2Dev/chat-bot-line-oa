import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  LayoutDashboard, MessageSquare, BookOpen, Settings,
  LogOut, Bot, ChevronLeft, ChevronRight, Users, Loader2
} from 'lucide-react';

const allNavItems = [
  { page: "Dashboard", label: "Dashboard", icon: LayoutDashboard },
  { page: "Chats", label: "จัดการแชท", icon: MessageSquare },
  { page: "Knowledge", label: "สอน AI", icon: BookOpen },
  { page: "RoleManagement", label: "จัดการผู้ใช้", icon: Users },
  { page: "Settings", label: "ตั้งค่า", icon: Settings },
];

export default function Layout({ children, currentPageName }) {
  const [collapsed, setCollapsed] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const navigate = useNavigate();
  const totalUnread = useRef(0);

  const { data: user, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: () => base44.auth.me(),
  });

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        base44.auth.redirectToLogin();
      } else {
        setAuthChecked(true);
      }
    }
  }, [user, isLoading]);

  // Global real-time notification for new customer messages
  useEffect(() => {
    if (!authChecked) return;
    // Track total unread across all customers for badge
    base44.entities.Customer.list("-last_message_at", 200).then(custs => {
      totalUnread.current = (custs || []).reduce((sum, c) => sum + (c.unread_count || 0), 0);
    });

    const unsub = base44.entities.Customer.subscribe((event) => {
      if (event.type === "update" && event.data && (event.data.unread_count || 0) > 0) {
        // Only show toast if NOT on Chats page
        if (currentPageName !== "Chats") {
          const name = event.data.nickname || event.data.display_name || "ลูกค้า";
          const snippet = event.data.last_message_snippet || "ส่งข้อความใหม่";
          toast.info(
            `ข้อความใหม่จาก ${name}`,
            {
              description: snippet.length > 50 ? snippet.slice(0, 50) + "..." : snippet,
              duration: 6000,
              action: {
                label: "เปิดแชท",
                onClick: () => navigate(createPageUrl("Chats") + "?customer=" + event.data.id),
              },
            }
          );
        }
      }
    });
    return unsub;
  }, [authChecked, currentPageName]);

  if (isLoading || !authChecked) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const navItems = user?.role === 'executive'
    ? [allNavItems[0]]
    : allNavItems;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside
        className="h-screen flex flex-col shrink-0 transition-all duration-300 ease-in-out"
        style={{
          width: collapsed ? 68 : 240,
          background: 'linear-gradient(180deg, hsl(222 60% 10%), hsl(222 55% 14%))',
          borderRight: '1px solid hsl(222 40% 20%)',
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-4 border-b" style={{ borderColor: 'hsl(222 40% 20%)' }}>
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'hsl(160 84% 42%)' }}
          >
            <Bot className="w-4 h-4 text-white" />
          </div>
          {!collapsed && (
            <div className="overflow-hidden min-w-0">
              <div className="font-bold text-sm text-white leading-tight truncate">LINE AI CRM</div>
              <div className="text-[10px] text-white/40 truncate">
                {user?.role === 'executive' ? 'Executive View' : 'Admin Panel'}
              </div>
            </div>
          )}
        </div>

        {/* Nav Items */}
        <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = currentPageName === item.page;
            return (
              <Link
                key={item.page}
                to={createPageUrl(item.page)}
                title={collapsed ? item.label : undefined}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-150 no-underline group"
                style={{
                  background: isActive ? 'hsl(160 84% 42% / 0.18)' : 'transparent',
                  color: isActive ? 'hsl(160 84% 55%)' : 'hsl(220 14% 70%)',
                }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'hsl(222 50% 20%)'; }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
              >
                <item.icon
                  className="shrink-0"
                  style={{
                    width: 18, height: 18,
                    color: isActive ? 'hsl(160 84% 55%)' : 'hsl(220 14% 65%)',
                  }}
                />
                {!collapsed && (
                  <span className="text-sm font-medium truncate" style={{ color: isActive ? 'hsl(160 84% 55%)' : 'hsl(220 14% 75%)' }}>
                    {item.label}
                  </span>
                )}
                {isActive && !collapsed && (
                  <div className="ml-auto w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'hsl(160 84% 55%)' }} />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-2 pb-3 border-t pt-3 space-y-0.5" style={{ borderColor: 'hsl(222 40% 20%)' }}>
          {/* User Info */}
          {!collapsed && user && (
            <div className="px-3 py-2 mb-1 rounded-lg" style={{ background: 'hsl(222 50% 17%)' }}>
              <div className="flex items-center gap-2 min-w-0">
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold text-white"
                  style={{ background: 'hsl(160 84% 42%)' }}
                >
                  {(user.full_name || user.email || '?').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-medium text-white/80 truncate">{user.email}</div>
                  <div className="text-[10px] text-white/40 capitalize">{user.role || 'user'}</div>
                </div>
              </div>
            </div>
          )}

          {/* Collapse Toggle */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg transition-all duration-150 text-sm"
            style={{ color: 'hsl(220 14% 60%)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'hsl(222 50% 20%)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            {collapsed
              ? <ChevronRight className="w-4 h-4 shrink-0" />
              : <><ChevronLeft className="w-4 h-4 shrink-0" /><span className="text-sm">ย่อเมนู</span></>
            }
          </button>

          {/* Logout */}
          <button
            onClick={() => base44.auth.logout()}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg transition-all duration-150 text-sm"
            style={{ color: 'hsl(0 84% 65%)' }}
            onMouseEnter={e => e.currentTarget.style.background = 'hsl(0 84% 60% / 0.1)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <LogOut className="w-4 h-4 shrink-0" />
            {!collapsed && <span>ออกจากระบบ</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}