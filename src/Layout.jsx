import { useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard, MessageSquare, BookOpen, Settings,
  LogOut, Bot, ChevronLeft, ChevronRight, User, Users
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

  const { data: user } = useQuery({
    queryKey: ['me'],
    queryFn: () => base44.auth.me(),
  });

  const handleSignOut = () => {
    base44.auth.logout();
  };

  const navItems = user?.role === 'executive'
    ? [allNavItems[0]]
    : allNavItems;

  return (
    <div className="flex h-screen overflow-hidden">
      <aside
        className="h-screen flex flex-col border-r transition-all duration-300 shrink-0"
        style={{ width: collapsed ? 72 : 250, background: 'var(--gradient-sidebar)' }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-3 px-4 py-5 border-b"
          style={{ borderColor: 'hsl(var(--sidebar-border))' }}
        >
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: 'hsl(var(--sidebar-primary))' }}
          >
            <Bot className="w-5 h-5" style={{ color: 'hsl(var(--sidebar-primary-foreground))' }} />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <h1 className="font-bold text-base leading-tight" style={{ color: 'hsl(var(--sidebar-accent-foreground))' }}>
                LINE AI CRM
              </h1>
              <p className="text-[11px] opacity-60" style={{ color: 'hsl(var(--sidebar-foreground))' }}>
                {user?.role === 'executive' ? 'Executive View' : 'Admin Panel'}
              </p>
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const isActive = currentPageName === item.page;
            return (
              <Link
                key={item.page}
                to={createPageUrl(item.page)}
                className={`sidebar-link ${isActive ? 'active' : ''}`}
                title={collapsed ? item.label : undefined}
              >
                <item.icon className="w-5 h-5 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User + Footer */}
        <div className="px-3 pb-4 space-y-1">
          {!collapsed && user && (
            <div className="px-3 py-2 mb-2 rounded-lg" style={{ background: 'hsl(var(--sidebar-accent))' }}>
              <div className="flex items-center gap-2">
                <User className="w-4 h-4" style={{ color: 'hsl(var(--sidebar-foreground))' }} />
                <div className="min-w-0">
                  <div className="text-xs truncate" style={{ color: 'hsl(var(--sidebar-accent-foreground))' }}>
                    {user.email}
                  </div>
                  <div className="text-[10px] opacity-60 capitalize" style={{ color: 'hsl(var(--sidebar-foreground))' }}>
                    {user.role || 'user'}
                  </div>
                </div>
              </div>
            </div>
          )}
          <button onClick={() => setCollapsed(!collapsed)} className="sidebar-link w-full">
            {collapsed
              ? <ChevronRight className="w-5 h-5 shrink-0" />
              : <><ChevronLeft className="w-5 h-5 shrink-0" /><span>ย่อเมนู</span></>
            }
          </button>
          <button
            onClick={handleSignOut}
            className="sidebar-link w-full"
            style={{ color: 'hsl(var(--destructive))' }}
          >
            <LogOut className="w-5 h-5 shrink-0" />
            {!collapsed && <span>ออกจากระบบ</span>}
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  );
}