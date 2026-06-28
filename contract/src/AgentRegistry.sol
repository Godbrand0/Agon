// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract AgentRegistry {
    address public orchestrator;
    address public owner;

    struct Agent {
        address owner;
        string name;
        string gameType; // "MARKET_MAKER" | "LIQUIDITY_WARS" | "DEBT_COLLECTOR"
        address walletAddress;
        uint256 wins;
        uint256 losses;
        uint256 totalEarnings; // USDC (6 decimals)
        uint256 registeredAt;
        bool active;
    }

    mapping(uint256 => Agent) public agents;
    mapping(address => uint256[]) public ownerAgents;
    uint256 public agentCount;

    event AgentRegistered(uint256 indexed agentId, address indexed owner, string gameType);
    event StatsUpdated(uint256 indexed agentId, bool won, uint256 earnings);
    event OrchestratorUpdated(address indexed newOrchestrator);

    modifier onlyOrchestrator() {
        require(msg.sender == orchestrator, "Not orchestrator");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _orchestrator) {
        orchestrator = _orchestrator;
        owner = msg.sender;
    }

    function setOrchestrator(address _orchestrator) external onlyOwner {
        orchestrator = _orchestrator;
        emit OrchestratorUpdated(_orchestrator);
    }

    function registerAgent(
        string calldata name,
        string calldata gameType,
        address walletAddress
    ) external returns (uint256 agentId) {
        require(bytes(name).length > 0, "Name required");
        require(
            keccak256(bytes(gameType)) == keccak256(bytes("MARKET_MAKER")) ||
            keccak256(bytes(gameType)) == keccak256(bytes("LIQUIDITY_WARS")) ||
            keccak256(bytes(gameType)) == keccak256(bytes("DEBT_COLLECTOR")),
            "Invalid game type"
        );
        require(walletAddress != address(0), "Invalid wallet");

        agentId = ++agentCount;
        agents[agentId] = Agent({
            owner: msg.sender,
            name: name,
            gameType: gameType,
            walletAddress: walletAddress,
            wins: 0,
            losses: 0,
            totalEarnings: 0,
            registeredAt: block.timestamp,
            active: true
        });
        ownerAgents[msg.sender].push(agentId);
        emit AgentRegistered(agentId, msg.sender, gameType);
    }

    function updateStats(uint256 agentId, bool won, uint256 earnings) external onlyOrchestrator {
        require(agentId > 0 && agentId <= agentCount, "Invalid agent");
        Agent storage agent = agents[agentId];
        if (won) agent.wins++;
        else agent.losses++;
        agent.totalEarnings += earnings;
        emit StatsUpdated(agentId, won, earnings);
    }

    function getWinRate(uint256 agentId) external view returns (uint256) {
        Agent storage agent = agents[agentId];
        uint256 total = agent.wins + agent.losses;
        if (total == 0) return 0;
        return (agent.wins * 10000) / total; // basis points: 6750 = 67.50%
    }

    function getOwnerAgents(address _owner) external view returns (uint256[] memory) {
        return ownerAgents[_owner];
    }

    function deactivateAgent(uint256 agentId) external {
        require(agents[agentId].owner == msg.sender, "Not agent owner");
        agents[agentId].active = false;
    }
}
