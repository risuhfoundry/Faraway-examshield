"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, FileStack, Hourglass, Loader2, XCircle, Upload, X } from "lucide-react";
import type { EvidenceListResponse } from "@/lib/evidence-types";
import {
  formatEvidenceDateTime,
  formatEvidenceSource,
  formatEvidenceStatus,
  formatOcrStatus,
} from "@/lib/evidence-format";
import { cn } from "@/lib/utils";

const emptyState: EvidenceListResponse = {
  evidence: [],
  activity: [],
  jobs: [],
  attributions: [],
  watermarks: [],
  forensicReports: [],
  telegramEvents: [],
  alerts: [],
  stats: {
    totalEvidence: 0,
    pendingAnalysis: 0,
    processing: 0,
    completed: 0,
    failed: 0,
  },
};

export default function EvidenceCenter() {
  const [data, setData] = useState<EvidenceListResponse>(emptyState);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;

    async function loadEvidence() {
      try {
        const response = await fetch("/evidence", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Unable to load evidence.");
        }
        const payload = (await response.json()) as EvidenceListResponse;
        if (active) {
          setData(payload);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadEvidence();
    const interval = window.setInterval(loadEvidence, 3000);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  async function handleFileUpload(files: FileList | null) {
    if (!files || files.length === 0) return;

    setUploading(true);
    const names: string[] = [];

    for (const file of Array.from(files)) {
      names.push(file.name);
      const formData = new FormData();
      formData.append("file", file);

      try {
        await fetch("/evidence/upload", { method: "POST", body: formData });
      } catch {
        // silently fail individual uploads
      }
    }

    setUploadQueue((prev) => [...prev, ...names]);
    setUploading(false);
    setTimeout(() => setUploadQueue([]), 4000);

    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const stats = useMemo(
    () => [
      { label: "Total Evidence", value: data.stats.totalEvidence, icon: FileStack },
      { label: "Pending Analysis", value: data.stats.pendingAnalysis, icon: Hourglass },
      { label: "Processing", value: data.stats.processing, icon: Loader2 },
      { label: "Completed", value: data.stats.completed, icon: CheckCircle2 },
      { label: "Failed", value: data.stats.failed, icon: XCircle },
    ],
    [data.stats],
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between border-b border-white/10 pb-6">
        <div>
          <h1 className="text-3xl sm:text-4xl font-heading font-bold tracking-widest text-white uppercase">
            Evidence Center
          </h1>
          <p className="text-white/50 text-xs font-mono uppercase tracking-widest mt-1 sm:mt-2">
            Stored uploads awaiting forensic analysis.
          </p>
        </div>
        <label className="hidden sm:flex items-center gap-2 px-4 py-2 bg-white text-black text-xs font-bold uppercase tracking-widest cursor-pointer hover:bg-zinc-200 transition-colors shrink-0">
          <Upload className="w-4 h-4" />
          Upload
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            accept="image/*,application/pdf"
            onChange={(e) => handleFileUpload(e.target.files)}
          />
        </label>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-6">
        {stats.map((item, index) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="glass-panel p-4 sm:p-6 flex flex-col gap-4 sm:gap-8"
          >
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="p-2 sm:p-3 bg-white/5 border border-white/10">
                <item.icon className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              </div>
              <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-[0.1em] text-white/50 truncate">
                {item.label}
              </span>
            </div>
            <div className="text-2xl sm:text-4xl font-heading font-bold text-white">{item.value}</div>
          </motion.div>
        ))}
      </div>

      {/* Evidence List */}
      <div className="glass-panel">
        <div className="p-4 sm:p-6 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-xs sm:text-sm font-semibold uppercase tracking-[0.16em] text-white/60">
            Latest Evidence
          </h2>
          <div className="flex items-center gap-3">
            {uploadQueue.length > 0 && (
              <motion.span
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-[10px] text-emerald-400 font-mono uppercase tracking-widest"
              >
                +{uploadQueue.length} uploaded
              </motion.span>
            )}
            <span className="text-[10px] font-mono uppercase tracking-widest text-white/40">
              {loading ? "Syncing" : `${data.evidence.length} Records`}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 p-3 sm:p-4">
          {data.evidence.map((item, index) => {
            const attribution = data.attributions.find(
              (report) => report.evidenceId === item.evidenceId,
            );
            const watermark = data.watermarks.find(
              (report) => report.evidenceId === item.evidenceId,
            );
            const forensicReport = data.forensicReports.find(
              (report) => report.evidenceId === item.evidenceId,
            );

            return (
            <motion.div
              key={item.evidenceId}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
              className="border border-white/10 bg-white/[0.02] p-4 sm:p-5 flex flex-col gap-4 sm:gap-5 hover:border-white/25 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs sm:text-sm font-mono text-white tracking-wider break-all">
                    {item.evidenceId}
                  </div>
                  <div className="text-base sm:text-lg text-white mt-1 sm:mt-2 break-all">{item.filename}</div>
                </div>
                <span className="shrink-0 text-[10px] uppercase tracking-widest px-2 py-1 bg-white text-black font-bold">
                  {formatEvidenceStatus(item.status)}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 text-xs">
                <div>
                  <div className="text-white/35 uppercase tracking-widest mb-1 text-[10px]">Source</div>
                  <div className="text-white/80 text-xs sm:text-sm">{formatEvidenceSource(item.source)}</div>
                </div>
                <div>
                  <div className="text-white/35 uppercase tracking-widest mb-1 text-[10px]">Risk</div>
                  <div className="text-white/80 uppercase text-xs sm:text-sm">{forensicReport?.riskLevel ?? item.riskLevel}</div>
                </div>
                <div>
                  <div className="text-white/35 uppercase tracking-widest mb-1 text-[10px]">OCR</div>
                  <div className="text-white/80 text-xs sm:text-sm">{formatOcrStatus(item.ocrStatus)}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3 text-xs border-t border-white/10 pt-4">
                <div>
                  <div className="text-white/35 uppercase tracking-widest mb-1 text-[10px]">Time</div>
                  <div className="text-white/80 text-xs sm:text-sm">{formatEvidenceDateTime(item.uploadedAt)}</div>
                </div>
                <div>
                  <div className="text-white/35 uppercase tracking-widest mb-1 text-[10px]">Confidence</div>
                  <div className="text-white/80 text-xs sm:text-sm">
                    {item.ocrConfidence === null ? "Pending" : `${item.ocrConfidence}%`}
                  </div>
                </div>
                <div>
                  <div className="text-white/35 uppercase tracking-widest mb-1 text-[10px]">Runtime</div>
                  <div className="text-white/80 text-xs sm:text-sm">
                    {item.ocrProcessingTimeMs === null ? "Pending" : `${item.ocrProcessingTimeMs} ms`}
                  </div>
                </div>
                <div>
                  <div className="text-white/35 uppercase tracking-widest mb-1 text-[10px]">Attribution</div>
                  <div className="text-white/80 text-xs sm:text-sm">
                    {attribution?.matchedPaperId ?? (attribution ? "No Match" : "Pending")}
                  </div>
                </div>
                <div>
                  <div className="text-white/35 uppercase tracking-widest mb-1 text-[10px]">Watermark</div>
                  <div className="text-white/80 text-xs sm:text-sm">
                    {watermark?.watermarkId ?? (watermark ? "Not Detected" : "Pending")}
                  </div>
                </div>
                <div>
                  <div className="text-white/35 uppercase tracking-widest mb-1 text-[10px]">Final</div>
                  <div className="text-white/80 text-xs sm:text-sm">
                    {forensicReport ? `${forensicReport.finalConfidence}%` : "Pending"}
                  </div>
                </div>
                <div>
                  <div className="text-white/35 uppercase tracking-widest mb-1 text-[10px]">Center</div>
                  <div className="text-white/80 text-xs sm:text-sm">
                    {forensicReport?.centerCode ?? attribution?.centerCode ?? "Pending"}
                  </div>
                </div>
              </div>
            </motion.div>
            );
          })}

          {!loading && data.evidence.length === 0 && (
            <div className="col-span-full min-h-[280px] sm:min-h-[320px] border border-dashed border-white/10 bg-white/[0.02] flex flex-col items-center justify-center text-center px-6 sm:px-8">
              <FileStack className="w-8 h-8 sm:w-10 sm:h-10 text-white/25 mb-4 sm:mb-5" />
              <div className="text-xl sm:text-2xl font-heading uppercase tracking-widest text-white">
                No Evidence Received
              </div>
              <p className="text-xs sm:text-sm text-white/45 mt-2 sm:mt-3 max-w-md">
                Waiting for examination intelligence. Manual uploads and monitored Telegram leaks will appear here.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Mobile Upload FAB */}
      <label className="lg:hidden fixed bottom-6 right-6 z-40 w-14 h-14 bg-white text-black rounded-full flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.15)] cursor-pointer hover:bg-zinc-200 transition-colors active:scale-95">
        {uploading ? (
          <Loader2 className="w-6 h-6 animate-spin" />
        ) : (
          <Upload className="w-6 h-6" />
        )}
        <input
          type="file"
          className="hidden"
          multiple
          accept="image/*,application/pdf"
          onChange={(e) => handleFileUpload(e.target.files)}
        />
      </label>
    </div>
  );
}
