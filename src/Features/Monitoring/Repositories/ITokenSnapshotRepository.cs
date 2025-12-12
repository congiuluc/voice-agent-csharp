namespace VoiceAgentCSharp.Features.Monitoring.Repositories;

/// <summary>
/// Interface for persisting and retrieving token consumption snapshots.
/// </summary>
public interface ITokenSnapshotRepository
{
    /// <summary>
    /// Gets the current aggregated token snapshot from storage.
    /// </summary>
    Task<TokenSnapshot?> GetAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Saves or updates the token consumption snapshot in storage.
    /// </summary>
    Task UpsertAsync(TokenSnapshot snapshot, CancellationToken cancellationToken = default);

    /// <summary>
    /// Checks if the repository is available and can perform operations.
    /// </summary>
    Task<bool> IsAvailableAsync(CancellationToken cancellationToken = default);
}
