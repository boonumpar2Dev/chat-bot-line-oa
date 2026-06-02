import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { LayoutDashboard, MessageSquare, BookOpen, Users, Settings, LogOut, ChevronLeft, Menu, Zap, Plug, Bot, UserCircle2, Tag as TagIcon } from "lucide-react";
import boonumparLogo from "@/assets/boonumpar-logo.png.asset.json";
import { useAuth } from "@/hooks/useAuth";
import { useMenuPermissions, MenuKey } from "@/hooks/useMenuPermissions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent } from "@/components/ui/sheet";

type NavItem = { to: string; label: string; icon: any; exact?: boolean; key: MenuKey; adminOnly?: boolean; ownerOnly?: boolean };
type NavGroup = { label?: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  { items: [
    { to: "/", label: "Dashboard", icon: LayoutDashboard, exact: true, key: "dashboard" },
  ]},
  { label: "ลูกค้า", items: [
    { to: "/chats", label: "จัดการแชท", icon: MessageSquare, key: "chats" },
    { to: "/customers", label: "รายชื่อลูกค้า", icon: UserCircle2, key: "chats" },
    { to: "/tags", label: "แท็กลูกค้า", icon: TagIcon, key: "tags" },
  ]},
  { label: "AI", items: [
    { to: "/knowledge", label: "สอน AI", icon: BookOpen, key: "knowledge" },
    { to: "/ai-settings", label: "ตั้งค่า AI", icon: Bot, key: "ai_settings" },
  ]},
  { label: "ระบบ", items: [
    { to: "/users", label: "จัดการผู้ใช้", icon: Users, key: "users", adminOnly: true },
    { to: "/ai-tokens", label: "AI Tokens", icon: Zap, key: "ai_tokens", ownerOnly: true },
    { to: "/line-connection", label: "เชื่อมต่อ LINE", icon: Plug, key: "ai_tokens", adminOnly: true },
    { to: "/settings", label: "ตั้งค่าระบบ", icon: Settings, key: "settings" },
  ]},
];

function NavItems({ collapsed, onNav }: { collapsed: boolean; onNav?: () => void }) {
  const { role } = useAuth();
  const { menus } = useMenuPermissions();
  const visibleGroups = navGroups
    .map(g => ({
      ...g,
      items: g.items.filter(i => {
        if (i.ownerOnly) return role === "owner";
        if (i.adminOnly) return role === "admin" || role === "owner";
        return menus.includes(i.key);
      }),
    }))
    .filter(g => g.items.length > 0);
  return (
    <nav className="flex-1 px-3 py-2 space-y-3 overflow-y-auto">
      {visibleGroups.map((group, gi) => (
        <div key={gi} className="space-y-1">
          {group.label && !collapsed && (
            <div className="px-3 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
              {group.label}
            </div>
          )}
          {group.label && collapsed && gi > 0 && (
            <div className="mx-3 my-1 border-t border-sidebar-border/50" />
          )}
          {group.items.map(item => (
            <NavLink key={item.to} to={item.to} end={item.exact} onClick={onNav}
              className={({ isActive }) => cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                isActive ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-soft" : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}>
              <item.icon className="w-5 h-5 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}

function SidebarInner({ collapsed, setCollapsed, onNav }: { collapsed: boolean; setCollapsed?: (v: boolean)=>void; onNav?: () => void }) {
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  const initial = (user?.email || "?")[0].toUpperCase();
  return (
    <div className="h-full flex flex-col bg-sidebar text-sidebar-foreground">
      <div className={cn("flex items-center gap-2.5 px-4 h-16 border-b border-sidebar-border", collapsed && "justify-center px-0")}>
        <img src={boonumparLogo.url} alt="Boonumpar" className="h-9 w-auto object-contain shrink-0" />
        {!collapsed && <span className="font-display font-semibold text-lg">Boonumpar Chat</span>}
      </div>
      <NavItems collapsed={collapsed} onNav={onNav} />
      <div className="p-3 border-t border-sidebar-border">
        <div className={cn("flex items-center gap-3 p-2 rounded-lg", collapsed && "justify-center")}>
          <Avatar className="w-8 h-8"><AvatarFallback className="bg-sidebar-primary text-sidebar-primary-foreground text-xs">{initial}</AvatarFallback></Avatar>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{user?.email}</p>
            </div>
          )}
          {!collapsed && (
            <Button size="icon" variant="ghost" className="h-8 w-8 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
              onClick={async () => { await signOut(); nav("/auth"); }}>
              <LogOut className="w-4 h-4" />
            </Button>
          )}
        </div>
        {setCollapsed && (
          <Button size="sm" variant="ghost" className="hidden lg:flex w-full mt-2 text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent" onClick={() => setCollapsed(!collapsed)}>
            <ChevronLeft className={cn("w-4 h-4 transition-transform", collapsed && "rotate-180")} />
            {!collapsed && <span className="ml-2 text-xs">ย่อเมนู</span>}
          </Button>
        )}
      </div>
    </div>
  );
}

export default function AppLayout() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      <aside className={cn("hidden lg:block border-r border-sidebar-border transition-all duration-200", collapsed ? "w-[72px]" : "w-64")}>
        <SidebarInner collapsed={collapsed} setCollapsed={setCollapsed} />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="p-0 w-64 bg-sidebar border-sidebar-border">
          <SidebarInner collapsed={false} onNav={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="lg:hidden h-14 border-b flex items-center px-3 gap-2 bg-card">
          <Button size="icon" variant="ghost" onClick={() => setMobileOpen(true)}><Menu /></Button>
          <div className="flex items-center gap-2">
            <img src={boonumparLogo.url} alt="Boonumpar" className="h-7 w-auto object-contain" />
            <span className="font-display font-semibold">Boonumpar Chat</span>
          </div>
        </header>
        <main className="flex-1 overflow-auto"><Outlet /></main>
      </div>
    </div>
  );
}
