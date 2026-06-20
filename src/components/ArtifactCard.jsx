import React, { useState } from 'react';
import { 
  FileCode, Terminal, HelpCircle, Calendar, 
  ChevronDown, ChevronUp, FileText, CheckCircle2, AlertTriangle 
} from 'lucide-react';

export default function ArtifactCard({ artifact }) {
  const [showLogs, setShowLogs] = useState(false);
  const [activeFileContent, setActiveFileContent] = useState('');
  const [activeFileName, setActiveFileName] = useState('');
  const [loadingFile, setLoadingFile] = useState(false);

  const handleFileClick = async (filePath) => {
    if (activeFileName === filePath) {
      // Toggle off
      setActiveFileName('');
      setActiveFileContent('');
      return;
    }

    setLoadingFile(true);
    setActiveFileName(filePath);
    try {
      if (window.electronAPI) {
        // Since files changed list are relative, we read it using workspace path + file path
        // But artifact does not store workspace path directly, we can read files if they exist.
        // In the workspaceStore, we can grab the active workspace path.
        const { useWorkspaceStore } = await import('../store/workspaceStore');
        const workspacePath = useWorkspaceStore.getState().workspacePath;
        const fullPath = workspacePath + '/' + filePath;
        const content = await window.electronAPI.readFile(fullPath);
        setActiveFileContent(content);
      }
    } catch (err) {
      console.error("Failed to read file for diff preview:", err);
      setActiveFileContent(`// Error loading file content:\n// ${err.message || 'File might have been moved or deleted.'}`);
    } finally {
      setLoadingFile(false);
    }
  };

  const formatDate = (dateStr) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return dateStr;
    }
  };

  const isSuccess = artifact.status === 'Done';

  return (
    <div className="rounded-xl border border-frosten-border glass-panel glow-ice p-5 flex flex-col gap-4 animate-fade-in">
      
      {/* Header Info */}
      <div className="flex justify-between items-start gap-4">
        <div>
          <h3 className="text-sm font-semibold text-frosten-white tracking-wide">{artifact.missionName}</h3>
          <span className="flex items-center gap-1 text-[10px] text-frosten-muted mt-1.5 font-mono">
            <Calendar className="h-3.5 w-3.5 text-frosten-cyan" />
            {formatDate(artifact.createdAt)}
          </span>
        </div>
        
        {/* Status Badge */}
        <span className={`px-2.5 py-1 rounded text-xs font-semibold font-ui flex items-center gap-1.5 shrink-0 ${
          artifact.status === 'Done' 
            ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' 
            : artifact.status === 'Rejected'
            ? 'bg-slate-500/10 border border-slate-700/30 text-slate-400'
            : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
        }`}>
          {artifact.status === 'Done' ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
          {artifact.status}
        </span>
      </div>

      {/* AI Summary Section */}
      <div className="bg-slate-800/20 border border-frosten-border/50 rounded-lg p-4 text-xs leading-relaxed text-[#C9D1D9]">
        <div className="flex items-center gap-1.5 text-frosten-ice font-semibold mb-2 select-none font-ui">
          <FileText className="h-4 w-4" />
          <span>AI Accomplishment Summary</span>
        </div>
        <div className="whitespace-pre-wrap font-sans">{artifact.summary}</div>
      </div>

      {/* Changed Files */}
      {artifact.filesChanged && artifact.filesChanged.length > 0 && (
        <div className="space-y-2">
          <label className="text-[10px] font-semibold text-frosten-ice tracking-wider uppercase select-none">Files Changed (Click to inspect)</label>
          <div className="flex flex-wrap gap-2">
            {artifact.filesChanged.map((file, idx) => (
              <button
                key={idx}
                onClick={() => handleFileClick(file)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono transition-all border cursor-pointer ${
                  activeFileName === file
                    ? 'bg-frosten-cyan/25 border-frosten-ice text-frosten-ice'
                    : 'bg-slate-800/40 border-frosten-border text-[#8B949E] hover:text-frosten-white hover:border-frosten-ice/40'
                }`}
              >
                <FileCode className="h-3.5 w-3.5" />
                {file}
              </button>
            ))}
          </div>

          {/* Expanded File Inspection Drawer */}
          {activeFileName && (
            <div className="mt-2 rounded-lg border border-frosten-border bg-[#090D14]/90 overflow-hidden animate-fade-in">
              <div className="px-4 py-2 bg-[#090D14] border-b border-frosten-border text-[10px] text-frosten-muted font-mono flex justify-between items-center">
                <span>Inspecting: {activeFileName}</span>
                {loadingFile && <span className="text-frosten-ice animate-pulse">Loading...</span>}
              </div>
              <pre className="p-3 text-[11px] font-mono text-[#C9D1D9] overflow-x-auto max-h-[200px] scroller scrollable leading-relaxed">
                <code>{activeFileContent || '// Empty or Loading...'}</code>
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Terminal logs list */}
      {artifact.terminalOutputs && artifact.terminalOutputs.length > 0 && (
        <div className="border-t border-frosten-border/55 pt-3">
          <button
            onClick={() => setShowLogs(!showLogs)}
            className="flex items-center justify-between w-full text-xs font-medium text-frosten-muted hover:text-frosten-white transition-colors cursor-pointer select-none"
          >
            <span className="flex items-center gap-1.5">
              <Terminal className="h-4 w-4 text-frosten-cyan" />
              Terminal Commands Log ({artifact.terminalOutputs.length})
            </span>
            {showLogs ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {showLogs && (
            <div className="mt-3 space-y-3 animate-fade-in">
              {artifact.terminalOutputs.map((log, idx) => (
                <div key={idx} className="rounded-lg border border-frosten-border bg-[#090D14]/90 overflow-hidden text-xs">
                  <div className="px-3 py-1.5 bg-[#090D14] border-b border-frosten-border font-mono text-frosten-ice select-none">
                    $ {log.command}
                  </div>
                  <pre className="p-3 font-mono text-[10px] text-emerald-400 bg-black/45 overflow-x-auto max-h-[140px] scroller scrollable whitespace-pre-wrap">
                    {log.output || '(No stdout/stderr)'}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  );
}
