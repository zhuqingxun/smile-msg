import { app, shell, BrowserWindow, Tray, Menu, nativeImage, ipcMain } from 'electron'
import { join } from 'path'
import { optimizer, is } from '@electron-toolkit/utils'
import devIcon from '../../resources/icon.ico?asset'

// 顶层设置 AppUserModelId，确保 Windows 在最早期就关联正确的应用身份
app.setAppUserModelId('com.smilemsg.app')

// 单实例锁：阻止启动多个进程，第二个实例启动时激活已有窗口
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      mainWindow.setSkipTaskbar(false)
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

// 生产环境从 extraResources（asar 外部）加载图标，确保 Windows 可直接访问
const icon = app.isPackaged ? join(process.resourcesPath, 'icon.ico') : devIcon

let mainWindow = null
let tray = null
let flashTimer = null
let isFlashing = false

function createWindow() {
  const windowIcon = nativeImage.createFromPath(icon)
  mainWindow = new BrowserWindow({
    width: 480,
    height: 640,
    minWidth: 360,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    icon: windowIcon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    // 窗口显示前再次强制设置图标，确保 Windows 任务栏获取到正确图标
    mainWindow.setIcon(windowIcon)
    mainWindow.show()
  })

  mainWindow.on('focus', () => {
    stopFlashing()
  })

  mainWindow.on('show', () => {
    stopFlashing()
  })

  // 最小化 → 隐藏到系统托盘
  mainWindow.on('minimize', (event) => {
    event.preventDefault()
    mainWindow.hide()
    mainWindow.setSkipTaskbar(true)
  })

  // 关闭按钮 → 隐藏到托盘（不退出）
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault()
      mainWindow.hide()
      mainWindow.setSkipTaskbar(true)
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 加载页面
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createTray() {
  const trayIcon = nativeImage.createFromPath(icon).resize({ width: 16, height: 16 })
  tray = new Tray(trayIcon)

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主界面',
      click: () => {
        stopFlashing()
        if (mainWindow) {
          mainWindow.setSkipTaskbar(false)
          mainWindow.show()
          mainWindow.focus()
        }
      }
    },
    { type: 'separator' },
    {
      label: '彻底退出',
      click: () => {
        app.isQuitting = true
        app.quit()
      }
    }
  ])

  tray.setToolTip('SmileMsg')
  tray.setContextMenu(contextMenu)

  // 单击托盘图标恢复窗口
  tray.on('click', () => {
    stopFlashing()
    if (mainWindow) {
      mainWindow.setSkipTaskbar(false)
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

function startFlashing() {
  if (isFlashing || !tray) return
  isFlashing = true
  const originalIcon = nativeImage.createFromPath(icon).resize({ width: 16, height: 16 })
  const emptyIcon = nativeImage.createEmpty()
  let showOriginal = false
  flashTimer = setInterval(() => {
    showOriginal = !showOriginal
    tray.setImage(showOriginal ? originalIcon : emptyIcon)
  }, 500)
}

function stopFlashing() {
  if (!isFlashing) return
  isFlashing = false
  if (flashTimer) {
    clearInterval(flashTimer)
    flashTimer = null
  }
  if (tray) {
    const originalIcon = nativeImage.createFromPath(icon).resize({ width: 16, height: 16 })
    tray.setImage(originalIcon)
  }
}

app.whenReady().then(() => {
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()
  createTray()

  ipcMain.on('tray:flash-start', () => {
    startFlashing()
  })
})

app.on('window-all-closed', () => {
  // 不退出，由托盘管理生命周期
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
