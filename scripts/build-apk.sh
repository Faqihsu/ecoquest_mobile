#!/bin/bash

# EcoQuest Mobile - Build APK for Android with EAS

set -e

echo "📱 EcoQuest Mobile - Building APK for Android"
echo "=========================================="
echo ""

# Check if EAS CLI is installed
if ! command -v eas &> /dev/null; then
    echo "❌ EAS CLI not found. Installing..."
    npm install -g eas-cli
fi

cd /home/cryptoz/ecoquest_mobile/mobile

echo "📦 Installing dependencies..."
npm install

echo ""
echo "🔨 Building APK for Android (devnet)..."
echo "This may take 10-15 minutes..."
echo ""

# Build with EAS
eas build --platform android --local

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Build successful!"
    echo ""
    echo "📊 Build Summary:"
    echo "   Platform: Android"
    echo "   Target SDK: 33+"
    echo "   ABI: arm64-v8a"
    echo ""
    echo "🎯 Next Steps:"
    echo "   1. Download APK from EAS (check link above)"
    echo "   2. Transfer to Android device"
    echo "   3. Install: adb install app-release.apk"
    echo "   4. Or upload to Solana dApp Store"
else
    echo "❌ Build failed!"
    exit 1
fi

echo ""
echo "✨ Done!"
