import * as fs from 'fs';
import * as path from 'path';

export interface RunState {
  projectName: string;
  projectUrl?: string;
  baseRandom: string;
}

const STATE_DIR = path.resolve(process.cwd(), 'state');
const STATE_FILE = path.join(STATE_DIR, 'last-run.json');

/**
 * Reads the last persisted run state (project name / base random id) so a
 * follow-up run can reuse the same project instead of creating a new one.
 * Returns null if no state file exists yet or it can't be parsed.
 */
export function getLastRunState(): RunState | null {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, 'utf-8');
      return JSON.parse(raw) as RunState;
    }
  } catch (_) {
    // Corrupt or unreadable state file — treat as no state.
  }
  return null;
}

/**
 * Persists run state (project name / base random id) to disk so subsequent
 * test files (or re-runs) can pick up the same project/products.
 */
export function saveRunState(state: RunState): void {
  try {
    if (!fs.existsSync(STATE_DIR)) {
      fs.mkdirSync(STATE_DIR, { recursive: true });
    }
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (_) {
    // Non-fatal — worst case the next run just generates a fresh project.
  }
}

export function generateAlphaNumericId(length: number = 6): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function generateProjectName(prefix: string = 'QAProj'): string {
  return `${prefix.replace(/[^a-zA-Z0-9]/g, '')}${generateAlphaNumericId(6)}`;
}

export function generateStepProductName(baseRandom: string, step: 'FE' | 'OTO1' | 'DS1' | 'OTO2' | 'DS2'): string {
  return `${baseRandom}${step}`;
}

export function generateCustomerEmail(): string {
  const randomSuffix = generateAlphaNumericId(6).toLowerCase();
  return `atul.b+${randomSuffix}@flexifunnels.com`;
}