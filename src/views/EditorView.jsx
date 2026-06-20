import React, { useState, useEffect, useRef } from 'react';
import MonacoEditor, { DiffEditor } from '@monaco-editor/react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { useSettingsStore } from '../store/settingsStore';
import { 
  FolderTree, Terminal as TermIcon, MessageSquare, 
  Sparkles, Save, FolderOpen, Loader2, GitCompare,
  ZoomIn, ZoomOut, WrapText, SquareDot, Braces
} from 'lucide-react';
import FileTree from '../components/FileTree';
import EditorTabs from '../components/EditorTabs';
import AIChatSidebar from '../components/AIChatSidebar';
import TerminalPanel from '../components/TerminalPanel';
import InlineAssist from '../components/InlineAssist';
import { transformCodeWithAI } from '../lib/aiClient';

export default function EditorView() {
  const [showFileTree, setShowFileTree] = useState(true);
  const [showTerminal, setShowTerminal] = useState(true);
  const [showChat, setShowChat] = useState(true);
  const [showInlineAssist, setShowInlineAssist] = useState(false);
  const [showDiff, setShowDiff] = useState(false);

  // Editor configuration preferences
  const [editorFontSize, setEditorFontSize] = useState(13);
  const [editorWordWrap, setEditorWordWrap] = useState('on');
  const [editorMinimap, setEditorMinimap] = useState(false);

  // Selection states for AI contextual helper
  const [selectedText, setSelectedText] = useState('');
  const [selectionRange, setSelectionRange] = useState(null);

  // Sidebar drag resizes
  const [leftWidth, setLeftWidth] = useState(240);
  const [rightWidth, setRightWidth] = useState(320);
  const [terminalHeight, setTerminalHeight] = useState(240);

  const isDraggingLeft = useRef(false);
  const isDraggingRight = useRef(false);
  const isDraggingTerminal = useRef(false);

  const startResizeLeft = (e) => {
    e.preventDefault();
    isDraggingLeft.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.classList.add('select-none');
    document.addEventListener('mousemove', resizeLeft);
    document.addEventListener('mouseup', stopResizeLeft);
  };

  const resizeLeft = (e) => {
    if (!isDraggingLeft.current) return;
    const newWidth = Math.max(160, Math.min(480, e.clientX));
    setLeftWidth(newWidth);
  };

  const stopResizeLeft = () => {
    isDraggingLeft.current = false;
    document.body.style.cursor = '';
    document.body.classList.remove('select-none');
    document.removeEventListener('mousemove', resizeLeft);
    document.removeEventListener('mouseup', stopResizeLeft);
  };

  const startResizeRight = (e) => {
    e.preventDefault();
    isDraggingRight.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.classList.add('select-none');
    document.addEventListener('mousemove', resizeRight);
    document.addEventListener('mouseup', stopResizeRight);
  };

  const resizeRight = (e) => {
    if (!isDraggingRight.current) return;
    const newWidth = Math.max(200, Math.min(600, window.innerWidth - e.clientX));
    setRightWidth(newWidth);
  };

  const stopResizeRight = () => {
    isDraggingRight.current = false;
    document.body.style.cursor = '';
    document.body.classList.remove('select-none');
    document.removeEventListener('mousemove', resizeRight);
    document.removeEventListener('mouseup', stopResizeRight);
  };

  const startResizeTerminal = (e) => {
    e.preventDefault();
    isDraggingTerminal.current = true;
    document.body.style.cursor = 'row-resize';
    document.body.classList.add('select-none');
    document.addEventListener('mousemove', resizeTerminal);
    document.addEventListener('mouseup', stopResizeTerminal);
  };

  const resizeTerminal = (e) => {
    if (!isDraggingTerminal.current) return;
    const newHeight = Math.max(100, Math.min(500, window.innerHeight - e.clientY));
    setTerminalHeight(newHeight);
  };

  const stopResizeTerminal = () => {
    isDraggingTerminal.current = false;
    document.body.style.cursor = '';
    document.body.classList.remove('select-none');
    document.removeEventListener('mousemove', resizeTerminal);
    document.removeEventListener('mouseup', stopResizeTerminal);
  };
  
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  
  const { 
    workspacePath, openFolder, openTabs, activeTab, 
    updateTabContent, saveFile, refreshFileTree
  } = useWorkspaceStore();
  const settings = useSettingsStore((state) => state.settings);

  const activeTabDetails = openTabs.find(t => t.path === activeTab);

  const handleFormatActiveFile = () => {
    const { openTabs, activeTab, updateTabContent } = useWorkspaceStore.getState();
    const tab = openTabs.find(t => t.path === activeTab);
    if (!tab) return;
    try {
      const code = tab.content;
      const ext = tab.path.split('.').pop().toLowerCase();
      let formatted = code;
      
      if (ext === 'json') {
        formatted = JSON.stringify(JSON.parse(code), null, 2);
      } else {
        let indentLevel = 0;
        const lines = code.split('\n');
        const formattedLines = lines.map(line => {
          let trimmed = line.trim();
          if (trimmed.startsWith('}') || trimmed.startsWith(']') || trimmed.startsWith(')')) {
            indentLevel = Math.max(0, indentLevel - 1);
          }
          const formattedLine = '  '.repeat(indentLevel) + trimmed;
          if (trimmed.endsWith('{') || trimmed.endsWith('[') || trimmed.endsWith('(')) {
            indentLevel++;
          }
          return formattedLine;
        });
        formatted = formattedLines.join('\n');
      }
      
      updateTabContent(tab.path, formatted);
    } catch (e) {
      console.error("Local formatting failed:", e);
    }
  };

  const handleAiAction = (action) => {
    if (!selectedText) return;
    if (action === 'explain') {
      setShowChat(true);
      window.dispatchEvent(new CustomEvent('ai:prompt', {
        detail: {
          promptText: `Explain this code snippet in detail:\n\`\`\`\n${selectedText}\n\`\`\``
        }
      }));
    } else if (action === 'optimize') {
      setShowInlineAssist(true);
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('ai:inline-assist-populate', {
          detail: {
            instruction: "Optimize performance, readability, and reduce complexity of this selected code."
          }
        }));
      }, 50);
    } else if (action === 'tests') {
      setShowInlineAssist(true);
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('ai:inline-assist-populate', {
          detail: {
            instruction: "Generate comprehensive unit tests for this selected code."
          }
        }));
      }, 50);
    }
  };

  useEffect(() => {
    setShowDiff(false);
    setSelectedText('');
  }, [activeTab]);

  // Ctrl+K key listener for Inline Assist
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        if (activeTabDetails) {
          setShowInlineAssist(prev => !prev);
        }
      }
      if (e.key === 'Escape') {
        setShowInlineAssist(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTabDetails]);

  // Map file extension to monaco languages
  const getLanguage = (filePath) => {
    if (!filePath) return 'plaintext';
    const ext = filePath.split('.').pop().toLowerCase();
    switch (ext) {
      case 'js':
      case 'jsx':
        return 'javascript';
      case 'ts':
      case 'tsx':
        return 'typescript';
      case 'css':
        return 'css';
      case 'html':
        return 'html';
      case 'json':
        return 'json';
      case 'md':
        return 'markdown';
      case 'py':
        return 'python';
      case 'rs':
        return 'rust';
      case 'go':
        return 'go';
      case 'sh':
      case 'bash':
        return 'shell';
      default:
        return 'plaintext';
    }
  };

  const handleEditorDidMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Command Ctrl+S to save file
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      if (activeTab) {
        saveFile(activeTab);
      }
    });

    // Selection listener to show AI Selection helper
    editor.onDidChangeCursorSelection((e) => {
      const selectionText = editor.getModel().getValueInRange(e.selection);
      if (selectionText && selectionText.trim()) {
        setSelectedText(selectionText);
        setSelectionRange(e.selection);
      } else {
        setSelectedText('');
      }
    });

    // Formatting command Alt+Shift+F
    editor.addCommand(monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.KeyF, () => {
      handleFormatActiveFile();
    });

    // Register Inline Completions Provider for Tab-Completions (via IPC)
    const inlineCompletionsProvider = monaco.languages.registerInlineCompletionsProvider(
      { pattern: '**/*' },
      {
        provideInlineCompletions: async (model, position, context, token) => {
          if (!settings.apiKey || !window.electronAPI) return { items: [] };

          const text = model.getValue();
          const offset = model.getOffsetAt(position);
          const prefix = text.substring(0, offset);
          const suffix = text.substring(offset);

          if (!prefix.trim()) return { items: [] };

          // Debounce 600ms
          await new Promise((resolve) => setTimeout(resolve, 600));
          if (token.isCancellationRequested) return { items: [] };

          try {
            const instruction = `Complete the code after the prefix. Respond with ONLY the completion text (no markdown, no explanation).\n\nPrefix:\n${prefix}\n\nSuffix:\n${suffix}`;
            const result = await transformCodeWithAI(settings, prefix, instruction, 'code');
            
            if (!result.success || !result.code) return { items: [] };
            
            let completion = result.code.trim();
            if (completion.startsWith('```')) {
              completion = completion.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
            }
            // Only take first line for inline completions
            completion = completion.split('\n')[0];

            return {
              items: [{
                insertText: completion,
                range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column)
              }]
            };
          } catch (err) {
            return { items: [] };
          }
        },
        freeInlineCompletions: () => {}
      }
    );

    // Clean up autocomplete provider on editor unmount
    editor.onDidDispose(() => {
      inlineCompletionsProvider.dispose();
    });
  };

  return (
    <div className="h-full flex bg-frosten-bg overflow-hidden relative">
      
      {/* LEFT SIDEBAR (File Tree Explorer) */}
      {showFileTree && (
        <div style={{ width: `${leftWidth}px` }} className="border-r border-frosten-border flex flex-col glass-panel select-none animate-fade-in shrink-0">
          
          <div className="h-10 flex items-center justify-between px-4 bg-[#090D14] border-b border-frosten-border">
            <span className="text-xs font-semibold uppercase tracking-wider text-frosten-ice truncate max-w-[140px]">
              {workspacePath ? workspacePath.split('/').pop() : 'Workspace'}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={refreshFileTree}
                className="p-1 rounded hover:bg-slate-800 text-frosten-muted hover:text-frosten-ice cursor-pointer transition-colors"
                title="Refresh File Tree"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
              </button>
              <button
                onClick={openFolder}
                className="p-1 rounded hover:bg-slate-800 text-frosten-muted hover:text-frosten-white cursor-pointer transition-colors"
                title="Open Folder"
              >
                <FolderOpen className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-hidden">
            {workspacePath ? (
              <FileTree />
            ) : (
              <div className="flex flex-col items-center justify-center h-full p-6 text-center gap-3">
                <p className="text-xs text-frosten-muted">No folder loaded in Frosten Workspace.</p>
                <button
                  onClick={openFolder}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-frosten-cyan/20 border border-frosten-ice/40 hover:bg-frosten-cyan/30 hover:border-frosten-ice text-frosten-ice hover:text-white rounded text-xs font-medium cursor-pointer transition-all"
                >
                  <FolderOpen className="h-4 w-4" />
                  Open Folder
                </button>
              </div>
            )}
          </div>
          
        </div>
      )}

      {showFileTree && (
        <div
          onMouseDown={startResizeLeft}
          className="w-1 cursor-col-resize hover:bg-frosten-cyan/45 active:bg-frosten-cyan transition-all z-30 shrink-0 border-r border-frosten-border/30"
        />
      )}

      {/* CENTER WORKSPACE (Tabs, Editor, Terminal) */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative">
        
        {/* Monaco Editor Section */}
        <div className="flex-1 flex flex-col min-h-0 bg-[#0D1117] relative">
          
          <EditorTabs />

          <div className="flex-1 w-full relative">
            {activeTabDetails ? (
              <div className="h-full w-full relative">
                
                {/* Floating AI contextual actions bar */}
                {selectedText && (
                  <div className="absolute top-3 right-6 z-40 flex items-center gap-1.5 p-0.5 rounded-lg bg-[#090D14]/90 border border-frosten-ice/40 backdrop-blur shadow-lg animate-fade-in select-none">
                    <span className="text-[9px] text-frosten-ice font-mono px-2 select-none">AI Action:</span>
                    <button
                      onClick={() => handleAiAction('explain')}
                      className="px-2.5 py-1 bg-frosten-cyan/15 hover:bg-frosten-cyan/30 text-frosten-ice hover:text-white rounded text-[10px] font-semibold cursor-pointer transition-colors"
                    >
                      Explain
                    </button>
                    <button
                      onClick={() => handleAiAction('optimize')}
                      className="px-2.5 py-1 bg-frosten-cyan/15 hover:bg-frosten-cyan/30 text-frosten-ice hover:text-white rounded text-[10px] font-semibold cursor-pointer transition-colors"
                    >
                      Optimize
                    </button>
                    <button
                      onClick={() => handleAiAction('tests')}
                      className="px-2.5 py-1 bg-frosten-cyan/15 hover:bg-frosten-cyan/30 text-frosten-ice hover:text-white rounded text-[10px] font-semibold cursor-pointer transition-colors"
                    >
                      Add Tests
                    </button>
                  </div>
                )}

                {showDiff ? (
                  /* Monaco Diff Editor Component */
                  <DiffEditor
                    height="100%"
                    original={activeTabDetails.originalContent}
                    modified={activeTabDetails.content}
                    language={getLanguage(activeTabDetails.path)}
                    theme="vs-dark"
                    options={{
                      fontSize: editorFontSize,
                      fontFamily: 'JetBrains Mono, monospace',
                      minimap: { enabled: editorMinimap },
                      readOnly: true,
                      renderSideBySide: true,
                      automaticLayout: true
                    }}
                  />
                ) : (
                  /* Monaco Editor Component */
                  <MonacoEditor
                    height="100%"
                    language={getLanguage(activeTabDetails.path)}
                    theme="vs-dark"
                    value={activeTabDetails.content}
                    onChange={(val) => updateTabContent(activeTabDetails.path, val || '')}
                    onMount={handleEditorDidMount}
                    options={{
                      fontSize: editorFontSize,
                      fontFamily: 'JetBrains Mono, monospace',
                      minimap: { enabled: editorMinimap },
                      lineNumbers: 'on',
                      wordWrap: editorWordWrap,
                      scrollbar: {
                        verticalScrollbarSize: 6,
                        horizontalScrollbarSize: 6
                      },
                      automaticLayout: true
                    }}
                  />
                )}

                {/* Inline Assist Floating Panel */}
                {!showDiff && showInlineAssist && (
                  <InlineAssist 
                    editor={editorRef.current} 
                    onClose={() => setShowInlineAssist(false)} 
                  />
                )}

              </div>
            ) : (
              <div className="h-full w-full flex flex-col items-center justify-center text-frosten-muted gap-2 select-none">
                <span className="text-5xl">❄️</span>
                <h3 className="text-xs text-[#8B949E] mt-2">Welcome to Frosten IDE</h3>
                <p className="text-[11px] text-[#58A6FF]">Double click files in the tree to edit</p>
                <p className="text-[10px] text-slate-500 font-mono mt-4">Shortcut: Ctrl+K for inline refactoring</p>
              </div>
            )}
          </div>

        </div>

        {/* BOTTOM PANEL (PTY Terminal) */}
        {showTerminal && workspacePath && (
          <>
            <div
              onMouseDown={startResizeTerminal}
              className="h-1 cursor-row-resize hover:bg-frosten-cyan/45 active:bg-frosten-cyan transition-all z-30 shrink-0 border-t border-frosten-border/30"
            />
            <div style={{ height: `${terminalHeight}px` }} className="border-t border-frosten-border bg-frosten-bg shrink-0">
              <TerminalPanel />
            </div>
          </>
        )}

      </div>

      {showChat && (
        <div
          onMouseDown={startResizeRight}
          className="w-1 cursor-col-resize hover:bg-frosten-cyan/45 active:bg-frosten-cyan transition-all z-30 shrink-0 border-l border-frosten-border/30"
        />
      )}

      {/* RIGHT SIDEBAR (AI Assistant Chat) */}
      {showChat && (
        <div style={{ width: `${rightWidth}px` }} className="shrink-0 h-full">
          <AIChatSidebar />
        </div>
      )}

      {/* QUICK TOGGLE FLOATING TOOLBAR */}
      <div className="absolute bottom-4 left-4 z-40 flex items-center gap-1.5 p-1 rounded-lg bg-[#090D14]/80 border border-frosten-border backdrop-blur shadow-lg">
        <button
          onClick={() => setShowFileTree(!showFileTree)}
          className={`p-1.5 rounded transition-all cursor-pointer ${
            showFileTree 
              ? 'bg-frosten-cyan/20 border border-frosten-ice/40 text-frosten-ice' 
              : 'text-frosten-muted hover:text-frosten-white'
          }`}
          title="Toggle File Tree"
        >
          <FolderTree className="h-4 w-4" />
        </button>
        
        <button
          onClick={() => setShowTerminal(!showTerminal)}
          className={`p-1.5 rounded transition-all cursor-pointer ${
            showTerminal 
              ? 'bg-frosten-cyan/20 border border-frosten-ice/40 text-frosten-ice' 
              : 'text-frosten-muted hover:text-frosten-white'
          }`}
          title="Toggle Terminal"
          disabled={!workspacePath}
        >
          <TermIcon className="h-4 w-4" />
        </button>

        <button
          onClick={() => setShowChat(!showChat)}
          className={`p-1.5 rounded transition-all cursor-pointer ${
            showChat 
              ? 'bg-frosten-cyan/20 border border-frosten-ice/40 text-frosten-ice' 
              : 'text-frosten-muted hover:text-frosten-white'
          }`}
          title="Toggle AI Chat"
        >
          <MessageSquare className="h-4 w-4" />
        </button>

        {activeTabDetails && (
          <button
            onClick={() => setShowInlineAssist(!showInlineAssist)}
            className={`p-1.5 rounded transition-all cursor-pointer ${
              showInlineAssist 
                ? 'bg-frosten-cyan/20 border border-frosten-ice/40 text-frosten-ice' 
                : 'text-frosten-muted hover:text-frosten-white'
            }`}
            title="Inline Assist (Ctrl+K)"
          >
            <Sparkles className="h-4 w-4" />
          </button>
        )}

        {activeTabDetails && activeTabDetails.isDirty && (
          <button
            onClick={() => setShowDiff(!showDiff)}
            className={`p-1.5 rounded transition-all cursor-pointer ${
              showDiff 
                ? 'bg-amber-500/20 border border-amber-400/45 text-amber-405' 
                : 'text-frosten-muted hover:text-frosten-white'
            }`}
            title="Toggle File Diff Comparison"
          >
            <GitCompare className="h-4 w-4" />
          </button>
        )}

        {activeTabDetails && activeTabDetails.isDirty && (
          <button
            onClick={() => saveFile(activeTabDetails.path)}
            className="p-1.5 rounded text-emerald-400 hover:text-emerald-350 cursor-pointer animate-pulse"
            title="Save changes (Ctrl+S)"
          >
            <Save className="h-4 w-4" />
          </button>
        )}

        {activeTabDetails && (
          <div className="h-6 w-px bg-frosten-border/60 mx-1 select-none" />
        )}

        {activeTabDetails && (
          <>
            <button
              onClick={handleFormatActiveFile}
              className="p-1.5 rounded text-frosten-muted hover:text-frosten-white cursor-pointer transition-colors"
              title="Format Document (Alt+Shift+F)"
            >
              <Braces className="h-4 w-4" />
            </button>
            <button
              onClick={() => setEditorFontSize(prev => Math.max(9, prev - 1))}
              className="p-1.5 rounded text-frosten-muted hover:text-frosten-white cursor-pointer transition-colors"
              title="Decrease Font Size"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="text-[10px] font-mono font-semibold text-frosten-ice px-1 select-none">
              {editorFontSize}
            </span>
            <button
              onClick={() => setEditorFontSize(prev => Math.min(24, prev + 1))}
              className="p-1.5 rounded text-frosten-muted hover:text-frosten-white cursor-pointer transition-colors"
              title="Increase Font Size"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              onClick={() => setEditorWordWrap(prev => prev === 'on' ? 'off' : 'on')}
              className={`p-1.5 rounded transition-all cursor-pointer ${
                editorWordWrap === 'on' 
                  ? 'bg-frosten-cyan/20 text-frosten-ice border border-frosten-ice/20' 
                  : 'text-frosten-muted hover:text-frosten-white'
              }`}
              title="Toggle Word Wrap"
            >
              <WrapText className="h-4 w-4" />
            </button>
            <button
              onClick={() => setEditorMinimap(prev => !prev)}
              className={`p-1.5 rounded transition-all cursor-pointer ${
                editorMinimap 
                  ? 'bg-frosten-cyan/20 text-frosten-ice border border-frosten-ice/20' 
                  : 'text-frosten-muted hover:text-frosten-white'
              }`}
              title="Toggle Minimap"
            >
              <SquareDot className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

    </div>
  );
}
