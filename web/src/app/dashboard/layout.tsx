"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  ShieldAlert, 
  Activity, 
  Crosshair, 
  Map, 
  BellRing,
  Files,
  Settings,
  LogOut,
  ChevronRight
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { name: "Command Center", href: "/dashboard", icon: Activity },
  { name: "Evidence Center", href: "/dashboard/evidence", icon: Files },
  { name: "Threat Intelligence", href: "/dashboard/threats", icon: Crosshair },
  { name: "Investigation", href: "/dashboard/investigation", icon: Map },
  { name: "Exam Lifecycle", href: "/dashboard/lifecycle", icon: ShieldAlert },
  { name: "Alerts", href: "/dashboard/alerts", icon: BellRing },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex h-screen bg-black overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-72 border-r border-white/10 bg-black flex flex-col z-20">
        <div className="h-20 flex items-center px-8 border-b border-white/10">
          <Link href="/" className="flex items-center gap-2 group">
            <span className="font-heading font-bold text-xl tracking-[0.2em] text-white">EXAMSHIELD</span>
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto py-8 px-4 flex flex-col gap-2">
          <div className="px-4 mb-4 text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">Operations Grid</div>
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            
            return (
              <Link key={item.name} href={item.href}>
                <div className={cn(
                  "relative flex items-center gap-4 px-4 py-3 rounded-none transition-colors text-xs font-semibold uppercase tracking-widest",
                  isActive ? "text-black bg-white" : "text-white/50 hover:text-white hover:bg-white/5"
                )}>
                  <Icon className={cn("w-4 h-4", isActive ? "text-black" : "text-white/50")} />
                  {item.name}
                </div>
              </Link>
            );
          })}
        </div>

        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-4 px-4 py-3 text-white/50 hover:text-white transition-colors cursor-pointer rounded-none hover:bg-white/5">
            <Settings className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-widest">Settings</span>
          </div>
          <div className="flex items-center gap-4 px-4 py-3 text-white/50 hover:text-white transition-colors cursor-pointer rounded-none hover:bg-white/5 mt-1">
            <LogOut className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-widest">System Exit</span>
          </div>
          
          <div className="mt-8 px-4 flex items-center gap-4">
             <div className="w-10 h-10 rounded-none bg-white flex items-center justify-center">
               <span className="text-xs text-black font-bold font-heading">OP</span>
             </div>
             <div className="flex flex-col">
               <span className="text-xs font-bold text-white uppercase tracking-widest">Operator 07</span>
               <span className="text-[10px] text-white/50 uppercase tracking-widest">Secure Connect</span>
             </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col relative z-10 overflow-hidden bg-[#050505]">
        {/* Topbar */}
        <header className="h-20 border-b border-white/10 bg-black/80 backdrop-blur-xl flex items-center justify-between px-8 shrink-0">
          <div className="flex items-center gap-3 text-xs uppercase tracking-widest font-semibold text-white/40">
            <span>Operations</span>
            <ChevronRight className="w-3 h-3" />
            <span className="text-white">
              {pathname === '/dashboard' ? 'Command Center' : pathname.split('/').pop()}
            </span>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-none bg-white border border-white text-black text-[10px] uppercase tracking-[0.2em] font-bold">
              <div className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" />
              SYSTEM SECURE
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 scroll-smooth">
          <div className="max-w-[1400px] mx-auto w-full">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
