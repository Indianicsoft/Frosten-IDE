const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const pty = require('node-pty');
const OpenAI = require('openai');
const { runAgentMission, cancelAgentMission, approveAgentPlan } = require('./agent-runner');
const { getWorkspaceContextMap } = require('./workspaceContext');

let mainWindow;
const ptyProcesses = new Map();

// --- SECURE SETTINGS STORAGE ---
const ENCRYPTION_KEY = crypto.scryptSync('frosten-secret-salt-key', 'salt-string-for-hash', 32);
const IV_LENGTH = 16;

function encrypt(text) {
  if (!text) return '';
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
  if (!text) return '';
  try {
    const textParts = text.split(':');
    const iv = Buffer.from(textParts.shift(), 'hex');
    const encryptedText = Buffer.from(textParts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (e) {
    console.error('Settings decryption failed:', e);
    return '';
  }
}

function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings-v1.json');
}

function loadConfig() {
  const filePath = getSettingsPath();
  if (!fs.existsSync(filePath)) {
    return {
      providerName: 'OpenAI',
      baseURL: 'https://api.openai.com/v1',
      apiKey: '',
      modelName: 'gpt-4o-mini',
      maxTokens: 4096,
      contextSize: 100000,
      temperature: 0.7,
      systemPrompt: 'You are a helpful coding assistant. When asked to edit files, respond with ONLY the complete updated file content — no explanations, no markdown code fences.'
    };
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const config = JSON.parse(raw);
    if (config.apiKey) config.apiKey = decrypt(config.apiKey);
    return config;
  } catch (e) {
    console.error('Failed to parse settings file:', e);
    return {};
  }
}

function saveConfig(config) {
  try {
    const filePath = getSettingsPath();
    const configCopy = { ...config };
    if (configCopy.apiKey) configCopy.apiKey = encrypt(configCopy.apiKey);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(configCopy, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Failed to save settings file:', e);
    return false;
  }
}

// --- FILE SYSTEM TREE BUILDER ---
function buildFileTree(dirPath, rootPath = dirPath) {
  try {
    const stats = fs.statSync(dirPath);
    const name = path.basename(dirPath);
    const relPath = path.relative(rootPath, dirPath);

    if (stats.isDirectory()) {
      const IGNORE = new Set(['node_modules', '.git', '.frosten', 'dist', 'release', '.next', '__pycache__', '.cache']);
      if (IGNORE.has(name)) {
        return { name, isDirectory: true, path: relPath || '.', children: [] };
      }
      let children = [];
      try {
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
          try {
            const childTree = buildFileTree(path.join(dirPath, file), rootPath);
            if (childTree) children.push(childTree);
          } catch (childErr) {
            // Skip unreadable files
          }
        }
        children.sort((a, b) => {
          if (a.isDirectory && !b.isDirectory) return -1;
          if (!a.isDirectory && b.isDirectory) return 1;
          return a.name.localeCompare(b.name);
        });
      } catch (e) {
        console.error(`Error reading dir ${dirPath}:`, e.message);
      }
      return { name, isDirectory: true, path: relPath || '.', children };
    } else {
      return { name, isDirectory: false, path: relPath, size: stats.size };
    }
  } catch (err) {
    console.error(`Failed to access path ${dirPath}:`, err.message);
    return null;
  }
}

// --- ELECTRON WINDOW LIFECYCLE ---
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0D1117',
    frame: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      devTools: true
    }
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl || process.argv.includes('--dev')) {
    const url = devUrl || 'http://localhost:5173';
    console.log('Loading from dev server:', url);
    mainWindow.loadURL(url).catch(err => {
      console.error('Failed to load dev URL:', err);
    });
  } else {
    const indexPath = path.join(__dirname, '../dist/index.html');
    console.log('Loading from dist:', indexPath);
    mainWindow.loadFile(indexPath).catch(err => {
      console.error('Failed to load dist file:', err);
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    for (const [id, proc] of ptyProcesses.entries()) {
      try { proc.kill(); } catch (e) {}
    }
    ptyProcesses.clear();
  });
}

// --- IPC HANDLERS ---
function registerIpcHandlers() {

  // ─── File System ────────────────────────────────────────────
  ipcMain.handle('fs:openFolder', async () => {
    try {
      const targetWindow = BrowserWindow.getFocusedWindow() || mainWindow;
      const result = await dialog.showOpenDialog(targetWindow, {
        properties: ['openDirectory'],
        title: 'Open Workspace Folder'
      });
      if (result.canceled || result.filePaths.length === 0) return null;
      const folderPath = result.filePaths[0];
      const fileTree = buildFileTree(folderPath);
      return { folderPath, fileTree };
    } catch (err) {
      console.error('fs:openFolder error:', err);
      // Fallback without window reference
      try {
        const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
        if (result.canceled || result.filePaths.length === 0) return null;
        const folderPath = result.filePaths[0];
        return { folderPath, fileTree: buildFileTree(folderPath) };
      } catch (e) {
        console.error('Fallback openFolder failed:', e);
        return null;
      }
    }
  });

  ipcMain.handle('fs:getTree', async (event, folderPath) => {
    try {
      return buildFileTree(folderPath);
    } catch (err) {
      console.error('fs:getTree error:', err);
      throw err;
    }
  });

  ipcMain.handle('fs:readFile', async (event, filePath) => {
    try {
      return fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      console.error(`fs:readFile error for ${filePath}:`, err);
      throw err;
    }
  });

  ipcMain.handle('fs:writeFile', async (event, filePath, content) => {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content, 'utf8');
      return true;
    } catch (err) {
      console.error(`fs:writeFile error for ${filePath}:`, err);
      throw err;
    }
  });

  ipcMain.handle('fs:deleteFile', async (event, filePath) => {
    try {
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          fs.rmSync(filePath, { recursive: true });
        } else {
          fs.unlinkSync(filePath);
        }
      }
      return true;
    } catch (err) {
      console.error(`fs:deleteFile error for ${filePath}:`, err);
      throw err;
    }
  });

  ipcMain.handle('fs:listDir', async (event, dirPath) => {
    try {
      const files = fs.readdirSync(dirPath);
      return files.map(file => {
        const fullPath = path.join(dirPath, file);
        const stats = fs.statSync(fullPath);
        return { name: file, path: fullPath, isDirectory: stats.isDirectory(), size: stats.size };
      });
    } catch (err) {
      console.error(`fs:listDir error for ${dirPath}:`, err);
      throw err;
    }
  });

  ipcMain.handle('fs:createFile', async (event, filePath, content = '') => {
    try {
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, content, 'utf8');
      }
      return true;
    } catch (err) {
      console.error(`fs:createFile error for ${filePath}:`, err);
      throw err;
    }
  });

  ipcMain.handle('fs:createFolder', async (event, folderPath) => {
    try {
      fs.mkdirSync(folderPath, { recursive: true });
      return true;
    } catch (err) {
      console.error(`fs:createFolder error for ${folderPath}:`, err);
      throw err;
    }
  });

  ipcMain.handle('fs:getWorkspaceContext', async (event, folderPath, maxTokens) => {
    try {
      // rough character limit based on 4 characters per token
      const charLimit = (maxTokens || 100000) * 4;
      return getWorkspaceContextMap(folderPath, charLimit);
    } catch (err) {
      console.error('fs:getWorkspaceContext error:', err);
      throw err;
    }
  });

  // ─── Settings ────────────────────────────────────────────────
  ipcMain.handle('settings:load', async () => loadConfig());

  ipcMain.handle('settings:save', async (event, config) => saveConfig(config));

  ipcMain.handle('settings:testConnection', async (event, config) => {
    try {
      const client = new OpenAI({
        apiKey: config.apiKey,
        baseURL: config.baseURL || 'https://api.openai.com/v1',
        dangerouslyAllowBrowser: false
      });
      await client.chat.completions.create({
        model: config.modelName,
        messages: [{ role: 'user', content: 'Say "OK"' }],
        max_tokens: 5
      });
      return { success: true };
    } catch (err) {
      console.error('Test connection error:', err.message);
      return { success: false, error: err.message };
    }
  });

  // ─── Terminal (PTY) ─────────────────────────────────────────
  ipcMain.handle('terminal:create', async (event, workspacePath) => {
    const id = `term_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const shell = process.platform === 'win32' ? 'powershell.exe' : (process.env.SHELL || '/bin/bash');

    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: workspacePath || process.env.HOME || process.cwd(),
      env: { ...process.env, TERM: 'xterm-256color' }
    });

    ptyProcesses.set(id, ptyProcess);

    ptyProcess.onData((data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(`terminal:data:${id}`, data);
      }
    });

    ptyProcess.onExit(() => {
      ptyProcesses.delete(id);
    });

    return id;
  });

  ipcMain.handle('terminal:write', async (event, id, data) => {
    const proc = ptyProcesses.get(id);
    if (proc) { proc.write(data); return true; }
    return false;
  });

  ipcMain.handle('terminal:resize', async (event, id, cols, rows) => {
    const proc = ptyProcesses.get(id);
    if (proc) {
      try { proc.resize(cols, rows); return true; } catch (e) {}
    }
    return false;
  });

  ipcMain.handle('terminal:kill', async (event, id) => {
    const proc = ptyProcesses.get(id);
    if (proc) { try { proc.kill(); } catch (e) {} ptyProcesses.delete(id); return true; }
    return false;
  });

  // ─── Agent ──────────────────────────────────────────────────
  ipcMain.handle('agent:runMission', async (event, missionId, description, workspacePath, settings) => {
    runAgentMission(mainWindow, missionId, description, workspacePath, settings);
    return true;
  });

  ipcMain.handle('agent:cancelMission', async (event, missionId) => {
    return cancelAgentMission(missionId);
  });

  ipcMain.handle('agent:approvePlan', async (event, missionId, approved) => {
    return approveAgentPlan(missionId, approved);
  });

  // ─── SQLite Artifacts ────────────────────────────────────────
  ipcMain.handle('db:getArtifacts', async (event, workspacePath) => {
    const dbPath = path.join(workspacePath, '.frosten', 'artifacts.db');
    if (!fs.existsSync(dbPath)) return [];
    const Database = require('better-sqlite3');
    let db;
    try {
      db = new Database(dbPath);
      const rows = db.prepare('SELECT * FROM artifacts ORDER BY created_at DESC').all();
      return rows.map(row => ({
        id: row.id,
        missionId: row.mission_id,
        missionName: row.mission_name,
        status: row.status,
        stepsCompleted: JSON.parse(row.steps_completed || '[]'),
        filesChanged: JSON.parse(row.files_changed || '[]'),
        terminalOutputs: JSON.parse(row.terminal_outputs || '[]'),
        summary: row.summary,
        createdAt: row.created_at
      }));
    } catch (e) {
      console.error('Failed to query artifacts:', e);
      return [];
    } finally {
      if (db) db.close();
    }
  });

  // ─── AI Chat (streamed via main process to avoid CORS) ───────
  ipcMain.handle('ai:streamChat', async (event, settings, messages, streamId) => {
    try {
      const client = new OpenAI({
        apiKey: settings.apiKey,
        baseURL: settings.baseURL || 'https://api.openai.com/v1',
      });

      const stream = await client.chat.completions.create({
        model: settings.modelName,
        messages,
        max_tokens: settings.maxTokens || 4096,
        temperature: settings.temperature ?? 0.7,
        stream: true
      });

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content || '';
        if (delta && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send(`ai:streamChunk:${streamId}`, delta);
        }
      }
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(`ai:streamEnd:${streamId}`);
      }
    } catch (err) {
      console.error('AI Stream Error:', err);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(`ai:streamError:${streamId}`, err.message);
      }
    }
  });

  // ─── AI Direct File Edit (AI edits workspace files directly) ─
  ipcMain.handle('ai:editFile', async (event, settings, filePath, instruction, currentContent, workspacePath) => {
    try {
      const client = new OpenAI({
        apiKey: settings.apiKey,
        baseURL: settings.baseURL || 'https://api.openai.com/v1',
      });

      let fileContent = currentContent;
      if (!fileContent && fs.existsSync(filePath)) {
        fileContent = fs.readFileSync(filePath, 'utf8');
      }

      let workspaceMap = '';
      if (workspacePath) {
        try {
          const charLimit = (settings.contextSize || 100000) * 4;
          workspaceMap = getWorkspaceContextMap(workspacePath, charLimit);
        } catch (mapErr) {
          console.error('Failed to load workspace context in editFile:', mapErr);
        }
      }

      const systemMsg = `You are a professional code editor. Your ONLY job is to apply the given instruction to the provided code and return the COMPLETE updated file content. 

Workspace Context Map:
${workspaceMap || 'No context loaded.'}

CRITICAL RULES:
- Return ONLY the raw file content — no markdown, no code fences, no explanation
- Your entire response will be written directly to the file
- Preserve all code not related to the instruction
- If creating a new file, write complete production-ready code`;

      const userMsg = `Instruction: ${instruction}

${fileContent ? `Current file content:\n${fileContent}` : 'This is a new file.'}`;

      const completion = await client.chat.completions.create({
        model: settings.modelName,
        messages: [
          { role: 'system', content: systemMsg },
          { role: 'user', content: userMsg }
        ],
        max_tokens: settings.maxTokens || 4096,
        temperature: 0.2
      });

      let newContent = completion.choices[0]?.message?.content || '';
      // Strip accidental markdown code fences
      newContent = newContent.trim();
      if (newContent.startsWith('```')) {
        newContent = newContent.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
      }

      // Write directly to the file
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, newContent, 'utf8');

      return { success: true, newContent };
    } catch (err) {
      console.error('ai:editFile error:', err);
      return { success: false, error: err.message };
    }
  });

  // ─── AI Inline Code Transform (returns content without saving) ─
  ipcMain.handle('ai:transformCode', async (event, settings, code, instruction, language) => {
    try {
      const client = new OpenAI({
        apiKey: settings.apiKey,
        baseURL: settings.baseURL || 'https://api.openai.com/v1',
      });

      const completion = await client.chat.completions.create({
        model: settings.modelName,
        messages: [
          {
            role: 'system',
            content: `You are a code transformation engine. Apply the instruction to the ${language || 'code'} and return ONLY the transformed code with no markdown, no explanation, no code fences.`
          },
          {
            role: 'user',
            content: `Instruction: ${instruction}\n\nCode:\n${code}`
          }
        ],
        max_tokens: settings.maxTokens || 4096,
        temperature: 0.2
      });

      let result = completion.choices[0]?.message?.content || '';
      result = result.trim();
      if (result.startsWith('```')) {
        result = result.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
      }
      return { success: true, code: result };
    } catch (err) {
      console.error('ai:transformCode error:', err);
      return { success: false, error: err.message };
    }
  });
}

// --- BOOTSTRAP ---
app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
