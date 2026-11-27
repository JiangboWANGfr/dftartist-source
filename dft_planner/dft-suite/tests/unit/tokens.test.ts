import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../../src/theme/theme.css", import.meta.url), "utf8");

const SCALE_TOKENS = [
  "--sp-1", "--sp-2", "--sp-3", "--sp-4", "--sp-5", "--sp-6",
  "--r-sm", "--r-md", "--r-lg",
  "--fs-xs", "--fs-sm", "--fs-md", "--fs-lg",
  "--sh-1", "--sh-2", "--sh-3",
  "--h-topbar",
];

test("theme.css 定义了全部 scale token", () => {
  for (const t of SCALE_TOKENS) {
    assert.ok(css.includes(t + ":"), `缺少 token ${t}`);
  }
});

test("阴影 token 深浅两套都定义（出现次数 ≥2）", () => {
  for (const t of ["--sh-1", "--sh-2", "--sh-3"]) {
    const n = css.split(t + ":").length - 1;
    assert.ok(n >= 2, `${t} 应在深浅两套各定义一次，实际 ${n}`);
  }
});
