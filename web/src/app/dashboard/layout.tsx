"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldAlert,
  Activity,
  Bot,
  Crosshair,
  Map,
  BellRing,
  Files,
  Settings,
  LogOut,
  ChevronRight,
  RefreshCcw,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

const NAV_ITEMS = [
  { name: "Command Center", href: "/dashboard", icon: Activity },
  { name: "EXAMSHIELD AI", href: "/dashboard/ai", icon: Bot },
  { name: "Evidence Center", href: "/dashboard/evidence", icon: Files },
  { name: "Threat Intelligence", href: "/dashboard/threats", icon: Crosshair },
  { name: "Investigation", href: "/dashboard/investigation", icon: Map },
  { name: "Exam Lifecycle", href: "/dashboard/lifecycle", icon: ShieldAlert },
  { name: "Alerts", href: "/dashboard/alerts", icon: BellRing },
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [resetting, setResetting] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userName, setUserName] = useState<string | null>(null);
  const [loadingUser, setLoadingUser] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser();
      setUserEmail(user?.email ?? null);
      const name = user?.user_metadata?.full_name as string | undefined;
      setUserName(name ?? user?.email?.split("@")[0] ?? "User");
      setLoadingUser(false);
    }

    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "USER_UPDATED") {
        setUserEmail(session?.user?.email ?? null);
        const name = session?.user?.user_metadata?.full_name as string | undefined;
        setUserName(name ?? session?.user?.email?.split("@")[0] ?? "User");
      } else if (event === "SIGNED_OUT") {
        setUserEmail(null);
        setUserName(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileOpen]);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  async function resetEnvironment() {
    setResetting(true);
    try {
      const response = await fetch("/demo/reset", { method: "POST" });
      if (!response.ok) throw new Error("Demo reset failed.");
      window.location.reload();
    } finally {
      setResetting(false);
    }
  }

  const userInitials = loadingUser
    ? ".."
    : userName?.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) ?? "OP";

  const pageLabel = pathname === "/dashboard"
    ? "Command Center"
    : NAV_ITEMS.find((n) => n.href === pathname)?.name ?? pathname.split("/").pop();

  return (
    <div className="flex h-[100dvh] bg-black overflow-hidden font-sans">

      {/* ─── Desktop Sidebar ─── */}
      <aside className="hidden lg:flex lg:w-72 border-r border-white/10 bg-black flex-col z-20 shrink-0">
        <div className="h-20 flex items-center px-8 border-b border-white/10 shrink-0">
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

        <div className="p-4 border-t border-white/10 shrink-0">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-4 px-4 py-3 text-white/50 hover:text-white transition-colors cursor-pointer rounded-none hover:bg-white/5"
          >
            <LogOut className="w-4 h-4" />
            <span className="text-xs font-semibold uppercase tracking-widest">System Exit</span>
          </button>
          <div className="mt-8 px-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-none bg-white flex items-center justify-center shrink-0">
              <span className="text-xs text-black font-bold font-heading">{userInitials}</span>
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="text-xs font-bold text-white uppercase tracking-widest truncate">
                {loadingUser ? "Loading..." : userName ?? "Operator"}
              </span>
              <span className="text-[10px] text-white/50 uppercase tracking-widest truncate">
                {userEmail ?? "Secure Connect"}
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* ─── Mobile Sidebar Overlay ─── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed inset-y-0 left-0 w-72 bg-black border-r border-white/10 z-50 lg:hidden flex flex-col"
            >
              <div className="h-16 flex items-center justify-between px-6 border-b border-white/10 shrink-0">
                <Link href="/" className="flex items-center gap-2">
                  <span className="font-heading font-bold text-lg tracking-[0.2em] text-white">EXAMSHIELD</span>
                </Link>
                <button onClick={() => setMobileOpen(false)} className="text-white/50 hover:text-white transition-colors p-1">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto py-6 px-3 flex flex-col gap-1">
                <div className="px-3 mb-3 text-[10px] font-bold text-white/30 uppercase tracking-[0.2em]">Operations Grid</div>
                {NAV_ITEMS.map((item) => {
                  const isActive = pathname === item.href;
                  const Icon = item.icon;
                  return (
                    <Link key={item.name} href={item.href}>
                      <div className={cn(
                        "flex items-center gap-4 px-4 py-3 rounded-none transition-colors text-xs font-semibold uppercase tracking-widest",
                        isActive ? "text-black bg-white" : "text-white/50 active:bg-white/10"
                      )}>
                        <Icon className={cn("w-4 h-4", isActive ? "text-black" : "text-white/50")} />
                        {item.name}
                      </div>
                    </Link>
                  );
                })}
              </div>

              <div className="p-4 border-t border-white/10 shrink-0">
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-4 px-4 py-3 text-white/50 hover:text-white transition-colors rounded-none hover:bg-white/5"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="text-xs font-semibold uppercase tracking-widest">System Exit</span>
                </button>
                <div className="mt-6 px-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-none bg-white flex items-center justify-center shrink-0">
                    <span className="text-xs text-black font-bold font-heading">{userInitials}</span>
                  </div>
                  <div className="flex flex-col overflow-hidden">
                    <span className="text-xs font-bold text-white uppercase tracking-widest truncate">
                      {loadingUser ? "Loading..." : userName ?? "Operator"}
                    </span>
                    <span className="text-[10px] text-white/50 uppercase tracking-widest truncate">
                      {userEmail ?? "Secure Connect"}
                    </span>
                  </div>
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ─── Main Content Area ─── */}
      <main className="flex-1 min-w-0 flex flex-col relative z-10 overflow-hidden bg-[#050505]">
        {/* Topbar */}
        <header className="h-14 lg:h-20 border-b border-white/10 bg-black/80 backdrop-blur-xl flex items-center justify-between gap-3 px-3 lg:px-8 shrink-0 relative z-20">
          <div className="flex items-center gap-3 min-w-0">
            {/* Hamburger */}
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden text-white/60 hover:text-white transition-colors p-1 -ml-1 shrink-0"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="min-w-0 flex items-center gap-2 text-xs uppercase tracking-widest font-semibold text-white/40">
              <span className="lg:hidden font-heading font-bold text-white tracking-[0.2em] text-sm">EXAMSHIELD</span>
              <ChevronRight className="hidden sm:block w-3 h-3" />
              <span className="text-white truncate text-sm sm:text-xs">{pageLabel}</span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3 lg:gap-4">
            <button
              type="button"
              onClick={resetEnvironment}
              disabled={resetting}
              className="flex items-center gap-2 px-2 sm:px-4 py-1.5 border border-white/20 bg-white/[0.03] text-white text-[10px] uppercase tracking-[0.2em] font-bold hover:border-white/50 disabled:opacity-40"
              title="Reset Environment"
            >
              <RefreshCcw className={cn("w-3.5 h-3.5", resetting && "animate-spin")} />
              <span className="hidden sm:inline">{resetting ? "Resetting" : "Reset"}</span>
            </button>
            <div className="hidden md:flex items-center gap-2 px-4 py-1.5 rounded-none bg-white border border-white text-black text-[10px] uppercase tracking-[0.2em] font-bold">
              <div className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" />
              SYSTEM SECURE
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 lg:p-8 scroll-smooth pb-6 lg:pb-8">
          <div className="max-w-[1400px] mx-auto w-full h-full">{children}</div>
        </div>
      </main>
    </div>
  );
}
