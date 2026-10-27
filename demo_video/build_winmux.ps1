# Builds WinMux.exe from WinMux.cs with the C# compiler that ships with Windows.
$fw = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319"
$meta = "C:\Windows\System32\WinMetadata"
& "$fw\csc.exe" /nologo /target:exe /out:"$PSScriptRoot\WinMux.exe" `
  "/r:$fw\System.Runtime.dll" "/r:$fw\System.IO.dll" "/r:$fw\System.Threading.dll" `
  "/r:$meta\Windows.Foundation.winmd" "/r:$meta\Windows.Storage.winmd" "/r:$meta\Windows.Media.winmd" "$PSScriptRoot\WinMux.cs"
if (Test-Path "$PSScriptRoot\WinMux.exe") { "built WinMux.exe" } else { "build failed" }
