import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Bot, User, Send, Sparkles, Trash2, Code, 
  FileEdit, CheckCircle, XCircle, Loader2, RefreshCw, Cpu
} from 'lucide-react';
import { useSettingsStore } from '../store/settingsStore';
import { useWorkspaceStore } from '../store/workspaceStore';
import { useAgentStore } from '../store/agentStore';
import { streamChat } from '../lib/aiClient';

// Detect if a message is requesting a code/file edit
function detectEditIntent(msg) {
  const lower = msg.toLowerCase();
  const editKeywords = [
    'edit ', 'update ', 'modify ', 'change ', 'fix ', 'refactor ', 'add ',
    'remove ', 'delete ', 'implement ', 'write ', 'create ', 'insert ',
    'replace ', 'rewrite ', 'make ', 'generate ', 'improve ', 'optimize ',
    'convert ', 'rename ', 'move ', 'migrate ', 'add a ', 'add the '
  ];
  return editKeywords.some(k => lower.includes(k));
}

// Parse which file a message is referring to
function detectTargetFile(msg, activeTabPath) {
  // If the message mentions a specific filename pattern, use that
  const filePattern = /['"`]([^'"`]+\.[a-zA-Z]{1,10})['"`]/g;
  const matches = [...msg.matchAll(filePattern)];
  if (matches.length > 0) {
    return matches[0][1]; // Return the first mentioned file
  }
  // Fallback to active tab
  return activeTabPath || null;
}

export default function AIChatSidebar() {
  const [messages, setMessages] = useState([
    { 
      role: 'assistant', 
      content: "👋 I'm **Frosten Copilot** — your AI coding partner.\n\nI can:\n• **Edit files directly** — just say what to change\n• **Explain code** — ask about the active file\n• **Create new files** — describe what you need\n• **Debug errors** — paste the error and ask for a fix\n\nI work directly in your workspace files, not in this chat.",
      type: 'text'
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [editingStatus, setEditingStatus] = useState(null); // { file, status: 'editing'|'done'|'error', message }
  
  const settings = useSettingsStore((state) => state.settings);
  const { openTabs, activeTab, workspacePath, refreshFileTree, applyExternalEdit, refreshTab } = useWorkspaceStore();
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  const activeTabDetails = openTabs.find(t => t.path === activeTab);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // ─── Handle File Edit via AI ──────────────────────────────────
  const handleAIFileEdit = useCallback(async (userMessage, targetFilePath) => {
    if (!window.electronAPI || !settings.apiKey) return false;

    setEditingStatus({ file: targetFilePath, status: 'editing', message: 'AI is editing the file...' });

    const result = await window.electronAPI.editFile(
      settings,
      targetFilePath,
      userMessage,
      activeTabDetails?.path === targetFilePath ? activeTabDetails?.content : null,
      workspacePath
    );

    if (result.success) {
      applyExternalEdit(targetFilePath, result.newContent);
      await refreshTab(targetFilePath);
      await refreshFileTree();
      setEditingStatus({ file: targetFilePath, status: 'done', message: 'File edited successfully' });
      return true;
    } else {
      setEditingStatus({ file: targetFilePath, status: 'error', message: result.error });
      return false;
    }
  }, [settings, activeTabDetails, applyExternalEdit, refreshTab, refreshFileTree, workspacePath]);

  // ─── Main send handler ────────────────────────────────────────
  const sendMessage = useCallback(async (userMessage) => {
    if (!userMessage.trim() || isLoading) return;
    if (!settings.apiKey) {
      setMessages(prev => [...prev, 
        { role: 'user', content: userMessage, type: 'text' },
        { role: 'assistant', content: '⚠️ Please configure your AI API key in Settings (gear icon) first.', type: 'error' }
      ]);
      return;
    }

    setIsLoading(true);
    const newMessages = [...messages, { role: 'user', content: userMessage, type: 'text' }];
    setMessages(newMessages);

    const isEditRequest = detectEditIntent(userMessage);
    const targetFile = detectTargetFile(userMessage, activeTab);

    // If this is an edit request AND we have a target file, edit directly
    if (isEditRequest && targetFile && workspacePath) {
      let resolvedPath = targetFile;
      if (!targetFile.startsWith('/') && workspacePath) {
        resolvedPath = workspacePath + '/' + targetFile;
      }

      const fileShort = targetFile.split('/').pop();
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `✏️ Editing **${fileShort}** directly in your workspace...`,
        type: 'action',
        filePath: resolvedPath
      }]);

      try {
        const success = await handleAIFileEdit(userMessage, resolvedPath);
        if (success) {
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: 'assistant',
              content: `✅ Done! **${fileShort}** has been updated in your workspace.`,
              type: 'success',
              filePath: resolvedPath
            };
            return updated;
          });
        } else {
          setMessages(prev => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: 'assistant',
              content: `❌ Failed to edit ${fileShort}: ${editingStatus?.message || 'Unknown error'}.\n\nMake sure the file path is correct and try again.`,
              type: 'error'
            };
            return updated;
          });
        }
      } catch (err) {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: 'assistant',
            content: `❌ Error: ${err.message}`,
            type: 'error'
          };
          return updated;
        });
      }

      setIsLoading(false);
      setEditingStatus(null);
      return;
    }

    // Otherwise: regular chat (explanations, questions, etc.)
    let workspaceMap = '';
    if (workspacePath) {
      try {
        workspaceMap = await window.electronAPI.getWorkspaceContext(workspacePath, settings.contextSize || 100000);
      } catch (err) {
        console.error('Failed to load workspace context for chat:', err);
      }
    }

    const systemMessages = [
      {
        role: 'system',
        content: `You are Frosten Copilot, an expert AI coding assistant embedded in Frosten IDE.

CRITICAL RULES:
1. NEVER output raw code blocks in chat responses - direct file edits happen via the IDE's edit system
2. When answering questions, be concise and conversational
3. For code questions, briefly explain concepts without writing full code
4. If the user wants to edit a file, remind them you can edit workspace files directly — they just need to specify which file
5. Reference file names, line numbers, and concepts clearly
6. You have full context of the active file and complete workspace structure map below`
      }
    ];

    if (activeTabDetails) {
      systemMessages.push({
        role: 'system',
        content: `Active file: ${activeTabDetails.path}\nContent (first 3000 chars):\n${activeTabDetails.content.substring(0, 3000)}`
      });
    }

    if (workspaceMap) {
      systemMessages.push({
        role: 'system',
        content: `Complete Workspace Context Map:\n${workspaceMap}`
      });
    } else if (workspacePath) {
      systemMessages.push({
        role: 'system',
        content: `Workspace path: ${workspacePath}`
      });
    }

    // Build history for context
    const apiMessages = [
      ...systemMessages,
      ...newMessages.slice(-10).map(m => ({ role: m.role, content: m.content }))
    ];

    // Add empty streaming message
    setMessages(prev => [...prev, { role: 'assistant', content: '', type: 'text' }]);

    try {
      let accumulated = '';
      await streamChat(settings, apiMessages, (chunk) => {
        accumulated += chunk;
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: accumulated, type: 'text' };
          return updated;
        });
      });
    } catch (err) {
      console.error('Chat streaming failure:', err);
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = {
          role: 'assistant',
          content: `⚠️ Connection error: ${err.message}\n\nCheck your API key and base URL in Settings.`,
          type: 'error'
        };
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  }, [messages, isLoading, settings, activeTab, activeTabDetails, workspacePath, handleAIFileEdit, editingStatus]);

  const addMission = useAgentStore((state) => state.addMission);

  const handleDeployAgent = async (e) => {
    e.preventDefault();
    if (!input.trim() || !workspacePath || isLoading) return;

    if (!settings.apiKey) {
      alert("Please configure your AI Provider settings (API Key) before running agent missions.");
      return;
    }

    const promptText = input.trim();
    setInput('');
    setIsLoading(true);

    try {
      await addMission(promptText, workspacePath, settings);
      // Switch view to manager
      window.dispatchEvent(new CustomEvent('app:switch-view', { detail: { view: 'manager' } }));
    } catch (err) {
      console.error('Failed to deploy agent from chat sidebar:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const msg = input.trim();
    setInput('');
    sendMessage(msg);
  };

  // Listen for external prompt events (from editor selection actions)
  useEffect(() => {
    const handlePromptEvent = (e) => {
      if (e.detail?.promptText) {
        sendMessage(e.detail.promptText);
      }
    };
    window.addEventListener('ai:prompt', handlePromptEvent);
    return () => window.removeEventListener('ai:prompt', handlePromptEvent);
  }, [sendMessage]);

  const clearChat = () => {
    setMessages([{
      role: 'assistant',
      content: "Chat cleared! I'm ready to help. Tell me what you'd like to build or fix.",
      type: 'text'
    }]);
    setEditingStatus(null);
  };

  // ─── Message Bubble Renderer ──────────────────────────────────
  const renderMessageContent = (msg) => {
    const isBot = msg.role === 'assistant';
    
    if (!msg.content) {
      // Typing indicator
      return (
        <div className="flex items-center gap-1 h-4 py-1">
          <span className="h-1.5 w-1.5 bg-frosten-ice rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="h-1.5 w-1.5 bg-frosten-ice rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="h-1.5 w-1.5 bg-frosten-ice rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      );
    }

    // Format markdown-like bold and inline code
    const formatted = msg.content
      .replace(/\*\*(.*?)\*\*/g, '<strong class="text-frosten-ice font-semibold">$1</strong>')
      .replace(/`([^`]+)`/g, '<code class="bg-slate-800 text-emerald-400 px-1 rounded text-[10px] font-mono">$1</code>');

    return (
      <div 
        className="whitespace-pre-wrap font-sans leading-relaxed"
        dangerouslySetInnerHTML={{ __html: formatted }}
      />
    );
  };

  const getMessageStyle = (msg) => {
    const isBot = msg.role === 'assistant';
    if (!isBot) return 'bg-frosten-cyan/20 border border-frosten-ice/30 text-frosten-white';
    
    switch (msg.type) {
      case 'success': return 'bg-emerald-950/40 border border-emerald-500/30 text-emerald-300';
      case 'error': return 'bg-rose-950/40 border border-rose-500/30 text-rose-300';
      case 'action': return 'bg-amber-950/30 border border-amber-500/25 text-amber-300';
      default: return 'bg-slate-800/40 border border-frosten-border text-[#C9D1D9]';
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#0D1117] border-l border-frosten-border/80">
      
      {/* Header */}
      <div className="h-11 flex justify-between items-center px-4 bg-[#090D14] border-b border-frosten-border select-none shrink-0">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Sparkles className="h-4 w-4 text-frosten-ice" />
            {isLoading && (
              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 bg-emerald-400 rounded-full animate-pulse" />
            )}
          </div>
          <span className="text-xs font-semibold font-ui text-frosten-white">Frosten Copilot</span>
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-frosten-ice/10 border border-frosten-ice/20 text-frosten-ice font-mono">
            DIRECT EDIT
          </span>
        </div>
        
        <button
          onClick={clearChat}
          className="p-1 rounded hover:bg-slate-800/60 text-frosten-muted hover:text-rose-400 transition-colors cursor-pointer"
          title="Clear Conversation"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Active File Context Bar */}
      {activeTabDetails && (
        <div className="px-4 py-1.5 bg-frosten-cyan/5 border-b border-frosten-border flex items-center gap-1.5 text-[10px] text-frosten-cyan font-mono select-none shrink-0">
          <Code className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Context: {activeTabDetails.name}</span>
          <span className="ml-auto text-[9px] text-frosten-muted">will edit this file</span>
        </div>
      )}

      {/* Editing Status Banner */}
      {editingStatus && (
        <div className={`px-4 py-2 border-b flex items-center gap-2 text-[10px] shrink-0 ${
          editingStatus.status === 'editing' 
            ? 'bg-amber-950/30 border-amber-500/25 text-amber-300'
            : editingStatus.status === 'done'
            ? 'bg-emerald-950/30 border-emerald-500/25 text-emerald-300'
            : 'bg-rose-950/30 border-rose-500/25 text-rose-300'
        }`}>
          {editingStatus.status === 'editing' && <Loader2 className="h-3 w-3 animate-spin shrink-0" />}
          {editingStatus.status === 'done' && <CheckCircle className="h-3 w-3 shrink-0" />}
          {editingStatus.status === 'error' && <XCircle className="h-3 w-3 shrink-0" />}
          <span className="truncate">{editingStatus.message}</span>
        </div>
      )}

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollable">
        {messages.map((msg, i) => {
          const isBot = msg.role === 'assistant';
          return (
            <div key={i} className={`flex gap-2.5 ${isBot ? 'justify-start animate-fade-in' : 'justify-end'}`}>
              
              {/* Bot Avatar */}
              {isBot && (
                <div className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${
                  msg.type === 'success' ? 'bg-emerald-900/40 border border-emerald-500/30' :
                  msg.type === 'error' ? 'bg-rose-900/40 border border-rose-500/30' :
                  msg.type === 'action' ? 'bg-amber-900/30 border border-amber-500/25' :
                  'bg-frosten-cyan/15 border border-frosten-ice/25'
                }`}>
                  {msg.type === 'success' ? <CheckCircle className="h-3.5 w-3.5 text-emerald-400" /> :
                   msg.type === 'error' ? <XCircle className="h-3.5 w-3.5 text-rose-400" /> :
                   msg.type === 'action' ? <FileEdit className="h-3.5 w-3.5 text-amber-400" /> :
                   <Bot className="h-4 w-4 text-frosten-ice" />}
                </div>
              )}

              {/* Bubble */}
              <div className={`max-w-[85%] px-3.5 py-2.5 rounded-lg text-xs ${getMessageStyle(msg)}`}>
                {renderMessageContent(msg)}
              </div>

              {/* User Avatar */}
              {!isBot && (
                <div className="h-7 w-7 rounded-lg bg-slate-800/70 border border-frosten-border/80 flex items-center justify-center shrink-0">
                  <User className="h-4 w-4 text-frosten-muted" />
                </div>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Action Chips */}
      {!isLoading && activeTabDetails && (
        <div className="px-3 pb-2 flex gap-1.5 flex-wrap shrink-0">
          {[
            { label: '🔍 Explain this file', prompt: `Explain what ${activeTabDetails.name} does` },
            { label: '🐛 Fix bugs', prompt: `Fix any bugs or issues in ${activeTabDetails.name}` },
            { label: '⚡ Optimize', prompt: `Optimize the performance and readability of ${activeTabDetails.name}` },
            { label: '📝 Add comments', prompt: `Add comprehensive JSDoc/inline comments to ${activeTabDetails.name}` },
          ].map(chip => (
            <button
              key={chip.label}
              onClick={() => sendMessage(chip.prompt)}
              className="text-[9px] px-2 py-1 rounded bg-slate-800/60 border border-frosten-border hover:border-frosten-ice/40 hover:bg-slate-700/60 text-frosten-muted hover:text-frosten-white transition-all cursor-pointer"
            >
              {chip.label}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSend} className="p-3 border-t border-frosten-border bg-[#090D14] flex gap-2 shrink-0">
        {workspacePath && (
          <button
            type="button"
            onClick={handleDeployAgent}
            className="p-2.5 bg-slate-800/60 border border-frosten-border hover:border-frosten-ice hover:text-frosten-ice text-frosten-muted rounded-md transition-all cursor-pointer disabled:opacity-50 self-end shrink-0"
            disabled={isLoading || !input.trim()}
            title="Deploy as Autonomous Agent Mission (Creates Plan & Spawns Sub-agents)"
          >
            <Cpu className="h-4 w-4" />
          </button>
        )}
        <div className="flex-1 relative">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              // Auto-resize
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend(e);
              }
            }}
            placeholder={activeTabDetails 
              ? `Edit ${activeTabDetails.name} or ask anything... (Shift+Enter for newline)` 
              : 'Ask Frosten Copilot... (Shift+Enter for newline)'
            }
            className="w-full px-3 py-2 bg-frosten-bg border border-frosten-border text-xs rounded-md text-frosten-white placeholder-frosten-muted focus:border-frosten-ice outline-none resize-none min-h-[36px] max-h-[120px] scrollable"
            disabled={isLoading}
            rows={1}
          />
        </div>
        <button
          type="submit"
          className="p-2.5 bg-frosten-cyan/20 border border-frosten-ice/40 hover:bg-frosten-cyan/35 hover:border-frosten-ice text-frosten-ice rounded-md transition-all cursor-pointer disabled:opacity-50 self-end shrink-0"
          disabled={isLoading || !input.trim()}
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>

    </div>
  );
}
