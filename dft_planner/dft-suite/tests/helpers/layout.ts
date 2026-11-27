import { expect, type Page } from "@playwright/test";
type Box = { x: number; y: number; width: number; height: number };
const overlap = (a: Box, b: Box) =>
  a.x < b.x + b.width - 1 && b.x < a.x + a.width - 1 &&
  a.y < b.y + b.height - 1 && b.y < a.y + a.height - 1;

export async function assertNoOverlap(page: Page, selectors: string[]) {
  const boxes: { sel: string; box: Box }[] = [];
  for (const sel of selectors) {
    const box = await page.locator(sel).first().boundingBox();
    expect(box, `selector not found / not visible: ${sel}`).not.toBeNull();
    boxes.push({ sel, box: box! });
  }
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++)
      expect(overlap(boxes[i].box, boxes[j].box),
        `穿模: ${boxes[i].sel} overlaps ${boxes[j].sel}`).toBe(false);
}

export async function assertNoOverflow(page: Page, selector: string) {
  const r = await page.locator(selector).first().evaluate((el: HTMLElement) => ({
    sw: el.scrollWidth, cw: el.clientWidth, sh: el.scrollHeight, ch: el.clientHeight }));
  expect(r.sw, `${selector} 横向溢出/穿模`).toBeLessThanOrEqual(r.cw + 1);
  expect(r.sh, `${selector} 纵向溢出/穿模`).toBeLessThanOrEqual(r.ch + 1);
}
