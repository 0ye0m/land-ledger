'use strict';

const fs = require('fs');
const path = require('path');
const { ethers } = require('ethers');
const env = require('../config/env');
const logger = require('../utils/logger');

const LandRegistryABI = [
  'function registerProperty(bytes32 propertyId, address owner)',
  'function transferOwnership(bytes32 propertyId, address expectedCurrentOwner, address newOwner)',
  'function getPropertyOwner(bytes32 propertyId) view returns (address)',
  'function verifyOwnership(bytes32 propertyId, address claimedOwner) view returns (bool)',
  'function isRegistered(bytes32 propertyId) view returns (bool)',
  'function getProperty(bytes32 propertyId) view returns (bool registered, address owner, uint64 registeredAt, uint64 updatedAt)',
  'function propertyCount() view returns (uint256)',
  'function operator() view returns (address)',
  'event PropertyRegistered(bytes32 indexed propertyId, address indexed owner, uint64 timestamp)',
  'event OwnershipTransferred(bytes32 indexed propertyId, address indexed previousOwner, address indexed newOwner, uint64 timestamp)',
];

let provider = null;
let wallet = null;
let contract = null;
let contractAddress = null;

function resolveContractAddress() {
  if (env.blockchain.contractAddress) return env.blockchain.contractAddress;
  // Fall back to the artifact produced by `blockchain/scripts/deploy.js`
  const candidates = [
    path.resolve(process.cwd(), '..', 'blockchain', 'deployments', 'local.json'),
    path.resolve(process.cwd(), 'blockchain', 'deployments', 'local.json'),
  ];
  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        const artifact = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (artifact.contractAddress) return artifact.contractAddress;
      }
    } catch (err) {
      logger.warn(`[blockchain] could not read deployment artifact ${file}: ${err.message}`);
    }
  }
  return null;
}

function getContract() {
  if (contract) return contract;
  if (!provider) provider = new ethers.JsonRpcProvider(env.blockchain.rpcUrl, undefined, { pollingInterval: 500 });
  if (!wallet) {
    // NonceManager keeps sequential tx nonces deterministic under automine.
    wallet = new ethers.NonceManager(new ethers.Wallet(env.blockchain.operatorPrivateKey, provider));
  }
  contractAddress = resolveContractAddress();
  if (!contractAddress) return null;
  contract = new ethers.Contract(contractAddress, LandRegistryABI, wallet);
  return contract;
}

/** Verify the target address actually holds deployed bytecode (guards against stale artifacts). */
async function contractCodeExists(address) {
  try {
    const code = await provider.getCode(address);
    return Boolean(code && code !== '0x');
  } catch {
    return false;
  }
}

function getContractAddress() {
  if (!contractAddress) getContract();
  return contractAddress;
}

/** Health probe used by /health, ledger page and dashboards. Never throws. */
async function getStatus() {
  try {
    const active = getContract();
    if (!active || !(await contractCodeExists(contractAddress))) {
      return {
        available: false,
        network: env.blockchain.networkName,
        contractAddress: contractAddress || null,
        error: 'Blockchain unavailable - contract not deployed on the connected node',
      };
    }
    const network = await provider.getNetwork();
    const latestBlock = await provider.getBlockNumber();
    return {
      available: true,
      network: env.blockchain.networkName,
      chainId: network ? Number(network.chainId) : null,
      contractAddress,
      latestBlock,
      operatorAddress: wallet ? await wallet.getAddress() : null,
    };
  } catch (err) {
    return {
      available: false,
      network: env.blockchain.networkName,
      contractAddress: contractAddress || null,
      error: 'Blockchain unavailable',
    };
  }
}

function humanError(err) {
  const raw = err && (err.reason || err.shortMessage || err.message) ? (err.reason || err.shortMessage || err.message) : 'Unknown blockchain error';
  return String(raw).replace('execution reverted: ', '').slice(0, 300);
}

// Serialize all write transactions; hardhat automine + NonceManager stay in lockstep.
let writeQueue = Promise.resolve();
function enqueueWrite(fn) {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.catch(() => {
    try {
      wallet?.reset?.();
    } catch { /* noop */ }
  });
  return run;
}

async function registerPropertyOnChain(propertyId, ownerWalletAddress) {
  const active = getContract();
  if (!active) throw Object.assign(new Error('Blockchain unavailable'), { errorCode: 'BLOCKCHAIN_UNAVAILABLE' });
  return enqueueWrite(async () => {
    if (!(await contractCodeExists(contractAddress))) {
      throw Object.assign(new Error('Registry contract is not deployed on the connected node'), { errorCode: 'BLOCKCHAIN_UNAVAILABLE' });
    }
    const bytes32Id = ethers.id(propertyId);
    const tx = await active.registerProperty(bytes32Id, ownerWalletAddress);
    const receipt = await tx.wait(1);
    if (receipt.status !== 1) throw Object.assign(new Error('Property registration transaction reverted'), { errorCode: 'TX_REVERTED' });
    return {
      transactionHash: receipt.hash,
      blockNumber: Number(receipt.blockNumber),
      fromAddress: tx.from,
      toAddress: contractAddress,
      gasUsed: receipt.gasUsed ? Number(receipt.gasUsed) : null,
    };
  });
}

/**
 * Settle an ownership transfer on-chain. Ensures the property exists on-chain
 * first (self-heals seeds where the DB row exists but chain registration was
 * skipped because the node was offline at seed time).
 */
async function transferOwnershipOnChain(propertyId, expectedOwnerWallet, newOwnerWallet) {
  const active = getContract();
  if (!active) throw Object.assign(new Error('Blockchain unavailable'), { errorCode: 'BLOCKCHAIN_UNAVAILABLE' });
  return enqueueWrite(async () => {
    if (!(await contractCodeExists(contractAddress))) {
      throw Object.assign(new Error('Registry contract is not deployed on the connected node'), { errorCode: 'BLOCKCHAIN_UNAVAILABLE' });
    }
    const bytes32Id = ethers.id(propertyId);

    const registered = await active.isRegistered(bytes32Id);
    if (!registered) {
      logger.warn(`[blockchain] ${propertyId} not registered on-chain yet - registering before transfer settlement`);
      const regTx = await active.registerProperty(bytes32Id, expectedOwnerWallet);
      await regTx.wait(1);
    }

    const onChainOwner = await active.getPropertyOwner(bytes32Id);
    if (onChainOwner.toLowerCase() !== String(expectedOwnerWallet).toLowerCase()) {
      throw Object.assign(
        new Error('On-chain owner does not match the expected current owner. Registry is out of sync.'),
        { errorCode: 'CHAIN_OWNER_MISMATCH' }
      );
    }

    const tx = await active.transferOwnership(bytes32Id, expectedOwnerWallet, newOwnerWallet);
    const receipt = await tx.wait(1);
    if (receipt.status !== 1) throw Object.assign(new Error('Ownership transfer transaction reverted'), { errorCode: 'TX_REVERTED' });
    return {
      transactionHash: receipt.hash,
      blockNumber: Number(receipt.blockNumber),
      fromAddress: expectedOwnerWallet,
      toAddress: newOwnerWallet,
      gasUsed: receipt.gasUsed ? Number(receipt.gasUsed) : null,
    };
  });
}

async function verifyOwnershipOnChain(propertyId, claimedWallet) {
  const active = getContract();
  if (!active) return { available: false, verified: false };
  try {
    const verified = await active.verifyOwnership(ethers.id(propertyId), claimedWallet);
    return { available: true, verified };
  } catch {
    return { available: true, verified: false };
  }
}

module.exports = {
  getStatus,
  getContractAddress,
  registerPropertyOnChain,
  transferOwnershipOnChain,
  verifyOwnershipOnChain,
  humanError,
};
