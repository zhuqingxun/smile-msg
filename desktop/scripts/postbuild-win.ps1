# postbuild-win.ps1 — 打包后自动处理：刷新图标缓存 + 创建桌面快捷方式
$distDir = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$distDir = Join-Path $PSScriptRoot '..\dist'
$distDir = (Resolve-Path $distDir).Path

$exePath = Join-Path $distDir 'SmileMsg.exe'
$icoSrc = Join-Path $PSScriptRoot '..\build\icon.ico'
$icoDst = Join-Path $distDir 'SmileMsg.ico'

# 1. 刷新 Windows 图标缓存
ie4uinit.exe -show
Write-Host "[postbuild] 已刷新图标缓存"

# 2. 复制 ico 到 exe 同级目录
Copy-Item $icoSrc $icoDst -Force
Write-Host "[postbuild] 已复制 SmileMsg.ico 到 dist/"

# 3. 创建桌面快捷方式（图标指向 .ico 文件，避免高 DPI 下白色背景）
$desktop = [Environment]::GetFolderPath('Desktop')
$lnkPath = Join-Path $desktop 'SmileMsg.lnk'

$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut($lnkPath)
$lnk.TargetPath = $exePath
$lnk.WorkingDirectory = $distDir
$lnk.IconLocation = "$icoDst,0"
$lnk.Description = 'SmileMsg'
$lnk.Save()

Write-Host "[postbuild] 已创建桌面快捷方式: $lnkPath"
Write-Host "[postbuild] 图标来源: $icoDst"
