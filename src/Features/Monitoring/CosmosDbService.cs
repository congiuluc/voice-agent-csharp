using Microsoft.Azure.Cosmos;

namespace VoiceAgentCSharp.Features.Monitoring;

/// <summary>
/// Service for interacting with CosmosDB for call monitoring.
/// </summary>
public interface ICosmosDbService
{
    /// <summary>
    /// Writes call sessions to CosmosDB in batch.
    /// </summary>
    Task WriteBatchAsync(IEnumerable<CallSession> sessions, CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets pricing configuration for a specific model.
    /// </summary>
    Task<PricingConfig?> GetPricingConfigAsync(string modelName, CancellationToken cancellationToken = default);

    /// <summary>
    /// Gets all pricing configurations.
    /// </summary>
    Task<List<PricingConfig>> GetAllPricingConfigsAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Updates a pricing configuration.
    /// </summary>
    Task UpsertPricingConfigAsync(PricingConfig config, CancellationToken cancellationToken = default);
}

/// <summary>
/// Implementation of CosmosDB service for call monitoring.
/// </summary>
public class CosmosDbService : ICosmosDbService
{
    private readonly Container? _callSessionsContainer;
    private readonly Container? _pricingConfigContainer;
    private readonly ILogger<CosmosDbService> _logger;
    private readonly bool _isConfigured;

    public CosmosDbService(
        IServiceProvider serviceProvider,
        IConfiguration configuration,
        ILogger<CosmosDbService> logger)
    {
        _logger = logger;
        
        // Try to get the CosmosClient, which may not be registered
        var cosmosClient = serviceProvider.GetService(typeof(CosmosClient)) as CosmosClient;
        _isConfigured = cosmosClient != null;

        if (cosmosClient == null)
        {
            _callSessionsContainer = null;
            _pricingConfigContainer = null;
            _logger.LogWarning("CosmosDB client is not configured - data persistence will be disabled");
            return;
        }

        var databaseName = configuration["CosmosDb:DatabaseName"] ?? "VoiceAgentMonitoring";
        var callSessionsContainerName = configuration["CosmosDb:CallSessionsContainer"] ?? "callSessions";
        var pricingConfigContainerName = configuration["CosmosDb:PricingConfigContainer"] ?? "pricingConfig";

        _callSessionsContainer = cosmosClient.GetContainer(databaseName, callSessionsContainerName);
        _pricingConfigContainer = cosmosClient.GetContainer(databaseName, pricingConfigContainerName);
    }

    public async Task WriteBatchAsync(IEnumerable<CallSession> sessions, CancellationToken cancellationToken = default)
    {
        if (!_isConfigured || _callSessionsContainer == null)
        {
            _logger.LogDebug("CosmosDB not configured - skipping batch write");
            return;
        }

        var tasks = sessions.Select(session => 
            _callSessionsContainer.UpsertItemAsync(
                session, 
                new PartitionKey(session.UserId),
                cancellationToken: cancellationToken));

        await Task.WhenAll(tasks);
        _logger.LogInformation("Written {Count} call sessions to CosmosDB", sessions.Count());
    }

    public async Task<PricingConfig?> GetPricingConfigAsync(string modelName, CancellationToken cancellationToken = default)
    {
        if (!_isConfigured || _pricingConfigContainer == null)
        {
            _logger.LogDebug("CosmosDB not configured - returning null for pricing config");
            return null;
        }

        try
        {
            var response = await _pricingConfigContainer.ReadItemAsync<PricingConfig>(
                modelName,
                new PartitionKey(modelName),
                cancellationToken: cancellationToken);

            return response.Resource;
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            _logger.LogWarning("Pricing config not found for model: {ModelName}", modelName);
            return null;
        }
    }

    public async Task<List<PricingConfig>> GetAllPricingConfigsAsync(CancellationToken cancellationToken = default)
    {
        if (!_isConfigured || _pricingConfigContainer == null)
        {
            _logger.LogDebug("CosmosDB not configured - returning empty list for pricing configs");
            return new List<PricingConfig>();
        }

        var query = _pricingConfigContainer.GetItemQueryIterator<PricingConfig>(
            "SELECT * FROM c");

        var results = new List<PricingConfig>();
        while (query.HasMoreResults)
        {
            var response = await query.ReadNextAsync(cancellationToken);
            results.AddRange(response);
        }

        return results;
    }

    public async Task UpsertPricingConfigAsync(PricingConfig config, CancellationToken cancellationToken = default)
    {
        if (!_isConfigured || _pricingConfigContainer == null)
        {
            _logger.LogDebug("CosmosDB not configured - skipping pricing config upsert");
            return;
        }

        await _pricingConfigContainer.UpsertItemAsync(
            config,
            new PartitionKey(config.ModelName),
            cancellationToken: cancellationToken);

        _logger.LogInformation("Upserted pricing config for model: {ModelName}", config.ModelName);
    }
}
