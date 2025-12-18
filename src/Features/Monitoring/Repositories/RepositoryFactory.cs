using Microsoft.Azure.Cosmos;

namespace VoiceAgentCSharp.Features.Monitoring.Repositories;

/// <summary>
/// Factory for creating repository instances with CosmosDB-to-InMemory fallback.
/// </summary>
public static class RepositoryFactory
{
    /// <summary>
    /// Registers monitoring repositories with CosmosDB-to-InMemory fallback.
    /// In Debug mode, always uses InMemory storage for easier development/testing.
    /// In Release mode, uses CosmosDB if configured, otherwise falls back to InMemory.
    /// </summary>
    public static IServiceCollection AddMonitoringRepositories(
        this IServiceCollection services,
        IConfiguration configuration)
    {
#if DEBUG
        // Debug mode: Always use in-memory storage for easier development
        services.AddSingleton<IPricingRepository, InMemoryPricingRepository>();
        services.AddSingleton<ICallSessionRepository, InMemoryCallSessionRepository>();
        services.AddSingleton<ICostSnapshotRepository, InMemoryCostSnapshotRepository>();
        services.AddSingleton<ITokenSnapshotRepository, InMemoryTokenSnapshotRepository>();
        
        var logger = services.BuildServiceProvider().GetService<ILogger<InMemoryPricingRepository>>();
        logger?.LogInformation("DEBUG MODE: Using in-memory storage for monitoring data");
#else
        // Release mode: Use CosmosDB if configured, otherwise InMemory
        var cosmosConnectionString = configuration["CosmosDb:ConnectionString"];
        var cosmosEndpoint = configuration["CosmosDb:Endpoint"];

        var useCosmosDb = !string.IsNullOrEmpty(cosmosConnectionString) || !string.IsNullOrEmpty(cosmosEndpoint);

        if (useCosmosDb)
        {
            // Register CosmosClient
            services.AddSingleton<CosmosClient>(sp =>
            {
                if (!string.IsNullOrEmpty(cosmosConnectionString))
                {
                    return new CosmosClient(cosmosConnectionString);
                }

                var clientId = configuration["AzureIdentity:UserAssignedClientId"];
                var credential = string.IsNullOrEmpty(clientId)
                    ? new Azure.Identity.DefaultAzureCredential()
                    : new Azure.Identity.DefaultAzureCredential(
                        new Azure.Identity.DefaultAzureCredentialOptions
                        {
                            ManagedIdentityClientId = clientId
                        });

                return new CosmosClient(cosmosEndpoint!, credential);
            });

            // Register CosmosDB repositories as primary
            services.AddSingleton<CosmosPricingRepository>();
            services.AddSingleton<CosmosCallSessionRepository>();
            services.AddSingleton<CosmosCostSnapshotRepository>();
            services.AddSingleton<CosmosTokenSnapshotRepository>();

            // Register InMemory repositories as fallback
            services.AddSingleton<InMemoryPricingRepository>();
            services.AddSingleton<InMemoryCallSessionRepository>();
            services.AddSingleton<InMemoryCostSnapshotRepository>();
            services.AddSingleton<InMemoryTokenSnapshotRepository>();

            // Register wrapper repositories that handle fallback
            services.AddSingleton<IPricingRepository, FallbackPricingRepository>();
            services.AddSingleton<ICallSessionRepository, FallbackCallSessionRepository>();
            services.AddSingleton<ICostSnapshotRepository, FallbackCostSnapshotRepository>();
            services.AddSingleton<ITokenSnapshotRepository, FallbackTokenSnapshotRepository>();
        }
        else
        {
            // No CosmosDB configured - use InMemory only
            services.AddSingleton<IPricingRepository, InMemoryPricingRepository>();
            services.AddSingleton<ICallSessionRepository, InMemoryCallSessionRepository>();
            services.AddSingleton<ICostSnapshotRepository, InMemoryCostSnapshotRepository>();
            services.AddSingleton<ITokenSnapshotRepository, InMemoryTokenSnapshotRepository>();
        }
#endif

        return services;
    }
}

/// <summary>
/// Pricing repository with automatic fallback from CosmosDB to InMemory.
/// </summary>
public class FallbackPricingRepository : IPricingRepository
{
    private readonly CosmosPricingRepository _cosmosRepository;
    private readonly InMemoryPricingRepository _inMemoryRepository;
    private readonly ILogger<FallbackPricingRepository> _logger;
    private bool _useInMemoryFallback;
    private DateTime _lastAvailabilityCheck = DateTime.MinValue;
    private readonly TimeSpan _availabilityCheckInterval = TimeSpan.FromMinutes(5);
    private readonly SemaphoreSlim _checkLock = new(1, 1);

    public FallbackPricingRepository(
        CosmosPricingRepository cosmosRepository,
        InMemoryPricingRepository inMemoryRepository,
        ILogger<FallbackPricingRepository> logger)
    {
        _cosmosRepository = cosmosRepository;
        _inMemoryRepository = inMemoryRepository;
        _logger = logger;
    }

    public async Task<bool> IsAvailableAsync(CancellationToken cancellationToken = default)
    {
        await CheckAndUpdateAvailabilityAsync(cancellationToken);
        return true; // Always available due to fallback
    }

    public async Task<PricingConfig?> GetByModelNameAsync(string modelName, CancellationToken cancellationToken = default)
    {
        var repository = await GetActiveRepositoryAsync(cancellationToken);
        return await repository.GetByModelNameAsync(modelName, cancellationToken);
    }

    public async Task<List<PricingConfig>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        var repository = await GetActiveRepositoryAsync(cancellationToken);
        return await repository.GetAllAsync(cancellationToken);
    }

    public async Task UpsertAsync(PricingConfig config, CancellationToken cancellationToken = default)
    {
        var repository = await GetActiveRepositoryAsync(cancellationToken);
        await repository.UpsertAsync(config, cancellationToken);

        // Also update in-memory cache when using CosmosDB
        if (!_useInMemoryFallback)
        {
            await _inMemoryRepository.UpsertAsync(config, cancellationToken);
        }
    }

    public async Task DeleteAsync(string modelName, CancellationToken cancellationToken = default)
    {
        var repository = await GetActiveRepositoryAsync(cancellationToken);
        await repository.DeleteAsync(modelName, cancellationToken);

        // Also delete from in-memory cache
        if (!_useInMemoryFallback)
        {
            await _inMemoryRepository.DeleteAsync(modelName, cancellationToken);
        }
    }

    private async Task<IPricingRepository> GetActiveRepositoryAsync(CancellationToken cancellationToken)
    {
        await CheckAndUpdateAvailabilityAsync(cancellationToken);
        return _useInMemoryFallback ? _inMemoryRepository : _cosmosRepository;
    }

    private async Task CheckAndUpdateAvailabilityAsync(CancellationToken cancellationToken)
    {
        if (DateTime.UtcNow - _lastAvailabilityCheck < _availabilityCheckInterval)
            return;

        if (!await _checkLock.WaitAsync(0, cancellationToken))
            return;

        try
        {
            var isCosmosAvailable = await _cosmosRepository.IsAvailableAsync(cancellationToken);

            if (_useInMemoryFallback && isCosmosAvailable)
            {
                _logger.LogInformation("CosmosDB is now available - switching from in-memory fallback");
                _useInMemoryFallback = false;

                // Sync in-memory data to CosmosDB
                await SyncToCosmosAsync(cancellationToken);
            }
            else if (!_useInMemoryFallback && !isCosmosAvailable)
            {
                _logger.LogWarning("CosmosDB is unavailable - switching to in-memory fallback");
                _useInMemoryFallback = true;
            }

            _lastAvailabilityCheck = DateTime.UtcNow;
        }
        finally
        {
            _checkLock.Release();
        }
    }

    private async Task SyncToCosmosAsync(CancellationToken cancellationToken)
    {
        try
        {
            var inMemoryConfigs = await _inMemoryRepository.GetAllAsync(cancellationToken);
            foreach (var config in inMemoryConfigs)
            {
                await _cosmosRepository.UpsertAsync(config, cancellationToken);
            }
            _logger.LogInformation("Synced {Count} pricing configs from in-memory to CosmosDB", inMemoryConfigs.Count);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to sync pricing configs to CosmosDB");
        }
    }
}

/// <summary>
/// Call session repository with automatic fallback from CosmosDB to InMemory.
/// </summary>
public class FallbackCallSessionRepository : ICallSessionRepository
{
    private readonly CosmosCallSessionRepository _cosmosRepository;
    private readonly InMemoryCallSessionRepository _inMemoryRepository;
    private readonly ILogger<FallbackCallSessionRepository> _logger;
    private bool _useInMemoryFallback;
    private DateTime _lastAvailabilityCheck = DateTime.MinValue;
    private readonly TimeSpan _availabilityCheckInterval = TimeSpan.FromMinutes(5);
    private readonly SemaphoreSlim _checkLock = new(1, 1);

    public FallbackCallSessionRepository(
        CosmosCallSessionRepository cosmosRepository,
        InMemoryCallSessionRepository inMemoryRepository,
        ILogger<FallbackCallSessionRepository> logger)
    {
        _cosmosRepository = cosmosRepository;
        _inMemoryRepository = inMemoryRepository;
        _logger = logger;
    }

    public async Task<bool> IsAvailableAsync(CancellationToken cancellationToken = default)
    {
        await CheckAndUpdateAvailabilityAsync(cancellationToken);
        return true; // Always available due to fallback
    }

    public async Task WriteBatchAsync(IEnumerable<CallSession> sessions, CancellationToken cancellationToken = default)
    {
        var repository = await GetActiveRepositoryAsync(cancellationToken);
        await repository.WriteBatchAsync(sessions, cancellationToken);

        // Also store in-memory when using CosmosDB for quick access
        if (!_useInMemoryFallback)
        {
            await _inMemoryRepository.WriteBatchAsync(sessions, cancellationToken);
        }
    }

    public async Task<CallSession?> GetByIdAsync(string sessionId, string userId, CancellationToken cancellationToken = default)
    {
        var repository = await GetActiveRepositoryAsync(cancellationToken);
        return await repository.GetByIdAsync(sessionId, userId, cancellationToken);
    }

    public async Task<List<CallSession>> GetByUserIdAsync(string userId, int limit = 100, CancellationToken cancellationToken = default)
    {
        var repository = await GetActiveRepositoryAsync(cancellationToken);
        return await repository.GetByUserIdAsync(userId, limit, cancellationToken);
    }

    public async Task<List<CallSession>> GetRecentAsync(int limit = 100, CancellationToken cancellationToken = default)
    {
        var repository = await GetActiveRepositoryAsync(cancellationToken);
        return await repository.GetRecentAsync(limit, cancellationToken);
    }

    private async Task<ICallSessionRepository> GetActiveRepositoryAsync(CancellationToken cancellationToken)
    {
        await CheckAndUpdateAvailabilityAsync(cancellationToken);
        return _useInMemoryFallback ? _inMemoryRepository : _cosmosRepository;
    }

    private async Task CheckAndUpdateAvailabilityAsync(CancellationToken cancellationToken)
    {
        if (DateTime.UtcNow - _lastAvailabilityCheck < _availabilityCheckInterval)
            return;

        if (!await _checkLock.WaitAsync(0, cancellationToken))
            return;

        try
        {
            var isCosmosAvailable = await _cosmosRepository.IsAvailableAsync(cancellationToken);

            if (_useInMemoryFallback && isCosmosAvailable)
            {
                _logger.LogInformation("CosmosDB is now available for call sessions - switching from in-memory fallback");
                _useInMemoryFallback = false;

                // Note: We don't sync old sessions as they're time-sensitive data
            }
            else if (!_useInMemoryFallback && !isCosmosAvailable)
            {
                _logger.LogWarning("CosmosDB is unavailable for call sessions - switching to in-memory fallback");
                _useInMemoryFallback = true;
            }

            _lastAvailabilityCheck = DateTime.UtcNow;
        }
        finally
        {
            _checkLock.Release();
        }
    }
}

/// <summary>
/// Cost snapshot repository with automatic fallback from CosmosDB to InMemory.
/// </summary>
public class FallbackCostSnapshotRepository : ICostSnapshotRepository
{
    private readonly CosmosCostSnapshotRepository _cosmosRepository;
    private readonly InMemoryCostSnapshotRepository _inMemoryRepository;
    private readonly ILogger<FallbackCostSnapshotRepository> _logger;
    private bool _useInMemoryFallback;
    private DateTime _lastAvailabilityCheck = DateTime.MinValue;
    private readonly TimeSpan _availabilityCheckInterval = TimeSpan.FromMinutes(5);
    private readonly SemaphoreSlim _checkLock = new(1, 1);

    public FallbackCostSnapshotRepository(
        CosmosCostSnapshotRepository cosmosRepository,
        InMemoryCostSnapshotRepository inMemoryRepository,
        ILogger<FallbackCostSnapshotRepository> logger)
    {
        _cosmosRepository = cosmosRepository;
        _inMemoryRepository = inMemoryRepository;
        _logger = logger;
    }

    public async Task<bool> IsAvailableAsync(CancellationToken cancellationToken = default)
    {
        await CheckAndUpdateAvailabilityAsync(cancellationToken);
        return true; // Always available due to fallback
    }

    public async Task<CostSnapshot?> GetAsync(CancellationToken cancellationToken = default)
    {
        var repository = await GetActiveRepositoryAsync(cancellationToken);
        return await repository.GetAsync(cancellationToken);
    }

    public async Task<CostSnapshot> UpsertAsync(CostSnapshot snapshot, CancellationToken cancellationToken = default)
    {
        var repository = await GetActiveRepositoryAsync(cancellationToken);
        await repository.UpsertAsync(snapshot, cancellationToken);

        // Also store in-memory when using CosmosDB for quick access
        if (!_useInMemoryFallback)
        {
            await _inMemoryRepository.UpsertAsync(snapshot, cancellationToken);
        }

        return snapshot;
    }

    private async Task<ICostSnapshotRepository> GetActiveRepositoryAsync(CancellationToken cancellationToken)
    {
        await CheckAndUpdateAvailabilityAsync(cancellationToken);
        return _useInMemoryFallback ? _inMemoryRepository : _cosmosRepository;
    }

    private async Task CheckAndUpdateAvailabilityAsync(CancellationToken cancellationToken)
    {
        if (DateTime.UtcNow - _lastAvailabilityCheck < _availabilityCheckInterval)
            return;

        await _checkLock.WaitAsync(cancellationToken);
        try
        {
            var isCosmosAvailable = await _cosmosRepository.IsAvailableAsync(cancellationToken);

            if (_useInMemoryFallback && isCosmosAvailable)
            {
                _logger.LogInformation("CosmosDB is now available for cost snapshot - switching from in-memory fallback");
                _useInMemoryFallback = false;
            }
            else if (!_useInMemoryFallback && !isCosmosAvailable)
            {
                _logger.LogWarning("CosmosDB is unavailable for cost snapshot - switching to in-memory fallback");
                _useInMemoryFallback = true;
            }

            _lastAvailabilityCheck = DateTime.UtcNow;
        }
        finally
        {
            _checkLock.Release();
        }
    }
}

/// <summary>
/// Fallback implementation for token snapshots with automatic CosmosDB availability checking.
/// Switches between CosmosDB and in-memory storage based on availability.
/// </summary>
internal class FallbackTokenSnapshotRepository : ITokenSnapshotRepository
{
    private readonly CosmosTokenSnapshotRepository _cosmosRepository;
    private readonly InMemoryTokenSnapshotRepository _inMemoryRepository;
    private readonly ILogger<FallbackTokenSnapshotRepository> _logger;

    private bool _useInMemoryFallback = false;
    private DateTime _lastAvailabilityCheck = DateTime.MinValue;
    private readonly TimeSpan _availabilityCheckInterval = TimeSpan.FromMinutes(5);
    private readonly SemaphoreSlim _checkLock = new(1, 1);

    public FallbackTokenSnapshotRepository(
        CosmosTokenSnapshotRepository cosmosRepository,
        InMemoryTokenSnapshotRepository inMemoryRepository,
        ILogger<FallbackTokenSnapshotRepository> logger)
    {
        _cosmosRepository = cosmosRepository;
        _inMemoryRepository = inMemoryRepository;
        _logger = logger;
    }

    public async Task<bool> IsAvailableAsync(CancellationToken cancellationToken = default)
    {
        var repository = await GetActiveRepositoryAsync(cancellationToken);
        return await repository.IsAvailableAsync(cancellationToken);
    }

    public async Task<TokenSnapshot?> GetAsync(CancellationToken cancellationToken = default)
    {
        var repository = await GetActiveRepositoryAsync(cancellationToken);
        return await repository.GetAsync(cancellationToken);
    }

    public async Task UpsertAsync(TokenSnapshot snapshot, CancellationToken cancellationToken = default)
    {
        var repository = await GetActiveRepositoryAsync(cancellationToken);
        await repository.UpsertAsync(snapshot, cancellationToken);

        // Also store in-memory when using CosmosDB for quick access
        if (!_useInMemoryFallback)
        {
            await _inMemoryRepository.UpsertAsync(snapshot, cancellationToken);
        }
    }

    private async Task<ITokenSnapshotRepository> GetActiveRepositoryAsync(CancellationToken cancellationToken)
    {
        await CheckAndUpdateAvailabilityAsync(cancellationToken);
        return _useInMemoryFallback ? _inMemoryRepository : _cosmosRepository;
    }

    private async Task CheckAndUpdateAvailabilityAsync(CancellationToken cancellationToken)
    {
        if (DateTime.UtcNow - _lastAvailabilityCheck < _availabilityCheckInterval)
            return;

        await _checkLock.WaitAsync(cancellationToken);
        try
        {
            var isCosmosAvailable = await _cosmosRepository.IsAvailableAsync(cancellationToken);

            if (_useInMemoryFallback && isCosmosAvailable)
            {
                _logger.LogInformation("CosmosDB is now available for token snapshot - switching from in-memory fallback");
                _useInMemoryFallback = false;
            }
            else if (!_useInMemoryFallback && !isCosmosAvailable)
            {
                _logger.LogWarning("CosmosDB is unavailable for token snapshot - switching to in-memory fallback");
                _useInMemoryFallback = true;
            }

            _lastAvailabilityCheck = DateTime.UtcNow;
        }
        finally
        {
            _checkLock.Release();
        }
    }
}
