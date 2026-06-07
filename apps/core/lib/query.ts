import type {
  PaperRecord,
  QueryResult,
  StatsResult,
  ListResult,
  ExamName,
  PaperStatus,
  RiskLevel,
} from './schema.js';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_PATH = join(__dirname, '..', 'data', 'papers.json');

let cache: PaperRecord[] | null = null;

export function loadRegistry(force = false): PaperRecord[] {
  if (cache && !force) return cache;
  if (!existsSync(DATA_PATH)) {
    throw new Error(
      `Registry data not found at ${DATA_PATH}. Run \`npm run seed\` first.`
    );
  }
  const raw = readFileSync(DATA_PATH, 'utf-8');
  cache = JSON.parse(raw) as PaperRecord[];
  return cache;
}

export function clearCache(): void {
  cache = null;
}

export function getDataPath(): string {
  return DATA_PATH;
}

export function findByWatermark(watermark: string): QueryResult {
  const records = loadRegistry();
  const start = performance.now();
  const normalized = watermark.trim().toUpperCase();
  const record = records.find((r) => r.watermarkId.toUpperCase() === normalized) ?? null;
  const queryTime = `${(performance.now() - start).toFixed(2)}ms`;

  return {
    found: record !== null,
    record,
    queryTime,
    watermarkQueried: normalized,
  };
}

export function findByPaperId(paperId: string): PaperRecord[] {
  const records = loadRegistry();
  const normalized = paperId.trim().toUpperCase();
  return records.filter((r) => r.paperId.toUpperCase() === normalized);
}

export function findByCenterCode(centerCode: string): PaperRecord[] {
  const records = loadRegistry();
  const normalized = centerCode.trim().toUpperCase();
  return records.filter((r) => r.centerCode.toUpperCase() === normalized);
}

export function findCompromised(): PaperRecord[] {
  const records = loadRegistry();
  return records.filter((r) => r.status === 'compromised' || r.status === 'investigating');
}

export function listAll(): ListResult {
  const records = loadRegistry();
  const grouped: Record<ExamName, PaperRecord[]> = {
    NEET: [],
    JEE: [],
    UPSC: [],
    GATE: [],
    CBSE: [],
  };
  for (const r of records) {
    grouped[r.exam].push(r);
  }
  return { records, grouped };
}

export function getStats(): StatsResult {
  const records = loadRegistry();
  const byExam: Record<ExamName, number> = { NEET: 0, JEE: 0, UPSC: 0, GATE: 0, CBSE: 0 };
  const byStatus: Record<PaperStatus, number> = {
    registered: 0,
    in_transit: 0,
    received: 0,
    compromised: 0,
    investigating: 0,
  };
  const byRiskLevel: Record<RiskLevel, number> = {
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };

  for (const r of records) {
    byExam[r.exam]++;
    byStatus[r.status]++;
    byRiskLevel[r.riskLevel]++;
  }

  const compromisedCount = byStatus.compromised + byStatus.investigating;
  const compromisedPercent = records.length === 0 ? 0 : (compromisedCount / records.length) * 100;

  return {
    total: records.length,
    byExam,
    byStatus,
    byRiskLevel,
    compromisedPercent,
  };
}
