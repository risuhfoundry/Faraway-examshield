import { existsSync, readFileSync } from "fs";
import path from "path";
import type { AttributionStatus } from "./evidence-types";

type PaperStatus = Exclude<AttributionStatus, "no-match">;

type PaperRegistryRecord = {
  watermarkId: string;
  paperId: string;
  exam: string;
  year: number;
  paperSet: string;
  centerCode: string;
  centerName: string;
  city: string;
  state: string;
  printBatch: string;
  printerId: string;
  riskLevel: string;
  status: PaperStatus;
};

type PaperReference = {
  paperId: string;
  referenceText: string;
};

export type PaperMatch = {
  matchedPaperId: string;
  matchedExam: string;
  matchedSet: string;
  confidence: number;
  centerCode: string;
  printerId: string;
  batchId: string;
  status: PaperStatus;
  matchedWatermarkId: string;
  centerName: string;
};

const CORE_REGISTRY_PATH = path.resolve(
  process.cwd(),
  "..",
  "apps",
  "core",
  "data",
  "papers.json",
);

const PAPER_REFERENCES: PaperReference[] = [
  {
    paperId: "NEET-2026-A",
    referenceText: [
      "Question 1: Name the capital of India.",
      "Question 2: Write the formula for water.",
      "Question 3: Explain gravity.",
      "Question 1: What is photosynthesis?",
      "Question 2: Solve 12 plus 8.",
      "Question 3: Define evaporation.",
      "Question 12: Describe the human digestive system.",
      "Question 18: Explain Newton's law of motion.",
      "Question 25: Identify the function of red blood cells.",
    ].join("\n"),
  },
  {
    paperId: "NEET-2026-B",
    referenceText: [
      "Question 1: Define osmosis.",
      "Question 2: Balance the chemical equation for respiration.",
      "Question 3: Name the largest gland in the human body.",
      "Question 12: Explain magnetic field lines.",
    ].join("\n"),
  },
  {
    paperId: "JEE-2026-A",
    referenceText: [
      "Question 1: Solve the quadratic equation.",
      "Question 2: Find the derivative of sine x.",
      "Question 3: Calculate the equivalent resistance.",
    ].join("\n"),
  },
  {
    paperId: "CBSE-2026-Math",
    referenceText: [
      "Question 1: Find the area of a triangle.",
      "Question 2: Solve the linear equation.",
      "Question 3: Prove the Pythagoras theorem.",
    ].join("\n"),
  },
];

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "what",
  "write",
  "name",
  "find",
  "explain",
  "define",
  "question",
]);

export function matchPaperFromOcr(ocrText: string): PaperMatch | null {
  const queryTokens = tokenize(ocrText);
  if (queryTokens.size < 4) {
    return null;
  }

  const ranked = PAPER_REFERENCES.map((reference) => {
    const referenceTokens = tokenize(reference.referenceText);
    const overlap = intersectionSize(queryTokens, referenceTokens);
    const queryCoverage = overlap / queryTokens.size;
    const referenceCoverage = overlap / referenceTokens.size;
    const lineScore = scoreLineSimilarity(ocrText, reference.referenceText);
    const confidence = Math.min(
      96,
      Math.round(queryCoverage * 76 + referenceCoverage * 4 + lineScore * 20),
    );

    return { reference, confidence };
  }).sort((a, b) => b.confidence - a.confidence);

  const best = ranked[0];
  if (!best || best.confidence < 55) {
    return null;
  }

  const custodyRecord = selectCustodyRecord(best.reference.paperId);
  if (!custodyRecord) {
    return null;
  }

  return {
    matchedPaperId: custodyRecord.paperId,
    matchedExam: `${custodyRecord.exam} ${custodyRecord.year}`,
    matchedSet: custodyRecord.paperSet,
    confidence: best.confidence,
    centerCode: custodyRecord.centerCode,
    printerId: custodyRecord.printerId,
    batchId: custodyRecord.printBatch,
    status: custodyRecord.status,
    matchedWatermarkId: custodyRecord.watermarkId,
    centerName: custodyRecord.centerName,
  };
}

function selectCustodyRecord(paperId: string): PaperRegistryRecord | null {
  const records = loadCoreRegistry().filter((record) => record.paperId === paperId);
  if (records.length === 0) {
    return null;
  }

  return records.sort(compareCustodyPriority)[0];
}

function loadCoreRegistry(): PaperRegistryRecord[] {
  if (!existsSync(CORE_REGISTRY_PATH)) {
    return [
      {
        watermarkId: "WMK-005",
        paperId: "NEET-2026-A",
        exam: "NEET",
        year: 2026,
        paperSet: "A",
        centerCode: "KOL-05",
        centerName: "La Martiniere for Boys",
        city: "Kolkata",
        state: "West Bengal",
        printBatch: "PB-01",
        printerId: "PR-05",
        riskLevel: "critical",
        status: "compromised",
      },
    ];
  }

  return JSON.parse(readFileSync(CORE_REGISTRY_PATH, "utf8")) as PaperRegistryRecord[];
}

function compareCustodyPriority(a: PaperRegistryRecord, b: PaperRegistryRecord) {
  return priority(a) - priority(b);
}

function priority(record: PaperRegistryRecord) {
  const statusRank: Record<PaperStatus, number> = {
    compromised: 0,
    investigating: 1,
    in_transit: 2,
    received: 3,
    registered: 4,
  };
  const riskRank: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  return statusRank[record.status] * 10 + (riskRank[record.riskLevel] ?? 9);
}

function tokenize(value: string) {
  const tokens = value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token));

  return new Set(tokens);
}

function intersectionSize(a: Set<string>, b: Set<string>) {
  let count = 0;
  for (const token of a) {
    if (b.has(token)) {
      count += 1;
    }
  }
  return count;
}

function scoreLineSimilarity(query: string, reference: string) {
  const queryLines = normalizeLines(query);
  const referenceLines = normalizeLines(reference);
  if (queryLines.length === 0) {
    return 0;
  }

  const matches = queryLines.filter((line) =>
    referenceLines.some((referenceLine) => referenceLine.includes(line) || line.includes(referenceLine)),
  );

  return matches.length / queryLines.length;
}

function normalizeLines(value: string) {
  return value
    .toLowerCase()
    .split(/\r?\n/)
    .map((line) => line.replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim())
    .filter((line) => line.length >= 8);
}
