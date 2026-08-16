const MAC_SETUP = `# 1. Install Homebrew if needed: https://brew.sh
# 2. brew install llama.cpp
# 3. confirm: llama-server --version
# 4. mkdir -p ~/models
# 5. allow SSH: System Settings → General → Sharing → Remote Login`;

export default function SetupInstructions() {
  return (
    <section className="card space-y-4">
      <h2 className="card-title">Setup</h2>
      <div>
        <h3 className="field-label">macOS</h3>
        <pre className="setup-pre">{MAC_SETUP}</pre>
      </div>
      <div>
        <h3 className="field-label">Linux</h3>
        <p className="muted text-sm">
          Install a <code className="inline">llama-server</code> binary, create the model dir, and open the listen
          port.
        </p>
      </div>
    </section>
  );
}
