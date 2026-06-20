const OpenAI = require('openai');

async function generatePlan(description, workspacePath, settings, workspaceMap, abortSignal) {
  const client = new OpenAI({
    apiKey: settings.apiKey,
    baseURL: settings.baseURL || 'https://api.openai.com/v1',
    dangerouslyAllowBrowser: false
  });
  
  const systemPrompt = `You are an autonomous AI Planner Agent. Given a workspace path, mission description, and complete workspace context map, respond with a JSON plan containing both a rich markdown implementation plan and a detailed checklist of steps to accomplish the task.

Your output must be a single JSON object with the following structure:
{
  "implementationPlan": "A rich Markdown document outlining the plan. Use the following headers: \\n# Goal\\n[Short description]\\n## Proposed Changes\\n[Files to modify/create/delete]\\n## Verification Plan\\n[Tests/Validation steps]",
  "steps": [
    {
      "id": "1",
      "description": "Verify/Read current workspace structure",
      "assignedAgent": "Developer Sub-Agent",
      "type": "read_folder",
      "params": { "path": "." }
    }
  ]
}

Step fields details:
- "id": number or string
- "description": description of the step action
- "assignedAgent": Name of the sub-agent (e.g. "Developer Sub-Agent", "Command Sub-Agent", "Tester Sub-Agent", "Folder Manager Sub-Agent", etc.)
- "type": One of:
  * 'file_read': read a file. params: { "path": "rel/path" }
  * 'file_write': write/create a file with full contents. params: { "path": "rel/path", "content": "contents..." }
  * 'terminal': execute a command. params: { "command": "cmd" }
  * 'ai_transform': refactor/edit a file directly. params: { "path": "rel/path", "instruction": "edit instructions" }
  * 'create_folder': create folder. params: { "path": "rel/path" }
  * 'delete_file': delete file or folder. params: { "path": "rel/path" }
  * 'read_folder': list folder contents. params: { "path": "rel/path" }
  * 'subagent': spawn a child sub-agent for complex/sub-tasks. params: { "task": "detailed instruction for sub-agent", "subAgentName": "Name of sub-agent" }

CRITICAL RULES:
1. ONLY respond with valid JSON.
2. Avoid printing raw code blocks in chat descriptions; all code edits must go through the steps.
3. For super large tasks, break them down and assign sub-tasks to 'subagent' steps to be run by child agents.`;

  const userPrompt = `Workspace Path: ${workspacePath}\n\nWorkspace Context Map:\n${workspaceMap || 'Not available.'}\n\nMission Description: ${description}`;

  const completion = await client.chat.completions.create({
    model: settings.modelName,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    max_tokens: settings.maxTokens || 8192,
    temperature: 0.2
  }, { signal: abortSignal });

  const planText = completion.choices[0]?.message?.content || '';
  
  let clean = planText.trim();
  if (clean.startsWith('```')) {
    clean = clean.replace(/^```(json)?\n?/, '');
    clean = clean.replace(/\n?```$/, '');
    clean = clean.trim();
  }
  
  const plan = JSON.parse(clean);
  if (!plan.steps || !Array.isArray(plan.steps)) {
    throw new Error("Plan is missing a 'steps' array.");
  }
  
  return {
    markdownPlan: plan.implementationPlan || `# Proposed Implementation Plan\n\nNo detailed description provided.\n\n## Goal\n${description}`,
    steps: plan.steps
  };
}

module.exports = {
  generatePlan
};
