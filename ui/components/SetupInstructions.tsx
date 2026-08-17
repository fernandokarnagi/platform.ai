const LLAMA_MAC = `# 1. Install Homebrew if needed: https://brew.sh
# 2. brew install llama.cpp
# 3. confirm: llama-server --version
# 4. mkdir -p ~/models
# 5. allow SSH: System Settings → General → Sharing → Remote Login`;

const VLLM_LINUX = `# AMD Instinct / ROCm (e.g. MI210 gfx90a). The API starts vLLM with docker.
# 1. rocminfo | grep -E 'gfx|Marketing'
# 2. confirm /dev/kfd and /dev/dri exist
# 3. groups  # need video, render, docker
# 4. docker pull rocm/vllm:rocm7.14.0_cdna_ubuntu24.04_py3.14_pytorch_2.11.0_vllm_0.23.0
#    Radeon/RDNA: use the rdna tag instead of cdna
# 5. mkdir -p /mnt/data/vllmmodels
# Start/Stop in the UI run: docker rm -f platformai-vllm && docker run ... vllm serve
# Do not run the CUDA pip vllm on this box.`;

export default function SetupInstructions({ engine = 'llama.cpp' }: { engine?: string }) {
  const vllm = engine === 'vllm';
  return (
    <section className="card space-y-4">
      <h2 className="card-title">Setup</h2>
      {vllm ? (
        <>
          <div>
            <h3 className="field-label">Linux + AMD (ROCm / Docker)</h3>
            <pre className="setup-pre">{VLLM_LINUX}</pre>
          </div>
          <div>
            <h3 className="field-label">macOS</h3>
            <p className="muted text-sm">
              vLLM is not started on a Mac. Register a Linux AMD node with Docker, or keep a llama.cpp cluster here.
            </p>
          </div>
        </>
      ) : (
        <>
          <div>
            <h3 className="field-label">macOS</h3>
            <pre className="setup-pre">{LLAMA_MAC}</pre>
          </div>
          <div>
            <h3 className="field-label">Linux</h3>
            <p className="muted text-sm">
              Install a <code className="inline">llama-server</code> binary, create the model dir, and open the listen
              port.
            </p>
          </div>
        </>
      )}
    </section>
  );
}
