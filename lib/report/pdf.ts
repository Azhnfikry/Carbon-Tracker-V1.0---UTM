import fs from "fs";
import puppeteer, { type Page } from "puppeteer-core";

const LOCAL_BROWSERS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "/usr/bin/chromium",
];

// Uses CHROME_PATH or a locally installed Chrome/Edge; on Vercel uses @sparticuz/chromium.
async function launchBrowser() {
  const localPath = process.env.CHROME_PATH || LOCAL_BROWSERS.find((candidate) => fs.existsSync(candidate));
  if (localPath && !process.env.VERCEL) {
    return puppeteer.launch({ executablePath: localPath, headless: true });
  }
  const chromium = (await import("@sparticuz/chromium")).default;
  return puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true });
}

// Smallest scale applied to a section to keep it on one A4 page (10pt body text prints at ~7.5pt).
const MIN_FIT_SCALE = 0.75;

// Each template section is one A4 page and the next section always starts a new page, so a
// section that runs slightly over A4 would leave an almost empty page behind it. Sections that
// overflow by a little are scaled down to fit; sections that are far too long still continue
// onto a following page at full size.
async function fitSectionsToA4(page: Page) {
  await page.emulateMediaType("print");
  return page.evaluate((minScale) => {
    const pageHeight = (297 * 96) / 25.4;
    const fixed = (el: Element) =>
      el.classList.contains("tab") ||
      el.classList.contains("runhead") ||
      el.classList.contains("runfoot") ||
      el.classList.contains("photoband");
    const layout: Array<{ section: string; result: string }> = [];

    for (const section of Array.from(document.querySelectorAll<HTMLElement>("section.page:not(.cover):not(.back)"))) {
      if (section.scrollHeight <= pageHeight + 1) continue;
      const name = section.querySelector(".tab span")?.textContent || "";

      // Wrap the flowing content so it can be scaled while the header, footer and tab stay put.
      const wrapper = document.createElement("div");
      for (const child of Array.from(section.children)) if (!fixed(child)) wrapper.appendChild(child);
      section.insertBefore(wrapper, section.querySelector(".runfoot"));

      // Older Chrome shrinks a zoomed element's width with its content, newer Chrome keeps it,
      // so the width is widened only when the zoomed wrapper no longer fills the column.
      const columnWidth = wrapper.getBoundingClientRect().width;
      const apply = (value: number) => {
        wrapper.style.zoom = String(value);
        wrapper.style.width = "100%";
        if (wrapper.getBoundingClientRect().width < columnWidth - 1) wrapper.style.width = `${100 / value}%`;
      };

      let scale = Math.max(minScale, pageHeight / section.scrollHeight);
      apply(scale);
      while (section.scrollHeight > pageHeight + 1 && scale > minScale) {
        scale = Math.max(minScale, scale - 0.01);
        apply(scale);
      }

      if (section.scrollHeight > pageHeight + 1) {
        apply(1);
        layout.push({ section: name, result: "too long; continues on next page" });
        continue;
      }
      section.style.height = "297mm";
      section.style.minHeight = "0";
      layout.push({ section: name, result: `scaled to ${Math.round(scale * 100)}%` });
    }
    return layout;
  }, MIN_FIT_SCALE);
}

// Renders self-contained report HTML to an A4 PDF.
export async function renderPdf(html: string): Promise<Uint8Array> {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load", timeout: 60000 });
    await page.evaluate(() => document.fonts.ready);
    const layout = await fitSectionsToA4(page);
    if (process.env.REPORT_LAYOUT_LOG) console.log("PDF layout:", JSON.stringify(layout));
    return await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
  } finally {
    await browser.close();
  }
}
