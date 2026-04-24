import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Activity, Database, List, Upload, Download, BookOpen, ShieldAlert, Loader2 } from "lucide-react";
import { useGetStats, getGetStatsQueryKey } from "@workspace/api-client-react";

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const [location] = useLocation();

  const { data: stats, isLoading } = useGetStats({
    query: { queryKey: getGetStatsQueryKey() },
  });

  const navItems = [
    { href: "/", label: "Dashboard", icon: Activity },
    { href: "/feeds", label: "Feeds", icon: Database },
    { href: "/indicators", label: "Indicators", icon: List },
    { href: "/import", label: "Import", icon: Upload },
    { href: "/export", label: "Export", icon: Download },
    { href: "/docs", label: "Documentation", icon: BookOpen },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground dark">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-sidebar flex flex-col">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <ShieldAlert className="w-6 h-6 text-primary" />
          <span className="font-bold text-sm uppercase tracking-wider text-sidebar-foreground">Global Threat Intel</span>
        </div>
        
        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  <item.icon className="w-4 h-4" />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-2 h-2 rounded-full ${isLoading ? 'bg-yellow-500 animate-pulse' : 'bg-green-500'}`} />
            <span className="text-xs font-mono font-medium text-muted-foreground uppercase tracking-wider">System Status</span>
          </div>
          {isLoading ? (
            <div className="flex items-center justify-center p-2">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          ) : stats ? (
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Total Indicators</span>
                <span className="font-mono text-primary">{stats.total_indicators.toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Active Feeds</span>
                <span className="font-mono text-foreground">{stats.active_feeds} / {stats.total_feeds}</span>
              </div>
              <div className="flex justify-between text-xs mt-2">
                <span className="text-muted-foreground">Last Update</span>
                <span className="font-mono text-foreground">{stats.last_update ? new Date(stats.last_update).toLocaleTimeString() : 'Never'}</span>
              </div>
            </div>
          ) : (
            <div className="text-xs text-destructive">Failed to load stats</div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-background">
        {children}
      </main>
    </div>
  );
}
