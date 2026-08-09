param(
  [string]$SteamId = '483215844',
  [string]$EmulatorHost = '127.0.0.1:8080',
  [string]$ApiBase = 'http://127.0.0.1:5000/api'
)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$helper = Join-Path $PSScriptRoot 'daily-challenge-local.cjs'
$form = New-Object Windows.Forms.Form
$form.Text = '每日挑战本地测试工具（仅 Firestore Emulator）'
$form.Size = New-Object Drawing.Size(980,720)
$form.StartPosition = 'CenterScreen'
$label = New-Object Windows.Forms.Label; $label.Text='SteamID'; $label.Location='12,15'; $label.AutoSize=$true; $form.Controls.Add($label)
$steam = New-Object Windows.Forms.TextBox; $steam.Text=$SteamId; $steam.Location='80,12'; $steam.Width=150; $form.Controls.Add($steam)
$command = New-Object Windows.Forms.ComboBox; $command.Location='245,12'; $command.Width=150; $command.DropDownStyle='DropDownList'; [void]$command.Items.AddRange(@('get','save-personal','save-global','apply-points','grant-reward')); $command.SelectedIndex=0; $form.Controls.Add($command)
$run = New-Object Windows.Forms.Button; $run.Text='执行'; $run.Location='410,10'; $run.Width=80; $form.Controls.Add($run)
$payloadLabel=New-Object Windows.Forms.Label; $payloadLabel.Text='写操作 JSON（get 可留空）'; $payloadLabel.Location='12,48'; $payloadLabel.AutoSize=$true; $form.Controls.Add($payloadLabel)
$payload=New-Object Windows.Forms.TextBox; $payload.Multiline=$true; $payload.ScrollBars='Both'; $payload.AcceptsReturn=$true; $payload.Font=New-Object Drawing.Font('Consolas',10); $payload.Location='12,70'; $payload.Size='940,230'; $form.Controls.Add($payload)
$resultLabel=New-Object Windows.Forms.Label; $resultLabel.Text='结果'; $resultLabel.Location='12,310'; $resultLabel.AutoSize=$true; $form.Controls.Add($resultLabel)
$result=New-Object Windows.Forms.TextBox; $result.Multiline=$true; $result.ScrollBars='Both'; $result.ReadOnly=$true; $result.Font=New-Object Drawing.Font('Consolas',10); $result.Location='12,332'; $result.Size='940,330'; $form.Controls.Add($result)
$run.Add_Click({
  $temp=$null
  try {
    $env:FIRESTORE_EMULATOR_HOST=$EmulatorHost
    $env:DAILY_CHALLENGE_STEAM_ID=$steam.Text.Trim()
    $env:DAILY_CHALLENGE_API_BASE=$ApiBase
    $args=@($helper,[string]$command.SelectedItem)
    if($command.SelectedItem -ne 'get'){
      [void](ConvertFrom-Json $payload.Text)
      $temp=Join-Path ([IO.Path]::GetTempPath()) ("daily-challenge-{0}.json" -f [guid]::NewGuid())
      [IO.File]::WriteAllText($temp,$payload.Text,(New-Object Text.UTF8Encoding($false)))
      $args += $temp
    }
    $output=& node @args 2>&1
    if($LASTEXITCODE -ne 0){ throw ($output -join [Environment]::NewLine) }
    try { $result.Text=(($output -join '') | ConvertFrom-Json | ConvertTo-Json -Depth 30) } catch { $result.Text=$output -join [Environment]::NewLine }
  } catch { $result.Text=$_.Exception.Message }
  finally { if($temp -and (Test-Path -LiteralPath $temp)){ Remove-Item -LiteralPath $temp -Force } }
})
[void]$form.ShowDialog()
