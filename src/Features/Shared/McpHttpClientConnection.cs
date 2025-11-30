using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;

namespace VoiceAgentCSharp.Features.Shared;

/// <summary>
/// Manages HTTP-based connection to a standalone MCP (Model Context Protocol) server.
/// Uses JSON-RPC 2.0 protocol for communication over HTTP.
/// </summary>
public class McpHttpClientConnection : IAsyncDisposable
{
    #region Fields

    private readonly ILogger _logger;
    private readonly string _mcpServerUrl;
    private readonly HttpClient _httpClient;
    private Dictionary<string, ToolDefinition> _toolCache = new();
    private int _requestId = 1;
    private bool _disposed;

    #endregion

    #region Helper Classes

    /// <summary>
    /// Represents a tool definition from the MCP server.
    /// </summary>
    public class ToolDefinition
    {
        /// <summary>
        /// Gets or sets the tool name.
        /// </summary>
        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        /// <summary>
        /// Gets or sets the tool description.
        /// </summary>
        [JsonPropertyName("description")]
        public string? Description { get; set; }

        /// <summary>
        /// Gets or sets the tool input schema.
        /// </summary>
        [JsonPropertyName("inputSchema")]
        public JsonElement? InputSchema { get; set; }
    }

    private class JsonRpcRequest
    {
        [JsonPropertyName("jsonrpc")]
        public string JsonRpc { get; set; } = "2.0";

        [JsonPropertyName("id")]
        public int Id { get; set; }

        [JsonPropertyName("method")]
        public string Method { get; set; } = string.Empty;

        [JsonPropertyName("params")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public JsonElement? Params { get; set; }
    }

    private class JsonRpcResponse
    {
        [JsonPropertyName("jsonrpc")]
        public string? JsonRpc { get; set; }

        [JsonPropertyName("id")]
        public int Id { get; set; }

        [JsonPropertyName("result")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public JsonElement? Result { get; set; }

        [JsonPropertyName("error")]
        [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
        public JsonElement? Error { get; set; }
    }

    #endregion

    #region Constructor

    /// <summary>
    /// Initializes a new instance of the <see cref="McpHttpClientConnection"/> class.
    /// </summary>
    /// <param name="mcpServerUrl">The HTTP URL of the MCP server (e.g., http://localhost:5001).</param>
    /// <param name="logger">The logger instance.</param>
    /// <param name="httpClient">Optional HttpClient instance. If not provided, a new one is created.</param>
    public McpHttpClientConnection(string mcpServerUrl, ILogger logger, HttpClient? httpClient = null)
    {
        _mcpServerUrl = mcpServerUrl ?? throw new ArgumentNullException(nameof(mcpServerUrl));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _httpClient = httpClient ?? new HttpClient();
    }

    #endregion

    #region Connection Management

    /// <summary>
    /// Initializes connection to the MCP server and retrieves available tools.
    /// </summary>
    public async Task InitializeAsync()
    {
        try
        {
            _logger.LogInformation("Initializing HTTP MCP connection to server at {Url}", _mcpServerUrl);

            // Verify server is reachable
            try
            {
                var healthCheckUrl = _mcpServerUrl.TrimEnd('/') + "/health";
                using var healthResponse = await _httpClient.GetAsync(healthCheckUrl).ConfigureAwait(false);
                if (!healthResponse.IsSuccessStatusCode)
                {
                    _logger.LogWarning("MCP health check returned {StatusCode}", healthResponse.StatusCode);
                }
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to perform health check on MCP server (non-critical)");
            }

            // Send initialize request
            await SendJsonRpcRequestAsync("initialize", new
            {
                protocolVersion = "2024-11-05",
                capabilities = new { },
                clientInfo = new { name = "voice-agent-csharp", version = "1.0" }
            }).ConfigureAwait(false);

            // Discover available tools
            await DiscoverToolsAsync().ConfigureAwait(false);

            _logger.LogInformation("HTTP MCP connection initialized successfully with {ToolCount} tools", _toolCache.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to initialize HTTP MCP connection");
            throw;
        }
    }

    /// <summary>
    /// Discovers and caches available tools from the MCP server.
    /// </summary>
    private async Task DiscoverToolsAsync()
    {
        try
        {
            var response = await SendJsonRpcRequestAsync("tools/list", null).ConfigureAwait(false);

            if (response.TryGetProperty("tools", out var toolsArray))
            {
                _toolCache.Clear();

                foreach (var toolElement in toolsArray.EnumerateArray())
                {
                    var toolDef = JsonSerializer.Deserialize<ToolDefinition>(toolElement);
                    if (toolDef != null && !string.IsNullOrEmpty(toolDef.Name))
                    {
                        _toolCache[toolDef.Name] = toolDef;
                        _logger.LogDebug("Discovered MCP tool: {ToolName}", toolDef.Name);
                    }
                }
            }

            _logger.LogInformation("Discovered {ToolCount} tools from MCP server", _toolCache.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to discover tools from MCP server");
            throw;
        }
    }

    #endregion

    #region Tool Information

    /// <summary>
    /// Gets all available tools from the MCP server.
    /// </summary>
    public IReadOnlyDictionary<string, ToolDefinition> GetAvailableTools()
    {
        return _toolCache.AsReadOnly();
    }

    /// <summary>
    /// Checks if a tool is available.
    /// </summary>
    public bool HasTool(string toolName)
    {
        return _toolCache.ContainsKey(toolName);
    }

    #endregion

    #region Tool Execution

    /// <summary>
    /// Executes a tool on the MCP server.
    /// </summary>
    public async Task<string> ExecuteToolAsync(string toolName, string? arguments)
    {
        if (string.IsNullOrWhiteSpace(toolName))
        {
            throw new ArgumentException("Tool name cannot be null or empty", nameof(toolName));
        }

        if (!_toolCache.ContainsKey(toolName))
        {
            throw new InvalidOperationException($"Tool '{toolName}' not found in MCP server");
        }

        try
        {
            _logger.LogDebug("Executing MCP tool: {ToolName}", toolName);

            var toolArgs = string.IsNullOrWhiteSpace(arguments)
                ? new JsonElement()
                : JsonDocument.Parse(arguments).RootElement;

            var response = await SendJsonRpcRequestAsync("tools/call", new
            {
                name = toolName,
                arguments = toolArgs
            }).ConfigureAwait(false);

            // Extract result from response
            if (response.TryGetProperty("content", out var content) && content.ValueKind == JsonValueKind.Array)
            {
                var contentArray = content.EnumerateArray().ToList();
                if (contentArray.Count > 0 && contentArray[0].TryGetProperty("text", out var textElement))
                {
                    var result = textElement.GetString() ?? "No result returned";
                    _logger.LogDebug("MCP tool {ToolName} executed successfully", toolName);
                    return result;
                }
            }

            return "Tool executed but no result returned";
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error executing MCP tool {ToolName}", toolName);
            throw;
        }
    }

    #endregion

    #region JSON-RPC Communication

    /// <summary>
    /// Sends a JSON-RPC request to the MCP server via HTTP and waits for the response.
    /// </summary>
    private async Task<JsonElement> SendJsonRpcRequestAsync(string method, object? @params)
    {
        var request = new JsonRpcRequest
        {
            Id = _requestId++,
            Method = method,
            Params = @params == null ? null : JsonDocument.Parse(JsonSerializer.Serialize(@params)).RootElement
        };

        var json = JsonSerializer.Serialize(request);
        _logger.LogTrace("Sending JSON-RPC request via HTTP: {Method}", method);

        var content = new StringContent(json, System.Text.Encoding.UTF8, "application/json");
        var rpcEndpoint = _mcpServerUrl.TrimEnd('/') + "/rpc";

        try
        {
            using var response = await _httpClient.PostAsync(rpcEndpoint, content).ConfigureAwait(false);

            if (!response.IsSuccessStatusCode)
            {
                var errorContent = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
                throw new HttpRequestException(
                    $"MCP server returned {response.StatusCode}: {errorContent}",
                    null,
                    response.StatusCode);
            }

            var responseContent = await response.Content.ReadAsStringAsync().ConfigureAwait(false);
            return await ReadJsonRpcResponseAsync(responseContent).ConfigureAwait(false);
        }
        catch (HttpRequestException ex)
        {
            _logger.LogError(ex, "HTTP error communicating with MCP server at {Url}", rpcEndpoint);
            throw;
        }
        catch (TaskCanceledException ex)
        {
            _logger.LogError(ex, "Timeout communicating with MCP server at {Url}", rpcEndpoint);
            throw new TimeoutException($"MCP server did not respond within timeout to method: {method}", ex);
        }
    }

    /// <summary>
    /// Parses a JSON-RPC response.
    /// </summary>
    private async Task<JsonElement> ReadJsonRpcResponseAsync(string responseContent)
    {
        _logger.LogTrace("Received JSON-RPC response: {Content}", responseContent);

        var response = JsonSerializer.Deserialize<JsonRpcResponse>(responseContent);
        if (response == null)
        {
            throw new InvalidOperationException("Failed to deserialize JSON-RPC response");
        }

        if (response.Error.HasValue)
        {
            var error = response.Error.Value.GetProperty("message").GetString();
            throw new InvalidOperationException($"MCP error: {error}");
        }

        return response.Result ?? new JsonElement();
    }

    #endregion

    #region Disposal

    /// <summary>
    /// Disposes of the HTTP MCP connection.
    /// </summary>
    public async ValueTask DisposeAsync()
    {
        if (_disposed)
            return;

        _logger.LogInformation("Disposing HTTP MCP connection");
        _disposed = true;
    }

    #endregion
}
