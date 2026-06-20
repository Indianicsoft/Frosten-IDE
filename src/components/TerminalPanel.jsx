import React, { useEffect, useRef } from 'react';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { useWorkspaceStore } from '../store/workspaceStore';
import 'xterm/css/xterm.css';

export default function TerminalPanel() {
  const terminalRef = useRef(null);
  const { terminalId } = useWorkspaceStore();
  const xtermInstance = useRef(null);
  const fitAddonInstance = useRef(null);

  useEffect(() => {
    if (!terminalId || !terminalRef.current) return;

    // Create xterm.js Terminal instance
    const term = new Terminal({
      cursorBlink: true,
      theme: {
        background: '#0D1117',
        foreground: '#F8FAFC',
        cursor: '#7DD3FC',
        selectionBackground: 'rgba(125, 211, 252, 0.3)',
        black: '#0D1117',
        blue: '#7DD3FC',
        cyan: '#38BDF8',
        green: '#34D399',
        magenta: '#A78BFA',
        red: '#F87171',
        white: '#F8FAFC',
        yellow: '#F5C042'
      },
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 12,
      lineHeight: 1.2
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    
    term.open(terminalRef.current);
    fitAddon.fit();

    xtermInstance.current = term;
    fitAddonInstance.current = fitAddon;

    // Connect input -> PTY
    const onDataDisposable = term.onData((data) => {
      window.electronAPI.writeTerminal(terminalId, data);
    });

    // Connect PTY -> output
    const cleanupPtyListener = window.electronAPI.onTerminalData(terminalId, (data) => {
      term.write(data);
    });

    // Handle resizing PTY process
    const handleResize = () => {
      if (fitAddonInstance.current && xtermInstance.current) {
        fitAddonInstance.current.fit();
        const cols = xtermInstance.current.cols;
        const rows = xtermInstance.current.rows;
        window.electronAPI.resizeTerminal(terminalId, cols, rows);
      }
    };

    // Trigger initial resize sync
    handleResize();

    window.addEventListener('resize', handleResize);

    // Clean up connections on destroy
    return () => {
      onDataDisposable.dispose();
      cleanupPtyListener();
      window.removeEventListener('resize', handleResize);
      term.dispose();
    };
  }, [terminalId]);

  return (
    <div className="h-full w-full bg-frosten-bg p-2 flex flex-col">
      <div className="flex justify-between items-center px-4 py-1.5 bg-[#090D14] border border-frosten-border/80 rounded-t-lg text-xs text-frosten-muted font-mono select-none">
        <span>Interactive Shell (PTY)</span>
        <span className="text-[10px] text-frosten-cyan bg-frosten-cyan/10 px-1.5 py-0.5 rounded border border-frosten-cyan/20">Active</span>
      </div>
      <div 
        ref={terminalRef} 
        className="flex-1 w-full bg-frosten-bg border-x border-b border-frosten-border/80 rounded-b-lg p-2 overflow-hidden" 
      />
    </div>
  );
}
