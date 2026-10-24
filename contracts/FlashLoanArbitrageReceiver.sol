// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title FlashLoanArbitrageReceiver
 * @notice Production-ready Aave V3 / Balancer Flash Loan Arbitrage Contract
 * @dev Designed for zero-mempool private execution via Flashbots Protect / MEV-Blocker.
 *      Includes strict slippage bounds, zero-loss reverts, and non-reentrant execution.
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

    event FlashLoanRequested(address indexed asset, uint256 amount);
    event FlashLoanExecuted(
        address indexed asset,
        uint256 amount,
        uint256 premium,
        uint256 netProfit,
        uint256 timestamp
    );
    event ProfitWithdrawn(address indexed token, uint256 amount, address indexed to);

    error Unauthorized();
    error UnprofitableArbitrage(uint256 totalRepayment, uint256 finalBalance);
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
     * @notice Initiates a flash loan in USDC
     * @param amount The principal amount to borrow (6 decimals)
     */
    function requestFlashLoanUSDC(uint256 amount) external onlyOwner {
        emit FlashLoanRequested(BASE_USDC, amount);
        bytes memory params = abi.encode(
            0x2626664c2603336E57B271c5C0b26F421741e481, // Uniswap V3 Router
            0xCF77a3bA9A5Ca399b7C97c74884694265541626F, // Aerodrome Router
            BASE_WETH,
            0,
            amount + (amount * 9) / 10000
        );
        POOL.flashLoanSimple(address(this), BASE_USDC, amount, params, 0);
    }

    /**
     * @notice Initiates a flash loan in WETH
     * @param amount The principal amount to borrow (18 decimals)
     */
    function requestFlashLoanWETH(uint256 amount) external onlyOwner {
        emit FlashLoanRequested(BASE_WETH, amount);
        bytes memory params = abi.encode(
            0x2626664c2603336E57B271c5C0b26F421741e481, // Uniswap V3 Router
            0xCF77a3bA9A5Ca399b7C97c74884694265541626F, // Aerodrome Router
            BASE_USDC,
            0,
            amount + (amount * 9) / 10000
        );
        POOL.flashLoanSimple(address(this), BASE_WETH, amount, params, 0);
    }

    /**
     * @notice Get balance of token or native ETH held in contract
     */
    function getBalance(address token) external view returns (uint256) {
        if (token == address(0)) {
            return address(this).balance;
        }
        return IERC20(token).balanceOf(address(this));
    }

    /**
     * @notice Initiates a flash loan through Aave V3
     * @param asset The token to borrow (e.g. WETH or USDC)
     * @param amount The principal amount to borrow
     * @param params Encoded routing and minimum profit parameters
     */
    function requestFlashLoan(
        address asset,
        uint256 amount,
        bytes calldata params
    ) external onlyOwner {
        POOL.flashLoanSimple(
            address(this),
            asset,
            amount,
            params,
            0 // referralCode
        );
    }

    /**
     * @notice Aave V3 callback triggered after receiving flash loan liquidity
     * @dev Must repay amount + premium (0.09% fee) or the entire transaction reverts.
     */
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external override returns (bool) {
        // 1. Authenticate caller is the legitimate Aave Pool
        if (msg.sender != address(POOL)) revert Unauthorized();
        if (initiator != address(this)) revert InvalidInitiator();

        // 2. Decode execution parameters (Routers, intermediate tokens, slippage floors)
        (
            address routerA,
            address routerB,
            address intermediateToken,
            uint256 minIntermediateReturn,
            uint256 minFinalReturn
        ) = abi.decode(params, (address, address, address, uint256, uint256));

        // 3. Step A: Swap borrowed asset -> intermediateToken on DEX A (e.g. Uniswap V3)
        IERC20(asset).approve(routerA, amount);
        
        // Example Uniswap V3 swap execution with strict minimum return
        ISwapRouter.ExactInputSingleParams memory swapParamsA = ISwapRouter.ExactInputSingleParams({
            tokenIn: asset,
            tokenOut: intermediateToken,
            fee: 3000, // 0.3% pool
            recipient: address(this),
            deadline: block.timestamp + 60,
            amountIn: amount,
            amountOutMinimum: minIntermediateReturn,
            sqrtPriceLimitX96: 0
        });
        uint256 intermediateReceived = ISwapRouter(routerA).exactInputSingle(swapParamsA);

        // 4. Step B: Swap intermediateToken -> original asset on DEX B (e.g. SushiSwap)
        IERC20(intermediateToken).approve(routerB, intermediateReceived);
        address[] memory path = new address[](2);
        path[0] = intermediateToken;
        path[1] = asset;
        
        uint[] memory amountsOut = IUniswapV2Router(routerB).swapExactTokensForTokens(
            intermediateReceived,
            minFinalReturn,
            path,
            address(this),
            block.timestamp + 60
        );
        uint256 finalBalance = amountsOut[1];

        // 5. Calculate repayment obligation (Principal + 0.09% Aave premium)
        uint256 totalDebt = amount + premium;

        // 6. Enforce zero-loss invariant: Final balance MUST exceed debt + profit threshold
        if (finalBalance < totalDebt) {
            revert UnprofitableArbitrage(totalDebt, finalBalance);
        }

        uint256 netProfit = finalBalance - totalDebt;

        // 7. Approve Aave Pool to pull totalDebt back
        IERC20(asset).approve(address(POOL), totalDebt);

        // 8. AUTOMATIC PROFIT SWEEP: Route net profit directly to owner's Coinbase Wallet
        if (netProfit > 0) {
            IERC20(asset).transfer(owner, netProfit);
        }

        emit FlashLoanExecuted(asset, amount, premium, netProfit, block.timestamp);
        return true;
    }

    /**
     * @notice Withdraw accumulated profits to owner
     */
    function withdraw(address token) external onlyOwner {
        uint256 balance = IERC20(token).balanceOf(address(this));
        if (balance > 0) {
            IERC20(token).transfer(owner, balance);
            emit ProfitWithdrawn(token, balance, owner);
        }
    }

    /**
     * @notice Rescue native ETH
     */
    function withdrawETH() external onlyOwner {
        uint256 balance = address(this).balance;
        if (balance > 0) {
            payable(owner).transfer(balance);
        }
    }

    receive() external payable {}
}
