// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test, Vm} from "forge-std/Test.sol";
import {console} from "forge-std/console.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {Actions} from "@uniswap/v4-periphery/src/libraries/Actions.sol";
import {ActionConstants} from "@uniswap/v4-periphery/src/libraries/ActionConstants.sol";
import {IV4Router} from "@uniswap/v4-periphery/src/interfaces/IV4Router.sol";
import {IPositionManager} from "@uniswap/v4-periphery/src/interfaces/IPositionManager.sol";
import {IAllowanceTransfer} from "permit2/src/interfaces/IAllowanceTransfer.sol";
import {ILiquidityLauncher} from "@liquidity-launcher/interfaces/ILiquidityLauncher.sol";
import {IMulticall} from "@liquidity-launcher/interfaces/IMulticall.sol";
import {IStrategy} from "@liquidity-launcher/interfaces/IStrategy.sol";
import {Distribution} from "@liquidity-launcher/types/Distribution.sol";
import {UERC20Metadata} from "@uniswap/uerc20-factory/src/libraries/UERC20MetadataLibrary.sol";
import {ExternalAddresses, Deployment} from "../script/LaunchpadDeploy.sol";
import {LaunchpadChecks} from "../script/LaunchpadChecks.sol";

/// @dev Mirrors InstantLaunchConfig / UniversalRouterConfig from the audited sources (abi-identical).
struct InstantLaunchConfig {
    address feeBeneficiary;
}

struct UniversalRouterConfig {
    address router;
    address recipient;
    bytes route;
}

interface IUERC20FactoryView {
    function getUERC20Address(
        string memory name,
        string memory symbol,
        uint8 decimals,
        address creator,
        bytes32 graffiti
    ) external view returns (address);
}

interface IUniversalRouter {
    function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable;
}

interface IFeeSplitter {
    function collectFees(uint256[] calldata tokenIds) external;
}

interface IBeneficiaryVault {
    function claim(uint256 tokenId, uint256 minCurrency0Amount, uint256 minCurrency1Amount) external;
}

/// @dev Stand-in for the platform Safe: a contract that only receives funds.
contract MockSafe {
    receive() external payable {}
}

/// @dev Attacker strategy used to show that tokens left in the launcher can be taken.
contract ThiefStrategy is IStrategy {
    address internal immutable thief;

    constructor(address _thief) {
        thief = _thief;
    }

    function initializeDistribution(address token, uint256 amount, bytes calldata, bytes32) external override {
        IERC20(token).transferFrom(msg.sender, thief, amount);
    }
}

/// @notice Fork tests against Base mainnet: `forge test --fork-url $BASE_RPC_URL`.
contract LaunchpadForkTest is Test, LaunchpadChecks {
    using StateLibrary for IPoolManager;

    uint256 internal constant SUPPLY = 1_000_000_000e18;
    uint8 internal constant UR_V4_SWAP = 0x10; // universal-router Commands.V4_SWAP
    uint8 internal constant UR_SWEEP = 0x04; // universal-router Commands.SWEEP

    ExternalAddresses internal ext;
    Deployment internal d;
    address internal treasury;
    ILiquidityLauncher internal launcher;
    IPoolManager internal poolManager;
    IPositionManager internal positionManager;

    address internal creator = makeAddr("creator");
    address internal trader = makeAddr("trader");

    function setUp() public {
        require(block.chainid == 8453, "run with --fork-url $BASE_RPC_URL (Base mainnet)");
        ext = loadExternal();
        treasury = address(new MockSafe());
        d = deployLaunchpad(ext, treasury, DEFAULT_INITIAL_TICK, bytes32(0));

        launcher = ILiquidityLauncher(ext.liquidityLauncher);
        poolManager = IPoolManager(ext.poolManager);
        positionManager = IPositionManager(ext.positionManager);

        vm.deal(creator, 100 ether);
        vm.deal(trader, 100 ether);
    }

    // ---------------------------------------------------------------- deployment

    function test_deploy_immutablesMatchConfig() public view {
        checkDeployment(ext, d, treasury, DEFAULT_INITIAL_TICK);
    }

    function test_deploy_predictedAddressesMatch() public view {
        Deployment memory p = predict(ext, treasury, DEFAULT_INITIAL_TICK, bytes32(0));
        assertEq(p.tokenFactory, d.tokenFactory);
        assertEq(p.beneficiaryVault, d.beneficiaryVault);
        assertEq(p.feeSplitter, d.feeSplitter);
        assertEq(p.instantLaunchStrategy, d.instantLaunchStrategy);
        assertEq(p.universalRouterStrategy, d.universalRouterStrategy);
    }

    function test_deploy_rejectsEoaTreasury() public {
        address eoa = makeAddr("eoa-treasury");
        vm.expectRevert(abi.encodeWithSelector(TreasuryNotAContract.selector, eoa));
        this.externalDeploy(eoa);
    }

    function externalDeploy(address treasury_) external returns (Deployment memory) {
        return deployLaunchpad(ext, treasury_, DEFAULT_INITIAL_TICK, bytes32(uint256(1)));
    }

    // ---------------------------------------------------------------- launch

    function test_launch_oneMulticall() public {
        uint256 tokenId = positionManager.nextTokenId();
        (address token, PoolKey memory key) = _launch(creator, "Foo", "FOO", 0);

        // Supply is fixed and fully placed: nothing left in the launcher or the strategy.
        assertEq(IERC20(token).totalSupply(), SUPPLY, "supply");
        assertEq(IERC20(token).balanceOf(address(launcher)), 0, "launcher balance");
        assertEq(IERC20(token).balanceOf(d.instantLaunchStrategy), 0, "strategy balance");

        // Pool exists at the configured opening price with the expected fee.
        (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee) = poolManager.getSlot0(key.toId());
        assertEq(sqrtPriceX96, TickMath.getSqrtPriceAtTick(DEFAULT_INITIAL_TICK), "opening price");
        assertEq(tick, DEFAULT_INITIAL_TICK, "opening tick");
        assertEq(lpFee, 2_500, "lp fee");
        console.log("protocolFee (pips, packed 0->1 | 1->0 << 12):", protocolFee);

        // LP NFT is locked in our FeeSplitter; the creator holds the beneficiary NFT.
        assertEq(IERC721(address(positionManager)).ownerOf(tokenId), d.feeSplitter, "LP owner");
        assertEq(IERC721(d.beneficiaryVault).ownerOf(tokenId), creator, "beneficiary");
    }

    /// @dev Decisions §1/§9: the pinned commit requires `triggerFeeUpdate` to succeed on Base.
    ///      A successful launch proves it; this test also reports the resulting protocol fee.
    function test_launch_feeUpdateSucceedsOnBase_reportProtocolFee() public {
        (, PoolKey memory key) = _launch(creator, "Fee", "FEE", 0);
        (,, uint24 protocolFee,) = poolManager.getSlot0(key.toId());
        uint24 zeroForOne = protocolFee & 0xfff; // ETH -> token (buys)
        uint24 oneForZero = protocolFee >> 12; // token -> ETH (sells)
        console.log("protocol fee on buys  (pips):", zeroForOne);
        console.log("protocol fee on sells (pips):", oneForZero);
        console.log("feeController:", poolManager.protocolFeeController());
    }

    function test_launch_withFirstBuy_oneTransaction() public {
        uint256 firstBuy = 0.1 ether;
        uint256 balanceBefore = creator.balance;
        (address token,) = _launch(creator, "Bar", "BAR", firstBuy);

        uint256 bought = IERC20(token).balanceOf(creator);
        assertGt(bought, 0, "creator received tokens");
        assertEq(balanceBefore - creator.balance, firstBuy, "spent exactly the first buy");
        // Nothing stranded in the router path (audit L-08).
        assertEq(IERC20(token).balanceOf(d.universalRouterStrategy), 0);
        assertEq(IERC20(token).balanceOf(ext.universalRouter), 0);
        assertEq(d.universalRouterStrategy.balance, 0);
        assertEq(ext.universalRouter.balance, 0);
        console.log("first buy of 0.1 ETH bought tokens:", bought / 1e18);
    }

    // ---------------------------------------------------------------- fees

    function test_fees_creatorSixtyTreasuryForty_andClaim() public {
        uint256 tokenId = positionManager.nextTokenId();
        (address token, PoolKey memory key) = _launch(creator, "Fee", "FEE", 0);

        _buy(trader, key, 1 ether);
        _sell(trader, key, IERC20(token).balanceOf(trader) / 2);

        (uint256 native, uint256 tokens) = _collect(tokenId);
        assertGt(native, 0, "ETH fees");
        assertGt(tokens, 0, "token fees");

        uint256 expectedCreatorEth = native * CREATOR_BPS / 10_000;
        uint256 expectedTreasuryEth = native * PLATFORM_BPS / 10_000;
        assertEq(treasury.balance, expectedTreasuryEth, "treasury ETH = 40%");
        assertEq(IERC20(token).balanceOf(treasury), tokens * PLATFORM_BPS / 10_000, "treasury token = 40%");

        uint256 creatorEthBefore = creator.balance;
        uint256 creatorTokenBefore = IERC20(token).balanceOf(creator);
        vm.prank(creator);
        IBeneficiaryVault(d.beneficiaryVault).claim(tokenId, 0, 0);
        assertEq(creator.balance - creatorEthBefore, expectedCreatorEth, "creator ETH = 60%");
        assertEq(
            IERC20(token).balanceOf(creator) - creatorTokenBefore, tokens * CREATOR_BPS / 10_000, "creator token = 60%"
        );
        console.log("ETH fees collected (wei):", native);
        console.log("creator / treasury (wei):", expectedCreatorEth, expectedTreasuryEth);
    }

    function test_fees_onlyBeneficiaryCanClaim() public {
        uint256 tokenId = positionManager.nextTokenId();
        (, PoolKey memory key) = _launch(creator, "Own", "OWN", 0);
        _buy(trader, key, 0.5 ether);
        _collect(tokenId);
        vm.prank(trader);
        vm.expectRevert();
        IBeneficiaryVault(d.beneficiaryVault).claim(tokenId, 0, 0);
    }

    function test_fees_beneficiaryNftTransferMovesFutureFees() public {
        uint256 tokenId = positionManager.nextTokenId();
        (, PoolKey memory key) = _launch(creator, "Move", "MOVE", 0);
        address newOwner = makeAddr("new-owner");

        // Fees before the transfer: creator claims them.
        _buy(trader, key, 1 ether);
        _collect(tokenId);
        vm.prank(creator);
        IBeneficiaryVault(d.beneficiaryVault).claim(tokenId, 0, 0);

        vm.prank(creator);
        IERC721(d.beneficiaryVault).transferFrom(creator, newOwner, tokenId);

        // Fees after the transfer go to the new owner; the old creator can no longer claim.
        _buy(trader, key, 1 ether);
        (uint256 native,) = _collect(tokenId);
        vm.prank(creator);
        vm.expectRevert();
        IBeneficiaryVault(d.beneficiaryVault).claim(tokenId, 0, 0);

        vm.prank(newOwner);
        IBeneficiaryVault(d.beneficiaryVault).claim(tokenId, 0, 0);
        assertEq(newOwner.balance, native * CREATOR_BPS / 10_000, "new owner gets the creator share");
    }

    // ---------------------------------------------------------------- safety

    /// @dev Rule 2: a launch split across two transactions loses the whole supply.
    ///      Our SDK only builds the single-multicall shape (unit test in packages/sdk).
    function test_splitLaunch_isStealable() public {
        address thief = makeAddr("thief");
        ThiefStrategy thiefStrategy = new ThiefStrategy(thief);

        // Tx 1: creator mints into the launcher without distributing in the same tx.
        vm.prank(creator);
        address token =
            launcher.createToken(d.tokenFactory, "Split", "SPLIT", 18, uint128(SUPPLY), address(launcher), _metadata());
        assertEq(IERC20(token).balanceOf(address(launcher)), SUPPLY);

        // Tx 2: anyone distributes those tokens to a strategy of their choosing.
        vm.prank(thief);
        launcher.distributeToken(
            token, Distribution({strategy: address(thiefStrategy), amount: uint128(SUPPLY), configData: ""}), bytes32(0)
        );
        assertEq(IERC20(token).balanceOf(thief), SUPPLY, "thief took the full supply");
    }

    /// @dev Audit CR-01: anyone can initialize the predictable pool key first; the launch then reverts.
    function test_duplicatePoolKey_reverts() public {
        address token = _predictToken(creator, "Dup", "DUP");
        PoolKey memory key = _poolKey(token);
        poolManager.initialize(key, TickMath.getSqrtPriceAtTick(0));

        bytes[] memory calls = _launchCalls(creator, "Dup", "DUP", 0);
        vm.prank(creator);
        vm.expectRevert();
        IMulticall(address(launcher)).multicall(calls);
    }

    function test_sameTokenTwice_reverts() public {
        _launch(creator, "Twice", "TWICE", 0);
        bytes[] memory calls = _launchCalls(creator, "Twice", "TWICE", 0);
        vm.prank(creator);
        vm.expectRevert();
        IMulticall(address(launcher)).multicall(calls);
    }

    function test_wrongSupply_reverts() public {
        address token = _predictToken(creator, "Short", "SHORT");
        bytes[] memory calls = new bytes[](2);
        calls[0] = abi.encodeCall(
            ILiquidityLauncher.createToken,
            (d.tokenFactory, "Short", "SHORT", 18, uint128(SUPPLY - 1), address(launcher), _metadata())
        );
        calls[1] = abi.encodeCall(
            ILiquidityLauncher.distributeToken,
            (
                token,
                Distribution({
                    strategy: d.instantLaunchStrategy,
                    amount: uint128(SUPPLY - 1),
                    configData: abi.encode(InstantLaunchConfig(creator))
                }),
                bytes32(0)
            )
        );
        vm.prank(creator);
        vm.expectRevert(bytes4(keccak256("InvalidSupply()")));
        IMulticall(address(launcher)).multicall(calls);
    }

    // ---------------------------------------------------------------- helpers

    function _metadata() internal pure returns (bytes memory) {
        return abi.encode(UERC20Metadata({description: "", website: "", image: "", extraData: ""}));
    }

    function _predictToken(address creator_, string memory name, string memory symbol) internal view returns (address) {
        // UERC20Factory records the launcher as `creator` (msg.sender) and the user via graffiti.
        return IUERC20FactoryView(d.tokenFactory)
            .getUERC20Address(name, symbol, 18, address(launcher), launcher.getGraffiti(creator_));
    }

    function _poolKey(address token) internal pure returns (PoolKey memory) {
        return PoolKey({
            currency0: Currency.wrap(address(0)),
            currency1: Currency.wrap(token),
            fee: 2_500,
            tickSpacing: 25,
            hooks: IHooks(address(0))
        });
    }

    /// @dev The exact shape our SDK builds: one multicall, create + distribute (+ optional first buy).
    function _launchCalls(address creator_, string memory name, string memory symbol, uint256 firstBuy)
        internal
        view
        returns (bytes[] memory calls)
    {
        address token = _predictToken(creator_, name, symbol);
        calls = new bytes[](firstBuy == 0 ? 2 : 3);
        calls[0] = abi.encodeCall(
            ILiquidityLauncher.createToken,
            (d.tokenFactory, name, symbol, 18, uint128(SUPPLY), address(launcher), _metadata())
        );
        calls[1] = abi.encodeCall(
            ILiquidityLauncher.distributeToken,
            (
                token,
                Distribution({
                    strategy: d.instantLaunchStrategy,
                    amount: uint128(SUPPLY),
                    configData: abi.encode(InstantLaunchConfig(creator_))
                }),
                bytes32(0)
            )
        );
        if (firstBuy > 0) {
            calls[2] = abi.encodeCall(
                ILiquidityLauncher.distributeWithNative,
                (
                    d.universalRouterStrategy,
                    abi.encode(
                        UniversalRouterConfig(ext.universalRouter, creator_, _firstBuyRoute(token, creator_, firstBuy))
                    ),
                    bytes32(0),
                    firstBuy
                )
            );
        }
    }

    /// @dev Route run by UniversalRouterStrategy: the router pays from the forwarded ETH, sends the
    ///      tokens straight to the creator (TAKE with explicit recipient, never TAKE_ALL), and
    ///      sweeps any ETH left over back to the creator.
    function _firstBuyRoute(address token, address recipient, uint256 amountIn) internal view returns (bytes memory) {
        bytes memory actions =
            abi.encodePacked(uint8(Actions.SWAP_EXACT_IN_SINGLE), uint8(Actions.SETTLE), uint8(Actions.TAKE));
        bytes[] memory params = new bytes[](3);
        params[0] = abi.encode(
            IV4Router.ExactInputSingleParams({
                poolKey: _poolKey(token),
                zeroForOne: true,
                amountIn: uint128(amountIn),
                amountOutMinimum: 0,
                hookData: ""
            })
        );
        params[1] = abi.encode(Currency.wrap(address(0)), ActionConstants.OPEN_DELTA, false);
        params[2] = abi.encode(Currency.wrap(token), recipient, ActionConstants.OPEN_DELTA);

        bytes memory commands = abi.encodePacked(UR_V4_SWAP, UR_SWEEP);
        bytes[] memory inputs = new bytes[](2);
        inputs[0] = abi.encode(actions, params);
        inputs[1] = abi.encode(address(0), recipient, uint256(0));
        return abi.encode(commands, inputs, block.timestamp);
    }

    function _launch(address creator_, string memory name, string memory symbol, uint256 firstBuy)
        internal
        returns (address token, PoolKey memory key)
    {
        bytes[] memory calls = _launchCalls(creator_, name, symbol, firstBuy);
        vm.prank(creator_);
        IMulticall(address(launcher)).multicall{value: firstBuy}(calls);
        token = _predictToken(creator_, name, symbol);
        key = _poolKey(token);
    }

    function _buy(address who, PoolKey memory key, uint256 amountIn) internal {
        _swap(who, key, true, amountIn);
    }

    function _sell(address who, PoolKey memory key, uint256 amountIn) internal {
        address token = Currency.unwrap(key.currency1);
        vm.startPrank(who);
        IERC20(token).approve(ext.permit2, type(uint256).max);
        IAllowanceTransfer(ext.permit2).approve(token, ext.universalRouter, type(uint160).max, type(uint48).max);
        vm.stopPrank();
        _swap(who, key, false, amountIn);
    }

    function _swap(address who, PoolKey memory key, bool zeroForOne, uint256 amountIn) internal {
        (Currency input, Currency output) = zeroForOne ? (key.currency0, key.currency1) : (key.currency1, key.currency0);
        bytes memory actions =
            abi.encodePacked(uint8(Actions.SWAP_EXACT_IN_SINGLE), uint8(Actions.SETTLE_ALL), uint8(Actions.TAKE_ALL));
        bytes[] memory params = new bytes[](3);
        params[0] = abi.encode(
            IV4Router.ExactInputSingleParams({
                poolKey: key, zeroForOne: zeroForOne, amountIn: uint128(amountIn), amountOutMinimum: 0, hookData: ""
            })
        );
        params[1] = abi.encode(input, amountIn);
        params[2] = abi.encode(output, uint256(0));
        bytes[] memory inputs = new bytes[](1);
        inputs[0] = abi.encode(actions, params);

        vm.prank(who);
        IUniversalRouter(ext.universalRouter).execute{value: zeroForOne ? amountIn : 0}(
            abi.encodePacked(UR_V4_SWAP), inputs, block.timestamp
        );
    }

    /// @return native ETH fees collected for `tokenId`
    /// @return tokens token fees collected for `tokenId`
    function _collect(uint256 tokenId) internal returns (uint256 native, uint256 tokens) {
        uint256[] memory ids = new uint256[](1);
        ids[0] = tokenId;
        vm.recordLogs();
        IFeeSplitter(d.feeSplitter).collectFees(ids);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        // FeesCollected(uint256 indexed tokenId, address indexed token, uint256 nativeAmount, uint256 tokenAmount)
        bytes32 topic = keccak256("FeesCollected(uint256,address,uint256,uint256)");
        for (uint256 i; i < logs.length; i++) {
            if (logs[i].emitter == d.feeSplitter && logs[i].topics[0] == topic) {
                (native, tokens) = abi.decode(logs[i].data, (uint256, uint256));
            }
        }
    }
}
