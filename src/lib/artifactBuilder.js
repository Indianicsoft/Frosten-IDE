const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const OpenAI = require('openai');

function initDatabase(workspacePath) {
  const frostenDir = path.join(workspacePath, '.frosten');
  if (!fs.existsSync(frostenDir)) {
    fs.mkdirSync(frostenDir, { recursive: true });
  }

  const dbPath = path.join(frostenDir, 'artifacts.db');
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS artifacts (
      id TEXT PRIMARY KEY,
      mission_id TEXT,
      mission_name TEXT,
      status TEXT,
      steps_completed TEXT,
      files_changed TEXT,
      terminal_outputs TEXT,
      summary TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  return db;
}

async function generateSummary(description, filesChangedList, terminalLogs, settings, abortSignal) {
  const client = new OpenAI({
    apiKey: settings.apiKey,
    baseURL: settings.baseURL || 'https://api.openai.com/v1',
    dangerouslyAllowBrowser: false
  });

  const summaryPrompt = `You are an AI assistant summarizing the completion of a coding mission. 
Mission Description: ${description}
Files Changed: ${filesChangedList.join(', ')}
Terminal Command Outputs: ${JSON.stringify(terminalLogs)}

Provide a concise, professional markdown summary explaining what was accomplished, why, and if any verification checks were passed. Do not output anything other than the summary.`;

  const summaryCompletion = await client.chat.completions.create({
    model: settings.modelName,
    messages: [{ role: 'user', content: summaryPrompt }],
    max_tokens: 1024,
    temperature: 0.5
  }, { signal: abortSignal });

  return summaryCompletion.choices[0]?.message?.content || 'Mission completed successfully.';
}

function saveArtifact(workspacePath, artifact) {
  const db = initDatabase(workspacePath);
  try {
    const insert = db.prepare(`
      INSERT OR REPLACE INTO artifacts 
      (id, mission_id, mission_name, status, steps_completed, files_changed, terminal_outputs, summary)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insert.run(
      artifact.id,
      artifact.missionId,
      artifact.missionName,
      artifact.status,
      artifact.stepsCompleted,
      artifact.filesChanged,
      artifact.terminalOutputs,
      artifact.summary
    );
  } finally {
    db.close();
  }
}

module.exports = {
  initDatabase,
  generateSummary,
  saveArtifact
};
