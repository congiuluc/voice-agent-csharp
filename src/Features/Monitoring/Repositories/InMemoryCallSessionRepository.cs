using System.Collections.Concurrent;

namespace VoiceAgentCSharp.Features.Monitoring.Repositories;

/// <summary>
/// In-memory implementation of call session repository.
/// Used as fallback when CosmosDB is not available.
/// Stores sessions in memory with configurable max capacity.
/// </summary>
public class InMemoryCallSessionRepository : ICallSessionRepository
{
    private readonly ConcurrentDictionary<string, CallSession> _storage = new();
    private readonly ILogger<InMemoryCallSessionRepository> _logger;
    private readonly int _maxCapacity;
    private readonly object _cleanupLock = new();

    public InMemoryCallSessionRepository(
        IConfiguration configuration,
        ILogger<InMemoryCallSessionRepository> logger)
    {
        _logger = logger;
        _maxCapacity = configuration.GetValue("InMemoryRepository:MaxCallSessions", 10000);
        _logger.LogInformation("InMemoryCallSessionRepository initialized with max capacity: {MaxCapacity}", _maxCapacity);
    }

    public Task<bool> IsAvailableAsync(CancellationToken cancellationToken = default)
    {
        return Task.FromResult(true);
    }

    public Task WriteBatchAsync(IEnumerable<CallSession> sessions, CancellationToken cancellationToken = default)
    {
        foreach (var session in sessions)
        {
            var key = $"{session.UserId}:{session.SessionId}";
            _storage[key] = session;
        }

        // Cleanup if over capacity
        if (_storage.Count > _maxCapacity)
        {
            CleanupOldSessions();
        }

        _logger.LogInformation("Written {Count} call sessions to in-memory storage", sessions.Count());
        return Task.CompletedTask;
    }

    public Task<CallSession?> GetByIdAsync(string sessionId, string userId, CancellationToken cancellationToken = default)
    {
        var key = $"{userId}:{sessionId}";
        _storage.TryGetValue(key, out var session);
        return Task.FromResult(session);
    }

    public Task<List<CallSession>> GetByUserIdAsync(string userId, int limit = 100, CancellationToken cancellationToken = default)
    {
        var sessions = _storage.Values
            .Where(s => s.UserId == userId)
            .OrderByDescending(s => s.CreatedAt)
            .Take(limit)
            .ToList();

        return Task.FromResult(sessions);
    }

    public Task<List<CallSession>> GetRecentAsync(int limit = 100, CancellationToken cancellationToken = default)
    {
        var sessions = _storage.Values
            .OrderByDescending(s => s.CreatedAt)
            .Take(limit)
            .ToList();

        return Task.FromResult(sessions);
    }

    /// <summary>
    /// Removes oldest sessions when capacity is exceeded.
    /// </summary>
    private void CleanupOldSessions()
    {
        lock (_cleanupLock)
        {
            if (_storage.Count <= _maxCapacity)
                return;

            var toRemove = _storage
                .OrderBy(kvp => kvp.Value.CreatedAt)
                .Take(_storage.Count - _maxCapacity + (_maxCapacity / 10)) // Remove 10% extra
                .Select(kvp => kvp.Key)
                .ToList();

            foreach (var key in toRemove)
            {
                _storage.TryRemove(key, out _);
            }

            _logger.LogInformation("Cleaned up {Count} old sessions from in-memory storage", toRemove.Count);
        }
    }
}
