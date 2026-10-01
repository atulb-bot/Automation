# FlexiFunnels Automation — Commands

Run every command from the project folder (`flexifunnels-automation`) in the VS Code terminal.

Every command below has two forms that do the same thing:

- the full `npx playwright test ...` command
- a short `npm run ...` shortcut

The browser is always visible (headed).

---

## 0. Test dashboard (run tests and see reports in the browser)

```
npm run dashboard
```

This opens **http://localhost:4178**. The **left menu** has six pages:

| Page | What it is for |
|---|---|
| **Dashboard** | The last or current run at a glance: total, passed, failed, skipped and pass-rate cards; the live test run with steps; the **browser viewport** (live while running, last screen afterwards) with tabs for Test steps, Console logs and Screenshots; a progress ring; recent logs; recent runs; and **All application screens (captured during the test)**, a picture of every page the test reached (Chromium and Edge, live view on) |
| **Run Tests** | The flow list, run panel, live view and full results (as before) |
| **Test Cases** | Every flow with its file, last result and last run. Tick several and **Run selected**: they run one after another (a queue; **Clear queue** or **Stop** at any time) |
| **Test Results** | Every run, newest first; click one for its full report |
| **Reports** | Daily reports, charts and common failures (as before) |
| **Settings** | Defaults for new runs (browsers, Mode, workers, close browser), live view, the manual-step wait, theme and wallpaper |

**When a test keeps its browser open at the end** (a single test leaves the Thank You page open on purpose), the run shows **"Passed – browser left open"** and the Stop button becomes **Finish run**. Press **Finish run**, close the test browser window, or run `npm run finish` in a second terminal. The test then ends normally and is saved as **passed**. To never keep it open, turn on **Settings → Close the browser when a run finishes**.

**The top bar** sets the defaults for new runs: **Browser**, **Mode** (**Headed** shows the browser window; this is the default. **Headless** hides it, and the live view still works) and **Workers**. **Run tests** goes to Test Cases; **Stop** appears while something runs.

More about the Run Tests page:

- **Pick a flow:** the left panel lists every flow in plain words, grouped as Funnel, Membership USD, Membership INR, Single product and Free trial. Search finds one quickly.
- **Start it:** click a flow to open its run panel. It explains what the flow does step by step, then **Start run**.
- **Existing products:** use **Build a funnel on products you already have**, then fill in **Product ID** (for "QA tTpLzQ FE" type `tTpLzQ`) and **Project name** (exactly as in Projects).
- **A funnel of your choice:** each One-Click and Regular **path** has an optional **FE page link**. Leave it empty to use the last funnel built.
- **Live view:** the small panel on the right shows the whole test browser window, scaled down, as it runs. It follows the test into new tabs. ⤢ or a click enlarges it. **Off** stops the live view completely. It only takes pictures and never changes the test page.
- **Follow along:** the page shows steps, the buyer path (FE bought › OTO1 no thanks › DS1 bought (one click) › … › Thank You), the outcome, results per test and the full log. **Stop run** at any time.
- **First time in a new folder:** the dashboard installs the test tools and browser itself (**Set up now**, or automatically on the first run). Setup problems are explained in plain words.
- **Continue after a failure:** a separate tab for when a run broke part-way. **Build a funnel on products you already have** (Product ID + Project name) and the six buyer paths (optional FE page link) carry on without building everything again.
- **Messages:** after **each test** a notice says "Test completed successfully" (or failed), and when the run ends a completion card shows the totals, with **Run again**.
- **Tests at the same time (workers):** in the run panel, pick **1, 2, 3 or 4**. With more than 1, several tests run at once, each in its own browser (the dashboard adds `--workers=N --fully-parallel`). It only speeds up flows with several tests, such as all 6 pricings, both funnel types or all free trials. During the run, **Worker 1 / 2 / 3** buttons in the live view switch between the browsers.
- **Browsers:** in the run panel, tick **Chromium**, **Firefox** and/or **Microsoft Edge**. With more than one, they run **at the same time** (at least one worker per browser). Edge uses the Edge installed on this computer; Firefox is downloaded automatically the first time. The live view works for Chromium and Edge. From the terminal: PowerShell `$env:BROWSERS="chromium,firefox,edge"; npm run funnel:oneclick` (without `BROWSERS`, only Chromium runs, as before).
- **Reports:** the **Reports** switch in the header opens the report section, covered below.
- **Layout:** ☰ (top left) hides or shows the flow list. **Wallpaper** picks Aurora, Vortex, Horizon, Funnel rings, or **your own image** (JPG or PNG up to about 3 MB). **Day theme / Night theme** switches the look. All are remembered.
- **Header:** shows the last run's result, the pass rate of the last 20 runs, and how many runs today.
- **Run history:** every run is saved. Click one to see its report again. **Playwright report** opens Playwright's own report.

**Reports section:** press **Reports** in the header.

- **Filters:** period (Today, Last 7 days, Last 30 days, All), category and result, plus a search box.
- **Summary cards:** runs, passed, failed, pass rate, tests run and total test time.
- **Runs per day:** a chart of passed and failed runs.
- **Most common failures:** grouped by step and reason, with how often and when last seen.
- **Daily reports:** one section per day with every run. Click a run for its full report; **Playwright** opens that run's own Playwright report (the last 20 are kept).
- **Download CSV** or **Print / save as PDF** (in the print dialog, choose "Save as PDF").

**With Live Server:** keep `npm run dashboard` running, then right-click `dashboard/index.html` → **Open with Live Server**. The page connects to the dashboard, so the live view and **Start run** work there too. Without the dashboard running, it shows saved reports only.

Only one run at a time. Press **Ctrl+C** in the terminal to stop the dashboard. Saved runs are kept in `dashboard/runs/`. To use a different port: PowerShell `$env:DASHBOARD_PORT="4200"; npm run dashboard` (Live Server then only finds it on 4178, the default).

**Build a funnel on existing products from the terminal:**

```
npm run funnel:for tTpLzQ "QA Kdm tTpLzQ OneClick Project"
```

The first value is the product ID, the second the project name (exactly as in Projects).

---

## 0b. When the script gets stuck: do the step by hand, the run continues

For the funnel and single-product flows, a step the script can't do no longer stops the run. Instead the terminal (and the dashboard) shows:

```
>>> ✋ MANUAL STEP NEEDED: Wire "FE Sales" CTA 1/1
    What to do: Select the button -> Style Settings -> Go To Next Step In Funnel -> ...
```

1. **Do that step by hand in the test browser.**
2. **The run continues by itself** as soon as it can see the result: a page appearing in the list, the button's "WARNING" label disappearing, the funnel step showing, or the checkout moving on.
3. **If it can't tell,** press **I've done it – continue** on the dashboard, or run `npm run continue` in a second terminal.

It waits up to **5 minutes** per step (change with `MANUAL_WAIT_MIN`). To switch this off and stop straight away on failures, set `MANUAL_ASSIST=0`.

**Work you did yourself before the script got there** is noticed: a page that already exists is not created again, and a funnel step already in the tree is not added again.

**Covered steps:** creating pages, adding the CTA and No thanks buttons, wiring them, the funnel's DS2 step, and checkouts. Membership and free-trial flows keep their usual behaviour.

---

## 0c. Your own details (for teams): `my-details.json`

Each person who runs the tests keeps their **own** `my-details.json` in the project folder. It is **not shared through git**.

```json
{
  "loginEmail": "the FlexiFunnels account the tests log in with",
  "loginPassword": "its password",
  "testEmail": "your.name@company.com",
  "firstName": "YourName",
  "phone": "1234567890",
  "city": "Dehradun"
}
```

- **Test sign-ups** (free trials, buyers, opt-in leads) use `testEmail` with +aliases, such as `your.name+abc123@company.com`, so **every test mail goes to you**.
- **Editing it:** in a text editor, or **Dashboard → Settings → My details** (the password is only replaced if you type a new one).
- **A teammate's first time:** copy `my-details.example.json` to `my-details.json` and put their own details in it.
- **Environment variables** for the login still override the file, if you use them.

## 0d. Editor: Save, then Publish

After the script changes a page (buttons, wiring, forms), it now clicks **Save** next to Publish, waits for the save to finish, and only then publishes. Nothing done to the page is lost.

---

## 0e. New dashboard pages

- **Custom Scripts:** import your own scenarios.
  - **Getting code in:** drop `.spec.ts` files (several at once), choose files, or **paste** a script such as a codegen recording. **Start from template** gives you a ready skeleton that logs in with your `my-details.json`.
  - **Check:** compiles the script and lists its tests without running it.
  - **Save** / **Save & run:** files are saved in `tests/imported/` and listed under **Imported** in Run Tests and Test Cases.
  - **Managing them:** each imported script can be **Run**, **Edit**ed, **Rename**d, **Download**ed or deleted (✕). From the terminal: `npm run import -- path/to/file.spec.ts "Name"`.
- **Bug Sheet:** log bugs while you test.
  - **What a bug holds:** an ID (BUG-001…), title, scenario/steps, expected and actual result, severity, flow, assignee, page URL and screenshots. Add screenshots by upload, **Ctrl + V** paste, or **Grab the live test screen**.
  - **Status:** click **Open** / **Closed** to switch it.
  - **Finding bugs:** filter by status and severity, or search.
  - **Exporting:** **Generate PDF** opens a printable report (choose "Save as PDF" in the print dialog); **CSV** exports a spreadsheet.
  - **From a failed run:** **Report as bug** pre-fills the bug with the flow, its steps, the reason and the failure screenshot.
  - **Storage:** bugs are kept in `dashboard/bugs/`.
- **Settings:** now also has **desktop notifications** and **sounds** (run passed / failed / waiting for you), **export / import** of your dashboard settings, and **clear run history**.
- **Account (run panel):** **Another account** runs a test with a different FlexiFunnels login, for that run only (never saved).
- **Live wallpapers:** in the wallpaper picker or Settings, choose **Live: Starfield**, **Live: Waves**, **Live: Network** or **Live: Funnel vortex**. They pause when the tab is hidden and stay still if Windows "reduce motion" is on.
- **Laptop screens:** checked at 1280, 1366, 1440, 1536 and 1920px wide, with nothing going off-screen. At 1440px and below, the left menu shrinks to icons (hover for the name).
- **Tab icon:** spinning rings while a test runs, amber when it is waiting for you, a green or red dot for the last result.

## 0g. Shift reports and the Team Dashboard

**For each team member, at the end of their shift:**
1. **Start the shift:** at the start, **Shift Report → Start shift now** (optional; otherwise the shift starts at their first run of the day).
2. **End the shift:** at the end, **⏻ End shift** (top bar) → fill in **name, role**, "What I tested" and any **blockers** → **End shift & download report**.
3. **Send the file:** it is called `shift-report-<name>-<date>.json`. Send it to the team lead by chat or email. **Print / PDF** makes a readable copy.

The report collects everything from that time window: every run (flow, result, time, browsers, failure reason), the bugs logged or closed (screenshots optional), and the totals.

**For the team lead: Team Dashboard.** Drop everyone's report files on it (several at once; importing the same report again replaces it). Choose **Today / 7 days / 30 days / All** and **Everyone** or one person. It shows:

- **Summary cards:** members, shifts, shift hours, test runs, pass rate, bugs (open).
- **Team health rings:** pass rate, bugs closed, test time vs shift time.
- **Team activity:** passed and failed runs per day.
- **Top contributors:** a leaderboard (runs, bugs, hours, pass rate).
- **Issues found:** Bugs, Payment / checkout, Network / timeout, Not found / missing, UI / element. Click a card to list those issues.
- **Team members table** and **team bugs list.**
- **Exports:** **Team PDF** and **CSV**. Imported reports are kept in `dashboard/team/`.

## 0f. Check existing (read-only)

**Check a live page or split URL:** `CHECK_URL=https://... npm run check:url`, or the dashboard: **Run Tests → Check existing**. It changes nothing: no edits, no publishing, no form submit, no purchase.

- **Visits:** opens the URL several times in fresh browsers (default 6, `CHECK_VISITS`) and reports **which versions are served** (Original / Variant).
- **Each version:** checks that it **loads**, its **headline**, its **form fields** (Email / Name present?), whether it has a **SUBMIT** button, and its **CTA**.
- **Sales pages:** **follows that version's own CTA** and checks it reaches a **checkout with Stripe**. An error page (404 / 500) is a ❌. Turn this off with `CHECK_FOLLOW_CTA=0`.
- **Result:** a **checklist** of ✅ / ⚠️ / ❌ on the dashboard. The run fails only on a ❌.

---

## 1. Free Trial — Monthly plans

File: `tests/freeTrialMultiPlan.spec.ts`

| What it runs | Full command | Shortcut |
|---|---|---|
| **Pro** – monthly, with card | `npx playwright test tests/freeTrialMultiPlan.spec.ts -g "Pro" --headed` | `npm run trial:pro` |
| **LaunchPad** – monthly, with card | `npx playwright test tests/freeTrialMultiPlan.spec.ts -g "LaunchPad - Monthly" --headed` | `npm run trial:launchpad` |
| **FlexiFunnels (Premium)** – monthly, with card | `npx playwright test tests/freeTrialMultiPlan.spec.ts -g "FlexiFunnels - Monthly" --headed` | `npm run trial:flexifunnels` |
| **No card** trial (no plan is selected) | `npx playwright test tests/freeTrialMultiPlan.spec.ts -g "No Card" --headed` | `npm run trial:nocard` |
| All 3 **with-card** monthly plans | `npx playwright test tests/freeTrialMultiPlan.spec.ts -g "WITH Card" --headed` | `npm run trial:all-card` |
| **All monthly** (no card + 3 with card) | `npx playwright test tests/freeTrialMultiPlan.spec.ts --headed` | `npm run trial:monthly` |

## 2. Free Trial — Yearly plans

File: `tests/freeTrialYearly.spec.ts`

| What it runs | Full command | Shortcut |
|---|---|---|
| **Pro** – yearly, with card | `npx playwright test tests/freeTrialYearly.spec.ts -g "Pro" --headed` | `npm run trial:pro-yearly` |
| **LaunchPad** – yearly, with card | `npx playwright test tests/freeTrialYearly.spec.ts -g "LaunchPad - Yearly" --headed` | `npm run trial:launchpad-yearly` |
| **FlexiFunnels (Premium)** – yearly, with card | `npx playwright test tests/freeTrialYearly.spec.ts -g "FlexiFunnels - Yearly" --headed` | `npm run trial:flexifunnels-yearly` |
| **All yearly** (3 plans) | `npx playwright test tests/freeTrialYearly.spec.ts --headed` | `npm run trial:yearly` |

## 3. Free Trial — Everything

| What it runs | Full command | Shortcut |
|---|---|---|
| All monthly + all yearly (7 accounts) | `npx playwright test tests/freeTrialMultiPlan.spec.ts tests/freeTrialYearly.spec.ts --headed` | `npm run trial:everything` |
| Pro monthly + Pro yearly | `npx playwright test tests/freeTrialMultiPlan.spec.ts tests/freeTrialYearly.spec.ts -g "Pro" --headed` | — |

**How free trial runs behave**

- **Single test:** stops at the dashboard and the browser **stays open** until you close it.
- **Several tests:** each account runs in a fresh browser. After the dashboard it closes, and the next plan starts automatically.
- **OTP:** enter the 6-digit OTP manually in the browser when the terminal says **PAUSED**. You have 90 seconds.
- **Accounts log:** every created account is saved to `created_accounts.csv`.

---

## 4. Membership — USD pricing

File: `tests/membership-billing-frequencies.spec.ts`

Each test creates a random project and course, then runs these steps:

1. Instructor (Dehradun)
2. Pricing
3. Module with 1 lesson and its YouTube video
4. Group
5. Landing pages (sales, checkout, thank-you: Edit + Publish each)
6. Sales & Checkout, then Save changes
7. Visit, then the Stripe test purchase, ending on the thank-you page

| What it runs | Price | Full command | Shortcut |
|---|---|---|---|
| **Weekly** subscription | $9 | `npx playwright test tests/membership-billing-frequencies.spec.ts -g "Weekly" --headed` | `npm run membership:weekly` |
| **Monthly** subscription | $29 | `npx playwright test tests/membership-billing-frequencies.spec.ts -g "Monthly" --headed` | `npm run membership:monthly` |
| **Quarterly** subscription | $79 | `npx playwright test tests/membership-billing-frequencies.spec.ts -g "Quarterly" --headed` | `npm run membership:quarterly` |
| **6 Months** subscription | $149 | `npx playwright test tests/membership-billing-frequencies.spec.ts -g "6 Months" --headed` | `npm run membership:6months` |
| **Yearly** subscription | $279 | `npx playwright test tests/membership-billing-frequencies.spec.ts -g "Yearly" --headed` | `npm run membership:yearly` |
| **One-Time** payment | $97 | `npx playwright test tests/membership-billing-frequencies.spec.ts -g "One-Time" --headed` | `npm run membership:onetime` |
| **All 6 USD** courses | — | `npx playwright test tests/membership-billing-frequencies.spec.ts --headed` | `npm run membership:all` |

## 5. Membership — INR pricing


**Payment:** INR courses are sold through **Razorpay** (default) or **Cashfree**, not Stripe. After **Complete Order** the gateway window opens: **pay by hand**, and the test carries on by itself at the Thank You page (it waits up to 15 minutes). Choose the gateway in the run panel (**Payment gateway**), or from the terminal: PowerShell `$env:INR_GATEWAY="cashfree"; npm run membership-inr:yearly`.

File: `tests/membership-billing-frequencies-inr.spec.ts` — same flow as USD, with Indian Rupee pricing.

| What it runs | Price | Full command | Shortcut |
|---|---|---|---|
| **Weekly** subscription | ₹1 | `npx playwright test tests/membership-billing-frequencies-inr.spec.ts -g "Weekly" --headed` | `npm run membership-inr:weekly` |
| **Monthly** subscription | ₹1 | `npx playwright test tests/membership-billing-frequencies-inr.spec.ts -g "Monthly" --headed` | `npm run membership-inr:monthly` |
| **Quarterly** subscription | ₹1 | `npx playwright test tests/membership-billing-frequencies-inr.spec.ts -g "Quarterly" --headed` | `npm run membership-inr:quarterly` |
| **6 Months** subscription | ₹1 | `npx playwright test tests/membership-billing-frequencies-inr.spec.ts -g "6 Months" --headed` | `npm run membership-inr:6months` |
| **Yearly** subscription | ₹1 | `npx playwright test tests/membership-billing-frequencies-inr.spec.ts -g "Yearly" --headed` | `npm run membership-inr:yearly` |
| **One-Time** payment | ₹1 | `npx playwright test tests/membership-billing-frequencies-inr.spec.ts -g "One-Time" --headed` | `npm run membership-inr:onetime` |
| **All 6 INR** courses | — | `npx playwright test tests/membership-billing-frequencies-inr.spec.ts --headed` | `npm run membership-inr:all` |

## 6. Membership — Everything

| What it runs | Full command |
|---|---|
| All 12 courses (6 USD + 6 INR) | `npx playwright test tests/membership-billing-frequencies.spec.ts tests/membership-billing-frequencies-inr.spec.ts --headed` |
| Yearly in USD **and** INR | `npx playwright test tests/membership-billing-frequencies.spec.ts tests/membership-billing-frequencies-inr.spec.ts -g "Yearly" --headed` |

**How membership runs behave**

- **Single test:** the flow stops after **Complete Order**. The **thank-you page stays open**, and the window stays open until you close it or press Ctrl+C.
- **Several tests:** everything runs in **one window**, with each pricing in a **new tab**. Every thank-you tab stays open. After the last one, the window stays open until you close it.
- **Terminal output:** shows `[STEP x/7]` progress, then `✅ FLOW COMPLETED SUCCESSFULLY` with the project, course, price, buyer email and thank-you URL. If something breaks you get `❌ FLOW FAILED` with the step and the reason.
- **Prices:** to change them, edit the `COURSES` list at the top of the spec file.
- **Lesson count:** to change it, edit `LESSONS_PER_MODULE` at the top of the spec file.

## 7. Membership — Original combined flow

File: `tests/membership-course-flow.spec.ts` — one project with 2 courses (subscription + one-time).

| Full command | Shortcut |
|---|---|
| `npx playwright test tests/membership-course-flow.spec.ts --headed` | `npm run test:membership` |

---

## 7a. Funnel wiring test cases — One-Click and Regular

File: `tests/funnel-flows.spec.ts` (blank pages).

Each funnel type is **built once** (project, pages, 5 products, funnel tree, wiring and publish). Then 3 buyer paths run against it, each in a **new tab**, and every **Thank You tab stays open**. At every step the test checks it landed on the right page ("Sales OTO1", "Sales DS1", …), so a wrong wire fails the test.

| Path | Buyer does |
|---|---|
| **Path 1** | FE buy → OTO1 **no thanks** → DS1 **buy** → OTO2 **buy** → Thank You |
| **Path 2** | FE buy → OTO1 **buy** → OTO2 **no thanks** → DS2 **buy** → Thank You |
| **Path 3** | FE buy → OTO1 **buy** → OTO2 **no thanks** → DS2 **no thanks** → Thank You |

**Checkout rules** (checked by the test):

- **Regular funnel:** every **buy** opens that product's checkout page, where details and card are entered, then Complete Order. **No thanks** goes straight to the next page.
- **One-Click funnel:** details and card are entered **once, on FE**. After that, buy and No thanks go straight to the next page.
- **Failures:** the test fails if a One-Click funnel asks for the card again, or a Regular funnel skips the checkout.

| What it runs | Shortcut | Full command |
|---|---|---|
| One-Click: build + paths 1–3 | `npm run funnel:oneclick` | `npx playwright test tests/funnel-flows.spec.ts -g "One-Click" --headed` |
| Regular: build + paths 1–3 | `npm run funnel:regular` | `npx playwright test tests/funnel-flows.spec.ts -g "Regular" --headed` |
| Both types (8 tests) | `npm run funnel:all-types` | `npx playwright test tests/funnel-flows.spec.ts --headed` |
| One-Click build only | `npm run funnel:oneclick-build` | `... -g "Build \(One-Click\)"` |
| One-Click Path 1 / 2 / 3 only | `npm run funnel:oneclick-path1` (or `-path2`, `-path3`) | `... -g "Path 1.*\(One-Click\)"` |
| Regular build only | `npm run funnel:regular-build` | `... -g "Build \(Regular\)"` |
| Regular Path 1 / 2 / 3 only | `npm run funnel:regular-path1` (or `-path2`, `-path3`) | `... -g "Path 1.*\(Regular\)"` |

- **Re-running a path:** a single path uses the **last funnel built** for that type (saved in `state/funnel-oneclick.json` / `state/funnel-regular.json`), so you can re-run it without rebuilding. Run the build once first.
- **Card and buyer on every checkout:** the same as membership: `4242 4242 4242 4242`, `02 / 36`, `225`, buyer "Atul …" with `atul.b+…@flexifunnels.com`.

## 7b. Products + Funnel

File: `tests/full-funnel-flow.spec.ts`

This runs the whole journey:

1. Project
2. Pages
3. Five products (FE, OTO1, DS1, OTO2, DS2)
4. Funnel tree, ending with **OTO2 → Say no to → DS2**
5. Every sales page: add CTA (+ No thanks on all pages except FE), wire them via **Go To Next Step In Funnel**, then Publish (see the table below)
6. Checkout and Thank You pages published
7. Live purchase through to the **Thank You page**

| What it runs | Full command | Shortcut |
|---|---|---|
| Full journey, **accept** every offer (FE → OTO1 → OTO2 → Thank You) | `npx playwright test tests/full-funnel-flow.spec.ts --headed` | `npm run funnel:full` |
| Full journey, **"No thanks"** on every offer (FE → OTO1 → DS1 → OTO2 → DS2 → Thank You) | PowerShell: `$env:FUNNEL_PATH="decline"; npx playwright test tests/full-funnel-flow.spec.ts --headed` | `npm run funnel:full-decline` |
| Funnel + wiring only, on existing products | `npx playwright test tests/funnel-only.spec.ts --headed` | `npm run funnel:only` |
| Full journey with **template** sales pages instead of blank | PowerShell: `$env:PAGE_MODE="template"; npx playwright test tests/full-funnel-flow.spec.ts --headed` | — |

**Blank sales pages** (the default, for funnel and single product)

- **How each page is built:** each sales page is created from **Blank Template**. The script adds a Section, a 2-column row, a headline (**"Sales FE"**, **"Sales OTO1"**, **"Sales DS1"**, **"Sales OTO2"**, **"Sales DS2"**) and a button.
- **Checkout and Thank You pages** still use templates.
- **Template pages instead:** set `PAGE_MODE=template`. `Remove-Item Env:PAGE_MODE` (or a new terminal) goes back to blank.

**Buttons on each sales page** (both modes)

| Page | CTA button | "No thanks" |
|---|---|---|
| FE Sales | Go To Next Step In **Funnel** → funnel → FE (FE has no Link To) | not added |
| OTO1 / DS1 / OTO2 / DS2 Sales | Go To Next Step In **Funnel** → funnel → its own product → **Upsell / Downsell** | added under the CTA: Go To Next Step In Funnel → funnel → its own product → Upsell / Downsell |

**Go To Next Step In Product** is only used by the **single product** flow (section 7c).

**How funnel runs behave**

- **After the purchase:** the **Thank You page stays open**, and the window stays open until you close it (same as free trial).
- **Terminal output:** ends with `✅ FUNNEL FLOW COMPLETED SUCCESSFULLY` plus the funnel, buyer and Thank You URL. The log also lists every page the buyer passed through.
- **If a CTA can't be added or wired**, or the DS2 step is missing, the run stops with a clear message and a screenshot in `test-results/`.

## 7c. Single Product (no funnel)

File: `tests/single-product-no-funnel.spec.ts`

This runs:

1. Project
2. FE Sales, FE Checkout and Thank You pages
3. One FE product
4. FE Sales CTA → **Go To Next Step In Product → FE** (no "No thanks")
5. Checkout and Thank You pages published
6. Live purchase through to the **Thank You page**, which stays open

| What it runs | Full command | Shortcut |
|---|---|---|
| Single product, **blank** sales page (Section, 2 columns, "Sales FE", button) | `npx playwright test tests/single-product-no-funnel.spec.ts --headed` | `npm run single:product` (or `single:product-blank`) |
| Single product, **template** sales page | PowerShell: `$env:PAGE_MODE="template"; npx playwright test tests/single-product-no-funnel.spec.ts --headed` | — |

**Output:** the terminal ends with `✅ SINGLE PRODUCT FLOW COMPLETED SUCCESSFULLY` plus the product, buyer and Thank You URL.

## 7d. Email opt-in

File: `tests/email-optin.spec.ts`. In the dashboard it is under **Email opt-in**.

1. **Project:** a new project with no project type picked. It comes with **Email Optin Page** and **Thank You Page**.
2. **Templates:** Email Optin Page gets the **Blank Template**; Thank You Page gets a **Thank You** template.
3. **Thank You page:** Edit → Publish → **Publish as Thank You (Opt-in)**, then its **Published URL** is copied.
4. **Opt-in page:** Edit → Section → 2 Columns → Headline **"Email Optin"** → **Forms → Form**.
5. **Form settings:** the form has **Name** and **Email** already; **Phone, Address, City** are added (the dropdown next to **Add**, picked by name). Then **Form Submit Action** → **Submit** → website URL = the Thank You URL → **Add Action** → Publish.
6. **Live opt-in page:** fill in Name, Email (a unique `atul.b+opt…@flexifunnels.com` each run), Phone, Address and City → **SUBMIT** → the **Thank You page** must appear.

| What it runs | Full command | Shortcut |
|---|---|---|
| Email opt-in, end to end | `npx playwright test tests/email-optin.spec.ts --headed` | `npm run optin:email` |

The Thank You page stays open at the end (use **Finish run** on the dashboard). If the form saves the lead but doesn't go to the Thank You page, the test fails with "check the Form Submit Action URL".

## 7e. Split tests

In the dashboard these are under **Split test**. Both use the **split test app** (Apps → Launch): **New Campaign** → name → project → **control page** → Create & continue → **variant** page (notes "V2") → Next → **Equal distribution** → Next → **Manual** winner → Next → **Launch Campaign** → **Visit**.

| What it runs | Full command | Shortcut |
|---|---|---|
| Email opt-in: **Email Optin Page** (Original, headline "Email Optin Original") vs **Email Optin Variant** (Add New Page, headline "Email Optin Variant"). Both forms have Name, Email, Phone, Address and City, and go to the Thank You page. Ends with a sign-up through the split URL. | `npx playwright test tests/split-test-optin.spec.ts --headed` | `npm run split:optin` |
| Single product: **FE Sales** (Original) vs **FE Sales Variant**, both CTAs → Go To Next Step In Product → the same FE product. Ends with a test purchase through the split URL. | `npx playwright test tests/split-test-single-product.spec.ts --headed` | `npm run split:single` |

**Variant row:** after choosing the variant page, the row's **green ✓** (ACTION column) is clicked, and the test waits for **Next** to become usable.

**Ending:** see *How split tests reach both versions* below: the page Visit opened is bought first, the page is reopened with Visit, then a **different browser** (Edge ↔ Chrome) opens the Visit link, gets the **Variant**, and buys there too.

**Picking from the dropdowns:** the project and pages are picked **by their exact name**, so "FE Sales" never picks "FE Sales Variant". Any step that can't be done automatically asks you to do it by hand, then carries on.

## 7f. FlexiViral, FlexiProof, combined flow, funnel split tests

| What it runs | Shortcut |
|---|---|
| **FlexiViral** (standalone): Create New Contest (name, start today, end next month, Asia/Kolkata), **every entry method** (questions, image, single / multiple choice, Instagram, Facebook, YouTube video / submit / subscribe / page, X tweet / hashtag, viral share, bonus, custom), a **prize**, save, then **Visit** and register with your name and email | `npm run app:flexiviral` |
| **FlexiProof** (standalone, on a project that already exists): campaign → notification types → **Page Settings: the project + all its pages** → Top-right, count 1 → Save → **republish** the pages → visit them and check the **proof widget** is there. Give the project with `QA_PROJECT_NAME`, and the pages to republish with `FP_PAGES` (default FE Sales). | `npm run app:flexiproof` |
| **Single product + split test + FlexiProof:** FE Sales + FE Sales Variant + checkout + Thank You, FE product, split campaign, FlexiProof on the project, republish pages + checkout, widget check, then **buy through both FE versions** | `npm run combo:single-split-proof` |
| **Funnel split, FE variant:** the normal One-Click funnel + **FE Sales Variant** (same funnel), a campaign on FE, then **the whole funnel bought from both FE versions** | `npm run split:funnel-fe` |
| **Funnel split, every page:** a **Variant for FE, OTO1, DS1, OTO2 and DS2**, one campaign each, then buyer journeys (path 1 and path 3 alternately) in new windows until every variant was served. It reports which version each page served. `SPLIT_JOURNEYS` sets the most journeys (default 8). | `npm run split:funnel-all` |

**How split tests reach both versions:** after the campaign is created, the split page is always opened with the campaign's **Visit** button, and the Visit link itself (the split link) is recorded.

1. The purchase (or sign-up) is completed on the page Visit opened.
2. The page is opened again with **Visit**.
3. A **different browser** opens the same Visit link: from **Edge → Google Chrome**, from **Chrome or Chromium → Microsoft Edge**. If one isn't installed, the next is tried (Chrome, Edge, Playwright's Chromium, Firefox). The **Variant** comes there.
4. The purchase is completed there too, and the test passes. If that browser shows the version that is already done, another browser is tried (up to 12 visits).

These are all **new tests**. The existing flows are unchanged.

## 8. Useful options

| Option | What it does |
|---|---|
| `--list` | Shows which tests a command **would** run, without running them. Example: `npx playwright test tests/membership-billing-frequencies.spec.ts -g "Yearly" --list` |
| `npx playwright show-report` / `npm run report` | Opens the HTML report of the last run |
| `npx playwright codegen https://app.flexifunnels.com/new-login` | Records your clicks as code. Use it to capture new selectors. |
| **Keep browser open** (free trial, every run) | PowerShell: `$env:KEEP_OPEN="1"; npx playwright test ...` |
| **Close browser at the end** (no waiting) | PowerShell: `$env:KEEP_OPEN="0"; npx playwright test ...` |
| Clear the `KEEP_OPEN` setting | PowerShell: `Remove-Item Env:KEEP_OPEN` (or open a new terminal) |

> In **cmd** instead of PowerShell, use `set KEEP_OPEN=0 && npx playwright test ...`

## 9. Seeing pass / fail in VS Code

1. Install the **Playwright Test for VS Code** extension.
2. Open the **Testing** panel (the flask icon).
3. Run any test with ▶. A passed test gets a **green tick ✅**, and a failed one a **red ✖** with the failing step. Membership tests also list each step underneath.

## 10. When something fails

- **Diagnostic lines:** the terminal prints `>>> [DIAGNOSTIC]` lines with the page URL and every visible button.
- **Screenshot:** one is saved in `test-results/`.
- **Getting a fix:** copy those lines and send them over, and the exact step can be fixed.

> **Note:** `npm run test:free-trial` (`tests/free-trial-flow.spec.ts`) is an old, broken file. Use the free trial commands in sections 1–3 instead.
