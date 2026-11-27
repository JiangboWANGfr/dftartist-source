# 打包程序命令行启动参数(--projectpath/--harden/--filelist)设计

- 日期：2026-07-21
- 状态：设计定稿，待实施
- 范围：打包后的 Linux AppImage(及 dev 模式)支持 `./dft-suite --projectpath <dir> --harden <name> [--filelist <file>]` 启动；`<projectpath>/<harden>` 作为工程目录(= .dftproj 所在目录 = 产物树根)，`--filelist` 传了自动开设计建工程，不传则用户在软件里 load filelist 后自动在该目录建工程。
- 关联：工程模型与产物目录见 `docs/specs/2026-07-12-generation-output-dir-design.md`(§1 树根、§8 pickNew)；打包流程见 `docs/PACKAGING.md`。

## 0. 背景与使用场景

dft-suite 会被外层脚本/EDA flow 按 harden 调起：外层知道 project path 和 harden name，希望 dft-suite 的所有产物(Arch/、Spec/、IP/ 等)直接落到 `<projectpath>/<harden>/` 下，不再让用户在 GUI 里手选输出目录。filelist 可由外层直接传入，也可以进软件后手动 load。

已确认的三个决策(与用户逐条确认)：

1. `<projectpath>/<harden>` **作为工程目录**：自动创建/打开该目录下的 `.dftproj`，复用现有保存逻辑。
2. 不传 `--filelist` 时：用户在软件里 load filelist 后**不再弹"选输出目录"**，直接在该目录建工程。
3. 目录下已有 `.dftproj` 且命令行 `--filelist` 与工程记录不一致时：**命令行优先**，覆盖工程的 filelist 并写回。

## 1. 参数与解析规则

```
dft-suite --projectpath <dir> --harden <name> [--filelist <file>]
```

- 同时支持 `--key value` 与 `--key=value` 两种写法。
- 解析方式：**扫描整个 argv 找已知 flag**，位置无关——天然忽略 electron/chromium 自身参数(如 e2e 传的 `--user-data-dir=...`)与打包/开发模式下 argv 前缀差异(AppImage: `argv[0]=exe`；dev: `electron main.cjs ...`)。未知参数一律忽略。
- `--projectpath` 与 `--harden` **必须成对**：只传其一 → stderr 打印 usage 并 `process.exit(2)`(脚本写错立刻暴露；GUI 双击无参数场景不受影响)。
- `--filelist` 可单独传(不带 projectpath/harden)：仅自动打开设计，不建工程。
- 相对路径按启动时 cwd `path.resolve` 为绝对路径(projectpath 与 filelist 都是)。
- `harden` 仅作为一段目录名拼接：`projectDir = resolve(projectpath)/harden`，不做额外校验。
- 三个 flag 都不传 → 行为与现在完全一致(launchOptions 为空)。

## 2. 主进程：electron/argv.cjs(新建) + main.cjs

**`electron/argv.cjs`** —— 纯函数，可单测：

```js
/** @param {string[]} argv
 *  @returns {{ projectDir:string|null, filelist:string|null } | { error:string }} */
function parseLaunchArgs(argv, cwd) { ... }
module.exports = { parseLaunchArgs, USAGE };
```

- 返回 `{ error }` 仅当 projectpath/harden 不成对；`USAGE` 为多行使用说明字符串。
- cwd 作参数传入(不内读 `process.cwd()`)，方便测试。

**`electron/main.cjs`** 启动段(app.whenReady 前)：

1. `const r = parseLaunchArgs(process.argv, process.cwd())`。
2. `r.error` → `process.stderr.write(USAGE)`，`app.quit()` + `process.exit(2)`。
3. 否则组装 `launchOptions = { projectDir, filelist, existingProj: null, warning: null }`：
   - `projectDir` 非空 → `fs.mkdir(projectDir, { recursive: true })`；失败 → `warning = "无法创建工程目录 <dir>: <err>"`，`projectDir` 置 null(退化为无参数模式)。
   - mkdir 成功 → 扫描该目录下 `*.dftproj`(字典序取第一个)，存入 `existingProj`(绝对路径)或 null。
   - `filelist` 非空 → `fs.access` 检查存在；不存在 → `warning`(追加)，`filelist` 置 null。
4. 新增 `ipcMain.handle("dft:app:launchOptions", () => launchOptions)`——幂等只读，renderer 启动时取一次。

## 3. preload + 类型

- `electron/preload.cjs` app 段加：`launchOptions: () => ipcRenderer.invoke("dft:app:launchOptions")`。
- `src/core-bridge/dft.d.ts` `app` 段加：

```ts
launchOptions(): Promise<{
  projectDir: string | null;   // <projectpath>/<harden>；未传/创建失败 = null
  filelist: string | null;     // 校验存在后的绝对路径；未传/不存在 = null
  existingProj: string | null; // projectDir 下已有 .dftproj 的绝对路径
  warning: string | null;      // 启动参数级警告(目录建不了/filelist 不存在)
}>;
```

## 4. 渲染层：src/store/project.ts

**重构**：从 `newProject` 中抽出不弹对话框的建工程函数(store 内部)：

```ts
/** 在 dir 下按 filelist 创建 .dftproj 并激活工程(无任何对话框)。 */
async function createProjectAt(dir: string, filelist: string): Promise<void>
```

- design = filelist basename 去扩展；projPath = `dir/<design>.planner.dftproj`；初值同现 `newProject`(genconnDoc = `Arch/<design>.arch` 等)；write + activate。
- 现 `newProject()` 的 pickNew 分支改为调它(行为不变)。

**新增 state/action**：

- `pendingLaunchDir: string | null` —— 启动参数给了工程目录但还没有 filelist 时的"待建工程目录"。
- `initFromLaunch(): Promise<void>` —— app 启动时调一次(非 Electron / 无 launchOptions → no-op)：
  1. `warning` 非空 → `window.alert(warning)`(继续，不阻断)。
  2. `existingProj` 非空 → 按 `openRecent(existingProj)` 同路径打开；若 `filelist` 非空且 ≠ 工程记录的 filelist → **命令行优先**：`project.filelist = CLI 值`、`project.top = ""`(旧 top 对新 filelist 不可信)、genconnDoc 等其余字段保留，写回 `.dftproj` 后再 activate。
  3. `existingProj` 为空、`projectDir` 与 `filelist` 都非空 → `createProjectAt(projectDir, filelist)`。
  4. `projectDir` 非空、`filelist` 为空 → `set({ pendingLaunchDir: projectDir })`，停在欢迎页。
  5. `projectDir` 为空、`filelist` 非空 → 仅 `useDesign.openDesign({ filelist })`(不建工程)。
- `openFilelist(filelist: string): Promise<void>` —— "load 一个 filelist"的统一入口：
  - `pendingLaunchDir` 非空 → `createProjectAt(pendingLaunchDir, filelist)` 后清空 `pendingLaunchDir`；
  - 否则 → `useDesign.openDesign({ filelist })`(现行为)。
- `newProject()`：`pendingLaunchDir` 非空时**跳过"选输出目录"对话框**——只弹 filelist 选择(`dft.design.pickFilelist`)，然后走 `createProjectAt(pendingLaunchDir, ...)`；否则走现 pickNew 双对话框。

**调用点**：`src/main.tsx` 在 `render` 后 `void useProject.getState().initFromLaunch()`。

## 5. UI 接线

- `WelcomePage.tsx` / `ProjectMenu.tsx` 的 `quickOpenDesign`：pick 到 filelist 后改调 `useProject.getState().openFilelist(fl)`(pendingLaunchDir 模式下自动建工程；平时行为不变)。
- `WelcomePage.tsx`：`pendingLaunchDir` 非空时在动作区下方加一行提示(如 `启动参数已指定工程目录：<dir>，load filelist 后自动建工程`，`data-wl="launch-dir"`)，让用户知道产物会落哪。

## 6. 错误处理汇总

| 情形 | 行为 |
| --- | --- |
| 只传 --projectpath 或只传 --harden | stderr usage + exit 2(不开窗) |
| projectDir 无法创建(权限等) | 启动后 alert 一次，按无参数模式继续 |
| --filelist 文件不存在 | 启动后 alert 一次，忽略该参数(仍进 pendingLaunchDir 模式) |
| CLI filelist 打不开设计(hdl 报错) | 走现有 openDesign 错误路径(状态栏/alert)，工程已建/已开不回滚 |
| 目录下多个 .dftproj | 字典序取第一个(与"打开工程"手选可覆盖) |

## 7. 测试

- **单元(TDD)**：`tests/unit/argv.test.ts` 测 `parseLaunchArgs`：成对校验(只传其一 → error)、`--k v` 与 `--k=v`、相对路径 resolve、单独 `--filelist`、无参数 → 全 null、混入 `--user-data-dir=x` 等未知参数不干扰。
- **e2e**(`tests/helpers/electron.ts` 的 `launchApp` 加可选 `extraArgs: string[]`)：
  1. 带 `--projectpath <tmp> --harden h1 --filelist <fixture>` 启动 → 断言 `<tmp>/h1/<design>.planner.dftproj` 已创建、工程激活(状态栏/store)。
  2. 带 `--projectpath <tmp> --harden h1`(无 filelist)启动 → 欢迎页显示 launch-dir 提示 → e2e 桩驱动 `openFilelist(fixture)` → 断言工程落在 `<tmp>/h1/`。
  3. 二次启动(目录已有 .dftproj) + 不同 `--filelist` → 断言 .dftproj 的 filelist 被 CLI 覆盖。
- 现有全量 unit/e2e 保持绿。

## 8. 主要触及文件

- 新建：`electron/argv.cjs`、`tests/unit/argv.test.ts`、e2e spec 一份。
- 修改：`electron/main.cjs`(启动解析 + launchOptions IPC)、`electron/preload.cjs`、`src/core-bridge/dft.d.ts`、`src/store/project.ts`(createProjectAt 抽取 + pendingLaunchDir + initFromLaunch + openFilelist)、`src/main.tsx`、`src/shell/WelcomePage.tsx`、`src/shell/ProjectMenu.tsx`、`tests/helpers/electron.ts`(extraArgs)。

## 9. 非目标

- 无 GUI 的 headless/批处理生成(传参后自动生成并退出)。
- `--top`、`--lib` 等更多参数(要了再加)。
- single-instance(二次启动复用已开窗口)处理。
- 发布用 Linux 二进制的构建/staging 流程(见 `docs/PACKAGING.md`；本次发布需先在 Linux 重编 dft-core 最新 master 再 stage，属发布操作不属本设计)。
