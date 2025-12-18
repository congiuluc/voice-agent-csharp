namespace VoiceAgentCSharp.Features.Monitoring.Repositories;

/// <summary>
/// Repository interface for cost snapshot persistence.
/// </summary>
public interface ICostSnapshotRepository
{
    /// <summary>
    /// Gets the current cost snapshot.
    /// </summary>
    Task<CostSnapshot?> GetAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Updates or creates the cost snapshot.
    /// </summary>
    Task<CostSnapshot> UpsertAsync(CostSnapshot snapshot, CancellationToken cancellationToken = default);

    /// <summary>
    /// Checks if the repository is available/connected.
    /// </summary>
    Task<bool> IsAvailableAsync(CancellationToken cancellationToken = default);
}
