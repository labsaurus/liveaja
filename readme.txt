# Panduan Deployment ke VPS Linux

**Jawaban Singkat:** Tidak perlu GUI. **Basis teks (CLI) justru lebih bagus** karena lebih hemat RAM dan CPU, sehingga resource bisa fokus untuk streaming dan looping video.

Berikut adalah langkah-langkah instalasi dari nol untuk VPS berbasis Ubuntu/Debian.

## 1. Persiapan Server
Login ke VPS Anda via SSH.
```bash
ssh root@ip-address-anda
```

Update dan install dependencies dasar:
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl ffmpeg git unzip
```

Install Node.js (Versi 18+):
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

Install PM2 (untuk menjalankan aplikasi 24/7 di background):
```bash
sudo npm install -g pm2
```

## 2. Upload Aplikasi
Anda bisa menggunakan `scp` dari komputer lokal atau upload ke GitHub lalu clone di VPS.
Contoh jika upload manual folder project:
```bash
# Di komputer lokal Anda (bukan di VPS)
scp -r youtube-stream-manager root@ip-address-anda:~/
```

Atau jika menggunakan Git:
```bash
git clone https://github.com/username/repo-anda.git
cd repo-anda
```

## 3. Setup Backend
Masuk ke folder server dan install dependencies:
```bash
cd ~/youtube-stream-manager/server
npm install
npm run build
```

Jalankan backend menggunakan PM2:
```bash
pm2 start dist/server.js --name "yt-manager-backend"
pm2 save
pm2 startup
```

## 4. Setup Frontend
Masuk ke folder client dan build:
```bash
cd ~/youtube-stream-manager/client
npm install
npm run build
```

Hasil build akan ada di folder `dist`. Untuk serving file ini, cara paling mudah adalah menggunakan `serve`:
```bash
sudo npm install -g serve
pm2 start serve --name "yt-manager-frontend" -- -s dist -l 5173
```
*Catatan: Untuk production yang lebih serius, disarankan menggunakan Nginx sebagai reverse proxy.*

## 5. Akses Aplikasi
Sekarang aplikasi Anda berjalan:
- Backend di port 3000
- Frontend di port 5173

Buka di browser: `http://ip-address-vps:5173`

> **Note:** Pastikan firewall VPS Anda mengizinkan port 3000 dan 5173.
> ```bash
> sudo ufw allow 3000
> sudo ufw allow 5173
> ```
