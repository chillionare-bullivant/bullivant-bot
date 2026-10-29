require("dotenv").config();
require("@nomicfoundation/hardhat-ethers");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      // viaIR: true,
      optimizer: { enabled: true, runs: 1000 },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    base: {
      url: process.env.BASE_RPC_URL || process.env.RPC_URL || "https://mainnet.base.org",
      accounts: (() => {
        const raw = process.env.SIGNER_PRIVATE_KEY || process.env.PRIVATE_KEY;
        if (!raw) return [];
        const clean = raw.trim().startsWith("0x") ? raw.trim() : "0x" + raw.trim();
        return clean.length === 66 ? [clean] : [];
      })(),
      chainId: 8453,
    },
  },
};
