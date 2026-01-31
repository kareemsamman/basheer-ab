import { useState, useEffect } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  Car,
  FileText,
  Building2,
  UserCog,
  Bell,
  BarChart3,
  Settings,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  LogOut,
  Wallet,
  CreditCard,
  Loader2,
  Image,
  Menu,
  MessageSquare,
  FileSignature,
  Upload,
  DollarSign,
  History,
  Truck,
  Shield,
  Megaphone,
  AlertTriangle,
  ListTodo,
  Contact,
  FileWarning,
  LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { SidebarNotificationBadge } from "./SidebarNotificationBadge";
import { SidebarDebtBadge } from "./SidebarDebtBadge";
import { SidebarTaskBadge } from "./SidebarTaskBadge";
import { SidebarClaimsBadge } from "./SidebarClaimsBadge";
import { SidebarSearch } from "./SidebarSearch";

interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  adminOnly?: boolean;
  superAdminOnly?: boolean;
  badge?: 'notifications' | 'debt' | 'tasks' | 'claims';
}

interface NavGroup {
  name: string;
  icon: LucideIcon;
  items: NavItem[];
  adminOnly?: boolean;
  defaultOpen?: boolean;
}

const SUPER_ADMIN_EMAIL = "morshed500@gmail.com";

// Navigation structure with groups - exported for NavigationSearch
export const navigationGroups: NavGroup[] = [
  {
    name: "الرئيسية",
    icon: LayoutDashboard,
    defaultOpen: true,
    items: [
      { name: "لوحة التحكم", href: "/", icon: LayoutDashboard },
      { name: "المهام", href: "/tasks", icon: ListTodo, badge: 'tasks' },
      { name: "التنبيهات", href: "/notifications", icon: Bell, badge: 'notifications' },
    ],
  },
  {
    name: "إدارة العملاء",
    icon: Users,
    items: [
      { name: "العملاء", href: "/clients", icon: Users },
      { name: "السيارات", href: "/cars", icon: Car },
      { name: "الوثائق", href: "/policies", icon: FileText },
      { name: "جهات الاتصال", href: "/contacts", icon: Contact },
    ],
  },
  {
    name: "المالية",
    icon: Wallet,
    items: [
      { name: "الشيكات", href: "/cheques", icon: CreditCard },
      { name: "متابعة الديون", href: "/debt-tracking", icon: DollarSign, badge: 'debt' },
      { name: "شركات التأمين", href: "/companies", icon: Building2, adminOnly: true },
      { name: "الوسطاء", href: "/brokers", icon: Wallet, adminOnly: true },
      { name: "المصاريف", href: "/expenses", icon: DollarSign, adminOnly: true },
    ],
  },
  {
    name: "التقارير",
    icon: BarChart3,
    items: [
      { name: "تقارير الوثائق", href: "/reports/policies", icon: BarChart3 },
      { name: "تقرير الشركات", href: "/reports/company-settlement", icon: BarChart3, adminOnly: true },
      { name: "التقارير المالية", href: "/reports/financial", icon: Wallet, adminOnly: true },
    ],
  },
  {
    name: "بلاغات وحوادث",
    icon: AlertTriangle,
    items: [
      { name: "بلاغات الحوادث", href: "/accidents", icon: AlertTriangle },
      { name: "المطالبات", href: "/admin/claims", icon: FileWarning, adminOnly: true, badge: 'claims' },
    ],
  },
  {
    name: "أخرى",
    icon: Image,
    items: [
      { name: "الوسائط", href: "/media", icon: Image },
    ],
  },
  {
    name: "الإعدادات",
    icon: Settings,
    adminOnly: true,
    items: [
      { name: "المستخدمون", href: "/admin/users", icon: UserCog },
      { name: "SMS تسويقية", href: "/admin/marketing-sms", icon: Megaphone },
      { name: "أنواع التأمين", href: "/admin/insurance-categories", icon: FileText },
      { name: "خدمات الطريق", href: "/admin/road-services", icon: Truck },
      { name: "إعفاء رسوم الحادث", href: "/admin/accident-fee-services", icon: Shield },
      { name: "قوالب الفواتير", href: "/admin/invoice-templates", icon: FileText },
      { name: "توقيعات العملاء", href: "/admin/customer-signatures", icon: FileSignature },
      { name: "إعدادات الدفع", href: "/admin/payment-settings", icon: CreditCard },
      { name: "إعدادات SMS", href: "/admin/sms-settings", icon: MessageSquare },
      { name: "إعدادات المصادقة", href: "/admin/auth-settings", icon: Settings },
      { name: "سجل الرسائل", href: "/sms-history", icon: History },
      { name: "استيراد WordPress", href: "/admin/wordpress-import", icon: Upload },
      { name: "إعلانات النظام", href: "/admin/announcements", icon: Megaphone, superAdminOnly: true },
    ],
  },
];

function SidebarContent({ collapsed, onCollapse, onNavigate }: { 
  collapsed: boolean; 
  onCollapse?: (val: boolean) => void;
  onNavigate?: () => void;
}) {
  const [signingOut, setSigningOut] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut, isAdmin, branchName } = useAuth();

  const isSuperAdmin = profile?.email === SUPER_ADMIN_EMAIL;

  // Filter groups and items based on role
  const filteredGroups = navigationGroups
    .filter(group => !group.adminOnly || isAdmin)
    .map(group => ({
      ...group,
      items: group.items.filter(item => {
        if (item.superAdminOnly && !isSuperAdmin) return false;
        if (item.adminOnly && !isAdmin) return false;
        return true;
      }),
    }))
    .filter(group => group.items.length > 0);

  // Check if any item in a group is active
  const isGroupActive = (group: NavGroup) => {
    return group.items.some(item => location.pathname === item.href);
  };

  // Initialize open states - all groups open by default
  useEffect(() => {
    const initialState: Record<string, boolean> = {};
    filteredGroups.forEach(group => {
      initialState[group.name] = true; // All groups open by default
    });
    setOpenGroups(initialState);
  }, []);

  // Update open state when route changes
  useEffect(() => {
    filteredGroups.forEach(group => {
      if (isGroupActive(group)) {
        setOpenGroups(prev => ({ ...prev, [group.name]: true }));
      }
    });
  }, [location.pathname]);

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
    navigate('/login', { replace: true });
  };

  const handleNavClick = () => {
    onNavigate?.();
  };

  const toggleGroup = (groupName: string) => {
    setOpenGroups(prev => ({ ...prev, [groupName]: !prev[groupName] }));
  };

  const userName = profile?.full_name || profile?.email?.split('@')[0] || 'مستخدم';
  const userInitial = userName.charAt(0);
  const userRole = isAdmin ? 'مدير' : 'موظف';
  const userBranch = branchName;

  const renderBadge = (item: NavItem) => {
    if (!item.badge) return null;
    if (item.badge === 'notifications') return <SidebarNotificationBadge collapsed={collapsed} />;
    if (item.badge === 'debt') return <SidebarDebtBadge collapsed={collapsed} />;
    if (item.badge === 'tasks') return <SidebarTaskBadge collapsed={collapsed} />;
    if (item.badge === 'claims') return <SidebarClaimsBadge collapsed={collapsed} />;
    return null;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-4">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <span className="text-sm font-bold text-primary-foreground">AB</span>
            </div>
            <span className="text-base font-semibold text-sidebar-foreground">
              AB تأمين
            </span>
          </div>
        )}
        {collapsed && (
          <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
            <span className="text-sm font-bold text-primary-foreground">AB</span>
          </div>
        )}
      </div>

      {/* Search */}
      <SidebarSearch collapsed={collapsed} onNavigate={onNavigate} />

      {/* Navigation */}
      <nav className="flex-1 flex flex-col gap-1 p-2 overflow-y-auto">
        {filteredGroups.map((group) => {
          const isOpen = openGroups[group.name] ?? false;
          const GroupIcon = group.icon;
          
          if (collapsed) {
            // When collapsed, show only icons without groups
            return (
              <div key={group.name} className="space-y-1">
                {group.items.map((item) => {
                  const isActiveRoute = location.pathname === item.href;
                  return (
                    <NavLink
                      key={item.name}
                      to={item.href}
                      onClick={handleNavClick}
                      title={item.name}
                      className={cn(
                        "flex items-center justify-center rounded-lg p-2.5 transition-all duration-200 relative",
                        isActiveRoute
                          ? "bg-primary/10 text-primary"
                          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      )}
                    >
                      <item.icon className={cn("h-5 w-5", isActiveRoute && "text-primary")} />
                      {renderBadge(item)}
                    </NavLink>
                  );
                })}
              </div>
            );
          }

          return (
            <Collapsible
              key={group.name}
              open={isOpen}
              onOpenChange={() => toggleGroup(group.name)}
            >
              <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-muted/50 rounded-lg transition-colors uppercase tracking-wide">
                <div className="flex items-center gap-2">
                  <GroupIcon className="h-4 w-4" />
                  <span>{group.name}</span>
                </div>
                <ChevronDown 
                  className={cn(
                    "h-3.5 w-3.5 transition-transform duration-200",
                    isOpen && "rotate-180"
                  )} 
                />
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-1 mr-2 space-y-0.5">
                {group.items.map((item) => {
                  const isActiveRoute = location.pathname === item.href;
                  return (
                    <NavLink
                      key={item.name}
                      to={item.href}
                      onClick={handleNavClick}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 relative",
                        isActiveRoute
                          ? "bg-primary/10 text-primary"
                          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      )}
                    >
                      <item.icon className={cn("h-4 w-4 flex-shrink-0", isActiveRoute && "text-primary")} />
                      <span>{item.name}</span>
                      {renderBadge(item)}
                    </NavLink>
                  );
                })}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </nav>

      {/* Collapse toggle - only on desktop */}
      {onCollapse && (
        <div className="px-3 pb-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onCollapse(!collapsed)}
            className={cn(
              "w-full justify-center text-muted-foreground hover:text-foreground",
              collapsed && "px-2"
            )}
          >
            {collapsed ? (
              <ChevronLeft className="h-4 w-4" />
            ) : (
              <>
                <ChevronRight className="h-4 w-4" />
                <span className="mr-2">تصغير</span>
              </>
            )}
          </Button>
        </div>
      )}

      {/* User section */}
      <div className="border-t border-sidebar-border p-3">
        <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
            <span className="text-sm font-medium text-primary">{userInitial}</span>
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium text-sidebar-foreground">
                {userName}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {userRole}{userBranch ? ` • ${userBranch}` : ''}
              </p>
            </div>
          )}
          {!collapsed && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={handleSignOut}
              disabled={signingOut}
            >
              {signingOut ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  return (
    <>
      {/* Mobile hamburger button - fixed top right */}
      <Button
        variant="outline"
        size="icon"
        className="fixed top-4 right-4 z-50 md:hidden bg-background shadow-md"
        onClick={() => setMobileOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Mobile drawer */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent 
          side="right" 
          className="w-64 p-0 bg-sidebar border-l border-sidebar-border"
        >
          <SidebarContent 
            collapsed={false} 
            onNavigate={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>

      {/* Desktop sidebar - hidden on mobile */}
      <aside
        className={cn(
          "fixed right-0 top-0 z-40 h-screen border-l border-sidebar-border bg-sidebar transition-all duration-300 shadow-sm hidden md:block",
          collapsed ? "w-16" : "w-64"
        )}
      >
        <SidebarContent 
          collapsed={collapsed} 
          onCollapse={setCollapsed}
        />
      </aside>
    </>
  );
}

// Export for MainLayout to know sidebar width
export function useSidebarWidth() {
  return { desktop: 256, collapsed: 64 };
}
