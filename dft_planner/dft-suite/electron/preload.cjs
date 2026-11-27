const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("dft", {
  design: {
    open: (opts) => ipcRenderer.invoke("dft:design:open", opts),
    close: () => ipcRenderer.invoke("dft:design:close"),
    query: (method, params) => ipcRenderer.invoke("dft:design:query", { method, params }),
    dump: () => ipcRenderer.invoke("dft:design:dump"),
    readSource: (file) => ipcRenderer.invoke("dft:design:readSource", { file }),
    pickFilelist: () => ipcRenderer.invoke("dft:design:pickFilelist"),
    pickFolder: () => ipcRenderer.invoke("dft:design:pickFolder"),
    pickSdc: () => ipcRenderer.invoke("dft:design:pickSdc"),
  },
  genconn: {
    generateAll: (docJson) => ipcRenderer.invoke("dft:genconn:generateAll", { docJson }),
    inject: (docJson, vFiles) => ipcRenderer.invoke("dft:genconn:inject", { docJson, vFiles }),
  },
  ctrlgen: {
    gen: (spec) => ipcRenderer.invoke("dft:ctrlgen:gen", spec),
  },
  pad: {
    table: (filelist, lib) => ipcRenderer.invoke("dft:pad:table", { filelist, lib }),
    gen: (filelist, lib, cfg, level, aux) => ipcRenderer.invoke("dft:pad:gen", { filelist, lib, cfg, level, aux }),
    pickLib: () => ipcRenderer.invoke("dft:pad:pickLib"),
    readCfg: (filelist) => ipcRenderer.invoke("dft:pad:readCfg", { filelist }),
    writeCfg: (filelist, json) => ipcRenderer.invoke("dft:pad:writeCfg", { filelist, json }),
    exportText: (defaultName, text) => ipcRenderer.invoke("dft:pad:exportText", { defaultName, text }),
  },
  specgen: {
    gen: (docJson) => ipcRenderer.invoke("dft:specgen:gen", { docJson }),
    fragment: (fragJson) => ipcRenderer.invoke("dft:specgen:fragment", { fragJson }),
  },
  project: {
    pickNew: () => ipcRenderer.invoke("dft:project:pickNew"),
    pickOpen: () => ipcRenderer.invoke("dft:project:pickOpen"),
    read: (path) => ipcRenderer.invoke("dft:project:read", { path }),
    listDir: (path) => ipcRenderer.invoke("dft:project:listDir", { path }),
    write: (path, json) => ipcRenderer.invoke("dft:project:write", { path, json }),
    writeFiles: (baseDir, files) => ipcRenderer.invoke("dft:project:writeFiles", { baseDir, files }),
    recent: () => ipcRenderer.invoke("dft:project:recent"),
    addRecent: (path) => ipcRenderer.invoke("dft:project:addRecent", { path }),
  },
  app: {
    // Window-close save coordination (narrow surface; main drives the native dialog).
    onBeforeClose: (handler) => ipcRenderer.on("dft:app:before-close", () => { void handler(); }),
    onMenuAction: (handler) => ipcRenderer.on("dft:menu:action", (_e, action) => handler(action)),
    respondClose: (info) => ipcRenderer.invoke("dft:app:close-request", info),
    confirmClose: () => ipcRenderer.invoke("dft:app:close-confirm"),
    confirm: (message) => ipcRenderer.invoke("dft:app:confirm", { message }),
    launchOptions: () => ipcRenderer.invoke("dft:app:launchOptions"),
  },
});
