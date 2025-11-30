using ModelContextProtocol.Client;
using ModelContextProtocol.Protocol;
using Microsoft.Extensions.Logging;

namespace VoiceAgentCSharp.Features.Shared;

/// <summary>
/// Manages connection to MCP server using the official ModelContextProtocol SDK.
/// Supports HTTP transport for standalone MCP servers.
/// </summary>
public class McpClientManager : IAsyncDisposable
{
    #region Fields

    private readonly ILogger _logger;
    private McpClient? _mcpClient;
    private Dictionary<string, McpClientTool> _toolCache = new();
    private bool _disposed;

    #endregion

    #region Constructor

    /// <summary>
    /// Initializes a new instance of the <see cref="McpClientManager"/> class.
    /// </summary>
    /// <param name="logger">The logger instance.</param>
    public McpClientManager(ILogger logger)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
    }

    #endregion

    #region Connection Management

    /// <summary>
    /// Initializes connection to MCP server via HTTP transport (connects to standalone server).
    /// </summary>
    /// <param name="serverUrl">The HTTP URL of the MCP server (e.g., http://localhost:5001).</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    public async Task InitializeHttpAsync(string serverUrl, CancellationToken cancellationToken = default)
    {
        try
        {
            _logger.LogInformation("Initializing MCP client via HTTP transport to {Url}", serverUrl);

            var transport = new HttpClientTransport(new HttpClientTransportOptions
            {
                Endpoint = new Uri(serverUrl.TrimEnd('/') + "/")
            });

            _mcpClient = await McpClient.CreateAsync(transport, cancellationToken: cancellationToken).ConfigureAwait(false);
            await DiscoverToolsAsync(cancellationToken).ConfigureAwait(false);

            _logger.LogInformation("MCP client initialized successfully via HTTP with {ToolCount} tools", _toolCache.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to initialize MCP client via HTTP");
            throw;
        }
    }

    /// <summary>
    /// Discovers and caches available tools from the MCP server.
    /// </summary>
    private async Task DiscoverToolsAsync(CancellationToken cancellationToken = default)
    {
        if (_mcpClient == null)
        {
            throw new InvalidOperationException("MCP client not initialized");
        }

        try
        {
            _toolCache.Clear();

            var tools = await _mcpClient.ListToolsAsync(cancellationToken: cancellationToken).ConfigureAwait(false);
            
            foreach (var tool in tools)
            {
                _toolCache[tool.Name] = tool;
                _logger.LogDebug("Discovered MCP tool: {ToolName}", tool.Name);
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
    /// Gets all available tools.
    /// </summary>
    public IReadOnlyDictionary<string, McpClientTool> GetAvailableTools()
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
    public async Task<string> ExecuteToolAsync(string toolName, string? arguments, CancellationToken cancellationToken = default)
    {
        if (_mcpClient == null)
        {
            throw new InvalidOperationException("MCP client not initialized");
        }

        if (string.IsNullOrWhiteSpace(toolName))
        {
            throw new ArgumentException("Tool name cannot be null or empty", nameof(toolName));
        }

        if (!_toolCache.ContainsKey(toolName))
        {
            throw new InvalidOperationException($"Tool '{toolName}' not found");
        }

        try
        {
            _logger.LogDebug("Executing MCP tool: {ToolName}", toolName);

            // Parse arguments into a dictionary
            Dictionary<string, object?>? toolArgs = null;
            if (!string.IsNullOrWhiteSpace(arguments))
            {
                toolArgs = System.Text.Json.JsonSerializer.Deserialize<Dictionary<string, object?>>(arguments);
            }

            var result = await _mcpClient.CallToolAsync(toolName, toolArgs, cancellationToken: cancellationToken)
                .ConfigureAwait(false);

            // Extract text content from result
            var textContent = result.Content?.OfType<TextContentBlock>().FirstOrDefault();
            if (textContent != null)
            {
                _logger.LogDebug("MCP tool {ToolName} executed successfully", toolName);
                return textContent.Text ?? "No result returned";
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

    #region Disposal

    /// <summary>
    /// Disposes of the MCP client connection.
    /// </summary>
    public async ValueTask DisposeAsync()
    {
        if (_disposed)
            return;

        _logger.LogInformation("Disposing MCP client");
        
        if (_mcpClient != null)
        {
            try
            {
                await _mcpClient.DisposeAsync().ConfigureAwait(false);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Error disposing MCP client");
            }
        }

        _disposed = true;
    }

    #endregion
}
