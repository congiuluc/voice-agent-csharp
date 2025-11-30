#!/usr/bin/env pwsh
# Local Docker build and push script for voice-agent-csharp
# This builds images locally instead of in Azure to avoid timeouts

param(
    [ValidateSet('build', 'push', 'deploy', 'all')]
    [string]$Action = 'all'
)

$ErrorActionPreference = 'Stop'

function Log-Info {
    param([string]$Message)
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] INFO: $Message" -ForegroundColor Cyan
}

function Log-Success {
    param([string]$Message)
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] SUCCESS: $Message" -ForegroundColor Green
}

function Log-Error {
    param([string]$Message)
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] ERROR: $Message" -ForegroundColor Red
    exit 1
}

function Log-Warning {
    param([string]$Message)
    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] WARNING: $Message" -ForegroundColor Yellow
}

# Step 1: Build Docker images
if ($Action -in @('build', 'all')) {
    Log-Info "Building Docker images..."
    
    Log-Info "Building voice-agent image..."
    docker build -t voice-agent:latest -f Dockerfile ./src
    if ($LASTEXITCODE -ne 0) {
        Log-Error "Failed to build voice-agent image"
    }
    Log-Success "voice-agent image built"
    
    Log-Info "Building mcp-server image..."
    docker build -t mcp-server:latest -f ./mcp-server/Dockerfile ./mcp-server
    if ($LASTEXITCODE -ne 0) {
        Log-Error "Failed to build mcp-server image"
    }
    Log-Success "mcp-server image built"
    
    Log-Info "Verifying images..."
    docker images | grep -E "voice-agent|mcp-server"
}

# Step 2: Push images to registry
if ($Action -in @('push', 'all')) {
    Log-Info "Pushing images to Azure Container Registry..."
    
    # Get registry details from azd
    Log-Info "Retrieving registry details..."
    $registryName = azd env get-value AZURE_CONTAINER_REGISTRY_NAME
    $registryUrl = azd env get-value AZURE_CONTAINER_REGISTRY_ENDPOINT
    
    if (!$registryName -or !$registryUrl) {
        Log-Error "Could not retrieve registry details. Run 'azd provision' first."
    }
    
    Log-Info "Registry: $registryName at $registryUrl"
    
    # Login to registry
    Log-Info "Logging in to Azure Container Registry..."
    az acr login --name $registryName
    if ($LASTEXITCODE -ne 0) {
        Log-Error "Failed to login to container registry"
    }
    Log-Success "Logged in to registry"
    
    # Tag and push images
    Log-Info "Tagging and pushing voice-agent..."
    docker tag voice-agent:latest "$registryUrl/voice-agent:latest"
    docker push "$registryUrl/voice-agent:latest"
    if ($LASTEXITCODE -ne 0) {
        Log-Error "Failed to push voice-agent image"
    }
    Log-Success "voice-agent pushed"
    
    Log-Info "Tagging and pushing mcp-server..."
    docker tag mcp-server:latest "$registryUrl/mcp-server:latest"
    docker push "$registryUrl/mcp-server:latest"
    if ($LASTEXITCODE -ne 0) {
        Log-Error "Failed to push mcp-server image"
    }
    Log-Success "mcp-server pushed"
}

# Step 3: Deploy
if ($Action -in @('deploy', 'all')) {
    Log-Info "Deploying to Azure..."
    Log-Warning "Since images are pre-built, deployment should be much faster"
    
    azd deploy
    if ($LASTEXITCODE -ne 0) {
        Log-Error "Deployment failed"
    }
    Log-Success "Deployment complete"
}

Log-Success "All operations completed successfully"
