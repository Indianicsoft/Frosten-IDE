import React, { useState, useEffect } from 'react';
import { Snowflake, Layout, Cpu, Settings, X } from 'lucide-react';
import { useSettingsStore } from './store/settingsStore';
import { useWorkspaceStore } from './store/workspaceStore';
import { useAgentStore } from './store/agentStore';
import EditorView from './views/EditorView';
import ManagerView from './views/ManagerView';
import SettingsPanel from './components/SettingsPanel';

export default function App() {
  const [activeView, setActiveView] = useState('editor'); // 'editor' | 'manager'
  const [showSettings, setShowSettings] = useState(false);
  
  const loadSettings = useSettingsStore((state) => state.loadSettings);
  const workspacePath = useWorkspaceStore((state) => state.workspacePath);
  const loadArtifacts = useAgentStore((state) => state.loadArtifacts);

  // Load configuration on boot
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Switch view on global event
  useEffect(() => {
    const handleSwitchView = (e) => {
      if (e.detail?.view) {
        setActiveView(e.detail.view);
      }
    };
    window.addEventListener('app:switch-view', handleSwitchView);
    return () => window.removeEventListener('app:switch-view', handleSwitchView);
  }, []);

  // Sync workspace SQLite artifacts when folder changes
  useEffect(() => {
    if (workspacePath) {
      loadArtifacts(workspacePath);
    }
  }, [workspacePath, loadArtifacts]);

  return (
    <div className="h-full flex flex-col bg-frosten-bg text-frosten-white select-none">
      
      {/* Top Navigation Bar */}
      <header className="h-14 flex items-center justify-between px-6 bg-[#090D14] border-b border-frosten-border z-10 glass-panel">
        
        {/* Logo & Brand */}
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-frosten-cyan/10 border border-frosten-cyan/30 animate-pulse-border">
            <Snowflake className="h-5 w-5 text-frosten-ice" />
          </div>
          <span className="font-semibold tracking-wider text-frosten-white flex items-center gap-1 font-ui">
            Frosten <span className="text-frosten-ice text-sm font-medium px-1.5 py-0.5 rounded bg-frosten-ice/15 border border-frosten-ice/20">IDE</span>
          </span>
        </div>

        {/* View Toggle */}
        <div className="flex items-center p-0.5 bg-[#161B22]/60 border border-frosten-border rounded-lg">
          <button
            onClick={() => setActiveView('editor')}
            className={`flex items-center gap-2 px-4 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ${
              activeView === 'editor'
                ? 'bg-frosten-cyan/25 text-frosten-ice border border-frosten-ice/30 glow-ice'
                : 'text-frosten-muted hover:text-frosten-white hover:bg-slate-800/40 border border-transparent'
            }`}
          >
            <Layout className="h-3.5 w-3.5" />
            Editor View
          </button>
          
          <button
            onClick={() => setActiveView('manager')}
            className={`flex items-center gap-2 px-4 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ${
              activeView === 'manager'
                ? 'bg-frosten-cyan/25 text-frosten-ice border border-frosten-ice/30 glow-ice'
                : 'text-frosten-muted hover:text-frosten-white hover:bg-slate-800/40 border border-transparent'
            }`}
          >
            <Cpu className="h-3.5 w-3.5" />
            Manager View
          </button>
        </div>

        {/* Configuration Button */}
        <div>
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 rounded-lg bg-slate-800/45 hover:bg-slate-850 border border-frosten-border text-frosten-muted hover:text-frosten-ice hover:border-frosten-ice/45 transition-all duration-250 cursor-pointer"
            title="AI Provider Settings"
          >
            <Settings className="h-4.5 w-4.5 animate-spin-hover" />
          </button>
        </div>

      </header>

      {/* Main View Area */}
      <main className="flex-1 overflow-hidden relative">
        <div className={`h-full ${activeView === 'editor' ? 'block' : 'hidden'}`}>
          <EditorView />
        </div>
        <div className={`h-full ${activeView === 'manager' ? 'block' : 'hidden'}`}>
          <ManagerView />
        </div>
      </main>

      {/* Settings Panel Modal Overlay */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
          <div className="w-[580px] max-h-[85vh] rounded-xl overflow-hidden glass-panel glow-ice-lg flex flex-col animate-fade-in border border-frosten-borderActive">
            
            {/* Header */}
            <div className="flex justify-between items-center px-6 py-4 bg-[#090D14] border-b border-frosten-border">
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-frosten-ice" />
                <h2 className="text-sm font-semibold text-frosten-white">AI Provider Settings</h2>
              </div>
              <button
                onClick={() => setShowSettings(false)}
                className="text-frosten-muted hover:text-frosten-white p-1 rounded-md hover:bg-slate-800/40 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content scroll area */}
            <div className="flex-1 overflow-y-auto p-6 bg-[#0D1117]/95">
              <SettingsPanel onClose={() => setShowSettings(false)} />
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
