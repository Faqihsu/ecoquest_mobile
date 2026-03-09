# 🚀 EcoQuest Mobile - Quick Start Guide

## ⚡ 5-Minute Setup

### Step 1: Clone & Navigate
```bash
cd /home/cryptoz/ecoquest_mobile
```

### Step 2: Run Setup Script
```bash
bash scripts/setup.sh
```

This automatically:
- ✅ Installs all dependencies
- ✅ Builds Anchor programs
- ✅ Configures development environment

### Step 3: Deploy Smart Contracts
```bash
bash scripts/deploy-devnet.sh
```

This will:
- ✅ Check wallet (requires devnet SOL)
- ✅ Build Rust programs
- ✅ Deploy to Solana devnet

### Step 4: Start Mobile App
```bash
cd mobile
npm start
```

Then press:
- `a` for Android emulator
- `i` for iOS simulator
- `w` for web preview

---

## 📱 Mobile App First Run

### Install Required:
1. **Android Studio** (for emulator)
   ```bash
   # macOS
   brew install android-studio
   
   # Linux: Download from android.com/studio
   ```

2. **Expo CLI** (already in node_modules)
   ```bash
   npx expo
   ```

### Or Use Physical Device:
1. Install **Expo Go** app from Play Store
2. Run `npm start` in mobile folder
3. Scan QR code with phone

---

## 🧪 Testing Checklist

### Smart Contracts ✅
```bash
cd /home/cryptoz/ecoquest_mobile
anchor test
```

### Mobile App ✅
```bash
cd mobile
npm run type-check
npx eslint src
```

### Full Integration ✅
1. Open app on emulator/phone
2. Connect Phantom wallet (testnet)
3. Accept quest (will use mock data)
4. Mint NFT (simulated)
5. Stake SKR (simulated)
6. Vote on proposal (simulated)

---

## 🎮 Key Features Demo

### 1. Wallet Connection (30s)
```
Splash Screen → Click "Phantom" → Approve in Phantom → Map Screen
```

### 2. Complete Quest (1-2 min)
```
Map → See nearby quests → Tap quest → Camera opens → 
Take photo → Submit → NFT mints → Profile shows NFT
```

### 3. Stake SKR (30s)
```
Bottom tab "Stake" → Enter amount → Click "Stake SKR" → 
See staked amount → Click "Claim Rewards"
```

### 4. Battle PvP (1 min)
```
Bottom tab "Arena" → See open duels → "Accept Challenge" → 
Battle settles → History shows win
```

### 5. Vote Governance (30s)
```
Bottom tab "Vote" → See proposals → Click "Yes" or "No" → 
Vote recorded → See voting progress
```

---

## 🔧 Troubleshooting

### "Wallet not connected"
**Solution**: Install Phantom wallet extension/app first
```bash
https://phantom.app
```

### "Program ID mismatch"
**Solution**: Update PROGRAM_ID in `mobile/src/utils/constants.ts`
```typescript
export const PROGRAM_ID = "YOUR_DEPLOYED_PROGRAM_ID";
```

### "Insufficient devnet SOL"
**Solution**: Request airdrop
```bash
solana airdrop 1  # Request 1 SOL
solana airdrop 2  # Request 2 more if needed
```

### "Anchor build fails"
**Solution**: Install Rust & tools
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
rustup component add rustfmt
```

### "Emulator won't start"
**Solution**: Create/launch emulator through Android Studio
```bash
# Or use
npx expo run:android --device
```

---

## 📊 Project Statistics

- **React Native Code**: ~2,500 lines
- **Anchor Rust Code**: ~1,200 lines
- **TypeScript Definitions**: ~400 lines
- **Total Components**: 15+ screens
- **Programs**: 3 (Quest, Staking, PvP + Governance)
- **Development Time**: 1-2 week MVP

---

## 🎯 Next Phase Tasks (Week 2)

- [ ] Connect real IPFS for NFT metadata
- [ ] Implement WebSocket for live PvP
- [ ] Add AR camera for photos
- [ ] Create admin dashboard for quest creation
- [ ] Integrate with Jupiter API for swaps
- [ ] Setup proper governance
- [ ] Add Guardian pool management
- [ ] Create mainnet version
- [ ] Submit to Solana dApp Store
- [ ] Launch iOS testflight

---

## 💡 Development Tips

### Hot Reload
```bash
# Mobile app auto-reloads on file save
npm start  # Already running, just save file
```

### Debug Smart Contracts
```bash
# Add logs to Rust code
msg!("Debug info: {:?}", variable);

# View in deployment output
```

### Check Transactions
```bash
# View all transactions for your wallet
solana confirmed-transaction-history

# Or use explorer
https://explorer.solana.com/?cluster=devnet
```

### Monitor Devnet Usage
```bash
# Check current balance
solana balance

# View account info
solana account YOUR_PROGRAM_ID
```

---

## 📦 Build for Production

### Android APK (Production)
```bash
bash scripts/build-apk.sh
```

Output will be in:
```
mobile/build/outputs/apk/release/app-release.apk
```

### Code Obfuscation
Update `mobile/android/app/build.gradle`:
```gradle
minifyEnabled true
shrinkResources true
```

### Size Optimization
```bash
# Check bundle size
npx expo export:web
# Check dist/ folder
```

---

## 📚 Learning Resources

### Solana Development
- [Solana Docs](https://docs.solana.com)
- [Anchor Book](https://book.anchor-lang.com)
- [Web3.js Reference](https://solana-labs.github.io/solana-web3.js/)

### React Native
- [React Native Docs](https://reactnative.dev)
- [Expo Docs](https://docs.expo.dev)
- [React Navigation](https://reactnavigation.org)

### Mobile Wallet Integration
- [Solana Mobile Stack](https://docs.solanamobile.com)
- [Phantom Docs](https://docs.phantom.app)
- [Backpack Docs](https://backpack.app/docs)

---

## ✅ Pre-Launch Checklist

- [ ] All features tested on emulator
- [ ] All features tested on physical device
- [ ] Smart contracts audited
- [ ] Zero TypeScript errors
- [ ] No console warnings in app
- [ ] Performance tested (FPS stable)
- [ ] Battery/data usage optimized
- [ ] Privacy policy written
- [ ] Terms of service written
- [ ] Support email configured

---

## 🤝 Community & Support

- **GitHub**: [ecoquest-mobile](https://github.com/yourusername/ecoquest-mobile)
- **Discord**: [EcoQuest Community](#)
- **Twitter**: [@EcoQuestMobile](#)
- **Email**: support@ecoquest.game

---

## 🎉 You're Ready!

Everything is set up and ready to go. Happy development! 🌍

```
        🌍
       / \
      /   \
    📱     💻
    
 EcoQuest Mobile
   On Solana 🚀
```

---

**Last Updated**: February 16, 2026  
**Version**: 1.0.0 MVP  
**Status**: Ready for Testing ✅
