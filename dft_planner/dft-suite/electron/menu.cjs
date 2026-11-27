// 原生菜单模板：纯数据 + click→send(action)。抽出以便单测（不 require electron）。
// action 字符串与渲染层 src/shell/menuActions.ts 的 dispatch 表一一对应。
//
// 加速键（accelerator）只挂在「本菜单唯一且完整实现」的动作上——切工作区 ⌘1/2/3、
// 切主题 ⌘⇧L。文件/编辑类命令在 P1 只是占位（menuActions 仅切到 genconn，真实文件命令
// 待 P3 工程模型接入），且 ⌘S/⌘Z/⌘⇧Z 会与 genconn 画布已有的渲染层快捷键
// （src/genconn/Workspace.tsx：真实保存/撤销/重做）冲突：macOS 下原生菜单加速键会先吞掉
// 按键，导致 ⌘S 走占位 handler 而非真实保存（丢数据）。故这些项只做可点菜单项、不挂加速键，
// 键盘仍由 genconn 渲染层负责。
function buildMenuTemplate(send) {
  const item = (label, accelerator, action) => ({
    label, accelerator, click: () => send(action),
  });
  // 无加速键的可点菜单项（P1 占位 / 避免与渲染层快捷键冲突）。
  const nav = (label, action) => ({ label, click: () => send(action) });
  const isMac = process.platform === "darwin";
  return [
    ...(isMac ? [{ label: "dft_stark:planner", submenu: [{ role: "about" }, { type: "separator" }, { role: "quit" }] }] : []),
    {
      label: "File",
      submenu: [
        nav("New Project", "project-new"),
        nav("Open Project…", "project-open"),
        { type: "separator" },
        nav("New", "new"),
        nav("Open…", "open"),
        nav("Save", "save"),
        nav("Save As…", "save-as"),
      ],
    },
    {
      label: "Edit",
      submenu: [
        nav("Undo", "undo"),
        nav("Redo", "redo"),
        { type: "separator" },
        // Clipboard ROLES register the Ctrl+C/V/X/A accelerators app-wide — without them
        // text inputs could not copy/paste at all under WSLg ("无法复制").
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        item("Hierarchy", "CmdOrCtrl+1", "ws-hierarchy"),
        item("GenConnection", "CmdOrCtrl+2", "ws-genconn"),
        item("SpecGen", "CmdOrCtrl+3", "ws-specgen"),
        { type: "separator" },
        item("Toggle Theme", "CmdOrCtrl+Shift+L", "toggle-theme"),
      ],
    },
    { label: "Help", submenu: [{ role: "toggleDevTools" }] },
  ];
}

module.exports = { buildMenuTemplate };
