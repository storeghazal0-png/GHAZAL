import { app, BrowserWindow, ipcMain, globalShortcut, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { ThermalPrinterService } from './printer-service';
import { DeviceConfig, PrintReceiptPayload } from './preload';

// Hardware Acceleration & High-Performance Flags for Maximum Speed
app.commandLine.appendSwitch('disable-http-cache', 'false');
app.commandLine.appendSwitch('ignore-certificate-errors', 'true');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

const CONFIG_PATH = path.join(app.getPath('userData'), 'ghazal-pos-config.json');

const DEFAULT_CONFIG: DeviceConfig = {
  terminalId: 'POS-TERMINAL-01',
  serverUrl: 'https://ghazal-store-jo.netlify.app/pos/cashier',
  printerName: '',
  autoKickDrawer: true,
};

function loadConfig(): DeviceConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
      const parsed = JSON.parse(data);
      // Migrate older localhost default to live production url
      if (parsed.serverUrl === 'http://localhost:3000/pos/cashier' || !parsed.serverUrl) {
        parsed.serverUrl = 'https://ghazal-store-jo.netlify.app/pos/cashier';
      }
      return { ...DEFAULT_CONFIG, ...parsed };
    }
  } catch (err) {
    console.error('Error reading config file:', err);
  }
  return DEFAULT_CONFIG;
}

function saveConfig(cfg: DeviceConfig): boolean {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Error writing config file:', err);
    return false;
  }
}

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  const config = loadConfig();

  mainWindow = new BrowserWindow({
    width: 1366,
    height: 850,
    minWidth: 1024,
    minHeight: 700,
    title: 'GHAZAL POS - كاشير غزل لمستحضرات التجميل',
    backgroundColor: '#1A1A1A',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  const loadTarget = (url: string) => {
    if (!mainWindow) return;
    mainWindow.loadURL(url).catch((err) => {
      console.warn('Failed to load URL:', url, err);
      showFallbackScreen(url);
    });
  };

  const showFallbackScreen = (attemptedUrl: string) => {
    if (!mainWindow) return;
    const currentCfg = loadConfig();
    mainWindow.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(`
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8">
        <title>GHAZAL POS - شاشة الإعداد والاتصال</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Cairo", Tahoma, sans-serif;
            background: #121212;
            color: #f4f4f5;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 24px;
          }
          .card {
            background: #1c1c1f;
            border: 1px solid #2e2e33;
            border-radius: 20px;
            max-width: 620px;
            width: 100%;
            padding: 36px;
            text-align: center;
            box-shadow: 0 20px 40px rgba(0,0,0,0.5);
          }
          .badge {
            display: inline-block;
            background: rgba(230, 0, 126, 0.15);
            color: #ff3399;
            padding: 6px 16px;
            border-radius: 999px;
            font-size: 13px;
            font-weight: bold;
            margin-bottom: 16px;
            border: 1px solid rgba(230, 0, 126, 0.3);
          }
          h1 { font-size: 24px; font-weight: 800; margin-bottom: 8px; color: #ffffff; }
          p { color: #a1a1aa; font-size: 14px; line-height: 1.6; margin-bottom: 24px; }
          .url-box {
            background: #27272a;
            border-radius: 10px;
            padding: 10px 14px;
            font-family: monospace;
            font-size: 13px;
            color: #fbbf24;
            margin-bottom: 24px;
            direction: ltr;
            word-break: break-all;
          }
          .btn-group { display: flex; flex-direction: column; gap: 12px; margin-bottom: 24px; }
          button {
            padding: 14px 20px;
            border-radius: 12px;
            border: none;
            font-size: 14px;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.2s;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
          }
          .btn-primary { background: #E6007E; color: #ffffff; }
          .btn-primary:hover { background: #c2006a; transform: translateY(-1px); }
          .btn-secondary { background: #27272a; color: #f4f4f5; border: 1px solid #3f3f46; }
          .btn-secondary:hover { background: #3f3f46; }
          .custom-url-section {
            border-top: 1px solid #2e2e33;
            padding-top: 20px;
            text-align: right;
          }
          .custom-url-section label { display: block; font-size: 12px; color: #a1a1aa; margin-bottom: 8px; font-weight: bold; }
          .input-row { display: flex; gap: 8px; direction: ltr; }
          input[type="text"] {
            flex: 1;
            padding: 10px 14px;
            border-radius: 10px;
            border: 1px solid #3f3f46;
            background: #27272a;
            color: #fff;
            font-family: monospace;
            font-size: 13px;
            outline: none;
          }
          input[type="text"]:focus { border-color: #E6007E; }
          .btn-save { padding: 10px 18px; background: #27272a; color: #fff; border: 1px solid #3f3f46; border-radius: 10px; font-weight: bold; cursor: pointer; }
          .btn-save:hover { background: #E6007E; border-color: #E6007E; }
          .offline-note {
            margin-top: 18px;
            font-size: 12px;
            color: #71717a;
            background: #18181b;
            padding: 10px;
            border-radius: 8px;
            border: 1px dashed #2e2e33;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="badge">نظام كاشير غزل • وضع الإعداد والاتصال</div>
          <h1>الاتصال بشاشة الكاشير (GHAZAL POS)</h1>
          <p>تعذر الوصول إلى العنوان المبرمج حالياً أو لا يوجد اتصال بالإنترنت في هذه اللحظة:</p>
          <div class="url-box">${attemptedUrl}</div>

          <div class="btn-group">
            <button class="btn-primary" onclick="setAndLoad('https://ghazal-store-jo.netlify.app/pos/cashier')">
              ⚡ الاتصال بالسيرفر السحابي المباشر (Cloud POS)
            </button>
            <button class="btn-secondary" onclick="setAndLoad('http://localhost:3000/pos/cashier')">
              💻 الاتصال بالسيرفر المحلي (Localhost: 3000)
            </button>
            <button class="btn-secondary" onclick="location.reload()">
              🔄 إعادة المحاولة الآن
            </button>
          </div>

          <div class="custom-url-section">
            <label>أو إدخال عنوان خادم مخصص / IP الكاشير بالشبكة الداخلية:</label>
            <div class="input-row">
              <input type="text" id="customUrl" value="${attemptedUrl}" placeholder="https://..." />
              <button class="btn-save" onclick="saveCustom()">حفظ وتشغيل</button>
            </div>
          </div>

          <div class="offline-note">
            💡 ملاحظة: عند تشغيل الكاشير لأول مرة وهو متصل بالإنترنت، يقوم بتخزين كافة المنتجات محلياً (IndexedDB)، وعند انقطاع النت يعمل الكاشير أوفلاين ويخزن المبيعات تلقائياً.
          </div>
        </div>

        <script>
          function setAndLoad(newUrl) {
            window.location.href = newUrl;
          }
          function saveCustom() {
            var val = document.getElementById('customUrl').value.trim();
            if (val) {
              window.location.href = val;
            }
          }
        </script>
      </body>
      </html>
    `)}`
    );
  };

  // Fast load of server URL
  loadTarget(config.serverUrl);

  // Shortcut registrations for Cashier Speed
  globalShortcut.register('F2', () => {
    mainWindow?.webContents.send('pos-shortcut', 'FOCUS_SEARCH');
  });

  globalShortcut.register('F4', () => {
    mainWindow?.webContents.send('pos-shortcut', 'TRIGGER_PAYMENT');
  });

  globalShortcut.register('F6', () => {
    mainWindow?.webContents.send('pos-shortcut', 'HOLD_SALE');
  });

  globalShortcut.register('F11', () => {
    if (mainWindow) {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// -------------------------------------------------------------
// IPC Handlers
// -------------------------------------------------------------

ipcMain.handle('get-device-config', async () => {
  return loadConfig();
});

ipcMain.handle('save-device-config', async (_event, cfg: DeviceConfig) => {
  return saveConfig(cfg);
});

ipcMain.handle('get-system-printers', async () => {
  if (!mainWindow) return [];
  return await mainWindow.webContents.getPrintersAsync();
});

ipcMain.handle('print-receipt', async (_event, payload: PrintReceiptPayload) => {
  const config = loadConfig();
  return await ThermalPrinterService.printThermalReceipt(payload, config.printerName);
});

ipcMain.handle('open-cash-drawer', async () => {
  // ESC/POS Cash Drawer Kick Pin 2 Pulse command: ESC p 0 25 250 (\x1B\x70\x00\x19\xFA)
  // In production, sent via raw driver or serial/USB port
  console.log('Sending Cash Drawer Kick signal...');
  return true;
});

ipcMain.handle('toggle-fullscreen', async () => {
  if (mainWindow) {
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
  }
});

ipcMain.handle('get-app-version', async () => {
  return app.getVersion();
});

// App Lifecycle
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  if (process.platform !== 'darwin') app.quit();
});
