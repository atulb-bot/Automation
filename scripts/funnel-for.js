/**
 * Easy command: build + wire the funnel on EXISTING products.
 *   npm run funnel:for tTpLzQ
 *   npm run funnel:for tTpLzQ "QA Kdm tTpLzQ OneClick Project"
 * 1st value = the ID in the product names (QA tTpLzQ FE ... DS2)
 * 2nd value = the project that holds their sales pages (optional, exact name from Projects)
 */
const { spawn } = require('child_process');
const [id, ...projectParts] = process.argv.slice(2);
if (!id) {
  console.log('\nUsage: npm run funnel:for <product ID> ["<project name>"]\n  e.g. npm run funnel:for tTpLzQ "QA Kdm tTpLzQ OneClick Project"\n');
  process.exit(1);
}
const env = { ...process.env, QA_BASE_RANDOM: id.replace(/^QA\s+/i, '') };
if (projectParts.length) env.QA_PROJECT_NAME = projectParts.join(' ');
console.log(`\n>>> Funnel for products "QA ${env.QA_BASE_RANDOM} FE ... DS2"${env.QA_PROJECT_NAME ? ` in project "${env.QA_PROJECT_NAME}"` : ''}\n`);
const isWin = process.platform === 'win32';
const p = spawn(isWin ? 'npx.cmd' : 'npx', ['playwright', 'test', 'tests/funnel-only.spec.ts', '--headed'], { stdio: 'inherit', env, shell: isWin });
p.on('close', (code) => process.exit(code ?? 1));
