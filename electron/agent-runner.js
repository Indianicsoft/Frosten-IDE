const { generatePlan } = require('../src/lib/agentPlanner');
const { 
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
} = require('../src/lib/agentExecutor');
const { generateSummary, saveArtifact } = require('../src/lib/artifactBuilder');

const activeMissions = new Map();
const pendingApprovals = new Map();

async function runAgentMission(mainWindow, missionId, description, workspacePath, settings) {
  const abortController = new AbortController();
  activeMissions.set(missionId, abortController);

  const emit = (type, data) => {
    if (mainWindow.isDestroyed()) return;
    mainWindow.webContents.send(`agent:event:${missionId}`, { type, data });
  };

  emit('log', `Starting Mission: "${description}"`);
  emit('log', `Workspace: ${workspacePath}`);

  let context = {};
  let filesChangedList = [];
  let terminalLogs = [];
  let steps = [];

  try {
    // --- STEP 1: PLANNING ---
    emit('status', 'Planning');
    emit('log', '[Main Agent] Fetching workspace context map...');
    const { getWorkspaceContextMap } = require('./workspaceContext');
    const workspaceMap = getWorkspaceContextMap(workspacePath, (settings.contextSize || 100000) * 4);
    emit('log', `[Main Agent] Workspace context map loaded. Generating step plan and implementation design...`);

    const planResult = await generatePlan(description, workspacePath, settings, workspaceMap, abortController.signal);
    steps = planResult.steps;
    emit('plan', { markdownPlan: planResult.markdownPlan, steps: steps });
    emit('log', `[Main Agent] Formulated checklist with ${steps.length} steps.`);

    // --- STEP 1.5: WAIT FOR USER APPROVAL ---
    emit('status', 'RequiresApproval');
    emit('log', `[System] Proposed plan generated. Waiting for user approval to proceed...`);

    const approved = await new Promise((resolve) => {
      pendingApprovals.set(missionId, resolve);
      // Abort signal listener
      const onAbort = () => {
        resolve(false);
      };
      abortController.signal.addEventListener('abort', onAbort);
    });

    pendingApprovals.delete(missionId);

    if (!approved) {
      throw new Error("Plan was rejected by the user.");
    }

    // --- STEP 2: EXECUTION ---
    emit('status', 'Executing');
    emit('log', '[Main Agent] Plan approved. Commencing execution phase.');

    for (let i = 0; i < steps.length; i++) {
      if (abortController.signal.aborted) {
        throw new Error("Mission cancelled by user.");
      }

      const step = steps[i];
      const subAgent = step.assignedAgent || (step.type === 'terminal' ? 'Command Sub-Agent' : 'Developer Sub-Agent');
      
      emit('step_start', { stepId: step.id });
      emit('log', `\n[Main Agent] Dispatching step ${i + 1}/${steps.length} to [${subAgent}]...`);
      emit('log', `[${subAgent}] Objective: ${step.description}`);

      try {
        switch (step.type) {
          case 'file_read': {
            const relPath = step.params.path;
            const content = await executeFileRead(workspacePath, relPath);
            context[relPath] = content;
            emit('log', `[${subAgent}] Read file contents of: ${relPath}`);
            break;
          }
          case 'file_write': {
            const relPath = step.params.path;
            const content = step.params.content;
            await executeFileWrite(workspacePath, relPath, content);
            if (!filesChangedList.includes(relPath)) {
              filesChangedList.push(relPath);
            }
            emit('log', `[${subAgent}] Created/wrote workspace file: ${relPath}`);
            break;
          }
          case 'terminal': {
            const command = step.params.command;
            emit('log', `[${subAgent}] Executing terminal command: "${command}"`);
            
            const output = await executeTerminalCommand(workspacePath, command, abortController.signal);
            terminalLogs.push({ command, output });
            if (output) {
              emit('log', `[${subAgent} Console Output]:\n${output.trim()}`);
            }
            break;
          }
          case 'ai_transform': {
            const relPath = step.params.path;
            const instruction = step.params.instruction;
            emit('log', `[${subAgent}] Editing workspace file: ${relPath}`);
            
            const transformed = await executeAiTransform(
              workspacePath, 
              relPath, 
              instruction, 
              settings, 
              context[relPath], 
              abortController.signal
            );
            
            context[relPath] = transformed;
            if (!filesChangedList.includes(relPath)) {
              filesChangedList.push(relPath);
            }
            emit('log', `[${subAgent}] Applied modifications directly to: ${relPath}`);
            break;
          }
          case 'create_folder': {
            const relPath = step.params.path;
            const msg = await executeCreateFolder(workspacePath, relPath);
            emit('log', `[${subAgent}] ${msg}`);
            break;
          }
          case 'delete_file': {
            const relPath = step.params.path;
            const msg = await executeDeleteFile(workspacePath, relPath);
            emit('log', `[${subAgent}] ${msg}`);
            break;
          }
          case 'read_folder': {
            const relPath = step.params.path;
            const details = await executeReadFolder(workspacePath, relPath);
            emit('log', `[${subAgent}] Folder ${relPath} details:\n${details}`);
            break;
          }
          case 'subagent': {
            const task = step.params.task;
            const subAgentName = step.params.subAgentName || 'Sub-Agent';
            emit('log', `[Main Agent] Spawning sub-agent [${subAgentName}] for task: "${task}"`);
            
            const subMissionId = `sub_${missionId}_${Math.random().toString(36).substring(2, 6)}`;
            
            const subAbortController = new AbortController();
            const parentAbortListener = () => subAbortController.abort();
            abortController.signal.addEventListener('abort', parentAbortListener);
            
            try {
              await runSubAgentMission(
                mainWindow,
                missionId,
                subMissionId,
                subAgentName,
                task,
                workspacePath,
                settings,
                subAbortController.signal
              );
            } finally {
              abortController.signal.removeEventListener('abort', parentAbortListener);
            }
            break;
          }
          default:
            throw new Error(`Unknown step type: ${step.type}`);
        }
        emit('step_done', { stepId: step.id });
      } catch (err) {
        emit('log', `\n[System] Step execution failed: "${err.message}"`);
        
        let healed = false;
        if (settings.apiKey && (step.type === 'terminal' || step.type === 'ai_transform')) {
          emit('log', `[Main Agent] Invoking [Auto-Correction Sub-Agent] to analyze error & recover...`);
          try {
            const recovery = await runAutoCorrectionAgent(
              workspacePath,
              description,
              step,
              err.message,
              terminalLogs,
              settings,
              abortController.signal
            );
            
            if (recovery.shouldCorrect && recovery.correctionAction) {
              emit('log', `[Auto-Correction Sub-Agent] Analysis: ${recovery.reason}`);
              emit('log', `[Auto-Correction Sub-Agent] Proposed fix on file: ${recovery.correctionAction.path}`);
              
              await executeFileWrite(workspacePath, recovery.correctionAction.path, recovery.correctionAction.content);
              if (!filesChangedList.includes(recovery.correctionAction.path)) {
                filesChangedList.push(recovery.correctionAction.path);
              }
              emit('log', `[Auto-Correction Sub-Agent] Self-healing fix written successfully.`);
              
              // Retry original step execution
              emit('log', `[Main Agent] Retrying original step execution...`);
              if (step.type === 'terminal') {
                const command = step.params.command;
                const output = await executeTerminalCommand(workspacePath, command, abortController.signal);
                terminalLogs.push({ command, output });
                if (output) {
                  emit('log', `[Command Sub-Agent Output (Retry Success)]:\n${output.trim()}`);
                }
              } else if (step.type === 'ai_transform') {
                const relPath = step.params.path;
                const instruction = step.params.instruction;
                const transformed = await executeAiTransform(
                  workspacePath, 
                  relPath, 
                  instruction, 
                  settings, 
                  null, 
                  abortController.signal
                );
                context[relPath] = transformed;
                if (!filesChangedList.includes(relPath)) {
                  filesChangedList.push(relPath);
                }
                emit('log', `[Developer Sub-Agent (Retry Success)] Applied transformation to: ${relPath}`);
              }
              healed = true;
              emit('step_done', { stepId: step.id });
              emit('log', `[Auto-Correction Sub-Agent] Recovery SUCCESSFUL! Mission is back on track.`);
            } else {
              emit('log', `[Auto-Correction Sub-Agent] No automated correction could be determined.`);
            }
          } catch (healErr) {
            emit('log', `[Auto-Correction Sub-Agent] Healing attempt failed: ${healErr.message}`);
          }
        }
        
        if (!healed) {
          emit('log', `\n[Main Agent] Initiating Dynamic Re-Planning Loop...`);
          try {
            const remaining = steps.slice(i + 1);
            const revisedSteps = await runDynamicReplan(
              workspacePath,
              description,
              step,
              err.message,
              remaining,
              settings,
              abortController.signal
            );
            
            if (revisedSteps && revisedSteps.length > 0) {
              emit('log', `[Main Agent] Dynamic Re-planning successful! Replaced ${remaining.length} remaining steps with ${revisedSteps.length} revised steps.`);
              steps.splice(i + 1, steps.length - (i + 1), ...revisedSteps);
              emit('plan', steps);
              emit('log', `[Main Agent] Updated checklist generated. Resuming execution with new steps.`);
              continue;
            } else {
              emit('log', `[Main Agent] No suitable revised steps could be generated by the Re-planner.`);
            }
          } catch (replanErr) {
            emit('log', `[Main Agent] Dynamic Re-planning failed: ${replanErr.message}`);
          }

          emit('step_failed', { stepId: step.id, error: err.message });
          throw err;
        }
      }
    }

    // --- STEP 3: VERIFY & ARCHIVE ---
    emit('status', 'Verifying');
    emit('log', '\n[Main Agent] Execution finished. Initiating validation loop...');
    emit('log', '[Main Agent] Invoking [Validator Sub-Agent] to run correctness validation checks...');

    const valResult = await runValidatorAgent(
      workspacePath,
      description,
      filesChangedList,
      terminalLogs,
      settings,
      abortController.signal
    );

    if (valResult.shouldVerify) {
      emit('log', `[Validator Sub-Agent] Recommended verification step: "${valResult.verificationCommand}"`);
      emit('log', `[Validator Sub-Agent] Verification target: ${valResult.reason}`);
      emit('log', `[Validator Sub-Agent] Running validation command in workspace...`);

      try {
        const valOutput = await executeTerminalCommand(workspacePath, valResult.verificationCommand, abortController.signal);
        emit('log', `[Validator Sub-Agent Console Output]:\n${valOutput.trim()}`);
        
        const review = await verifyOutput(description, valResult.verificationCommand, valOutput, settings, abortController.signal);
        emit('log', `[Validator Sub-Agent] Analysis Result: ${review.success ? 'PASSED' : 'FAILED'}`);
        emit('log', `[Validator Sub-Agent] Report: ${review.reason}`);
        
        if (!review.success) {
          throw new Error(`Validation check failed: ${review.reason}`);
        }
      } catch (err) {
        emit('log', `[Validator Sub-Agent] Verification failed: ${err.message}`);
        throw err;
      }
    } else {
      emit('log', '[Validator Sub-Agent] No automated tests or verification commands suitable for this task. Validation assumed passed.');
    }

    emit('log', '\n[Main Agent] Generating mission completion summary...');
    const summary = await generateSummary(
      description,
      filesChangedList,
      terminalLogs,
      settings,
      abortController.signal
    );

    const artifact = {
      id: `${missionId}_art`,
      missionId,
      missionName: description,
      status: 'Done',
      stepsCompleted: JSON.stringify(steps.map(s => s.description)),
      filesChanged: JSON.stringify(filesChangedList),
      terminalOutputs: JSON.stringify(terminalLogs),
      summary
    };

    saveArtifact(workspacePath, artifact);
    
    emit('artifact', artifact);
    emit('log', '[Main Agent] Mission completed successfully. Artifact committed to SQLite.');
    emit('status', 'Done');

  } catch (error) {
    console.error("Agent Mission Error:", error);
    if (error.message === "Plan was rejected by the user.") {
      emit('log', `\n[System] Mission plan was rejected. Stopping agent runner.`);
      emit('status', 'Rejected');

      try {
        const artifact = {
          id: `${missionId}_art`,
          missionId,
          missionName: description,
          status: 'Rejected',
          stepsCompleted: JSON.stringify([]),
          filesChanged: JSON.stringify([]),
          terminalOutputs: JSON.stringify([]),
          summary: `The mission plan formulated by the AI was rejected by the user.`
        };
        saveArtifact(workspacePath, artifact);
        emit('artifact', artifact);
      } catch (e) {
        console.error("Failed to archive rejected mission", e);
      }
    } else {
      emit('log', `\n[System] Fatal error during mission execution: ${error.message}`);
      emit('status', 'Failed');

      try {
        const artifact = {
          id: `${missionId}_art`,
          missionId,
          missionName: description,
          status: 'Failed',
          stepsCompleted: JSON.stringify(steps.map(s => s.description)),
          filesChanged: JSON.stringify(filesChangedList),
          terminalOutputs: JSON.stringify(terminalLogs),
          summary: `Fatal execution failure: ${error.message}`
        };
        saveArtifact(workspacePath, artifact);
        emit('artifact', artifact);
      } catch (e) {
        console.error("Failed to archive failed mission", e);
      }
    }
  } finally {
    activeMissions.delete(missionId);
  }
}

function cancelAgentMission(missionId) {
  const controller = activeMissions.get(missionId);
  if (controller) {
    controller.abort();
    activeMissions.delete(missionId);
    return true;
  }
  // Check if we are waiting in approval stage
  const resolve = pendingApprovals.get(missionId);
  if (resolve) {
    resolve(false);
    return true;
  }
  return false;
}

function approveAgentPlan(missionId, approved) {
  const resolve = pendingApprovals.get(missionId);
  if (resolve) {
    resolve(approved);
    return true;
  }
  return false;
}

async function runSubAgentMission(mainWindow, parentMissionId, subMissionId, agentName, description, workspacePath, settings, abortSignal) {
  const emitParentLog = (msg) => {
    if (mainWindow.isDestroyed()) return;
    mainWindow.webContents.send(`agent:event:${parentMissionId}`, { 
      type: 'log', 
      data: `[${agentName}] ${msg}` 
    });
  };

  emitParentLog(`Starting sub-task: "${description}"`);

  // Build workspace map
  const { getWorkspaceContextMap } = require('./workspaceContext');
  const workspaceMap = getWorkspaceContextMap(workspacePath, (settings.contextSize || 100000) * 4);

  emitParentLog(`Formulating execution plan for sub-task...`);
  const planResult = await generatePlan(
    `Sub-Task for ${agentName}: ${description}`,
    workspacePath,
    settings,
    workspaceMap,
    abortSignal
  );

  emitParentLog(`Plan formulated with ${planResult.steps.length} steps. Executing...`);

  let subContext = {};
  for (let i = 0; i < planResult.steps.length; i++) {
    if (abortSignal.aborted) {
      throw new Error("Sub-agent aborted.");
    }
    const step = planResult.steps[i];
    emitParentLog(`Executing step ${i + 1}/${planResult.steps.length}: ${step.description}`);

    try {
      switch (step.type) {
        case 'file_read': {
          const relPath = step.params.path;
          const content = await executeFileRead(workspacePath, relPath);
          subContext[relPath] = content;
          break;
        }
        case 'file_write': {
          const relPath = step.params.path;
          await executeFileWrite(workspacePath, relPath, step.params.content);
          emitParentLog(`Wrote file: ${relPath}`);
          break;
        }
        case 'terminal': {
          const command = step.params.command;
          const output = await executeTerminalCommand(workspacePath, command, abortSignal);
          if (output) {
            emitParentLog(`Command output:\n${output.trim().substring(0, 1000)}`);
          }
          break;
        }
        case 'ai_transform': {
          const relPath = step.params.path;
          await executeAiTransform(
            workspacePath,
            relPath,
            step.params.instruction,
            settings,
            subContext[relPath],
            abortSignal
          );
          emitParentLog(`Edited file: ${relPath}`);
          break;
        }
        case 'create_folder': {
          await executeCreateFolder(workspacePath, step.params.path);
          emitParentLog(`Created folder: ${step.params.path}`);
          break;
        }
        case 'delete_file': {
          await executeDeleteFile(workspacePath, step.params.path);
          emitParentLog(`Deleted file/folder: ${step.params.path}`);
          break;
        }
        case 'read_folder': {
          await executeReadFolder(workspacePath, step.params.path);
          emitParentLog(`Listed folder ${step.params.path} contents.`);
          break;
        }
        default:
          emitParentLog(`Unknown step type: ${step.type}`);
      }
    } catch (stepErr) {
      emitParentLog(`Step failed: ${stepErr.message}`);
      throw stepErr;
    }
  }

  emitParentLog(`Sub-task completed successfully.`);
}

module.exports = {
  runAgentMission,
  cancelAgentMission,
  approveAgentPlan
};
