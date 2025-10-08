const { test, expect } = require('@playwright/test');
const axios = require('axios');
try { require('dotenv').config(); } catch (_) {}
// ================== Slack Config ==================
function parseWebhookCsv(value) { 
  return value ? value.split(/[\n,]/).map(v => v.trim()).filter(Boolean) : []; 
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
  const all = [
    ...parseWebhookCsv(process.env.SLACK_WEBHOOK_URLS), 
    ...collectNumberedEnv('SLACK_WEBHOOK_URL')
  ].map(u => u.trim()).filter(Boolean);
  const valid = Array.from(new Set(all)).filter(isLikelySlackWebhook);
  if (!valid.length) console.log('ℹ️ No Slack webhook URLs configured.');
  return valid;
}
const SLACK_WEBHOOK_URLS = loadSlackWebhookUrls();
const SLACK_APP_NAME = "Autohammer Result Test";
const SLACK_ICON = ":robot_face:";
// ================== Test Tracking ==================
let totalChecks = 0, passedChecks = 0, failedChecks = 0, resultsLog = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const getCurrentDateTime = () => new Date().toLocaleString('en-GB', { hour12: false });
// ================== Browser Functions ==================
async function acceptConsent(page) {
  const selectors = [
    'button.mde-consent-accept-btn',
    'button:has-text("Einverstanden")',
    'button.sc-bRKDuR.eIxcnl.mde-consent-accept-btn'
  ];
  for (const s of selectors) {
    try {
      const btn = page.locator(s).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click().catch(() => {});
        await sleep(400);
        console.log('✅ Consent accepted');
        return;
      }
    } catch (_) {}
  }
  console.log('ℹ️ Consent not found');
}
async function readMobileData(page, url, label) {
  console.log(`\n🔷 MOBILE DATA → ${label}`);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await acceptConsent(page);
    await page.waitForTimeout(800);
    const resultCountText = await page.locator('span.resultCount').first().textContent().catch(() => '0');
    const resultCount = parseInt(resultCountText.replace(/[^\d]/g, ''), 10) || 0;
    console.log(`📊 Mobile (${label}) => resultCount=${resultCount}`);
    return { resultCount };
  } catch (err) {
    console.error(`❌ Failed to read Mobile data for ${label}: ${err.message}`);
    failedChecks++;
    resultsLog.push(`❌ *${label}* - Failed to fetch Mobile data: ${err.message}`);
    return { resultCount: 0 };
  }
}
async function openAutohammer(page) { 
  try {
    await page.goto('https://autohammer.de/neuwagen-vorfuehrer-gebrauchtwagen', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(800); 
  } catch (err) {
    console.error(`❌ Failed to open Autohammer main page: ${err.message}`);
  }
}
async function readAutohammerCounts(page, label) {
  try {
    const block = page.locator('.car-result-info__total:visible').first();
    await block.waitFor({ state: 'visible', timeout: 15000 });
    const maxText = await block.locator('.max').first().textContent().catch(() => '0');
    const max = parseInt(maxText.replace(/[^\d]/g, ''), 10) || 0;
    console.log(`📊 Autohammer (${label}) => max=${max}`);
    return { max };
  } catch (err) {
    console.error(`❌ Failed to read Autohammer counts for ${label}: ${err.message}`);
    failedChecks++;
    resultsLog.push(`❌ *${label}* - Failed to fetch Autohammer data: ${err.message}`);
    return { max: 0 };
  }
}
async function selectBranchAndWait(page, value, label) {
  try {
    const select = page.locator('select#branch-selector');
    await expect(select).toBeVisible({ timeout: 15000 });
    const visibleMax = page.locator('.car-result-info__total:visible .max').first();
    const beforeText = (await visibleMax.textContent().catch(() => '')).trim() || '';
    await select.selectOption(value);
    console.log(`✅ Branch Selected: ${label} (${value})`);
    await expect(visibleMax).not.toHaveText(beforeText, { timeout: 15000 }).catch(() => {});
    await sleep(800);
    return await readAutohammerCounts(page, label);
  } catch (err) {
    console.error(`❌ Failed to select branch ${label}: ${err.message}`);
    failedChecks++;
    resultsLog.push(`❌ *${label}* - Failed to select branch: ${err.message}`);
    return { max: 0 };
  }
}
// ================== Slack Reporting ==================
async function sendSlackReport() {
  const dateTime = getCurrentDateTime();
  const divider = "━━━━━━━━━━━━━━━━━━━━━━━━━━━";
  const statusEmoji = failedChecks > 0 ? "❌" : "✅";
  const summaryText = failedChecks > 0 
    ? "⚠️ Some branches have mismatched counts or errors. Check details below." 
    : "✅ All branch counts matched perfectly!";
  const formattedResults = resultsLog.map(r => `> ${r}`).join("\n\n");
  const message = 
`${divider}
*${statusEmoji} Autohammer – Data Comparison Report*
${divider}
🕓 *Generated:* ${dateTime}
📊 *Total Checks:* ${totalChecks}
✅ *Passed:* ${passedChecks}
❌ *Failed:* ${failedChecks}
${divider}
*Branch Results:*
${formattedResults}
${divider}
${summaryText}
${divider}`;
  const payload = { 
    username: SLACK_APP_NAME, 
    icon_emoji: SLACK_ICON, 
    text: message, 
    unfurl_links: false, 
    unfurl_media: false, 
    link_names: false 
  };
  for (const url of SLACK_WEBHOOK_URLS) {
    try { 
      await axios.post(url, payload, { timeout: 10000 }); 
      console.log(`✅ Slack notification sent.`); 
    } catch (err) { 
      console.error(`❌ Failed to send Slack message: ${err.message}`); 
    }
  }
}
// ================== Playwright Test ==================
test('Compare Mobile API counts vs Autohammer branch max', async ({ page }) => {
  test.setTimeout(180000);
  const branches = [
    { label: 'Radebeul', mobileUrl: 'https://home.mobile.de/AUTO-HAMMER#ses', branchValue: '3866' },
    { label: 'Grimma', mobileUrl: 'https://home.mobile.de/AUTOHAMMERGMBH#ses', branchValue: '5749' }
  ];
  for (const b of branches) {
    totalChecks++;
    const mobileData = await readMobileData(page, b.mobileUrl, b.label);
    await openAutohammer(page);
    const autoData = await selectBranchAndWait(page, b.branchValue, b.label);
    if (mobileData.resultCount === autoData.max) {
      passedChecks++;
      resultsLog.push(`✅ *${b.label}*\n• API count: ${mobileData.resultCount}\n• Website count: ${autoData.max}\n• Status: Matched ✅`);
    } else {
      failedChecks++;
      const diff = Math.abs(autoData.max - mobileData.resultCount);
      resultsLog.push(`❌ *${b.label}*\n• API count: ${mobileData.resultCount}\n• Website count: ${autoData.max}\n• Difference: ${diff} cars\n• Status: Mismatch ❌`);
    }
  }
  await sendSlackReport();
});