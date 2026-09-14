"use strict";

/**
 * Deploys the LandRegistry contract and writes a deployment artifact that
 * the backend service consumes to bind to the on-chain registry.
 *
 * Usage:
 *   npm run deploy        -> targets the "localhost" network (running node)
 *   npm run deploy:local  -> one-shot deploy on the in-process Hardhat network
 *
 * Artifact: deployments/local.json
 *   { network, contractAddress, deployer, deployedAt, transactionHash }
 */

const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();

  console.log("Network:            ", hre.network.name);
  console.log("Deployer (operator):", deployer.address);
  console.log("Deploying LandRegistry...");

  const LandRegistry = await hre.ethers.getContractFactory("LandRegistry", deployer);
  const landRegistry = await LandRegistry.deploy();
  await landRegistry.waitForDeployment();

  const contractAddress = await landRegistry.getAddress();
  const deploymentTx = landRegistry.deploymentTransaction();

  const artifact = {
    network: hre.network.name,
    contractAddress: contractAddress,
    deployer: deployer.address,
    deployedAt: new Date().toISOString(),
    transactionHash: deploymentTx ? deploymentTx.hash : null,
  };

  const deploymentsDir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(deploymentsDir)) {
    fs.mkdirSync(deploymentsDir, { recursive: true });
  }
  const artifactPath = path.join(deploymentsDir, "local.json");
  fs.writeFileSync(artifactPath, JSON.stringify(artifact, null, 2));

  console.log("==========================================================");
  console.log("LandRegistry deployed at:", contractAddress);
  console.log("Deployment tx:           ", artifact.transactionHash);
  console.log("Artifact written to:     ", artifactPath);
  console.log("==========================================================");
}

main()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
