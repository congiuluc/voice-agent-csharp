namespace VoiceAgentCSharp.Features.Monitoring.Repositories;

/// <summary>
/// Repository interface for call session data access.
/// </summary>
public interface ICallSessionRepository
{
    /// <summary>
    /// Writes multiple call sessions in batch.
    /// </summary>
    /// <param name="sessions">The sessions to write.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    Task WriteBatchAsync(IEnumerable<CallSession> sessions, CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets a call session by ID.
    /// </summary>
    /// <param name="sessionId">The session ID.</param>
    /// <param name="userId">The user ID (partition key).</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>The call session or null if not found.</returns>
    Task<CallSession?> GetByIdAsync(string sessionId, string userId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets call sessions for a user.
    /// </summary>
    /// <param name="userId">The user ID.</param>
    /// <param name="limit">Maximum number of sessions to return.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>List of call sessions.</returns>
    Task<List<CallSession>> GetByUserIdAsync(string userId, int limit = 100, CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets recent call sessions across all users.
    /// </summary>
    /// <param name="limit">Maximum number of sessions to return.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>List of recent call sessions.</returns>
    Task<List<CallSession>> GetRecentAsync(int limit = 100, CancellationToken cancellationToken = default);

    /// <summary>
    /// Checks if the repository is available/connected.
    /// </summary>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>True if the repository is available.</returns>
    Task<bool> IsAvailableAsync(CancellationToken cancellationToken = default);
}
