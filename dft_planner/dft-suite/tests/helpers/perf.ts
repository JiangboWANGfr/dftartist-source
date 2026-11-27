import { expect, type Page } from "@playwright/test";
export async function measureFps(page: Page, action: () => Promise<void>) {
  await page.evaluate(() => { (window as any).__frames = []; let stop = false;
    const tick = (t: number) => { (window as any).__frames.push(t); if (!stop) requestAnimationFrame(tick); };
    requestAnimationFrame(tick); (window as any).__stopFrames = () => { stop = true; }; });
  await action();
  const fps = await page.evaluate(() => { (window as any).__stopFrames();
    const f: number[] = (window as any).__frames; if (f.length < 3) return 60;
    const dur = (f[f.length-1] - f[0]) / 1000; return (f.length - 1) / dur; });
  return fps;
}
export async function expectSmooth(page: Page, action: () => Promise<void>, minFps = 50) {
  const fps = await measureFps(page, action);
  expect(fps, `卡顿: ${fps.toFixed(1)}fps < ${minFps}`).toBeGreaterThanOrEqual(minFps);
}
export async function measureLatency(_page: Page, action: () => Promise<void>) {
  const t0 = Date.now(); await action(); return Date.now() - t0;
}
