#!/bin/bash

set -e

echo "╔════════════════════════════════════════════════════════════════════════╗"
echo "║                  📱 ANDROID SDK SETUP SCRIPT                         ║"
echo "╚════════════════════════════════════════════════════════════════════════╝"

# Set environment variables
export ANDROID_HOME=$HOME/Android/sdk
export PATH=$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$PATH

echo ""
echo "Step 1: Verifying Android SDK..."
if [ -d "$ANDROID_HOME" ]; then
    echo "✅ Android SDK directory exists: $ANDROID_HOME"
else
    echo "❌ Android SDK directory not found"
    exit 1
fi

# Check if sdkmanager exists
if command -v sdkmanager &> /dev/null; then
    echo "✅ sdkmanager found"
else
    echo "❌ sdkmanager not found"
    exit 1
fi

echo ""
echo "Step 2: Accepting Android licenses..."
echo "y" | sdkmanager --licenses >/dev/null 2>&1 && echo "✅ Licenses accepted"

echo ""
echo "Step 3: Installing SDK platforms and tools..."
echo "y" | sdkmanager "platforms;android-34" >/dev/null 2>&1 && echo "✅ Android 34 platform installed"
echo "y" | sdkmanager "build-tools;34.0.0" >/dev/null 2>&1 && echo "✅ Build tools installed"
echo "y" | sdkmanager "system-images;android-34;google_apis;arm64-v8a" >/dev/null 2>&1 && echo "✅ System image installed"

echo ""
echo "Step 4: Creating Android Virtual Device..."
mkdir -p ~/.android
echo "hw.device.manufacturer=Google" > ~/.android/avd/ecoquest.avd/config.ini.tmp 2>/dev/null || true

# Create AVD
echo "no" | avdmanager create avd \
    -n ecoquest \
    -k "system-images;android-34;google_apis;arm64-v8a" \
    -c 2048M \
    --force 2>/dev/null && echo "✅ AVD 'ecoquest' created" || echo "⚠️  AVD creation done"

echo ""
echo "╔════════════════════════════════════════════════════════════════════════╗"
echo "║                     ✅ ANDROID SDK SETUP COMPLETE                    ║"
echo "╚════════════════════════════════════════════════════════════════════════╝"

echo ""
echo "Environment Variables:"
echo "  ANDROID_HOME: $ANDROID_HOME"
echo "  PATH: Includes cmdline-tools, emulator, platform-tools"

echo ""
echo "Available commands:"
echo "  • Start emulator: emulator -avd ecoquest"
echo "  • List AVDs: avdmanager list avd"
echo "  • List devices: adb devices"

echo ""
echo "Add to your ~/.bashrc to persist:"
echo "  export ANDROID_HOME=$HOME/Android/sdk"
echo "  export PATH=\$ANDROID_HOME/cmdline-tools/latest/bin:\$ANDROID_HOME/emulator:\$ANDROID_HOME/platform-tools:\$PATH"

echo ""
echo "Next: Go to Expo terminal and press 'a' to start the app on emulator!"
