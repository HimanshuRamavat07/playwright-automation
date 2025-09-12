const { test, expect } = require('@playwright/test');
const axios = require('axios');
// Load environment variables from .env if present (without failing in CI if missing)
try { require('dotenv').config(); } catch (_) {}

// ================== Slack Config ==================
function parseWebhookCsv(value) {
  if (!value) return [];
  return value
    .split(/[\n,]/)
    .map(v => v.trim())
    .filter(Boolean);
}

function collectNumberedEnv(prefix, max = 20) {
  const values = [];
  for (let i = 1; i <= max; i++) {
    const v = process.env[`${prefix}_${i}`];
    if (v && v.trim()) values.push(v.trim());
  }
  return values;
}

function isLikelySlackWebhook(url) {
  return /^https:\/\/hooks\.slack\.com\/services\/.+/.test(url);
}

function loadSlackWebhookUrls() {
  const fromCsv = parseWebhookCsv(process.env.SLACK_WEBHOOK_URLS);
  const fromNumbered = collectNumberedEnv('SLACK_WEBHOOK_URL');
  const all = [...fromCsv, ...fromNumbered]
    .map(u => u.trim())
    .filter(Boolean);

  // Dedupe
  const deduped = Array.from(new Set(all));

  // Validate and warn about invalids
  const valid = [];
  for (const u of deduped) {
    if (isLikelySlackWebhook(u)) {
      valid.push(u);
    } else {
      console.warn('⚠️ Ignoring invalid SLACK webhook URL format:', u.replace(/^(https?:\/\/[^/]+).*/, '$1/...'));
    }
  }


  if (valid.length === 0) {
    console.log('ℹ️ No Slack webhook URLs configured. Set SLACK_WEBHOOK_URLS or SLACK_WEBHOOK_URL_1, _2, ...');
  } else {
    console.log(`ℹ️ Slack webhooks configured: ${valid.length}`);
  }
  return valid;
}

const SLACK_WEBHOOK_URLS = loadSlackWebhookUrls();
const SLACK_APP_NAME = "Autohammer Result Test";
const SLACK_ICON = ":robot_face:";

let totalChecks = 0;
let passedChecks = 0;
let failedChecks = 0;
let resultsLog = [];

// ================== Helper Functions ==================
function getCurrentDateTime() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

async function sendSlackReport() {
  const currentDateTime = getCurrentDateTime();
  const message =
    `:rocket: *Autohammer vs Mobile.de Test Report*\n` +
    `:calendar: *Date and Time:* ${currentDateTime}\n` +
    `:bar_chart: *Total Checks Performed:* ${totalChecks}\n` +
    `:white_check_mark: *Passed Checks:* ${passedChecks}\n` +
    `:x: *Failed Checks:* ${failedChecks}\n` +
    `\n*Details:*\n${resultsLog.join('\n')}`;

  const payload = {
    username: SLACK_APP_NAME,
    icon_emoji: SLACK_ICON,
    text: message,
    unfurl_links: false,
    unfurl_media: false,
  };

  if (!SLACK_WEBHOOK_URLS || SLACK_WEBHOOK_URLS.length === 0) {
    console.log('ℹ️ Skipping Slack notification: no webhooks configured');
    return;
  }

  const results = await Promise.allSettled(
    SLACK_WEBHOOK_URLS.map(url => axios.post(url, payload, { timeout: 10000 }))
  );

  results.forEach((res, idx) => {
    const url = SLACK_WEBHOOK_URLS[idx];
    const masked = url.replace(/^(https?:\/\/[^/]+\/[^/]+\/)[^/]+\/[^/]+\/(.+)$/, '$1.../$2');
    if (res.status === 'fulfilled') {
      console.log(`✅ Slack notification sent -> ${masked}`);
    } else {
      const errMsg = res.reason && res.reason.message ? res.reason.message : String(res.reason);
      console.error(`❌ Failed to send Slack notification -> ${masked}: ${errMsg}`);
    }
  });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function acceptConsent(page) {
  const candidates = [
    'button.mde-consent-accept-btn',
    'button:has-text("Einverstanden")',
    'button.sc-bRKDuR.eIxcnl.mde-consent-accept-btn'
  ];
  for (const sel of candidates) {
    const btn = page.locator(sel).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click().catch(() => {});
      await sleep(400);
      console.log('✅ Consent accepted');
      return;
    }
  }
  console.log('ℹ️ Consent button not found');
}

async function readMobileDe(page, url, label) {
  console.log(`\n🔷 MOBILE.DE → ${label}`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await acceptConsent(page);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `screenshots/${Date.now()}_mobilede_${label}.png`, fullPage: true });

  const resultCount = parseInt(await page.locator('span.resultCount').first().textContent() || '0', 10);
  const resultsMatched = parseInt(await page.locator('span.resultsMatched').first().textContent() || '0', 10);
  console.log(`📊 Mobile.de (${label}) => resultCount=${resultCount}, resultsMatched=${resultsMatched}`);
  return { resultCount, resultsMatched };
}

async function openAutohammer(page) {
  await page.goto('https://autohammer.de/neuwagen-vorfuehrer-gebrauchtwagen', { waitUntil: 'domcontentloaded' });
  await page.screenshot({ path: `screenshots/${Date.now()}_autohammer_loaded.png`, fullPage: true });
}

async function readAutohammerCounts(page, label) {
  const block = page.locator('.car-result-info__total:visible').first();
  await block.waitFor({ state: 'visible', timeout: 15000 });
  const counter = parseInt((await block.locator('.counter').first().textContent() || '0').replace(/[^\d]/g, ''), 10);
  const max = parseInt((await block.locator('.max').first().textContent() || '0').replace(/[^\d]/g, ''), 10);
  console.log(`📊 Autohammer (${label}) => counter=${counter}, max=${max}`);
  return { counter, max };
}

async function selectStandortAndWait(page, value, label) {
  const select = page.locator('select#branch-selector');
  await expect(select).toBeVisible({ timeout: 15000 });

  const visibleMax = page.locator('.car-result-info__total:visible .max').first();
  const beforeText = (await visibleMax.textContent().catch(() => ''))?.trim() || '';

  await select.selectOption(value);
  console.log(`✅ Selected Standort: ${label} (value=${value})`);

  await expect(visibleMax).not.toHaveText(beforeText, { timeout: 15000 }).catch(() => {});
  await page.waitForLoadState('networkidle').catch(() => {});
  await sleep(800);

  await page.screenshot({ path: `screenshots/${Date.now()}_autohammer_${label}.png`, fullPage: true });
  return readAutohammerCounts(page, label);
}

// ================== Playwright Test ==================
test('Radebeul & Grimma: mobile.de resultsMatched must equal autohammer branch max', async ({ page }) => {
  test.setTimeout(180000);

  // ===== Radebeul =====
  const radebeulMobile = await readMobileDe(page, 'https://home.mobile.de/AUTO-HAMMER#ses', 'Radebeul');
  await openAutohammer(page);
  const radebeulAuto = await selectStandortAndWait(page, '3866', 'Radebeul');

  totalChecks++;
  if (radebeulMobile.resultsMatched === radebeulAuto.max) {
    console.log(`✅ PASS (Radebeul): ${radebeulMobile.resultsMatched} matches ${radebeulAuto.max}`);
    passedChecks++;
    resultsLog.push(`✅ PASS (Radebeul): ${radebeulMobile.resultsMatched} matches ${radebeulAuto.max}`);
  } else {
    console.log(`❌ FAIL (Radebeul): ${radebeulMobile.resultsMatched} != ${radebeulAuto.max}`);
    failedChecks++;
    resultsLog.push(`❌ FAIL (Radebeul): ${radebeulMobile.resultsMatched} != ${radebeulAuto.max}`);
  }

  // ===== Grimma =====
  const grimmaMobile = await readMobileDe(page, 'https://home.mobile.de/AUTOHAMMERGMBH#ses', 'Grimma');
  await openAutohammer(page);
  const grimmaAuto = await selectStandortAndWait(page, '5749', 'Grimma');

  totalChecks++;
  if (grimmaMobile.resultsMatched === grimmaAuto.max) {
    console.log(`✅ PASS (Grimma): ${grimmaMobile.resultsMatched} matches ${grimmaAuto.max}`);
    passedChecks++;
    resultsLog.push(`✅ PASS (Grimma): ${grimmaMobile.resultsMatched} matches ${grimmaAuto.max}`);
  } else {
    console.log(`❌ FAIL (Grimma): ${grimmaMobile.resultsMatched} != ${grimmaAuto.max}`);
    failedChecks++;
    resultsLog.push(`❌ FAIL (Grimma): ${grimmaMobile.resultsMatched} != ${grimmaAuto.max}`);
  }

  // Send Slack notification after both checks
  await sendSlackReport();
});
