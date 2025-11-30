# Deploy using local Docker builds (faster and more reliable than remote builds)
# This script builds Docker images locally and pushes them to Azure Container Registry
# before running azd deployment, avoiding timeouts during provision.

param(
    [string]$Action = "all",  # all, build, push, deploy, provision
    [switch]$SkipTests,
    [switch]$Verbose
)

$ErrorActionPreference = "Stop"

# Colors for output
$colors = @{
    Success = "Green"
    Error   = "Red"
    Warning = "Yellow"
    Info    = "Cyan"
}

function Write-Status {
    param([string]$Message, [string]$Status = "Info")
    $color = if ($colors.ContainsKey($Status)) { $colors[$Status] } else { "White" }
    Write-Host "[$((Get-Date).ToString('HH:mm:ss'))] $Message" -ForegroundColor $color
}

function Invoke-Command {
    param([string]$Command, [string]$Description)
    Write-Status "Running: $Description" "Info"
    if ($Verbose) { Write-Host "  Command: $Command" -ForegroundColor DarkGray }
    Invoke-Expression $Command
    if ($LASTEXITCODE -ne 0) {
        Write-Status "FAILED: $Description (Exit code: $LASTEXITCODE)" "Error"
        exit 1
    }
    Write-Status "SUCCESS: $Description" "Success"
}

# Step 0: Verify prerequisites
Write-Status "Verifying prerequisites..." "Info"
$requiredTools = @("docker", "dotnet", "azd")
foreach ($tool in $requiredTools) {
    if (!(Get-Command $tool -ErrorAction SilentlyContinue)) {
        Write-Status "ERROR: $tool is not installed or not in PATH" "Error"
        exit 1
    }
}
Write-Status "All prerequisites found" "Success"

# Step 1: Build Voice Agent Docker image locally
if ($Action -in @("all", "build")) {
    Write-Status "=== PHASE 1: BUILD DOCKER IMAGES ===" "Info"
    
    Write-Status "Building Voice Agent Docker image..." "Info"
    Invoke-Command `
        "docker build -t voice-agent:latest -f Dockerfile ./src" `
        "Build voice-agent Docker image"
    
    Write-Status "Building MCP Server Docker image..." "Info"
    Invoke-Command `
        "docker build -t mcp-server:latest -f ./mcp-server/Dockerfile ./mcp-server" `
        "Build mcp-server Docker image"
    
    Write-Status "Verifying image sizes..." "Info"
    $images = docker images --format "table {{.Repository}}\t{{.Size}}" | grep -E "voice-agent|mcp-server"
    Write-Host $images
}

# Step 2: Get Azure Container Registry details
Write-Status "=== PHASE 2: PREPARE AZURE CONTAINER REGISTRY ===" "Info"

Write-Status "Getting Azure Container Registry details..." "Info"
$registryName = azd env get-value AZURE_CONTAINER_REGISTRY_NAME
$registryUrl = azd env get-value AZURE_CONTAINER_REGISTRY_ENDPOINT
$subscriptionId = azd env get-value AZURE_SUBSCRIPTION_ID
$resourceGroup = azd env get-value AZURE_RESOURCE_GROUP

if (!$registryName -or !$registryUrl) {
    Write-Status "ERROR: Could not retrieve Azure Container Registry details. Run 'azd provision' first." "Error"
    exit 1
}

Write-Status "Registry: $registryName at $registryUrl" "Info"

# Step 3: Authenticate with registry and push images
if ($Action -in @("all", "push")) {
    Write-Status "=== PHASE 3: PUSH IMAGES TO REGISTRY ===" "Info"
    
    Write-Status "Authenticating with Azure Container Registry..." "Info"
    Invoke-Command `
        "az acr login --name $registryName" `
        "Login to Azure Container Registry"
    
    $voiceAgentImage = "$registryUrl/voice-agent:latest"
    $mcpServerImage = "$registryUrl/mcp-server:latest"
    
    Write-Status "Tagging Voice Agent image: $voiceAgentImage" "Info"
    Invoke-Command `
        "docker tag voice-agent:latest $voiceAgentImage" `
        "Tag voice-agent image"
    
    Write-Status "Pushing Voice Agent image to registry..." "Info"
    Invoke-Command `
        "docker push $voiceAgentImage" `
        "Push voice-agent image to Azure Container Registry"
    
    Write-Status "Tagging MCP Server image: $mcpServerImage" "Info"
    Invoke-Command `
        "docker tag mcp-server:latest $mcpServerImage" `
        "Tag mcp-server image"
    
    Write-Status "Pushing MCP Server image to registry..." "Info"
    Invoke-Command `
        "docker push $mcpServerImage" `
        "Push mcp-server image to Azure Container Registry"
}

# Step 4: Deploy using azd
if ($Action -in @("all", "deploy")) {
    Write-Status "=== PHASE 4: DEPLOY TO AZURE ===" "Info"
    
    Write-Status "Running Azure Developer CLI deployment..." "Info"
    Write-Status "NOTE: Since images are pre-built, this should be MUCH faster" "Warning"
    
    # Set environment variable to skip remote build
    $env:AZD_SKIP_DOCKER_BUILD = "true"
    
    Invoke-Command `
        "azd deploy" `
        "Deploy containers to Azure"
}

# Step 5: Verify deployment
Write-Status "=== PHASE 5: VERIFY DEPLOYMENT ===" "Info"

$appUrl = azd env get-value AZURE_CONTAINER_APP_URL
if ($appUrl) {
    Write-Status "Application deployed to: $appUrl" "Success"
    Write-Status "Waiting for application to be ready..." "Info"
    
    $maxAttempts = 10
    $attempt = 0
    while ($attempt -lt $maxAttempts) {
        $attempt++
        Start-Sleep -Seconds 5
        try {
            $response = Invoke-WebRequest -Uri "$appUrl/health" -ErrorAction Stop
            if ($response.StatusCode -eq 200) {
                Write-Status "Application is healthy!" "Success"
                break
            }
        } catch {
            $waitMsg = "Attempt $attempt/$maxAttempts : Waiting for app to be ready..."
            Write-Status $waitMsg "Warning"
        }
    }
}

Write-Status "=== DEPLOYMENT COMPLETE ===" "Success"
Write-Status "Voice Agent URL: $appUrl" "Info"

# Summary
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║           DEPLOYMENT SUMMARY                     ║" -ForegroundColor Cyan
Write-Host "╚══════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host "Registry: $registryUrl" -ForegroundColor Yellow
Write-Host "Voice Agent: $voiceAgentImage" -ForegroundColor Yellow
Write-Host "MCP Server: $mcpServerImage" -ForegroundColor Yellow
Write-Host "App URL: $appUrl" -ForegroundColor Yellow
Write-Host ""
Write-Host "Images were built LOCALLY (faster and more reliable)" -ForegroundColor Green
Write-Host "Deployment should complete in 5-10 minutes instead of 20 minutes" -ForegroundColor Green
