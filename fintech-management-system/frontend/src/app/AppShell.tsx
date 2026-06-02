import { useMemo, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  BarChart3,
  Building2,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Coins,
  CreditCard,
  FileBarChart2,
  LayoutDashboard,
  Menu,
  ReceiptText,
  Shield,
  Truck,
  Users,
} from "lucide-react";

import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/AuthContext";
import type { UserRole } from "@/lib/types";

type NavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: UserRole[];
};

function initials(name: string | undefined): string {
  const chunks = (name ?? "User").trim().split(/\s+/).filter(Boolean);
  return chunks
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase() ?? "")
    .join("");
}

function roleLabel(role: UserRole | undefined): string {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  if (role === "business_manager") return "Company Manager";
  return "Branch Manager";
}

const NAV_ITEMS: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/invoices", label: "Invoices", icon: ReceiptText },
  { to: "/costs", label: "Costs", icon: Coins },
  { to: "/payments", label: "Payments", icon: CreditCard },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/vendors", label: "Vendors", icon: Truck },
  { to: "/reports", label: "Reports", icon: FileBarChart2 },
  { to: "/admin", label: "Admin", icon: Shield, roles: ["admin", "owner"] },
];

function pageTitleFromPath(pathname: string): string {
  if (pathname.startsWith("/dashboard")) return "Dashboard";
  if (pathname.startsWith("/invoices")) return "Invoices";
  if (pathname.startsWith("/costs")) return "Costs";
  if (pathname.startsWith("/payments")) return "Payments";
  if (pathname.startsWith("/customers")) return "Customers";
  if (pathname.startsWith("/vendors")) return "Vendors";
  if (pathname.startsWith("/reports")) return "Reports";
  if (pathname.startsWith("/admin")) return "Admin";
  return "FinTech Management System";
}

function NavList({ collapsed, role, onNavigate }: { collapsed: boolean; role: UserRole | undefined; onNavigate?: () => void }) {
  const location = useLocation();
  const pathname = location.pathname;
  const items = useMemo(() => {
    return NAV_ITEMS.filter((item) => !item.roles || (role ? item.roles.includes(role) : false));
  }, [role]);

  return (
    <TooltipProvider delayDuration={100}>
      <nav className="flex flex-col gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          const isCurrent = pathname === item.to || pathname.startsWith(`${item.to}/`);
          return (
            <Tooltip key={item.to}>
              <TooltipTrigger asChild>
                <NavLink
                  to={item.to}
                  onClick={onNavigate}
                  className={cn(
                    "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent/70 hover:text-accent-foreground",
                    isCurrent &&
                      "bg-accent text-accent-foreground after:absolute after:left-0 after:top-1 after:bottom-1 after:w-1 after:rounded-r after:bg-primary",
                    collapsed && "justify-center px-2",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {collapsed ? null : <span className="truncate">{item.label}</span>}
                </NavLink>
              </TooltipTrigger>
              {collapsed ? (
                <TooltipContent side="right">
                  <span>{item.label}</span>
                </TooltipContent>
              ) : null}
            </Tooltip>
          );
        })}
      </nav>
    </TooltipProvider>
  );
}

export function AppShell() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const title = pageTitleFromPath(location.pathname);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("sidebar_collapsed") === "1");

  const branchLabel = user?.branch_id ? user.branch_id.slice(0, 8) : "Unassigned";

  const toggleCollapsed = () => {
    setCollapsed((value) => {
      const next = !value;
      localStorage.setItem("sidebar_collapsed", next ? "1" : "0");
      return next;
    });
  };

  return (
    <div className="flex min-h-screen bg-background">
      <aside className={cn("relative hidden border-r bg-card md:flex md:flex-col", collapsed ? "w-16" : "w-64")}>
        <div className={cn("flex h-14 items-center gap-2 border-b px-3", collapsed && "justify-center px-2")}>
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Building2 className="h-4 w-4" />
          </div>
          {collapsed ? null : (
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">FinTech MS</div>
              <div className="truncate text-xs text-muted-foreground">Phase 1 Console</div>
            </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-2 pb-16">
          <NavList collapsed={collapsed} role={user?.role} />
        </div>
        <div className={cn("sticky bottom-0 left-0 border-t bg-card p-2", collapsed && "flex justify-center")}>
          <Button
            variant="outline"
            size={collapsed ? "icon" : "sm"}
            onClick={toggleCollapsed}
            className={cn("border-border/70 bg-background text-foreground", !collapsed && "w-full justify-between")}
          >
            {collapsed ? <ChevronsRight /> : <ChevronsLeft />}
            {collapsed ? null : <span>Collapse</span>}
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur">
          <div className="md:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Open navigation">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-0">
                <div className="flex h-14 items-center gap-2 border-b px-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                    <BarChart3 className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">FinTech MS</div>
                    <div className="truncate text-xs text-muted-foreground">Phase 1 Console</div>
                  </div>
                </div>
                <div className="p-2">
                  <NavList collapsed={false} role={user?.role} onNavigate={() => undefined} />
                </div>
              </SheetContent>
            </Sheet>
          </div>

          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{title}</div>
            <div className="truncate text-xs text-muted-foreground">{roleLabel(user?.role)} · {branchLabel}</div>
          </div>

          <ThemeToggle />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2 border-border/70 bg-background text-foreground">
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted text-xs font-semibold ring-1 ring-border">
                  {initials(user?.name)}
                </div>
                <span className="hidden max-w-[160px] truncate text-sm md:inline">{user?.name ?? "User"}</span>
                <ChevronDown className="h-4 w-4 opacity-70" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuLabel className="space-y-1">
                <div className="text-sm font-medium leading-none">{user?.name ?? "User"}</div>
                <div className="text-xs font-normal text-muted-foreground">{user?.email ?? ""}</div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={logout}>Sign out</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        <main className="flex-1">
          <div className="mx-auto w-full max-w-[1400px] p-4 md:p-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
