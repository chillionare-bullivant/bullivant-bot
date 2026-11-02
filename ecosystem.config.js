import fs from "fs";

const scriptToRun = fs.existsSync("./dist/server.cjs") ? "./dist/server.cjs" : "server.ts";
const isTs = scriptToRun.endsWith(".ts");

export default {
  apps: [
    {
      name: "bullivant-engine",
      script: scriptToRun,
      interpreter: isTs ? "node" : undefined,
      interpreter_args: isTs ? "--import tsx" : undefined,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "600M",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
    {
      name: "bullivant-scanner",
      script: "./scanner.cjs",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
      },
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
    {
      name: "bullivant-new-token-sniper",
      script: "./new-token-sniper.cjs",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
      },
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
    {
      name: "solana-program-client",
      script: "./solana/client.cjs",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "250M",
      env: {
        NODE_ENV: "production",
        SOLANA_RPC_URL: "https://api.devnet.solana.com",
      },
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
    },
  ],
};
