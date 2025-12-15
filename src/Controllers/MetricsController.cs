using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using VoiceAgentCSharp.Features.Monitoring;

namespace VoiceAgentCSharp.Controllers;

/// <summary>
/// API for retrieving real-time metrics for the dashboard.
/// Requires Admin role authorization.
/// </summary>
[ApiController]
[Route("api/admin/metrics")]
[Authorize(Roles = "Admin")]
public class MetricsController : ControllerBase
{
    private readonly CallMonitoringService _monitoringService;
    private readonly BatchWriterService _batchWriter;
    private readonly PricingService _pricingService;
    private readonly ILogger<MetricsController> _logger;

    public MetricsController(
        CallMonitoringService monitoringService,
        BatchWriterService batchWriter,
        PricingService pricingService,
        ILogger<MetricsController> logger)
    {
        _monitoringService = monitoringService;
        _batchWriter = batchWriter;
        _pricingService = pricingService;
        _logger = logger;
    }

    /// <summary>
    /// Gets real-time dashboard metrics including token usage, interactions, and models.
    /// </summary>
    [HttpGet]
    public IActionResult GetMetrics()
    {
        try
        {
            var tokenMetrics = _monitoringService.GetAggregatedTokenMetrics();
            var activeSessions = _monitoringService.GetActiveSessions()
                .Select(s => new
                {
                    sessionId = s.SessionId,
                    userId = s.UserId,
                    callType = s.CallType,
                    model = s.Model,
                    inputTokens = s.InputTokens,
                    outputTokens = s.OutputTokens,
                    cachedTokens = s.CachedTokens,
                    totalTokens = s.TotalTokens,
                    interactionCount = s.InteractionCount,
                    estimatedCost = s.EstimatedCost,
                    startTime = s.StartTime,
                    durationSeconds = s.StartTime.HasValue 
                        ? (DateTime.UtcNow - s.StartTime.Value).TotalSeconds 
                        : 0
                })
                .ToList();
            
            var queueSize = _batchWriter.GetQueueSize();
            var pricingModels = _pricingService.GetAllPricing().Count;
            var totalCost = _monitoringService.GetTotalCost();

            // Build token consumption by model breakdown and include pricing info where available
            var pricingDict = _pricingService.GetAllPricing();
            var tokenByModel = tokenMetrics.TokenConsumptionByModel
                .Select(kvp => new
                {
                    model = kvp.Key,
                    inputTokens = kvp.Value.InputTokens,
                    outputTokens = kvp.Value.OutputTokens,
                    cachedTokens = kvp.Value.CachedTokens,
                    totalTokens = kvp.Value.TotalTokens,
                    sessionCount = kvp.Value.SessionCount,
                    // Pricing information (per 1K tokens)
                    inputTokenCost = pricingDict.ContainsKey(kvp.Key) ? pricingDict[kvp.Key].InputTokenCost : 0m,
                    outputTokenCost = pricingDict.ContainsKey(kvp.Key) ? pricingDict[kvp.Key].OutputTokenCost : 0m,
                    cachedInputTokenCost = pricingDict.ContainsKey(kvp.Key) ? pricingDict[kvp.Key].CachedInputTokenCost : 0m
                })
                .OrderByDescending(m => m.totalTokens)
                .ToList();

            return Ok(new
            {
                // Token metrics
                inputTokens = tokenMetrics.TotalInputTokens,
                outputTokens = tokenMetrics.TotalOutputTokens,
                cachedTokens = tokenMetrics.TotalCachedTokens,
                interactions = tokenMetrics.TotalInteractions,
                usedModels = tokenMetrics.UsedModels,
                
                // Token consumption by model (active and completed sessions)
                tokenConsumptionByModel = tokenByModel,
                
                // Cost metrics
                totalEstimatedCost = totalCost,
                
                // Session metrics
                activeSessionCount = activeSessions.Count(),
                activeSessions = activeSessions,
                queueSize,
                pricingModels,
                
                // Metadata
                timestamp = DateTime.UtcNow
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to retrieve metrics");
            return StatusCode(500, new { error = "Failed to retrieve metrics" });
        }
    }

    /// <summary>
    /// Gets active session details.
    /// </summary>
    [HttpGet("sessions")]
    public IActionResult GetActiveSessions()
    {
        try
        {
            var sessions = _monitoringService.GetActiveSessions()
                .Select(s => new
                {
                    sessionId = s.SessionId,
                    userId = s.UserId,
                    callType = s.CallType,
                    model = s.Model,
                    inputTokens = s.InputTokens,
                    outputTokens = s.OutputTokens,
                    cachedTokens = s.CachedTokens,
                    interactionCount = s.InteractionCount,
                    estimatedCost = s.EstimatedCost,
                    startTime = s.StartTime,
                    durationSeconds = s.StartTime.HasValue 
                        ? (DateTime.UtcNow - s.StartTime.Value).TotalSeconds 
                        : 0
                })
                .ToList();

            return Ok(new
            {
                sessions,
                count = sessions.Count,
                timestamp = DateTime.UtcNow
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to retrieve active sessions");
            return StatusCode(500, new { error = "Failed to retrieve active sessions" });
        }
    }
}

/// <summary>
/// Public API for consumption tracking from frontend.
/// Does not require authentication to allow WebSocket clients to sync data.
/// </summary>
[ApiController]
[Route("api/metrics")]
public class ConsumptionController : ControllerBase
{
    private readonly CallMonitoringService _monitoringService;
    private readonly ILogger<ConsumptionController> _logger;

    public ConsumptionController(
        CallMonitoringService monitoringService,
        ILogger<ConsumptionController> logger)
    {
        _monitoringService = monitoringService;
        _logger = logger;
    }

    /// <summary>
    /// Receives consumption data from frontend for tracking.
    /// </summary>
    [HttpPost("consumption")]
    public IActionResult PostConsumption([FromBody] ConsumptionData data)
    {
        try
        {
            if (string.IsNullOrEmpty(data.SessionId))
            {
                return BadRequest(new { error = "SessionId is required" });
            }

            // Log token consumption if tokens are present
            if (data.InputTokens > 0 || data.OutputTokens > 0)
            {
                _monitoringService.LogTokensConsumed(
                    data.SessionId,
                    data.InputTokens,
                    data.OutputTokens,
                    data.Model ?? "gpt-4o-realtime",
                    data.CachedTokens);
            }

            // Log audio milestones if audio duration is present
            if (data.InputAudioDurationMs > 0)
            {
                _monitoringService.LogAudioFlowMilestone(data.SessionId, "InputEnded");
            }
            if (data.OutputAudioDurationMs > 0)
            {
                _monitoringService.LogAudioFlowMilestone(data.SessionId, "OutputEnded");
            }

            _logger.LogDebug(
                "Consumption tracked - Session: {SessionId}, Tokens: {InputTokens}/{OutputTokens}, Audio: {InputMs}/{OutputMs}ms",
                data.SessionId, data.InputTokens, data.OutputTokens, 
                data.InputAudioDurationMs, data.OutputAudioDurationMs);

            return Ok(new { 
                success = true,
                timestamp = DateTime.UtcNow
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to track consumption for session {SessionId}", data.SessionId);
            return StatusCode(500, new { error = "Failed to track consumption" });
        }
    }

    /// <summary>
    /// Gets consumption summary for a session.
    /// </summary>
    [HttpGet("consumption/{sessionId}")]
    public IActionResult GetConsumption(string sessionId)
    {
        try
        {
            var metrics = _monitoringService.GetSessionMetrics(sessionId);
            if (metrics == null)
            {
                return NotFound(new { error = "Session not found" });
            }

            return Ok(new
            {
                sessionId,
                inputTokens = metrics.Value.inputTokens,
                outputTokens = metrics.Value.outputTokens,
                estimatedCost = metrics.Value.cost,
                timestamp = DateTime.UtcNow
            });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to get consumption for session {SessionId}", sessionId);
            return StatusCode(500, new { error = "Failed to get consumption" });
        }
    }
}

/// <summary>
/// Consumption data received from frontend.
/// </summary>
public class ConsumptionData
{
    public string SessionId { get; set; } = string.Empty;
    public string? Model { get; set; }
    public int InputTokens { get; set; }
    public int OutputTokens { get; set; }
    public int CachedTokens { get; set; }
    public long InputAudioDurationMs { get; set; }
    public long OutputAudioDurationMs { get; set; }
    public int ResponseCount { get; set; }
    public string? Timestamp { get; set; }
}
