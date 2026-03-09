# 🚀 Setup Antigravity AI Assistant di VS Code

## ✅ Status: Berhasil Dikonfigurasi!

Antigravity AI Coding Assistant sudah siap digunakan di project EcoQuest Mobile.

---

## 🎯 Keyboard Shortcuts

| Shortcut           | Perintah               | Fungsi                                  |
| ------------------ | ---------------------- | --------------------------------------- |
| `Ctrl + Alt + A`   | Open Antigravity Panel | Buka dashboard utama Antigravity        |
| `Ctrl + Shift + A` | Code with Agent        | Minta AI untuk code dengan full context |
| `Ctrl + Alt + I`   | Edit Code Inline       | Edit code sambil tetap dalam file       |
| `Ctrl + Alt + E`   | Open Agent Manager     | Manage custom agents dan settings       |

---

## 💡 Cara Penggunaan

### 1. **Meminta Antigravity Membantu Coding**

```
Ctrl + Shift + A
→ Ketik perintah dalam bahasa Indonesia atau Inggris
→ Antigravity akan menganalisis codebase dan memberikan solusi
```

**Contoh:**

- "Tambahkan fitur staking baru di StakingScreen"
- "Fix error di SolanaService"
- "Refactor WalletConnectScreen untuk lebih modular"

### 2. **Edit Code Langsung**

```
Ctrl + Alt + I
→ Pilih kode yang ingin diubah
→ Ketik instruksi perubahan
→ Antigravity akan melakukan edit inline
```

### 3. **Monitor Quota Penggunaan**

```
Ctrl + Alt + A
→ Lihat Antigravity Cockpit panel
→ Monitor usage Claude/GPT models
```

---

## 🔧 Konfigurasi

File konfigurasi: `.vscode/settings.json`

**Pengaturan utama:**

- `antigravity.modelProvider`: `claude` (Claude Haiku 4.5 sebagai default)
- `antigravity.contextPaths`: Folder yang diprioritaskan untuk analysis
- `antigravity-cockpit.enableQuotaMonitor`: Pantau penggunaan quota

---

## 🎨 Project Context yang Sudah Dikonfigurasi

Antigravity sudah diatur untuk memahami:

### Mobile App (React Native + TypeScript)

- `mobile/src/screens/` - UI screens
- `mobile/src/services/` - Business logic
- `mobile/src/components/` - Reusable components
- Solana wallet integration
- NFT & Staking features

### Smart Contracts (Rust)

- `programs/ecoquest_mobile/src/` - Anchor program
- Blockchain logic

### Features Antigravity Siap Membantu

✅ Implementasi fitur baru  
✅ Bug fixing & debugging  
✅ Code refactoring  
✅ Integrasi Solana/NFT  
✅ UI/UX improvements  
✅ Testing & documentation

---

## 🚦 Tips Maksimalkan Penggunaan

1. **Beri konteks yang jelas**

   - "Di WalletConnectScreen, tambahkan tombol untuk QR code scanner"
   - Lebih spesifik = solusi lebih akurat

2. **Gunakan untuk code review**

   - Minta Antigravity review code sebelum commit
   - Cek security, performance, best practices

3. **Batch requests**

   - Untuk multiple changes, kelompokkan dalam satu request
   - "Refactor 3 screens ini: WalletConnect, Map, Profile"

4. **Monitor quota**
   - Lihat Cockpit untuk tracking penggunaan
   - Ada monthly limit yang perlu diperhatikan

---

## 📞 Troubleshooting

### Antigravity panel tidak muncul?

```bash
# Reload VS Code extensions
Cmd/Ctrl + Shift + P → "Developer: Reload Window"
```

### API key tidak valid?

```bash
# Check Antigravity account settings
# Ensure subscription aktif di https://antigravity.dev
```

### Keyboard shortcuts tidak bekerja?

```
File → Preferences → Keyboard Shortcuts
Cari "antigravity" untuk verify keybindings
```

---

**Happy Coding dengan Antigravity! 🎉**
