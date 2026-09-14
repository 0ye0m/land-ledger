require("@nomicfoundation/hardhat-toolbox");

/**
 * LAND LEDGER — blockchain module configuration.
 *
 * Environment (passed in by the main agent, no dotenv dependency):
 *  - BLOCKCHAIN_RPC_URL: RPC endpoint of the running Hardhat node for the
 *    "localhost" network. Defaults to http://127.0.0.1:8545.
 */

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      url: process.env.BLOCKCHAIN_RPC_URL || "http://127.0.0.1:8545",
    },
  },
};
