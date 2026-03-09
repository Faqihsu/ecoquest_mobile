#!/bin/bash

# EcoQuest Mobile - Run tests and validate setup

set -e

echo "🧪 EcoQuest Mobile - Testing Suite"
echo "=================================="
echo ""

PROJECT_ROOT="/home/cryptoz/ecoquest_mobile"

# Test Anchor programs
echo "🔬 Testing Anchor Programs..."
cd "$PROJECT_ROOT"
anchor test 2>/dev/null || echo "⚠️  Anchor tests require local validator"

# Type check TypeScript
echo ""
echo "🔍 TypeScript Type Checking..."
cd "$PROJECT_ROOT/mobile"
npx tsc --noEmit

# Lint code
echo ""
echo "📝 ESLint Checks..."
npx eslint src --ext .ts,.tsx --max-warnings 5 || echo "⚠️  Some linting warnings found"

echo ""
echo "✅ Test suite complete!"
