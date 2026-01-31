#!/usr/bin/env node

import { initializeCoco, getEncodedToken } from 'coco-cashu-core';
import { SqliteRepositories } from 'coco-cashu-sqlite3';
import sqlite3 from 'sqlite3';
import { randomBytes } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const WALLET_DIR = join(homedir(), '.cashu-wallet');
const OLD_WALLET_DIR = join(homedir(), '.coco-wallet');
const SEED_FILE = join(WALLET_DIR, 'seed.txt');
const DB_FILE = join(WALLET_DIR, 'wallet.db');

// Migration: Move old wallet directory if it exists and new one doesn't
if (!existsSync(WALLET_DIR) && existsSync(OLD_WALLET_DIR)) {
  try {
    renameSync(OLD_WALLET_DIR, WALLET_DIR);
    console.log(`📦 Migrated data from ${OLD_WALLET_DIR} to ${WALLET_DIR}`);
  } catch (err) {
    console.error('Migration error:', err);
  }
}

// Ensure wallet directory exists
if (!existsSync(WALLET_DIR)) {
  mkdirSync(WALLET_DIR, { recursive: true });
}

// Seed getter function (64 bytes for BIP39 compatibility in coco)
async function seedGetter() {
  if (existsSync(SEED_FILE)) {
    return new Uint8Array(Buffer.from(readFileSync(SEED_FILE, 'utf8'), 'hex'));
  } else {
    const seed = randomBytes(64);
    writeFileSync(SEED_FILE, seed.toString('hex'));
    return new Uint8Array(seed);
  }
}

// Initialize sqlite3 database connection
const database = new sqlite3.Database(DB_FILE);
const repo = new SqliteRepositories({ database });

const coco = await initializeCoco({ repo, seedGetter });

const command = process.argv[2];
const args = process.argv.slice(3);

async function cleanup() {
  try {
    // Dispose coco manager (stops watchers/processors)
    if (coco && coco.dispose) {
      await coco.dispose();
    }
    // Close database
    database.close((err) => {
      if (err) console.error('Database close error:', err);
    });
  } catch (err) {
    console.error('Cleanup error:', err);
  }
}

async function main() {
  try {
    switch (command) {
      case 'balance': {
        const balances = await coco.wallet.getBalances();
        console.log('💰 Balances:');
        let total = 0;
        for (const [mintUrl, balance] of Object.entries(balances)) {
          console.log(`  ${mintUrl}: ${balance} s`);
          total += balance;
        }
        console.log(`\nTotal: ${total} sats`);
        break;
      }

      case 'add-mint':
        if (!args[0]) {
          console.error('Usage: cashu-wallet add-mint <mint-url>');
          process.exit(1);
        }
        await coco.mint.addMint(args[0], { trusted: true });
        console.log(`✅ Added and trusted mint: ${args[0]}`);
        break;

      case 'invoice': {
        const amount = parseInt(args[0]) || 1000;
        const mintUrl = args[1] || (await coco.mint.getAllMints())[0]?.mintUrl;
        const timeoutMs = parseInt(args[2]) || 300000; // Default 5 minutes
        const pollInterval = 5000; // Check every 5 seconds
        
        if (!mintUrl) {
          console.error('No mint found. Add a mint first with: cashu-wallet add-mint <url>');
          process.exit(1);
        }
        
        const quote = await coco.quotes.createMintQuote(mintUrl, amount);
        console.log('⚡️ Lightning Invoice:');
        console.log(quote.request);
        console.log(`\n💡 Quote ID: ${quote.quote}`);
        console.log(`Amount: ${amount} sat`);
        console.log(`Mint: ${mintUrl}`);
        console.log(`\n⏳ Waiting for payment (timeout: ${timeoutMs/1000}s)...`);
        
        const startTime = Date.now();
        let paid = false;
        
        while (Date.now() - startTime < timeoutMs) {
          try {
            // Check if already paid/issued by background process
            const localQuote = await coco.mintQuoteRepository.getMintQuote(mintUrl, quote.quote);
            if (localQuote && localQuote.state === 'ISSUED') {
              paid = true;
              break;
            }

            // Try to redeem - this will throw if not paid yet
            await coco.quotes.redeemMintQuote(mintUrl, quote.quote);
            paid = true;
            break;
          } catch (error) {
            // Check if it's a "not paid" error or other pending state
            const errorMsg = error.message || '';
            
            // Handle "already issued" which means background process beat us to it
            if (errorMsg.includes('already issued') || errorMsg.includes('already spent') || errorMsg.includes('Tokens already minted')) {
              // Double check state
              const localQuote = await coco.mintQuoteRepository.getMintQuote(mintUrl, quote.quote);
              if (localQuote && localQuote.state === 'ISSUED') {
                paid = true;
                break;
              }
            }

            if (errorMsg.includes('PENDING') || 
                errorMsg.includes('not paid') || 
                errorMsg.includes('UNPAID') ||
                errorMsg.includes('Quote not paid') ||
                errorMsg.includes('quote not paid')) {
              // Still waiting for payment, continue polling
              process.stdout.write('.');
              await new Promise(resolve => setTimeout(resolve, pollInterval));
            } else {
              // Real error, throw it
              throw error;
            }
          }
        }
        
        if (paid) {
          console.log('\n✅ Invoice paid! Tokens minted.');
        } else {
          console.log(`\n⏰ Payment timeout. Check later with: cashu-wallet check-invoice ${quote.quote} ${mintUrl}`);
        }
        break;
      }

      case 'check-invoice': {
        if (!args[0]) {
          console.error('Usage: cashu-wallet check-invoice <quote-id> [mint-url]');
          process.exit(1);
        }
        
        const mintUrlCheck = args[1] || (await coco.mint.getAllMints())[0]?.mintUrl;
        
        if (!mintUrlCheck) {
          console.error('❌ No mint found. Add a mint first with: cashu-wallet add-mint <url>');
          process.exit(1);
        }
        
        try {
          // Check local state first
          const localQuote = await coco.mintQuoteRepository.getMintQuote(mintUrlCheck, args[0]);
          if (localQuote && localQuote.state === 'ISSUED') {
            console.log('✅ Invoice paid! Tokens minted.');
          } else {
            await coco.quotes.redeemMintQuote(mintUrlCheck, args[0]);
            console.log('✅ Invoice paid! Tokens minted.');
          }
        } catch (error) {
          const errorMsg = error.message || '';
          
          if (errorMsg.includes('already issued') || errorMsg.includes('already spent')) {
             const localQuote = await coco.mintQuoteRepository.getMintQuote(mintUrlCheck, args[0]);
             if (localQuote && localQuote.state === 'ISSUED') {
                console.log('✅ Invoice paid! Tokens minted.');
                break;
             }
          }

          if (errorMsg.includes('PENDING') || 
              errorMsg.includes('not paid') || 
              errorMsg.includes('UNPAID')) {
            console.log('⏳ Invoice not paid yet (PENDING).');
          } else {
            console.error('❌ Error redeeming quote:', error.message);
            process.exit(1);
          }
        }
        break;
      }

      case 'send': {
        const sendAmount = parseInt(args[0]);
        const sendMintUrl = args[1] || (await coco.mint.getAllMints())[0]?.mintUrl;
        
        if (!sendAmount) {
          console.error('Usage: cashu-wallet send <amount> [mint-url]');
          process.exit(1);
        }
        if (!sendMintUrl) {
          console.error('❌ No mint found. Add one with `add-mint`.');
          process.exit(1);
        }

        try {
          // Use modern send API: prepare -> execute
          const preparedOperation = await coco.send.prepareSend(sendMintUrl, sendAmount);
          const { token } = await coco.send.executePreparedSend(preparedOperation.id);
          const encodedToken = getEncodedToken(token);
          console.log(encodedToken);
        } catch (error) {
          console.error(`❌ Send failed from ${sendMintUrl}:`, error.message);
          process.exit(1);
        }
        break;
      }

      case 'pay-invoice': {
        if (!args[0]) {
          console.error('Usage: cashu-wallet pay-invoice <bolt11-invoice> [mint-url]');
          process.exit(1);
        }
        const payInvoice = args[0];
        const payMintUrl = args[1] || (await coco.mint.getAllMints())[0]?.mintUrl;
        
        if (!payMintUrl) {
          console.error('❌ No mint found. Add one with `add-mint`.');
          process.exit(1);
        }
        
        console.log(`💸 Paying invoice via mint: ${payMintUrl}`);
        try {
          const operation = await coco.quotes.prepareMeltBolt11(payMintUrl, payInvoice);
          console.log(`Preparing melt operation: ${operation.id}`);
          console.log(`  Amount: ${operation.amount} sats`);
          console.log(`  Fee reserve: ${operation.fee_reserve} sats`);
          
          const result = await coco.quotes.executeMelt(operation.id);
          console.log('✅ Payment successful!');
          console.log(`  State: ${result.state}`);
          if (result.amount) {
            console.log(`  Amount paid: ${result.amount} sats`);
          }
        } catch (error) {
          console.error('❌ Error paying invoice:', error.message);
          process.exit(1);
        }
        break;
      }

      case 'mints': {
        const mints = await coco.mint.getAllMints();
        console.log('🏦 Mints:');
        mints.forEach(m => console.log(`  ${m.mintUrl} (trusted: ${m.trusted})`));
        break;
      }

      case 'history': {
        const limit = parseInt(args[0]) || 20;
        const offset = parseInt(args[1]) || 0;
        const history = await coco.history.getPaginatedHistory(offset, limit);
        if (history.length === 0) {
          console.log('📜 No history found.');
        } else {
          console.log(`📜 History (${history.length} items):`);
          history.forEach(h => {
             const date = new Date(h.createdAt || h.timestamp).toLocaleString();
             const type = (h.type || 'UNKNOWN').toUpperCase();
             const amount = h.amount > 0 ? `+${h.amount}` : `${h.amount}`;
             const status = h.status || h.state || 'COMPLETED';
             let idInfo = '';
             if (h.type === 'mint' || h.type === 'melt') {
               idInfo = ` Quote: ${h.quoteId}`;
             } else if (h.type === 'send') {
               idInfo = ` Op: ${h.operationId}`;
             }
             console.log(`  [${date}] ${type} ${amount} sats (Mint: ${h.mintUrl}) - ${status}${idInfo}`);
          });
        }
        break;
      }

      case 'restore': {
        if (!args[0]) {
          console.error('Usage: cashu-wallet restore <mint-url>');
          process.exit(1);
        }
        console.log(`♻️  Restoring wallet from mint: ${args[0]}...`);
        try {
          await coco.wallet.restore(args[0]);
          console.log('✅ Restore completed successfully.');
        } catch (error) {
          console.error('❌ Restore failed:', error.message);
          process.exit(1);
        }
        break;
      }

      case 'receive': {
        if (!args[0]) {
          console.error('Usage: cashu-wallet receive <cashu-token>');
          process.exit(1);
        }
        try {
          await coco.wallet.receive(args[0]);
          console.log(`✅ Token received successfully`);
        } catch (error) {
          console.error('❌ Error receiving token:', error.message);
          process.exit(1);
        }
        break;
      }

      default:
        console.log(`
Cashu Wallet CLI

Commands:
  balance                    Show wallet balance
  add-mint <url>            Add and trust a mint
  mints                     List all mints
  history [limit] [offset]  Show transaction history
  restore <mint-url>        Restore wallet from seed for a specific mint
  invoice <amount> [mint] [timeout-ms]  Create Lightning invoice and wait for payment (default: 1000 sat, 5min timeout)
  check-invoice <quote-id> [mint-url]  Check if invoice is paid and mint tokens
  pay-invoice <bolt11> [mint-url]     Pay a Lightning invoice
  send <amount> [mint]      Generate cashu token
  receive <token>           Receive cashu token
        `);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    await cleanup();
    process.exit(1);
  }
  
  await cleanup();
  process.exit(0);
}

main();