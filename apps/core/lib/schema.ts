export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export type PaperStatus =
  | 'registered'
  | 'in_transit'
  | 'received'
  | 'compromised'
  | 'investigating';

export type ExamName = 'NEET' | 'JEE' | 'UPSC' | 'GATE' | 'CBSE';

export interface PaperRecord {
  watermarkId: string;
  paperId: string;

  exam: ExamName;
  year: number;
  paperSet: string;
  questionFingerprint: string;

  centerCode: string;
  centerName: string;
  city: string;
  state: string;

  printBatch: string;
  printerId: string;
  printedAt: string;
  distributedAt: string;

  riskLevel: RiskLevel;
  status: PaperStatus;
}

export interface QueryResult {
  found: boolean;
  record: PaperRecord | null;
  queryTime: string;
  watermarkQueried: string;
}

export interface StatsResult {
  total: number;
  byExam: Record<ExamName, number>;
  byStatus: Record<PaperStatus, number>;
  byRiskLevel: Record<RiskLevel, number>;
  compromisedPercent: number;
}

export interface ListResult {
  records: PaperRecord[];
  grouped: Record<ExamName, PaperRecord[]>;
}
