import React from 'react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { X, Dot } from 'lucide-react';

export default function EditorTabs() {
  const { openTabs, activeTab, selectTab, closeTab } = useWorkspaceStore();

  if (openTabs.length === 0) {
    return null;
  }

  return (
    <div className="h-10 flex items-center bg-[#090D14] border-b border-frosten-border overflow-x-auto scroller scrollable select-none">
      {openTabs.map((tab) => {
        const isActive = tab.path === activeTab;
        return (
          <div
            key={tab.path}
            onClick={() => selectTab(tab.path)}
            className={`h-full flex items-center gap-2 px-4 border-r border-frosten-border cursor-pointer transition-all duration-150 text-xs font-mono group relative ${
              isActive 
                ? 'bg-frosten-bg text-frosten-ice border-t-2 border-t-frosten-ice' 
                : 'text-frosten-muted hover:bg-[#161B22]/40 hover:text-frosten-white'
            }`}
          >
            {/* Unsaved indicator */}
            {tab.isDirty && (
              <span className="h-2 w-2 rounded-full bg-frosten-ice animate-pulse" title="Unsaved changes" />
            )}

            <span className="truncate max-w-[120px]">{tab.name}</span>

            {/* Close button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.path);
              }}
              className="p-0.5 rounded hover:bg-slate-700/50 text-frosten-muted hover:text-frosten-white opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
