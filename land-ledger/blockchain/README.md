# LAND LEDGER — Blockchain Module

On-chain property registry for the LAND LEDGER digital property registry platform.
Stack: **Solidity 0.8.24 · Hardhat 2.x · ethers v6** (via `@nomicfoundation/hardhat-toolbox`).

## What the contract does

`contracts/LandRegistry.sol` keeps the authoritative **propertyId → owner** mapping on-chain:

- Properties are identified by opaque `bytes32` identifiers (e.g. `ethers.id("PROP-2026-0001")`). **No citizen PII and no files/documents are ever stored on-chain** — only the identifier and wallet addresses. Off-chain storage references the same property ids.
- A single **operator** account (the backend service wallet that deploys the contract) is the only address allowed to `registerProperty`, `transferOwnership` and `setOperator`. The operator is rotatable.
- `transferOwnership` includes a **provenance guard**: the caller must pass `expectedCurrentOwner` and the on-chain owner must match it exactly, so the backend cannot act on stale reads.
- All state changes emit events (`PropertyRegistered`, `OwnershipTransferred`, `OperatorChanged`) that the backend can index.

## Layout

```
blockchain/
├── contracts/LandRegistry.sol   # The registry contract
├── scripts/deploy.js            # Deploy + write deployments/local.json
├── test/landRegistry.test.js    # Full spec test suite (20 tests)
├── hardhat.config.js            # solc 0.8.24, hardhat + localhost networks
└── package.json
```

## Commands

```bash
npm install              # once (main agent handles this)

npx hardhat compile      # compile contracts
npx hardhat test         # run the test suite (in-process hardhat network)
npx hardhat node         # start a local node on http://127.0.0.1:8545 (chainId 31337)

npm run deploy           # deploy to the running localhost node
npm run deploy:local     # one-shot deploy on the in-process hardhat network
```

Network config: the `localhost` network RPC URL comes from `BLOCKCHAIN_RPC_URL` (default `http://127.0.0.1:8545`). No dotenv — environment is passed in by the main agent.

## Deployment artifact

Every deploy writes `deployments/local.json`:

```json
{
  "network": "localhost",
  "contractAddress": "0x...",
  "deployer": "0x...",
  "deployedAt": "2026-01-01T00:00:00.000Z",
  "transactionHash": "0x..."
}
```

## Backend consumption

1. **Contract address** — read `contractAddress` from `deployments/local.json`. A `CONTRACT_ADDRESS` env var overrides the artifact (useful for staging/redeploys), so: `address = process.env.CONTRACT_ADDRESS || deployments/local.json.contractAddress`.
2. **RPC endpoint** — `BLOCKCHAIN_RPC_URL` (default `http://127.0.0.1:8545`).
3. **Operator key** — the deployer is the contract `operator`; the backend must sign registry transactions with that account, or have the deployer call `setOperator(backendWallet)` once after deployment. When running `npx hardhat node`, use one of the prefunded accounts printed by the node as the deployer/backend key.
4. **Property ids** — the backend derives `bytes32` ids (e.g. `ethers.id(publicPropertyCode)`) and passes them to `registerProperty` / `transferOwnership`.

## Revert messages (for backend error mapping)

| Condition | Message |
| --- | --- |
| Non-operator calls restricted fn | `LandRegistry: caller is not the operator` |
| Property already registered | `LandRegistry: property already registered` |
| Property unknown | `LandRegistry: property not registered` |
| Provenance guard tripped | `LandRegistry: caller provenance mismatch — current owner does not match expected owner` |
| `registerProperty(owner = 0)` | `LandRegistry: owner is zero address` |
| Transfer to zero address | `LandRegistry: new owner is zero address` |
| Transfer to same owner | `LandRegistry: new owner equals current owner` |
| `setOperator(0)` | `LandRegistry: operator is zero address` |
