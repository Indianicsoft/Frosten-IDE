import { create } from 'zustand';

export const useAgentStore = create((set, get) => ({
  missions: [], // array of { id, name, status, steps: [], logs: '' }
  artifacts: [], // array of { id, missionId, missionName, status, stepsCompleted, filesChanged, terminalOutputs, summary, createdAt }

  loadArtifacts: async (workspacePath) => {
    if (!workspacePath || !window.electronAPI) return;
    try {
      const dbArtifacts = await window.electronAPI.getArtifacts(workspacePath);
      set({ artifacts: dbArtifacts });
    } catch (err) {
      console.error("Failed to load artifacts from DB:", err);
    }
  },

  addMission: async (description, workspacePath, settings) => {
    if (!workspacePath || !window.electronAPI) return;

    const missionId = `mission_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newMission = {
      id: missionId,
      name: description,
      status: 'Pending',
      steps: [],
      markdownPlan: '',
      logs: `[System] Spawning agent for mission: "${description}"...\n`
    };

    set((state) => ({
      missions: [newMission, ...state.missions]
    }));

    // Listen for agent IPC events
    const unsubscribe = window.electronAPI.onAgentEvent(missionId, (event) => {
      const { type, data } = event;
      
      set((state) => ({
        missions: state.missions.map(m => {
          if (m.id !== missionId) return m;

          let updatedLogs = m.logs;
          let updatedStatus = m.status;
          let updatedSteps = [...m.steps];
          let updatedMarkdownPlan = m.markdownPlan || '';

          if (type === 'status') {
            updatedStatus = data;
            updatedLogs += `[System] Status changed to: ${data}\n`;
          } else if (type === 'log') {
            updatedLogs += `${data}\n`;
          } else if (type === 'plan') {
            // data is { markdownPlan, steps }
            const stepsList = data.steps || [];
            updatedSteps = stepsList.map(step => ({
              ...step,
              status: 'pending' // 'pending' | 'running' | 'done' | 'failed'
            }));
            updatedMarkdownPlan = data.markdownPlan || '';
          } else if (type === 'step_start') {
            updatedSteps = updatedSteps.map(s => 
              s.id === data.stepId ? { ...s, status: 'running' } : s
            );
          } else if (type === 'step_done') {
            updatedSteps = updatedSteps.map(s => 
              s.id === data.stepId ? { ...s, status: 'done' } : s
            );
          } else if (type === 'step_failed') {
            updatedSteps = updatedSteps.map(s => 
              s.id === data.stepId ? { ...s, status: 'failed', error: data.error } : s
            );
          } else if (type === 'artifact') {
            // Reload all artifacts from database to update view
            get().loadArtifacts(workspacePath);
          }

          return {
            ...m,
            status: updatedStatus,
            steps: updatedSteps,
            markdownPlan: updatedMarkdownPlan,
            logs: updatedLogs
          };
        })
      }));
    });

    // Spawn execution in main process
    try {
      await window.electronAPI.runMission(missionId, description, workspacePath, settings);
    } catch (err) {
      set((state) => ({
        missions: state.missions.map(m => {
          if (m.id !== missionId) return m;
          return {
            ...m,
            status: 'Failed',
            logs: m.logs + `[Error] Failed to trigger agent runner: ${err.message}\n`
          };
        })
      }));
    }

    return missionId;
  },

  cancelMission: async (missionId) => {
    if (!window.electronAPI) return;
    try {
      const success = await window.electronAPI.cancelMission(missionId);
      if (success) {
        set((state) => ({
          missions: state.missions.map(m => {
            if (m.id !== missionId) return m;
            return {
              ...m,
              status: 'Failed',
              logs: m.logs + `[System] Mission aborted by user.\n`
            };
          })
        }));
      }
    } catch (err) {
      console.error("Failed to cancel mission:", err);
    }
  },

  approvePlan: async (missionId, approved) => {
    if (!window.electronAPI) return;
    try {
      await window.electronAPI.approvePlan(missionId, approved);
      if (!approved) {
        set((state) => ({
          missions: state.missions.map(m => {
            if (m.id !== missionId) return m;
            return {
              ...m,
              status: 'Rejected',
              logs: m.logs + `[System] Mission plan rejected by user.\n`
            };
          })
        }));
      }
    } catch (err) {
      console.error("Failed to approve/reject plan:", err);
    }
  }
}));
