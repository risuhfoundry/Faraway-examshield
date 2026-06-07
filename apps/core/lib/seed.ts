import type { PaperRecord, ExamName, RiskLevel, PaperStatus } from './schema.js';
import { createHash } from 'node:crypto';
import { writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_PATH = join(__dirname, '..', 'data', 'papers.json');

const EXAM_CONFIGS: Array<{
  exam: ExamName;
  sets: string[];
  centerCount: number;
  startWatermark: number;
  subjects?: string[];
}> = [
  { exam: 'NEET', sets: ['A', 'B', 'C', 'D'], centerCount: 30, startWatermark: 1 },
  { exam: 'JEE', sets: ['A', 'B', 'C'], centerCount: 25, startWatermark: 31 },
  { exam: 'UPSC', sets: ['A', 'B'], centerCount: 20, startWatermark: 56 },
  { exam: 'GATE', sets: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], centerCount: 15, startWatermark: 76 },
  { exam: 'CBSE', sets: ['Math', 'Chem', 'Phy'], centerCount: 20, startWatermark: 91, subjects: ['Mathematics', 'Chemistry', 'Physics'] },
];

const CITIES_BY_STATE: Record<string, Array<{ city: string; centers: string[] }>> = {
  'Delhi': [
    { city: 'New Delhi', centers: ['Delhi Public School - Sector 42', 'Kendriya Vidyalaya - Lodhi Road', 'Modern School - Barakhamba', 'St. Columba\'s School', 'The Mother\'s International School'] },
    { city: 'Delhi', centers: ['Bal Bharati Public School - Pitampura', 'DAV Public School - Pushpanjali', 'Ryan International - Rohini'] },
  ],
  'Maharashtra': [
    { city: 'Mumbai', centers: ['Bombay Scottish School - Mahim', 'Cathedral & John Connon School', 'Dhirubhai Ambani International School', 'Don Bosco High School - Matunga', 'Jamnabai Narsee School'] },
    { city: 'Pune', centers: ['Bishop\'s Co-Ed School - Undri', 'The Bishop\'s School - Camp', 'St. Mary\'s School - Pune Camp'] },
  ],
  'Karnataka': [
    { city: 'Bangalore', centers: ['Bishop Cotton Boys\' School', 'The Frank Anthony Public School', 'National Public School - Indiranagar', 'Mallya Aditi International School'] },
  ],
  'Tamil Nadu': [
    { city: 'Chennai', centers: ['Chettinad Vidyashram', 'Padma Seshadri Bala Bhavan', 'Sishya School', 'Vidya Mandir Senior Secondary School'] },
  ],
  'West Bengal': [
    { city: 'Kolkata', centers: ['La Martiniere for Boys', 'South Point High School', 'Calcutta Boys\' School', 'St. Xavier\'s Collegiate School'] },
  ],
  'Uttar Pradesh': [
    { city: 'Lucknow', centers: ['La Martiniere College', 'City Montessori School - Gomti Nagar', 'Delhi Public School - Indira Nagar'] },
    { city: 'Varanasi', centers: ['Sampurnanand Sanskrit Vishwavidyalaya School', 'St. Joseph\'s Convent School'] },
  ],
  'Gujarat': [
    { city: 'Ahmedabad', centers: ['Calorex International School', 'Delhi Public School - Bopal', 'St. Kabir School'] },
  ],
  'Rajasthan': [
    { city: 'Jaipur', centers: ['Maharaja Sawai Man Singh Vidyalaya', 'Mayo College Girls\' School', 'Delhi Public School - Jaipur'] },
  ],
  'Telangana': [
    { city: 'Hyderabad', centers: ['Oakridge International School', 'The Hyderabad Public School - Begumpet', 'Chirec International School'] },
  ],
  'Kerala': [
    { city: 'Kochi', centers: ['Choice School - Tripunithura', 'Chinmaya Vidyalaya', 'Bhavan\'s Vidya Mandir'] },
  ],
  'Punjab': [
    { city: 'Chandigarh', centers: ['Delhi Public School - Chandigarh', 'Sacred Heart Senior Secondary School', 'Yadavindra Public School'] },
  ],
  'Haryana': [
    { city: 'Gurugram', centers: ['Shiv Nadar School', 'Pathways School - Gurgaon', 'Lotus Valley International School'] },
  ],
};

const STATE_CODES: Record<string, string> = {
  'Delhi': 'DEL',
  'Maharashtra': 'MUM',
  'Karnataka': 'BLR',
  'Tamil Nadu': 'CHN',
  'West Bengal': 'KOL',
  'Uttar Pradesh': 'LKO',
  'Gujarat': 'AMD',
  'Rajasthan': 'JPR',
  'Telangana': 'HYD',
  'Kerala': 'KOC',
  'Punjab': 'CHD',
  'Haryana': 'GGN',
};

function generateFingerprint(watermark: string, paperId: string): string {
  return createHash('sha256').update(`${watermark}-${paperId}-2026`).digest('hex').slice(0, 8);
}

function pickCenter(exam: ExamName, index: number): { code: string; name: string; city: string; state: string } {
  const states = Object.keys(CITIES_BY_STATE);
  const state = states[index % states.length];
  const stateCities = CITIES_BY_STATE[state];
  const cityData = stateCities[index % stateCities.length];
  const centerName = cityData.centers[index % cityData.centers.length];
  const stateCode = STATE_CODES[state];
  const cityCode = stateCode;
  const centerNumber = String((index % 50) + 1).padStart(2, '0');
  return {
    code: `${cityCode}-${centerNumber}`,
    name: centerName,
    city: cityData.city,
    state,
  };
}

function pickRiskAndStatus(index: number, exam: ExamName): { risk: RiskLevel; status: PaperStatus } {
  const seed = (index * 7 + exam.charCodeAt(0)) % 100;
  if (seed < 8) return { risk: 'critical', status: 'compromised' };
  if (seed < 20) return { risk: 'high', status: 'investigating' };
  if (seed < 50) return { risk: 'medium', status: 'in_transit' };
  if (seed < 85) return { risk: 'low', status: 'registered' };
  return { risk: 'low', status: 'received' };
}

function randomDate(daysAgo: number): string {
  const d = new Date(Date.UTC(2026, 4, 15) - daysAgo * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

export function generateSeed(): PaperRecord[] {
  const records: PaperRecord[] = [];
  let watermarkCounter = 1;

  for (const config of EXAM_CONFIGS) {
    for (let i = 0; i < config.centerCount; i++) {
      const watermarkId = `WMK-${String(watermarkCounter).padStart(3, '0')}`;
      const setIndex = i % config.sets.length;
      const paperSet = config.sets[setIndex];
      const paperId = `${config.exam}-2026-${paperSet}`;
      const center = pickCenter(config.exam, i);
      const { risk, status } = pickRiskAndStatus(i, config.exam);

      records.push({
        watermarkId,
        paperId,
        exam: config.exam,
        year: 2026,
        paperSet,
        questionFingerprint: generateFingerprint(watermarkId, paperId),
        centerCode: center.code,
        centerName: center.name,
        city: center.city,
        state: center.state,
        printBatch: `PB-${String(Math.floor(i / 5) + 1).padStart(2, '0')}`,
        printerId: `PR-${String((i % 12) + 1).padStart(2, '0')}`,
        printedAt: randomDate(30 + (i % 10)),
        distributedAt: randomDate(5 + (i % 15)),
        riskLevel: risk,
        status,
      });

      watermarkCounter++;
    }
  }

  return records;
}

export function writeSeed(): { count: number; path: string } {
  const records = generateSeed();
  writeFileSync(DATA_PATH, JSON.stringify(records, null, 2));
  return { count: records.length, path: DATA_PATH };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { count, path } = writeSeed();
  console.log(`✓ Seeded ${count} records → ${path}`);
}
