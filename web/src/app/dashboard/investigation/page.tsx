"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  Clock3,
  FileImage,
  FileText,
  FileUp,
  Fingerprint,
  Loader2,
  MapPinned,
  Play,
  ScrollText,
  ShieldCheck,
  UploadCloud,
  type LucideIcon,
} from "lucide-react";
import type {
  AnalysisJobResponse,
  AttributionRecord,
  EvidenceActivityEvent,
  EvidenceListResponse,
  EvidenceRecord,
  EvidenceUploadResponse,
  ForensicReport,
  WatermarkExtractionRecord,
} from "@/lib/evidence-types";
import {
  formatEvidenceDateTime,
  formatEvidenceSource,
  formatEvidenceStatus,
  formatEvidenceTime,
  formatOcrStatus,
} from "@/lib/evidence-format";
import { cn } from "@/lib/utils";

const acceptedTypes = ["image/jpeg", "image/png", "application/pdf"];
const tabs = ["Visual Analysis", "OCR Results", "Attribution", "Timeline"] as const;

type InvestigationTab = (typeof tabs)[number];

export default function InvestigationWorkspace() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<InvestigationTab>("Visual Analysis");
  const [selectedEvidenceId, setSelectedEvidenceId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [received, setReceived] = useState<EvidenceRecord | null>(null);
  const [evidenceData, setEvidenceData] = useState<EvidenceListResponse | null>(null);

  const loadEvidence = useCallback(async () => {
    const response = await fetch("/evidence", { cache: "no-store" });
    if (!response.ok) {
      return;
    }
    setEvidenceData((await response.json()) as EvidenceListResponse);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadEvidence();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadEvidence]);

  const selectedEvidence = useMemo(() => {
    if (!evidenceData?.evidence.length) {
      return received;
    }

    return (
      evidenceData.evidence.find((item) => item.evidenceId === selectedEvidenceId) ??
      evidenceData.evidence[0]
    );
  }, [evidenceData, received, selectedEvidenceId]);

  const selectedTimeline = useMemo(() => {
    if (!evidenceData || !selectedEvidence) {
      return [];
    }

    return evidenceData.activity
      .filter((event) => event.evidenceId === selectedEvidence.evidenceId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [evidenceData, selectedEvidence]);

  const selectedAttribution = useMemo(() => {
    if (!evidenceData || !selectedEvidence) {
      return null;
    }

    return (
      evidenceData.attributions.find((report) => report.evidenceId === selectedEvidence.evidenceId) ??
      null
    );
  }, [evidenceData, selectedEvidence]);

  const selectedWatermark = useMemo(() => {
    if (!evidenceData || !selectedEvidence) {
      return null;
    }

    return (
      evidenceData.watermarks.find((watermark) => watermark.evidenceId === selectedEvidence.evidenceId) ??
      null
    );
  }, [evidenceData, selectedEvidence]);

  const selectedForensicReport = useMemo(() => {
    if (!evidenceData || !selectedEvidence) {
      return null;
    }

    return (
      evidenceData.forensicReports.find((report) => report.evidenceId === selectedEvidence.evidenceId) ??
      null
    );
  }, [evidenceData, selectedEvidence]);

  async function uploadEvidence(file: File) {
    setError(null);

    if (!acceptedTypes.includes(file.type)) {
      setError("Only JPG, JPEG, PNG, and PDF files are supported.");
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("/evidence/upload", {
        method: "POST",
        body: formData,
      });
      const payload = (await response.json()) as EvidenceUploadResponse | { error: string };

      if (!response.ok) {
        throw new Error("error" in payload ? payload.error : "Evidence upload failed.");
      }

      if ("evidence" in payload) {
        setReceived(payload.evidence);
        setSelectedEvidenceId(payload.evidence.evidenceId);
        setActiveTab("Visual Analysis");
      }
      await loadEvidence();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Evidence upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function runAnalysis(evidenceId: string) {
    setError(null);
    setAnalyzingId(evidenceId);
    setActiveTab("OCR Results");

    try {
      const queuedResponse = await fetch("/analysis/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evidenceId }),
      });
      const queuedPayload = (await queuedResponse.json()) as AnalysisJobResponse | { error: string };

      if (!queuedResponse.ok || "error" in queuedPayload) {
        throw new Error("error" in queuedPayload ? queuedPayload.error : "Analysis queue failed.");
      }

      await loadEvidence();

      const processResponse = await fetch(`/analysis/jobs/${queuedPayload.job.jobId}/process`, {
        method: "POST",
      });
      const processPayload = (await processResponse.json()) as AnalysisJobResponse | { error: string };

      if (!processResponse.ok || "error" in processPayload) {
        throw new Error("error" in processPayload ? processPayload.error : "Analysis failed.");
      }

      await loadEvidence();
      setActiveTab("Attribution");
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : "Analysis failed.");
      await loadEvidence();
    } finally {
      setAnalyzingId(null);
    }
  }

  function handleFiles(files: FileList | null) {
    const [file] = Array.from(files ?? []);
    if (file) {
      uploadEvidence(file);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between border-b border-white/10 pb-6">
        <div>
          <h1 className="text-4xl font-heading font-bold tracking-widest text-white uppercase">
            Investigation Workspace
          </h1>
          <p className="text-white/50 text-xs font-mono uppercase tracking-widest mt-2">
            Evidence intake, OCR analysis, and stored results.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 glass-panel min-h-[620px] flex flex-col">
          <div className="p-4 border-b border-white/10 flex flex-wrap items-center gap-2">
            {tabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "px-4 py-2 text-xs font-semibold uppercase tracking-widest border transition-colors",
                  activeTab === tab
                    ? "bg-white text-black border-white"
                    : "bg-white/[0.02] text-white/50 border-white/10 hover:text-white hover:border-white/30",
                )}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex-1 p-6">
            {activeTab === "Visual Analysis" && (
              <VisualAnalysisPanel
                evidence={selectedEvidence}
                analyzing={analyzingId === selectedEvidence?.evidenceId}
                onRunAnalysis={runAnalysis}
              />
            )}

            {activeTab === "OCR Results" && (
              <OcrResultsPanel
                evidence={selectedEvidence}
                analyzing={analyzingId === selectedEvidence?.evidenceId}
              />
            )}

            {activeTab === "Attribution" && (
              <AttributionPanel
                evidence={selectedEvidence}
                attribution={selectedAttribution}
                watermark={selectedWatermark}
                forensicReport={selectedForensicReport}
                analyzing={analyzingId === selectedEvidence?.evidenceId}
              />
            )}

            {activeTab === "Timeline" && (
              <TimelinePanel events={selectedTimeline} evidence={selectedEvidence} />
            )}
          </div>
        </div>

        <div className="space-y-6">
          <UploadPanel
            inputRef={inputRef}
            dragActive={dragActive}
            uploading={uploading}
            setDragActive={setDragActive}
            handleFiles={handleFiles}
          />

          {received && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="border border-white bg-white text-black p-5"
            >
              <div className="text-xs uppercase tracking-[0.2em] font-bold">Evidence Received</div>
              <div className="mt-4 grid grid-cols-1 gap-4 text-sm">
                <div>
                  <div className="text-black/50 uppercase tracking-widest text-[10px]">ID</div>
                  <div className="font-mono font-bold">{received.evidenceId}</div>
                </div>
                <div>
                  <div className="text-black/50 uppercase tracking-widest text-[10px]">Status</div>
                  <div className="font-bold">{formatEvidenceStatus(received.status)}</div>
                </div>
                <div>
                  <div className="text-black/50 uppercase tracking-widest text-[10px]">Time</div>
                  <div className="font-bold">{formatEvidenceTime(received.uploadedAt)}</div>
                </div>
              </div>
            </motion.div>
          )}

          {error && (
            <div className="border border-white/15 bg-white/[0.03] p-4 text-sm text-white">
              {error}
            </div>
          )}

          <InvestigationQueue
            evidence={evidenceData?.evidence ?? []}
            selectedEvidenceId={selectedEvidence?.evidenceId ?? null}
            analyzingId={analyzingId}
            onSelect={(evidenceId) => {
              setSelectedEvidenceId(evidenceId);
              setActiveTab("Visual Analysis");
            }}
          />
        </div>
      </div>
    </div>
  );
}

function UploadPanel({
  inputRef,
  dragActive,
  uploading,
  setDragActive,
  handleFiles,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  dragActive: boolean;
  uploading: boolean;
  setDragActive: (active: boolean) => void;
  handleFiles: (files: FileList | null) => void;
}) {
  return (
    <div className="glass-panel p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/60">
          Upload Evidence
        </h2>
        <span className="text-[10px] font-mono uppercase tracking-widest text-white/35">
          JPG JPEG PNG PDF
        </span>
      </div>

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept=".jpg,.jpeg,.png,.pdf,image/jpeg,image/png,application/pdf"
        onChange={(event) => handleFiles(event.target.files)}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={(event) => {
          event.preventDefault();
          setDragActive(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          handleFiles(event.dataTransfer.files);
        }}
        className={cn(
          "w-full min-h-[220px] border border-dashed bg-white/[0.02] flex flex-col items-center justify-center text-center gap-4 transition-colors",
          dragActive ? "border-white bg-white/[0.06]" : "border-white/15 hover:border-white/35",
        )}
      >
        <div className="w-14 h-14 bg-white text-black flex items-center justify-center">
          {uploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <UploadCloud className="w-6 h-6" />}
        </div>
        <div>
          <div className="text-xl font-heading uppercase tracking-widest text-white">
            {uploading ? "Receiving" : "Upload"}
          </div>
          <div className="text-xs text-white/45 mt-2">Drop leaked paper evidence here.</div>
        </div>
      </button>
    </div>
  );
}

function VisualAnalysisPanel({
  evidence,
  analyzing,
  onRunAnalysis,
}: {
  evidence: EvidenceRecord | null;
  analyzing: boolean;
  onRunAnalysis: (evidenceId: string) => void;
}) {
  if (!evidence) {
    return <EmptyPanel icon={FileUp} text="Upload evidence to start the investigation queue." />;
  }

  const isCompleted = evidence.ocrStatus === "completed";
  const canRun = evidence.ocrStatus !== "processing" && !analyzing;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 h-full">
      <div className="lg:col-span-3 min-h-[430px] border border-white/10 bg-[#080808] relative overflow-hidden flex items-center justify-center">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:32px_32px]" />
        <div className="relative w-[72%] max-w-sm aspect-[1/1.38] border border-white/15 bg-white/[0.04] p-6 shadow-2xl">
          <div className="h-4 w-2/3 bg-white/20 mb-5" />
          <div className="space-y-3">
            <div className="h-3 bg-white/10 w-full" />
            <div className="h-3 bg-white/10 w-5/6" />
            <div className="h-3 bg-white/10 w-4/5" />
            <div className="h-20 bg-white/10 w-full mt-6" />
            <div className="h-3 bg-white/10 w-3/4 mt-6" />
            <div className="h-3 bg-white/10 w-full" />
          </div>
        </div>
      </div>

      <div className="lg:col-span-2 space-y-5">
        <div className="border border-white/10 bg-white/[0.02] p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-mono text-white tracking-wider">{evidence.evidenceId}</div>
              <div className="text-lg text-white mt-2 break-all">{evidence.filename}</div>
            </div>
            <span className="text-[10px] uppercase tracking-widest px-2 py-1 bg-white text-black font-bold">
              {formatEvidenceStatus(evidence.status)}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-5 text-sm">
            <InfoBlock label="Source" value={formatEvidenceSource(evidence.source)} />
            {evidence.source === "telegram" && (
              <>
                <InfoBlock label="Message" value={evidence.telegramMessageId ?? "Unknown"} />
                <InfoBlock label="Channel" value={evidence.telegramChatId ?? "Unknown"} />
              </>
            )}
            <InfoBlock label="OCR" value={formatOcrStatus(evidence.ocrStatus)} />
            <InfoBlock label="Uploaded" value={formatEvidenceDateTime(evidence.uploadedAt)} />
            <InfoBlock
              label="Confidence"
              value={evidence.ocrConfidence === null ? "Pending" : `${evidence.ocrConfidence}%`}
            />
          </div>
        </div>

        <button
          type="button"
          disabled={!canRun}
          onClick={() => onRunAnalysis(evidence.evidenceId)}
          className={cn(
            "w-full px-4 py-4 flex items-center justify-center gap-3 text-sm font-semibold uppercase tracking-widest border transition-colors",
            canRun
              ? "bg-white text-black border-white hover:bg-white/90"
              : "bg-white/10 text-white/35 border-white/10 cursor-not-allowed",
          )}
        >
          {analyzing || evidence.ocrStatus === "processing" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isCompleted ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          {analyzing || evidence.ocrStatus === "processing"
            ? "Analyzing"
            : isCompleted
              ? "Run Again"
              : "Run Analysis"}
        </button>
      </div>
    </div>
  );
}

function OcrResultsPanel({
  evidence,
  analyzing,
}: {
  evidence: EvidenceRecord | null;
  analyzing: boolean;
}) {
  if (!evidence) {
    return <EmptyPanel icon={ScrollText} text="OCR results will appear after analysis." />;
  }

  const text = evidence.ocrText?.trim();

  return (
    <div className="h-full flex flex-col gap-5">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <InfoMetric label="Status" value={analyzing ? "Processing" : formatOcrStatus(evidence.ocrStatus)} />
        <InfoMetric
          label="Confidence"
          value={evidence.ocrConfidence === null ? "Pending" : `${evidence.ocrConfidence}%`}
        />
        <InfoMetric
          label="Processing Time"
          value={evidence.ocrProcessingTimeMs === null ? "Pending" : `${evidence.ocrProcessingTimeMs} ms`}
        />
        <InfoMetric
          label="Completed"
          value={evidence.analysisCompletedAt ? formatEvidenceTime(evidence.analysisCompletedAt) : "Pending"}
        />
      </div>

      <div className="flex-1 border border-white/10 bg-black p-5 min-h-[360px]">
        <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/60">
            Extracted Text
          </h2>
          <span className="text-[10px] font-mono uppercase tracking-widest text-white/35">
            {evidence.evidenceId}
          </span>
        </div>

        {analyzing || evidence.ocrStatus === "processing" || evidence.ocrStatus === "queued" ? (
          <div className="h-full flex flex-col items-center justify-center gap-4 text-white/55">
            <Loader2 className="w-8 h-8 animate-spin" />
            <div className="text-sm uppercase tracking-widest">Analyzing...</div>
          </div>
        ) : evidence.ocrStatus === "failed" ? (
          <div className="h-full flex items-center justify-center text-center text-sm text-white/55">
            OCR analysis failed. Check the timeline for details.
          </div>
        ) : evidence.ocrStatus === "completed" && !text ? (
          <div className="h-full flex items-center justify-center text-center text-xl font-heading uppercase tracking-widest text-white">
            No Exam Content Detected
          </div>
        ) : text ? (
          <pre className="whitespace-pre-wrap font-mono text-sm leading-7 text-white/85">{text}</pre>
        ) : (
          <div className="h-full flex items-center justify-center text-center text-sm text-white/45">
            Run analysis to extract OCR text.
          </div>
        )}
      </div>
    </div>
  );
}

function TimelinePanel({
  events,
  evidence,
}: {
  events: EvidenceActivityEvent[];
  evidence: EvidenceRecord | null;
}) {
  if (!evidence) {
    return <EmptyPanel icon={Clock3} text="Timeline events will appear after evidence is uploaded." />;
  }

  return (
    <div className="border border-white/10 bg-black p-6 min-h-[500px]">
      <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
        <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/60">
          Activity Timeline
        </h2>
        <span className="text-[10px] font-mono uppercase tracking-widest text-white/35">
          {evidence.evidenceId}
        </span>
      </div>

      <div className="relative pl-6 space-y-5">
        <div className="absolute left-2 top-2 bottom-2 w-px bg-white/10" />
        {events.map((event) => (
          <div key={event.eventId} className="relative">
            <div className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 bg-white ring-4 ring-black" />
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-mono text-white/55">{formatEvidenceTime(event.timestamp)}</span>
              <span className="text-sm text-white">{event.title}</span>
            </div>
            {event.detail && <div className="text-xs text-white/40 mt-1">{event.detail}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function AttributionPanel({
  evidence,
  attribution,
  watermark,
  forensicReport,
  analyzing,
}: {
  evidence: EvidenceRecord | null;
  attribution: AttributionRecord | null;
  watermark: WatermarkExtractionRecord | null;
  forensicReport: ForensicReport | null;
  analyzing: boolean;
}) {
  if (!evidence) {
    return <EmptyPanel icon={Fingerprint} text="Attribution reports will appear after OCR analysis." />;
  }

  if (analyzing || evidence.ocrStatus === "processing" || evidence.ocrStatus === "queued") {
    return (
      <div className="h-full min-h-[440px] border border-white/10 bg-black flex flex-col items-center justify-center gap-4 text-white/55">
        <Loader2 className="w-8 h-8 animate-spin" />
        <div className="text-sm uppercase tracking-widest">Building attribution report...</div>
      </div>
    );
  }

  if (!attribution) {
    return <EmptyPanel icon={Fingerprint} text="Run analysis to match OCR text against the registry." />;
  }

  if (attribution.status === "no-match") {
    return (
      <div className="h-full min-h-[440px] border border-white/10 bg-black p-8 flex flex-col justify-center">
        <div className="text-xs uppercase tracking-[0.2em] text-white/45">Attribution Report</div>
        <div className="text-4xl font-heading uppercase tracking-widest text-white mt-4">
          No Match Found
        </div>
        <p className="text-sm text-white/50 mt-4 max-w-xl">
          OCR completed, but the extracted text did not confidently match a registered paper.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-8">
          <InfoMetric
            label="Watermark"
            value={watermark?.watermarkId ?? formatWatermarkStatus(watermark)}
          />
          <InfoMetric
            label="Watermark Confidence"
            value={formatNullablePercent(watermark?.confidence ?? null)}
          />
          <InfoMetric
            label="Final"
            value={formatNullablePercent(forensicReport?.finalConfidence ?? attribution.finalConfidence)}
          />
        </div>
      </div>
    );
  }

  const reportStatus = forensicReport?.status === "investigation-complete"
    ? "Investigation Complete"
    : "Match Found";
  const riskLabel = forensicReport?.riskLevel ?? attribution.status;
  const watermarkId = watermark?.watermarkId ?? forensicReport?.watermarkId ?? attribution.matchedWatermarkId;
  const finalConfidence = forensicReport?.finalConfidence ?? attribution.finalConfidence;

  return (
    <div className="h-full min-h-[500px] border border-white/10 bg-black p-6">
      <div className="flex items-start justify-between gap-6 border-b border-white/10 pb-6">
        <div>
          <div className="text-xs uppercase tracking-[0.2em] text-white/45">Attribution Report</div>
          <div className="text-4xl font-heading uppercase tracking-widest text-white mt-4">
            {reportStatus}
          </div>
        </div>
        <div className="bg-white text-black px-4 py-2 text-xs font-bold uppercase tracking-widest">
          {formatRiskLabel(riskLabel)}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-6">
        <div className="border border-white/10 bg-white/[0.02] p-6">
          <div className="flex items-center gap-3 text-white/55 mb-6">
            <Fingerprint className="w-5 h-5" />
            <span className="text-xs uppercase tracking-[0.2em]">Watermark Panel</span>
          </div>
          <div className="text-3xl font-heading uppercase tracking-widest text-white break-all">
            {watermarkId ?? "Not Detected"}
          </div>
          <div className="text-xs uppercase tracking-widest text-white/45 mt-3">
            {formatWatermarkStatus(watermark)}
          </div>
        </div>

        <div className="border border-white/10 bg-white/[0.02] p-6">
          <div className="flex items-center gap-3 text-white/55 mb-6">
            <MapPinned className="w-5 h-5" />
            <span className="text-xs uppercase tracking-[0.2em]">Attribution Panel</span>
          </div>
          <div className="grid grid-cols-1 gap-4">
            <InfoBlock label="Center" value={attribution.centerCode ?? "Unknown"} />
            <InfoBlock label="Printer" value={attribution.printerId ?? "Unknown"} />
            <InfoBlock label="Batch" value={attribution.batchId ?? "Unknown"} />
          </div>
        </div>

        <div className="border border-white bg-white text-black p-6">
          <div className="text-xs uppercase tracking-[0.2em] text-black/50">Confidence Panel</div>
          <div className="text-5xl font-heading mt-4">{finalConfidence}%</div>
          <div className="space-y-3 mt-6 text-xs">
            <ConfidenceRow label="OCR" value={formatNullablePercent(attribution.ocrConfidence)} />
            <ConfidenceRow
              label="Watermark"
              value={formatNullablePercent(attribution.watermarkConfidence)}
            />
            <ConfidenceRow label="Final" value={`${finalConfidence}%`} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-5">
        <div className="lg:col-span-2 border border-white/10 bg-white/[0.02] p-6">
          <div className="flex items-center gap-3 text-white/55 mb-6">
            <ShieldCheck className="w-5 h-5" />
            <span className="text-xs uppercase tracking-[0.2em]">Paper Identification</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <InfoBlock label="Paper" value={attribution.matchedPaperId ?? "Unknown"} />
            <InfoBlock label="Exam" value={attribution.matchedExam ?? "Unknown"} />
            <InfoBlock label="Set" value={attribution.matchedSet ?? "Unknown"} />
            <InfoBlock label="Confidence" value={`${attribution.confidence}%`} />
          </div>
        </div>

        <div className="border border-white/10 bg-white/[0.02] p-6">
          <div className="text-white/35 uppercase tracking-widest text-[10px] mb-4">
            Forensic Report
          </div>
          <div className="grid grid-cols-1 gap-4">
            <InfoBlock label="Report" value={forensicReport?.reportId ?? "Pending"} />
            <InfoBlock
              label="Risk"
              value={formatRiskLabel(forensicReport?.riskLevel ?? attribution.status)}
            />
            <InfoBlock
              label="Timestamp"
              value={forensicReport ? formatEvidenceDateTime(forensicReport.timestamp) : "Pending"}
            />
          </div>
        </div>
      </div>

      <div className="border border-white/10 bg-white/[0.02] p-6 mt-5">
        <div className="flex items-center gap-3 text-white/55 mb-6">
          <MapPinned className="w-5 h-5" />
          <span className="text-xs uppercase tracking-[0.2em]">Source Identification</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-5">
          <InfoBlock label="Center" value={attribution.centerCode ?? "Unknown"} />
          <InfoBlock label="Printer" value={attribution.printerId ?? "Unknown"} />
          <InfoBlock label="Batch" value={attribution.batchId ?? "Unknown"} />
          <InfoBlock label="Watermark" value={watermarkId ?? "Unknown"} />
        </div>
        {attribution.centerName && (
          <div className="mt-5 pt-5 border-t border-white/10 text-sm text-white/65">
            {attribution.centerName}
          </div>
        )}
      </div>
    </div>
  );
}

function InvestigationQueue({
  evidence,
  selectedEvidenceId,
  analyzingId,
  onSelect,
}: {
  evidence: EvidenceRecord[];
  selectedEvidenceId: string | null;
  analyzingId: string | null;
  onSelect: (evidenceId: string) => void;
}) {
  return (
    <div className="glass-panel p-5">
      <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-white/60 mb-4">
        Investigation Queue
      </h2>
      <div className="space-y-3">
        {evidence.slice(0, 6).map((item) => {
          const Icon = item.fileType === "application/pdf" ? FileText : FileImage;
          const isActive = item.evidenceId === selectedEvidenceId;

          return (
            <button
              type="button"
              key={item.evidenceId}
              onClick={() => onSelect(item.evidenceId)}
              className={cn(
                "w-full text-left border p-4 transition-colors",
                isActive
                  ? "border-white bg-white text-black"
                  : "border-white/10 bg-white/[0.02] hover:border-white/30",
              )}
            >
              <div className="flex items-start gap-3">
                <Icon className={cn("w-5 h-5 mt-0.5 shrink-0", isActive ? "text-black" : "text-white/60")} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <span className={cn("text-xs font-mono", isActive ? "text-black" : "text-white")}>
                      {item.evidenceId}
                    </span>
                    <span
                      className={cn(
                        "text-[10px] uppercase tracking-widest",
                        isActive ? "text-black/55" : "text-white/40",
                      )}
                    >
                      {analyzingId === item.evidenceId ? "Analyzing" : formatOcrStatus(item.ocrStatus)}
                    </span>
                  </div>
                  <div className={cn("text-sm mt-2 truncate", isActive ? "text-black/75" : "text-white/80")}>
                    {item.filename}
                  </div>
                </div>
              </div>
            </button>
          );
        })}

        {evidence.length === 0 && (
          <div className="border border-dashed border-white/10 p-8 text-center text-sm text-white/40">
            Uploaded evidence will appear here.
          </div>
        )}
      </div>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-white/35 uppercase tracking-widest text-[10px] mb-1">{label}</div>
      <div className="text-white/85">{value}</div>
    </div>
  );
}

function InfoMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-white/10 bg-white/[0.02] p-4">
      <div className="text-white/35 uppercase tracking-widest text-[10px] mb-2">{label}</div>
      <div className="text-lg font-heading uppercase tracking-widest text-white">{value}</div>
    </div>
  );
}

function ConfidenceRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-black/10 pt-3 first:border-t-0 first:pt-0">
      <span className="uppercase tracking-widest text-black/50">{label}</span>
      <span className="font-mono font-bold">{value}</span>
    </div>
  );
}

function formatNullablePercent(value: number | null | undefined) {
  return value === null || value === undefined ? "Pending" : `${value}%`;
}

function formatWatermarkStatus(watermark: WatermarkExtractionRecord | null) {
  if (!watermark) {
    return "Pending";
  }

  if (watermark.status === "detected") {
    return "Detected";
  }

  if (watermark.status === "invalid") {
    return "Invalid";
  }

  return "Not Detected";
}

function formatRiskLabel(value: string | null | undefined) {
  if (!value) {
    return "Unknown";
  }

  return value.replace(/-/g, " ").replace(/_/g, " ").toUpperCase();
}

function EmptyPanel({ icon: Icon, text }: { icon: LucideIcon; text: string }) {
  return (
    <div className="h-full min-h-[440px] border border-dashed border-white/10 flex flex-col items-center justify-center gap-4 text-white/40">
      <Icon className="w-8 h-8" />
      <div className="text-sm">{text}</div>
    </div>
  );
}
