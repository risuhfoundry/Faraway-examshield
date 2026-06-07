"use client";

import { motion } from "framer-motion";
import { AlertTriangle, MessageSquare, ShieldBan, FileWarning } from "lucide-react";
import { cn } from "@/lib/utils";

const alerts = [
  { id: 1, type: "critical", message: "Unauthorized device detected near printing terminal at Center 12A.", time: "2 mins ago", status: "Open" },
  { id: 2, type: "warning", message: "Network latency spike during decryption key broadcast.", time: "15 mins ago", status: "Investigating" },
  { id: 3, type: "telegram", message: "Telegram bot forwarded suspicious image from dark web group.", time: "1 hour ago", status: "Resolved" },
  { id: 4, type: "critical", message: "Biometric authentication failed for Chief Invigilator ID 402.", time: "2 hours ago", status: "Open" },
];

export default function AlertCenter() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-white">Alert Command Center</h1>
          <p className="text-white/60 text-sm mt-1">Real-time incidents and automated notifications.</p>
        </div>
        <div className="px-4 py-2 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm font-medium rounded-md animate-pulse flex items-center gap-2">
           <AlertTriangle className="w-4 h-4" />
           2 Critical Active
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 space-y-4">
           {alerts.map((alert, i) => (
             <motion.div 
               key={alert.id}
               initial={{ opacity: 0, y: 10 }}
               animate={{ opacity: 1, y: 0 }}
               transition={{ delay: i * 0.1 }}
               className="glass-panel p-4 rounded-xl border border-white/5 flex items-start gap-4 hover:bg-white/[0.02] transition-colors cursor-pointer group"
             >
               <div className={cn(
                 "p-2 rounded-lg mt-1",
                 alert.type === 'critical' ? "bg-rose-500/10 text-rose-400" :
                 alert.type === 'warning' ? "bg-amber-500/10 text-amber-400" :
                 "bg-blue-500/10 text-blue-400"
               )}>
                 {alert.type === 'critical' && <ShieldBan className="w-5 h-5" />}
                 {alert.type === 'warning' && <FileWarning className="w-5 h-5" />}
                 {alert.type === 'telegram' && <MessageSquare className="w-5 h-5" />}
               </div>
               <div className="flex-1">
                 <div className="flex items-center justify-between">
                   <h4 className={cn("font-medium", alert.type === 'critical' ? "text-rose-400" : "text-white")}>
                     {alert.type === 'telegram' ? 'Telegram OSINT' : 'Security Event'}
                   </h4>
                   <span className="text-xs text-white/40">{alert.time}</span>
                 </div>
                 <p className="text-sm text-white/70 mt-1">{alert.message}</p>
                 <div className="mt-3 flex items-center gap-2">
                   <span className={cn(
                     "text-[10px] px-2 py-0.5 rounded-full border uppercase tracking-wider font-semibold",
                     alert.status === 'Open' ? "border-rose-500/30 text-rose-400 bg-rose-500/10" :
                     alert.status === 'Investigating' ? "border-amber-500/30 text-amber-400 bg-amber-500/10" :
                     "border-white/10 text-white/40"
                   )}>
                     {alert.status}
                   </span>
                 </div>
               </div>
             </motion.div>
           ))}
        </div>

        <div className="space-y-6">
           <div className="glass-panel rounded-xl p-5 border border-white/5">
              <h3 className="text-sm font-medium text-white mb-4">Notification Channels</h3>
              <div className="space-y-3">
                 <div className="flex items-center justify-between p-2 rounded bg-white/5">
                    <span className="text-sm text-white/80">Telegram Bots</span>
                    <div className="w-8 h-4 bg-brand rounded-full relative">
                       <div className="absolute right-1 top-1 w-2 h-2 bg-black rounded-full" />
                    </div>
                 </div>
                 <div className="flex items-center justify-between p-2 rounded bg-white/5">
                    <span className="text-sm text-white/80">SMS Gateways</span>
                    <div className="w-8 h-4 bg-brand rounded-full relative">
                       <div className="absolute right-1 top-1 w-2 h-2 bg-black rounded-full" />
                    </div>
                 </div>
                 <div className="flex items-center justify-between p-2 rounded bg-white/5">
                    <span className="text-sm text-white/80">Email Alerts</span>
                    <div className="w-8 h-4 bg-white/20 rounded-full relative">
                       <div className="absolute left-1 top-1 w-2 h-2 bg-white/50 rounded-full" />
                    </div>
                 </div>
              </div>
           </div>

           <div className="glass-panel rounded-xl p-5 border border-rose-500/20 bg-rose-500/5 relative overflow-hidden">
              <div className="absolute -right-10 -bottom-10 w-32 h-32 bg-rose-500/20 blur-3xl rounded-full" />
              <h3 className="text-sm font-medium text-rose-400 mb-2">Emergency Override</h3>
              <p className="text-xs text-white/60 mb-4">Initiate global exam lockdown protocol. Requires multi-factor authorization.</p>
              <button className="w-full py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 text-sm font-semibold rounded border border-rose-500/30 transition-colors">
                 INITIATE LOCKDOWN
              </button>
           </div>
        </div>
      </div>
    </div>
  );
}
