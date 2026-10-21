const { ethers } = require("ethers");
require("dotenv").config();

// Minimal ABIs
const uniV3PoolAbi = [
    "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)"
];
const sushiswapPairAbi = [
    "event Sync(uint112 reserve0, uint112 reserve1)"
];

// Target tracking addresses (Example: WETH/USDC pools on two different DEXs)
const poolUniswapV3 = "0x88e6A0c2dDD26FEEb64F039a2c41296fcB3f5640";
const poolSushiSwap = "0x397FF1542f962076d0BFE58eA045FfA2d3470acd";

const ARBITRAGE_CONTRACT_ADDRESS = process.env.ARBITRAGE_CONTRACT_ADDRESS || "0x89205A3A3b2A69De6Dbf7f01ED13B2108B2c43e7";

// Parse CLI flags
const args = process.argv.slice(2);
function getArg(flag, defaultVal) {
    const idx = args.indexOf(flag);
    if (idx !== -1 && args[idx + 1]) return args[idx + 1];
    return defaultVal;
}
const customThreshold = parseFloat(getArg("--threshold", "0.40"));
const customSpreadTarget = getArg("--spread", null);

let latestPrices = {
    uniswap: 0n,
    sushiswap: 0n
};

function convertSqrtPriceToNumber(sqrtPriceX96) {
    const q96 = 2n ** 96n;
    const priceX192 = (sqrtPriceX96 * sqrtPriceX96);
    const scale = 2n ** 192n;
    const rawRatio = Number(priceX192) / Number(scale);
    return rawRatio * 1e12;
}

async function evaluateCrossDEXSpread(botWallet) {
    if (latestPrices.uniswap === 0n || latestPrices.sushiswap === 0n) return;

    const uniPriceFormatted = convertSqrtPriceToNumber(latestPrices.uniswap);
    const sushiPriceFormatted = Number(ethers.formatUnits(latestPrices.sushiswap, 18));

    const priceDifference = Math.abs(uniPriceFormatted - sushiPriceFormatted);
    const spreadPercentage = (priceDifference / sushiPriceFormatted) * 100;

    console.log(`📊 Current Spread: ${spreadPercentage.toFixed(4)}% (Uni: ${uniPriceFormatted.toFixed(2)} | Sushi: ${sushiPriceFormatted.toFixed(2)})`);

    if (spreadPercentage > customThreshold) {
        console.log(`🚀 Lucrative price divergence discovered (${spreadPercentage.toFixed(2)}% > threshold ${customThreshold}%)! Executing...`);
        await triggerExecutionPipeline(botWallet, spreadPercentage, uniPriceFormatted, sushiPriceFormatted);
    }
}

async function triggerExecutionPipeline(botWallet, spread = 0.45, uniPrice = 3120, sushiPrice = 3105) {
    const contractAbi = ["function requestFlashLoan(address asset, uint256 amount) external"];

    if (!botWallet) {
        const borrowUSDC = 5000;
        const grossProfit = (spread / 100) * borrowUSDC;
        const flashLoanFee = (0.05 / 100) * borrowUSDC;
        const netProfit = grossProfit - flashLoanFee;

        console.log(`🔒 [Simulation] Arbitrage payload triggered:`);
        console.log(`   - Target Asset: USDC (0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48)`);
        console.log(`   - Borrow Amount: 5,000 USDC`);
        console.log(`   - Estimated Gross Spread: $${grossProfit.toFixed(2)}`);
        console.log(`   - Flash Loan Fee (0.05%): $${flashLoanFee.toFixed(2)}`);
        console.log(`   - Est. Net Profit: $${netProfit.toFixed(2)}`);
        console.log(`   - Destination Contract: ${ARBITRAGE_CONTRACT_ADDRESS}`);
        console.log(`   - Simulated Flashbots Bundle TX: 0x${Buffer.from(ethers.randomBytes(32)).toString("hex")}`);
        return;
    }

    const arbitrageContract = new ethers.Contract(ARBITRAGE_CONTRACT_ADDRESS, contractAbi, botWallet);

    try {
        const assetToBorrow = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // Base USDC
        const borrowAmount = ethers.parseUnits("5000", 6);

        // Private Transaction Routing via Flashbots Protect & Private Builder
        const privateProvider = new ethers.JsonRpcProvider(
            process.env.PRIVATE_RPC_URL || "https://rpc.flashbots.net/fast",
            { chainId: 8453, name: "base" },
            { staticNetwork: true }
        );

        const privateSigner = botWallet.connect ? botWallet.connect(privateProvider) : botWallet;
        const privateContract = new ethers.Contract(ARBITRAGE_CONTRACT_ADDRESS, contractAbi, privateSigner);

        const tx = await privateContract.requestFlashLoan(assetToBorrow, borrowAmount, {
            gasLimit: 350000
        });
        console.log(`🔒 Arbitrage payload dispatched privately via Flashbots: ${tx.hash}`);
        console.log(`🛡️  0% Mempool Exposure - Front-running & sandwich bots prevented.`);
    } catch (error) {
        console.error("Execution skipped or aborted:", error.reason || error.message);
    }
}

async function startMultiPoolScanner() {
    console.log("🔍 Initializing multi-DEX liquidity scanner...");

    const wssUrl = process.env.WSS_RPC_URL;
    if (!wssUrl) {
        console.log("⚠️  WSS_RPC_URL not set in environment. Running fast demonstration mode...");
        const targetSpreadNum = customSpreadTarget ? parseFloat(customSpreadTarget) : 0.66;
        const basePrice = 3105.0;
        const uniPrice = basePrice * (1 + targetSpreadNum / 100);

        const rawRatio = uniPrice / 1e12;
        const sqrtBig = BigInt(Math.floor(Math.sqrt(rawRatio) * 1e12)) * (2n ** 96n) / 1000000000000n;
        latestPrices.uniswap = sqrtBig;
        latestPrices.sushiswap = (BigInt(Math.floor(basePrice)) * (10n ** 18n) * ethers.parseUnits("1", 18)) / ethers.parseUnits("1", 18);
        await evaluateCrossDEXSpread(null);
        return;
    }

    let botWallet = null;
    if (process.env.PRIVATE_KEY) {
        try {
            botWallet = new ethers.Wallet(process.env.PRIVATE_KEY);
        } catch (_e) {
            // Safe fallback
        }
    }
    let provider = null;
    if (wssUrl && (wssUrl.startsWith("wss://") || wssUrl.startsWith("ws://"))) {
        try {
            provider = new ethers.WebSocketProvider(wssUrl);
            if (botWallet) botWallet = botWallet.connect(provider);
        } catch (_err) {
            // Ignore
        }
    }
    if (!provider) return;
    const uniContract = new ethers.Contract(poolUniswapV3, uniV3PoolAbi, provider);
    const sushiContract = new ethers.Contract(poolSushiSwap, sushiswapPairAbi, provider);

    uniContract.on("Swap", async (sender, recipient, amount0, amount1, sqrtPriceX96) => {
        latestPrices.uniswap = sqrtPriceX96;
        evaluateCrossDEXSpread(botWallet);
    });

    sushiContract.on("Sync", async (reserve0, reserve1) => {
        if (reserve0 > 0n) {
            latestPrices.sushiswap = (reserve1 * ethers.parseUnits("1", 18)) / reserve0;
            evaluateCrossDEXSpread(botWallet);
        }
    });
}

startMultiPoolScanner();
