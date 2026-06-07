import { randomUUID } from "crypto";
import { mkdir, readdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type {
  AnalysisJob,
  AttributionRecord,
  EvidenceActivityEvent,
  EvidenceListResponse,
  EvidenceRecord,
} from "./evidence-types";
import { matchPaperFromOcr } from "./paper-matcher";

const UPLOAD_ROOT = path.resolve(process.cwd(), "..", "apps", "api", "uploads", "evidence");
const FILES_DIR = path.join(UPLOAD_ROOT, "files");
const RECORDS_DIR = path.join(UPLOAD_ROOT, "records");
const JOBS_DIR = path.join(UPLOAD_ROOT, "jobs");
const ATTRIBUTIONS_DIR = path.join(UPLOAD_ROOT, "attributions");
const ACTIVITY_FILE = path.join(UPLOAD_ROOT, "activity.json");

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "application/pdf"]);
const ALLOWED_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".pdf"]);

type StoredEvidenceRecord = EvidenceRecord & {
  storageId: string;
  originalFilename: string;
  storedFilename: string;
  storedAt: string;
};

export async function ensureEvidenceStorage() {
  await mkdir(FILES_DIR, { recursive: true });
  await mkdir(RECORDS_DIR, { recursive: true });
  await mkdir(JOBS_DIR, { recursive: true });
  await mkdir(ATTRIBUTIONS_DIR, { recursive: true });
}

export function validateEvidenceFile(file: File) {
  const extension = path.extname(file.name).toLowerCase();
  if (!ALLOWED_TYPES.has(file.type) || !ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error("Only JPG, JPEG, PNG, and PDF evidence files are supported.");
  }
}

export async function createEvidence(file: File): Promise<{
  evidence: EvidenceRecord;
  activity: EvidenceActivityEvent;
}> {
  await ensureEvidenceStorage();
  validateEvidenceFile(file);

  const storageId = randomUUID();
  const evidenceId = await getNextEvidenceId();
  const extension = path.extname(file.name).toLowerCase();
  const storedFilename = `${storageId}${extension}`;
  const uploadedAt = new Date().toISOString();

  const bytes = Buffer.from(await file.arrayBuffer());
  await writeFile(path.join(FILES_DIR, storedFilename), bytes);

  const evidence: EvidenceRecord = {
    evidenceId,
    filename: file.name,
    fileType: file.type,
    source: "manual-upload",
    uploadedAt,
    status: "pending-analysis",
    riskLevel: "unknown",
    ocrStatus: "not-started",
    ocrText: null,
    ocrConfidence: null,
    ocrProcessingTimeMs: null,
    analysisStartedAt: null,
    analysisCompletedAt: null,
  };

  const storedRecord: StoredEvidenceRecord = {
    ...evidence,
    storageId,
    originalFilename: file.name,
    storedFilename,
    storedAt: uploadedAt,
  };

  await writeFile(
    path.join(RECORDS_DIR, `${storageId}.json`),
    JSON.stringify(storedRecord, null, 2),
    "utf8",
  );

  const activity: EvidenceActivityEvent = {
    eventId: randomUUID(),
    type: "evidence-uploaded",
    title: "Upload Received",
    evidenceId,
    timestamp: uploadedAt,
    detail: file.name,
  };

  await appendActivity(activity);

  return { evidence, activity };
}

export async function listEvidence(): Promise<EvidenceListResponse> {
  const records = await readStoredRecords();
  const evidence = records
    .map(toEvidenceRecord)
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  const activity = await readActivity();
  const jobs = await readAnalysisJobs();
  const attributions = await readAttributions();

  return {
    evidence,
    activity,
    jobs,
    attributions,
    stats: {
      totalEvidence: evidence.length,
      pendingAnalysis: evidence.filter((item) => item.status === "pending-analysis").length,
      processing: evidence.filter((item) => item.status === "analyzing").length,
      completed: evidence.filter((item) => item.status === "completed").length,
      failed: evidence.filter((item) => item.status === "analysis-failed").length,
    },
  };
}

export async function getEvidenceById(evidenceId: string): Promise<EvidenceRecord | null> {
  const records = await readStoredRecords();
  const record = records.find((item) => item.evidenceId === evidenceId);
  return record ? toEvidenceRecord(record) : null;
}

export async function getEvidenceBundle(evidenceId: string) {
  const evidence = await getEvidenceById(evidenceId);

  if (!evidence) {
    return null;
  }

  const activity = (await readActivity()).filter((event) => event.evidenceId === evidenceId);
  const jobs = (await readAnalysisJobs()).filter((job) => job.evidenceId === evidenceId);
  const attributions = (await readAttributions()).filter(
    (attribution) => attribution.evidenceId === evidenceId,
  );
  const attribution = attributions[0] ?? null;

  return { evidence, activity, jobs, attribution, attributions };
}

export async function getEvidenceAsset(evidenceId: string) {
  const records = await readStoredRecords();
  const record = records.find((item) => item.evidenceId === evidenceId);

  if (!record) {
    return null;
  }

  return {
    evidence: toEvidenceRecord(record),
    filePath: path.join(FILES_DIR, record.storedFilename),
    fileType: record.fileType,
    filename: record.filename,
  };
}

export async function createAnalysisJob(evidenceId: string) {
  const evidence = await getEvidenceById(evidenceId);

  if (!evidence) {
    throw new Error("Evidence not found.");
  }

  const now = new Date().toISOString();
  const job: AnalysisJob = {
    jobId: randomUUID(),
    evidenceId,
    type: "ocr",
    status: "queued",
    createdAt: now,
    startedAt: null,
    completedAt: null,
    confidence: null,
    processingTimeMs: null,
    error: null,
  };

  await writeAnalysisJob(job);
  await updateEvidenceRecord(evidenceId, (record) => ({
    ...record,
    status: "analyzing",
    ocrStatus: "queued",
    ocrText: null,
    ocrConfidence: null,
    ocrProcessingTimeMs: null,
    analysisStartedAt: null,
    analysisCompletedAt: null,
  }));

  const activity: EvidenceActivityEvent = {
    eventId: randomUUID(),
    type: "analysis-queued",
    title: "Analysis Queued",
    evidenceId,
    jobId: job.jobId,
    timestamp: now,
  };
  await appendActivity(activity);

  return { job, activity };
}

export async function markAnalysisJobProcessing(jobId: string) {
  const job = await getAnalysisJob(jobId);

  if (!job) {
    throw new Error("Analysis job not found.");
  }

  const now = new Date().toISOString();
  const updatedJob: AnalysisJob = {
    ...job,
    status: "processing",
    startedAt: now,
  };

  await writeAnalysisJob(updatedJob);
  await updateEvidenceRecord(job.evidenceId, (record) => ({
    ...record,
    status: "analyzing",
    ocrStatus: "processing",
    analysisStartedAt: now,
  }));

  const activity: EvidenceActivityEvent = {
    eventId: randomUUID(),
    type: "ocr-started",
    title: "OCR Started",
    evidenceId: job.evidenceId,
    jobId,
    timestamp: now,
  };
  await appendActivity(activity);

  return { job: updatedJob, activity };
}

export async function completeAnalysisJob(
  jobId: string,
  result: { text: string; confidence: number; processingTimeMs: number },
) {
  const job = await getAnalysisJob(jobId);

  if (!job) {
    throw new Error("Analysis job not found.");
  }

  const now = new Date().toISOString();
  const updatedJob: AnalysisJob = {
    ...job,
    status: "completed",
    completedAt: now,
    confidence: result.confidence,
    processingTimeMs: result.processingTimeMs,
    error: null,
  };

  await writeAnalysisJob(updatedJob);
  const evidence = await updateEvidenceRecord(job.evidenceId, (record) => ({
    ...record,
    status: "completed",
    ocrStatus: "completed",
    ocrText: result.text,
    ocrConfidence: result.confidence,
    ocrProcessingTimeMs: result.processingTimeMs,
    analysisCompletedAt: now,
  }));

  const completedEvent: EvidenceActivityEvent = {
    eventId: randomUUID(),
    type: "ocr-complete",
    title: "OCR Complete",
    evidenceId: job.evidenceId,
    jobId,
    timestamp: now,
    detail: result.text.trim() ? "Text extracted" : "No Exam Content Detected",
  };
  const storedEvent: EvidenceActivityEvent = {
    eventId: randomUUID(),
    type: "results-stored",
    title: "Results Stored",
    evidenceId: job.evidenceId,
    jobId,
    timestamp: now,
  };

  await appendActivity(completedEvent);
  await appendActivity(storedEvent);

  return { evidence, job: updatedJob, activity: [completedEvent, storedEvent] };
}

export async function runAttributionForEvidence(evidenceId: string, ocrText: string) {
  const now = new Date().toISOString();
  const startedEvent: EvidenceActivityEvent = {
    eventId: randomUUID(),
    type: "attribution-started",
    title: "Attribution Started",
    evidenceId,
    timestamp: now,
  };
  await appendActivity(startedEvent);

  const match = matchPaperFromOcr(ocrText);

  if (!match) {
    const attribution: AttributionRecord = {
      attributionId: getAttributionId(evidenceId),
      evidenceId,
      matchedPaperId: null,
      matchedExam: null,
      matchedSet: null,
      confidence: 0,
      centerCode: null,
      printerId: null,
      batchId: null,
      status: "no-match",
      matchedWatermarkId: null,
      centerName: null,
      createdAt: new Date().toISOString(),
    };

    await writeAttribution(attribution);
    const completedEvent: EvidenceActivityEvent = {
      eventId: randomUUID(),
      type: "attribution-complete",
      title: "Attribution Complete",
      evidenceId,
      timestamp: attribution.createdAt,
      detail: ocrText.trim() ? "No registry match found" : "No OCR text available",
    };
    await appendActivity(completedEvent);

    return { attribution, activity: [startedEvent, completedEvent] };
  }

  const attribution: AttributionRecord = {
    attributionId: getAttributionId(evidenceId),
    evidenceId,
    matchedPaperId: match.matchedPaperId,
    matchedExam: match.matchedExam,
    matchedSet: match.matchedSet,
    confidence: match.confidence,
    centerCode: match.centerCode,
    printerId: match.printerId,
    batchId: match.batchId,
    status: match.status,
    matchedWatermarkId: match.matchedWatermarkId,
    centerName: match.centerName,
    createdAt: new Date().toISOString(),
  };

  await writeAttribution(attribution);

  const matchedEvent: EvidenceActivityEvent = {
    eventId: randomUUID(),
    type: "paper-matched",
    title: "Paper Matched",
    evidenceId,
    timestamp: attribution.createdAt,
    detail: `${match.matchedPaperId} at ${match.confidence}% confidence`,
  };
  const sourceEvent: EvidenceActivityEvent = {
    eventId: randomUUID(),
    type: "source-identified",
    title: "Source Identified",
    evidenceId,
    timestamp: attribution.createdAt,
    detail: `${match.centerCode} / ${match.printerId} / ${match.batchId}`,
  };
  const completedEvent: EvidenceActivityEvent = {
    eventId: randomUUID(),
    type: "attribution-complete",
    title: "Attribution Complete",
    evidenceId,
    timestamp: attribution.createdAt,
    detail: match.status.toUpperCase(),
  };

  await appendActivity(matchedEvent);
  await appendActivity(sourceEvent);
  await appendActivity(completedEvent);

  return {
    attribution,
    activity: [startedEvent, matchedEvent, sourceEvent, completedEvent],
  };
}

export async function failAnalysisJob(jobId: string, message: string) {
  const job = await getAnalysisJob(jobId);

  if (!job) {
    throw new Error("Analysis job not found.");
  }

  const now = new Date().toISOString();
  const updatedJob: AnalysisJob = {
    ...job,
    status: "failed",
    completedAt: now,
    error: message,
  };

  await writeAnalysisJob(updatedJob);
  const evidence = await updateEvidenceRecord(job.evidenceId, (record) => ({
    ...record,
    status: "analysis-failed",
    ocrStatus: "failed",
    analysisCompletedAt: now,
  }));

  const activity: EvidenceActivityEvent = {
    eventId: randomUUID(),
    type: "analysis-failed",
    title: "Analysis Failed",
    evidenceId: job.evidenceId,
    jobId,
    timestamp: now,
    detail: message,
  };

  await appendActivity(activity);

  return { evidence, job: updatedJob, activity: [activity] };
}

async function getNextEvidenceId() {
  const records = await readStoredRecords();
  const maxNumber = records.reduce((max, record) => {
    const match = /^EV-(\d+)$/.exec(record.evidenceId);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  return `EV-${String(maxNumber + 1).padStart(3, "0")}`;
}

async function readStoredRecords(): Promise<StoredEvidenceRecord[]> {
  await ensureEvidenceStorage();

  const entries = await readdir(RECORDS_DIR, { withFileTypes: true });
  const records = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map(async (entry) => {
        const raw = await readFile(path.join(RECORDS_DIR, entry.name), "utf8");
        return JSON.parse(raw) as StoredEvidenceRecord;
      }),
  );

  return records;
}

async function updateEvidenceRecord(
  evidenceId: string,
  updater: (record: StoredEvidenceRecord) => StoredEvidenceRecord,
) {
  const records = await readStoredRecords();
  const record = records.find((item) => item.evidenceId === evidenceId);

  if (!record) {
    throw new Error("Evidence not found.");
  }

  const updatedRecord = updater(normalizeStoredRecord(record));
  await writeStoredRecord(updatedRecord);
  return toEvidenceRecord(updatedRecord);
}

async function writeStoredRecord(record: StoredEvidenceRecord) {
  await ensureEvidenceStorage();
  await writeFile(
    path.join(RECORDS_DIR, `${record.storageId}.json`),
    JSON.stringify(record, null, 2),
    "utf8",
  );
}

async function readAnalysisJobs(): Promise<AnalysisJob[]> {
  await ensureEvidenceStorage();

  const entries = await readdir(JOBS_DIR, { withFileTypes: true });
  const jobs = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map(async (entry) => {
        const raw = await readFile(path.join(JOBS_DIR, entry.name), "utf8");
        return JSON.parse(raw) as AnalysisJob;
      }),
  );

  return jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

async function readAttributions(): Promise<AttributionRecord[]> {
  await ensureEvidenceStorage();

  const entries = await readdir(ATTRIBUTIONS_DIR, { withFileTypes: true });
  const attributions = await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map(async (entry) => {
        const raw = await readFile(path.join(ATTRIBUTIONS_DIR, entry.name), "utf8");
        return JSON.parse(raw) as AttributionRecord;
      }),
  );

  return attributions.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

async function getAnalysisJob(jobId: string): Promise<AnalysisJob | null> {
  await ensureEvidenceStorage();

  try {
    const raw = await readFile(path.join(JOBS_DIR, `${jobId}.json`), "utf8");
    return JSON.parse(raw) as AnalysisJob;
  } catch {
    return null;
  }
}

async function writeAnalysisJob(job: AnalysisJob) {
  await ensureEvidenceStorage();
  await writeFile(path.join(JOBS_DIR, `${job.jobId}.json`), JSON.stringify(job, null, 2), "utf8");
}

async function writeAttribution(attribution: AttributionRecord) {
  await ensureEvidenceStorage();
  await writeFile(
    path.join(ATTRIBUTIONS_DIR, `${attribution.evidenceId}.json`),
    JSON.stringify(attribution, null, 2),
    "utf8",
  );
}

async function readActivity(): Promise<EvidenceActivityEvent[]> {
  await ensureEvidenceStorage();

  try {
    const raw = await readFile(ACTIVITY_FILE, "utf8");
    return (JSON.parse(raw) as EvidenceActivityEvent[]).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  } catch {
    return [];
  }
}

async function appendActivity(activity: EvidenceActivityEvent) {
  const existing = await readActivity();
  await writeFile(
    ACTIVITY_FILE,
    JSON.stringify([activity, ...existing].slice(0, 50), null, 2),
    "utf8",
  );
}

function toEvidenceRecord(record: StoredEvidenceRecord): EvidenceRecord {
  const normalized = normalizeStoredRecord(record);

  return {
    evidenceId: normalized.evidenceId,
    filename: normalized.filename,
    fileType: normalized.fileType,
    source: normalized.source,
    uploadedAt: normalized.uploadedAt,
    status: normalized.status,
    riskLevel: normalized.riskLevel,
    ocrStatus: normalized.ocrStatus,
    ocrText: normalized.ocrText,
    ocrConfidence: normalized.ocrConfidence,
    ocrProcessingTimeMs: normalized.ocrProcessingTimeMs,
    analysisStartedAt: normalized.analysisStartedAt,
    analysisCompletedAt: normalized.analysisCompletedAt,
  };
}

function normalizeStoredRecord(record: StoredEvidenceRecord): StoredEvidenceRecord {
  return {
    ...record,
    ocrStatus: record.ocrStatus ?? "not-started",
    ocrText: record.ocrText ?? null,
    ocrConfidence: record.ocrConfidence ?? null,
    ocrProcessingTimeMs: record.ocrProcessingTimeMs ?? null,
    analysisStartedAt: record.analysisStartedAt ?? null,
    analysisCompletedAt: record.analysisCompletedAt ?? null,
  };
}

function getAttributionId(evidenceId: string) {
  const suffix = evidenceId.replace(/^EV-/, "");
  return `ATTR-${suffix}`;
}
