param(
    [Parameter(Mandatory = $true)]
    [string]$OutputDirectory,
    [ValidateSet('all', 'host', 'join', 'feedback')]
    [string]$Scope = 'all',
    [ValidateSet('all', 'zh-CN', 'en-US', 'ru-RU')]
    [string]$Language = 'all'
)

$ErrorActionPreference = 'Stop'
$launcher = Join-Path $PSScriptRoot 'dist\Windy10v10AI.exe'
if (-not (Test-Path -LiteralPath $launcher -PathType Leaf)) { throw 'Build the launcher with launcher\build.cmd first.' }
$output = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $output | Out-Null
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
$runtimeName = 'windy-ui-preview-' + [Guid]::NewGuid().ToString('N')
$runtime = Join-Path $tempRoot $runtimeName
New-Item -ItemType Directory -Path $runtime | Out-Null
try {
    $compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
    $preview = Join-Path $runtime 'ui-preview.exe'
    & $compiler /nologo /target:exe "/out:$preview" "/win32manifest:$(Join-Path $PSScriptRoot 'app.manifest')" /r:System.Windows.Forms.dll /r:System.Drawing.dll (Join-Path $PSScriptRoot 'tests\ui-preview.cs')
    if ($LASTEXITCODE -ne 0) { throw 'UI preview compilation failed.' }
    $languages = if ($Language -eq 'all') { @('zh-CN', 'en-US', 'ru-RU') } else { @($Language) }
    $failures = @()
    foreach ($culture in $languages) {
        $process = $null
        $log = ''
        try {
            $info = New-Object Diagnostics.ProcessStartInfo
            $info.FileName = $preview
            $info.Arguments = '"{0}" "{1}" "{2}" "{3}"' -f $launcher, $output, $Scope, $culture
            $info.UseShellExecute = $false
            $info.CreateNoWindow = $true
            $info.RedirectStandardOutput = $true
            $info.RedirectStandardError = $true
            $process = [Diagnostics.Process]::Start($info)
            $stdout = $process.StandardOutput.ReadToEndAsync()
            $stderr = $process.StandardError.ReadToEndAsync()
            $timedOut = -not $process.WaitForExit(90000)
            if ($timedOut) {
                $process.Kill()
                $process.WaitForExit()
            }
            $log = $stdout.GetAwaiter().GetResult() + $stderr.GetAwaiter().GetResult()
            if ($timedOut) { throw "UI preview timed out for $culture after 90 seconds." }
            if ($process.ExitCode -ne 0) { throw "UI preview exited with code $($process.ExitCode) for $culture." }
        }
        catch {
            $log += [Environment]::NewLine + $_.Exception.ToString() + [Environment]::NewLine
            $failures += $culture
        }
        finally {
            [IO.File]::WriteAllText((Join-Path $output "$culture.log"), $log, (New-Object Text.UTF8Encoding($false)))
            Write-Output $log
            if ($null -ne $process) { $process.Dispose() }
        }
    }
    if ($failures.Count -gt 0) { throw "UI preview failed: $($failures -join ', '). See the language logs in $output." }
}
finally {
    if (Test-Path -LiteralPath $runtime) {
        $resolved = (Resolve-Path -LiteralPath $runtime).Path
        $directory = Get-Item -LiteralPath $resolved
        if (-not $resolved.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase) -or
            -not [string]::Equals($resolved, (Join-Path $tempRoot $runtimeName), [StringComparison]::OrdinalIgnoreCase) -or
            ($directory.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw 'Refusing to remove an unexpected UI preview runtime directory.'
        }
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}
