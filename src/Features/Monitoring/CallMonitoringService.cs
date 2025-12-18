using System.Collections.Concurrent;
using System.Diagnostics;
using System.Diagnostics.Metrics;
using Microsoft.ApplicationInsights;
using Microsoft.ApplicationInsights.DataContracts;
using VoiceAgentCSharp.Features.Monitoring.Repositories;

namespace VoiceAgentCSharp.Features.Monitoring;

/// <summary>
/// Service for monitoring call sessions with OpenTelemetry and Application Insights.
/// Provides real-time telemetry and async repository persistence.
/// </summary>
public class CallMonitoringService
{
    private readonly TelemetryClient _telemetryClient;
    private readonly PricingService _pricingService;
    private readonly BatchWriterService _batchWriter;
    private readonly ICostSnapshotRepository _costSnapshotRepository;
    private readonly ITokenSnapshotRepository _tokenSnapshotRepository;
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
    private readonly Counter<long> _repositoryBatchWrites;
    private readonly Histogram<double> _avatarDuration;
    private readonly Histogram<double> _pstnCallDuration;

    // In-memory session tracking
    private readonly ConcurrentDictionary<string, CallSession> _activeSessions = new();
    
    // Track total costs from completed sessions for persistence
    private decimal _completedSessionsTotalCost = 0;
    private int _completedSessionsCount = 0;

    // Track total tokens from completed sessions for persistence
    private long _completedSessionsTotalInputTokens = 0;
    private long _completedSessionsTotalOutputTokens = 0;
    private long _completedSessionsTotalCachedTokens = 0;

    // Track total interactions from completed sessions
    private int _completedInteractions = 0;

    // Track models used by any session (active or completed)
    private readonly ConcurrentDictionary<string, byte> _usedModels = new();

    public CallMonitoringService(
        TelemetryClient telemetryClient,
        PricingService pricingService,
        BatchWriterService batchWriter,
        ICostSnapshotRepository costSnapshotRepository,
        ITokenSnapshotRepository tokenSnapshotRepository,
        ILogger<CallMonitoringService> logger)
    {
        _telemetryClient = telemetryClient;
        _pricingService = pricingService;
        _batchWriter = batchWriter;
        _costSnapshotRepository = costSnapshotRepository;
        _tokenSnapshotRepository = tokenSnapshotRepository;
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

        _repositoryBatchWrites = _meter.CreateCounter<long>(
            "repository_batch_writes_total",
            description: "Number of batch write operations to repository");

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
    /// Initializes the service by loading persisted cost totals from the database.
    /// Call this during application startup.
    /// </summary>
    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        try
        {
            var costSnapshot = await _costSnapshotRepository.GetAsync(cancellationToken);
            if (costSnapshot != null)
            {
                _completedSessionsTotalCost = costSnapshot.TotalCost;
                _completedSessionsCount = costSnapshot.TotalSessionsCompleted;
                _logger.LogInformation("Loaded persisted cost snapshot: Total: ${Cost:F4}, Sessions: {Count}", 
                    _completedSessionsTotalCost, _completedSessionsCount);
            }
            else
            {
                _logger.LogInformation("No persisted cost snapshot found, starting with zero");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error loading cost snapshot at startup");
            // Continue even if loading fails - use in-memory only
        }

        try
        {
            var tokenSnapshot = await _tokenSnapshotRepository.GetAsync(cancellationToken);
            if (tokenSnapshot != null)
            {
                _completedSessionsTotalInputTokens = tokenSnapshot.TotalInputTokens;
                _completedSessionsTotalOutputTokens = tokenSnapshot.TotalOutputTokens;
                _completedSessionsTotalCachedTokens = tokenSnapshot.TotalCachedTokens;
                _logger.LogInformation("Loaded persisted token snapshot: Input: {InputTokens}, Output: {OutputTokens}, Cached: {CachedTokens}", 
                    _completedSessionsTotalInputTokens, _completedSessionsTotalOutputTokens, _completedSessionsTotalCachedTokens);
            }
            else
            {
                _logger.LogInformation("No persisted token snapshot found, starting with zero");
            }
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error loading token snapshot at startup");
            // Continue even if loading fails - use in-memory only
        }
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
            Status = SessionStatus.InProgress
        };

        _activeSessions[sessionId] = session;
        TrackModelUsage(model);

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
    public void LogTokensConsumed(string sessionId, int inputTokens, int outputTokens, string model, int cachedTokens = 0)
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
        activity?.SetTag("cached_tokens", cachedTokens);
        activity?.SetTag("model", model);

        session.InputTokens += inputTokens;
        session.OutputTokens += outputTokens;
        session.CachedTokens += cachedTokens;
        session.TotalTokens = session.InputTokens + session.OutputTokens;
        session.InteractionCount++;

        TrackModelUsage(model);

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

        _logger.LogInformation("Tokens consumed - Session: {SessionId}, Input: {InputTokens}, Output: {OutputTokens}, Cost: ${Cost:F4}, Total Cost: ${TotalCost:F4}",
            sessionId, inputTokens, outputTokens, cost, session.EstimatedCost);

        // Optionally persist active session snapshot for real-time cost tracking
        // This ensures costs are tracked even if session is still ongoing
        PersistActiveSessionSnapshot(session);
    }

    /// <summary>
    /// Creates a snapshot of active session costs for intermediate persistence.
    /// This ensures costs are tracked in CosmosDB even if session hasn't completed yet.
    /// Only persists snapshots at 30-second intervals to avoid excessive writes.
    /// </summary>
    private void PersistActiveSessionSnapshot(CallSession session)
    {
        try
        {
            // Only persist snapshot if 30+ seconds have passed since last snapshot
            var now = DateTime.UtcNow;
            if (session.LastSnapshotTime.HasValue && 
                (now - session.LastSnapshotTime.Value).TotalSeconds < 30)
            {
                return; // Skip snapshot, too soon
            }

            session.LastSnapshotTime = now;

            // Create a shallow copy with snapshot timestamp
            var snapshot = new CallSession
            {
                Id = $"{session.SessionId}-cost-{now:yyyyMMddHHmmss}",
                SessionId = session.SessionId,
                UserId = session.UserId,
                CallType = session.CallType,
                Model = session.Model,
                InputTokens = session.InputTokens,
                OutputTokens = session.OutputTokens,
                CachedTokens = session.CachedTokens,
                TotalTokens = session.TotalTokens,
                InteractionCount = session.InteractionCount,
                EstimatedCost = session.EstimatedCost,
                Status = "in-progress",
                CreatedAt = session.CreatedAt,
                StartTime = session.StartTime,
                EndTime = now,
                LastSnapshotTime = now
            };

            _batchWriter.EnqueueSession(snapshot);
            _logger.LogInformation("Persisted cost snapshot for session {SessionId}: Input={InputTokens}, Output={OutputTokens}, Cost=${Cost:F4}", 
                session.SessionId, session.InputTokens, session.OutputTokens, session.EstimatedCost);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to persist session snapshot for {SessionId}", session.SessionId);
        }
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

        // Add completed session cost to persistent total
        AddCompletedSessionCost(session.EstimatedCost);

        // Add completed session tokens to persistent total
        AddCompletedSessionTokens(session.InputTokens, session.OutputTokens, session.CachedTokens);

        _completedInteractions += session.InteractionCount;
        TrackModelUsage(session.Model);

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

    /// <summary>
    /// Gets the count of active sessions.
    /// </summary>
    public int GetActiveSessionCount() => _activeSessions.Count;

    /// <summary>
    /// Gets the count of completed sessions (persisted).
    /// </summary>
    public int GetCompletedSessionCount() => _completedSessionsCount;

    /// <summary>
    /// Gets the total count of sessions (active + completed).
    /// </summary>
    public int GetTotalSessionCount() => _activeSessions.Count + _completedSessionsCount;

    /// <summary>
    /// Gets aggregated token metrics across all active and completed sessions.
    /// Includes token consumption breakdown by model.
    /// </summary>
    public TokenMetrics GetAggregatedTokenMetrics()
    {
        var metrics = new TokenMetrics();
        var modelConsumption = new Dictionary<string, ModelTokenConsumption>();
        var modelSessionCounts = new Dictionary<string, int>();
        
        // Process active sessions
        foreach (var session in _activeSessions.Values)
        {
            metrics.TotalInputTokens += session.InputTokens;
            metrics.TotalOutputTokens += session.OutputTokens;
            metrics.TotalCachedTokens += session.CachedTokens;
            metrics.TotalInteractions += session.InteractionCount;
            
            if (!string.IsNullOrEmpty(session.Model))
            {
                if (!metrics.UsedModels.Contains(session.Model))
                {
                    metrics.UsedModels.Add(session.Model);
                }
                
                // Track consumption by model
                if (!modelConsumption.ContainsKey(session.Model))
                {
                    modelConsumption[session.Model] = new ModelTokenConsumption();
                    modelSessionCounts[session.Model] = 0;
                }
                
                modelConsumption[session.Model].InputTokens += session.InputTokens;
                modelConsumption[session.Model].OutputTokens += session.OutputTokens;
                modelConsumption[session.Model].CachedTokens += session.CachedTokens;
                modelSessionCounts[session.Model]++;
            }
        }

        metrics.TotalInputTokens += _completedSessionsTotalInputTokens;
        metrics.TotalOutputTokens += _completedSessionsTotalOutputTokens;
        metrics.TotalCachedTokens += _completedSessionsTotalCachedTokens;
        metrics.TotalInteractions += _completedInteractions;

        // Add models from _usedModels
        foreach (var model in _usedModels.Keys)
        {
            if (!string.IsNullOrEmpty(model))
            {
                if (!metrics.UsedModels.Contains(model))
                {
                    metrics.UsedModels.Add(model);
                }
                
                // Initialize if not already present (for completed-only models)
                if (!modelConsumption.ContainsKey(model))
                {
                    modelConsumption[model] = new ModelTokenConsumption();
                    modelSessionCounts[model] = 0;
                }
            }
        }
        
        // Populate session count for each model
        foreach (var modelName in modelConsumption.Keys)
        {
            if (modelSessionCounts.TryGetValue(modelName, out var count))
            {
                modelConsumption[modelName].SessionCount = count;
            }
        }
        
        metrics.TokenConsumptionByModel = modelConsumption;
        
        return metrics;
    }

    /// <summary>
    /// Gets the list of active sessions with their details.
    /// </summary>
    public IEnumerable<CallSession> GetActiveSessions() => _activeSessions.Values;

    /// <summary>
    /// Gets the total estimated cost from active sessions.
    /// </summary>
    public decimal GetActiveTotalCost() => _activeSessions.Values.Sum(s => s.EstimatedCost);

    /// <summary>
    /// Gets the total estimated cost (active + completed sessions).
    /// </summary>
    public decimal GetTotalCost() => GetActiveTotalCost() + _completedSessionsTotalCost;

    /// <summary>
    /// Adds cost from a completed session to the persistent total and saves to database.
    /// Call this when a session is being archived/completed.
    /// </summary>
    public async Task AddCompletedSessionCostAsync(decimal cost, CancellationToken cancellationToken = default)
    {
        _completedSessionsTotalCost += cost;
        _completedSessionsCount++;
        
        // Create snapshot for persistence
        var snapshot = new CostSnapshot
        {
            TotalCost = _completedSessionsTotalCost,
            TotalSessionsCompleted = _completedSessionsCount,
            LastUpdated = DateTime.UtcNow
        };

        // Save to database (fire and forget with error logging)
        _ = Task.Run(async () =>
        {
            try
            {
                await _costSnapshotRepository.UpsertAsync(snapshot, cancellationToken);
                _logger.LogInformation("Cost snapshot persisted: Total: ${Cost:F4}, Sessions: {Count}", 
                    _completedSessionsTotalCost, _completedSessionsCount);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error persisting cost snapshot");
            }
        }, cancellationToken);
    }

    /// <summary>
    /// Adds cost from a completed session to the persistent total (synchronous version for backward compatibility).
    /// Call this when a session is being archived/completed.
    /// </summary>
    public void AddCompletedSessionCost(decimal cost)
    {
        _completedSessionsTotalCost += cost;
        _completedSessionsCount++;
        _logger.LogInformation("Completed session cost added: ${Cost:F4}, Total completed cost: ${Total:F4}", 
            cost, _completedSessionsTotalCost);
    }

    /// <summary>
    /// Adds tokens from a completed session to the persistent total and saves to database.
    /// Call this when a session is being archived/completed.
    /// </summary>
    public async Task AddCompletedSessionTokensAsync(long inputTokens, long outputTokens, long cachedTokens = 0, CancellationToken cancellationToken = default)
    {
        _completedSessionsTotalInputTokens += inputTokens;
        _completedSessionsTotalOutputTokens += outputTokens;
        _completedSessionsTotalCachedTokens += cachedTokens;
        
        // Create snapshot for persistence
        var snapshot = new TokenSnapshot
        {
            TotalInputTokens = _completedSessionsTotalInputTokens,
            TotalOutputTokens = _completedSessionsTotalOutputTokens,
            TotalCachedTokens = _completedSessionsTotalCachedTokens,
            TotalSessionsCompleted = _completedSessionsCount,
            LastUpdated = DateTime.UtcNow
        };

        // Save to database (fire and forget with error logging)
        _ = Task.Run(async () =>
        {
            try
            {
                await _tokenSnapshotRepository.UpsertAsync(snapshot, cancellationToken);
                _logger.LogInformation("Token snapshot persisted: Input: {InputTokens}, Output: {OutputTokens}, Cached: {CachedTokens}", 
                    _completedSessionsTotalInputTokens, _completedSessionsTotalOutputTokens, _completedSessionsTotalCachedTokens);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error persisting token snapshot");
            }
        }, cancellationToken);
    }

    /// <summary>
    /// Adds tokens from a completed session to the persistent total (synchronous version for backward compatibility).
    /// Call this when a session is being archived/completed.
    /// </summary>
    public void AddCompletedSessionTokens(long inputTokens, long outputTokens, long cachedTokens = 0)
    {
        _completedSessionsTotalInputTokens += inputTokens;
        _completedSessionsTotalOutputTokens += outputTokens;
        _completedSessionsTotalCachedTokens += cachedTokens;
        _logger.LogInformation("Completed session tokens added: Input: {InputTokens}, Output: {OutputTokens}, Cached: {CachedTokens}", 
            inputTokens, outputTokens, cachedTokens);
    }

    /// <summary>
    /// Gets the total tokens (input + output) from active sessions.
    /// </summary>
    public long GetActiveTotalTokens()
    {
        long total = 0;
        foreach (var session in _activeSessions.Values)
        {
            total += session.InputTokens + session.OutputTokens;
        }
        return total;
    }

    /// <summary>
    /// Gets the total tokens (input + output) from completed sessions.
    /// </summary>
    public long GetCompletedTotalTokens() => _completedSessionsTotalInputTokens + _completedSessionsTotalOutputTokens;

    /// <summary>
    /// Gets the aggregated token statistics (active + completed).
    /// </summary>
    public (long inputTokens, long outputTokens, long cachedTokens, long totalTokens) GetAggregatedTokenStats()
    {
        long activeInputTokens = 0;
        long activeOutputTokens = 0;
        
        foreach (var session in _activeSessions.Values)
        {
            activeInputTokens += session.InputTokens;
            activeOutputTokens += session.OutputTokens;
        }

        var totalInputTokens = activeInputTokens + _completedSessionsTotalInputTokens;
        var totalOutputTokens = activeOutputTokens + _completedSessionsTotalOutputTokens;
        var totalTokens = totalInputTokens + totalOutputTokens;

        return (totalInputTokens, totalOutputTokens, _completedSessionsTotalCachedTokens, totalTokens);
    }

    private void TrackModelUsage(string? model)
    {
        if (string.IsNullOrWhiteSpace(model)) return;
        _usedModels.TryAdd(model, 0);
    }
}

/// <summary>
/// Aggregated token metrics for dashboard display.
/// </summary>
public class TokenMetrics
{
    public long TotalInputTokens { get; set; }
    public long TotalOutputTokens { get; set; }
    public long TotalCachedTokens { get; set; }
    public int TotalInteractions { get; set; }
    public List<string> UsedModels { get; set; } = new();
    
    /// <summary>
    /// Token consumption breakdown by model (includes both active and completed sessions).
    /// Key: Model name, Value: Token consumption data for that model
    /// </summary>
    public Dictionary<string, ModelTokenConsumption> TokenConsumptionByModel { get; set; } = new();
}

/// <summary>
/// Token consumption data for a specific model.
/// </summary>
public class ModelTokenConsumption
{
    public long InputTokens { get; set; }
    public long OutputTokens { get; set; }
    public long CachedTokens { get; set; }
    public long TotalTokens => InputTokens + OutputTokens;
    public int SessionCount { get; set; }
}
