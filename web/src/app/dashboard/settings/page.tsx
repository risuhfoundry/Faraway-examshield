"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { User, Mail, Save, Loader2, CheckCircle2, Shield } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [initialName, setInitialName] = useState("");
  const [initialEmail, setInitialEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadUser() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        const name = (user.user_metadata?.full_name as string) ?? "";
        const userEmail = user.email ?? "";
        setFullName(name);
        setEmail(userEmail);
        setInitialName(name);
        setInitialEmail(userEmail);
      }
      setLoading(false);
    }

    loadUser();
  }, []);

  const hasChanges = fullName !== initialName || email !== initialEmail;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    const supabase = createClient();

    const { error: updateError } = await supabase.auth.updateUser({
      data: { full_name: fullName },
    });

    if (updateError) {
      setError(updateError.message);
      setSaving(false);
      return;
    }

    setInitialName(fullName);
    setInitialEmail(email);
    setSaved(true);
    setSaving(false);

    setTimeout(() => setSaved(false), 3000);
  }

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="flex items-end justify-between border-b border-white/10 pb-6">
          <div>
            <h1 className="text-4xl font-heading font-bold tracking-widest text-white uppercase">Settings</h1>
            <p className="text-white/50 text-xs font-mono uppercase tracking-widest mt-2">Account configuration and personal information.</p>
          </div>
        </div>
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="w-6 h-6 text-white/40 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between border-b border-white/10 pb-6">
        <div>
          <h1 className="text-4xl font-heading font-bold tracking-widest text-white uppercase">Settings</h1>
          <p className="text-white/50 text-xs font-mono uppercase tracking-widest mt-2">Account configuration and personal information.</p>
        </div>
        {saved && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-widest"
          >
            <CheckCircle2 className="w-4 h-4" />
            Saved
          </motion.div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-1"
        >
          <div className="glass-panel border border-white/10 p-6">
            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 bg-white flex items-center justify-center mb-4">
                <span className="text-2xl text-black font-bold font-heading">
                  {fullName ? fullName.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) : "U"}
                </span>
              </div>
              <h3 className="text-lg font-bold text-white uppercase tracking-widest">
                {fullName || "Operator"}
              </h3>
              <p className="text-xs text-white/45 mt-1 font-mono">{email}</p>

              <div className="w-full mt-6 pt-6 border-t border-white/10 space-y-3">
                <div className="flex items-center gap-3 text-xs text-white/40">
                  <Shield className="w-4 h-4 shrink-0" />
                  <span className="uppercase tracking-widest">Operator Access</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-white/40">
                  <Mail className="w-4 h-4 shrink-0" />
                  <span className="truncate">{email}</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Edit Form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-2"
        >
          <div className="glass-panel border border-white/10 p-6 sm:p-8">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/60 mb-8">Personal Information</h2>

            {error && (
              <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-sm text-red-400">
                {error}
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-6">
              {/* Full Name */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Full Name</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-zinc-500" />
                  </div>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-11 pr-4 text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-white/20 transition-all text-sm"
                    placeholder="Jane Doe"
                    required
                    disabled={saving}
                  />
                </div>
              </div>

              {/* Email (read-only) */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Email Address</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-zinc-500" />
                  </div>
                  <input
                    type="email"
                    value={email}
                    readOnly
                    className="w-full bg-white/[0.02] border border-white/5 rounded-xl py-3 pl-11 pr-4 text-white/40 cursor-not-allowed text-sm"
                  />
                </div>
                <p className="text-[11px] text-white/30 uppercase tracking-widest">Email is managed by your authentication provider</p>
              </div>

              {/* Save Button */}
              <div className="pt-4">
                <button
                  type="submit"
                  disabled={saving || !hasChanges}
                  className={cn(
                    "flex items-center justify-center gap-2 px-6 py-3 text-xs font-bold uppercase tracking-[0.15em] transition-all",
                    hasChanges
                      ? "bg-white text-black hover:bg-zinc-200"
                      : "bg-white/10 text-white/30 cursor-not-allowed"
                  )}
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Save Changes
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Account Info */}
          <div className="glass-panel border border-white/10 p-6 sm:p-8 mt-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/60 mb-6">Account Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-white/35 mb-1">Auth Provider</div>
                <div className="text-sm text-white/80">Supabase Auth</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-white/35 mb-1">Account Status</div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="text-sm text-white/80">Active</span>
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-white/35 mb-1">Role</div>
                <div className="text-sm text-white/80">Operator</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-white/35 mb-1">Session</div>
                <div className="text-sm text-white/80">Authenticated</div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
