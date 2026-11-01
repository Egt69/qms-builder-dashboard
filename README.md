# QMS Builder Dashboard

A comprehensive, lightweight toolset for the **QMS Post-Quantum Network Testnet**.

## 🚀 Features

- **Network Health Analytics:** Real-time monitoring of average block time, RPC latency, and recent block activity.
- **Smart Search Explorer:** Automatically detects and queries:
  - **Wallets** (Balance & Tx Count)
  - **Transactions** (Status & Value)
  - **ERC-20 Tokens** (Name, Symbol, & Total Supply via Contract Address)
- **Multi-Wallet Integration (EIP-6963):** Seamlessly connects with MetaMask, Rabby, OKX Wallet, and other EIP-6963 compatible wallets without conflict.
- **Token Factory:** A built-in browser compiler (via Web Worker) that allows users to deploy standard ERC-20 tokens directly to QMS Testnet with a one-click Contract Address (CA) copy feature.

## 🛠️ Tech Stack

- **Frontend:** Vanilla HTML, CSS, JavaScript (Zero-dependency, fast, and lightweight).
- **Web3 Library:** [Viem](https://viem.sh/) (via ESM CDN).
- **Multi-Wallet:** [MIPD (EIP-6963)](https://github.com/wevm/mipd) (via ESM CDN).
- **Compiler:** [Solc (Solidity Compiler)](https://docs.soliditylang.org/) running in a Web Worker.

## 🚀 Live Demo

You can try the live dashboard here:
https://qms-builder-dashboard-bw5i.vercel.app/

## 💻 How to Run Locally

1. Clone the repository.
2. Open the project folder in your terminal.
3. Run a local server (e.g., `npx serve .` or use VS Code Live Server).
4. Open `http://localhost:3000` in your browser.
5. Connect your wallet (ensure you are on QMS Testnet).
