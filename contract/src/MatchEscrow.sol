// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MatchEscrow {
    IERC20 public immutable USDC;
    address public immutable platform;
    address public orchestrator;
    address public contractOwner;

    enum MatchState { BETTING_OPEN, BETTING_CLOSED, PLAYING, RESOLVED, CANCELLED }

    uint256 public constant BETTOR_SHARE   = 6000; // 60%
    uint256 public constant AGENT_SHARE    = 3000; // 30%
    uint256 public constant PLATFORM_SHARE = 1000; // 10%
    uint256 public constant MIN_BET        = 1e6;  // 1 USDC (6 decimals)

    struct MatchData {
        uint256 matchId;
        uint256[] agentIds;
        address[] ownerWallets;
        MatchState state;
        uint256 winnerAgentId;
        uint256 totalPot;
        uint256 bettorPool;    // 60% held for claims
        uint256 bettingDeadline;
        address[] bettors;
    }

    mapping(uint256 => MatchData) private matchData;
    mapping(uint256 => mapping(uint256 => uint256)) public totalBetsOnAgent;
    mapping(uint256 => mapping(address => mapping(uint256 => uint256))) public userBetOnAgent;

    // Claim tracking: matchId => user => claimed
    mapping(uint256 => mapping(address => bool)) public hasClaimed;

    uint256 public matchCount;

    event MatchCreated(uint256 indexed matchId, uint256[] agentIds, uint256 bettingDeadline);
    event BetPlaced(uint256 indexed matchId, address indexed bettor, uint256 agentId, uint256 amount);
    event MatchResolved(uint256 indexed matchId, uint256 winnerAgentId, uint256 totalPot);
    event WinningsClaimed(uint256 indexed matchId, address indexed bettor, uint256 amount);
    event PayoutSent(uint256 indexed matchId, address indexed recipient, uint256 amount);
    event MatchCancelled(uint256 indexed matchId);
    event EmergencyWithdraw(address indexed to, uint256 amount);

    modifier onlyOrchestrator() {
        require(msg.sender == orchestrator, "Not orchestrator");
        _;
    }

    modifier onlyContractOwner() {
        require(msg.sender == contractOwner, "Not owner");
        _;
    }

    constructor(address _usdc, address _platform, address _orchestrator) {
        USDC = IERC20(_usdc);
        platform = _platform;
        orchestrator = _orchestrator;
        contractOwner = msg.sender;
    }

    function setOrchestrator(address _orchestrator) external onlyContractOwner {
        orchestrator = _orchestrator;
    }

    /**
     * TESTNET SAFETY VALVE — NOT a production pattern.
     *
     * Withdraws the contract's ENTIRE USDC balance to the owner, including
     * any unclaimed bettor pool (the 60% share bettors haven't called
     * claimWinnings() for yet). This makes the contract's fund custody
     * admin-controlled, not trustless — a malicious or compromised owner
     * key can drain winnings before bettors claim them. Only exists here to
     * recover stuck testnet USDC; a production escrow would not expose this.
     */
    function withdrawAll() external onlyContractOwner {
        uint256 balance = USDC.balanceOf(address(this));
        require(balance > 0, "Nothing to withdraw");
        USDC.transfer(contractOwner, balance);
        emit EmergencyWithdraw(contractOwner, balance);
    }

    function createMatch(
        uint256 matchId,
        uint256[] calldata agentIds,
        address[] calldata ownerWallets,
        uint256 bettingDuration
    ) external onlyOrchestrator {
        require(agentIds.length == 2, "Exactly 2 agents required");
        require(agentIds.length == ownerWallets.length, "Length mismatch");
        require(matchData[matchId].matchId == 0, "Match exists");

        MatchData storage m = matchData[matchId];
        m.matchId = matchId;
        m.agentIds = agentIds;
        m.ownerWallets = ownerWallets;
        m.state = MatchState.BETTING_OPEN;
        m.bettingDeadline = block.timestamp + bettingDuration;

        emit MatchCreated(matchId, agentIds, m.bettingDeadline);
    }

    function placeBet(uint256 matchId, uint256 agentId, uint256 amount) external {
        MatchData storage m = matchData[matchId];
        require(m.state == MatchState.BETTING_OPEN, "Betting closed");
        require(block.timestamp < m.bettingDeadline, "Deadline passed");
        require(amount >= MIN_BET, "Min bet: 1 USDC");

        bool validAgent = false;
        for (uint i = 0; i < m.agentIds.length; i++) {
            if (m.agentIds[i] == agentId) { validAgent = true; break; }
        }
        require(validAgent, "Invalid agent for match");

        if (userBetOnAgent[matchId][msg.sender][agentId] == 0) {
            m.bettors.push(msg.sender);
        }

        USDC.transferFrom(msg.sender, address(this), amount);
        userBetOnAgent[matchId][msg.sender][agentId] += amount;
        totalBetsOnAgent[matchId][agentId] += amount;
        m.totalPot += amount;

        emit BetPlaced(matchId, msg.sender, agentId, amount);
    }

    function closeBetting(uint256 matchId) external onlyOrchestrator {
        require(matchData[matchId].state == MatchState.BETTING_OPEN, "Not open");
        matchData[matchId].state = MatchState.BETTING_CLOSED;
    }

    function startMatch(uint256 matchId) external onlyOrchestrator {
        require(matchData[matchId].state == MatchState.BETTING_CLOSED, "Betting not closed");
        matchData[matchId].state = MatchState.PLAYING;
    }

    /**
     * Resolve a match. Immediately pays the winning agent (30%) and platform (10%).
     * The bettor share (60%) stays in the contract for individual claims.
     */
    function resolveMatch(uint256 matchId, uint256 winnerAgentId) external onlyOrchestrator {
        MatchData storage m = matchData[matchId];
        require(m.state == MatchState.PLAYING, "Match not in progress");

        m.state = MatchState.RESOLVED;
        m.winnerAgentId = winnerAgentId;

        uint256 pot = m.totalPot;
        uint256 bettorPool    = (pot * BETTOR_SHARE) / 10000;
        uint256 agentPayout   = (pot * AGENT_SHARE) / 10000;
        uint256 platformPayout = (pot * PLATFORM_SHARE) / 10000;

        m.bettorPool = bettorPool;

        // Find winner owner wallet
        address winnerWallet;
        for (uint i = 0; i < m.agentIds.length; i++) {
            if (m.agentIds[i] == winnerAgentId) {
                winnerWallet = m.ownerWallets[i];
                break;
            }
        }
        require(winnerWallet != address(0), "Winner wallet not found");

        // Pay agent immediately
        if (agentPayout > 0) {
            USDC.transfer(winnerWallet, agentPayout);
            emit PayoutSent(matchId, winnerWallet, agentPayout);
        }

        // Pay platform immediately
        if (platformPayout > 0) {
            USDC.transfer(platform, platformPayout);
            emit PayoutSent(matchId, platform, platformPayout);
        }

        // If nobody bet on the winner, release bettor pool to platform
        uint256 totalOnWinner = totalBetsOnAgent[matchId][winnerAgentId];
        if (totalOnWinner == 0 && bettorPool > 0) {
            USDC.transfer(platform, bettorPool);
            m.bettorPool = 0;
        }

        emit MatchResolved(matchId, winnerAgentId, pot);
    }

    /**
     * Winning bettors call this to claim their pro-rata share of the bettor pool.
     * Must be called by the bettor themselves (signed transaction).
     */
    function claimWinnings(uint256 matchId) external {
        MatchData storage m = matchData[matchId];
        require(m.state == MatchState.RESOLVED, "Match not resolved");
        require(!hasClaimed[matchId][msg.sender], "Already claimed");

        uint256 winnerAgentId = m.winnerAgentId;
        uint256 userBet = userBetOnAgent[matchId][msg.sender][winnerAgentId];
        require(userBet > 0, "No winning bet");

        uint256 totalOnWinner = totalBetsOnAgent[matchId][winnerAgentId];
        require(totalOnWinner > 0, "No bets on winner");

        uint256 userPayout = (userBet * m.bettorPool) / totalOnWinner;
        require(userPayout > 0, "Nothing to claim");

        hasClaimed[matchId][msg.sender] = true;
        USDC.transfer(msg.sender, userPayout);

        emit WinningsClaimed(matchId, msg.sender, userPayout);
    }

    function cancelMatch(uint256 matchId) external onlyOrchestrator {
        MatchData storage m = matchData[matchId];
        require(m.state != MatchState.RESOLVED, "Already resolved");
        m.state = MatchState.CANCELLED;

        for (uint i = 0; i < m.bettors.length; i++) {
            address bettor = m.bettors[i];
            for (uint j = 0; j < m.agentIds.length; j++) {
                uint256 agentId = m.agentIds[j];
                uint256 amount = userBetOnAgent[matchId][bettor][agentId];
                if (amount > 0) {
                    userBetOnAgent[matchId][bettor][agentId] = 0;
                    USDC.transfer(bettor, amount);
                }
            }
        }

        emit MatchCancelled(matchId);
    }

    // ── Views ──────────────────────────────────────────────────────────────

    function getClaimableAmount(uint256 matchId, address user) external view returns (uint256) {
        MatchData storage m = matchData[matchId];
        if (m.state != MatchState.RESOLVED) return 0;
        if (hasClaimed[matchId][user]) return 0;
        uint256 userBet = userBetOnAgent[matchId][user][m.winnerAgentId];
        if (userBet == 0) return 0;
        uint256 totalOnWinner = totalBetsOnAgent[matchId][m.winnerAgentId];
        if (totalOnWinner == 0) return 0;
        return (userBet * m.bettorPool) / totalOnWinner;
    }

    function getMatch(uint256 matchId) external view returns (
        uint256[] memory agentIds,
        address[] memory ownerWallets,
        MatchState state,
        uint256 winnerAgentId,
        uint256 totalPot,
        uint256 bettingDeadline
    ) {
        MatchData storage m = matchData[matchId];
        return (m.agentIds, m.ownerWallets, m.state, m.winnerAgentId, m.totalPot, m.bettingDeadline);
    }

    function getUserBet(uint256 matchId, address user, uint256 agentId) external view returns (uint256) {
        return userBetOnAgent[matchId][user][agentId];
    }
}
