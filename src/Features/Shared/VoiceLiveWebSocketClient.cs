using Azure;
using Azure.AI.VoiceLive;
using Azure.Core;
using Azure.Identity;
using System.Collections.Concurrent;
using System.Text.Json;

namespace VoiceAgentCSharp.Features.Shared;

/// <summary>
/// WebSocket client for Azure Voice Live API using the official SDK.
/// </summary>
public class VoiceLiveWebSocketClient : IAsyncDisposable
{
    private readonly ILogger _logger;
    private readonly string _endpoint;
    private readonly string _model;
    private readonly string? _apiKey;
    private readonly string? _clientId;
    private VoiceLiveClient? _client;

    private CancellationTokenSource? _cancellationTokenSource;

    public VoiceLiveWebSocketClient(
        string endpoint,
        string model,
        string? apiKey,
        string? clientId,
        ILogger logger)
    {
        _endpoint = endpoint.TrimEnd('/');
        _model = model;
        _apiKey = apiKey;
        _clientId = clientId;
        _logger = logger;
    }

    public VoiceLiveClient Client { get { return _client!; } }

    /// <summary>
    /// Connects to Azure Voice Live API using the official SDK.
    /// Authentication priority: User-Assigned Managed Identity > DefaultAzureCredential > API Key (fallback)
    /// </summary>
    public async Task ConnectAsync()
    {
        _cancellationTokenSource = new CancellationTokenSource();

        try
        {
            // Create VoiceLive client with appropriate authentication
            _client = await CreateVoiceLiveClientAsync();

            _logger.LogInformation("Voice Live WebSocket client fully initialized and ready");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to connect to Voice Live API at {Endpoint}", _endpoint);
            await DisposeAsync();
            throw;
        }
    }

    /// <summary>
    /// Creates a VoiceLive client with the appropriate authentication method.
    /// </summary>
    private async Task<VoiceLiveClient> CreateVoiceLiveClientAsync()
    {
        VoiceLiveClient client;

        if (!string.IsNullOrEmpty(_clientId))
        {
            _logger.LogDebug("Authenticating with Managed Identity (Client ID: {ClientId})", _clientId);
            var credential = new ManagedIdentityCredential(_clientId);
            client = new VoiceLiveClient(new Uri(_endpoint), credential);
            _logger.LogInformation("Authenticated to Voice Live API using Managed Identity with Client ID");
        }
        else if (!string.IsNullOrEmpty(_apiKey))
        {
            _logger.LogDebug("Authenticating with API Key");
            var credential = new AzureKeyCredential(_apiKey);
            client = new VoiceLiveClient(new Uri(_endpoint), credential);
            _logger.LogWarning(
                "Authenticated to Voice Live API using API Key. " +
                "This is less secure than Managed Identity. Consider migrating to Managed Identity.");
        }
        else
        {
            _logger.LogDebug("Authenticating with DefaultAzureCredential");
            var credential = new DefaultAzureCredential();
            client = new VoiceLiveClient(new Uri(_endpoint), credential);
            _logger.LogInformation("Authenticated to Voice Live API using DefaultAzureCredential");
        }

        await Task.CompletedTask;
        return client;
    }

    /// <summary>
    /// Disconnects from Voice Live API.
    /// </summary>
    public async Task DisconnectAsync()
    {
        _cancellationTokenSource?.Cancel();

    }



    public async ValueTask DisposeAsync()
    {
        _logger.LogDebug("Disposing VoiceLiveWebSocketClient");

        await DisconnectAsync();

        _cancellationTokenSource?.Dispose();

        _logger.LogDebug("VoiceLiveWebSocketClient disposed");
    }
}
