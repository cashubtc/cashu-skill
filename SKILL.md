---
name: Cashu wallet
description: Manage Bitcoin and Cashu ecash. Send/receive via Lightning, manage multiple mints, and transact privately with ecash tokens.
read_when:
  - User wants to pay for a service using Bitcoin or Lightning
  - User wants to receive Bitcoin or Lightning payments
  - User wants to check their wallet balance or transaction history
  - User wants to send or receive Cashu ecash tokens
  - User wants to add or manage Cashu mints
  - User wants to restore their wallet from a seed
metadata: {"clawdbot":{"emoji":"🥥","requires":{"bins":["node","npm"]}}}
---

# Cashu Wallet

**Cashu Wallet** is a lightweight, privacy-focused Bitcoin wallet powered by **Cashu ecash**. It allows you to send and receive payments instantly using the **Lightning Network** or by exchanging **ecash tokens** directly.

### 🌟 Key Features
*   **Bitcoin over Lightning:** Seamlessly send and receive Lightning payments.
*   **Cashu Ecash:** Privacy-preserving ecash tokens.
*   **Multi-Mint Support:** Connect to multiple mints to diversify risk or support different currencies (sats, usd, eur, etc., depending on the mint).


---

## 📦 Installation & Setup

The wallet is a Node.js CLI application located in this directory.

1.  **Install Dependencies:**
    ```bash
    cd cli
    npm install
    ```

2.  **Create Alias (Optional but Recommended):**
    To make commands easier to run, you can create an alias:
    ```bash
    alias cashu='node cli/wallet.mjs'
    ```

---

## 🚀 Usage Guide

All commands can be run using `node cli/wallet.mjs <command>` (or `cashu <command>` if aliased).

### 1. Managing Mints
Before you can do anything, you need to trust a **Mint**. A mint exchanges Bitcoin (Lightning) for ecash tokens.

*   **List Mints:** View connected mints and their status.
    ```bash
    node cli/wallet.mjs mints
    ```
*   **Add a Mint:** connect to a new mint URL.
    ```bash
    node cli/wallet.mjs add-mint https://mint.url
    # Example (Testnut):
    node cli/wallet.mjs add-mint https://testnut.cashu.space
    ```

### 2. Receiving Money (In)
*   **Via Lightning (Deposit):** Create a Lightning invoice to swap BTC for ecash.
    ```bash
    # Usage: invoice <amount> [mint_url]
    node cli/wallet.mjs invoice 1000
    ```
    *This command will generate an invoice and wait for payment. Once paid, it automatically mints the tokens.*

*   **Via Ecash Token:** Receive a Cashu token string sent by someone else.
    ```bash
    # Usage: receive <token>
    node cli/wallet.mjs receive "cashuA..."
    ```

### 3. Sending Money (Out)
*   **Via Lightning (Pay Invoice):** Pay a BOLT11 Lightning invoice using your ecash balance.
    ```bash
    # Usage: pay-invoice <bolt11_invoice> [mint_url]
    node cli/wallet.mjs pay-invoice lnbc10u...
    ```

*   **Via Ecash Token:** Generate a token to send to someone else off-chain.
    ```bash
    # Usage: send <amount> [mint_url]
    node cli/wallet.mjs send 500
    ```
    *Output: A `cashuA...` token string that you can share.*

### 4. Wallet Management
*   **Check Balance:** See your total balance across all mints.
    ```bash
    node cli/wallet.mjs balance
    ```

*   **Transaction History:** View past deposits, withdrawals, and transfers.
    ```bash
    node cli/wallet.mjs history
    ```

*   **Check Pending Invoice:** If you created an invoice but closed the CLI before it confirmed, check it manually.
    ```bash
    # Usage: check-invoice <quote_id> [mint_url]
    node cli/wallet.mjs check-invoice "quote_id_here"
    ```

*   **Restore Wallet:** Recover funds from a specific mint using your seed (stored in `~/.cashu-wallet/seed.txt`).
    ```bash
    node cli/wallet.mjs restore https://mint.url
    ```

---

## 🛠️ Troubleshooting


*   **Logs & Data:** Data is stored in `~/.cashu-wallet/wallet.db`.
*   **Recommended Mint:** `https://mint.coinos.io`
