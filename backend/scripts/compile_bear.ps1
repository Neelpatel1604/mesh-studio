$ErrorActionPreference = "Stop"

$apiBase = "http://127.0.0.1:8000"
$sourceCode = @'
$fn = 32;

// A simple bear model constructed from spheres, in a sitting pose
union() {
  // Body
  // An elongated sphere for the torso, resting on the ground plane
  translate([0, 0, 22.5]) {
    scale([1.1, 1, 0.9]) {
      sphere(d=50);
    }
  }

  // Head
  translate([0, 0, 52.5]) {
    sphere(d=35);
  }

  // Snout
  translate([0, 15, 50.5]) {
    sphere(d=18);
  }

  // Nose
  translate([0, 24, 50.5]) {
    sphere(d=5);
  }

  // Eyes
  translate([-8, 13, 57.5]) {
    sphere(d=5);
  }
  translate([8, 13, 57.5]) {
    sphere(d=5);
  }

  // Ears
  translate([-15, 0, 65]) {
    sphere(d=15);
  }
  translate([15, 0, 65]) {
    sphere(d=15);
  }

  // Arms
  translate([-28, 5, 25]) {
    sphere(d=18);
  }
  translate([28, 5, 25]) {
    sphere(d=18);
  }

  // Legs
  translate([-18, 15, 11]) {
    sphere(d=22);
  }
  translate([18, 15, 11]) {
    sphere(d=22);
  }
}
'@

$createPayload = @{
  source_code = $sourceCode
  user_id = "script-user"
} | ConvertTo-Json -Depth 5

Write-Host "Creating compile job..."
$createResp = Invoke-RestMethod -Uri "$apiBase/compile" -Method Post -ContentType "application/json" -Body $createPayload
$jobId = $createResp.job_id
Write-Host "Job ID: $jobId"

for ($i = 0; $i -lt 180; $i++) {
  Start-Sleep -Milliseconds 1200
  $statusResp = Invoke-RestMethod -Uri "$apiBase/compile/$jobId" -Method Get
  $status = $statusResp.status
  Write-Host "Status: $status"

  if ($status -eq "completed") {
    Write-Host ""
    Write-Host "Compile completed."
    if ($statusResp.output.preview_url) { Write-Host "Preview URL: $apiBase$($statusResp.output.preview_url)" }
    if ($statusResp.output.model_3mf_url) { Write-Host "3MF URL:     $apiBase$($statusResp.output.model_3mf_url)" }
    if ($statusResp.output.stl_url) { Write-Host "STL URL:     $apiBase$($statusResp.output.stl_url)" }
    exit 0
  }

  if ($status -eq "failed" -or $status -eq "cancelled") {
    $err = $statusResp.error
    if (-not $err) { $err = "Compile did not complete successfully." }
    throw $err
  }
}

throw "Timed out waiting for compile job $jobId."
