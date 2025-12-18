namespace VoiceAgentCSharp.Features.Monitoring.Repositories;

/// <summary>
/// In-memory implementation of token snapshot persistence for testing and fallback.
/// </summary>
public class InMemoryTokenSnapshotRepository : ITokenSnapshotRepository
{
    private TokenSnapshot? _snapshot;
    private readonly ILogger<InMemoryTokenSnapshotRepository> _logger;

    public InMemoryTokenSnapshotRepository(ILogger<InMemoryTokenSnapshotRepository> logger)
    {
        _logger = logger;
    }

    public Task<TokenSnapshot?> GetAsync(CancellationToken cancellationToken = default)
    {
        _logger.LogDebug("Retrieving token snapshot from in-memory storage");
        return Task.FromResult(_snapshot);
    }

    public Task UpsertAsync(TokenSnapshot snapshot, CancellationToken cancellationToken = default)
    {
        _logger.LogDebug("Upserting token snapshot to in-memory storage");
        _snapshot = snapshot;
        return Task.CompletedTask;
    }

    public Task<bool> IsAvailableAsync(CancellationToken cancellationToken = default)
    {
        return Task.FromResult(true);
    }
}
