import React, { useState } from "react";
import {
  Server,
  Terminal,
  FileCode,
  Shield,
  Layers,
  Copy,
  Check,
  Play,
  Download,
  AlertTriangle,
  Lock,
  Cpu,
  Radio,
  ExternalLink,
  Code2,
  CheckCircle2,
  ArrowRight,
  HardDrive,
  RefreshCw,
  FolderGit2,
  KeyRound,
  Eye,
  EyeOff,
} from "lucide-react";

export function VpsDeploymentLaunchpadView() {
  const [activeStep, setActiveStep] = useState<number>(1);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Step 3: Interactive .env Form State
  const [rpcUrlInput, setRpcUrlInput] = useState<string>("https://mainnet.base.org");
  const [wsUrlInput, setWsUrlInput] = useState<string>("wss://base-rpc.publicnode.com");
  const [privateKeyInput, setPrivateKeyInput] = useState<string>("0xyour_coinbase_wallet_private_key");
  const [coldWalletInput, setColdWalletInput] = useState<string>("0xD6d68800CD199D990C7ACCff409bE60c6508660a");
  const [chainIdInput, setChainIdInput] = useState<string>("8453");
  const [gasLimitInput, setGasLimitInput] = useState<string>("35");
  const [minProfitInput, setMinProfitInput] = useState<string>("20.00");
  const [showPrivateKey, setShowPrivateKey] = useState<boolean>(false);

  // Step 4: Smart Contract View State
  const [selectedContractTool, setSelectedContractTool] = useState<"hardhat" | "foundry">("hardhat");

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2500);
  };

  const generatedEnvContent = `# ==============================================================================
# PRODUCTION ENVIRONMENT CONFIGURATION - TRADING BOT & ARBITRAGE ENGINE
# CHMOD 600 RECOMMENDED: chmod 600 .env
# ==============================================================================
NODE_ENV=production
PORT=3000

# EVM BLOCKCHAIN RPC & WEBSOCKET ENDPOINTS
BASE_RPC_URL=${rpcUrlInput}
RPC_URL=${rpcUrlInput}
WS_URL=${wsUrlInput}
CHAIN_ID=${chainIdInput}

# SIGNER & WALLET KEYS (SECURED)
PRIVATE_KEY=${privateKeyInput}
SIGNER_PRIVATE_KEY=${privateKeyInput}

# OWNER & REALITY BRIDGE TARGET
OWNER_ADDRESS=${coldWalletInput}
COLD_STORAGE_ADDRESS=${coldWalletInput}
REALITY_BRIDGE_URL=http://127.0.0.1:7777
AUTO_SWEEP_ENABLED=true
PROFIT_SWEEP_THRESHOLD_USD=${minProfitInput}

# RISK & GAS MANAGEMENT
MAX_GAS_PRICE_GWEI=${gasLimitInput}
SLIPPAGE_TOLERANCE_BPS=50
CIRCUIT_BREAKER_MAX_DRAWDOWN_USD=100.00
FLASH_LOAN_CONTRACT_ADDRESS=0xA43fe16908251ee70EF74718545e4FE6C5cCEc9f`;

  const downloadEnvFile = () => {
    const blob = new Blob([generatedEnvContent], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = ".env";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Step 1: VPS Scripts
  const vpsSetupScript = `# 1. Connect to your VPS via SSH
ssh root@YOUR_VPS_IP

# 2. Update Linux packages & install essential dependencies
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git build-essential ufw fail2ban jq tmux htop

# 3. Install Node.js LTS (v20 or v22) via official NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 4. Verify Node and NPM installations
node -v   # Expected: v20.x.x
npm -v    # Expected: 10.x.x

# 5. Install PM2 (Process Manager) globally
sudo npm install -g pm2 pnpm tsx

# 6. Configure UFW Firewall (Restrict ports for security)
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp      # SSH access
sudo ufw allow 3000/tcp    # Web Dashboard
sudo ufw allow 7777/tcp    # Reality Bridge (Internal/Whitelisted)
sudo ufw allow 8545/tcp    # EVM RPC (Loopback or whitelisted)
sudo ufw allow 8546/tcp    # EVM WebSocket
sudo ufw --force enable
sudo ufw status verbose`;

  // Step 2: Transfer Scripts
  const rsyncTransferScript = `# Option A: Transfer files from your local machine to VPS using rsync (Fast & excludes node_modules)
rsync -avz --progress \\
  --exclude 'node_modules' \\
  --exclude '.git' \\
  --exclude 'dist' \\
  --exclude '.env' \\
  ./ root@YOUR_VPS_IP:/home/ubuntu/trading-bot/

# Option B: Clone directly from your private GitHub repository on VPS
ssh root@YOUR_VPS_IP
cd /home/ubuntu
git clone https://github.com/your-username/trading-bot.git
cd trading-bot

# Install dependencies clean in production mode
npm ci --omit=dev`;

  // Step 4: Hardhat Contract Deployment Script
  const hardhatConfigScript = `// hardhat.config.js
require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 1000 },
    },
  },
  networks: {
    base: {
      url: process.env.RPC_URL || "https://mainnet.base.org",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 8453,
    },
    arbitrum: {
      url: process.env.RPC_URL || "https://arb1.arbitrum.io/rpc",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 42161,
    },
  },
};`;

  const hardhatDeployScript = `// scripts/deploy.js
const hre = require("hardhat");

async function main() {
  console.log("Compiling contracts...");
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying FlashLoanReceiver with account:", deployer.address);

  const FlashLoanArbitrage = await hre.ethers.getContractFactory("FlashLoanArbitrage");
  const contract = await FlashLoanArbitrage.deploy(
    "0x8C4dFc045f202AaD306d94Ae6E7a1d81E96B34fD" // Cold storage / Profit sweep vault
  );

  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();
  console.log("==================================================");
  console.log("Arbitrage Contract Deployed to:", contractAddress);
  console.log("Add to your .env: FLASH_LOAN_CONTRACT_ADDRESS=" + contractAddress);
  console.log("==================================================");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});`;

  const foundryDeployScript = `# Foundry Deployment Commands
# 1. Compile smart contracts
forge build --optimize

# 2. Deploy directly to Base L2 using your private key and RPC
forge create --rpc-url $RPC_URL \\
  --private-key $PRIVATE_KEY \\
  src/FlashLoanArbitrage.sol:FlashLoanArbitrage \\
  --constructor-args $COLD_STORAGE_ADDRESS \\
  --verify`;

  // Step 5: PM2 Process Management Script
  const pm2EcosystemScript = `// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: "dex-trading-engine",
      script: "server.ts",
      interpreter: "node",
      interpreter_args: "--import tsx",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "800M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "./logs/err.log",
      out_file: "./logs/out.log",
      merge_logs: true,
    },
  ],
};`;

  const pm2CommandsScript = `# 1. Start the trading engine with PM2 using the ecosystem config
pm2 start ecosystem.config.js

# 2. Save PM2 process list to persist across VPS server reboots
pm2 save
pm2 startup

# 3. View live streaming trades, arbitrage executions & profit sweeps
pm2 logs dex-trading-engine --lines 100

# 4. Monitor real-time memory, CPU & event loop latency
pm2 monit

# 5. Check uptime & status table
pm2 status`;

  const STEPS = [
    {
      id: 1,
      title: "1. Rent & Setup VPS",
      subtitle: "Ubuntu 22.04/24.04 • Node.js LTS • UFW Firewall",
      icon: Server,
    },
    {
      id: 2,
      title: "2. Transfer Project",
      subtitle: "rsync / git clone • Clean npm install",
      icon: FolderGit2,
    },
    {
      id: 3,
      title: "3. Configure .env",
      subtitle: "RPC • Private Key • Port 7777 Reality Bridge",
      icon: KeyRound,
    },
    {
      id: 4,
      title: "4. Deploy Contracts",
      subtitle: "Hardhat / Foundry • Flash Loans • Verify",
      icon: Code2,
    },
    {
      id: 5,
      title: "5. Launch Trading Engine",
      subtitle: "PM2 Daemon • 24/7 Autorestart • Health Logs",
      icon: Play,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-zinc-950 via-zinc-900 to-black border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-cyan-500/10 border border-cyan-500/30 rounded-full text-cyan-400 text-xs font-bold uppercase tracking-wider">
              <Cpu className="w-3.5 h-3.5" />
              Complete VPS Production Lifecycle
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              VPS Node.js & Smart Contract Deployment Launchpad
            </h1>
            <p className="text-zinc-400 text-sm leading-relaxed">
              Step-by-step master plan for provisioning a Linux cloud server, synchronizing project files, hardening environment keys, broadcasting EVM smart contracts, and launching the 24/7 autonomous trading daemon with automatic Reality Bridge sweeps.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0">
            <div className="px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-center">
              <span className="block text-[11px] text-zinc-500 font-semibold uppercase">Platform</span>
              <span className="font-mono font-bold text-white text-sm">Ubuntu 22.04+</span>
            </div>
            <div className="px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-center">
              <span className="block text-[11px] text-zinc-500 font-semibold uppercase">Engine</span>
              <span className="font-mono font-bold text-cyan-400 text-sm">Node.js 20 LTS</span>
            </div>
            <div className="px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-xl text-center">
              <span className="block text-[11px] text-zinc-500 font-semibold uppercase">Daemon</span>
              <span className="font-mono font-bold text-emerald-400 text-sm">PM2 Cluster</span>
            </div>
          </div>
        </div>

        {/* Step Navigation Tabs */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-8 pt-6 border-t border-zinc-800">
          {STEPS.map((step) => {
            const Icon = step.icon;
            const isActive = activeStep === step.id;
            return (
              <button
                key={step.id}
                onClick={() => setActiveStep(step.id)}
                className={`p-3 rounded-2xl text-left transition-all flex flex-col justify-between border cursor-pointer ${
                  isActive
                    ? "bg-cyan-500/10 border-cyan-500 text-white shadow-lg shadow-cyan-950/50"
                    : "bg-zinc-900/50 border-zinc-800 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <Icon className={`w-4 h-4 ${isActive ? "text-cyan-400" : "text-zinc-500"}`} />
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.2 rounded font-bold ${
                      isActive ? "bg-cyan-500 text-black" : "bg-zinc-800 text-zinc-400"
                    }`}
                  >
                    STEP {step.id}
                  </span>
                </div>
                <div className="font-bold text-xs truncate">{step.title}</div>
                <div className="text-[10px] text-zinc-500 truncate mt-0.5">{step.subtitle}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Step Content Area */}
      <div className="bg-white border border-zinc-200 rounded-3xl p-6 sm:p-8 shadow-xs">
        {/* ================================================================== */}
        {/* STEP 1: RENT VPS & CONFIGURE NODE.JS */}
        {/* ================================================================== */}
        {activeStep === 1 && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 pb-4">
              <div>
                <span className="text-[11px] font-bold text-cyan-600 uppercase tracking-wider">
                  Step 1 of 5
                </span>
                <h2 className="text-xl font-black text-zinc-900">
                  Renting a VPS & Configuring the Node.js Environment
                </h2>
                <p className="text-xs text-zinc-500 mt-1">
                  Choose a high-uptime cloud VPS provider close to DEX RPC nodes, configure Ubuntu, and secure system access.
                </p>
              </div>

              <button
                onClick={() => setActiveStep(2)}
                className="px-4 py-2 bg-zinc-900 hover:bg-black text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition self-start sm:self-auto cursor-pointer"
              >
                <span>Proceed to Step 2</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Hardware & Provider Recommendations */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-200 space-y-2">
                <div className="font-bold text-sm text-zinc-900 flex items-center gap-2">
                  <Server className="w-4 h-4 text-cyan-600" />
                  Recommended Providers
                </div>
                <ul className="text-xs text-zinc-600 space-y-1">
                  <li>• <strong>Hetzner Cloud:</strong> CPX21 or CPX31 (Best latency in Europe/US)</li>
                  <li>• <strong>DigitalOcean:</strong> 2 vCPU / 4GB RAM Droplet (Ubuntu 24.04)</li>
                  <li>• <strong>OVHcloud / Vultr:</strong> High-frequency compute NVMe</li>
                </ul>
              </div>

              <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-200 space-y-2">
                <div className="font-bold text-sm text-zinc-900 flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-purple-600" />
                  Minimum Hardware Specs
                </div>
                <ul className="text-xs text-zinc-600 space-y-1">
                  <li>• <strong>CPU:</strong> 2 vCPU cores (x86_64 or arm64)</li>
                  <li>• <strong>RAM:</strong> 4GB RAM + 2GB swap partition</li>
                  <li>• <strong>Disk:</strong> 40GB+ NVMe SSD (Fast I/O for block parsing)</li>
                </ul>
              </div>

              <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-200 space-y-2">
                <div className="font-bold text-sm text-zinc-900 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-600" />
                  Security Hardening
                </div>
                <ul className="text-xs text-zinc-600 space-y-1">
                  <li>• Use SSH key-pair authentication only (disable root password)</li>
                  <li>• Configure UFW to permit only Ports 22, 3000, 7777, 8545</li>
                  <li>• Install fail2ban to stop brute-force attacks</li>
                </ul>
              </div>
            </div>

            {/* Terminal Command Snippet */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-800 flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-zinc-600" />
                  Execute on VPS Terminal (Copy &amp; Paste in SSH Session):
                </span>
                <button
                  onClick={() => copyToClipboard(vpsSetupScript, "vpsSetup")}
                  className="px-3 py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition cursor-pointer"
                >
                  {copiedKey === "vpsSetup" ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedKey === "vpsSetup" ? "Copied Script!" : "Copy Setup Script"}</span>
                </button>
              </div>

              <pre className="p-4 bg-zinc-950 text-emerald-300 font-mono text-xs rounded-2xl overflow-x-auto leading-relaxed border border-zinc-800">
                {vpsSetupScript}
              </pre>
            </div>
          </div>
        )}

        {/* ================================================================== */}
        {/* STEP 2: TRANSFER PROJECT FILES */}
        {/* ================================================================== */}
        {activeStep === 2 && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 pb-4">
              <div>
                <span className="text-[11px] font-bold text-cyan-600 uppercase tracking-wider">
                  Step 2 of 5
                </span>
                <h2 className="text-xl font-black text-zinc-900">
                  Transferring Trading Project Files to the VPS
                </h2>
                <p className="text-xs text-zinc-500 mt-1">
                  Synchronize your source code, algorithms, and dependencies from your local machine to the server.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveStep(1)}
                  className="px-3 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Back
                </button>
                <button
                  onClick={() => setActiveStep(3)}
                  className="px-4 py-2 bg-zinc-900 hover:bg-black text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition cursor-pointer"
                >
                  <span>Proceed to Step 3</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-200 space-y-2">
                <div className="font-bold text-sm text-zinc-900 flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-cyan-600" />
                  Method 1: rsync (Direct File Sync)
                </div>
                <p className="text-xs text-zinc-600">
                  Fastest method to copy code directly from your laptop/desktop without pushing uncommitted or secret files to GitHub.
                </p>
                <div className="text-[11px] text-zinc-500 bg-white p-2.5 rounded-xl border border-zinc-200 font-mono">
                  Excludes: <code>node_modules</code>, <code>.git</code>, and <code>.env</code>
                </div>
              </div>

              <div className="p-4 bg-zinc-50 rounded-2xl border border-zinc-200 space-y-2">
                <div className="font-bold text-sm text-zinc-900 flex items-center gap-2">
                  <FolderGit2 className="w-4 h-4 text-purple-600" />
                  Method 2: Git Clone via Deploy Key
                </div>
                <p className="text-xs text-zinc-600">
                  Generate an SSH deploy key on the VPS (<code>ssh-keygen -t ed25519</code>) and add it to your GitHub repository Settings &rarr; Deploy Keys.
                </p>
                <div className="text-[11px] text-zinc-500 bg-white p-2.5 rounded-xl border border-zinc-200 font-mono">
                  Enables <code>git pull</code> for zero-downtime updates!
                </div>
              </div>
            </div>

            {/* Transfer Snippet */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-800 flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-zinc-600" />
                  Run on Local Machine (rsync) OR Run on VPS (git clone):
                </span>
                <button
                  onClick={() => copyToClipboard(rsyncTransferScript, "rsync")}
                  className="px-3 py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition cursor-pointer"
                >
                  {copiedKey === "rsync" ? (
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedKey === "rsync" ? "Copied!" : "Copy Transfer Commands"}</span>
                </button>
              </div>

              <pre className="p-4 bg-zinc-950 text-cyan-300 font-mono text-xs rounded-2xl overflow-x-auto leading-relaxed border border-zinc-800">
                {rsyncTransferScript}
              </pre>
            </div>
          </div>
        )}

        {/* ================================================================== */}
        {/* STEP 3: CONFIGURE SECURE .ENV FILE */}
        {/* ================================================================== */}
        {activeStep === 3 && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 pb-4">
              <div>
                <span className="text-[11px] font-bold text-cyan-600 uppercase tracking-wider">
                  Step 3 of 5
                </span>
                <h2 className="text-xl font-black text-zinc-900">
                  Creating the Secure Environment File (<code className="text-cyan-600">.env</code>)
                </h2>
                <p className="text-xs text-zinc-500 mt-1">
                  Securely store your EVM JSON-RPC URL, WebSocket endpoint, private key, and Reality Bridge cold storage address.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveStep(2)}
                  className="px-3 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Back
                </button>
                <button
                  onClick={() => setActiveStep(4)}
                  className="px-4 py-2 bg-zinc-900 hover:bg-black text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition cursor-pointer"
                >
                  <span>Proceed to Step 4</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Interactive Builder */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="space-y-3.5 bg-zinc-50 p-5 rounded-2xl border border-zinc-200">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-zinc-900 text-sm flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-cyan-600" />
                    Environment Variables Builder
                  </h3>
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-100 text-amber-800 rounded">
                    chmod 600 Security
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div>
                    <label className="block text-zinc-600 font-semibold mb-1">
                      EVM JSON-RPC URL (HTTP)
                    </label>
                    <input
                      type="text"
                      value={rpcUrlInput}
                      onChange={(e) => setRpcUrlInput(e.target.value)}
                      placeholder="http://127.0.0.1:8545 or https://mainnet.base.org"
                      className="w-full p-2 border border-zinc-300 rounded-lg font-mono text-xs bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-zinc-600 font-semibold mb-1">
                      EVM WebSocket Stream URL (WSS)
                    </label>
                    <input
                      type="text"
                      value={wsUrlInput}
                      onChange={(e) => setWsUrlInput(e.target.value)}
                      placeholder="ws://127.0.0.1:8546 or wss://base-mainnet.g.alchemy.com/v2/..."
                      className="w-full p-2 border border-zinc-300 rounded-lg font-mono text-xs bg-white"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-zinc-600 font-semibold">
                        Trading Signer Private Key
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowPrivateKey(!showPrivateKey)}
                        className="text-[11px] text-cyan-600 hover:text-cyan-700 flex items-center gap-1 font-semibold"
                      >
                        {showPrivateKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        <span>{showPrivateKey ? "Hide Key" : "Reveal Key"}</span>
                      </button>
                    </div>
                    <input
                      type={showPrivateKey ? "text" : "password"}
                      value={privateKeyInput}
                      onChange={(e) => setPrivateKeyInput(e.target.value)}
                      placeholder="0x..."
                      className="w-full p-2 border border-zinc-300 rounded-lg font-mono text-xs bg-white text-zinc-900"
                    />
                  </div>

                  <div>
                    <label className="block text-zinc-600 font-semibold mb-1">
                      Reality Bridge: Cold Storage Vault Address (Port 7777 Target)
                    </label>
                    <input
                      type="text"
                      value={coldWalletInput}
                      onChange={(e) => setColdWalletInput(e.target.value)}
                      placeholder="0xColdVault..."
                      className="w-full p-2 border border-zinc-300 rounded-lg font-mono text-xs bg-white"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-zinc-600 font-semibold mb-1">Chain ID</label>
                      <input
                        type="text"
                        value={chainIdInput}
                        onChange={(e) => setChainIdInput(e.target.value)}
                        className="w-full p-2 border border-zinc-300 rounded-lg font-mono text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-zinc-600 font-semibold mb-1">Max Gas (Gwei)</label>
                      <input
                        type="text"
                        value={gasLimitInput}
                        onChange={(e) => setGasLimitInput(e.target.value)}
                        className="w-full p-2 border border-zinc-300 rounded-lg font-mono text-xs bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-zinc-600 font-semibold mb-1">Min Profit ($)</label>
                      <input
                        type="text"
                        value={minProfitInput}
                        onChange={(e) => setMinProfitInput(e.target.value)}
                        className="w-full p-2 border border-zinc-300 rounded-lg font-mono text-xs bg-white"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={downloadEnvFile}
                    className="flex-1 py-2 px-3 bg-zinc-800 hover:bg-zinc-700 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download .env File</span>
                  </button>
                  <button
                    onClick={() => copyToClipboard(generatedEnvContent, "envFile")}
                    className="flex-1 py-2 px-3 bg-cyan-600 hover:bg-cyan-500 text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {copiedKey === "envFile" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === "envFile" ? "Copied .env!" : "Copy .env Content"}</span>
                  </button>
                </div>
              </div>

              {/* Rendered .env with chmod warning */}
              <div className="space-y-3">
                <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold">Mandatory Security Rule: </span>
                    On your Linux VPS, restrict file permissions so only your user can read the file:
                    <div className="mt-1 font-mono font-bold bg-white px-2 py-1 rounded border border-amber-300 text-amber-950 inline-block">
                      chmod 600 .env
                    </div>
                  </div>
                </div>

                <pre className="p-4 bg-zinc-950 text-emerald-400 font-mono text-xs rounded-2xl overflow-x-auto leading-relaxed border border-zinc-800 max-h-[380px]">
                  {generatedEnvContent}
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================== */}
        {/* STEP 4: DEPLOY CUSTOM SMART CONTRACTS */}
        {/* ================================================================== */}
        {activeStep === 4 && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 pb-4">
              <div>
                <span className="text-[11px] font-bold text-cyan-600 uppercase tracking-wider">
                  Step 4 of 5
                </span>
                <h2 className="text-xl font-black text-zinc-900">
                  Deploying Custom Smart Contracts to the Blockchain
                </h2>
                <p className="text-xs text-zinc-500 mt-1">
                  Compile, deploy, and verify your Flash Loan Arbitrage receiver contract on Base, Arbitrum, or Ethereum before firing trading scripts.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveStep(3)}
                  className="px-3 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Back
                </button>
                <button
                  onClick={() => setActiveStep(5)}
                  className="px-4 py-2 bg-zinc-900 hover:bg-black text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition cursor-pointer"
                >
                  <span>Proceed to Step 5</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Framework Selector */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelectedContractTool("hardhat")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  selectedContractTool === "hardhat"
                    ? "bg-zinc-900 text-white"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                Hardhat (JavaScript / TypeScript)
              </button>
              <button
                onClick={() => setSelectedContractTool("foundry")}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  selectedContractTool === "foundry"
                    ? "bg-zinc-900 text-white"
                    : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                }`}
              >
                <Terminal className="w-3.5 h-3.5" />
                Foundry (Rust / Forge)
              </button>
            </div>

            {selectedContractTool === "hardhat" ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-800">
                      1. hardhat.config.js (Network &amp; Signer Setup)
                    </span>
                    <button
                      onClick={() => copyToClipboard(hardhatConfigScript, "hhConfig")}
                      className="px-2.5 py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-[11px] font-semibold rounded-lg flex items-center gap-1 cursor-pointer"
                    >
                      {copiedKey === "hhConfig" ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedKey === "hhConfig" ? "Copied" : "Copy"}</span>
                    </button>
                  </div>
                  <pre className="p-3.5 bg-zinc-950 text-purple-300 font-mono text-xs rounded-xl overflow-x-auto leading-relaxed border border-zinc-800">
                    {hardhatConfigScript}
                  </pre>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-zinc-800">
                      2. scripts/deploy.js (Deploy &amp; Output Address)
                    </span>
                    <button
                      onClick={() => copyToClipboard(hardhatDeployScript, "hhDeploy")}
                      className="px-2.5 py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-[11px] font-semibold rounded-lg flex items-center gap-1 cursor-pointer"
                    >
                      {copiedKey === "hhDeploy" ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedKey === "hhDeploy" ? "Copied" : "Copy"}</span>
                    </button>
                  </div>
                  <pre className="p-3.5 bg-zinc-950 text-cyan-300 font-mono text-xs rounded-xl overflow-x-auto leading-relaxed border border-zinc-800">
                    {hardhatDeployScript}
                  </pre>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-800">
                    Foundry Forge Compilation &amp; Broadcast Commands:
                  </span>
                  <button
                    onClick={() => copyToClipboard(foundryDeployScript, "foundry")}
                    className="px-3 py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer"
                  >
                    {copiedKey === "foundry" ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === "foundry" ? "Copied" : "Copy Foundry Snippet"}</span>
                  </button>
                </div>
                <pre className="p-4 bg-zinc-950 text-amber-300 font-mono text-xs rounded-2xl overflow-x-auto leading-relaxed border border-zinc-800">
                  {foundryDeployScript}
                </pre>
              </div>
            )}

            <div className="p-4 bg-cyan-50 rounded-2xl border border-cyan-200 text-xs text-cyan-950 space-y-1">
              <span className="font-bold flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-cyan-700" />
                Post-Deployment Action:
              </span>
              <p>
                Take the emitted deployed contract address and paste it directly into your <code>.env</code> file under <code>FLASH_LOAN_CONTRACT_ADDRESS</code>. Your Node.js trading engine uses this address for atomicity!
              </p>
            </div>
          </div>
        )}

        {/* ================================================================== */}
        {/* STEP 5: START TRADING SCRIPT WITH PM2 DAEMON */}
        {/* ================================================================== */}
        {activeStep === 5 && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 pb-4">
              <div>
                <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">
                  Step 5 of 5 • Final Stage
                </span>
                <h2 className="text-xl font-black text-zinc-900">
                  Starting the 24/7 Trading Script &amp; Daemonizing with PM2
                </h2>
                <p className="text-xs text-zinc-500 mt-1">
                  Launch the engine in background mode with auto-restart on crash, log rotation, memory limits, and reboot persistence.
                </p>
              </div>

              <button
                onClick={() => setActiveStep(1)}
                className="px-3 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Back to Step 1
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-800">
                    1. ecosystem.config.js (Production PM2 Config)
                  </span>
                  <button
                    onClick={() => copyToClipboard(pm2EcosystemScript, "pm2Eco")}
                    className="px-2.5 py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-[11px] font-semibold rounded-lg flex items-center gap-1 cursor-pointer"
                  >
                    {copiedKey === "pm2Eco" ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedKey === "pm2Eco" ? "Copied" : "Copy"}</span>
                  </button>
                </div>
                <pre className="p-3.5 bg-zinc-950 text-cyan-300 font-mono text-xs rounded-xl overflow-x-auto leading-relaxed border border-zinc-800">
                  {pm2EcosystemScript}
                </pre>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-800">
                    2. PM2 Daemon Control &amp; Monitoring Commands
                  </span>
                  <button
                    onClick={() => copyToClipboard(pm2CommandsScript, "pm2Cmd")}
                    className="px-2.5 py-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-[11px] font-semibold rounded-lg flex items-center gap-1 cursor-pointer"
                  >
                    {copiedKey === "pm2Cmd" ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedKey === "pm2Cmd" ? "Copied" : "Copy"}</span>
                  </button>
                </div>
                <pre className="p-3.5 bg-zinc-950 text-emerald-300 font-mono text-xs rounded-xl overflow-x-auto leading-relaxed border border-zinc-800">
                  {pm2CommandsScript}
                </pre>
              </div>
            </div>

            {/* Live Operational Checklist */}
            <div className="p-5 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl space-y-3">
              <h3 className="font-bold text-emerald-950 text-sm flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Live Production Verification Checklist
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-emerald-900">
                <div className="flex items-center gap-2 bg-white/80 p-2.5 rounded-xl border border-emerald-200/60">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>EVM RPC <code>8545</code> responds to <code>eth_blockNumber</code></span>
                </div>
                <div className="flex items-center gap-2 bg-white/80 p-2.5 rounded-xl border border-emerald-200/60">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>WebSocket <code>8546</code> emits real-time <code>newHeads</code></span>
                </div>
                <div className="flex items-center gap-2 bg-white/80 p-2.5 rounded-xl border border-emerald-200/60">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Reality Bridge <code>7777</code> sweeps profits to cold storage</span>
                </div>
                <div className="flex items-center gap-2 bg-white/80 p-2.5 rounded-xl border border-emerald-200/60">
                  <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>PM2 auto-restart active upon unexpected error or memory cap</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
