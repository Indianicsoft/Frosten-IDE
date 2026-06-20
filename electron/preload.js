const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // ─── File System ─────────────────────────────────────────────
  openFolder: () => ipcRenderer.invoke('fs:openFolder'),
  getTree: (folderPath) => ipcRenderer.invoke('fs:getTree', folderPath),
  readFile: (filePath) => ipcRenderer.invoke('fs:readFile', filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke('fs:writeFile', filePath, content),
  deleteFile: (filePath) => ipcRenderer.invoke('fs:deleteFile', filePath),
  listDir: (dirPath) => ipcRenderer.invoke('fs:listDir', dirPath),
  createFile: (filePath, content) => ipcRenderer.invoke('fs:createFile', filePath, content),
  createFolder: (folderPath) => ipcRenderer.invoke('fs:createFolder', folderPath),
  getWorkspaceContext: (folderPath, maxTokens) => ipcRenderer.invoke('fs:getWorkspaceContext', folderPath, maxTokens),

  // ─── Settings ────────────────────────────────────────────────
  saveSettings: (config) => ipcRenderer.invoke('settings:save', config),
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  testConnection: (config) => ipcRenderer.invoke('settings:testConnection', config),

  // ─── Terminal ────────────────────────────────────────────────
  createTerminal: (workspacePath) => ipcRenderer.invoke('terminal:create', workspacePath),
  writeTerminal: (id, data) => ipcRenderer.invoke('terminal:write', id, data),
  resizeTerminal: (id, cols, rows) => ipcRenderer.invoke('terminal:resize', id, cols, rows),
  killTerminal: (id) => ipcRenderer.invoke('terminal:kill', id),
  onTerminalData: (id, callback) => {
    const channel = `terminal:data:${id}`;
    const listener = (event, data) => callback(data);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },

  // ─── Agent ──────────────────────────────────────────────────
  runMission: (missionId, description, workspacePath, settings) =>
    ipcRenderer.invoke('agent:runMission', missionId, description, workspacePath, settings),
  cancelMission: (missionId) => ipcRenderer.invoke('agent:cancelMission', missionId),
  approvePlan: (missionId, approved) => ipcRenderer.invoke('agent:approvePlan', missionId, approved),
  getArtifacts: (workspacePath) => ipcRenderer.invoke('db:getArtifacts', workspacePath),
  onAgentEvent: (missionId, callback) => {
    const channel = `agent:event:${missionId}`;
    const listener = (event, eventData) => callback(eventData);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },

  // ─── AI Chat (via main process to avoid CORS) ────────────────
  streamChat: (settings, messages, streamId) =>
    ipcRenderer.invoke('ai:streamChat', settings, messages, streamId),
  onChatStreamChunk: (streamId, callback) => {
    const channel = `ai:streamChunk:${streamId}`;
    const listener = (event, chunk) => callback(chunk);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  onChatStreamEnd: (streamId, callback) => {
    const channel = `ai:streamEnd:${streamId}`;
    const listener = () => callback();
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  onChatStreamError: (streamId, callback) => {
    const channel = `ai:streamError:${streamId}`;
    const listener = (event, err) => callback(err);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },

  // ─── AI File Editing (direct file writes via main process) ───
  editFile: (settings, filePath, instruction, currentContent, workspacePath) =>
    ipcRenderer.invoke('ai:editFile', settings, filePath, instruction, currentContent, workspacePath),

  // ─── AI Code Transform (returns code, no file write) ─────────
  transformCode: (settings, code, instruction, language) =>
    ipcRenderer.invoke('ai:transformCode', settings, code, instruction, language),
});
