# Launcher

Use `start-trader.ps1` to open MetaTrader 5, start the local MT5 bridge, and start the app together.
It opens the AI Analyst page automatically.

## First run

If `scripts/launcher.config.json` does not exist, the script creates a template and stops.

Edit `mt5Path` to match your MT5 installation path, then run again.

The launcher creates `mt5-bridge/.venv` automatically and installs bridge dependencies there.

## Start

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start-trader.ps1
```

Or double-click `scripts/start-trader.bat`.

## Stop

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\stop-trader.ps1
```

Or double-click `scripts/stop-trader.bat`.

## Akses jarak jauh (Tailscale)

App tetap berjalan di PC ini, tapi bisa dipantau dari perangkat lain (HP/laptop) melalui jaringan privat Tailscale — tanpa membuka MT5.

1. Install **Tailscale** di PC ini: <https://tailscale.com/download> → login (OAuth Google/Microsoft/email).
2. Install Tailscale di perangkat lain dan login **dengan akun yang sama** (Google/email yang satu tailnet).
3. Dapatkan IP Tailscale PC ini:
   ```powershell
   tailscale ip -4
   ```
   Contoh hasil: `100.101.102.103`.
4. Dari perangkat lain buka: `http://<IP-tailscale>:3000/ai-analyst`.

Catatan:
- PC harus **nyala dan MT5 login** — app membaca terminal MT5 via bridge lokal (`127.0.0.1:8787`, tidak pernah terekspos).
- API order/tutup sudah dilindungi token (`APP_TOKEN` di `.env.local`); koneksi antar-perangkat Tailscale sudah terenkripsi.
- Ingin HTTPS & URL rapi? Nanti bisa pakai `tailscale serve --bg 3000`.
- Matikan akses: di Tailscale admin console, hapus perangkat.
