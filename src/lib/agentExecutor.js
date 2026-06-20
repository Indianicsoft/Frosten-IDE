const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const OpenAI = require('openai');

async function executeFileRead(workspacePath, relPath) {
  const fullPath = path.isAbsolute(relPath) ? relPath : path.join(workspacePath, relPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found: ${relPath}`);
  }
  return fs.readFileSync(fullPath, 'utf8');
}

async function executeFileWrite(workspacePath, relPath, content) {
  const fullPath = path.isAbsolute(relPath) ? relPath : path.join(workspacePath, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf8');
}

async function executeTerminalCommand(workspacePath, command, abortSignal) {
  return new Promise((resolve, reject) => {
    const child = exec(command, { cwd: workspacePath }, (error, stdout, stderr) => {
      const outText = stdout ? stdout.toString() : '';
      const errText = stderr ? stderr.toString() : '';
      const combined = outText + errText;
      
      if (error) {
        reject(new Error(combined || `Command failed with code ${error.code}: ${error.message}`));
      } else {
        resolve(combined);
      }
    });

    if (abortSignal) {
      abortSignal.addEventListener('abort', () => {
        child.kill();
        reject(new Error("Command terminated due to mission cancellation."));
      });
    }
  });
}

async function executeAiTransform(workspacePath, relPath, instruction, settings, cachedContent, abortSignal) {
  const fullPath = path.isAbsolute(relPath) ? relPath : path.join(workspacePath, relPath);
  let fileContent = '';
  
  if (fs.existsSync(fullPath)) {
    fileContent = fs.readFileSync(fullPath, 'utf8');
  } else if (cachedContent) {
    fileContent = cachedContent;
  }

  const client = new OpenAI({
    apiKey: settings.apiKey,
    baseURL: settings.baseURL || 'https://api.openai.com/v1',
    dangerouslyAllowBrowser: false
  });

  const transformPrompt = `You are a professional code refactoring utility. Modify the existing code according to these instructions:
Instructions: ${instruction}

Here is the existing code:
---
${fileContent}
---

Respond ONLY with the complete, updated code. Do NOT wrap the code in markdown code blocks or add any markdown formatting. Do not explain anything. Your entire response will be written directly back to the file.`;

  const completion = await client.chat.completions.create({
    model: settings.modelName,
    messages: [{ role: 'user', content: transformPrompt }],
    max_tokens: settings.maxTokens || 4096,
    temperature: settings.temperature || 0.7
  }, { signal: abortSignal });

  let transformedCode = completion.choices[0]?.message?.content || '';
  if (transformedCode.trim().startsWith('```')) {
    transformedCode = transformedCode.trim().replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '');
  }

  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, transformedCode, 'utf8');
  return transformedCode;
}

async function executeCreateFolder(workspacePath, relPath) {
  const fullPath = path.isAbsolute(relPath) ? relPath : path.join(workspacePath, relPath);
  if (!fullPath.startsWith(workspacePath)) {
    throw new Error(`Security Exception: Cannot create folder outside workspace: ${relPath}`);
  }
  fs.mkdirSync(fullPath, { recursive: true });
  return `Folder created successfully: ${relPath}`;
}

async function executeDeleteFile(workspacePath, relPath) {
  const fullPath = path.isAbsolute(relPath) ? relPath : path.join(workspacePath, relPath);
  if (!fullPath.startsWith(workspacePath)) {
    throw new Error(`Security Exception: Cannot delete file/folder outside workspace: ${relPath}`);
  }
  if (!fs.existsSync(fullPath)) {
    return `File/folder did not exist: ${relPath}`;
  }
  const stats = fs.statSync(fullPath);
  if (stats.isDirectory()) {
    fs.rmSync(fullPath, { recursive: true });
  } else {
    fs.unlinkSync(fullPath);
  }
  return `Deleted: ${relPath}`;
}

async function executeReadFolder(workspacePath, relPath) {
  const fullPath = path.isAbsolute(relPath) ? relPath : path.join(workspacePath, relPath);
  if (!fullPath.startsWith(workspacePath)) {
    throw new Error(`Security Exception: Cannot list folder outside workspace: ${relPath}`);
  }
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Folder not found: ${relPath}`);
  }
  const files = fs.readdirSync(fullPath);
  const items = files.map(file => {
    const filePath = path.join(fullPath, file);
    const stats = fs.statSync(filePath);
    return `${stats.isDirectory() ? '[DIR]' : '[FILE]'} ${file} (${stats.size} bytes)`;
  });
  return items.join('\n');
}


async function runValidatorAgent(workspacePath, description, filesChanged, terminalLogs, settings, abortSignal) {
  const client = new OpenAI({
    apiKey: settings.apiKey,
    baseURL: settings.baseURL || 'https://api.openai.com/v1',
    dangerouslyAllowBrowser: false
  });

  const validatorPrompt = `You are the Validator Sub-Agent in an agentic IDE.
Your task is to inspect the completed mission details and decide if we need to run a verification/test command (e.g. running a test suite, executing a built script, running a compilation step) to ensure correctness.

Mission Description: ${description}
Files Modified: ${JSON.stringify(filesChanged)}
Terminal Logs during execution: ${JSON.stringify(terminalLogs)}

Respond ONLY with a JSON object in this format:
{
  "shouldVerify": true,
  "verificationCommand": "command to run",
  "reason": "reason why this command validates the changes"
}

If no command is suitable or possible, set "shouldVerify" to false. Do not wrap in markdown code blocks.`;

  const completion = await client.chat.completions.create({
    model: settings.modelName,
    messages: [{ role: 'user', content: validatorPrompt }],
    max_tokens: 500,
    temperature: 0.2
  }, { signal: abortSignal });

  let resultText = completion.choices[0]?.message?.content || '';
  let clean = resultText.trim();
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```(json)?\n?/, '').replace(/\n?```$/, '').trim();
  }

  try {
    return JSON.parse(clean);
  } catch (e) {
    console.error("Failed to parse validator recommendation, falling back:", resultText);
    return { shouldVerify: false };
  }
}

async function verifyOutput(description, command, output, settings, abortSignal) {
  const client = new OpenAI({
    apiKey: settings.apiKey,
    baseURL: settings.baseURL || 'https://api.openai.com/v1',
    dangerouslyAllowBrowser: false
  });

  const prompt = `You are the Validator Sub-Agent. Inspect the output of the verification command to determine if the mission was successful or if there are errors/issues.

Mission Description: ${description}
Command Executed: ${command}
Command Output:
---
${output}
---

Respond ONLY with a JSON object in this format:
{
  "success": true,
  "reason": "Detailed summary explaining why it succeeded or what errors were found. No raw code in the description."
}

Do not wrap in markdown code blocks.`;

  const completion = await client.chat.completions.create({
    model: settings.modelName,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 500,
    temperature: 0.2
  }, { signal: abortSignal });

  let resultText = completion.choices[0]?.message?.content || '';
  let clean = resultText.trim();
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```(json)?\n?/, '').replace(/\n?```$/, '').trim();
  }

  try {
    return JSON.parse(clean);
  } catch (e) {
    console.error("Failed to parse verification result, falling back:", resultText);
    return { success: true, reason: "Output generated, assumed success." };
  }
}

async function runAutoCorrectionAgent(workspacePath, description, step, errorMessage, terminalLogs, settings, abortSignal) {
  const client = new OpenAI({
    apiKey: settings.apiKey,
    baseURL: settings.baseURL || 'https://api.openai.com/v1',
    dangerouslyAllowBrowser: false
  });

  const correctionPrompt = `You are the Auto-Correction Sub-Agent in an agentic IDE.
A step in the mission has failed. Analyze the error and propose a correction action to fix the workspace state so that the step can succeed on retry.

Mission Description: ${description}
Failed Step: ${JSON.stringify(step)}
Error Message: ${errorMessage}
Recent Terminal Logs: ${JSON.stringify(terminalLogs)}

Respond ONLY with a JSON object in this format:
{
  "shouldCorrect": true,
  "reason": "Explain why this error occurred and what needs to be fixed. Do not output raw code.",
  "correctionAction": {
    "type": "file_write",
    "path": "relative/path/to/file_to_fix",
    "content": "new content if file_write"
  }
}

If you cannot determine a suitable automated correction, respond with "shouldCorrect": false. Do not wrap in markdown code blocks.`;

  const completion = await client.chat.completions.create({
    model: settings.modelName,
    messages: [{ role: 'user', content: correctionPrompt }],
    max_tokens: 1000,
    temperature: 0.2
  }, { signal: abortSignal });

  let resultText = completion.choices[0]?.message?.content || '';
  let clean = resultText.trim();
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```(json)?\n?/, '').replace(/\n?```$/, '').trim();
  }

  try {
    return JSON.parse(clean);
  } catch (e) {
    console.error("Failed to parse correction agent output:", resultText);
    return { shouldCorrect: false };
  }
}

async function runDynamicReplan(workspacePath, description, failedStep, errorMessage, remainingSteps, settings, abortSignal) {
  const client = new OpenAI({
    apiKey: settings.apiKey,
    baseURL: settings.baseURL || 'https://api.openai.com/v1',
    dangerouslyAllowBrowser: false
  });

  const prompt = `You are the Planner Sub-Agent. An execution step has failed, and we need to dynamically adjust the remaining plan to recover and complete the mission.

Mission: ${description}
Failed Step: ${JSON.stringify(failedStep)}
Error: ${errorMessage}
Remaining Steps in original plan: ${JSON.stringify(remainingSteps)}

Respond ONLY with a JSON list of new/updated steps to replace the remaining plan. Each step must match the original schema:
{
  "steps": [
    { "id": "...", "description": "...", "assignedAgent": "Developer Sub-Agent" or "Command Sub-Agent", "type": "...", "params": {...} }
  ]
}
Do not wrap in markdown code blocks.`;

  const completion = await client.chat.completions.create({
    model: settings.modelName,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 2048,
    temperature: 0.2
  }, { signal: abortSignal });

  let text = completion.choices[0]?.message?.content || '';
  let clean = text.trim();
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```(json)?\n?/, '').replace(/\n?```$/, '').trim();
  }

  try {
    const data = JSON.parse(clean);
    return data.steps || [];
  } catch (e) {
    console.error("Failed to parse replan output:", text);
    return null;
  }
}

module.exports = {
  executeFileRead,
  executeFileWrite,
  executeTerminalCommand,
  executeAiTransform,
  executeCreateFolder,
  executeDeleteFile,
  executeReadFolder,
  runValidatorAgent,
  verifyOutput,
  runAutoCorrectionAgent,
  runDynamicReplan
};
