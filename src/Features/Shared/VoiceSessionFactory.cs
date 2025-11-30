using System.Web;
using Azure.AI.VoiceLive;
using Azure.Communication.CallAutomation;
using Azure.Core;
using Azure.Identity;
using VoiceAgentCSharp.Features.VoiceAgent;
using VoiceAgentCSharp.Features.VoiceAssistant;
using VoiceAgentCSharp.Features.VoiceAvatar;
using VoiceAgentCSharp.Features.IncomingCall;

namespace VoiceAgentCSharp.Features.Shared;

/// <summary>
/// Factory for creating Voice Session instances based on configuration.
/// Supports Voice Agent, Voice Assistant, and Voice Avatar modalities.
/// </summary>
public class VoiceSessionFactory
{
    private readonly ILogger<VoiceSessionFactory> _logger;
    private readonly IConfiguration _configuration;
    private readonly IHttpClientFactory _httpClientFactory;

    /// <summary>
    /// Initializes a new instance of the VoiceSessionFactory class.
    /// </summary>
    /// <param name="logger">The logger instance.</param>
    /// <param name="configuration">The configuration instance.</param>
    /// <param name="httpClientFactory">The HTTP client factory for tool execution.</param>
    public VoiceSessionFactory(
        ILogger<VoiceSessionFactory> logger,
        IConfiguration configuration,
        IHttpClientFactory httpClientFactory)
    {
        _logger = logger ?? throw new ArgumentNullException(nameof(logger));
        _configuration = configuration ?? throw new ArgumentNullException(nameof(configuration));
        _httpClientFactory = httpClientFactory ?? throw new ArgumentNullException(nameof(httpClientFactory));
    }

    /// <summary>
    /// Creates a Voice Session instance based on the provided configuration.
    /// </summary>
    /// <param name="config">The voice session configuration.</param>
    /// <returns>An instance of IVoiceSession for the specified session type.</returns>
    /// <exception cref="ArgumentException">Thrown when configuration is invalid or session type is unsupported.</exception>
    public async Task<IVoiceSession> CreateSessionAsync(VoiceSessionConfig config)
    {
        ValidateConfiguration(config);

        _logger.LogInformation("Creating Voice Session of type: {SessionType}", config.SessionType);

        // Create the VoiceLive client (async to handle agent token generation)
        var client = await CreateVoiceLiveClientAsync(config).ConfigureAwait(false);

        // Instantiate and start the appropriate session type
        return config.SessionType switch
        {
            "Agent" => await CreateAgentSessionAsync(client, config),
            "Assistant" => await CreateAssistantSessionAsync(client, config),
            "Avatar" => await CreateAvatarSessionAsync(client, config),
            _ => throw new ArgumentException($"Unsupported session type: {config.SessionType}", nameof(config))
        };
    }

    /// <summary>
    /// Creates a Voice ACS Session for Azure Communication Services integration.
    /// </summary>
    /// <param name="config">The voice session configuration.</param>
    /// <param name="callConnection">The ACS call connection for media streaming.</param>
    /// <returns>An instance of IVoiceSession configured for ACS.</returns>
    public async Task<IVoiceSession> CreateAcsSessionAsync(VoiceSessionConfig config, CallConnection callConnection)
    {
        ValidateConfiguration(config);

        _logger.LogInformation("Creating Voice ACS Session");

        // Create the VoiceLive client (async to handle agent token generation)
        var client = await CreateVoiceLiveClientAsync(config).ConfigureAwait(false);

        // Create and start the ACS session
        var httpClient = _httpClientFactory.CreateClient();
        var session = new VoiceAcsSession(client, config, callConnection, _logger, httpClient);
        await session.StartAsync().ConfigureAwait(false);
        return session;
    }

    /// <summary>
    /// Creates a Voice Agent session for Foundry Agent Service integration.
    /// </summary>
    private async Task<IVoiceSession> CreateAgentSessionAsync(VoiceLiveClient client, VoiceSessionConfig config)
    {
        if (string.IsNullOrWhiteSpace(config.FoundryAgentId) || string.IsNullOrWhiteSpace(config.FoundryProjectName))
        {
            throw new ArgumentException("Agent sessions require FoundryAgentId and FoundryProjectName", nameof(config));
        }

        var httpClient = _httpClientFactory.CreateClient();
        var session = new VoiceAgentSession(client, config, _logger, httpClient);
        await session.StartAsync().ConfigureAwait(false);
        return session;
    }

    /// <summary>
    /// Creates a Voice Assistant session for model-based conversations.
    /// </summary>
    private async Task<IVoiceSession> CreateAssistantSessionAsync(VoiceLiveClient client, VoiceSessionConfig config)
    {
        var httpClient = _httpClientFactory.CreateClient();
        var session = new VoiceAssistantSession(client, config, _logger, httpClient);
        await session.StartAsync().ConfigureAwait(false);
        return session;
    }

    /// <summary>
    /// Creates a Voice Avatar session for avatar-based conversations.
    /// Supports both SDK and raw WebSocket modes for WebRTC negotiation.
    /// </summary>
    private async Task<IVoiceSession> CreateAvatarSessionAsync(VoiceLiveClient client, VoiceSessionConfig config)
    {
        _logger.LogInformation(
            "Creating Avatar session - Character: {Character}, Style: {Style}, UseRawWebSocket: {UseRawWebSocket}",
            config.AvatarCharacter, config.AvatarStyle, config.UseRawWebSocket);

        var httpClient = _httpClientFactory.CreateClient();
        var session = new VoiceAvatarSession(client, config, _logger, config.UseRawWebSocket, httpClient);
        await session.StartAsync().ConfigureAwait(false);
        return session;
    }

    /// <summary>
    /// Validates the configuration for completeness and correctness.
    /// </summary>
    private void ValidateConfiguration(VoiceSessionConfig config)
    {
        if (string.IsNullOrWhiteSpace(config.Endpoint))
        {
            throw new ArgumentException("Voice Live endpoint is required", nameof(config));
        }

        if (!config.UseTokenCredential && string.IsNullOrWhiteSpace(config.ApiKey))
        {
            throw new ArgumentException("API Key is required when UseTokenCredential is false", nameof(config));
        }

        if (config.SessionType == "Agent")
        {
            if (string.IsNullOrWhiteSpace(config.FoundryAgentId) || string.IsNullOrWhiteSpace(config.FoundryProjectName))
            {
                throw new ArgumentException("Agent sessions require FoundryAgentId and FoundryProjectName", nameof(config));
            }
        }
        else if (config.SessionType == "Assistant" || config.SessionType == "Avatar")
        {
            if (string.IsNullOrWhiteSpace(config.Model))
            {
                throw new ArgumentException($"{config.SessionType} sessions require a Model", nameof(config));
            }
        }
    }

    /// <summary>
    /// Creates a VoiceLive client with the appropriate credentials.
    /// For Agent sessions, appends agent parameters as query parameters to the endpoint URL.
    /// </summary>
    private async Task<VoiceLiveClient> CreateVoiceLiveClientAsync(VoiceSessionConfig config)
    {
        string endpoint = config.Endpoint!;
        var options = new VoiceLiveClientOptions();

        // Create credential with user-assigned managed identity support
        var clientId = _configuration["AzureIdentity:UserAssignedClientId"];
        TokenCredential azureCredential = string.IsNullOrWhiteSpace(clientId)
            ? new DefaultAzureCredential()
            : new DefaultAzureCredential(new DefaultAzureCredentialOptions { ManagedIdentityClientId = clientId });

        _logger.LogInformation(
            "Using {CredentialType} for authentication{ClientId}",
            string.IsNullOrWhiteSpace(clientId) ? "DefaultAzureCredential" : "User-Assigned Managed Identity",
            string.IsNullOrWhiteSpace(clientId) ? "" : $" with ClientId: {clientId}");

        // For Agent sessions, append agent parameters to the endpoint URL as query parameters
        // This is required for Foundry Agent integration as per Microsoft documentation
        if (config.SessionType == "Agent" && !string.IsNullOrWhiteSpace(config.FoundryAgentId))
        {
            // Generate agent access token using Azure credentials
            string agentAccessToken;
            try
            {
                _logger.LogInformation("Generating agent access token using Azure credentials...");
                var tokenRequestContext = new TokenRequestContext(new[] { "https://ai.azure.com/.default" });
                var accessToken = await azureCredential.GetTokenAsync(tokenRequestContext, default).ConfigureAwait(false);
                agentAccessToken = accessToken.Token;
                _logger.LogInformation("Obtained agent access token successfully");
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to generate agent access token");
                throw;
            }

            // Append agent parameters to the endpoint URL
            var uriBuilder = new UriBuilder(endpoint);
            var query = HttpUtility.ParseQueryString(uriBuilder.Query);
            query["agent-id"] = config.FoundryAgentId!;
            query["agent-project-name"] = config.FoundryProjectName!;
            query["agent-access-token"] = agentAccessToken;
            uriBuilder.Query = query.ToString();
            endpoint = uriBuilder.ToString();

            _logger.LogInformation(
                "Agent parameters added as query parameters: agent-id={AgentId}, agent-project-name={ProjectName}",
                config.FoundryAgentId,
                config.FoundryProjectName);
        }

        var endpointUri = new Uri(endpoint);
        _logger.LogInformation("Creating VoiceLive client for endpoint: {Endpoint}", endpoint);

        if (config.UseTokenCredential)
        {
            return new VoiceLiveClient(endpointUri, azureCredential, options);
        }
        else
        {
            var keyCredential = new Azure.AzureKeyCredential(config.ApiKey!);
            return new VoiceLiveClient(endpointUri, keyCredential, options);
        }
    }
}