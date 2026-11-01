Set-Location $PSScriptRoot
Write-Host "WorkflowProof MVP" -ForegroundColor Green
Write-Host "Installing dependencies..."
npm install
if ($LASTEXITCODE -ne 0) { throw "npm install failed. Confirm Node.js 18+ and internet access." }
npm run dev
