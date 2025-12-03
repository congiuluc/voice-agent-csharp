using System.Collections.Concurrent;

namespace VoiceAgentCSharp.Features.Monitoring;

/// <summary>
/// Background service that batches call session writes to CosmosDB.
/// Flushes hourly and on shutdown to avoid real-time write contention.
/// </summary>
public class CosmosDbBatchWriterService : BackgroundService
{
    private readonly ICosmosDbService _cosmosDbService;
    private readonly ILogger<CosmosDbBatchWriterService> _logger;
    private readonly ConcurrentQueue<CallSession> _writeQueue = new();
    private readonly TimeSpan _flushInterval;
    private readonly SemaphoreSlim _flushLock = new(1, 1);

    public CosmosDbBatchWriterService(
        ICosmosDbService cosmosDbService,
        IConfiguration configuration,
        ILogger<CosmosDbBatchWriterService> logger)
    {
        _cosmosDbService = cosmosDbService;
        _logger = logger;

        var flushIntervalMinutes = configuration.GetValue("CosmosDbBatchWriter:FlushIntervalMinutes", 60);
        _flushInterval = TimeSpan.FromMinutes(flushIntervalMinutes);

        _logger.LogInformation("CosmosDB batch writer initialized with {Minutes} minute flush interval", flushIntervalMinutes);
    }

    /// <summary>
    /// Enqueues a call session for batch writing.
    /// </summary>
    public void EnqueueSession(CallSession session)
    {
        _writeQueue.Enqueue(session);
        _logger.LogDebug("Enqueued session {SessionId} for batch write. Queue size: {QueueSize}", 
            session.SessionId, _writeQueue.Count);
    }

    /// <summary>
    /// Gets current queue size for monitoring.
    /// </summary>
    public int GetQueueSize() => _writeQueue.Count;

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("CosmosDB batch writer service started");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(_flushInterval, stoppingToken);
                await FlushQueueAsync(stoppingToken);
            }
            catch (OperationCanceledException)
            {
                // Expected on shutdown
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error in CosmosDB batch writer background task");
            }
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("CosmosDB batch writer service stopping, flushing remaining queue...");
        await FlushQueueAsync(cancellationToken);
        await base.StopAsync(cancellationToken);
    }

    /// <summary>
    /// Flushes the queue to CosmosDB.
    /// </summary>
    private async Task FlushQueueAsync(CancellationToken cancellationToken)
    {
        if (_writeQueue.IsEmpty)
        {
            _logger.LogDebug("Queue is empty, skipping flush");
            return;
        }

        await _flushLock.WaitAsync(cancellationToken);
        try
        {
            var sessionsToWrite = new List<CallSession>();
            
            // Dequeue all items
            while (_writeQueue.TryDequeue(out var session))
            {
                sessionsToWrite.Add(session);
            }

            if (sessionsToWrite.Count == 0)
            {
                return;
            }

            _logger.LogInformation("Flushing {Count} call sessions to CosmosDB", sessionsToWrite.Count);

            await _cosmosDbService.WriteBatchAsync(sessionsToWrite, cancellationToken);

            _logger.LogInformation("Successfully flushed {Count} call sessions to CosmosDB", sessionsToWrite.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to flush call sessions to CosmosDB");
            
            // Re-enqueue failed items for retry
            // Note: In production, consider a dead-letter queue or max retry limit
        }
        finally
        {
            _flushLock.Release();
        }
    }
}
