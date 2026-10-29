#!/usr/bin/env node
/**
 * ==============================================================================
 * BULLIVANT AUTONOMOUS BASE MAINNET MULTI-PROTOCOL SCANNER & LIQUIDATOR BOT
 * ==============================================================================
 * Concurrently runs two continuous engines:
 * 1. Cross-DEX Arbitrage Sniper:
 *    Scans real-time on-chain reserves from Uniswap V3 and Aerodrome.
 *    Captures price spreads via atomic flash loans with zero-gas simulation.
 *
 * 2. Aave V3 Flash Loan Liquidation Bot:
 *    Continuously monitors lending pool accounts for Health Factor < 1.0.
 *    Does NOT rely on whale trades; seizes discounted collateral with 5%-10%
 *    bonus using $0 principal flash loans and sweeps profit to owner!
 */

const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const BASE_RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const UNI_POOL_ADDRESS = "0xd0b53D9277642d899DF5C87A3966A349A798F224"; // Uni V3 0.05%
const AERO_POOL_ADDRESS = "0xcDAC0d6c6C59727a65F871236188350531885C43"; // Aerodrome Volatile
const AAVE_V3_POOL_ADDRESS = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5"; // Aave V3 Pool Base

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

const AAVE_POOL_ABI = [
  "function getUserAccountData(address user) view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)"
];

const CONTRACT_ABI = [
  "function requestFlashLoanUSDC(uint256 amount) external",
  "function requestFlashLoanUSDCReverse(uint256 amount) external",
  "function executeLiquidation(address collateralAsset, address debtAsset, address userToLiquidate, uint256 debtToCover) external",
  "function requestFlashLiquidation(address collateralAsset, address debtAsset, address user, uint256 debtToCover) external",
  "function requestBalancerFlashLoanUSDC(uint256 amount) external",
  "function requestFlashLoanAerodromeDirect(uint256 amount) external",
  "function owner() view returns (address)"
];

const targetContract = process.env.BASE_FLASHLOAN_CONTRACT_ADDRESS || 
  process.env.LEVERAGE_CONTRACT_ADDRESS || 
  "0x162051AE566AE663501CF8E181186976Ae9474d0";

const minThresholdPercent = parseFloat(process.env.MIN_SPREAD_THRESHOLD || "0.15");
const borrowAmountUsdc = parseFloat(process.env.BORROW_AMOUNT_USDC || "10000");

// Tracked active borrowers queue on Aave V3 Base
const trackedBorrowers = new Set([
  "0xD6d68800CD199D990C7ACCff409bE60c6508660a"
]);

async function main() {
  console.log("==================================================");
  console.log("🚀 BULLIVANT MULTI-PROTOCOL MEV BOT (BASE 8453)");
  console.log("1. Sniper Engine:   Uniswap V3 ⇄ Aerodrome");
  console.log("2. Liquidator:      Aave V3 Health Factor < 1.0");
  console.log("Contract Address:  ", targetContract);
  console.log("Threshold:          >" + minThresholdPercent + "% spread");
  console.log("==================================================");

  const provider = new ethers.JsonRpcProvider(BASE_RPC_URL);
  const uniContract = new ethers.Contract(UNI_POOL_ADDRESS, UNI_POOL_ABI, provider);
  const aeroContract = new ethers.Contract(AERO_POOL_ADDRESS, AERO_POOL_ABI, provider);
  const aavePoolContract = new ethers.Contract(AAVE_V3_POOL_ADDRESS, AAVE_POOL_ABI, provider);

  let signer = null;
  const privateKey = process.env.PRIVATE_KEY || process.env.SIGNER_PRIVATE_KEY;
  if (privateKey && privateKey.startsWith("0x") && privateKey.length === 66 && !privateKey.includes("YourActualRealPrivateKey")) {
    signer = new ethers.Wallet(privateKey, provider);
    console.log("Signer configured: ", signer.address);
  } else {
    console.log("Running in scanning & simulation mode (read-only).");
  }

  // ---------------------------------------------------------------------------
  // ENGINE 1: CROSS-DEX ARBITRAGE SNIPER (UNTAMPERED FOUNDATION)
  // ---------------------------------------------------------------------------
  async function scanArbitrage() {
    try {
      const [blockNumber, uniSlot0, aeroReserves] = await Promise.all([
        provider.getBlockNumber(),
        uniContract.slot0(),
        aeroContract.getReserves()
      ]);

      const sqrtPriceX96 = BigInt(uniSlot0[0]);
      const uniPriceNum = Number((sqrtPriceX96 * sqrtPriceX96 * 1000000000000n) / (2n ** 192n));

      const [r0, r1] = aeroReserves;
      const aeroPriceNum = (Number(r1) / 1e6) / (Number(r0) / 1e18);

      const diff = Math.abs(uniPriceNum - aeroPriceNum);
      const avg = (uniPriceNum + aeroPriceNum) / 2;
      const spreadPct = (diff / avg) * 100;

      const buyDex = uniPriceNum < aeroPriceNum ? "Uniswap V3" : "Aerodrome";
      const sellDex = uniPriceNum < aeroPriceNum ? "Aerodrome" : "Uniswap V3";
      const buyPrice = Math.min(uniPriceNum, aeroPriceNum);
      const sellPrice = Math.max(uniPriceNum, aeroPriceNum);

      const grossProfit = (spreadPct / 100) * borrowAmountUsdc;
      const aaveFee = (0.05 / 100) * borrowAmountUsdc;
      const dexFees = (0.10 / 100) * borrowAmountUsdc;
      const netProfit = grossProfit - aaveFee - dexFees - 0.005;
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

      try {
        fs.writeFileSync(path.resolve(process.cwd(), "live_arbitrage.json"), JSON.stringify(payload, null, 2));
      } catch {}

      const timestamp = new Date().toLocaleTimeString();
      if (isProfitable) {
        console.log(`\n🔥 [${timestamp} Block #${blockNumber}] PROFITABLE SPREAD DETECTED!`);
        console.log(`   Uni V3:  $${uniPriceNum.toFixed(2)} | Aero: $${aeroPriceNum.toFixed(2)} | Spread: ${spreadPct.toFixed(3)}% ($${diff.toFixed(2)}/ETH)`);
        console.log(`   Route:   Borrow ${borrowAmountUsdc} USDC -> Buy on ${buyDex} -> Sell on ${sellDex}`);

        if (signer && targetContract && targetContract.startsWith("0x")) {
          const contract = new ethers.Contract(targetContract, CONTRACT_ABI, signer);
          try {
            const parsedAmount = ethers.parseUnits(borrowAmountUsdc.toString(), 6);
            
            // ZERO-GAS PRE-SIMULATION
            if (buyDex === "Uniswap V3") {
              await contract.requestFlashLoanUSDC.staticCall(parsedAmount);
            } else {
              await contract.requestFlashLoanUSDCReverse.staticCall(parsedAmount);
            }

            console.log(`   ⚡ Simulation verified profitable! Dispatching real transaction...`);
            let tx;
            if (buyDex === "Uniswap V3") {
              tx = await contract.requestFlashLoanUSDC(parsedAmount, { gasLimit: 650000 });
            } else {
              tx = await contract.requestFlashLoanUSDCReverse(parsedAmount, { gasLimit: 650000 });
            }
            console.log(`   🎉 Transaction Broadcast on Base! TX: ${tx.hash}`);
            await tx.wait(1);
            console.log(`   ✅ Confirmed! Profit swept to Coinbase Wallet (${signer.address})`);
          } catch (txErr) {
            console.warn(`   🛡️ Zero-Gas Guard: Opportunity did not clear slippage in simulation. Skipping broadcast ($0.00 gas spent).`);
          }
        }
      } else {
        process.stdout.write(`\r[${timestamp} #${blockNumber}] Uni: $${uniPriceNum.toFixed(2)} | Aero: $${aeroPriceNum.toFixed(2)} | Spread: ${spreadPct.toFixed(3)}% (Threshold: ${minThresholdPercent}%) `);
      }
    } catch (err) {
      // Non-blocking
    }
  }

  // ---------------------------------------------------------------------------
  // ENGINE 2: AAVE V3 FLASH LOAN LIQUIDATION MONITOR
  // ---------------------------------------------------------------------------
  async function scanLiquidations() {
    try {
      const alerts = [];
      const now = Date.now();

      for (const borrower of trackedBorrowers) {
        try {
          const data = await aavePoolContract.getUserAccountData(borrower);
          const totalDebtBase = Number(data.totalDebtBase) / 1e8; // Aave base currency is 8 decimals
          const totalCollateralBase = Number(data.totalCollateralBase) / 1e8;
          const hfRaw = data.healthFactor;
          const hf = hfRaw > 100000000000000000000n ? 999.0 : Number(hfRaw) / 1e18;

          const isLiquidationReady = hf < 1.0 && totalDebtBase > 0;
          const isAtRisk = hf >= 1.0 && hf < 1.15 && totalDebtBase > 0;

          alerts.push({
            borrower,
            collateralAsset: "WETH",
            debtAsset: "USDC",
            collateralAddress: WETH_ADDRESS,
            debtAddress: USDC_ADDRESS,
            collateralUsd: parseFloat(totalCollateralBase.toFixed(2)),
            debtUsd: parseFloat(totalDebtBase.toFixed(2)),
            healthFactor: parseFloat(hf.toFixed(3)),
            status: isLiquidationReady ? "LIQUIDATION_READY" : isAtRisk ? "HIGH_RISK_WATCHLIST" : "COLLATERALIZED_SAFE",
            liquidationBonusPct: 5.0,
            estimatedBonusUsd: parseFloat(((totalDebtBase * 0.5) * 0.05).toFixed(2)),
            debtToCoverUsdc: parseFloat((totalDebtBase * 0.5).toFixed(2))
          });

          if (isLiquidationReady) {
            console.log(`\n🚨 [LIQUIDATION OPPORTUNITY] Account ${borrower} Health Factor: ${hf.toFixed(3)} (< 1.0)`);
            if (signer && targetContract && targetContract.startsWith("0x")) {
              const contract = new ethers.Contract(targetContract, CONTRACT_ABI, signer);
              try {
                const debtToCover = data.totalDebtBase / 2n;
                console.log(`   🔍 Simulating Flash Liquidation (Zero Gas)...`);
                await contract.executeLiquidation.staticCall(
                  WETH_ADDRESS,
                  USDC_ADDRESS,
                  borrower,
                  debtToCover
                );

                console.log(`   ⚡ Liquidation Simulation Confirmed! Executing on Base...`);
                const tx = await contract.executeLiquidation(
                  WETH_ADDRESS,
                  USDC_ADDRESS,
                  borrower,
                  debtToCover,
                  { gasLimit: 850000 }
                );
                console.log(`   🎉 Liquidation Broadcast! TX: ${tx.hash}`);
                await tx.wait(1);
                console.log(`   ✅ Confirmed! 5%-10% Liquidation Bonus Swept to Coinbase Wallet!`);
              } catch (liqErr) {
                console.warn(`   🛡️ Zero-Gas Guard: Liquidation bonus does not clear swap slippage. Skipping ($0.00 gas spent).`);
              }
            }
          }
        } catch {}
      }

      try {
        fs.writeFileSync(
          path.resolve(process.cwd(), "live_liquidations.json"),
          JSON.stringify({
            timestamp: new Date().toISOString(),
            pool: AAVE_V3_POOL_ADDRESS,
            totalMonitored: alerts.length,
            alerts
          }, null, 2)
        );
      } catch {}
    } catch (e) {
      // Background check
    }
  }

  // Run initial scan and schedule continuous loops
  await scanArbitrage();
  setInterval(scanArbitrage, 3000);   // Arbitrage checks every 3s (each Base block)
  setInterval(scanLiquidations, 15000); // Liquidation health factor audit every 15s
}

main().catch(console.error);
