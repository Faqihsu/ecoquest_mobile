#!/bin/bash

# EcoQuest Mobile - Quick setup and run script

set -e

echo "🌍 EcoQuest Mobile - Setup & Run"
echo "================================"
echo ""

PROJECT_ROOT="/home/cryptoz/ecoquest_mobile"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not installed"
    exit 1
fi

echo "✅ Node.js version: $(node -v)"

# Install root dependencies
echo ""
echo "📦 Installing root dependencies..."
cd "$PROJECT_ROOT"
npm install

# Install mobile dependencies
echo ""
echo "📦 Installing mobile dependencies..."
cd "$PROJECT_ROOT/mobile"
npm install

# Install Anchor dependencies
echo ""
echo "📦 Installing Anchor dependencies..."
cd "$PROJECT_ROOT"
anchor install

# Build programs
echo ""
echo "🔨 Building Anchor programs..."
anchor build

echo ""
echo "✅ Setup complete!"
echo ""
echo "🚀 Available commands:"
echo ""
echo "  Frontend (mobile):"
echo "    cd mobile && npm start        - Start Expo dev server"
echo "    cd mobile && npm run android  - Run on Android emulator"
echo "    cd mobile && npm run ios      - Run on iOS simulator"
echo ""
echo "  Backend (Anchor programs):"
echo "    anchor build                  - Build Rust programs"
echo "    anchor deploy                 - Deploy to devnet"
echo "    anchor test                   - Run tests"
echo ""
echo "  Scripts:"
echo "    bash scripts/deploy-devnet.sh - Deploy programs"
echo "    bash scripts/build-apk.sh     - Build release APK"
echo ""
echo "📖 Documentation: See README.md"
echo ""
