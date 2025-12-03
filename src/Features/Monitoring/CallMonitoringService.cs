using System.Collections.Concurrent;
using System.Diagnostics;
using System.Diagnostics.Metrics;
using Microsoft.ApplicationInsights;
using Microsoft.ApplicationInsights.DataContracts;

namespace VoiceAgentCSharp.Features.Monitoring;

/// <summary>
/// Service for monitoring call sessions with OpenTelemetry and Application Insights.
/// Provides real-time telemetry and async CosmosDB persistence.
/// </summary>
public class CallMonitoringService
{
    private readonly TelemetryClient _telemetryClient;
    private readonly PricingService _pricingService;
    private readonly CosmosDbBatchWriterService _batchWriter;
    private readonly ILogger<CallMonitoringService> _logger;

    // OpenTelemetry instrumentation
    private readonly ActivitySource _activitySource;
    private readonly Meter _meter;

    // Custom metrics
    private readonly Counter<long> _callSessionsCounter;
    private readonly Histogram<long> _tokensConsumed;
    private readonly Histogram<double> _estimatedCost;
    private readonly Histogram<double> _audioFlowDuration;
    private readonly Histogram<double> _callDuration;
    private readonly Counter<long> _cosmosBatchWrites;
    private readonly Histogram<double> _avatarDuration;
    private readonly Histogram<double> _pstnCallDuration;

    // In-memory session tracking
    private readonly ConcurrentDictionary<string, CallSession> _activeSessions = new();

    public CallMonitoringService(
        TelemetryClient telemetryClient,
        PricingService pricingService,
        CosmosDbBatchWriterService batchWriter,
        ILogger<CallMonitoringService> logger)
    {
        _telemetryClient = telemetryClient;
        _pricingService = pricingService;
        _batchWriter = batchWriter;
        _logger = logger;

        // Initialize OpenTelemetry
        _activitySource = new ActivitySource("VoiceAgentCSharp.Monitoring");
        _meter = new Meter("VoiceAgentCSharp.Monitoring");

        // Define custom metrics
        _callSessionsCounter = _meter.CreateCounter<long>(
            "call_sessions_total",
            description: "Total number of call sessions created");

        _tokensConsumed = _meter.CreateHistogram<long>(
            "tokens_consumed",
            unit: "tokens",
            description: "Number of tokens consumed per response");

        _estimatedCost = _meter.CreateHistogram<double>(
            "estimated_cost",
            unit: "USD",
            description: "Estimated cost per response");

        _audioFlowDuration = _meter.CreateHistogram<double>(
            "audio_flow_duration_ms",
            unit: "ms",
            description: "Audio input/output segment duration");

        _callDuration = _meter.CreateHistogram<double>(
            "call_duration_seconds",
            unit: "s",
            description: "Total call duration");

        _cosmosBatchWrites = _meter.CreateCounter<long>(
            "cosmos_batch_writes_total",
            description: "Number of batch write operations to CosmosDB");

        _avatarDuration = _meter.CreateHistogram<double>(
            "avatar_duration_seconds",
            unit: "s",
            description: "Avatar session duration");

        _pstnCallDuration = _meter.CreateHistogram<double>(
            "pstn_call_duration_seconds",
            unit: "s",
            description: "PSTN call duration");
    }

    /// <summary>
    /// Logs session creation and starts tracking.
    /// </summary>
    public void LogSessionCreated(string userId, string callType, string sessionId, string model)
    {
        using var activity = _activitySource.StartActivity("SessionCreated");
        activity?.SetTag("user_id", userId);
        activity?.SetTag("call_type", callType);
        activity?.SetTag("session_id", sessionId);
        activity?.SetTag("model", model);

        var session = new CallSession
        {
            SessionId = sessionId,
            UserId = userId,
            CallType = callType,
            Model = model,
            CreatedAt = DateTime.UtcNow,
            StartTime = DateTime.UtcNow,
            Status = "in_progress"
        };

        _activeSessions[sessionId] = session;

        // Emit OpenTelemetry metric
        _callSessionsCounter.Add(1, 
            new KeyValuePair<string, object?>("call_type", callType),
            new KeyValuePair<string, object?>("model", model),
            new KeyValuePair<string, object?>("user_id", userId));

        // Log to Application Insights
        var eventTelemetry = new EventTelemetry("SessionCreated");
        eventTelemetry.Properties["sessionId"] = sessionId;
        eventTelemetry.Properties["userId"] = userId;
        eventTelemetry.Properties["callType"] = callType;
        eventTelemetry.Properties["model"] = model;
        _telemetryClient.TrackEvent(eventTelemetry);

        _logger.LogInformation("Session created: {SessionId}, User: {UserId}, Type: {CallType}, Model: {Model}",
            sessionId, userId, callType, model);
    }

    /// <summary>
    /// Logs audio flow milestone (InputStarted, InputEnded, OutputStarted, OutputEnded).
    /// </summary>
    public void LogAudioFlowMilestone(string sessionId, string milestone)
    {
        if (!_activeSessions.TryGetValue(sessionId, out var session))
        {
            _logger.LogWarning("Session {SessionId} not found for audio milestone {Milestone}", sessionId, milestone);
            return;
        }

        using var activity = _activitySource.StartActivity("AudioFlowMilestone");
        activity?.SetTag("session_id", sessionId);
        activity?.SetTag("milestone", milestone);

        var timestamp = DateTime.UtcNow;
        session.AudioMilestones[milestone] = timestamp;

        // Calculate duration if we have start/end pair
        if (milestone == "InputEnded" && session.AudioMilestones.TryGetValue("InputStarted", out var inputStart))
        {
            var duration = (timestamp - inputStart).TotalMilliseconds;
            _audioFlowDuration.Record(duration,
                new KeyValuePair<string, object?>("call_type", session.CallType),
                new KeyValuePair<string, object?>("milestone_type", "input"));
        }
        else if (milestone == "OutputEnded" && session.AudioMilestones.TryGetValue("OutputStarted", out var outputStart))
        {
            var duration = (timestamp - outputStart).TotalMilliseconds;
            _audioFlowDuration.Record(duration,
                new KeyValuePair<string, object?>("call_type", session.CallType),
                new KeyValuePair<string, object?>("milestone_type", "output"));
        }

        var metricTelemetry = new MetricTelemetry("AudioFlowMilestone", 1);
        metricTelemetry.Properties["sessionId"] = sessionId;
        metricTelemetry.Properties["milestone"] = milestone;
        metricTelemetry.Properties["callType"] = session.CallType;
        _telemetryClient.TrackMetric(metricTelemetry);

        _logger.LogDebug("Audio milestone {Milestone} for session {SessionId}", milestone, sessionId);
    }

    /// <summary>
    /// Logs tokens consumed and calculates cost.
    /// </summary>
    public void LogTokensConsumed(string sessionId, int inputTokens, int outputTokens, string model)
    {
        if (!_activeSessions.TryGetValue(sessionId, out var session))
        {
            _logger.LogWarning("Session {SessionId} not found for token tracking", sessionId);
            return;
        }

        using var activity = _activitySource.StartActivity("TokensConsumed");
        activity?.SetTag("session_id", sessionId);
        activity?.SetTag("input_tokens", inputTokens);
        activity?.SetTag("output_tokens", outputTokens);
        activity?.SetTag("model", model);

        session.InputTokens += inputTokens;
        session.OutputTokens += outputTokens;
        session.TotalTokens = session.InputTokens + session.OutputTokens;

        var cost = _pricingService.CalculateTokenCost(model, inputTokens, outputTokens);
        session.EstimatedCost += cost;

        // Emit OpenTelemetry metrics
        var totalTokens = inputTokens + outputTokens;
        _tokensConsumed.Record(totalTokens,
            new KeyValuePair<string, object?>("call_type", session.CallType),
            new KeyValuePair<string, object?>("model", model),
            new KeyValuePair<string, object?>("user_id", session.UserId));

        _estimatedCost.Record((double)cost,
            new KeyValuePair<string, object?>("call_type", session.CallType),
            new KeyValuePair<string, object?>("model", model),
            new KeyValuePair<string, object?>("user_id", session.UserId));

        // Log to Application Insights
        var metricTelemetry = new MetricTelemetry("TokensConsumed", totalTokens);
        metricTelemetry.Properties["sessionId"] = sessionId;
        metricTelemetry.Properties["callType"] = session.CallType;
        metricTelemetry.Properties["model"] = model;
        metricTelemetry.Properties["inputTokens"] = inputTokens.ToString();
        metricTelemetry.Properties["outputTokens"] = outputTokens.ToString();
        _telemetryClient.TrackMetric(metricTelemetry);

        var costMetric = new MetricTelemetry("EstimatedCost", (double)cost);
        costMetric.Properties["sessionId"] = sessionId;
        costMetric.Properties["callType"] = session.CallType;
        costMetric.Properties["model"] = model;
        _telemetryClient.TrackMetric(costMetric);

        _logger.LogInformation("Tokens consumed - Session: {SessionId}, Input: {InputTokens}, Output: {OutputTokens}, Cost: ${Cost:F4}",
            sessionId, inputTokens, outputTokens, cost);
    }

    /// <summary>
    /// Logs session completion.
    /// </summary>
    public void LogSessionCompleted(string sessionId, string status = "completed", string? errorMessage = null)
    {
        if (!_activeSessions.TryRemove(sessionId, out var session))
        {
            _logger.LogWarning("Session {SessionId} not found for completion", sessionId);
            return;
        }

        using var activity = _activitySource.StartActivity("SessionCompleted");
        activity?.SetTag("session_id", sessionId);
        activity?.SetTag("status", status);

        session.EndTime = DateTime.UtcNow;
        session.Status = status;
        session.ErrorMessage = errorMessage;

        if (session.StartTime.HasValue)
        {
            session.DurationSeconds = (session.EndTime.Value - session.StartTime.Value).TotalSeconds;

            // Record call duration metric
            _callDuration.Record(session.DurationSeconds,
                new KeyValuePair<string, object?>("call_type", session.CallType),
                new KeyValuePair<string, object?>("model", session.Model),
                new KeyValuePair<string, object?>("status", status));

            // Record type-specific duration metrics
            if (session.CallType == "VoiceAvatar")
            {
                _avatarDuration.Record(session.DurationSeconds,
                    new KeyValuePair<string, object?>("model", session.Model),
                    new KeyValuePair<string, object?>("status", status));
            }
            else if (session.CallType == "IncomingCall")
            {
                _pstnCallDuration.Record(session.DurationSeconds,
                    new KeyValuePair<string, object?>("model", session.Model),
                    new KeyValuePair<string, object?>("status", status));
            }
        }

        // Log to Application Insights
        var eventTelemetry = new EventTelemetry("SessionCompleted");
        eventTelemetry.Properties["sessionId"] = sessionId;
        eventTelemetry.Properties["userId"] = session.UserId;
        eventTelemetry.Properties["callType"] = session.CallType;
        eventTelemetry.Properties["model"] = session.Model;
        eventTelemetry.Properties["status"] = status;
        eventTelemetry.Properties["durationSeconds"] = session.DurationSeconds.ToString("F2");
        eventTelemetry.Properties["totalTokens"] = session.TotalTokens.ToString();
        eventTelemetry.Properties["estimatedCost"] = session.EstimatedCost.ToString("F4");
        if (errorMessage != null)
        {
            eventTelemetry.Properties["errorMessage"] = errorMessage;
        }
        _telemetryClient.TrackEvent(eventTelemetry);

        // Enqueue for batch write to CosmosDB
        _batchWriter.EnqueueSession(session);

        _logger.LogInformation("Session completed: {SessionId}, Status: {Status}, Duration: {Duration}s, Cost: ${Cost:F4}",
            sessionId, status, session.DurationSeconds, session.EstimatedCost);
    }

    /// <summary>
    /// Gets current token and cost info for a session.
    /// </summary>
    public (int inputTokens, int outputTokens, decimal cost)? GetSessionMetrics(string sessionId)
    {
        if (_activeSessions.TryGetValue(sessionId, out var session))
        {
            return (session.InputTokens, session.OutputTokens, session.EstimatedCost);
        }
        return null;
    }

    /// <summary>
    /// Gets the ActivitySource for external instrumentation.
    /// </summary>
    public ActivitySource GetActivitySource() => _activitySource;

    /// <summary>
    /// Gets the Meter for external instrumentation.
    /// </summary>
    public Meter GetMeter() => _meter;
}
