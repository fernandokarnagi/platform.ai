const MAC_SETUP = `# 1. Install Homebrew if needed: https://brew.sh
# 2. brew install llama.cpp
# 3. confirm: llama-server --version
# 4. mkdir -p ~/models
# 5. allow SSH: System Settings → General → Sharing → Remote Login`;

export default function SetupInstructions() {
  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Setup</h2>
      <div>
        <h3 className="mb-2 text-sm font-medium text-slate-800">macOS</h3>
        <pre className="overflow-x-auto rounded-md bg-slate-900 p-3 text-xs leading-5 text-slate-100">{MAC_SETUP}</pre>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-medium text-slate-800">Linux</h3>
        <p className="text-sm text-slate-600">
          Install a <code className="rounded bg-slate-100 px-1">llama-server</code> binary, create the model dir, and
          open the listen port.
        </p>
      </div>
    </section>
  );
}
