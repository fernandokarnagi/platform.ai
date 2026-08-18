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

const VLLM_METAL = `# Apple Silicon only. Native vllm serve via vllm-metal (MLX). Not Docker.
# 1. Native arm64 Python 3.12 — Rosetta / x86_64 Python is not supported
# 2. Prefer git clone — raw.githubusercontent.com often returns HTTP 429:
#    git clone --depth 1 https://github.com/vllm-project/vllm-metal.git ~/App/vllm-metal
#    cd ~/App/vllm-metal && ./install.sh
#    Venv: ~/App/vllm-metal/.venv-vllm-metal  (or ~/.venv-vllm-metal if you curl the script)
#    If install.sh dies on xcodebuild / Metal toolchain, the Python plugin is
#    already enough. Overlay the prebuilt wheel:
#    source .venv-vllm-metal/bin/activate
#    uv pip install https://github.com/vllm-project/vllm-metal/releases/download/v0.3.0.dev20260817081527/vllm_metal-0.3.0.dev20260817081527-cp312-cp312-macosx_11_0_arm64.whl
# 3. Confirm: .venv-vllm-metal/bin/vllm --help   (must print "Platform plugin metal is activated")
# 4. mkdir -p ~/models
# Set vLLM path on the node to that bin/vllm. Download safetensors, not *-GGUF.`;

export default function SetupInstructions({ engine = 'llama.cpp' }: { engine?: string }) {
  const vllmDocker = engine === 'vllm';
  const vllmMetal = engine === 'vllm-metal';
  return (
    <section className="card space-y-4">
      <h2 className="card-title">Setup</h2>
      {vllmMetal ? (
        <>
          <div>
            <h3 className="field-label">macOS + Apple Silicon (Metal / MLX)</h3>
            <pre className="setup-pre">{VLLM_METAL}</pre>
          </div>
          <div>
            <h3 className="field-label">Linux</h3>
            <p className="muted text-sm">
              Use a <code className="inline">vLLM AMD ROCm Linux</code> cluster for Instinct / Radeon nodes.
            </p>
          </div>
        </>
      ) : vllmDocker ? (
        <>
          <div>
            <h3 className="field-label">Linux + AMD (ROCm / Docker)</h3>
            <pre className="setup-pre">{VLLM_LINUX}</pre>
          </div>
          <div>
            <h3 className="field-label">macOS</h3>
            <p className="muted text-sm">
              This cluster is Docker + ROCm. For a Mac, create a <code className="inline">vLLM Mac Metal</code> cluster
              instead.
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
