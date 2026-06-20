import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Check, X, Loader2 } from 'lucide-react';
import { useSettingsStore } from '../store/settingsStore';
import { streamChat } from '../lib/aiClient';

export default function InlineAssist({ editor, onClose }) {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [suggestedCode, setSuggestedCode] = useState('');
  const [selectionRange, setSelectionRange] = useState(null);
  const [originalText, setOriginalText] = useState('');
  
  const settings = useSettingsStore((state) => state.settings);
  const inputRef = useRef(null);

  // Focus input when mounted
  useEffect(() => {
    inputRef.current?.focus();
    
    // Capture current selection from Monaco editor
    if (editor) {
      const selection = editor.getSelection();
      const model = editor.getModel();
      if (selection && model) {
        const text = model.getValueInRange(selection);
        if (text && text.trim().length > 0) {
          setOriginalText(text);
          setSelectionRange(selection);
        } else {
          // No selection, capture entire file
          setOriginalText(model.getValue());
          setSelectionRange(null);
        }
      }
    }
  }, [editor]);

  // Listen for programmatic populate events
  useEffect(() => {
    const handlePopulate = (e) => {
      if (e.detail && e.detail.instruction) {
        setPrompt(e.detail.instruction);
      }
    };
    window.addEventListener('ai:inline-assist-populate', handlePopulate);
    return () => window.removeEventListener('ai:inline-assist-populate', handlePopulate);
  }, []);

  const handleGenerate = async (e) => {
    e.preventDefault();
    if (!prompt.trim() || isGenerating || !editor) return;

    setIsGenerating(true);
    setSuggestedCode('');

    const systemPrompt = `You are a professional code refactoring tool. Given a block of code and a refactoring instruction, modify the code accordingly.
Return ONLY the complete, updated code. Do NOT wrap it in markdown code blocks, do not explain anything, and do not prefix or suffix your response with text. Your entire response must be direct code.`;

    const userPrompt = `Instruction: ${prompt}\n\nExisting Code:\n---\n${originalText}\n---`;

    const apiMessages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    try {
      let accumulated = '';
      await streamChat(settings, apiMessages, (chunk) => {
        accumulated += chunk;
        setSuggestedCode(accumulated);
      });
    } catch (err) {
      console.error("Inline assist refactoring failed:", err);
      setSuggestedCode(`// Error: ${err.message || 'Failed to stream suggestion.'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleAccept = () => {
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;

    let cleanCode = suggestedCode;
    // Strip accidental code block wrap
    if (cleanCode.trim().startsWith('```')) {
      cleanCode = cleanCode.trim().replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '');
    }

    if (selectionRange) {
      // Replace the specific selection
      editor.executeEdits('inline-assist', [{
        range: selectionRange,
        text: cleanCode,
        forceMoveMarkers: true
      }]);
    } else {
      // Replace entire file contents
      model.setValue(cleanCode);
    }

    onClose();
  };

  const handleDiscard = () => {
    onClose();
  };

  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 w-[520px] rounded-lg border border-frosten-borderActive glass-panel glow-ice-lg z-30 p-4 flex flex-col gap-3 animate-fade-in">
      
      {/* Title */}
      <div className="flex items-center gap-1.5 text-xs font-semibold text-frosten-ice select-none">
        <Sparkles className="h-4 w-4 animate-pulse" />
        <span>AI Inline Assist</span>
        {selectionRange ? (
          <span className="text-[10px] text-frosten-muted bg-slate-800/40 border border-frosten-border px-1.5 py-0.5 rounded ml-2">Selected Code</span>
        ) : (
          <span className="text-[10px] text-frosten-muted bg-slate-800/40 border border-frosten-border px-1.5 py-0.5 rounded ml-2">Entire File</span>
        )}
      </div>

      {/* Suggestion comparison preview (if code exists) */}
      {suggestedCode && (
        <div className="max-h-[160px] overflow-y-auto rounded bg-[#090D14]/90 border border-frosten-border p-2 font-mono text-[10px] text-[#C9D1D9] whitespace-pre-wrap leading-relaxed scroller scrollable">
          {suggestedCode.trim().startsWith('// Error') ? (
            <span className="text-rose-400">{suggestedCode}</span>
          ) : (
            suggestedCode
          )}
        </div>
      )}

      {/* Input or Controls */}
      {!suggestedCode ? (
        <form onSubmit={handleGenerate} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe changes (e.g. 'wrap this in try-catch', 'optimize nested loops')..."
            className="flex-1 px-3 py-1.5 bg-[#161B22]/70 border border-frosten-border text-xs rounded-md text-frosten-white placeholder-frosten-muted outline-none focus:border-frosten-ice"
            disabled={isGenerating}
            required
          />
          <button
            type="submit"
            className="px-3 py-1.5 bg-frosten-cyan/20 border border-frosten-ice/40 hover:bg-frosten-cyan/35 hover:border-frosten-ice text-frosten-ice rounded-md text-xs font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50"
            disabled={isGenerating || !prompt.trim()}
          >
            {isGenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : "Generate"}
          </button>
        </form>
      ) : (
        <div className="flex justify-between items-center bg-[#090D14]/40 p-1.5 border border-frosten-border/50 rounded-md">
          <span className="text-[10px] text-frosten-muted select-none">Review Suggestion:</span>
          
          <div className="flex gap-2">
            <button
              onClick={handleDiscard}
              className="flex items-center gap-1 px-3 py-1 bg-slate-800 border border-frosten-border hover:bg-slate-700/60 text-frosten-muted hover:text-frosten-white rounded text-[11px] cursor-pointer"
            >
              <X className="h-3.5 w-3.5" /> Discard
            </button>
            
            <button
              onClick={handleAccept}
              className="flex items-center gap-1 px-3 py-1 bg-emerald-500/10 border border-emerald-500/35 hover:bg-emerald-500/20 text-emerald-400 hover:text-white rounded text-[11px] cursor-pointer font-semibold glow-ice"
            >
              <Check className="h-3.5 w-3.5" /> Accept Changes
            </button>
          </div>
        </div>
      )}

      {/* Floating Panel Close Shortcut info */}
      <div className="flex justify-between items-center text-[10px] text-frosten-muted select-none">
        <span>Press ESC to close</span>
      </div>

    </div>
  );
}
