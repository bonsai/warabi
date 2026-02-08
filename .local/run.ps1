$port = 8000
$targetFile = "punyu.html"
$url = "http://localhost:$port/$targetFile"

# Get the directory where this script resides (i.e., warabi/local)
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
# Get the project root (i.e., warabi)
$ProjectRoot = Split-Path -Parent $ScriptDir
# Path to serve.py
$ServeScript = Join-Path $ScriptDir "serve.py"

Write-Host "Starting Python HTTP Server (Hot Reload) on port $port..."
try {
    # Start python server in a minimized window
    # Run in ProjectRoot so it serves the correct files
    $process = Start-Process python -ArgumentList "`"$ServeScript`"" -WorkingDirectory "$ProjectRoot" -PassThru -WindowStyle Minimized
}
catch {
    Write-Error "Failed to start Python server. Make sure Python is installed and in your PATH."
    exit
}

Start-Sleep -Seconds 1
Write-Host "Opening $url in default browser..."
Start-Process $url

Write-Host "Server is running (PID: $($process.Id))."
Write-Host "Press Enter to stop the server and exit..."
Read-Host

if ($process -and -not $process.HasExited) {
    Stop-Process -Id $process.Id -Force
    Write-Host "Server stopped."
}
