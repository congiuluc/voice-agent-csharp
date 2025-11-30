using Azure.Communication.CallAutomation;
using Azure.Identity;
using Azure.Messaging;
using Azure.Messaging.EventGrid;
using Azure.Messaging.EventGrid.SystemEvents;
using Microsoft.AspNetCore.Mvc;
using System.Text.Json;
using System.Web;

namespace VoiceAgentCSharp.Features.IncomingCall;

/// <summary>
/// Handles ACS (Azure Communication Services) call and callback events.
/// </summary>
public class IncomingCallHandler
{
    private readonly ILogger<IncomingCallHandler> _logger;
    private readonly IConfiguration _configuration;
    private readonly CallAutomationClient _acsClient;

    /// <summary>
    /// Initializes a new instance of the <see cref="IncomingCallHandler"/> class.
    /// </summary>
    /// <param name="logger">The logger instance.</param>
    /// <param name="configuration">The configuration instance.</param>
    /// <exception cref="InvalidOperationException">Thrown when ACS Endpoint is not configured.</exception>
    public IncomingCallHandler(ILogger<IncomingCallHandler> logger, IConfiguration configuration)
    {
        _logger = logger;
        _configuration = configuration;

        // Try to use connection string first (more reliable for Call Automation)
        var connectionString = configuration["AzureCommunicationServices:ConnectionString"];
        if (!string.IsNullOrEmpty(connectionString))
        {
            _logger.LogInformation("Using ACS connection string for Call Automation client");
            _acsClient = new CallAutomationClient(connectionString);
        }
        else
        {
            // Fall back to managed identity with endpoint
            var endpoint = configuration["AzureCommunicationServices:Endpoint"]
                ?? throw new InvalidOperationException("ACS Endpoint or ConnectionString not configured");

            _logger.LogInformation("Using managed identity for Call Automation client with endpoint: {Endpoint}", endpoint);
            
            var clientId = configuration["AzureIdentity:UserAssignedClientId"];
            var credential = string.IsNullOrEmpty(clientId)
                ? new DefaultAzureCredential()
                : new DefaultAzureCredential(new DefaultAzureCredentialOptions { ManagedIdentityClientId = clientId });

            _acsClient = new CallAutomationClient(new Uri(endpoint), credential);
        }
    }

    /// <summary>
    /// Processes incoming call events and answers calls with media streaming.
    /// Implements the pattern from Azure-Samples/call-center-voice-agent-accelerator.
    /// </summary>
    /// <param name="context">The HTTP context containing the request.</param>
    /// <param name="hostUrl">The host URL for callback construction.</param>
    /// <returns>An <see cref="IResult"/> indicating the outcome of the operation.</returns>
    public async Task<IResult> ProcessIncomingCallAsync(HttpContext context, string hostUrl)
    {
        _logger.LogInformation("Processing incoming call event");

        var requestBody = await new StreamReader(context.Request.Body).ReadToEndAsync();
        var events = EventGridEvent.ParseMany(BinaryData.FromString(requestBody));

        foreach (var eventGridEvent in events)
        {
            _logger.LogInformation("Event Type: {EventType}", eventGridEvent.EventType);
            _logger.LogInformation("Incoming event data: {Data}", eventGridEvent.Data?.ToString());

            // Handle EventGrid subscription validation
            if (eventGridEvent.EventType == "Microsoft.EventGrid.SubscriptionValidationEvent")
            {
                var validationData = eventGridEvent.Data?.ToObjectFromJson<SubscriptionValidationEventData>();
                if (validationData == null)
                {
                    _logger.LogWarning("SubscriptionValidationEvent received but validation data is null");
                    continue;
                }

                var validationCode = validationData.ValidationCode ?? string.Empty;
                _logger.LogInformation("Validating subscription with code: {ValidationCode}", validationCode);

                return Results.Json(new { validationResponse = validationCode });
            }

            // Handle incoming call event
            if (eventGridEvent.EventType == "Microsoft.Communication.IncomingCall")
            {
                var incomingCallData = eventGridEvent.Data?.ToObjectFromJson<AcsIncomingCallEventData>();

                if (incomingCallData == null || incomingCallData.IncomingCallContext == null)
                {
                    _logger.LogWarning("Invalid incoming call data");
                    continue;
                }

                // Extract caller ID from the incoming call data
                var callerInfo = incomingCallData.From;
                var callerId = callerInfo?.PhoneNumber?.Value 
                    ?? callerInfo?.RawId 
                    ?? "Unknown";
                    
                _logger.LogInformation("Incoming call received. Caller ID: {CallerId}", callerId);

                var incomingCallContext = incomingCallData.IncomingCallContext;
                var guid = Guid.NewGuid();

                // Build callback URI - prefer DevTunnel for local development
                var devTunnel = _configuration["AzureCommunicationServices:DevTunnel"];
                var callbackBaseUri = !string.IsNullOrEmpty(devTunnel)
                    ? devTunnel.TrimEnd('/')
                    : hostUrl.Replace("http://", "https://").TrimEnd('/');

                var queryParameters = $"callerId={HttpUtility.UrlEncode(callerId)}";
                var callbackUri = new Uri($"{callbackBaseUri}/acs/callbacks/{guid}?{queryParameters}");

                // Build WebSocket URI for media streaming (always use wss:// like Python reference)
                var parsedUri = new Uri(callbackBaseUri);
                var websocketUri = new Uri($"wss://{parsedUri.Authority}/acs/ws");

                _logger.LogInformation("Callback URI: {CallbackUri}", callbackUri);
                _logger.LogInformation("WebSocket URI: {WebSocketUri}", websocketUri);

                // Configure media streaming options for bidirectional audio
                // Use the constructor that takes only the audio channel, then set properties
                var mediaStreamingOptions = new MediaStreamingOptions(MediaStreamingAudioChannel.Mixed)
                {
                    TransportUri = websocketUri,
                    StartMediaStreaming = true,
                    EnableBidirectional = true,
                    AudioFormat = AudioFormat.Pcm24KMono
                };

                _logger.LogInformation(
                    "Media streaming options configured - Transport: WebSocket, Content: Audio, Channel: Mixed, Bidirectional: {Bidirectional}, AudioFormat: {AudioFormat}",
                    mediaStreamingOptions.EnableBidirectional,
                    mediaStreamingOptions.AudioFormat);

                // Answer the call with media streaming configuration
                var answerCallOptions = new AnswerCallOptions(incomingCallContext, callbackUri)
                {
                    MediaStreamingOptions = mediaStreamingOptions,
                    OperationContext = "incomingCall"
                };

                try
                {
                    var answerCallResult = await _acsClient.AnswerCallAsync(answerCallOptions);

                    _logger.LogInformation(
                        "Answered call for connection ID: {CallConnectionId}",
                        answerCallResult.Value.CallConnectionProperties.CallConnectionId);

                    return Results.Ok();
                }
                catch (Azure.RequestFailedException ex)
                {
                    _logger.LogError(ex, 
                        "Failed to answer call. Status: {Status}, ErrorCode: {ErrorCode}, Message: {Message}",
                        ex.Status, ex.ErrorCode, ex.Message);
                    
                    // Return more details for debugging
                    return Results.Problem(
                        detail: $"ACS Error: {ex.Message} (Status: {ex.Status}, Code: {ex.ErrorCode})",
                        statusCode: ex.Status);
                }
            }
        }

        return Results.BadRequest();
    }

    /// <summary>
    /// Processes ACS callback events such as call connected, media started, etc.
    /// Implements comprehensive event handling matching the reference accelerator.
    /// </summary>
    /// <param name="contextId">The context ID from the callback URL.</param>
    /// <param name="context">The HTTP context containing the request.</param>
    /// <returns>An <see cref="IResult"/> indicating the outcome of the operation.</returns>
    public async Task<IResult> ProcessCallbackEventsAsync(string contextId, HttpContext context)
    {
        var requestBody = await new StreamReader(context.Request.Body).ReadToEndAsync();
        var events = CloudEvent.ParseMany(BinaryData.FromString(requestBody));

        foreach (var cloudEvent in events)
        {
            if (cloudEvent.Data == null)
            {
                _logger.LogWarning("Received CloudEvent with null data for event {EventType}", cloudEvent.Type);
                continue;
            }

            var dataString = cloudEvent.Data?.ToString() ?? string.Empty;
            if (string.IsNullOrWhiteSpace(dataString))
            {
                _logger.LogWarning("Received CloudEvent with empty data for event {EventType}", cloudEvent.Type);
                continue;
            }

            using var doc = JsonDocument.Parse(dataString);
            var root = doc.RootElement;
            var callConnectionId = root.TryGetProperty("callConnectionId", out var callIdProp) 
                ? callIdProp.GetString() ?? "Unknown" 
                : "Unknown";
            var correlationId = root.TryGetProperty("correlationId", out var corrIdProp) 
                ? corrIdProp.GetString() ?? "Unknown" 
                : "Unknown";

            _logger.LogInformation(
                "Received Event: {EventType}, Correlation ID: {CorrelationId}, CallConnectionId: {CallConnectionId}",
                cloudEvent.Type,
                correlationId,
                callConnectionId);

            switch (cloudEvent.Type)
            {
                case "Microsoft.Communication.CallConnected":
                    await HandleCallConnectedAsync(callConnectionId, correlationId);
                    break;

                case "Microsoft.Communication.MediaStreamingStarted":
                    HandleMediaStreamingStarted(root);
                    break;

                case "Microsoft.Communication.MediaStreamingStopped":
                    HandleMediaStreamingStopped(root);
                    break;

                case "Microsoft.Communication.MediaStreamingFailed":
                    HandleMediaStreamingFailed(root);
                    break;

                case "Microsoft.Communication.CallDisconnected":
                    _logger.LogInformation("Call disconnected for connection ID: {CallConnectionId}", callConnectionId);
                    break;

                default:
                    _logger.LogDebug("Unhandled event type: {EventType}", cloudEvent.Type);
                    break;
            }
        }

        return Results.Ok();
    }

    /// <summary>
    /// Handles the CallConnected event by retrieving and logging call properties.
    /// </summary>
    /// <param name="callConnectionId">The call connection ID.</param>
    /// <param name="correlationId">The correlation ID.</param>
    private async Task HandleCallConnectedAsync(string callConnectionId, string correlationId)
    {
        _logger.LogInformation("Call connected for connection ID: {CallConnectionId}", callConnectionId);
        
        try
        {
            // Get call connection and retrieve properties
            var callConnection = _acsClient.GetCallConnection(callConnectionId);
            var callProperties = await callConnection.GetCallConnectionPropertiesAsync();
            
            _logger.LogInformation(
                "MediaStreamingSubscription: {MediaStreamingSubscription}",
                callProperties.Value.MediaStreamingSubscription?.ToString() ?? "None");
            
            _logger.LogInformation("CORRELATION ID: {CorrelationId}", correlationId);
            _logger.LogInformation("CALL CONNECTION ID: {CallConnectionId}", callConnectionId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to retrieve call properties for connection ID: {CallConnectionId}", callConnectionId);
        }
    }

    /// <summary>
    /// Handles the MediaStreamingStarted event.
    /// </summary>
    /// <param name="root">The JSON root element containing event data.</param>
    private void HandleMediaStreamingStarted(JsonElement root)
    {
        if (root.TryGetProperty("mediaStreamingUpdate", out var streamingUpdate))
        {
            var contentType = streamingUpdate.TryGetProperty("contentType", out var ct) 
                ? ct.GetString() ?? "Unknown" 
                : "Unknown";
            var status = streamingUpdate.TryGetProperty("mediaStreamingStatus", out var st) 
                ? st.GetString() ?? "Unknown" 
                : "Unknown";
            var statusDetails = streamingUpdate.TryGetProperty("mediaStreamingStatusDetails", out var sd) 
                ? sd.GetString() ?? "Unknown" 
                : "Unknown";
            
            _logger.LogInformation(
                "Media streaming started - ContentType: {ContentType}, Status: {Status}, StatusDetails: {StatusDetails}",
                contentType,
                status,
                statusDetails);
        }
    }

    /// <summary>
    /// Handles the MediaStreamingStopped event.
    /// </summary>
    /// <param name="root">The JSON root element containing event data.</param>
    private void HandleMediaStreamingStopped(JsonElement root)
    {
        if (root.TryGetProperty("mediaStreamingUpdate", out var stoppedUpdate))
        {
            var contentType = stoppedUpdate.TryGetProperty("contentType", out var ct) 
                ? ct.GetString() ?? "Unknown" 
                : "Unknown";
            var status = stoppedUpdate.TryGetProperty("mediaStreamingStatus", out var st) 
                ? st.GetString() ?? "Unknown" 
                : "Unknown";
            var statusDetails = stoppedUpdate.TryGetProperty("mediaStreamingStatusDetails", out var sd) 
                ? sd.GetString() ?? "Unknown" 
                : "Unknown";
                
            _logger.LogInformation(
                "Media streaming stopped - ContentType: {ContentType}, Status: {Status}, StatusDetails: {StatusDetails}",
                contentType,
                status,
                statusDetails);
        }
    }

    /// <summary>
    /// Handles the MediaStreamingFailed event.
    /// </summary>
    /// <param name="root">The JSON root element containing event data.</param>
    private void HandleMediaStreamingFailed(JsonElement root)
    {
        if (root.TryGetProperty("resultInformation", out var resultInfo))
        {
            var code = resultInfo.TryGetProperty("code", out var c) ? c.GetInt32() : 0;
            var subCode = resultInfo.TryGetProperty("subCode", out var sc) ? sc.GetInt32() : 0;
            var message = resultInfo.TryGetProperty("message", out var msg) 
                ? msg.GetString() ?? "Unknown" 
                : "Unknown";
            
            _logger.LogWarning(
                "Media streaming failed - Code: {Code}, SubCode: {SubCode}, Message: {Message}",
                code,
                subCode,
                message);
        }
    }
}

/// <summary>
/// Helper class to deserialize incoming call event data.
/// </summary>
public class AcsIncomingCallEventData
{
    /// <summary>
    /// Gets or sets the caller identifier.
    /// </summary>
    [System.Text.Json.Serialization.JsonPropertyName("from")]
    public CommunicationIdentifier? From { get; set; }
    
    /// <summary>
    /// Gets or sets the callee identifier.
    /// </summary>
    [System.Text.Json.Serialization.JsonPropertyName("to")]
    public CommunicationIdentifier? To { get; set; }
    
    /// <summary>
    /// Gets or sets the incoming call context used to answer the call.
    /// </summary>
    [System.Text.Json.Serialization.JsonPropertyName("incomingCallContext")]
    public string? IncomingCallContext { get; set; }
    
    /// <summary>
    /// Gets or sets the server call ID.
    /// </summary>
    [System.Text.Json.Serialization.JsonPropertyName("serverCallId")]
    public string? ServerCallId { get; set; }
    
    /// <summary>
    /// Gets or sets the correlation ID.
    /// </summary>
    [System.Text.Json.Serialization.JsonPropertyName("correlationId")]
    public string? CorrelationId { get; set; }
    
    /// <summary>
    /// Gets or sets the caller display name.
    /// </summary>
    [System.Text.Json.Serialization.JsonPropertyName("callerDisplayName")]
    public string? CallerDisplayName { get; set; }
}

/// <summary>
/// Communication identifier for caller information.
/// </summary>
public class CommunicationIdentifier
{
    /// <summary>
    /// Gets or sets the raw identifier string.
    /// </summary>
    [System.Text.Json.Serialization.JsonPropertyName("rawId")]
    public string? RawId { get; set; }
    
    /// <summary>
    /// Gets or sets the kind of identifier (e.g., "phoneNumber").
    /// </summary>
    [System.Text.Json.Serialization.JsonPropertyName("kind")]
    public string? Kind { get; set; }
    
    /// <summary>
    /// Gets or sets the phone number identifier.
    /// </summary>
    [System.Text.Json.Serialization.JsonPropertyName("phoneNumber")]
    public PhoneNumberIdentifier? PhoneNumber { get; set; }
}

/// <summary>
/// Phone number identifier.
/// </summary>
public class PhoneNumberIdentifier
{
    /// <summary>
    /// Gets or sets the phone number value.
    /// </summary>
    [System.Text.Json.Serialization.JsonPropertyName("value")]
    public string? Value { get; set; }
}
