/**
 * Import a test script into the project so it shows up in the dashboard (group "Imported") and can be run.
 *   npm run import -- path/to/my-scenario.spec.ts
 *   npm run import -- path/to/my-scenario.spec.ts "Nice name shown in the dashboard"
 * Copies the file to tests/imported/<name>.spec.ts and adds an npm script  custom:<name>  to package.json.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

function importTest(name, code, title) {
  const slug = String(name).replace(/\.spec\.ts$|\.ts$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  if (!slug) throw new Error('The file name is not usable. Use letters and numbers.');
  if (!/\bfrom\s+['"]@playwright\/test['"]/.test(code) || !/\btest\s*\(/.test(code))
    throw new Error('This does not look like a Playwright test (it must import from "@playwright/test" and contain test(...)).');
  if (code.length > 300000) throw new Error('The file is too large (300 KB max).');
  const dir = path.join(ROOT, 'tests', 'imported');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${slug}.spec.ts`);
  const existed = fs.existsSync(file);
  fs.writeFileSync(file, code);
  const pkgFile = path.join(ROOT, 'package.json');
  const raw = fs.readFileSync(pkgFile, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const pkg = JSON.parse(raw);
  pkg.scripts = pkg.scripts || {};
  pkg.scripts[`custom:${slug}`] = `playwright test tests/imported/${slug}.spec.ts --headed`;
  fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2).replace(/\n/g, eol) + eol);
  const metaFile = path.join(dir, 'imported.json');
  let meta = {}; try { meta = JSON.parse(fs.readFileSync(metaFile, 'utf8')); } catch {}
  meta[`custom:${slug}`] = { title: title || slug.replace(/-/g, ' '), file: `tests/imported/${slug}.spec.ts`, importedAt: new Date().toISOString() };
  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2));
  return { slug, script: `custom:${slug}`, file: `tests/imported/${slug}.spec.ts`, replaced: existed };
}
module.exports = { importTest };

if (require.main === module) {
  const [, , src, title] = process.argv;
  if (!src) { console.log('Usage: npm run import -- path/to/file.spec.ts ["Name shown in dashboard"]'); process.exit(1); }
  try {
    const r = importTest(path.basename(src), fs.readFileSync(src, 'utf8'), title);
    console.log(`${r.replaced ? 'Updated' : 'Imported'}: ${r.file}\nRun it with:  npm run ${r.script}   (or from the dashboard, group "Imported")`);
  } catch (e) { console.error('Import failed: ' + e.message); process.exit(1); }
}
