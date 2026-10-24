const fs = require("fs");

const scriptToRun = fs.existsSync("./dist/server.cjs") ? "./dist/server.cjs" : "server.ts";
const isTs = scriptToRun.endsWith(".ts");

module.exports = {
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
  ],
};
