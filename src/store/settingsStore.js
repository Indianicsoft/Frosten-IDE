import { create } from 'zustand';

export const useSettingsStore = create((set, get) => ({
  settings: {
    providerName: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    apiKey: '',
    modelName: 'gpt-4o-mini',
    maxTokens: 4096,
    contextSize: 100000,
    temperature: 0.7,
    systemPrompt: 'You are a helpful coding assistant.'
  },
  
  testingConnection: false,
  connectionStatus: 'idle', // 'idle' | 'success' | 'failed'
  connectionError: '',

  loadSettings: async () => {
    try {
      if (window.electronAPI) {
        const config = await window.electronAPI.loadSettings();
        set((state) => ({ settings: { ...state.settings, ...config } }));
      }
    } catch (err) {
      console.error('Failed to load settings from main process:', err);
    }
  },

  updateSetting: (key, value) => {
    set((state) => ({
      settings: {
        ...state.settings,
        [key]: value
      }
    }));
  },

  saveSettings: async () => {
    try {
      const config = get().settings;
      if (window.electronAPI) {
        await window.electronAPI.saveSettings(config);
      }
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  },

  testConnection: async () => {
    set({ testingConnection: true, connectionStatus: 'idle', connectionError: '' });
    try {
      const config = get().settings;
      if (window.electronAPI) {
        const result = await window.electronAPI.testConnection(config);
        if (result.success) {
          set({ connectionStatus: 'success', testingConnection: false });
        } else {
          set({ 
            connectionStatus: 'failed', 
            connectionError: result.error || 'Connection failed.',
            testingConnection: false 
          });
        }
      } else {
        set({ connectionStatus: 'failed', connectionError: 'Electron API unavailable.', testingConnection: false });
      }
    } catch (err) {
      set({ 
        connectionStatus: 'failed', 
        connectionError: err.message || 'Unknown error occurred.', 
        testingConnection: false 
      });
    }
  }
}));
