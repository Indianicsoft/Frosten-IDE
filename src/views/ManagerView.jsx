import React, { useState } from 'react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { useAgentStore } from '../store/agentStore';
import { useSettingsStore } from '../store/settingsStore';
import { 
  FolderOpen, Plus, Sparkles, X, Loader2, 
  Cpu, Award, ShieldAlert 
} from 'lucide-react';
import MissionCard from '../components/MissionCard';
import ArtifactCard from '../components/ArtifactCard';

export default function ManagerView() {
  const { workspacePath, openFolder } = useWorkspaceStore();
  const { missions, artifacts, addMission } = useAgentStore();
  const settings = useSettingsStore((state) => state.settings);

  const [showModal, setShowModal] = useState(false);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleStartMission = async (e) => {
    e.preventDefault();
    if (!description.trim() || !workspacePath || submitting) return;

    if (!settings.apiKey) {
      alert("Please configure your AI Provider settings (API Key) before running agent missions.");
      return;
    }

    setSubmitting(true);
    try {
      await addMission(description.trim(), workspacePath, settings);
      setDescription('');
      setShowModal(false);
    } catch (err) {
      console.error("Failed to start mission:", err);
    } finally {
      setSubmitting(false);
    }
  };

  if (!workspacePath) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-6 select-none animate-fade-in">
        <div className="w-16 h-16 rounded-full bg-frosten-cyan/15 border border-frosten-cyan/35 flex items-center justify-center animate-pulse mb-4">
          <FolderOpen className="h-8 w-8 text-frosten-ice" />
        </div>
        <h2 className="text-base font-semibold text-frosten-white">Workspace Required</h2>
        <p className="text-xs text-frosten-muted max-w-sm mt-1.5 leading-relaxed">
          The autonomous AI Agent runs terminal operations and file transformations within an open directory. Open a folder to begin.
        </p>
        <button
          onClick={openFolder}
          className="flex items-center gap-1.5 px-4 py-2 bg-frosten-cyan/20 border border-frosten-ice/45 hover:bg-frosten-cyan/30 hover:border-frosten-ice text-frosten-ice hover:text-white rounded text-xs font-semibold mt-4 glow-ice transition-all cursor-pointer"
        >
          <FolderOpen className="h-4 w-4" />
          Select Workspace Folder
        </button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-frosten-bg p-6 overflow-hidden select-none">
      
      {/* Dashboard Toolbar */}
      <div className="flex justify-between items-center pb-4 border-b border-frosten-border select-none">
        <div>
          <h1 className="text-base font-semibold text-frosten-white tracking-wide">Mission Control Dashboard</h1>
          <p className="text-xs text-frosten-muted mt-0.5">Deploy and monitor autonomous AI coding agents inside {workspacePath.split('/').pop()}</p>
        </div>
        
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-frosten-cyan/20 border border-frosten-ice/45 hover:bg-frosten-cyan/30 hover:border-frosten-ice text-frosten-ice hover:text-white rounded text-xs font-semibold cursor-pointer glow-ice transition-all"
        >
          <Plus className="h-4 w-4" />
          Deploy New Agent
        </button>
      </div>

      {/* Main Split Grid */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6 overflow-hidden">
        
        {/* Left Side: Active Missions */}
        <div className="flex flex-col min-h-0 bg-[#090D14]/30 border border-frosten-border/80 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <Cpu className="h-5 w-5 text-frosten-ice" />
            <h2 className="text-sm font-semibold text-frosten-white">Active Missions ({missions.filter(m => ['Pending','Planning','RequiresApproval','Executing','Verifying'].includes(m.status)).length})</h2>
          </div>

          <div className="flex-1 overflow-y-auto pr-1 scroller scrollable">
            {missions.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-center text-xs text-frosten-muted border border-dashed border-frosten-border rounded-xl p-4">
                <span>No active agent missions running.</span>
                <button 
                  onClick={() => setShowModal(true)} 
                  className="mt-2 text-frosten-cyan hover:underline cursor-pointer"
                >
                  Deploy your first mission
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                {missions.map((mission) => (
                  <MissionCard key={mission.id} mission={mission} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Side: Historic SQLite Artifact Cards */}
        <div className="flex flex-col min-h-0 bg-[#090D14]/30 border border-frosten-border/80 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-4">
            <Award className="h-5 w-5 text-emerald-400 animate-pulse" />
            <h2 className="text-sm font-semibold text-frosten-white">Completed Artifact Logs ({artifacts.length})</h2>
          </div>

          <div className="flex-1 overflow-y-auto space-y-4 pr-1 scroller scrollable">
            {artifacts.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center text-center text-xs text-frosten-muted border border-dashed border-frosten-border rounded-xl p-4">
                <span>No artifacts generated in this workspace.</span>
                <span className="text-[10px] text-slate-500 mt-1">Artifacts are auto-committed to SQLite once agents complete goals.</span>
              </div>
            ) : (
              artifacts.map((artifact) => (
                <ArtifactCard key={artifact.id} artifact={artifact} />
              ))
            )}
          </div>
        </div>

      </div>

      {/* New Mission Overlay Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-[520px] rounded-xl overflow-hidden border border-frosten-borderActive glass-panel glow-ice-lg flex flex-col animate-fade-in">
            
            {/* Header */}
            <div className="flex justify-between items-center px-6 py-4 bg-[#090D14] border-b border-frosten-border select-none">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-frosten-ice" />
                <h2 className="text-sm font-semibold text-frosten-white">Deploy AI Agent Mission</h2>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-frosten-muted hover:text-white p-1 rounded-md hover:bg-slate-800/40 cursor-pointer transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Input Form */}
            <form onSubmit={handleStartMission} className="p-6 bg-[#0D1117]/95 flex flex-col gap-4">
              
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-frosten-ice tracking-wider uppercase select-none">What is the high-level objective?</label>
                <textarea
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. 'Create a node script named benchmark.js that calculates primes up to 100000 and measures execution time'"
                  className="px-3 py-2 bg-[#161B22]/70 border border-frosten-border text-xs rounded-md text-frosten-white placeholder-frosten-muted focus:border-frosten-ice resize-none outline-none"
                  disabled={submitting}
                  required
                />
              </div>

              {!settings.apiKey && (
                <div className="flex items-start gap-2 p-2.5 rounded border border-rose-500/20 bg-rose-500/5 text-[10px] text-rose-400 select-none">
                  <ShieldAlert className="h-4.5 w-4.5 shrink-0 text-rose-500" />
                  <span>Your AI settings are missing an API key. Go to Settings (gear icon) to save a key first.</span>
                </div>
              )}

              {/* Controls */}
              <div className="flex justify-end gap-2 pt-2 border-t border-frosten-border">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded text-xs text-frosten-muted hover:text-white hover:bg-slate-800/40 cursor-pointer"
                  disabled={submitting}
                >
                  Cancel
                </button>
                
                <button
                  type="submit"
                  className="flex items-center gap-1.5 px-4 py-2 bg-frosten-cyan/20 border border-frosten-ice/40 hover:bg-frosten-cyan/30 hover:border-frosten-ice text-frosten-ice hover:text-white rounded text-xs font-semibold cursor-pointer glow-ice transition-all disabled:opacity-50"
                  disabled={submitting || !description.trim() || !settings.apiKey}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Deploying...
                    </>
                  ) : "Deploy Agent"}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
}
