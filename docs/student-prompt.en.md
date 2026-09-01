# Student prompt — install & run

The student opens a coding agent (Claude Code or GPT Codex) and pastes the prompt.
The agent does everything: checks/installs prerequisites, gets the code, installs,
and runs the app at `http://localhost:4317`.

**Only hard requirement:** the coding agent itself is installed and open. The agent
can install the rest (including Node), usually without an admin password.

**Time:** ~10–15 min first time; 3–5 min if Node is already installed.

- **Version 1 — with Git.** Simplest and most reliable. **Start here.**
- **Version 2 — without Git.** Fallback if version 1 didn't work (no Git / blocked).

---

## Version 1 — with Git (start here)

> Install and run an app called **JenAI Studio** on my machine. Do everything
> yourself, step by step, and don't move to the next step until the current one
> succeeds. **Don't ask me to run commands — you run them.** If something fails,
> explain it simply.
>
> **1.** Ensure Node 18+ (`node --version`). If missing, install it yourself
> **without admin rights**: nvm on Mac/Linux, winget or fnm on Windows. Only stop
> and ask me if it truly requires an admin password.
> **2.** Ensure Git (`git --version`). If missing, install/enable it; if it needs
> me to approve an install dialog, tell me what to click.
> **3.** Get the code:
> ```
> git clone https://github.com/jenniedov/jenai-studio.git
> cd jenai-studio
> ```
> **4.** One-command setup (installs deps and connects the studio's MCP to you):
> ```
> npm run setup
> ```
> **5.** Start the server as a background process so it keeps running, then open it:
> ```
> npm start
> ```
> Open **http://localhost:4317** once it's up.
> **6.** Confirm the URL responds, tell me "the app is ready", and point me to the
> popup asking for a provider key (Oxen or Kie). If I don't have one, explain how to
> get a free key.
>
> If any step errors, show it, explain it simply, and fix it. Don't skip a failed step.

---

## Version 2 — without Git (if version 1 didn't work)

> Install and run an app called **JenAI Studio** on my machine, **without using
> Git**. Do everything yourself, step by step, and don't move to the next step until
> the current one succeeds. **Don't ask me to run commands — you run them.** If
> something fails, explain it simply.
>
> **1.** Ensure Node 18+ (`node --version`). If missing, install it yourself
> **without admin rights**: nvm on Mac/Linux, winget or fnm on Windows. Only stop
> and ask me if it truly requires an admin password.
> **2.** Get the code **without Git**, as a ZIP, and enter the folder:
> ```
> curl -L https://github.com/jenniedov/jenai-studio/archive/refs/heads/main.tar.gz | tar xz
> cd jenai-studio-main
> ```
> If `curl`/`tar` aren't available: download manually from
> https://github.com/jenniedov/jenai-studio (**Code → Download ZIP**), unzip, and
> enter the folder.
> **3.** One-command setup (installs deps and connects the studio's MCP to you):
> ```
> npm run setup
> ```
> **4.** Start the server as a background process so it keeps running, then open it:
> ```
> npm start
> ```
> Open **http://localhost:4317** once it's up.
> **5.** Confirm the URL responds, tell me "the app is ready", and point me to the
> popup asking for a provider key (Oxen or Kie). If I don't have one, explain how to
> get a free key.
>
> If any step errors, show it, explain it simply, and fix it. Don't skip a failed step.
