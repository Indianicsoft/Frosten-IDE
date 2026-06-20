import React from 'react';
import { useSettingsStore } from '../store/settingsStore';
import { Loader2, CheckCircle2, XCircle, ShieldCheck, Save } from 'lucide-react';

export default function SettingsPanel({ onClose }) {
  const {
    settings,
    testingConnection,
    connectionStatus,
    connectionError,
    updateSetting,
    saveSettings,
    testConnection
  } = useSettingsStore();

  const handleSubmit = async (e) => {
    e.preventDefault();
    await saveSettings();
    if (onClose) onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5 text-sm">
      
      {/* Provider Name */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-frosten-ice tracking-wide uppercase">AI Provider Name</label>
        <input
          type="text"
          value={settings.providerName}
          onChange={(e) => updateSetting('providerName', e.target.value)}
          placeholder="e.g. OpenAI, Groq, Local Ollama"
          className="px-3 py-2 bg-[#161B22]/70 border border-frosten-border text-frosten-white rounded-md text-xs focus:border-frosten-ice focus:ring-1 focus:ring-frosten-ice/20 outline-none"
          required
        />
      </div>

      {/* Base URL */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-frosten-ice tracking-wide uppercase">Base URL</label>
        <input
          type="url"
          value={settings.baseURL}
          onChange={(e) => updateSetting('baseURL', e.target.value)}
          placeholder="https://api.openai.com/v1"
          className="px-3 py-2 bg-[#161B22]/70 border border-frosten-border text-frosten-white rounded-md text-xs focus:border-frosten-ice focus:ring-1 focus:ring-frosten-ice/20 outline-none"
          required
        />
      </div>

      {/* API Key */}
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between items-center">
          <label className="text-xs font-semibold text-frosten-ice tracking-wide uppercase">API Key</label>
          <span className="flex items-center gap-1 text-[10px] text-frosten-muted">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Securely Encrypted
          </span>
        </div>
        <input
          type="password"
          value={settings.apiKey}
          onChange={(e) => updateSetting('apiKey', e.target.value)}
          placeholder="sk-..."
          className="px-3 py-2 bg-[#161B22]/70 border border-frosten-border text-frosten-white rounded-md text-xs focus:border-frosten-ice focus:ring-1 focus:ring-frosten-ice/20 outline-none"
        />
      </div>

      {/* Model Name */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold text-frosten-ice tracking-wide uppercase">Model Name</label>
        <input
          type="text"
          value={settings.modelName}
          onChange={(e) => updateSetting('modelName', e.target.value)}
          placeholder="gpt-4o-mini"
          className="px-3 py-2 bg-[#161B22]/70 border border-frosten-border text-frosten-white rounded-md text-xs focus:border-frosten-ice focus:ring-1 focus:ring-frosten-ice/20 outline-none"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Max Tokens */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-frosten-ice tracking-wide uppercase">Max Output Tokens</label>
          <input
            type="number"
            value={settings.maxTokens}
            onChange={(e) => updateSetting('maxTokens', parseInt(e.target.value) || 4096)}
            className="px-3 py-2 bg-[#161B22]/70 border border-frosten-border text-frosten-white rounded-md text-xs focus:border-frosten-ice focus:ring-1 focus:ring-frosten-ice/20 outline-none"
            min="1"
            max="32768"
            required
          />
        </div>

        {/* Context Size */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-frosten-ice tracking-wide uppercase">Context Limit</label>
          <select
            value={settings.contextSize || 100000}
            onChange={(e) => updateSetting('contextSize', parseInt(e.target.value) || 100000)}
            className="px-3 py-2 bg-[#161B22]/70 border border-frosten-border text-frosten-white rounded-md text-xs focus:border-frosten-ice focus:ring-1 focus:ring-frosten-ice/20 outline-none"
          >
            <option value={16000}>16K Tokens</option>
            <option value={32000}>32K Tokens</option>
            <option value={100000}>100K Tokens (Default)</option>
            <option value={200000}>200K Tokens</option>
            <option value={500000}>500K Tokens</option>
          </select>
        </div>
      </div>

      {/* Temperature */}
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between items-center">
          <label className="text-xs font-semibold text-frosten-ice tracking-wide uppercase">Temperature</label>
          <span className="text-xs font-mono text-frosten-cyan">{settings.temperature}</span>
        </div>
        <div className="flex items-center h-8">
          <input
            type="range"
            min="0.0"
            max="1.0"
            step="0.1"
            value={settings.temperature}
            onChange={(e) => updateSetting('temperature', parseFloat(e.target.value))}
            className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-frosten-ice"
          />
        </div>
      </div>

      {/* Global System Prompt */}
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between items-center select-none">
          <label className="text-xs font-semibold text-frosten-ice tracking-wide uppercase">System Prompt (Global)</label>
          <select
            onChange={(e) => {
              if (e.target.value) {
                updateSetting('systemPrompt', e.target.value);
              }
            }}
            className="px-2 py-0.5 bg-[#161B22]/70 border border-frosten-border text-[#C9D1D9] hover:border-frosten-ice/40 rounded text-[10px] outline-none cursor-pointer font-mono"
            defaultValue=""
          >
            <option value="" disabled>Presets...</option>
            <option value="You are an autonomous AI software developer specialized in structural transformations, bug fixes, and writing complete files without raw code output.">Antigravity Coder</option>
            <option value="You are a professional security auditor. Focus on validating inputs, checking for injection vulnerabilities, memory safety, and refactoring code for robustness.">Security Audit</option>
            <option value="You are a modern frontend UI/UX expert. Craft beautifully styled, accessible, responsive components utilizing modern CSS variables, glassmorphism, and micro-animations.">Frontend Guru</option>
            <option value="You are an expert test-driven developer. Focus on creating comprehensive unit tests, checking boundary conditions, and verifying coverage.">TDD Wizard</option>
          </select>
        </div>
        <textarea
          rows={3}
          value={settings.systemPrompt}
          onChange={(e) => updateSetting('systemPrompt', e.target.value)}
          placeholder="You are an autonomous AI software developer..."
          className="px-3 py-2 bg-[#161B22]/70 border border-frosten-border text-frosten-white rounded-md text-xs focus:border-frosten-ice focus:ring-1 focus:ring-frosten-ice/20 outline-none resize-none"
        />
      </div>

      {/* Connection Indicator & Controls */}
      <div className="pt-3 border-t border-frosten-border flex items-center justify-between gap-4">
        
        {/* Connection Status indicator */}
        <div className="flex items-center gap-2 text-xs">
          <button
            type="button"
            onClick={testConnection}
            disabled={testingConnection}
            className="px-3 py-1.5 rounded bg-slate-800 border border-frosten-border hover:border-frosten-ice/40 hover:bg-slate-700/60 text-frosten-muted hover:text-frosten-white transition-all disabled:opacity-50 cursor-pointer"
          >
            {testingConnection ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-frosten-ice" />
                Testing...
              </span>
            ) : "Test Connection"}
          </button>

          {connectionStatus === 'success' && (
            <span className="flex items-center gap-1 text-emerald-400 font-medium font-ui">
              <CheckCircle2 className="h-4 w-4" /> Connected ✓
            </span>
          )}

          {connectionStatus === 'failed' && (
            <span className="flex items-center gap-1 text-rose-400 font-medium font-ui" title={connectionError}>
              <XCircle className="h-4 w-4" /> Failed ✗
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded text-xs text-frosten-muted hover:text-frosten-white hover:bg-slate-800/40 transition-all cursor-pointer"
          >
            Cancel
          </button>
          
          <button
            type="submit"
            className="flex items-center gap-1.5 px-4 py-2 bg-frosten-cyan/20 border border-frosten-ice/40 hover:bg-frosten-cyan/30 hover:border-frosten-ice text-frosten-ice hover:text-frosten-white rounded text-xs font-semibold glow-ice transition-all cursor-pointer"
          >
            <Save className="h-3.5 w-3.5" />
            Save & Close
          </button>
        </div>

      </div>

    </form>
  );
}
