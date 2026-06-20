const fs = require('fs');
const path = require('path');

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  '.frosten',
  'dist',
  'release',
  '.next',
  '__pycache__',
  '.cache',
  '.vscode',
  '.idea',
  'build',
  'out'
]);

const TEXT_EXTENSIONS = new Set([
  '.js', '.jsx', '.ts', '.tsx', '.json', '.html', '.css',
  '.md', '.py', '.go', '.rs', '.java', '.cpp', '.h', '.c',
  '.sh', '.yaml', '.yml', '.toml', '.xml', '.txt'
]);

function isTextFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return TEXT_EXTENSIONS.has(ext);
}

/**
 * Traverses directory recursively to build a context map of files.
 * @param {string} dirPath - Directory to scan
 * @param {string} rootPath - Workspace root path
 * @param {object} state - Accumulator object
 */
function traverse(dirPath, rootPath, state) {
  try {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const fullPath = path.join(dirPath, file);
      const relPath = path.relative(rootPath, fullPath);
      let stats;
      try {
        stats = fs.statSync(fullPath);
      } catch (e) {
        continue; // Skip inaccessible files
      }

      if (stats.isDirectory()) {
        if (IGNORE_DIRS.has(file)) {
          state.structure.push(`[DIR] ${relPath}/ (ignored)`);
          continue;
        }
        state.structure.push(`[DIR] ${relPath}/`);
        traverse(fullPath, rootPath, state);
      } else {
        state.structure.push(`[FILE] ${relPath} (${stats.size} bytes)`);
        
        if (isTextFile(fullPath)) {
          try {
            // Read content (up to 8KB per file to avoid overflowing token limit)
            const maxFileRead = 8192;
            let content = '';
            
            if (stats.size > maxFileRead) {
              const fd = fs.openSync(fullPath, 'r');
              const buffer = Buffer.alloc(maxFileRead);
              fs.readSync(fd, buffer, 0, maxFileRead, 0);
              fs.closeSync(fd);
              content = buffer.toString('utf8') + '\n... [TRUNCATED - FILE IS LARGE] ...';
            } else {
              content = fs.readFileSync(fullPath, 'utf8');
            }
            
            state.files.push({
              path: relPath,
              size: stats.size,
              content: content
            });
          } catch (readErr) {
            // Skip failed reads
          }
        }
      }
    }
  } catch (err) {
    console.error(`Error traversing ${dirPath}:`, err.message);
  }
}

/**
 * Builds a structured text map of the workspace for AI context window consumption.
 * @param {string} workspacePath - Root directory of the workspace
 * @param {number} maxTotalChars - Character limit to enforce context size (defaults to ~80k tokens)
 * @returns {string}
 */
function getWorkspaceContextMap(workspacePath, maxTotalChars = 320000) {
  if (!workspacePath || !fs.existsSync(workspacePath)) {
    return 'No active workspace directory loaded.';
  }

  const state = {
    structure: [],
    files: []
  };

  traverse(workspacePath, workspacePath, state);

  let output = '=== WORKSPACE FILE TREE STRUCTURE ===\n';
  output += state.structure.join('\n') + '\n\n';
  output += '=== WORKSPACE FILE CONTENTS ===\n';

  // Append file contents while keeping under character budget
  for (const file of state.files) {
    const fileHeader = `\n--- File: ${file.path} (${file.size} bytes) ---\n`;
    if (output.length + fileHeader.length + file.content.length > maxTotalChars) {
      output += fileHeader;
      // Add as much of the file as possible
      const remainingBudget = maxTotalChars - output.length - 50;
      if (remainingBudget > 100) {
        output += file.content.substring(0, remainingBudget) + '\n... [TRUNCATED DUE TO TOTAL CONTEXT BUDGET LIMIT] ...\n';
      } else {
        output += '... [OMITTED DUE TO TOTAL CONTEXT BUDGET LIMIT] ...\n';
      }
      break;
    }
    output += fileHeader + file.content + '\n';
  }

  return output;
}

module.exports = {
  getWorkspaceContextMap
};
