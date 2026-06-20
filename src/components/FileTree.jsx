import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useWorkspaceStore } from '../store/workspaceStore';
import { 
  Folder, FolderOpen, File, FileCode, FileJson, 
  FileText, FileImage, FileCode2, ChevronRight, ChevronDown,
  FilePlus, FolderPlus, Trash2, RefreshCw
} from 'lucide-react';

// Context Menu component
function ContextMenu({ x, y, onClose, items }) {
  const ref = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-50 min-w-[160px] rounded-lg bg-[#161B22] border border-frosten-border shadow-xl animate-fade-in py-1"
      style={{ top: y, left: x }}
    >
      {items.map((item, i) =>
        item.divider ? (
          <div key={i} className="h-px bg-frosten-border/50 my-1" />
        ) : (
          <button
            key={i}
            onClick={() => { item.onClick(); onClose(); }}
            className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors cursor-pointer ${
              item.danger 
                ? 'text-rose-400 hover:bg-rose-900/30' 
                : 'text-[#C9D1D9] hover:bg-slate-800/60 hover:text-frosten-white'
            }`}
          >
            {item.icon && <item.icon className="h-3.5 w-3.5 shrink-0" />}
            {item.label}
          </button>
        )
      )}
    </div>
  );
}

export default function FileTree() {
  const { fileTree, workspacePath, openFile, refreshFileTree } = useWorkspaceStore();
  const [expanded, setExpanded] = useState({ '.': true });
  const [contextMenu, setContextMenu] = useState(null);
  const [renaming, setRenaming] = useState(null);
  const [newItemInput, setNewItemInput] = useState({ parent: null, type: null, value: '' });

  const getFileIcon = (name, isDirectory, isExpanded) => {
    if (isDirectory) {
      return isExpanded
        ? <FolderOpen className="h-3.5 w-3.5 text-[#F5C042]" />
        : <Folder className="h-3.5 w-3.5 text-[#F5C042]" />;
    }
    const ext = name.split('.').pop().toLowerCase();
    switch (ext) {
      case 'js': case 'jsx': return <FileCode className="h-3.5 w-3.5 text-[#F7DF1E]" />;
      case 'ts': case 'tsx': return <FileCode2 className="h-3.5 w-3.5 text-[#3178C6]" />;
      case 'json': case 'lock': return <FileJson className="h-3.5 w-3.5 text-[#8BA4F9]" />;
      case 'css': case 'scss': case 'less': return <FileCode className="h-3.5 w-3.5 text-[#38BDF8]" />;
      case 'html': return <FileCode className="h-3.5 w-3.5 text-[#E34F26]" />;
      case 'md': case 'mdx': return <FileText className="h-3.5 w-3.5 text-[#A78BFA]" />;
      case 'png': case 'jpg': case 'jpeg': case 'svg': case 'ico': case 'gif':
        return <FileImage className="h-3.5 w-3.5 text-[#34D399]" />;
      case 'py': return <FileCode className="h-3.5 w-3.5 text-[#3776AB]" />;
      case 'rs': return <FileCode className="h-3.5 w-3.5 text-[#CE422B]" />;
      case 'go': return <FileCode className="h-3.5 w-3.5 text-[#00ACD7]" />;
      case 'sh': case 'bash': return <FileCode className="h-3.5 w-3.5 text-[#34D399]" />;
      default: return <File className="h-3.5 w-3.5 text-[#94A3B8]" />;
    }
  };

  const toggleExpand = (nodePath) => {
    setExpanded(prev => ({ ...prev, [nodePath]: !prev[nodePath] }));
  };

  const handleContextMenu = (e, node, fullPath) => {
    e.preventDefault();
    e.stopPropagation();
    const items = node.isDirectory
      ? [
          { label: 'New File', icon: FilePlus, onClick: () => startNewItem(fullPath, 'file') },
          { label: 'New Folder', icon: FolderPlus, onClick: () => startNewItem(fullPath, 'folder') },
          { divider: true },
          { label: 'Refresh Tree', icon: RefreshCw, onClick: () => refreshFileTree() },
          { divider: true },
          { label: 'Delete Folder', icon: Trash2, danger: true, onClick: () => deleteItem(fullPath) },
        ]
      : [
          { label: 'Delete File', icon: Trash2, danger: true, onClick: () => deleteItem(fullPath) },
        ];

    setContextMenu({ x: e.clientX, y: e.clientY, items });
  };

  const startNewItem = (parentDir, type) => {
    setNewItemInput({ parent: parentDir, type, value: '' });
    // Auto-expand parent
    const rel = parentDir.replace(workspacePath + '/', '').replace(workspacePath, '') || '.';
    setExpanded(prev => ({ ...prev, [rel]: true }));
  };

  const commitNewItem = async () => {
    const { parent, type, value } = newItemInput;
    if (!value.trim() || !window.electronAPI) {
      setNewItemInput({ parent: null, type: null, value: '' });
      return;
    }
    const newPath = parent + '/' + value.trim();
    try {
      if (type === 'file') {
        await window.electronAPI.createFile(newPath, '');
        await refreshFileTree();
        openFile(newPath, value.trim());
      } else {
        await window.electronAPI.createFolder(newPath);
        await refreshFileTree();
      }
    } catch (err) {
      console.error('Failed to create item:', err);
    }
    setNewItemInput({ parent: null, type: null, value: '' });
  };

  const deleteItem = async (fullPath) => {
    if (!window.electronAPI) return;
    const name = fullPath.split('/').pop();
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await window.electronAPI.deleteFile(fullPath);
      await refreshFileTree();
    } catch (err) {
      console.error('Failed to delete:', err);
    }
  };

  const renderNewItemInput = (parentDir) => {
    if (newItemInput.parent !== parentDir) return null;
    return (
      <div className="flex items-center gap-1 px-3 py-1 pl-[21px]">
        {newItemInput.type === 'file' 
          ? <File className="h-3.5 w-3.5 text-frosten-ice shrink-0" />
          : <Folder className="h-3.5 w-3.5 text-[#F5C042] shrink-0" />
        }
        <input
          autoFocus
          value={newItemInput.value}
          onChange={e => setNewItemInput(prev => ({ ...prev, value: e.target.value }))}
          onKeyDown={e => {
            if (e.key === 'Enter') commitNewItem();
            if (e.key === 'Escape') setNewItemInput({ parent: null, type: null, value: '' });
          }}
          onBlur={commitNewItem}
          className="flex-1 bg-slate-800/70 border border-frosten-ice/40 text-frosten-white text-xs rounded px-1 py-0.5 outline-none"
          placeholder={`New ${newItemInput.type}...`}
        />
      </div>
    );
  };

  const renderNode = (node, depth = 0) => {
    const isDir = node.isDirectory;
    const pathKey = node.path;
    const isExpanded = !!expanded[pathKey];
    const fullPath = workspacePath + '/' + node.path;

    if (isDir) {
      return (
        <div key={pathKey}>
          <div
            onClick={() => toggleExpand(pathKey)}
            onContextMenu={(e) => handleContextMenu(e, node, fullPath)}
            className="flex items-center gap-1.5 px-3 py-1 hover:bg-slate-800/40 rounded cursor-pointer transition-colors text-xs text-[#C9D1D9] font-medium group"
          >
            <span className="text-frosten-muted w-3 shrink-0">
              {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            </span>
            {getFileIcon(node.name, true, isExpanded)}
            <span className="truncate flex-1">{node.name}</span>
          </div>

          {isExpanded && node.children && (
            <div className="pl-4 border-l border-frosten-border/30 ml-4 mt-0.5 space-y-0.5">
              {node.children.map(child => renderNode(child, depth + 1))}
              {renderNewItemInput(fullPath)}
            </div>
          )}
        </div>
      );
    } else {
      return (
        <div
          key={pathKey}
          onClick={() => openFile(fullPath, node.name)}
          onContextMenu={(e) => handleContextMenu(e, node, fullPath)}
          className="flex items-center gap-1.5 px-3 py-1 pl-[21px] hover:bg-slate-800/50 rounded cursor-pointer transition-colors text-xs text-[#8B949E] hover:text-frosten-white group"
        >
          {getFileIcon(node.name, false)}
          <span className="truncate">{node.name}</span>
        </div>
      );
    }
  };

  if (!fileTree) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center text-xs text-frosten-muted font-ui">
        <p>No workspace folder open.</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto py-2 font-mono scrollable" onClick={() => setContextMenu(null)}>
      {/* Root level new file input */}
      {renderNewItemInput(workspacePath)}
      {fileTree.children && fileTree.children.map(child => renderNode(child))}
      
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
