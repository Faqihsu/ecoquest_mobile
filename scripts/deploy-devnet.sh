#!/bin/bash

# EcoQuest Mobile - Deploy Anchor Programs to Devnet

set -e

echo "🚀 EcoQuest Mobile - Solana Smart Contracts Deployment"
echo "=================================================="
echo ""

# Check if anchor is installed
if ! command -v anchor &> /dev/null; then
    echo "❌ Anchor CLI not found. Please install it first:"
    echo "   npm install -g @coral-xyz/anchor-cli"
    exit 1
fi

# Check if Solana CLI is installed
if ! command -v solana &> /dev/null; then
    echo "❌ Solana CLI not found. Please install it first:"
    echo "   sh -c \"$(curl -sSfL https://release.solana.com/v1.18.0/install)\""
    exit 1
fi

# Get current Solana network
CURRENT_NETWORK=$(solana config get | grep 'RPC URL' | awk '{print $3}')
echo "📡 Current Solana Network: $CURRENT_NETWORK"
echo ""

# Set to devnet if not already
echo "🔄 Setting Solana cluster to devnet..."
solana config set --url devnet

# Check wallet exists
WALLET_PATH="$HOME/.config/solana/id.json"
if [ ! -f "$WALLET_PATH" ]; then
    echo "❌ Solana wallet not found at $WALLET_PATH"
    echo "   Please create one with: solana-keygen new"
    exit 1
fi

# Get wallet address
WALLET_ADDRESS=$(solana address)
echo "💼 Wallet Address: $WALLET_ADDRESS"
echo ""

# Check wallet balance
BALANCE=$(solana balance | awk '{print $1}')
echo "💰 Wallet Balance: $BALANCE SOL"

if (( $(echo "$BALANCE < 0.5" | bc -l) )); then
    echo "⚠️  Warning: Low balance. Request devnet SOL from faucet:"
    echo "   solana airdrop 1"
    echo ""
fi

# Build program
echo "🔨 Building Anchor programs..."
cd /home/cryptoz/ecoquest_mobile
anchor build

if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
else
    echo "❌ Build failed!"
    exit 1
fi

# Extract program ID from IDL
echo ""
echo "📋 Program Information:"
PROGRAM_ID="4RoEXMwC3pvm1NYb8oXvcezJzsvxZmCwMgNUKZxCnju5"
echo "   Program ID: $PROGRAM_ID"

# Deploy to devnet
echo ""
echo "🚀 Deploying to Devnet..."
anchor deploy --provider.cluster devnet

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Deployment successful!"
    echo ""
    echo "📊 Deployment Summary:"
    echo "   Network: devnet"
    echo "   Program ID: $PROGRAM_ID"
    echo "   Wallet: $WALLET_ADDRESS"
    echo ""
    echo "🎯 Next Steps:"
    echo "   1. Update mobile/src/utils/constants.ts with PROGRAM_ID"
    echo "   2. Run: npm run start (from mobile/ directory)"
    echo "   3. Test with Devnet RPC endpoints"
else
    echo "❌ Deployment failed!"
    exit 1
fi

echo ""
echo "✨ Done!"
