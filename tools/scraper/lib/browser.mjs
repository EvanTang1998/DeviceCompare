// 浏览器启动器
// 关键点：复用系统已安装的 Chrome，不下载 Playwright 自带的 Chromium（那个包约 300MB，且在国内网络经常超时）
// 所以我们只装 playwright-core（纯驱动，无浏览器），通过 channel 或 executablePath 指向本机 Chrome

import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

// 各平台常见 Chrome/Edge 路径，按顺序尝试
const LOCAL_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
];

const LAUNCH_ARGS = [
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-background-networking",
  "--disable-features=Translate,OptimizationHints"
];

/**
 * 启动浏览器。优先用 Playwright 的 channel 机制（能自动定位注册过的 Chrome），
 * 失败则回退到硬编码路径。
 * @param {object} [opts]
 * @param {string} [opts.channel]     指定通道（chrome / msedge）
 * @param {string} [opts.chromePath]  直接指定可执行文件路径，优先级最高
 * @param {boolean} [opts.headless]
 * @returns {Promise<import('playwright-core').Browser>}
 */
export async function launchBrowser({ channel, chromePath, headless = true } = {}) {
  const tried = [];

  if (chromePath) {
    try {
      return await chromium.launch({ executablePath: chromePath, headless, args: LAUNCH_ARGS });
    } catch (err) {
      tried.push(`chromePath=${chromePath} → ${firstLine(err.message)}`);
    }
  }

  // Playwright 的 channel 会跳过自带的 Chromium 检查，直接找系统浏览器，所以这里避开默认的 chromium 分支
  const channels = channel ? [channel] : ["chrome", "msedge"];
  for (const ch of channels) {
    try {
      return await chromium.launch({ channel: ch, headless, args: LAUNCH_ARGS });
    } catch (err) {
      tried.push(`channel=${ch} → ${firstLine(err.message)}`);
    }
  }

  for (const exe of LOCAL_CANDIDATES.filter(existsSync)) {
    try {
      return await chromium.launch({ executablePath: exe, headless, args: LAUNCH_ARGS });
    } catch (err) {
      tried.push(`executablePath=${exe} → ${firstLine(err.message)}`);
    }
  }

  throw new Error(
    `无法启动浏览器。已尝试：\n  ${tried.join("\n  ")}\n` +
      `请确认本机已安装 Google Chrome，或用 --channel / --chrome-path 指定。`
  );
}

/**
 * 建一个接近真人浏览的环境，减少被判定为爬虫的概率
 * @param {import('playwright-core').Browser} browser
 * @param {object} [opts]
 * @param {number} [opts.dpr] 设备像素比。设为 2 时苹果会返回 _large_2x 的高清图
 */
export async function newPage(browser, { width = 1440, height = 1000, dpr = 1 } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: dpr,
    locale: "zh-CN",
    timezoneId: "Asia/Shanghai",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
  });
  const page = await context.newPage();
  return { context, page };
}

/** 自动滚动到底，触发懒加载 */
export async function autoScroll(page, { step = 600, pause = 180 } = {}) {
  const total = await page.evaluate(() => document.body.scrollHeight).catch(() => 0);
  for (let y = 0; y < total + step; y += step) {
    await page.evaluate((top) => window.scrollTo(0, top), y).catch(() => {});
    await page.waitForTimeout(pause);
  }
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const firstLine = (s) => String(s).split("\n")[0].trim();
