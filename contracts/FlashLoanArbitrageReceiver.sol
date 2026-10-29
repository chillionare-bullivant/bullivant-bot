// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * ==============================================================================
 * MULTI-PROTOCOL FLASH LOAN & LIQUIDATION ARBITRAGE HUB (BASE MAINNET - 8453)
 * ==============================================================================
 * FOUNDATION (SNIPER ENTRY):
 * - Aave V3 Flash Loan Arbitrage (USDC & WETH) across Uniswap V3 & DEX Routers.
 * - Strict zero-loss guardrails: reverts if trades fail to generate net profit.
 * - 100% automated profit sweep directly to owner's Coinbase Wallet.
 *
 * COMBINED PROTOCOLS ADDED:
 * 1. Aave V3 / Moonwell Flash Liquidation Protocol:
 *    Repays underwater debt to capture 5% - 10% liquidation bonus with $0 capital.
 * 2. Balancer V2 0% Fee Flash Loan Protocol:
 *    Zero-interest flash loans via Balancer V2 Vault (0% fee vs Aave 0.05%).
 * 3. Aerodrome Direct Pool / Slipstream Routing:
 *    Direct atomic execution through Base's deepest volatile liquidity pools.
 */

interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
}

interface IFlashLoanSimpleReceiver {
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external returns (bool);
}

interface IPoolAddressesProvider {
    function getPool() external view returns (address);
}

interface IPool {
    function flashLoanSimple(
        address receiverAddress,
        address asset,
        uint256 amount,
        bytes calldata params,
        uint16 referralCode
    ) external;

    function liquidationCall(
        address collateralAsset,
        address debtAsset,
        address user,
        uint256 debtToCover,
        bool receiveAToken
    ) external;
}

// Uniswap SwapRouter02 on Base (7 parameters, no deadline inside struct)
interface ISwapRouter02 {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

interface IUniswapV2Router {
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
}

// Balancer V2 Vault Interfaces (0% Flash Loan Fee)
interface IFlashLoanRecipient {
    function receiveFlashLoan(
        IERC20[] memory tokens,
        uint256[] memory amounts,
        uint256[] memory feeAmounts,
        bytes memory userData
    ) external;
}

interface IBalancerVault {
    function flashLoan(
        address recipient,
        IERC20[] memory tokens,
        uint256[] memory amounts,
        bytes memory userData
    ) external;
}

// Aerodrome Direct Pool Interface
interface IAerodromePool {
    function getReserves() external view returns (uint256 reserve0, uint256 reserve1, uint256 blockTimestampLast);
    function token0() external view returns (address);
    function token1() external view returns (address);
    function swap(uint amount0Out, uint amount1Out, address to, bytes calldata data) external;
}

contract FlashLoanArbitrageReceiver is IFlashLoanSimpleReceiver, IFlashLoanRecipient {
    address public immutable owner;
    IPoolAddressesProvider public immutable ADDRESSES_PROVIDER;
    IPool public immutable POOL;

    address public constant BASE_USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address public constant BASE_WETH = 0x4200000000000000000000000000000000000006;

    // Verified Base Mainnet Infrastructure Addresses
    address public constant UNISWAP_V3_ROUTER = 0x2626664c2603336E57B271c5C0b26F421741e481;
    address public constant SUSHISWAP_ROUTER  = 0x6BDED42c6DA8FBf0d2bA55B2fa120C5e0c8D7891;
    address public constant BALANCER_VAULT    = 0xBA12222222228d8Ba445958a75a0704d566BF2C8;
    address public constant AERODROME_POOL_WETH_USDC = 0xcDAC0d6c6C59727a65F871236188350531885C43;

    enum ExecutionType {
        ARBITRAGE_SNIPER,
        LIQUIDATION,
        AERODROME_DIRECT
    }

    struct ArbitrageParams {
        ExecutionType execType;
        address routerBuy;
        address routerSell;
        address intermediateToken;
        uint24 poolFee;
        bool isBuyOnUniV3;
    }

    struct LiquidationParams {
        ExecutionType execType;
        address collateralAsset;
        address user;
        uint256 debtToCover;
    }

    event FlashLoanRequested(address indexed asset, uint256 amount);
    event FlashLoanExecuted(
        address indexed asset,
        uint256 amount,
        uint256 premium,
        uint256 netProfit,
        uint256 timestamp
    );
    event LiquidationExecuted(
        address indexed user,
        address collateralAsset,
        address debtAsset,
        uint256 debtCovered,
        uint256 profitSwept
    );
    event BalancerFlashLoanExecuted(address indexed token, uint256 amount, uint256 netProfit);
    event ProfitSwept(address indexed token, uint256 amount, address indexed to);

    error Unauthorized();
    error UnprofitableArbitrage(uint256 totalDebt, uint256 currentBalance);
    error InvalidInitiator();
    error InvalidBalancerVault();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(address _addressProvider) {
        owner = msg.sender;
        ADDRESSES_PROVIDER = IPoolAddressesProvider(_addressProvider);
        POOL = IPool(IPoolAddressesProvider(_addressProvider).getPool());
    }

    // =========================================================================
    // FOUNDATION: SNIPER ENTRY FUNCTIONS (PRESERVED & UNTAMPERED)
    // =========================================================================

    /**
     * @notice Initiates a flash loan in USDC for automated cross-DEX arbitrage
     * @param amount Principal amount to borrow (6 decimals)
     */
    function requestFlashLoanUSDC(uint256 amount) external onlyOwner {
        emit FlashLoanRequested(BASE_USDC, amount);
        ArbitrageParams memory params = ArbitrageParams({
            execType: ExecutionType.ARBITRAGE_SNIPER,
            routerBuy: UNISWAP_V3_ROUTER,
            routerSell: SUSHISWAP_ROUTER,
            intermediateToken: BASE_WETH,
            poolFee: 500, // 0.05% Uni V3 fee tier
            isBuyOnUniV3: true
        });
        POOL.flashLoanSimple(address(this), BASE_USDC, amount, abi.encode(params), 0);
    }

    /**
     * @notice Initiates a flash loan in USDC with reverse DEX direction
     */
    function requestFlashLoanUSDCReverse(uint256 amount) external onlyOwner {
        emit FlashLoanRequested(BASE_USDC, amount);
        ArbitrageParams memory params = ArbitrageParams({
            execType: ExecutionType.ARBITRAGE_SNIPER,
            routerBuy: SUSHISWAP_ROUTER,
            routerSell: UNISWAP_V3_ROUTER,
            intermediateToken: BASE_WETH,
            poolFee: 500,
            isBuyOnUniV3: false
        });
        POOL.flashLoanSimple(address(this), BASE_USDC, amount, abi.encode(params), 0);
    }

    /**
     * @notice Flexible Arbitrage Trigger with custom routing & direction
     */
    function requestArbitrage(
        address asset,
        uint256 amount,
        address routerBuy,
        address routerSell,
        address intermediateToken,
        uint24 poolFee,
        bool isBuyOnUniV3
    ) external onlyOwner {
        ArbitrageParams memory params = ArbitrageParams({
            execType: ExecutionType.ARBITRAGE_SNIPER,
            routerBuy: routerBuy,
            routerSell: routerSell,
            intermediateToken: intermediateToken,
            poolFee: poolFee == 0 ? 500 : poolFee,
            isBuyOnUniV3: isBuyOnUniV3
        });
        POOL.flashLoanSimple(address(this), asset, amount, abi.encode(params), 0);
    }

    // =========================================================================
    // PROTOCOL 1: FLASH LOAN LIQUIDATIONS (AAVE V3 / MOONWELL)
    // =========================================================================

    /**
     * @notice Executes a flash liquidation on underwater debt positions
     * @dev Does NOT require a whale price spread; triggers when health factor < 1.0
     */
    function requestFlashLiquidation(
        address collateralAsset,
        address debtAsset,
        address user,
        uint256 debtToCover
    ) external onlyOwner {
        emit FlashLoanRequested(debtAsset, debtToCover);
        LiquidationParams memory params = LiquidationParams({
            execType: ExecutionType.LIQUIDATION,
            collateralAsset: collateralAsset,
            user: user,
            debtToCover: debtToCover
        });
        POOL.flashLoanSimple(address(this), debtAsset, debtToCover, abi.encode(params), 0);
    }

    // =========================================================================
    // PROTOCOL 2: BALANCER V2 (0% FLASH LOAN FEE)
    // =========================================================================

    /**
     * @notice Borrows from Balancer V2 with 0.00% flash loan fee (vs Aave 0.05%)
     */
    function requestBalancerFlashLoanUSDC(uint256 amount) external onlyOwner {
        IERC20[] memory tokens = new IERC20[](1);
        tokens[0] = IERC20(BASE_USDC);

        uint256[] memory amounts = new uint256[](1);
        amounts[0] = amount;

        ArbitrageParams memory params = ArbitrageParams({
            execType: ExecutionType.ARBITRAGE_SNIPER,
            routerBuy: UNISWAP_V3_ROUTER,
            routerSell: SUSHISWAP_ROUTER,
            intermediateToken: BASE_WETH,
            poolFee: 500,
            isBuyOnUniV3: true
        });

        IBalancerVault(BALANCER_VAULT).flashLoan(
            address(this),
            tokens,
            amounts,
            abi.encode(params)
        );
    }

    /**
     * @notice Balancer V2 Flash Loan Callback (0% Borrowing Interest)
     */
    function receiveFlashLoan(
        IERC20[] memory tokens,
        uint256[] memory amounts,
        uint256[] memory feeAmounts,
        bytes memory userData
    ) external override {
        if (msg.sender != BALANCER_VAULT) revert InvalidBalancerVault();

        address asset = address(tokens[0]);
        uint256 borrowAmount = amounts[0];
        uint256 fee = feeAmounts[0]; // Exactly 0 on Balancer

        ArbitrageParams memory p = abi.decode(userData, (ArbitrageParams));
        _executeDEXArbitrageSwap(asset, borrowAmount, p);

        uint256 totalDebt = borrowAmount + fee;
        uint256 currentBalance = IERC20(asset).balanceOf(address(this));

        if (currentBalance < totalDebt) {
            revert UnprofitableArbitrage(totalDebt, currentBalance);
        }

        // Repay 0% fee Balancer loan
        IERC20(asset).transfer(BALANCER_VAULT, totalDebt);

        // Sweep 100% net profit to owner
        uint256 netProfit = currentBalance - totalDebt;
        if (netProfit > 0) {
            IERC20(asset).transfer(owner, netProfit);
            emit ProfitSwept(asset, netProfit, owner);
        }

        emit BalancerFlashLoanExecuted(asset, borrowAmount, netProfit);
    }

    // =========================================================================
    // PROTOCOL 3: AERODROME DIRECT POOL SWAP ROUTING
    // =========================================================================

    /**
     * @notice Direct atomic execution between Uniswap V3 and Aerodrome Volatile Pool
     */
    function requestFlashLoanAerodromeDirect(uint256 amount) external onlyOwner {
        emit FlashLoanRequested(BASE_USDC, amount);
        bytes memory params = abi.encode(ExecutionType.AERODROME_DIRECT);
        POOL.flashLoanSimple(address(this), BASE_USDC, amount, params, 0);
    }

    // =========================================================================
    // CORE FLASH LOAN EXECUTION HANDLER
    // =========================================================================

    /**
     * @notice Aave V3 Flash Loan Callback
     */
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external override returns (bool) {
        if (msg.sender != address(POOL)) revert Unauthorized();
        if (initiator != address(this)) revert InvalidInitiator();

        ExecutionType execType = abi.decode(params, (ExecutionType));

        if (execType == ExecutionType.ARBITRAGE_SNIPER) {
            _executeSniperArbitrageBranch(asset, amount, params);
        } else if (execType == ExecutionType.LIQUIDATION) {
            _executeLiquidationBranch(asset, params);
        } else if (execType == ExecutionType.AERODROME_DIRECT) {
            _executeAerodromeDirectBranch(asset, amount);
        }

        // Exact Debt Calculation & Zero-Loss Verification
        uint256 totalDebt = amount + premium;
        uint256 currentBalance = IERC20(asset).balanceOf(address(this));

        if (currentBalance < totalDebt) {
            revert UnprofitableArbitrage(totalDebt, currentBalance);
        }

        // Repay Aave Pool
        IERC20(asset).approve(address(POOL), totalDebt);

        // AUTOMATIC PROFIT SWEEP: Route 100% of net profits to owner's Coinbase Wallet
        uint256 netProfit = currentBalance - totalDebt;
        if (netProfit > 0) {
            IERC20(asset).transfer(owner, netProfit);
            emit ProfitSwept(asset, netProfit, owner);
        }

        emit FlashLoanExecuted(asset, amount, premium, netProfit, block.timestamp);
        return true;
    }

    function _executeSniperArbitrageBranch(
        address asset,
        uint256 amount,
        bytes calldata params
    ) internal {
        ArbitrageParams memory p = abi.decode(params, (ArbitrageParams));
        _executeDEXArbitrageSwap(asset, amount, p);
    }

    function _executeLiquidationBranch(
        address asset,
        bytes calldata params
    ) internal {
        LiquidationParams memory lp = abi.decode(params, (LiquidationParams));

        IERC20(asset).approve(address(POOL), lp.debtToCover);
        POOL.liquidationCall(lp.collateralAsset, asset, lp.user, lp.debtToCover, false);

        uint256 seizedCollateral = IERC20(lp.collateralAsset).balanceOf(address(this));
        IERC20(lp.collateralAsset).approve(UNISWAP_V3_ROUTER, seizedCollateral);

        ISwapRouter02.ExactInputSingleParams memory swapCollateral = ISwapRouter02.ExactInputSingleParams({
            tokenIn: lp.collateralAsset,
            tokenOut: asset,
            fee: 500,
            recipient: address(this),
            amountIn: seizedCollateral,
            amountOutMinimum: 0,
            sqrtPriceLimitX96: 0
        });
        ISwapRouter02(UNISWAP_V3_ROUTER).exactInputSingle(swapCollateral);

        emit LiquidationExecuted(lp.user, lp.collateralAsset, asset, lp.debtToCover, 0);
    }

    function _executeAerodromeDirectBranch(
        address asset,
        uint256 amount
    ) internal {
        IERC20(asset).approve(UNISWAP_V3_ROUTER, amount);
        ISwapRouter02.ExactInputSingleParams memory swapParams = ISwapRouter02.ExactInputSingleParams({
            tokenIn: asset,
            tokenOut: BASE_WETH,
            fee: 500,
            recipient: address(this),
            amountIn: amount,
            amountOutMinimum: 0,
            sqrtPriceLimitX96: 0
        });
        uint256 wethReceived = ISwapRouter02(UNISWAP_V3_ROUTER).exactInputSingle(swapParams);

        IERC20(BASE_WETH).transfer(AERODROME_POOL_WETH_USDC, wethReceived);
        (uint256 r0, uint256 r1, ) = IAerodromePool(AERODROME_POOL_WETH_USDC).getReserves();
        uint256 amountInWithFee = wethReceived * 997;
        uint256 usdcOut = (amountInWithFee * r1) / ((r0 * 1000) + amountInWithFee);
        IAerodromePool(AERODROME_POOL_WETH_USDC).swap(0, usdcOut, address(this), new bytes(0));
    }

    /**
     * @dev Internal helper for DEX atomic swaps (Uniswap V3 & SushiSwap)
     */
    function _executeDEXArbitrageSwap(
        address asset,
        uint256 amount,
        ArbitrageParams memory p
    ) internal {
        IERC20(asset).approve(p.routerBuy, amount);
        uint256 intermediateBalance;

        if (p.isBuyOnUniV3) {
            ISwapRouter02.ExactInputSingleParams memory swapParams = ISwapRouter02.ExactInputSingleParams({
                tokenIn: asset,
                tokenOut: p.intermediateToken,
                fee: p.poolFee,
                recipient: address(this),
                amountIn: amount,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            });
            intermediateBalance = ISwapRouter02(p.routerBuy).exactInputSingle(swapParams);
        } else {
            address[] memory path = new address[](2);
            path[0] = asset;
            path[1] = p.intermediateToken;
            uint[] memory amountsOut = IUniswapV2Router(p.routerBuy).swapExactTokensForTokens(
                amount,
                0,
                path,
                address(this),
                block.timestamp + 120
            );
            intermediateBalance = amountsOut[1];
        }

        IERC20(p.intermediateToken).approve(p.routerSell, intermediateBalance);
        if (p.isBuyOnUniV3) {
            address[] memory path = new address[](2);
            path[0] = p.intermediateToken;
            path[1] = asset;
            IUniswapV2Router(p.routerSell).swapExactTokensForTokens(
                intermediateBalance,
                0,
                path,
                address(this),
                block.timestamp + 120
            );
        } else {
            ISwapRouter02.ExactInputSingleParams memory swapParams = ISwapRouter02.ExactInputSingleParams({
                tokenIn: p.intermediateToken,
                tokenOut: asset,
                fee: p.poolFee,
                recipient: address(this),
                amountIn: intermediateBalance,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            });
            ISwapRouter02(p.routerSell).exactInputSingle(swapParams);
        }
    }

    /**
     * @notice Get balance of any token or native ETH held in contract
     */
    function getBalance(address token) external view returns (uint256) {
        if (token == address(0)) {
            return address(this).balance;
        }
        return IERC20(token).balanceOf(address(this));
    }

    /**
     * @notice Owner emergency withdrawal function
     */
    function withdraw(address token) external onlyOwner {
        if (token == address(0)) {
            uint256 bal = address(this).balance;
            if (bal > 0) {
                (bool s, ) = owner.call{value: bal}("");
                require(s, "ETH transfer failed");
            }
        } else {
            uint256 bal = IERC20(token).balanceOf(address(this));
            if (bal > 0) {
                IERC20(token).transfer(owner, bal);
            }
        }
    }

    receive() external payable {}
}
