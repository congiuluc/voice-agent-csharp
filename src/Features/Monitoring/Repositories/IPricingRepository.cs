namespace VoiceAgentCSharp.Features.Monitoring.Repositories;

/// <summary>
/// Repository interface for pricing configuration data access.
/// </summary>
public interface IPricingRepository
{
    /// <summary>
    /// Gets pricing configuration for a specific model.
    /// </summary>
    /// <param name="modelName">The model name.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>Pricing configuration or null if not found.</returns>
    Task<PricingConfig?> GetByModelNameAsync(string modelName, CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets all pricing configurations.
    /// </summary>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>List of all pricing configurations.</returns>
    Task<List<PricingConfig>> GetAllAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Creates or updates a pricing configuration.
    /// </summary>
    /// <param name="config">The pricing configuration to upsert.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    Task UpsertAsync(PricingConfig config, CancellationToken cancellationToken = default);

    /// <summary>
    /// Deletes a pricing configuration.
    /// </summary>
    /// <param name="modelName">The model name to delete.</param>
    /// <param name="cancellationToken">Cancellation token.</param>
    Task DeleteAsync(string modelName, CancellationToken cancellationToken = default);

    /// <summary>
    /// Checks if the repository is available/connected.
    /// </summary>
    /// <param name="cancellationToken">Cancellation token.</param>
    /// <returns>True if the repository is available.</returns>
    Task<bool> IsAvailableAsync(CancellationToken cancellationToken = default);
}
