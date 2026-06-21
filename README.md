# ❄️ Frosten IDE ( Community Version )

> An open-source AI Agentic IDE — connect any OpenAI-compatible AI provider, open any folder as a workspace, and run autonomous agent missions.

![Frosten IDE Banner](frosten-ide-banner.png)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-blue)](https://github.com/indianicsoft/frosten-ide/releases)
[![Stars](https://img.shields.io/github/stars/indianicsoft/frosten-ide?style=social)](https://github.com/indianicsoft/frosten-ide)
[![Issues](https://img.shields.io/github/issues/indianicsoft/frosten-ide)](https://github.com/indianicsoft/frosten-ide/issues)

---

## ✨ Features 

- 🗂️ **Open Any Folder** as a workspace with full recursive file tree
- ✏️ **Monaco Editor** (VS Code-quality) with syntax highlighting for all languages
- 🤖 **AI Agent Missions** — give a task, agent plans → acts → verifies → produces Artifact
- 🔌 **Any OpenAI-Compatible Provider** — OpenAI, Groq, Together AI, OpenRouter, Ollama, Mistral, custom URLs
- ⚙️ **Runtime AI Settings** — switch model/provider/API key without rebuilding
- 💬 **AI Chat Sidebar** — context-aware chat about your open file or selected code
- ✨ **Inline AI Assist** — Ctrl+K to get AI-powered code edits
- 🖥️ **Real Terminal** — fully interactive shell powered by node-pty + xterm.js
- 📦 **Artifact System** — every agent mission generates a structured deliverable card
- 🎨 **Frosten Theme** — ice-blue glassmorphism dark UI

---

## 🚀 Getting Started

### Prerequisites
- Node.js >= 18
- npm >= 9

### Installation

```bash
git clone https://github.com/indianicsoft/frosten-ide.git
cd frosten-ide
npm install
npm run dev
```

### Build for Production

```bash
npm run build
```

Packaged output will be in `dist/`.

---

## 🔌 Supported AI Providers

| Provider | Base URL |
|---|---|
| OpenAI | `https://api.openai.com/v1` |
| Groq | `https://api.groq.com/openai/v1` |
| OpenRouter | `https://openrouter.ai/api/v1` |
| Together AI | `https://api.together.xyz/v1` |
| Mistral | `https://api.mistral.ai/v1` |
| Ollama (local) | `http://localhost:11434/v1` |
| Any Custom URL | Your own endpoint |

---

## 🗂️ Project Structure

```frosten-ide/
├── electron/ # Main process, preload, agent runner
├── src/
│ ├── views/ # EditorView, ManagerView
│ ├── components/ # FileTree, Tabs, AIChatSidebar, Terminal, etc.
│ ├── store/ # Zustand stores
│ └── lib/ # AI client, agent planner/executor, artifact builder
├── assets/ # Icons, banner, screenshots
└── package.json
```


---

## 🤝 Contributing

We welcome contributions! Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a PR.

```bash
# Fork → Clone → Create branch
git checkout -b feat/your-feature-name
# Make changes → Commit → Push → Open PR
```

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

## 👤 Author

**Rohith Thirunahari** — [@indianicsoft](https://github.com/indianicsoft)
