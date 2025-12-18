namespace VoiceAgentCSharp.Features.Monitoring.Repositories;

/// <summary>
/// In-memory implementation of cost snapshot repository for testing and fallback.
/// </summary>
public class InMemoryCostSnapshotRepository : ICostSnapshotRepository
{
    private CostSnapshot? _snapshot;
    private readonly ILogger<InMemoryCostSnapshotRepository> _logger;

    public InMemoryCostSnapshotRepository(ILogger<InMemoryCostSnapshotRepository> logger)
    {
        _logger = logger;
    }

    public Task<CostSnapshot?> GetAsync(CancellationToken cancellationToken = default)
    {
        return Task.FromResult(_snapshot);
    }

    public Task<CostSnapshot> UpsertAsync(CostSnapshot snapshot, CancellationToken cancellationToken = default)
    {
        snapshot.LastUpdated = DateTime.UtcNow;
        _snapshot = snapshot;
        _logger.LogDebug("Cost snapshot stored in-memory. Total cost: ${Cost:F4}", snapshot.TotalCost);
        return Task.FromResult(snapshot);
    }

    public Task<bool> IsAvailableAsync(CancellationToken cancellationToken = default)
    {
        return Task.FromResult(true);
    }
}
