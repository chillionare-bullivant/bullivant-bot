// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * ==============================================================================
 * FLASH LOAN ARBITRAGE RECEIVER (BASE MAINNET - CHAIN ID 8453)
 * ==============================================================================
 * Borrows flash loans from Aave V3 on Base, executes cross-DEX atomic arbitrage
 * between Uniswap V3 and SushiSwap/Aerodrome, repays Aave, and transfers 100%
 * of net profits directly to the owner's Coinbase Wallet.
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
}

interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 deadline;
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

contract FlashLoanArbitrageReceiver is IFlashLoanSimpleReceiver {
    address public immutable owner;
    IPoolAddressesProvider public immutable ADDRESSES_PROVIDER;
    IPool public immutable POOL;

    address public constant BASE_USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address public constant BASE_WETH = 0x4200000000000000000000000000000000000006;

    // Verified Base Mainnet Router Addresses
    address public constant UNISWAP_V3_ROUTER = 0x2626664c2603336E57B271c5C0b26F421741e481;
    address public constant SUSHISWAP_ROUTER  = 0x6BDED42c6DA8FBf0d2bA55B2fa120C5e0c8D7891;

    event FlashLoanRequested(address indexed asset, uint256 amount);
    event FlashLoanExecuted(
        address indexed asset,
        uint256 amount,
        uint256 premium,
        uint256 netProfit,
        uint256 timestamp
    );
    event ProfitSwept(address indexed token, uint256 amount, address indexed to);

    error Unauthorized();
    error UnprofitableArbitrage(uint256 totalDebt, uint256 currentBalance);
    error InvalidInitiator();

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    constructor(address _addressProvider) {
        owner = msg.sender;
        ADDRESSES_PROVIDER = IPoolAddressesProvider(_addressProvider);
        POOL = IPool(IPoolAddressesProvider(_addressProvider).getPool());
    }

    /**
     * @notice Initiates a flash loan in USDC for automated arbitrage
     * @param amount The principal amount to borrow (6 decimals, e.g. 10000000000 for 10k USDC)
     */
    function requestFlashLoanUSDC(uint256 amount) external onlyOwner {
        emit FlashLoanRequested(BASE_USDC, amount);
        bytes memory params = abi.encode(
            UNISWAP_V3_ROUTER,
            SUSHISWAP_ROUTER,
            BASE_WETH,
            uint24(500), // 0.05% Uni V3 WETH/USDC fee tier
            true         // Buy on Uni V3, Sell on SushiSwap
        );
        POOL.flashLoanSimple(address(this), BASE_USDC, amount, params, 0);
    }

    /**
     * @notice Initiates a flash loan in USDC with reverse DEX direction
     */
    function requestFlashLoanUSDCReverse(uint256 amount) external onlyOwner {
        emit FlashLoanRequested(BASE_USDC, amount);
        bytes memory params = abi.encode(
            SUSHISWAP_ROUTER,
            UNISWAP_V3_ROUTER,
            BASE_WETH,
            uint24(500),
            false        // Buy on SushiSwap, Sell on Uni V3
        );
        POOL.flashLoanSimple(address(this), BASE_USDC, amount, params, 0);
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
        bytes memory params = abi.encode(
            routerBuy,
            routerSell,
            intermediateToken,
            poolFee,
            isBuyOnUniV3
        );
        POOL.flashLoanSimple(address(this), asset, amount, params, 0);
    }

    /**
     * @notice Aave V3 Flash Loan Execution Callback
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

        (
            address routerBuy,
            address routerSell,
            address intermediateToken,
            uint24 poolFee,
            bool isBuyOnUniV3
        ) = abi.decode(params, (address, address, address, uint24, bool));

        if (poolFee == 0) poolFee = 500;

        // 1. STEP A: Swap borrowed asset -> intermediateToken on DEX A
        IERC20(asset).approve(routerBuy, amount);
        uint256 intermediateBalance;

        if (isBuyOnUniV3) {
            ISwapRouter.ExactInputSingleParams memory swapParams = ISwapRouter.ExactInputSingleParams({
                tokenIn: asset,
                tokenOut: intermediateToken,
                fee: poolFee,
                recipient: address(this),
                deadline: block.timestamp + 120,
                amountIn: amount,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            });
            intermediateBalance = ISwapRouter(routerBuy).exactInputSingle(swapParams);
        } else {
            address[] memory path = new address[](2);
            path[0] = asset;
            path[1] = intermediateToken;
            uint[] memory amountsOut = IUniswapV2Router(routerBuy).swapExactTokensForTokens(
                amount,
                0,
                path,
                address(this),
                block.timestamp + 120
            );
            intermediateBalance = amountsOut[1];
        }

        // 2. STEP B: Swap intermediateToken -> original asset on DEX B
        IERC20(intermediateToken).approve(routerSell, intermediateBalance);
        if (isBuyOnUniV3) {
            address[] memory path = new address[](2);
            path[0] = intermediateToken;
            path[1] = asset;
            IUniswapV2Router(routerSell).swapExactTokensForTokens(
                intermediateBalance,
                0,
                path,
                address(this),
                block.timestamp + 120
            );
        } else {
            ISwapRouter.ExactInputSingleParams memory swapParams = ISwapRouter.ExactInputSingleParams({
                tokenIn: intermediateToken,
                tokenOut: asset,
                fee: poolFee,
                recipient: address(this),
                deadline: block.timestamp + 120,
                amountIn: intermediateBalance,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            });
            ISwapRouter(routerSell).exactInputSingle(swapParams);
        }

        // 3. Exact Repayment Calculation
        uint256 totalDebt = amount + premium;
        uint256 currentBalance = IERC20(asset).balanceOf(address(this));

        // Enforce Zero-Loss Invariant:
        if (currentBalance < totalDebt) {
            revert UnprofitableArbitrage(totalDebt, currentBalance);
        }

        // 4. Repay Aave V3 Pool
        IERC20(asset).approve(address(POOL), totalDebt);

        // 5. AUTOMATIC PROFIT SWEEP: Instantly transfer all net surplus to owner Coinbase Wallet
        uint256 netProfit = currentBalance - totalDebt;
        if (netProfit > 0) {
            IERC20(asset).transfer(owner, netProfit);
            emit ProfitSwept(asset, netProfit, owner);
        }

        emit FlashLoanExecuted(asset, amount, premium, netProfit, block.timestamp);
        return true;
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
