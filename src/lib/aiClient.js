/**
 * AI Client - All AI calls route through Electron's main process via IPC.
 * This avoids all CORS issues and keeps API keys secure in the main process.
 */

/**
 * Stream a chat response via the main process IPC bridge.
 * @param {object} settings - AI provider settings (apiKey, baseURL, modelName, etc.)
 * @param {Array} messages - OpenAI-format message array
 * @param {function} onChunk - callback(string) for each streamed token
 * @returns {Promise<void>}
 */
export async function streamChat(settings, messages, onChunk) {
  if (!window.electronAPI) {
    throw new Error('Electron API not available. Please run in Electron.');
  }

  const streamId = `stream_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  return new Promise((resolve, reject) => {
    const unsubChunk = window.electronAPI.onChatStreamChunk(streamId, (chunk) => {
      onChunk(chunk);
    });
    const unsubEnd = window.electronAPI.onChatStreamEnd(streamId, () => {
      cleanup();
      resolve();
    });
    const unsubError = window.electronAPI.onChatStreamError(streamId, (err) => {
      cleanup();
      reject(new Error(err));
    });

    function cleanup() {
      unsubChunk();
      unsubEnd();
      unsubError();
    }

    window.electronAPI.streamChat(settings, messages, streamId).catch(err => {
      cleanup();
      reject(err);
    });
  });
}

/**
 * Ask AI to edit a file directly. The AI response is written to the file by the main process.
 * @param {object} settings - AI settings
 * @param {string} filePath - Absolute path to the file to edit
 * @param {string} instruction - What to do to the file
 * @param {string} [currentContent] - Optional current file content (will be read from disk if not provided)
 * @returns {Promise<{success: boolean, newContent?: string, error?: string}>}
 */
export async function editFileWithAI(settings, filePath, instruction, currentContent, workspacePath) {
  if (!window.electronAPI) {
    throw new Error('Electron API not available.');
  }
  return window.electronAPI.editFile(settings, filePath, instruction, currentContent || null, workspacePath);
}

/**
 * Ask AI to transform a code snippet. Returns the transformed code without saving.
 * @param {object} settings - AI settings
 * @param {string} code - The code to transform
 * @param {string} instruction - Transformation instruction
 * @param {string} [language] - Programming language hint
 * @returns {Promise<{success: boolean, code?: string, error?: string}>}
 */
export async function transformCodeWithAI(settings, code, instruction, language) {
  if (!window.electronAPI) {
    throw new Error('Electron API not available.');
  }
  return window.electronAPI.transformCode(settings, code, instruction, language);
}
