/**
 * FlexiFunnels test dashboard - local server (no extra packages needed).
 *   npm run dashboard   ->   http://localhost:4178
 * Runs the npm test scripts from package.json, streams their output to the page,
 * and saves every run (summary + full log) in dashboard/runs/ so the page can also be
 * opened read-only with VS Code Live Server.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const RUNS = path.join(__dirname, 'runs');
const PORT = Number(process.env.DASHBOARD_PORT || 4178);
const ALLOWED = /^(trial|membership|membership-inr|funnel|single|optin|split|app|custom|check|combo):/;
const CDP_PORT = Number(process.env.DASHBOARD_CDP_PORT || 9333);
fs.mkdirSync(RUNS, { recursive: true });
const isWin = process.platform === 'win32';

// Are the test tools installed in this folder? (a fresh copy of the project has no node_modules)
const toolsReady = () =>
  fs.existsSync(path.join(ROOT, 'node_modules', '@playwright', 'test', 'package.json')) &&
  fs.existsSync(path.join(ROOT, 'node_modules', '.bin', isWin ? 'playwright.cmd' : 'playwright'));
const SETUP = { name: '__setup', command: 'npm install && npx playwright install chromium' };

// ---------------------------------------------------------------- helpers
const stripAnsi = (s) => s.replace(/\x1B\[[0-9;?]*[ -/]*[@-~]/g, '');
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
const send = (res, code, body, type = 'application/json') => {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', ...CORS });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};
const readJson = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };
const scripts = () => {
  const pkg = readJson(path.join(ROOT, 'package.json'), { scripts: {} });
  return Object.entries(pkg.scripts || {}).filter(([k]) => ALLOWED.test(k)).map(([name, command]) => ({ name, command }));
};
const indexFile = path.join(RUNS, 'index.json');
const loadIndex = () => readJson(indexFile, []);
const saveIndex = (list) => fs.writeFileSync(indexFile, JSON.stringify(list.slice(0, 200), null, 2));

// ---------------------------------------------------------------- output parsing
function newSummary() {
  return { steps: [], path: [], tests: [], flows: [], failures: [], thankYou: [], accounts: [], screenshots: [],
           passed: 0, failed: 0, skipped: 0, waitingForClose: false, problem: null, phase: '' };
}
// Known setup problems -> a short code the page turns into plain words
const PROBLEMS = [
  ['offline', /npm ERR! code (ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN)|getaddrinfo (ENOTFOUND|EAI_AGAIN)|Failed to install browsers|Download failed/i],
  ['tools-missing', /'playwright' is not recognized|playwright: (command )?not found|Cannot find module '@playwright\/test'/i],
  ['browser-missing', /Executable doesn't exist|Please run the following command to download new browsers|npx playwright install/i],
  ['node-missing', /'(npm|npx|node)' is not recognized|spawn (npm|npx)(\.cmd)? ENOENT/i],
];
function parseLine(sum, line, ctx) {
  let m;
  if (!sum.problem) for (const [code, re] of PROBLEMS) if (re.test(line)) { sum.problem = code; break; }
  if ((m = line.match(/\[STEP (\d+)\/(\d+)\] (.+?) (\.\.\.|✔ done)/))) {
    const [, n, total, title, state] = m;
    const key = `${ctx.flow || ''}|${n}`;
    let step = sum.steps.find((s) => s.key === key);
    if (!step) { step = { key, flow: ctx.flow || '', n: +n, total: +total, title, state: 'running' }; sum.steps.push(step); }
    step.state = state === '...' ? 'running' : 'done';
  }
  if ((m = line.match(/>>> FLOW STARTED: (.+)/))) ctx.flow = m[1].trim();
  if ((m = line.match(/>>> CHECK (✅|⚠️|❌) (.+)/))) (sum.checks = sum.checks || []).push({ s: m[1], t: m[2].trim() });
  // manual steps: the test is waiting for the user to do something in the test browser
  if ((m = line.match(/>>> ✋ MANUAL STEP NEEDED: (.+)/))) sum.manual = { step: m[1].trim(), what: '', since: Date.now() };
  if (sum.manual && (m = line.match(/^\s+What to do: (.+)/))) sum.manual.what = m[1].trim();
  if (/>>> (✅ MANUAL STEP DONE|⏱ MANUAL STEP NOT DONE)/.test(line)) sum.manual = null;
  if ((m = line.match(/\[BUYER\] (FE|OTO1|DS1|OTO2|DS2): (purchase(?!d)|No thanks)/))) sum.path.push({ flow: ctx.flow || '', page: m[1], action: m[2] === 'No thanks' ? 'no thanks' : 'bought' });
  const lastHop = (page) => [...sum.path].reverse().find((p) => p.page === page);
  if ((m = line.match(/\[BUYER\] (OTO1|DS1|OTO2|DS2): checkout page/))) { const h = lastHop(m[1]); if (h) h.via = 'checkout'; }
  if ((m = line.match(/\[BUYER\] (OTO1|DS1|OTO2|DS2): purchased with one click/))) { const h = lastHop(m[1]); if (h) h.via = 'one click'; }
  if (/Thank You page reached/.test(line)) sum.path.push({ flow: ctx.flow || '', page: 'Thank You', action: 'reached' });
  if ((m = line.match(/>>> \[(PASSED|FAILED|TIMEDOUT|SKIPPED|INTERRUPTED)\] (.+) \(([\d.]+)s\)/))) sum.tests.push({ status: m[1].toLowerCase(), title: m[2], seconds: +m[3] });
  if ((m = line.match(/✅ (.*COMPLETED SUCCESSFULLY.*)/))) sum.flows.push({ ok: true, title: m[1].replace(/:\s*$/, ''), details: [] }), (ctx.detailsOf = sum.flows[sum.flows.length - 1]);
  if ((m = line.match(/❌ FLOW FAILED: (.+)/))) {
    sum.failures.push({ flow: m[1].trim(), at: '', reason: '' }); ctx.failure = sum.failures[sum.failures.length - 1];
    if (sum.path.some((p) => p.flow === (ctx.flow || ''))) sum.path.push({ flow: ctx.flow || '', page: 'Stopped', action: 'stopped' });
  }
  if (ctx.failure && (m = line.match(/^\s+Failed at: (.+)/))) ctx.failure.at = m[1].trim();
  if (ctx.failure && (m = line.match(/^\s+Reason: (.+)/))) ctx.failure.reason = m[1].trim();
  if (ctx.detailsOf && (m = line.match(/^\s{4}([A-Za-z][\w -]+): (.+)$/))) ctx.detailsOf.details.push([m[1], m[2]]);
  if (/^#{20,}|^!{20,}/.test(line.trim())) { if (ctx.detailsOf && ctx.detailsOf.details.length) ctx.detailsOf = null; }
  if ((m = line.match(/Thank-you URL: (\S+)/))) sum.thankYou.push(m[1]);
  if ((m = line.match(/\[SAVED TO FILE\] -> (.+)/))) sum.accounts.push(m[1].trim());
  if ((m = line.match(/Screenshot saved(?: in)?:?\s*(\S+\.png)/i))) sum.screenshots.push(m[1]);
  if ((m = line.match(/^\s*(✓|✘|-)\s+\d+\s+\[(chromium|firefox|edge)\]\s+›/))) {
    const b = (sum.byBrowser = sum.byBrowser || {})[m[2]] = sum.byBrowser[m[2]] || { passed: 0, failed: 0, skipped: 0 };
    if (m[1] === '✓') b.passed++; else if (m[1] === '✘') b.failed++; else b.skipped++;
  }
  if ((m = line.match(/Running (\d+) tests? using (\d+) workers?/))) { sum.total = +m[1]; sum.workersUsed = +m[2]; }
  if ((m = line.match(/^\s*(\d+) passed/))) sum.passed = +m[1];
  if ((m = line.match(/^\s*(\d+) failed/))) sum.failed = +m[1];
  if ((m = line.match(/^\s*(\d+) skipped/))) sum.skipped = +m[1];
  if (/Close the browser window \(or press Ctrl\+C\)/.test(line)) sum.waitingForClose = true;
}

// ---------------------------------------------------------------- run management
let current = null;          // { id, script, proc, started, meta, summary, logStream }
const clients = new Set();   // SSE connections
const broadcast = (event, data) => { const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`; for (const c of clients) c.write(msg); };

function startRun(script, options) {
  if (current) throw new Error(`"${current.label || 'A run'}" is still running. Stop it or wait for it to finish.`);
  const isSetup = script === SETUP.name;
  const known = isSetup ? SETUP : scripts().find((s) => s.name === script);
  if (!known) throw new Error(`Unknown flow "${script}".`);
  const id = new Date().toISOString().replace(/[:.]/g, '-');
  const env = { ...process.env, FORCE_COLOR: '0', PW_CDP_PORT: String(CDP_PORT) };
  if (options.closeWhenDone) env.KEEP_OPEN = '0';
  // Run options from the page: products by ID, project name, FE page link
  const clean = (v) => String(v || '').replace(/["'`\r\n]/g, '').trim().slice(0, 200);
  const opt = { productId: clean(options.productId), projectName: clean(options.projectName), feUrl: clean(options.feUrl),
                workers: Math.max(1, Math.min(4, parseInt(options.workers, 10) || 1)),
                browsers: (Array.isArray(options.browsers) ? options.browsers : []).map((b) => String(b).toLowerCase()).filter((b) => ['chromium', 'firefox', 'edge'].includes(b)) };
  if (!opt.browsers.length) opt.browsers = ['chromium'];
  // More than 1 worker only for Playwright commands: spread tests (even from the same file) across N browsers
  const isPlaywright = /(^|\s)playwright\s+test\b/.test(known.command || '');
  // several browsers "at the same time" = at least one worker per browser
  if (isPlaywright && opt.browsers.length > 1 && opt.workers < opt.browsers.length) opt.workers = Math.min(4, opt.browsers.length);
  env.BROWSERS = opt.browsers.join(',');
  opt.headless = !!options.headless;
  if (opt.headless) env.HEADLESS = '1';
  if (options.manualAssist === false) env.MANUAL_ASSIST = '0';
  if (options.gateway === 'cashfree' || options.gateway === 'razorpay') { env.INR_GATEWAY = options.gateway; opt.gateway = options.gateway; }
  // another FlexiFunnels account for this run only (the password is never saved with the run)
  if (options.accountEmail && options.accountPassword) { env.FLEXI_EMAIL = clean(options.accountEmail); env.FLEXI_PASSWORD = String(options.accountPassword).slice(0, 200); opt.account = env.FLEXI_EMAIL; }
  // read-only checks of something that already exists
  if (options.checkUrl) { env.CHECK_URL = clean(options.checkUrl); opt.checkUrl = env.CHECK_URL; }
  if (options.fpPages) env.FP_PAGES = clean(options.fpPages);
  if (options.checkVisits) env.CHECK_VISITS = String(Math.max(1, Math.min(20, parseInt(options.checkVisits, 10) || 6)));
  if (options.checkFollow === false) env.CHECK_FOLLOW_CTA = '0';
  const mw = parseInt(options.manualWait, 10); if (mw >= 1 && mw <= 60) env.MANUAL_WAIT_MIN = String(mw);
  const extraArgs = opt.workers > 1 && isPlaywright ? ['--', `--workers=${opt.workers}`, '--fully-parallel'] : [];
  if (!isPlaywright) { opt.workers = 1; opt.browsers = ['chromium']; env.BROWSERS = 'chromium'; }
  if (opt.productId) env.QA_BASE_RANDOM = opt.productId.replace(/^QA\s+/i, '').split(/\s+/)[0];
  if (opt.projectName) env.QA_PROJECT_NAME = opt.projectName;
  if (opt.feUrl) env.FE_URL = opt.feUrl;
  const logFile = path.join(RUNS, `${id}.log`);
  const logStream = fs.createWriteStream(logFile);

  // What to run, in order. A fresh copy of the project gets its tools installed first.
  const needSetup = isSetup || !toolsReady();
  const steps = [];
  if (needSetup) {
    steps.push({ phase: 'Installing the test tools (first time only, a few minutes)', cmd: 'npm', args: ['install'] });
    steps.push({ phase: 'Installing the test browser (first time only)', cmd: 'npx', args: ['playwright', 'install', 'chromium'] });
  }
  if (!isSetup && opt.browsers.includes('firefox'))
    steps.push({ phase: 'Getting the Firefox test browser ready (first time downloads it)', cmd: 'npx', args: ['playwright', 'install', 'firefox'] });
  if (!isSetup) steps.push({ phase: '', cmd: 'npm', args: ['run', script, ...extraArgs], test: true });

  const run = { id, script, command: known.command, proc: null, started: Date.now(), summary: newSummary(), ctx: {}, logStream, buffer: '', label: options.label, options: opt };
  current = run;

  const onData = (chunk) => {
    const text = stripAnsi(chunk.toString());
    logStream.write(text);
    run.buffer += text;
    const lines = run.buffer.split(/\r?\n/);
    run.buffer = lines.pop();
    for (const line of lines) { parseLine(run.summary, line, run.ctx); broadcast('line', { id, line }); }
    broadcast('summary', { id, summary: run.summary });
  };
  const flush = () => { if (run.buffer) { parseLine(run.summary, run.buffer, run.ctx); broadcast('line', { id, line: run.buffer }); run.buffer = ''; } };

  const finish = (code) => {
    stopLiveView();
    flush();
    onData(Buffer.from(`\n[dashboard] Finished with exit code ${code}\n`));
    flush();
    logStream.end();
    const s = run.summary;
    s.phase = '';
    // setup finished fine -> the "tools missing" note from before it no longer applies
    if (code === 0 && (s.problem === 'tools-missing' || s.problem === 'browser-missing')) s.problem = null;
    // Stopped/finished AFTER the flow completed and was waiting with its browser open = it passed
    const doneBeforeStop = run.stopped && s.waitingForClose && !(s.failures || []).length && !s.failed;
    const status = doneBeforeStop ? 'passed' : run.stopped ? 'stopped' : code === 0 && s.failed === 0 ? 'passed' : 'failed';
    const record = { id, script, command: known.command, options: opt, screens: run.screens || [], status, exitCode: code, started: run.started, ended: Date.now(),
                     seconds: Math.round((Date.now() - run.started) / 1000), setupRan: needSetup, summary: s, log: `${id}.log` };
    record.report = archiveReport(id, run.started);
    fs.writeFileSync(path.join(RUNS, `${id}.json`), JSON.stringify(record, null, 2));
    saveIndex([{ id, script, status, started: record.started, seconds: record.seconds, passed: s.passed, failed: s.failed, problem: s.problem,
                 workers: opt.workers, report: record.report || null }, ...loadIndex()]);
    current = null;
    broadcast('finished', record);
    if (!run.stopped) setTimeout(startNextQueued, 1500); else { queue = []; broadcast('queue', { items: [] }); }
  };

  const runStep = (i) => {
    if (run.stopped) return finish(null);
    if (i >= steps.length) return finish(0);
    const st = steps[i];
    run.summary.phase = st.phase;
    onData(Buffer.from(`[dashboard] ${st.test ? 'Starting the test' : st.phase}  (folder: ${ROOT})\n`));
    if (st.test && opt.account) onData(Buffer.from(`[dashboard] Account for this run: ${opt.account}\n`));
    if (st.test && (opt.productId || opt.projectName || opt.feUrl || opt.workers > 1 || opt.browsers.join() !== 'chromium'))
      onData(Buffer.from(`[dashboard] Options: ${[opt.productId && `products QA ${env.QA_BASE_RANDOM} ...`, opt.projectName && `project "${opt.projectName}"`, opt.feUrl && `FE link ${opt.feUrl}`, opt.workers > 1 && `${opt.workers} workers (tests at the same time)`, `browsers: ${opt.browsers.join(' + ')}`].filter(Boolean).join(', ')}\n`));
    const exe = isWin ? `${st.cmd}.cmd` : st.cmd;
    const proc = spawn(exe, st.args, { cwd: ROOT, env, shell: isWin, detached: !isWin });
    run.proc = proc;
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    let failedToStart = false;
    proc.on('error', (err) => { failedToStart = true; onData(Buffer.from(`\n[dashboard] Could not start "${st.cmd}": ${err.message}\n`)); });
    if (st.test) startLiveView(run);
    proc.on('close', (code) => {
      flush();
      if (code !== 0 || failedToStart) return finish(code ?? 1);
      if (!st.test && needSetup && i === 1 && !toolsReady()) { onData(Buffer.from('[dashboard] Setup finished but the test tools still look missing.\n')); return finish(1); }
      runStep(i + 1);
    });
  };
  runStep(0);

  broadcast('started', { id, script, command: known.command, options: opt, started: run.started, setup: needSetup });
  return { id };
}

// ---------------------------------------------------------------- live view of the test browser
// The test browser is started with --remote-debugging-port (PW_CDP_PORT). Every ~0.6s the server
// takes a JPEG of the tab the test is using and sends it to the page. Read-only: it never clicks.
let live = null;
const MAX_SCREENS = 30;
function captureScreen(run, url, title, data) {
  if (!url || /^about:|^chrome:|^data:/.test(url)) return;
  const key = url.split('#')[0].replace(/[?&](ff_[a-z_]+|external_id)=[^&]*/g, '');
  run.screens = run.screens || [];
  run.screenKeys = run.screenKeys || new Set();
  if (run.screenKeys.has(key) || run.screens.length >= MAX_SCREENS) return;
  // wait for the page to settle: keep the 2nd frame seen for a new address
  run.pendingScreen = run.pendingScreen && run.pendingScreen.key === key ? run.pendingScreen : { key, n: 0 };
  if (++run.pendingScreen.n < 3) return;
  run.screenKeys.add(key);
  try {
    const dir = path.join(RUNS, `${run.id}-screens`);
    fs.mkdirSync(dir, { recursive: true });
    const file = `${String(run.screens.length + 1).padStart(2, '0')}.jpg`;
    fs.writeFileSync(path.join(dir, file), Buffer.from(data, 'base64'));
    let pathName = url; try { const u = new URL(url); pathName = u.hostname.replace(/^www\./, '') + u.pathname; } catch {}
    const screen = { n: run.screens.length + 1, file: `runs/${run.id}-screens/${file}`, url, title: (title || '').slice(0, 90), page: pathName.slice(0, 90), at: Date.now() };
    run.screens.push(screen);
    broadcast('screen', { id: run.id, screen });
  } catch {}
}
let liveWorker = 0;        // which parallel worker's browser the live view shows (0 = worker 1)
let liveMode = 'screen';   // 'screen' = live picture of the test browser, 'off' = no live view at all
let lastFrame = null;
function startLiveView(run) {
  liveWorker = 0;
  if (run.options && run.options.browsers && run.options.browsers.every((b) => b === 'firefox')) {
    broadcast('live', { id: run.id, note: 'Live view is not available for Firefox (it has no debugging port). The test browser window still opens as usual.' });
    return;
  }
  if (typeof WebSocket === 'undefined') {
    broadcast('live', { id: run.id, note: `Live view needs Node 22 or newer (this is ${process.version}).` });
    return;
  }
  live = { run, ws: null, targetId: null, stopped: false, seq: 0, pending: new Map() };
  const state = live;
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    if (!state.ws || state.ws.readyState !== 1) return reject(new Error('not connected'));
    const id = ++state.seq;
    const t = setTimeout(() => { state.pending.delete(id); reject(new Error('timeout')); }, 5000);
    state.pending.set(id, (msg) => { clearTimeout(t); msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result); });
    state.ws.send(JSON.stringify({ id, method, params }));
  });
  const connect = (target) => new Promise((resolve) => {
    try { if (state.ws) state.ws.close(); } catch {}
    state.pending.clear();
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    state.ws = ws; state.targetId = target.id;
    ws.onmessage = (ev) => { try { const m = JSON.parse(ev.data); const cb = state.pending.get(m.id); if (cb) { state.pending.delete(m.id); cb(m); } } catch {} };
    ws.onopen = () => resolve(true);
    ws.onerror = () => resolve(false);
    ws.onclose = () => { if (state.ws === ws) state.ws = null; };
  });
  (async () => {
    let lastPick = 0, target = null;
    while (!state.stopped) {
      if (liveMode === 'off') {
        try { if (state.ws) state.ws.close(); } catch {}
        state.ws = null; state.targetId = null;
        await new Promise((r) => setTimeout(r, 1000));
        continue;
      }
      try {
        if (Date.now() - lastPick > 1500 || !state.ws) {
          lastPick = Date.now();
          const port = CDP_PORT + liveWorker;
          if (state.port !== port) { state.port = port; state.targetId = null; try { if (state.ws) state.ws.close(); } catch {} state.ws = null; }
          const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
          const pages = list.filter((t) => t.type === 'page' && !/^devtools:|^chrome-extension:/.test(t.url));
          const pick = pages[0]; // Chrome lists the most recently used tab first
          if (pick && pick.id !== state.targetId) { target = pick; await connect(pick); }
          else if (pick) target = pick;
        }
        if (state.ws) {
          // Viewport picture only. (Capturing beyond the viewport makes Chrome resize the page for a
          // moment on every frame - that disturbed typing in the test and made the page flicker.)
          const shot = await call('Page.captureScreenshot', { format: 'jpeg', quality: 55 });
          const url = target ? target.url : '';
          captureScreen(run, url, target ? target.title : '', shot.data);
          if (!lastFrame || lastFrame.data !== shot.data || lastFrame.url !== url) {
            lastFrame = { id: run.id, data: shot.data, url, title: target ? target.title : '', worker: liveWorker, at: Date.now() };
            broadcast('frame', lastFrame);
          }
        }
      } catch {
        // browser not open yet / between tests - try again shortly
      }
      await new Promise((r) => setTimeout(r, 700));
    }
    try { if (state.ws) state.ws.close(); } catch {}
  })();
}
function stopLiveView() { if (live) live.stopped = true; live = null; }

// ---------------------------------------------------------------- per-run Playwright report
// Playwright writes playwright-report/ fresh every run; keep a copy per run (last 20) so old ones stay viewable.
const KEEP_REPORTS = 20;
function archiveReport(id, started) {
  try {
    const src = path.join(ROOT, 'playwright-report');
    const idx = path.join(src, 'index.html');
    if (!fs.existsSync(idx) || fs.statSync(idx).mtimeMs < started) return null;
    const dest = path.join(RUNS, `${id}-report`);
    fs.cpSync(src, dest, { recursive: true });
    const old = fs.readdirSync(RUNS).filter((f) => f.endsWith('-report')).sort().reverse().slice(KEEP_REPORTS);
    for (const f of old) fs.rmSync(path.join(RUNS, f), { recursive: true, force: true });
    const oldShots = fs.readdirSync(RUNS).filter((f) => f.endsWith('-screens')).sort().reverse().slice(30);
    for (const f of oldShots) fs.rmSync(path.join(RUNS, f), { recursive: true, force: true });
    return `runs/${id}-report/index.html`;
  } catch { return null; }
}

// ---------------------------------------------------------------- reports: every saved run with its outcome
function reportRows() {
  return loadIndex().map((r) => {
    const rec = readJson(path.join(RUNS, `${r.id}.json`), null);
    const s = (rec && rec.summary) || {};
    const tests = s.tests || [];
    return {
      id: r.id, script: r.script, status: r.status, started: r.started, seconds: r.seconds || 0,
      passed: Math.max(r.passed || 0, tests.filter((t) => t.status === 'passed').length),
      failed: Math.max(r.failed || 0, tests.filter((t) => /failed|timedout|interrupted/.test(t.status)).length),
      problem: r.problem || s.problem || null,
      workers: (rec && rec.options && rec.options.workers) || r.workers || 1,
      options: (rec && rec.options) || {},
      failures: (s.failures || []).map((f) => ({ flow: f.flow, at: f.at, reason: f.reason })),
      failedTests: tests.filter((t) => t.status !== 'passed' && t.status !== 'skipped').map((t) => t.title),
      thankYou: (s.thankYou || []).length,
      report: (rec && rec.report) || r.report || (fs.existsSync(path.join(RUNS, `${r.id}-report`, 'index.html')) ? `runs/${r.id}-report/index.html` : null),
    };
  });
}

const runOptions = (b) => ({ closeWhenDone: !!b.closeWhenDone, label: String(b.label || '').slice(0, 120), productId: b.productId, projectName: b.projectName,
  feUrl: b.feUrl, workers: b.workers, browsers: b.browsers, headless: !!b.headless, manualWait: b.manualWait, manualAssist: b.manualAssist, gateway: b.gateway,
  accountEmail: b.accountEmail, accountPassword: b.accountPassword, checkUrl: b.checkUrl, checkVisits: b.checkVisits, checkFollow: b.checkFollow, fpPages: b.fpPages });

// ---------------------------------------------------------------- run queue: several flows one after another
let queue = [];            // [{ script, options }]
function queueState() { return queue.map((q) => ({ script: q.script, label: q.options.label || q.script })); }
function startNextQueued() {
  if (current || !queue.length) return;
  const next = queue.shift();
  broadcast('queue', { items: queueState() });
  try { startRun(next.script, next.options); } catch (e) { broadcast('queue', { items: queueState(), error: e.message }); startNextQueued(); }
}

function stopRun() {
  if (!current) return false;
  current.stopped = true;
  const proc = current.proc;
  if (!proc || !proc.pid) return true;
  if (isWin) spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F']);
  else { try { process.kill(-proc.pid, 'SIGTERM'); } catch { try { proc.kill('SIGTERM'); } catch {} } }
  return true;
}

// ---------------------------------------------------------------- static files
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
               '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.log': 'text/plain; charset=utf-8',
               '.csv': 'text/plain; charset=utf-8', '.webm': 'video/webm', '.zip': 'application/zip', '.md': 'text/plain; charset=utf-8' };
function serveFile(res, file) {
  const safe = path.resolve(file);
  if (!safe.startsWith(ROOT)) return send(res, 403, 'Forbidden', 'text/plain');
  fs.readFile(safe, (err, data) => {
    if (err) return send(res, 404, 'Not found', 'text/plain');
    send(res, 200, data, MIME[path.extname(safe).toLowerCase()] || 'application/octet-stream');
  });
}

// ---------------------------------------------------------------- routes
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = decodeURIComponent(url.pathname);

  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }
  if (p === '/api/frame') return send(res, 200, lastFrame || {});
  // ---- my-details.json: each team member's own login / test email / name (Settings -> My details)
  if (p === '/api/my-details' && req.method === 'GET') {
    const d = readJson(path.join(ROOT, 'my-details.json'), null) || readJson(path.join(ROOT, 'my-details.example.json'), {});
    return send(res, 200, { exists: fs.existsSync(path.join(ROOT, 'my-details.json')), loginEmail: d.loginEmail || '', hasPassword: !!d.loginPassword,
      testEmail: d.testEmail || '', firstName: d.firstName || '', phone: d.phone || '', city: d.city || '' });
  }
  if (p === '/api/my-details' && req.method === 'POST') {
    let body = ''; req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        const b = JSON.parse(body || '{}'), file = path.join(ROOT, 'my-details.json');
        const cur = readJson(file, null) || readJson(path.join(ROOT, 'my-details.example.json'), {});
        const clean = (v) => String(v || '').replace(/[\r\n]/g, '').trim().slice(0, 200);
        const next = { _help: cur._help || 'Your own details. Each team member edits this file. It is not shared through git.' };
        for (const k of ['loginEmail', 'testEmail', 'firstName', 'phone', 'city']) next[k] = b[k] !== undefined ? clean(b[k]) : cur[k] || '';
        next.loginPassword = b.loginPassword ? String(b.loginPassword).slice(0, 200) : cur.loginPassword || '';
        if (next.testEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(next.testEmail)) return send(res, 400, { error: 'The test email does not look like an email address.' });
        fs.writeFileSync(file, JSON.stringify(next, null, 2));
        send(res, 200, { ok: true });
      } catch (e) { send(res, 400, { error: e.message }); }
    });
    return;
  }
  // ---- import a test script (Dashboard -> Import test): saved in tests/imported/, shown under "Imported"
  if (p === '/api/import' && req.method === 'POST') {
    let body = ''; req.on('data', (c) => { body += c; if (body.length > 400000) req.destroy(); });
    req.on('end', () => {
      try {
        const b = JSON.parse(body || '{}');
        const r = require('../scripts/import-test.js').importTest(String(b.name || ''), String(b.code || ''), String(b.title || '').slice(0, 80));
        send(res, 200, r);
      } catch (e) { send(res, 400, { error: e.message }); }
    });
    return;
  }
  if (p === '/api/imported' && req.method === 'GET') return send(res, 200, readJson(path.join(ROOT, 'tests', 'imported', 'imported.json'), {}));
  // ---- imported scripts: code, check (compiles + lists tests), rename, delete
  const IMP_DIR = path.join(ROOT, 'tests', 'imported'), IMP_META = path.join(IMP_DIR, 'imported.json');
  const impFile = (script) => { const slug = String(script || '').replace(/^custom:/, '').replace(/[^a-z0-9-]/g, ''); return slug ? path.join(IMP_DIR, `${slug}.spec.ts`) : null; };
  if (p === '/api/imported/code') {
    const f = impFile(url.searchParams.get('script'));
    return f && fs.existsSync(f) ? send(res, 200, fs.readFileSync(f, 'utf8'), 'text/plain; charset=utf-8') : send(res, 404, { error: 'Not found' });
  }
  if (p === '/api/imported' && req.method === 'DELETE') {
    const script = String(url.searchParams.get('script') || ''); const f = impFile(script);
    if (!f || !script.startsWith('custom:')) return send(res, 400, { error: 'Unknown script' });
    try { fs.rmSync(f, { force: true }); } catch {}
    const meta = readJson(IMP_META, {}); delete meta[script]; fs.writeFileSync(IMP_META, JSON.stringify(meta, null, 2));
    const pkgFile = path.join(ROOT, 'package.json'), raw = fs.readFileSync(pkgFile, 'utf8'), eol = raw.includes('\r\n') ? '\r\n' : '\n';
    const pkg = JSON.parse(raw); if (pkg.scripts) delete pkg.scripts[script];
    fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2).replace(/\n/g, eol) + eol);
    return send(res, 200, { ok: true });
  }
  if (p === '/api/imported/rename' && req.method === 'POST') {
    let body = ''; req.on('data', (c) => (body += c));
    req.on('end', () => { try { const b = JSON.parse(body || '{}'); const meta = readJson(IMP_META, {});
      if (!meta[b.script]) return send(res, 404, { error: 'Unknown script' });
      meta[b.script].title = String(b.title || '').slice(0, 80) || meta[b.script].title; if (b.notes !== undefined) meta[b.script].notes = String(b.notes).slice(0, 500);
      fs.writeFileSync(IMP_META, JSON.stringify(meta, null, 2)); send(res, 200, { ok: true }); } catch (e) { send(res, 400, { error: e.message }); } });
    return;
  }
  if (p === '/api/import/check' && req.method === 'POST') {
    let body = ''; req.on('data', (c) => { body += c; if (body.length > 400000) req.destroy(); });
    req.on('end', () => {
      try {
        const b = JSON.parse(body || '{}'), code = String(b.code || '');
        if (!/\bfrom\s+['"]@playwright\/test['"]/.test(code) || !/\btest\s*\(/.test(code))
          return send(res, 200, { ok: false, error: 'This does not look like a Playwright test: it must import from "@playwright/test" and contain test(...).' });
        fs.mkdirSync(IMP_DIR, { recursive: true });
        const tmp = path.join(IMP_DIR, `zz-check-${Date.now()}.spec.ts`);
        fs.writeFileSync(tmp, code);
        const { spawnSync } = require('child_process');
        const isWin = process.platform === 'win32';
        const r = spawnSync(isWin ? 'npx.cmd' : 'npx', ['playwright', 'test', path.relative(ROOT, tmp).replace(/\\/g, '/'), '--list', '--reporter=line'],
          { cwd: ROOT, encoding: 'utf8', timeout: 90000, shell: isWin, env: { ...process.env, FORCE_COLOR: '0' } });
        try { fs.rmSync(tmp, { force: true }); } catch {}
        const out = `${r.stdout || ''}\n${r.stderr || ''}`;
        const tests = out.split(/\r?\n/).filter((l) => /›/.test(l)).map((l) => l.split('›').slice(2).join('›').trim() || l.trim());
        if (r.status === 0 && tests.length) return send(res, 200, { ok: true, tests });
        const err = out.split(/\r?\n/).filter((l) => l.trim() && !/^Listing tests|^Total:/.test(l)).slice(0, 25).join('\n');
        send(res, 200, { ok: false, error: err || 'No tests found in this file.' });
      } catch (e) { send(res, 400, { ok: false, error: e.message }); }
    });
    return;
  }
  // ---- bug sheet: dashboard/bugs/bugs.json + screenshots in dashboard/bugs/img/
  const BUGS_DIR = path.join(__dirname, 'bugs'), BUGS = path.join(BUGS_DIR, 'bugs.json'), BUG_IMG = path.join(BUGS_DIR, 'img');
  const loadBugs = () => readJson(BUGS, []);
  const saveBugs = (list) => { fs.mkdirSync(BUGS_DIR, { recursive: true }); fs.writeFileSync(BUGS, JSON.stringify(list, null, 2)); };
  if (p === '/api/bugs' && req.method === 'GET') return send(res, 200, loadBugs());
  if (p === '/api/bugs' && req.method === 'POST') {
    let body = ''; req.on('data', (c) => { body += c; if (body.length > 200000) req.destroy(); });
    req.on('end', () => {
      try {
        const b = JSON.parse(body || '{}'), list = loadBugs();
        const t = (v, n) => String(v ?? '').slice(0, n);
        const clean = { title: t(b.title, 200), scenario: t(b.scenario, 5000), expected: t(b.expected, 3000), actual: t(b.actual, 3000),
          severity: ['Low', 'Medium', 'High', 'Critical'].includes(b.severity) ? b.severity : 'Medium', status: b.status === 'Closed' ? 'Closed' : 'Open',
          flow: t(b.flow, 200), runId: t(b.runId, 60), url: t(b.url, 1000), assignee: t(b.assignee, 100),
          screenshots: (Array.isArray(b.screenshots) ? b.screenshots : []).filter((x) => /^bugs\/img\/[\w.-]+$/.test(x)).slice(0, 12) };
        if (!clean.title) return send(res, 400, { error: 'A bug needs a title.' });
        let bug = b.id && list.find((x) => x.id === b.id);
        if (bug) { Object.assign(bug, clean, { updated: Date.now() }); if (clean.status === 'Closed' && !bug.closed) bug.closed = Date.now(); if (clean.status === 'Open') delete bug.closed; }
        else {
          const next = list.reduce((m, x) => Math.max(m, parseInt(String(x.id).replace(/\D/g, ''), 10) || 0), 0) + 1;
          bug = { id: `BUG-${String(next).padStart(3, '0')}`, ...clean, created: Date.now(), updated: Date.now() };
          list.unshift(bug);
        }
        saveBugs(list); send(res, 200, bug);
      } catch (e) { send(res, 400, { error: e.message }); }
    });
    return;
  }
  if (p === '/api/bugs' && req.method === 'DELETE') {
    const id = String(url.searchParams.get('id') || ''); const list = loadBugs(); const bug = list.find((x) => x.id === id);
    if (!bug) return send(res, 404, { error: 'Not found' });
    for (const f of bug.screenshots || []) try { fs.rmSync(path.join(__dirname, f), { force: true }); } catch {}
    saveBugs(list.filter((x) => x.id !== id)); return send(res, 200, { ok: true });
  }
  if (p === '/api/bugs/image' && req.method === 'POST') {
    let body = ''; req.on('data', (c) => { body += c; if (body.length > 12 * 1024 * 1024) req.destroy(); });
    req.on('end', () => {
      try {
        const b = JSON.parse(body || '{}'); fs.mkdirSync(BUG_IMG, { recursive: true });
        const name = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        if (b.fromFile) { // a failure screenshot from test-results/
          const src = path.resolve(ROOT, String(b.fromFile));
          if (!src.startsWith(path.join(ROOT, 'test-results')) || !fs.existsSync(src)) return send(res, 400, { error: 'Screenshot not found' });
          const dest = `${name}${path.extname(src) || '.png'}`; fs.copyFileSync(src, path.join(BUG_IMG, dest)); return send(res, 200, { file: `bugs/img/${dest}` });
        }
        const m = String(b.data || '').match(/^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/);
        if (!m) return send(res, 400, { error: 'Not an image' });
        const dest = `${name}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`; fs.writeFileSync(path.join(BUG_IMG, dest), Buffer.from(m[2], 'base64'));
        send(res, 200, { file: `bugs/img/${dest}` });
      } catch (e) { send(res, 400, { error: e.message }); }
    });
    return;
  }
  // ---- team dashboard: shift reports imported from team members (dashboard/team/*.json)
  const TEAM_DIR = path.join(__dirname, 'team');
  if (p === '/api/team' && req.method === 'GET') {
    let list = [];
    try { list = fs.readdirSync(TEAM_DIR).filter((f) => f.endsWith('.json')).map((f) => { const r = readJson(path.join(TEAM_DIR, f), null); return r && { ...r, _file: f }; }).filter(Boolean); } catch {}
    list.sort((a, b) => String(b.shift && b.shift.start).localeCompare(String(a.shift && a.shift.start)));
    return send(res, 200, list);
  }
  if (p === '/api/team/import' && req.method === 'POST') {
    let body = ''; req.on('data', (c) => { body += c; if (body.length > 40 * 1024 * 1024) req.destroy(); });
    req.on('end', () => {
      try {
        const r = JSON.parse(body || '{}');
        if (r.type !== 'ff-shift-report' || !r.member || !r.member.name || !r.shift || !r.shift.start) return send(res, 400, { error: 'This is not a shift report file (export it from Shift Report on the dashboard).' });
        fs.mkdirSync(TEAM_DIR, { recursive: true });
        const slug = (String(r.member.name) + '-' + String(r.shift.start)).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90);
        const file = path.join(TEAM_DIR, `${slug}.json`); const existed = fs.existsSync(file);
        fs.writeFileSync(file, JSON.stringify({ ...r, importedAt: Date.now() }));
        send(res, 200, { ok: true, replaced: existed, file: `${slug}.json` });
      } catch (e) { send(res, 400, { error: 'Could not read that file: ' + e.message }); }
    });
    return;
  }
  if (p === '/api/team' && req.method === 'DELETE') {
    const f = String(url.searchParams.get('file') || ''); const all = url.searchParams.get('all') === '1';
    try {
      if (all) { for (const x of fs.readdirSync(TEAM_DIR)) if (x.endsWith('.json')) fs.rmSync(path.join(TEAM_DIR, x), { force: true }); }
      else if (/^[a-z0-9-]+\.json$/.test(f)) fs.rmSync(path.join(TEAM_DIR, f), { force: true });
      else return send(res, 400, { error: 'Unknown file' });
    } catch {}
    return send(res, 200, { ok: true });
  }
  // ---- clear run history (Settings)
  if (p === '/api/runs' && req.method === 'DELETE') {
    if (current) return send(res, 409, { error: 'A run is in progress.' });
    for (const f of fs.readdirSync(RUNS)) if (f !== 'README.txt') fs.rmSync(path.join(RUNS, f), { recursive: true, force: true });
    return send(res, 200, { ok: true });
  }
  if (p === '/api/finish' && req.method === 'POST') {
    const flag = path.join(ROOT, 'state', 'finish.flag');
    fs.mkdirSync(path.dirname(flag), { recursive: true });
    fs.writeFileSync(flag, new Date().toISOString());
    // if the test does not end by itself within 25s (older test code), stop it - it is still recorded as passed
    setTimeout(() => { if (current && current.summary.waitingForClose) { current.finishedByUser = true; stopRun(); } }, 25000);
    return send(res, 200, { ok: true });
  }
  if (p === '/api/continue' && req.method === 'POST') {
    const flag = path.join(ROOT, 'state', 'continue.flag');
    fs.mkdirSync(path.dirname(flag), { recursive: true });
    fs.writeFileSync(flag, new Date().toISOString());
    return send(res, 200, { ok: true });
  }
  if (p === '/api/live-worker' && req.method === 'POST') {
    let body = ''; req.on('data', (c) => (body += c));
    req.on('end', () => { try { liveWorker = Math.max(0, Math.min(3, parseInt(JSON.parse(body || '{}').worker, 10) || 0)); } catch {} lastFrame = null; send(res, 200, { worker: liveWorker }); });
    return;
  }
  if (p === '/api/live-mode' && req.method === 'POST') {
    let body = ''; req.on('data', (c) => (body += c));
    req.on('end', () => { try { liveMode = JSON.parse(body || '{}').mode === 'off' ? 'off' : 'screen'; } catch {} send(res, 200, { mode: liveMode }); });
    return;
  }
  if (/^\/api\/runs\/[\w-]+\/log$/.test(p)) {
    const f = path.join(RUNS, `${p.split('/')[3].replace(/[^\w-]/g, '')}.log`);
    return fs.existsSync(f) ? send(res, 200, fs.readFileSync(f), 'text/plain; charset=utf-8') : send(res, 404, '', 'text/plain');
  }
  if (p === '/' ) { res.writeHead(302, { Location: '/dashboard/index.html' }); return res.end(); }
  if (p === '/api/health') return send(res, 200, { ok: true, liveMode, liveWorker, queue: queueState(), node: process.version, ready: toolsReady(), folder: ROOT, running: current ? { id: current.id, script: current.script, started: current.started, summary: current.summary, options: current.options, screens: current.screens || [] } : null });
  if (p === '/api/scripts') return send(res, 200, scripts());
  if (p === '/api/runs' && req.method !== 'DELETE') return send(res, 200, loadIndex());
  if (p === '/api/reports') return send(res, 200, reportRows());
  if (p === '/api/queue' && req.method === 'GET') return send(res, 200, { items: queueState() });
  if (p === '/api/queue' && req.method === 'DELETE') { queue = []; broadcast('queue', { items: [] }); return send(res, 200, { items: [] }); }
  if (p === '/api/queue' && req.method === 'POST') {
    let body = ''; req.on('data', (c) => (body += c));
    req.on('end', () => {
      try {
        const b = JSON.parse(body || '{}');
        const items = (Array.isArray(b.items) ? b.items : []).filter((x) => scripts().some((s) => s.name === x.script));
        if (!items.length) return send(res, 400, { error: 'Nothing to run.' });
        queue.push(...items.map((x) => ({ script: x.script, options: runOptions({ ...b.options, label: x.label }) })));
        broadcast('queue', { items: queueState() });
        startNextQueued();
        send(res, 200, { items: queueState() });
      } catch (e) { send(res, 400, { error: e.message }); }
    });
    return;
  }
  if (p.startsWith('/api/runs/')) {
    const id = p.slice('/api/runs/'.length).replace(/[^\w-]/g, '');
    const rec = readJson(path.join(RUNS, `${id}.json`), null);
    return rec ? send(res, 200, rec) : send(res, 404, { error: 'Run not found' });
  }
  if (p === '/api/accounts') {
    const csv = fs.existsSync(path.join(ROOT, 'created_accounts.csv')) ? fs.readFileSync(path.join(ROOT, 'created_accounts.csv'), 'utf8') : '';
    return send(res, 200, { csv });
  }
  if (p === '/api/run' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try { const b = JSON.parse(body || '{}'); send(res, 200, startRun(b.script, runOptions(b))); }
      catch (e) { send(res, 409, { error: e.message }); }
    });
    return;
  }
  if (p === '/api/stop' && req.method === 'POST') return send(res, 200, { stopped: stopRun() });
  if (p === '/api/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', ...CORS });
    res.write('retry: 2000\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }
  // static: /dashboard/*, /playwright-report/*, /test-results/*, /created_accounts.csv
  if (/^\/(dashboard|playwright-report|test-results)\//.test(p) || p === '/created_accounts.csv') return serveFile(res, path.join(ROOT, p));
  send(res, 404, 'Not found', 'text/plain');
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`\nThe dashboard is already running (port ${PORT} is in use). Open http://localhost:${PORT}\n` +
                `To use another port: set DASHBOARD_PORT=4200 before "npm run dashboard".\n`);
    process.exit(0);
  }
  throw err;
});
server.listen(PORT, '127.0.0.1', () => {
  const link = `http://localhost:${PORT}`;
  console.log(`\nFlexiFunnels test dashboard is running: ${link}\nPress Ctrl+C to stop it.\n`);
  if (!toolsReady()) console.log('Note: the test tools are not installed in this folder yet. The first run from the dashboard installs them (or run "npm install" here).\n');
  if (!process.env.NO_OPEN) {
    const opener = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', link]] : process.platform === 'darwin' ? ['open', [link]] : ['xdg-open', [link]];
    try { spawn(opener[0], opener[1], { stdio: 'ignore', detached: true }).unref(); } catch {}
  }
});
