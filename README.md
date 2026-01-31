# Cashu Wallet CLI

A robust, technical command-line interface for managing [Cashu](https://cashu.space) ecash tokens and interacting with Bitcoin Lightning Network mints. This application is built on top of the `coco-cashu-core` library and utilizes a local SQLite database for state management.

## 🏗 Architecture

The Cashu Wallet CLI is designed as a lightweight wrapper around the core Cashu logic, emphasizing local self-custody and privacy.

### Tech Stack
- **Runtime:** Node.js (>=18.0.0) ES Modules (`.mjs`)
- **Core Logic:** `coco-cashu-core` (Handles blinding, proofs, mint/melt operations)
- **Persistence:** `coco-cashu-sqlite3` & `sqlite3` (Local database storage)
- **Cryptography:** Node.js `crypto` module

### Data Storage
All wallet data is stored locally in the user's home directory under `.cashu-wallet`:
- **`~/.cashu-wallet/wallet.db`**: A SQLite database containing:
  - **Proofs:** Your ecash tokens (secrets and blinding factors).
  - **Mint Quotes:** History of mint requests (invoices) and melt requests (payments).
  - **Mints:** List of trusted mint URLs and their keysets.
  - **History:** Transaction log.
- **`~/.cashu-wallet/seed.txt`**: A 64-byte hex-encoded random seed used to derive secrets. **Protect this file.**

### Workflow
1.  **Initialization:** On startup, the CLI connects to the SQLite database and initializes the repository layer.
2.  **Seed Generation:** If no seed exists, a cryptographic secure random 64-byte seed is generated and saved.
3.  **Command Execution:** The CLI parses arguments and invokes specific methods in `coco-cashu-core`.
4.  **Persistence:** State changes (new tokens, history, mints) are atomically committed to `wallet.db` via the repository pattern.
5.  **Cleanup:** Database connections and background watchers are gracefully closed on exit.

---

## ⚙️ Installation

### Prerequisites
- **Node.js**: Version 18.0.0 or higher.
- **NPM**: Package manager for installing dependencies.

### Setup Steps
1.  Clone the repository and navigate to the CLI directory:
    ```bash
    git clone <repo-url>
    cd cashu-wallet/cli
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  (Optional) Create a shell alias for easier access:
    Add the following to your `.bashrc` or `.zshrc`:
    ```bash
    alias cashu='node /absolute/path/to/cashu-wallet/cli/wallet.mjs'
    ```

---

## 🚀 Usage

The general syntax for the CLI is:
```bash
node cli/wallet.mjs <command> [arguments...]
```

### 1. Wallet Management

#### `balance`
Displays the total balance across all connected mints.
```bash
node cli/wallet.mjs balance
```
*Output:* Breakdown by mint URL and total sum in satoshis.

#### `history [limit] [offset]`
View transaction history including mints, melts, and transfers.
- **limit:** Number of records to show (default: 20)
- **offset:** Pagination offset (default: 0)
```bash
node cli/wallet.mjs history 10 0
```

#### `restore <mint-url>`
Restores funds for a specific mint using the local seed. Useful if the database was corrupted but the seed file is intact.
```bash
node cli/wallet.mjs restore https://mint.url
```

### 2. Mint Management

#### `mints`
Lists all currently trusted mints and their status.
```bash
node cli/wallet.mjs mints
```

#### `add-mint <url>`
Connects to a new mint, fetches its keysets, and adds it to the trusted list.
```bash
node cli/wallet.mjs add-mint https://testnut.cashu.space
```

### 3. Incoming Payments (Minting/Receiving)

#### `invoice <amount> [mint-url] [timeout-ms]`
Generates a Lightning Network BOLT11 invoice. The CLI polls the mint for payment confirmation.
- **amount:** Amount in satoshis (default: 1000)
- **mint-url:** (Optional) Specific mint to use. Defaults to the first configured mint.
- **timeout-ms:** (Optional) Polling duration in milliseconds (default: 300000 aka 5 mins).

```bash
node cli/wallet.mjs invoice 500
```
*Process:*
1.  CLI requests a mint quote.
2.  Displays QR code data (invoice).
3.  Polls the mint every 5 seconds.
4.  Upon payment detection, performs the minting operation (blind signature exchange) and stores tokens.

#### `check-invoice <quote-id> [mint-url]`
Manually checks the status of a mint quote. Useful if the `invoice` command timed out or was closed before confirmation.
```bash
node cli/wallet.mjs check-invoice "quote_id_here"
```

#### `receive <token>`
Imports an existing Cashu token (string starting with `cashuA...`) into the wallet.
```bash
node cli/wallet.mjs receive "cashuAeyJ0b2tlbi..."
```

### 4. Outgoing Payments (Melting/Sending)

#### `pay-invoice <bolt11-invoice> [mint-url]`
Pays a Lightning Network invoice using wallet funds (Melting).
```bash
node cli/wallet.mjs pay-invoice lnbc10u...
```
*Process:*
1.  Prepares the melt operation (calculates fees).
2.  Reserves necessary tokens.
3.  Executes the melt request with the mint.
4.  Updates balance upon success.

#### `send <amount> [mint-url]`
Creates a Cashu token for sending to another user.
```bash
node cli/wallet.mjs send 100
```
*Output:* A standard Cashu token string (v4 format).

---

## 🔧 Troubleshooting

### "Mint quote already issued"
If you receive this error during an invoice check, it means the background processor or a previous process successfully completed the minting, but the current process tried to do it again. Check your balance (`cashu balance`) or history (`cashu history`) to confirm the funds arrived.

### Database Locks
SQLite uses file-based locking. Ensure you don't have multiple instances of the wallet attempting to write to the DB simultaneously in tight loops, although standard concurrency is handled by `sqlite3`.

### Migration
If you previously used a version of this wallet that stored data in `~/.coco-wallet`, the CLI will automatically migrate your data to `~/.cashu-wallet` on the first run.

---

## 💻 Development

### Running Tests
There is no dedicated test runner. The `test` script runs a basic balance check:
```bash
npm test
```
For manual testing, run individual commands against a test mint (e.g., Testnut).

### Code Structure
- **`cli/wallet.mjs`**: Entry point. Handles argument parsing, initialization, and command routing.
- **Dependencies**:
  - `coco-cashu-core`: Contains the business logic for Cashu protocols.
  - `coco-cashu-sqlite3`: Implements the `CashuRepository` interface for SQLite.

## 📄 License

MIT License. See `package.json` for details.
