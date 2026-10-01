import * as fs from 'fs';
import * as path from 'path';

/**
 * Personal details for whoever runs the tests: my-details.json in the project folder
 * (each team member keeps their own; it is not shared through git).
 * New copy of the project? Copy my-details.example.json to my-details.json and edit it.
 */
export interface MyDetails {
  loginEmail: string;    // FlexiFunnels account the tests log in with
  loginPassword: string;
  testEmail: string;     // test sign-ups use this with +aliases: you+abc123@company.com
  firstName: string;
  phone: string;
  city: string;
}

const ROOT = path.resolve(__dirname, '..');
const DEFAULTS: MyDetails = { loginEmail: '', loginPassword: '', testEmail: 'atul.b@flexifunnels.com', firstName: 'Atul', phone: '1234567890', city: 'Dehradun' };

function load(): MyDetails {
  for (const f of ['my-details.json', 'my-details.example.json']) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
      if (f !== 'my-details.json') console.log('>>> my-details.json not found - using my-details.example.json. Copy it to my-details.json and put your details in it.');
      return { ...DEFAULTS, ...Object.fromEntries(Object.entries(data).filter(([k, v]) => !k.startsWith('_') && typeof v === 'string' && v !== '')) } as MyDetails;
    } catch {}
  }
  return DEFAULTS;
}

export const ME: MyDetails = load();

/** A unique test email on your own address: testEmail = a.b@x.com -> a.b+<suffix>@x.com */
export function testEmail(suffix?: string): string {
  const [localRaw, domain] = (ME.testEmail || DEFAULTS.testEmail).split('@');
  const local = localRaw.split('+')[0];
  const s = suffix ?? Array.from({ length: 8 }, () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)]).join('');
  return `${local}+${s}@${domain}`;
}
