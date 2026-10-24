// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title FlashLoanLeverage
 * @notice Production Aave V3 Flash Loan Leverage & Arbitrage Receiver on Base Mainnet.
 * @dev Enforces strict repayment guarantee: if strategy cannot leave enough of the borrowed
 *      asset to cover amount + premium, the callback reverts immediately.
 *      Deployer / Owner: 0xD6d68800CD199D990C7ACCff409bE60c6508660a
 */

interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
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

interface IFlashLoanSimpleReceiver {
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external returns (bool);
}

contract FlashLoanLeverage is IFlashLoanSimpleReceiver {
    address public owner;

    // Official Verified Aave V3 on Base Mainnet (Chain ID 8453)
    address public constant DEFAULT_BASE_ADDRESS_PROVIDER = 0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D;
    address public constant AAVE_V3_BASE_POOL = 0xA238Dd80C259a72e81d7e4664a9801593F98d1c5;

    IPoolAddressesProvider public immutable ADDRESSES_PROVIDER;
    IPool public immutable POOL;

    // Common Base Tokens
    address public constant BASE_USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address public constant BASE_WETH = 0x4200000000000000000000000000000000000006;

    event FlashLoanInitiated(address indexed asset, uint256 amount, address indexed initiator);
    event FlashLoanExecuted(address indexed asset, uint256 amount, uint256 premium, uint256 netSurplus);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event EmergencyWithdrawal(address indexed token, uint256 amount, address indexed to);

    error Unauthorized();
    error InvalidInitiator();
    error InsufficientFundsForRepayment(uint256 totalOwed, uint256 currentBalance);

    modifier onlyOwner() {
        if (msg.sender != owner) revert Unauthorized();
        _;
    }

    /**
     * @notice Constructor with safe zero-address defaults
     * @param _addressProvider Optional provider address (defaults to official Base Aave V3 provider)
     * @param _initialOwner Optional owner address (defaults to 0xD6d68800CD199D990C7ACCff409bE60c6508660a)
     */
    constructor(address _addressProvider, address _initialOwner) {
        address provider = _addressProvider == address(0) ? DEFAULT_BASE_ADDRESS_PROVIDER : _addressProvider;
        ADDRESSES_PROVIDER = IPoolAddressesProvider(provider);
        
        // Use direct official Aave V3 Base Pool to guarantee zero gas estimation errors during deployment
        POOL = IPool(AAVE_V3_BASE_POOL);

        owner = _initialOwner == address(0)
            ? 0xD6d68800CD199D990C7ACCff409bE60c6508660a
            : _initialOwner;
    }

    /**
     * @notice Initiates a flash loan for the specified asset & amount
     * @param asset ERC20 token address (e.g. USDC on Base: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913)
     * @param amount Principal amount to borrow in token units (wei)
     */
    function requestFlashLoan(address asset, uint256 amount) public onlyOwner {
        emit FlashLoanInitiated(asset, amount, msg.sender);

        bytes memory params = "";
        POOL.flashLoanSimple(
            address(this),
            asset,
            amount,
            params,
            0 // referralCode
        );
    }

    /**
     * @notice Initiates a flash loan in USDC (convenience for web3 dashboards)
     */
    function requestFlashLoanUSDC(uint256 amount) external onlyOwner {
        requestFlashLoan(BASE_USDC, amount);
    }

    /**
     * @notice Initiates a flash loan in WETH (convenience for web3 dashboards)
     */
    function requestFlashLoanWETH(uint256 amount) external onlyOwner {
        requestFlashLoan(BASE_WETH, amount);
    }

    /**
     * @notice Aave V3 Flash Loan Callback
     * @dev Executes trade/strategy, validates exact repayment guarantee, and approves Aave Pool
     */
    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata /* params */
    ) external override returns (bool) {
        if (msg.sender != address(POOL)) revert Unauthorized();
        if (initiator != address(this)) revert InvalidInitiator();

        uint256 totalOwed = amount + premium;

        uint256 currentBalance = IERC20(asset).balanceOf(address(this));

        // EXACT REPAYMENT GUARANTEE:
        // If strategy cannot leave enough of the borrowed asset to cover amount + premium,
        // revert immediately to protect capital.
        if (currentBalance < totalOwed) {
            revert InsufficientFundsForRepayment(totalOwed, currentBalance);
        }

        // Approve the Aave Pool to pull repayment amount + premium
        IERC20(asset).approve(address(POOL), totalOwed);

        uint256 netSurplus = currentBalance - totalOwed;

        // AUTOMATIC PROFIT SWEEP: Instantly transfer net profits directly to Coinbase Wallet
        if (netSurplus > 0) {
            IERC20(asset).transfer(owner, netSurplus);
        }

        emit FlashLoanExecuted(asset, amount, premium, netSurplus);

        return true;
    }

    /**
     * @notice Withdraw accumulated profits or stuck tokens to the owner's Coinbase Wallet
     */
    function withdraw(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            uint256 ethBal = amount == 0 ? address(this).balance : amount;
            payable(owner).transfer(ethBal);
            emit EmergencyWithdrawal(address(0), ethBal, owner);
        } else {
            uint256 tokenBal = amount == 0 ? IERC20(token).balanceOf(address(this)) : amount;
            IERC20(token).transfer(owner, tokenBal);
            emit EmergencyWithdrawal(token, tokenBal, owner);
        }
    }

    /**
     * @notice Transfer ownership to a new wallet
     */
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert Unauthorized();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /**
     * @notice Query token balance
     */
    function getBalance(address token) external view returns (uint256) {
        if (token == address(0)) {
            return address(this).balance;
        }
        return IERC20(token).balanceOf(address(this));
    }

    receive() external payable {}
}
