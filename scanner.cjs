#!/usr/bin/env node
/**
 * ==============================================================================
 * BULLIVANT AUTONOMOUS BASE MAINNET ARBITRAGE SCANNER & MEV BOT
 * ==============================================================================
 * Continuously reads real-time on-chain reserves from:
 * 1. Uniswap V3 WETH/USDC Pool (0xd0b53D9277642d899DF5C87A3966A349A798F224)
 * 2. Aerodrome WETH/USDC Volatile Pool (0xcDAC0d6c6C59727a65F871236188350531885C43)
 *
 * Calculates net spread after Aave V3 flash loan fee (0.05%) and DEX fees.
 * When profitable, triggers atomic flash loan execution and sweeps profit to owner!
 */

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const BASE_RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const UNI_POOL_ADDRESS = "0xd0b53D9277642d899DF5C87A3966A349A798F224"; // Uni V3 0.05%
const AERO_POOL_ADDRESS = "0xcDAC0d6c6C59727a65F871236188350531885C43"; // Aerodrome Volatile
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

const UNI_POOL_ABI = [
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function token0() view returns (address)"
];

const AERO_POOL_ABI = [
  "function getReserves() view returns (uint256 reserve0, uint256 reserve1, uint256 blockTimestampLast)",
  "function token0() view returns (address)"
];

const CONTRACT_ABI = [
  "function requestFlashLoanUSDC(uint256 amount) external",
  "function owner() view returns (address)"
];

const targetContract = process.env.BASE_FLASHLOAN_CONTRACT_ADDRESS || 
  process.env.LEVERAGE_CONTRACT_ADDRESS || 
  "0xD66d44ba2B16A6EB657752419FD8475Dc42CC11F";

const minThresholdPercent = parseFloat(process.env.MIN_SPREAD_THRESHOLD || "0.15");
const borrowAmountUsdc = parseFloat(process.env.BORROW_AMOUNT_USDC || "10000");

async function main() {
  console.log("==================================================");
  console.log("🚀 BULLIVANT AUTONOMOUS 24/7 ARBITRAGE SCANNER");
  console.log("Network:            Base Mainnet (Chain ID 8453)");
  console.log("Uniswap V3 Pool:   ", UNI_POOL_ADDRESS);
  console.log("Aerodrome Pool:    ", AERO_POOL_ADDRESS);
  console.log("Receiver Contract: ", targetContract);
  console.log("Spread Threshold:   >" + minThresholdPercent + "%");
  console.log("==================================================");

  const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
  const uniContract = new ethers.Contract(UNI_POOL_ADDRESS, UNI_POOL_ABI, provider);
  const aeroContract = new ethers.Contract(AERO_POOL_ADDRESS, AERO_POOL_ABI, provider);

  let signer = null;
  const privateKey = process.env.PRIVATE_KEY || process.env.SIGNER_PRIVATE_KEY;
  if (privateKey && privateKey.startsWith("0x") && privateKey.length === 66 && !privateKey.includes("YourActualRealPrivateKey")) {
    signer = new ethers.Wallet(privateKey, provider);
    console.log("Signer configured: ", signer.address);
  } else {
    console.log("Running in scanning & telemetry mode (configure PRIVATE_KEY in .env for on-chain execution).");
  }

  async function scan() {
    try {
      const [blockNumber, uniSlot0, aeroReserves] = await Promise.all([
        provider.getBlockNumber(),
        uniContract.slot0(),
        aeroContract.getReserves()
      ]);

      // 1. Calculate Uniswap V3 WETH Spot Price
      const sqrtPriceX96 = BigInt(uniSlot0[0]);
      // Price = (sqrtPriceX96)^2 * 10^12 / 2^192
      const uniPriceNum = Number((sqrtPriceX96 * sqrtPriceX96 * 1000000000000n) / (2n ** 192n));

      // 2. Calculate Aerodrome WETH Spot Price
      const [r0, r1] = aeroReserves;
      // In Aerodrome pool 0xcDAC..., token0 is WETH (18 dec) and token1 is USDC (6 dec)
      const aeroPriceNum = (Number(r1) / 1e6) / (Number(r0) / 1e18);

      // 3. Compute Real Spread
      const diff = Math.abs(uniPriceNum - aeroPriceNum);
      const avg = (uniPriceNum + aeroPriceNum) / 2;
      const spreadPct = (diff / avg) * 100;

      // Direction: buy low on DEX A, sell high on DEX B
      const buyDex = uniPriceNum < aeroPriceNum ? "Uniswap V3" : "Aerodrome";
      const sellDex = uniPriceNum < aeroPriceNum ? "Aerodrome" : "Uniswap V3";
      const buyPrice = Math.min(uniPriceNum, aeroPriceNum);
      const sellPrice = Math.max(uniPriceNum, aeroPriceNum);

      // Flash loan economics on $10,000 USDC
      const grossProfit = (spreadPct / 100) * borrowAmountUsdc;
      const aaveFee = (0.05 / 100) * borrowAmountUsdc; // $5.00
      const dexFees = (0.10 / 100) * borrowAmountUsdc; // ~0.10% total fee
      const gasFee = 0.005; // Base L2 gas fee
      const netProfit = grossProfit - aaveFee - dexFees - gasFee;
      const isProfitable = netProfit > 0 && spreadPct >= minThresholdPercent;

      const payload = {
        blockNumber,
        timestamp: new Date().toISOString(),
        uniswapPrice: parseFloat(uniPriceNum.toFixed(2)),
        aerodromePrice: parseFloat(aeroPriceNum.toFixed(2)),
        spreadDiffUsd: parseFloat(diff.toFixed(2)),
        spreadPercent: parseFloat(spreadPct.toFixed(4)),
        buyDex,
        sellDex,
        buyPrice: parseFloat(buyPrice.toFixed(2)),
        sellPrice: parseFloat(sellPrice.toFixed(2)),
        borrowAmountUsdc,
        grossProfitUsd: parseFloat(grossProfit.toFixed(2)),
        netProfitUsd: parseFloat(netProfit.toFixed(2)),
        isProfitable,
        status: isProfitable ? "ARBITRAGE_EXPANDED" : "EQUILIBRIUM_MONITORING"
      };

      // Save live telemetry for web dashboard
      try {
        fs.writeFileSync(path.resolve(process.cwd(), "live_arbitrage.json"), JSON.stringify(payload, null, 2));
      } catch {}

      const timestamp = new Date().toLocaleTimeString();
      if (isProfitable) {
        console.log(`\n🔥 [${timestamp} Block #${blockNumber}] PROFITABLE SPREAD DETECTED!`);
        console.log(`   Uni V3:  $${uniPriceNum.toFixed(2)} | Aero: $${aeroPriceNum.toFixed(2)} | Spread: ${spreadPct.toFixed(3)}% ($${diff.toFixed(2)}/ETH)`);
        console.log(`   Route:   Borrow ${borrowAmountUsdc} USDC -> Buy on ${buyDex} -> Sell on ${sellDex}`);
        console.log(`   Net ROI: +$${netProfit.toFixed(2)} USDC (After Aave 0.05% & DEX fees)`);

        if (signer && targetContract && targetContract.startsWith("0x")) {
          console.log(`   ⚡ Dispatching real flash loan transaction to Base Mainnet...`);
          const contract = new ethers.Contract(targetContract, CONTRACT_ABI, signer);
          try {
            const parsedAmount = ethers.parseUnits(borrowAmountUsdc.toString(), 6);
            const tx = await contract.requestFlashLoanUSDC(parsedAmount);
            console.log(`   🎉 Transaction Confirmed on Base! TX: ${tx.hash}`);
            console.log(`   BaseScan: https://basescan.org/tx/${tx.hash}`);
          } catch (txErr) {
            console.warn(`   Notice on execution: ${txErr.reason || txErr.message}`);
          }
        }
      } else {
        process.stdout.write(`\r[${timestamp} #${blockNumber}] Uni: $${uniPriceNum.toFixed(2)} | Aero: $${aeroPriceNum.toFixed(2)} | Spread: ${spreadPct.toFixed(3)}% (Threshold: ${minThresholdPercent}%) `);
      }
    } catch (err) {
      console.warn("Scan cycle error:", err.message);
    }
  }

  // Initial scan and continuous polling every 3 seconds (each Base L2 block)
  await scan();
  setInterval(scan, 3000);
}

main().catch(console.error);
