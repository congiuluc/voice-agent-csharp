using System.Collections.Concurrent;
using VoiceAgentCSharp.Features.Monitoring.Repositories;

namespace VoiceAgentCSharp.Features.Monitoring;

/// <summary>
/// Background service that batches call session writes to the repository.
/// Flushes periodically and on shutdown to avoid real-time write contention.
/// </summary>
public class BatchWriterService : BackgroundService
{
    private readonly ICallSessionRepository _callSessionRepository;
    private readonly ILogger<BatchWriterService> _logger;
    private readonly ConcurrentQueue<CallSession> _writeQueue = new();
    private readonly TimeSpan _flushInterval;
    private readonly SemaphoreSlim _flushLock = new(1, 1);

    public BatchWriterService(
        ICallSessionRepository callSessionRepository,
        IConfiguration configuration,
        ILogger<BatchWriterService> logger)
    {
        _callSessionRepository = callSessionRepository;
        _logger = logger;

        var flushIntervalMinutes = configuration.GetValue("BatchWriter:FlushIntervalMinutes", 60);
        _flushInterval = TimeSpan.FromMinutes(flushIntervalMinutes);

        _logger.LogInformation("BatchWriterService initialized with {Minutes} minute flush interval", flushIntervalMinutes);
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
        _logger.LogInformation("BatchWriterService started");

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
                _logger.LogError(ex, "Error in BatchWriterService background task");
            }
        }
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        _logger.LogInformation("BatchWriterService stopping, flushing remaining queue...");
        await FlushQueueAsync(cancellationToken);
        await base.StopAsync(cancellationToken);
    }

    /// <summary>
    /// Flushes the queue to the repository.
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

            _logger.LogInformation("Flushing {Count} call sessions to repository", sessionsToWrite.Count);
            await _callSessionRepository.WriteBatchAsync(sessionsToWrite, cancellationToken);
            _logger.LogInformation("Successfully flushed {Count} call sessions", sessionsToWrite.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error flushing call sessions to repository");
            // Items are already dequeued, log the error but don't re-queue to avoid infinite loops
        }
        finally
        {
            _flushLock.Release();
        }
    }
}
