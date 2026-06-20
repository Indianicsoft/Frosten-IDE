import { create } from 'zustand';

export const useWorkspaceStore = create((set, get) => ({
  workspacePath: '',
  fileTree: null,
  openTabs: [],    // { path, name, content, originalContent, isDirty }
  activeTab: '',
  terminalId: '',

  // ─── Open Folder via native dialog ───────────────────────────
  openFolder: async () => {
    try {
      if (!window.electronAPI) return;
      const result = await window.electronAPI.openFolder();
      if (result) {
        set({
          workspacePath: result.folderPath,
          fileTree: result.fileTree,
          openTabs: [],
          activeTab: ''
        });
        // Spawn terminal in workspace
        try {
          const termId = await window.electronAPI.createTerminal(result.folderPath);
          set({ terminalId: termId });
        } catch (termErr) {
          console.error('Failed to spawn terminal:', termErr);
        }
      }
    } catch (err) {
      console.error('Failed to open folder:', err);
    }
  },

  // ─── Refresh File Tree (no dialog) ───────────────────────────
  refreshFileTree: async () => {
    const { workspacePath } = get();
    if (!workspacePath || !window.electronAPI) return;
    try {
      const newTree = await window.electronAPI.getTree(workspacePath);
      if (newTree) set({ fileTree: newTree });
    } catch (err) {
      console.error('Failed to refresh file tree:', err);
    }
  },

  // ─── Open File in Tab ─────────────────────────────────────────
  openFile: async (filePath, name) => {
    try {
      const { openTabs } = get();
      // If already open, just switch to it
      const existing = openTabs.find(t => t.path === filePath);
      if (existing) {
        set({ activeTab: filePath });
        return;
      }
      if (!window.electronAPI) return;
      const content = await window.electronAPI.readFile(filePath);
      set({
        openTabs: [...openTabs, { path: filePath, name, content, originalContent: content, isDirty: false }],
        activeTab: filePath
      });
    } catch (err) {
      console.error('Failed to open file:', err);
    }
  },

  // ─── Refresh an open tab's content from disk ─────────────────
  refreshTab: async (filePath) => {
    const { openTabs } = get();
    const tab = openTabs.find(t => t.path === filePath);
    if (!tab || !window.electronAPI) return;
    try {
      const content = await window.electronAPI.readFile(filePath);
      set({
        openTabs: openTabs.map(t =>
          t.path === filePath
            ? { ...t, content, originalContent: content, isDirty: false }
            : t
        )
      });
    } catch (err) {
      console.error('Failed to refresh tab:', err);
    }
  },

  // ─── Close Tab ────────────────────────────────────────────────
  closeTab: (filePath) => {
    const { openTabs, activeTab } = get();
    const idx = openTabs.findIndex(t => t.path === filePath);
    if (idx === -1) return;
    const newTabs = openTabs.filter(t => t.path !== filePath);
    let newActive = activeTab;
    if (activeTab === filePath) {
      newActive = newTabs.length > 0 ? newTabs[Math.min(idx, newTabs.length - 1)].path : '';
    }
    set({ openTabs: newTabs, activeTab: newActive });
  },

  // ─── Switch Tab ───────────────────────────────────────────────
  selectTab: (filePath) => set({ activeTab: filePath }),

  // ─── Update In-Memory Content ─────────────────────────────────
  updateTabContent: (filePath, newContent) => {
    set((state) => ({
      openTabs: state.openTabs.map(tab =>
        tab.path === filePath
          ? { ...tab, content: newContent, isDirty: newContent !== tab.originalContent }
          : tab
      )
    }));
  },

  // ─── Save File to Disk ────────────────────────────────────────
  saveFile: async (filePath) => {
    try {
      const { openTabs } = get();
      const tab = openTabs.find(t => t.path === filePath);
      if (!tab || !window.electronAPI) return;
      await window.electronAPI.writeFile(filePath, tab.content);
      set((state) => ({
        openTabs: state.openTabs.map(t =>
          t.path === filePath ? { ...t, originalContent: t.content, isDirty: false } : t
        )
      }));
    } catch (err) {
      console.error('Failed to save file:', err);
    }
  },

  // ─── Save All Dirty Files ─────────────────────────────────────
  saveAll: async () => {
    const { openTabs, saveFile } = get();
    for (const tab of openTabs) {
      if (tab.isDirty) await saveFile(tab.path);
    }
  },

  // ─── Write content to a tab directly (used by AI edits) ──────
  applyExternalEdit: (filePath, newContent) => {
    const { openTabs } = get();
    const exists = openTabs.find(t => t.path === filePath);
    if (exists) {
      set({
        openTabs: openTabs.map(t =>
          t.path === filePath
            ? { ...t, content: newContent, originalContent: newContent, isDirty: false }
            : t
        )
      });
    }
  }
}));
