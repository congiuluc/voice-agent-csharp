using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;

namespace VoiceAgentCSharp.Features.Shared;

/// <summary>
/// Manages connection to the MCP (Model Context Protocol) server for tool discovery and execution.
/// Uses stdio transport and JSON-RPC 2.0 protocol for communication.
/// </summary>
public class McpClientConnection : IAsyncDisposable
{
    #region Fields

    private readonly ILogger _logger;
    private readonly string _mcpServerPath;
    private Process? _serverProcess;
    private StreamWriter? _serverInput;
    private StreamReader? _serverOutput;
    private readonly System.Text.StringBuilder _stderrBuffer = new();
    private bool _disposed;
    private Dictionary<string, ToolDefinition> _toolCache = new();
    private int _requestId = 1;
    private readonly object _lockObject = new();

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
    /// Initializes a new instance of the <see cref="McpClientConnection"/> class.
    /// </summary>
    /// <param name="mcpServerPath">The full path to the MCP server project file (.csproj).</param>
    /// <param name="logger">The logger instance.</param>
    public McpClientConnection(string mcpServerPath, ILogger logger)
    {
        _mcpServerPath = mcpServerPath ?? throw new ArgumentNullException(nameof(mcpServerPath));
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
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
            _logger.LogInformation("Initializing MCP connection to server at {Path}", _mcpServerPath);

            // Start MCP server process
            var processStartInfo = new ProcessStartInfo
            {
                FileName = "dotnet",
                Arguments = $"run --project \"{_mcpServerPath}\" --configuration Release",
                UseShellExecute = false,
                RedirectStandardInput = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
            };

            _serverProcess = Process.Start(processStartInfo);
            if (_serverProcess == null)
            {
                throw new InvalidOperationException("Failed to start MCP server process");
            }

            // Capture stderr from the MCP server for diagnostics
            try
            {
                _serverProcess.EnableRaisingEvents = true;
                _serverProcess.ErrorDataReceived += (s, e) =>
                {
                    try
                    {
                        if (!string.IsNullOrEmpty(e.Data))
                        {
                            lock (_stderrBuffer)
                            {
                                _stderrBuffer.AppendLine(e.Data);
                                // Keep buffer reasonably bounded
                                if (_stderrBuffer.Length > 64 * 1024)
                                {
                                    _stderrBuffer.Remove(0, _stderrBuffer.Length - 64 * 1024);
                                }
                            }

                            _logger.LogError("MCP server stderr: {Line}", e.Data);
                        }
                    }
                    catch { /* swallow logging errors */ }
                };
                _serverProcess.BeginErrorReadLine();
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Failed to hook MCP server stderr events");
            }

            _serverInput = new StreamWriter(_serverProcess.StandardInput.BaseStream) { AutoFlush = true };
            _serverOutput = new StreamReader(_serverProcess.StandardOutput.BaseStream);

            _logger.LogInformation("MCP server process started (PID: {ProcessId})", _serverProcess.Id);

            // Send initialize request
            await SendJsonRpcRequestAsync("initialize", new
            {
                protocolVersion = "2024-11-05",
                capabilities = new { },
                clientInfo = new { name = "voice-agent-csharp", version = "1.0" }
            }).ConfigureAwait(false);

            // Discover available tools
            await DiscoverToolsAsync().ConfigureAwait(false);

            _logger.LogInformation("MCP connection initialized successfully with {ToolCount} tools", _toolCache.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to initialize MCP connection");
            await DisposeAsync().ConfigureAwait(false);
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
    /// Sends a JSON-RPC request to the MCP server and waits for the response.
    /// </summary>
    private async Task<JsonElement> SendJsonRpcRequestAsync(string method, object? @params)
    {
        if (_serverInput == null || _serverOutput == null)
        {
            throw new InvalidOperationException("Server connection not initialized");
        }

        lock (_lockObject)
        {
            var request = new JsonRpcRequest
            {
                Id = _requestId++,
                Method = method,
                Params = @params == null ? null : JsonDocument.Parse(JsonSerializer.Serialize(@params)).RootElement
            };

            var json = JsonSerializer.Serialize(request);
            _logger.LogTrace("Sending JSON-RPC request: {Method}", method);
            _serverInput.WriteLine(json);
        }

        // Read response with timeout
        var responseTask = ReadJsonRpcResponseAsync();
        if (await Task.WhenAny(responseTask, Task.Delay(TimeSpan.FromSeconds(30))).ConfigureAwait(false) == responseTask)
        {
            return await responseTask.ConfigureAwait(false);
        }

        throw new TimeoutException($"MCP server did not respond within 30 seconds to method: {method}");
    }

    /// <summary>
    /// Reads a JSON-RPC response line from the server.
    /// </summary>
    private async Task<JsonElement> ReadJsonRpcResponseAsync()
    {
        if (_serverOutput == null)
        {
            throw new InvalidOperationException("Server output not initialized");
        }

        var line = await _serverOutput.ReadLineAsync().ConfigureAwait(false);
        if (string.IsNullOrEmpty(line))
        {
            // Build helpful diagnostic message including recent stderr and exit code if available
            var sb = new System.Text.StringBuilder();
            sb.AppendLine("Server closed connection while reading JSON-RPC response.");
            try
            {
                lock (_stderrBuffer)
                {
                    if (_stderrBuffer.Length > 0)
                    {
                        sb.AppendLine("Recent MCP stderr:");
                        sb.AppendLine(_stderrBuffer.ToString());
                    }
                }
            }
            catch { }

            try
            {
                if (_serverProcess != null)
                {
                    sb.AppendLine($"MCP process exit code: {(_serverProcess.HasExited ? _serverProcess.ExitCode.ToString() : "<running>")}");
                }
            }
            catch { }

            throw new InvalidOperationException(sb.ToString());
        }

        _logger.LogTrace("Received JSON-RPC response: {Line}", line);

        var response = JsonSerializer.Deserialize<JsonRpcResponse>(line);
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
    /// Disposes of the MCP connection and terminates the server process.
    /// </summary>
    public async ValueTask DisposeAsync()
    {
        if (_disposed)
            return;

        _logger.LogInformation("Disposing MCP connection");

        try
        {
            _serverInput?.Dispose();
            _serverOutput?.Dispose();
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error disposing streams");
        }

        try
        {
            if (_serverProcess != null)
            {
                if (!_serverProcess.HasExited)
                {
                    _serverProcess.Kill();
                    _serverProcess.WaitForExit(5000);
                }
                _serverProcess.Dispose();
            }
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Error disposing server process");
        }

        _disposed = true;
        _logger.LogInformation("MCP connection disposed");
    }

    #endregion
}
