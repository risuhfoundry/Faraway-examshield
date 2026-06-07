"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, FileStack, Hourglass, Loader2, XCircle } from "lucide-react";
import type { EvidenceListResponse } from "@/lib/evidence-types";
import { formatEvidenceDateTime, formatEvidenceStatus, formatOcrStatus } from "@/lib/evidence-format";

const emptyState: EvidenceListResponse = {
  evidence: [],
  activity: [],
  jobs: [],
  attributions: [],
  watermarks: [],
  forensicReports: [],
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
      <div className="flex items-end justify-between border-b border-white/10 pb-6">
        <div>
          <h1 className="text-4xl font-heading font-bold tracking-widest text-white uppercase">
            Evidence Center
          </h1>
          <p className="text-white/50 text-xs font-mono uppercase tracking-widest mt-2">
            Stored uploads awaiting forensic analysis.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-6">
        {stats.map((item, index) => (
          <motion.div
            key={item.label}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="glass-panel p-6 flex flex-col gap-8"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-white/5 border border-white/10">
                <item.icon className="w-5 h-5 text-white" />
              </div>
              <span className="text-xs font-semibold uppercase tracking-[0.1em] text-white/50">
                {item.label}
              </span>
            </div>
            <div className="text-4xl font-heading font-bold text-white">{item.value}</div>
          </motion.div>
        ))}
      </div>

      <div className="glass-panel">
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/60">
            Latest Evidence
          </h2>
          <span className="text-[10px] font-mono uppercase tracking-widest text-white/40">
            {loading ? "Syncing" : `${data.evidence.length} Records`}
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">
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
              className="border border-white/10 bg-white/[0.02] p-5 flex flex-col gap-5 hover:border-white/25 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-mono text-white tracking-wider">
                    {item.evidenceId}
                  </div>
                  <div className="text-lg text-white mt-2 break-all">{item.filename}</div>
                </div>
                <span className="shrink-0 text-[10px] uppercase tracking-widest px-2 py-1 bg-white text-black font-bold">
                  {formatEvidenceStatus(item.status)}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <div className="text-white/35 uppercase tracking-widest mb-1">Source</div>
                  <div className="text-white/80">Manual Upload</div>
                </div>
                <div>
                  <div className="text-white/35 uppercase tracking-widest mb-1">Risk</div>
                  <div className="text-white/80 capitalize">{item.riskLevel}</div>
                </div>
                <div>
                  <div className="text-white/35 uppercase tracking-widest mb-1">OCR</div>
                  <div className="text-white/80">{formatOcrStatus(item.ocrStatus)}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs border-t border-white/10 pt-4">
                <div>
                  <div className="text-white/35 uppercase tracking-widest mb-1">Time</div>
                  <div className="text-white/80">{formatEvidenceDateTime(item.uploadedAt)}</div>
                </div>
                <div>
                  <div className="text-white/35 uppercase tracking-widest mb-1">Confidence</div>
                  <div className="text-white/80">
                    {item.ocrConfidence === null ? "Pending" : `${item.ocrConfidence}%`}
                  </div>
                </div>
                <div>
                  <div className="text-white/35 uppercase tracking-widest mb-1">Runtime</div>
                  <div className="text-white/80">
                    {item.ocrProcessingTimeMs === null ? "Pending" : `${item.ocrProcessingTimeMs} ms`}
                  </div>
                </div>
                <div>
                  <div className="text-white/35 uppercase tracking-widest mb-1">Attribution</div>
                  <div className="text-white/80">
                    {attribution?.matchedPaperId ?? (attribution ? "No Match" : "Pending")}
                  </div>
                </div>
                <div>
                  <div className="text-white/35 uppercase tracking-widest mb-1">Watermark</div>
                  <div className="text-white/80">
                    {watermark?.watermarkId ?? (watermark ? "Not Detected" : "Pending")}
                  </div>
                </div>
                <div>
                  <div className="text-white/35 uppercase tracking-widest mb-1">Final</div>
                  <div className="text-white/80">
                    {forensicReport ? `${forensicReport.finalConfidence}%` : "Pending"}
                  </div>
                </div>
              </div>
            </motion.div>
            );
          })}

          {!loading && data.evidence.length === 0 && (
            <div className="col-span-full p-10 border border-dashed border-white/10 text-center text-sm text-white/45">
              No evidence uploaded yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
