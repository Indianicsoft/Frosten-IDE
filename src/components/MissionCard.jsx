import React, { useState, useEffect, useRef } from 'react';
import { useAgentStore } from '../store/agentStore';
import { 
  Play, StopCircle, RefreshCw, CheckCircle, 
  XCircle, ListTodo, Terminal, FileCode, Sparkles 
} from 'lucide-react';

export default function MissionCard({ mission }) {
  const cancelMission = useAgentStore((state) => state.cancelMission);
  const approvePlan = useAgentStore((state) => state.approvePlan);
  const logContainerRef = useRef(null);
  const [activeViewTab, setActiveViewTab] = useState('plan');

  useEffect(() => {
    if (mission.status === 'RequiresApproval') {
      setActiveViewTab('plan');
    } else if (mission.status === 'Executing' || mission.status === 'Verifying') {
      setActiveViewTab('checklist');
    }
  }, [mission.status]);

  const renderMarkdown = (md) => {
    if (!md) return <span className="text-frosten-muted italic">No implementation plan generated.</span>;
    const lines = md.split('\n');
    return (
      <div className="space-y-2 text-xs text-[#C9D1D9] leading-relaxed">
        {lines.map((line, idx) => {
          const trimmed = line.trim();
          if (trimmed.startsWith('# ')) {
            return <h1 key={idx} className="text-sm font-semibold text-frosten-ice border-b border-frosten-border pb-1 mt-3 mb-1">{trimmed.substring(2)}</h1>;
          }
          if (trimmed.startsWith('## ')) {
            return <h2 key={idx} className="text-xs font-semibold text-frosten-cyan mt-3 mb-1 uppercase tracking-wide">{trimmed.substring(3)}</h2>;
          }
          if (trimmed.startsWith('### ')) {
            return <h3 key={idx} className="text-xs font-semibold text-frosten-white mt-2 mb-1">{trimmed.substring(4)}</h3>;
          }
          if (trimmed.startsWith('- [ ] ') || trimmed.startsWith('- [x] ') || trimmed.startsWith('- [/] ')) {
            const checked = trimmed.startsWith('- [x]');
            const inProgress = trimmed.startsWith('- [/]');
            const text = trimmed.substring(6);
            return (
              <div key={idx} className="flex items-start gap-2 pl-2">
                <span className={`h-3.5 w-3.5 rounded border mt-0.5 shrink-0 flex items-center justify-center text-[8px] ${
                  checked ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' :
                  inProgress ? 'bg-amber-500/20 border-amber-500 text-amber-400' :
                  'border-slate-600'
                }`}>
                  {checked && '✓'}
                  {inProgress && '•'}
                </span>
                <span>{text}</span>
              </div>
            );
          }
          if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            return <div key={idx} className="pl-4">• {trimmed.substring(2)}</div>;
          }
          if (trimmed.startsWith('> [!') || trimmed.startsWith('>')) {
            let alertText = trimmed;
            let alertType = 'note';
            if (trimmed.startsWith('> [!NOTE]')) { alertType = 'note'; alertText = trimmed.substring(9); }
            else if (trimmed.startsWith('> [!IMPORTANT]')) { alertType = 'important'; alertText = trimmed.substring(14); }
            else if (trimmed.startsWith('> [!WARNING]')) { alertType = 'warning'; alertText = trimmed.substring(12); }
            else { alertText = trimmed.startsWith('>') ? trimmed.substring(1) : trimmed; }
            
            const alertColors = {
              note: 'border-frosten-ice/40 bg-frosten-cyan/5 text-frosten-ice',
              important: 'border-pink-500/40 bg-pink-500/5 text-pink-450',
              warning: 'border-amber-500/40 bg-amber-500/5 text-amber-400'
            };
            return (
              <div key={idx} className={`p-2 rounded border-l-2 my-2 text-[10px] ${alertColors[alertType] || alertColors.note}`}>
                {alertText.trim()}
              </div>
            );
          }
          if (trimmed === '') return <div key={idx} className="h-1" />;
          
          const formatted = trimmed
            .replace(/\*\*(.*?)\*\*/g, '<strong class="text-frosten-ice font-medium">$1</strong>')
            .replace(/`([^`]+)`/g, '<code class="bg-[#161B22] text-[#58A6FF] px-1 py-0.5 rounded font-mono text-[10px]">$1</code>');
            
          return (
            <p 
              key={idx} 
              className="pl-1"
              dangerouslySetInnerHTML={{ __html: formatted }}
            />
          );
        })}
      </div>
    );
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Pending': return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
      case 'Planning': return 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20';
      case 'RequiresApproval': return 'text-pink-400 bg-pink-400/10 border-pink-400/20 animate-pulse';
      case 'Rejected': return 'text-slate-400 bg-slate-400/10 border-slate-700/20';
      case 'Executing': return 'text-sky-400 bg-sky-400/10 border-sky-400/20 animate-pulse';
      case 'Verifying': return 'text-violet-400 bg-violet-400/10 border-violet-400/20';
      case 'Done': return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
      case 'Failed': return 'text-rose-400 bg-rose-400/10 border-rose-400/20';
      default: return 'text-frosten-muted bg-slate-800/40 border-slate-700/30';
    }
  };

  const getStepIcon = (stepStatus) => {
    switch (stepStatus) {
      case 'running':
        return <RefreshCw className="h-4 w-4 text-frosten-cyan animate-spin" />;
      case 'done':
        return <CheckCircle className="h-4 w-4 text-emerald-450" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-rose-450" />;
      default:
        return <span className="h-2 w-2 rounded-full bg-slate-600 block mx-1" />;
    }
  };

  // Auto scroll agent logs to bottom
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [mission.logs]);

  const isRunning = ['Pending', 'Planning', 'RequiresApproval', 'Executing', 'Verifying'].includes(mission.status);

  return (
    <div className="rounded-xl border border-frosten-border glass-panel glow-ice p-5 flex flex-col gap-4 animate-fade-in">
      
      {/* Header */}
      <div className="flex justify-between items-start gap-4 select-none">
        <div>
          <h3 className="text-xs font-semibold text-frosten-muted tracking-wider uppercase font-mono">Mission ID: {mission.id.split('_').pop()}</h3>
          <h2 className="text-sm font-semibold text-frosten-white mt-1">{mission.name}</h2>
        </div>

        <div className="flex items-center gap-2">
          {/* Status Badge */}
          <span className={`px-2.5 py-1 rounded text-xs font-semibold border ${getStatusColor(mission.status)}`}>
            {mission.status}
          </span>
          
          {/* Abort button */}
          {isRunning && (
            <button
              onClick={() => cancelMission(mission.id)}
              className="flex items-center gap-1.5 px-3 py-1 bg-rose-500/10 border border-rose-500/35 hover:bg-rose-500/25 hover:border-rose-550 text-rose-400 hover:text-white rounded text-xs font-semibold cursor-pointer transition-all"
              title="Abort Agent"
            >
              <StopCircle className="h-3.5 w-3.5" />
              {mission.status === 'RequiresApproval' ? 'Cancel' : 'Abort'}
            </button>
          )}
        </div>
      </div>

      {/* Plan Steps list */}
      {/* View Tabs */}
      {mission.markdownPlan && (
        <div className="flex border-b border-frosten-border/60 pb-1.5 gap-3 text-xs select-none">
          <button
            onClick={() => setActiveViewTab('plan')}
            className={`pb-1 px-1 font-semibold transition-colors cursor-pointer border-b-2 ${
              activeViewTab === 'plan' 
                ? 'text-frosten-ice border-frosten-ice' 
                : 'text-frosten-muted border-transparent hover:text-white'
            }`}
          >
            Implementation Plan
          </button>
          <button
            onClick={() => setActiveViewTab('checklist')}
            className={`pb-1 px-1 font-semibold transition-colors cursor-pointer border-b-2 ${
              activeViewTab === 'checklist' 
                ? 'text-frosten-ice border-frosten-ice' 
                : 'text-frosten-muted border-transparent hover:text-white'
            }`}
          >
            Action Checklist ({mission.steps?.length || 0})
          </button>
        </div>
      )}

      {/* Plan / Checklist Display */}
      {activeViewTab === 'plan' && mission.markdownPlan && (
        <div className="max-h-60 overflow-y-auto border border-frosten-border bg-[#090D14]/40 rounded-lg p-3 scrollable select-text">
          {renderMarkdown(mission.markdownPlan)}
        </div>
      )}

      {(activeViewTab === 'checklist' || !mission.markdownPlan) && mission.steps && mission.steps.length > 0 && (
        <div className="space-y-2 select-none border-t border-frosten-border/50 pt-3">
          <label className="text-[10px] font-semibold text-frosten-ice tracking-wider uppercase flex items-center gap-1">
            <ListTodo className="h-4 w-4" />
            AI Formulated Action Checklist
          </label>
          <div className="space-y-2 pl-1">
            {mission.steps.map((step) => (
              <div key={step.id} className="flex items-center justify-between gap-3 text-xs border-b border-frosten-border/10 pb-1.5 last:border-0 last:pb-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="shrink-0 flex items-center justify-center w-5 h-5">
                    {getStepIcon(step.status)}
                  </div>
                  <span className={`font-mono truncate ${
                    step.status === 'done' ? 'text-[#8B949E] line-through' : 'text-[#C9D1D9]'
                  }`}>
                    {step.description}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {step.assignedAgent && (
                    <span className="text-[9px] font-semibold text-frosten-ice bg-frosten-cyan/15 border border-frosten-cyan/25 px-1.5 py-0.5 rounded font-mono">
                      {step.assignedAgent}
                    </span>
                  )}
                  <span className="text-[9px] text-slate-400 bg-slate-800/40 border border-slate-700/30 px-1 py-0.2 rounded font-mono">
                    {step.type}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Plan Approval Banner */}
      {mission.status === 'RequiresApproval' && (
        <div className="rounded-lg border border-pink-500/25 bg-pink-500/5 p-4 flex flex-col gap-3 select-none animate-pulse-subtle">
          <div className="flex items-start gap-2.5">
            <div className="w-5 h-5 rounded bg-pink-500/15 border border-pink-500/35 flex items-center justify-center shrink-0 mt-0.5">
              <Sparkles className="h-3 w-3 text-pink-400" />
            </div>
            <div className="flex-1">
              <h4 className="text-xs font-semibold text-pink-400">Review Proposed Implementation Plan</h4>
              <p className="text-[11px] text-[#8B949E] mt-1 leading-relaxed">
                The agent has generated a step plan. Review the checklist items above. Click "Approve & Execute" to proceed using specialized sub-agents, or reject to cancel.
              </p>
            </div>
          </div>
          
          <div className="flex justify-end gap-2 border-t border-pink-500/10 pt-3">
            <button
              onClick={() => approvePlan(mission.id, false)}
              className="px-3.5 py-1.5 bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 text-rose-450 hover:text-white rounded text-xs font-semibold cursor-pointer transition-colors"
            >
              Reject Plan
            </button>
            <button
              onClick={() => approvePlan(mission.id, true)}
              className="flex items-center gap-1 px-4 py-1.5 bg-emerald-500/20 border border-emerald-500/40 hover:bg-emerald-500/35 text-emerald-400 hover:text-white rounded text-xs font-semibold cursor-pointer transition-all shadow-[0_0_10px_rgba(16,185,129,0.15)] hover:shadow-[0_0_15px_rgba(16,185,129,0.25)]"
            >
              <CheckCircle className="h-3.5 w-3.5 mr-1" />
              Approve & Execute
            </button>
          </div>
        </div>
      )}

      {/* Real-time streaming Console log terminal */}
      <div className="border-t border-frosten-border/50 pt-3 flex flex-col gap-2">
        <label className="text-[10px] font-semibold text-frosten-ice tracking-wider uppercase flex items-center gap-1 select-none">
          <Terminal className="h-4 w-4" />
          Agent Live Console Output
        </label>
        <div 
          ref={logContainerRef}
          className="h-44 rounded-lg bg-black/60 border border-frosten-border p-3 overflow-y-auto font-mono text-[11px] text-[#A6E22E] whitespace-pre-wrap leading-relaxed scroller scrollable select-text"
        >
          {mission.logs}
        </div>
      </div>

    </div>
  );
}
