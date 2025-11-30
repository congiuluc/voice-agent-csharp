using Azure.AI.Agents.Persistent;
using Azure.AI.Projects;
using Azure.Identity;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging;
using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace VoiceAgentCSharp.Features.VoiceAgent;

public class FoundryService
{
    private readonly IConfiguration _configuration;
    private readonly ILogger<FoundryService> _logger;
    private AIProjectClient? _projectClient;
    private PersistentAgentsClient? _agentsClient;

    public FoundryService(IConfiguration configuration, ILogger<FoundryService> logger)
    {
        _configuration = configuration;
        _logger = logger;
    }

    private AIProjectClient GetClient()
    {
        if (_projectClient != null) return _projectClient;

        var connectionString = _configuration["AzureVoiceLive:ConnectionString"];
        // If connection string is not available, try to construct from endpoint or other config
        // For now, we assume we might need a connection string for AI Projects
        // Or we use the Endpoint from AzureVoiceLive if that's what it is.
        
        // Note: Azure.AI.Projects usually requires a connection string like "Endpoint=...;Key=..." or just Endpoint + Credential
        var endpoint = _configuration["AzureVoiceLive:Endpoint"];
        
        if (string.IsNullOrEmpty(endpoint))
        {
            throw new InvalidOperationException("Azure AI Project Endpoint is not configured.");
        }

        // Use user-assigned managed identity if configured
        var clientId = _configuration["AzureIdentity:UserAssignedClientId"];
        var credential = string.IsNullOrWhiteSpace(clientId)
            ? new DefaultAzureCredential()
            : new DefaultAzureCredential(new DefaultAzureCredentialOptions { ManagedIdentityClientId = clientId });

        _logger.LogInformation(
            "Creating AIProjectClient with {CredentialType}{ClientId}",
            string.IsNullOrWhiteSpace(clientId) ? "DefaultAzureCredential" : "User-Assigned Managed Identity",
            string.IsNullOrWhiteSpace(clientId) ? "" : $" (ClientId: {clientId})");

        _projectClient = new AIProjectClient(new Uri(endpoint), credential);
        return _projectClient;
    }

    /// <summary>
    /// Gets the PersistentAgentsClient for managing agents with MCP tools.
    /// </summary>
    private PersistentAgentsClient GetAgentsClient()
    {
        if (_agentsClient != null) return _agentsClient;

        var endpoint = _configuration["AzureVoiceLive:Endpoint"];
        
        if (string.IsNullOrEmpty(endpoint))
        {
            throw new InvalidOperationException("Azure AI Project Endpoint is not configured.");
        }

        var clientId = _configuration["AzureIdentity:UserAssignedClientId"];
        var credential = string.IsNullOrWhiteSpace(clientId)
            ? new DefaultAzureCredential()
            : new DefaultAzureCredential(new DefaultAzureCredentialOptions { ManagedIdentityClientId = clientId });

        _agentsClient = new PersistentAgentsClient(endpoint, credential);
        return _agentsClient;
    }

    public class FoundryAgent
    {
        public string Id { get; set; } = string.Empty;
        public string Name { get; set; } = string.Empty;
    }

    public async Task<List<FoundryAgent>> GetAgentsAsync()
    {
        try
        {
            // TODO: Implement actual API call when Azure.AI.Projects SDK structure is confirmed.
            // Currently, AgentsClient or GetAgentsClient is not resolving.
            // var client = GetClient();
            
            // Keep for backward compatibility: return agents across all projects
            var agents = new List<FoundryAgent>
            {
                new FoundryAgent { Id = "asst_123", Name = "Customer Service Agent" },
                new FoundryAgent { Id = "asst_456", Name = "Technical Support Agent" },
                new FoundryAgent { Id = "asst_789", Name = "Sales Representative" }
            };

            return await Task.FromResult(agents);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching agents from Foundry.");
            return new List<FoundryAgent>();
        }
    }

    /// <summary>
    /// Return agents that belong to a specific project.
    /// Currently returns mocked data; replace with actual API calls to Azure.AI.Projects when available.
    /// </summary>
    public async Task<List<FoundryAgent>> GetAgentsByProjectAsync(string projectId)
    {
        try
        {
            // Example mock filtering by projectId
            var all = await GetAgentsAsync();

            if (string.IsNullOrEmpty(projectId) || projectId == "all")
            {
                return all;
            }

            // Very simple deterministic mock: select subset based on projectId string
            if (projectId.Contains("Support", StringComparison.OrdinalIgnoreCase))
            {
                return all.FindAll(a => a.Name.Contains("Support") || a.Name.Contains("Customer"));
            }

            if (projectId.Contains("Sales", StringComparison.OrdinalIgnoreCase))
            {
                return all.FindAll(a => a.Name.Contains("Sales"));
            }

            // Default: return first agent as representative for the project
            return new List<FoundryAgent> { all[0] };
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error fetching agents by project from Foundry.");
            return new List<FoundryAgent>();
        }
    }

    // Placeholder for listing projects - requires Azure Resource Manager
    public async Task<List<string>> GetProjectsAsync()
    {
        // This would require Azure.ResourceManager and subscription access.
        // Return a mocked list for UI selection/demo purposes. Replace with ARM query if needed.
        var projects = new List<string>
        {
            "All Projects",
            "Support Project",
            "Sales Project",
            "Customer Service Project"
        };

        return await Task.FromResult(projects);
    }

    #region MCP Tool Configuration

    /// <summary>
    /// Creates a new agent with MCP tools configured.
    /// </summary>
    /// <param name="name">The name of the agent.</param>
    /// <param name="instructions">The agent instructions.</param>
    /// <param name="mcpServerUrl">The URL of the MCP server.</param>
    /// <param name="mcpServerLabel">A label for the MCP server.</param>
    /// <param name="allowedTools">Optional list of allowed tool names.</param>
    /// <returns>The created agent.</returns>
    public async Task<PersistentAgent> CreateAgentWithMcpToolsAsync(
        string name,
        string instructions,
        string mcpServerUrl,
        string mcpServerLabel,
        List<string>? allowedTools = null)
    {
        try
        {
            var client = GetAgentsClient();
            var modelDeploymentName = _configuration["AzureVoiceLive:Model"] ?? "gpt-4o-mini";

            // Create MCP tool definition
            var mcpTool = new MCPToolDefinition(mcpServerLabel, mcpServerUrl);

            // Configure allowed tools if specified
            if (allowedTools != null)
            {
                foreach (var tool in allowedTools)
                {
                    mcpTool.AllowedTools.Add(tool);
                }
            }

            _logger.LogInformation(
                "Creating agent '{Name}' with MCP server '{Label}' at {Url}",
                name, mcpServerLabel, mcpServerUrl);

            // Create agent with MCP tool
            var agent = await client.Administration.CreateAgentAsync(
                model: modelDeploymentName,
                name: name,
                instructions: instructions,
                tools: new List<ToolDefinition> { mcpTool });

            _logger.LogInformation("Created agent with ID: {AgentId}", agent.Value.Id);
            return agent.Value;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error creating agent with MCP tools");
            throw;
        }
    }

    /// <summary>
    /// Updates an existing agent to add or modify MCP tools.
    /// </summary>
    /// <param name="agentId">The ID of the agent to update.</param>
    /// <param name="mcpServerUrl">The URL of the MCP server.</param>
    /// <param name="mcpServerLabel">A label for the MCP server.</param>
    /// <param name="allowedTools">Optional list of allowed tool names.</param>
    /// <returns>The updated agent.</returns>
    public async Task<PersistentAgent> UpdateAgentWithMcpToolsAsync(
        string agentId,
        string mcpServerUrl,
        string mcpServerLabel,
        List<string>? allowedTools = null)
    {
        try
        {
            var client = GetAgentsClient();

            // Create MCP tool definition
            var mcpTool = new MCPToolDefinition(mcpServerLabel, mcpServerUrl);

            // Configure allowed tools if specified
            if (allowedTools != null)
            {
                foreach (var tool in allowedTools)
                {
                    mcpTool.AllowedTools.Add(tool);
                }
            }

            _logger.LogInformation(
                "Updating agent '{AgentId}' with MCP server '{Label}' at {Url}",
                agentId, mcpServerLabel, mcpServerUrl);

            // Update agent with MCP tool
            var agent = await client.Administration.UpdateAgentAsync(
                assistantId: agentId,
                tools: new List<ToolDefinition> { mcpTool });

            _logger.LogInformation("Updated agent with ID: {AgentId}", agent.Value.Id);
            return agent.Value;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error updating agent with MCP tools");
            throw;
        }
    }

    /// <summary>
    /// Gets an existing agent by ID.
    /// </summary>
    /// <param name="agentId">The ID of the agent.</param>
    /// <returns>The agent.</returns>
    public async Task<PersistentAgent?> GetAgentAsync(string agentId)
    {
        try
        {
            var client = GetAgentsClient();
            var agent = await client.Administration.GetAgentAsync(agentId);
            return agent.Value;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting agent {AgentId}", agentId);
            return null;
        }
    }

    /// <summary>
    /// Creates or updates an agent with MCP tools from configuration.
    /// This is a convenience method that reads MCP server settings from appsettings.json.
    /// </summary>
    /// <param name="agentId">Optional existing agent ID to update. If null, creates a new agent.</param>
    /// <param name="name">The name for the agent (used when creating new).</param>
    /// <param name="instructions">The instructions for the agent.</param>
    /// <returns>The agent with MCP tools configured.</returns>
    public async Task<PersistentAgent> ConfigureAgentWithMcpFromSettingsAsync(
        string? agentId = null,
        string? name = null,
        string? instructions = null)
    {
        var mcpServerUrl = _configuration["McpServer:Url"];
        var mcpServerLabel = _configuration["McpServer:Label"] ?? "voice-agent-mcp";
        var mcpEnabled = _configuration.GetValue<bool>("McpServer:Enabled", true);

        if (!mcpEnabled || string.IsNullOrEmpty(mcpServerUrl))
        {
            throw new InvalidOperationException("MCP server is not configured or disabled.");
        }

        // Get allowed tools from configuration (comma-separated list)
        var allowedToolsConfig = _configuration["McpServer:AllowedTools"];
        List<string>? allowedTools = null;
        if (!string.IsNullOrEmpty(allowedToolsConfig))
        {
            allowedTools = new List<string>(allowedToolsConfig.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
        }

        if (!string.IsNullOrEmpty(agentId))
        {
            return await UpdateAgentWithMcpToolsAsync(agentId, mcpServerUrl, mcpServerLabel, allowedTools);
        }
        else
        {
            return await CreateAgentWithMcpToolsAsync(
                name ?? "Voice Agent with MCP",
                instructions ?? "You are a helpful voice assistant. Use the available MCP tools to assist users.",
                mcpServerUrl,
                mcpServerLabel,
                allowedTools);
        }
    }

    #endregion
}
