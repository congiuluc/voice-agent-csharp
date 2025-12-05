using Microsoft.Azure.Cosmos;

namespace VoiceAgentCSharp.Features.Monitoring.Repositories;

/// <summary>
/// CosmosDB implementation of pricing repository.
/// </summary>
public class CosmosPricingRepository : IPricingRepository
{
    private readonly Container? _container;
    private readonly ILogger<CosmosPricingRepository> _logger;
    private readonly bool _isConfigured;

    public CosmosPricingRepository(
        IServiceProvider serviceProvider,
        IConfiguration configuration,
        ILogger<CosmosPricingRepository> logger)
    {
        _logger = logger;

        var cosmosClient = serviceProvider.GetService<CosmosClient>();
        _isConfigured = cosmosClient != null;

        if (cosmosClient == null)
        {
            _container = null;
            _logger.LogWarning("CosmosDB client not configured - CosmosPricingRepository will be unavailable");
            return;
        }

        var databaseName = configuration["CosmosDb:DatabaseName"] ?? "VoiceAgentMonitoring";
        var containerName = configuration["CosmosDb:PricingConfigContainer"] ?? "pricingConfig";

        _container = cosmosClient.GetContainer(databaseName, containerName);
    }

    public async Task<bool> IsAvailableAsync(CancellationToken cancellationToken = default)
    {
        if (!_isConfigured || _container == null)
            return false;

        try
        {
            await _container.ReadContainerAsync(cancellationToken: cancellationToken);
            return true;
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "CosmosDB pricing container not available");
            return false;
        }
    }

    public async Task<PricingConfig?> GetByModelNameAsync(string modelName, CancellationToken cancellationToken = default)
    {
        if (!_isConfigured || _container == null)
        {
            _logger.LogDebug("CosmosDB not configured - returning null");
            return null;
        }

        try
        {
            var response = await _container.ReadItemAsync<PricingConfig>(
                modelName,
                new PartitionKey(modelName),
                cancellationToken: cancellationToken);

            return response.Resource;
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            _logger.LogDebug("Pricing config not found for model: {ModelName}", modelName);
            return null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting pricing config for model: {ModelName}", modelName);
            throw;
        }
    }

    public async Task<List<PricingConfig>> GetAllAsync(CancellationToken cancellationToken = default)
    {
        if (!_isConfigured || _container == null)
        {
            _logger.LogDebug("CosmosDB not configured - returning empty list");
            return new List<PricingConfig>();
        }

        try
        {
            var query = _container.GetItemQueryIterator<PricingConfig>("SELECT * FROM c");
            var results = new List<PricingConfig>();

            while (query.HasMoreResults)
            {
                var response = await query.ReadNextAsync(cancellationToken);
                results.AddRange(response);
            }

            return results;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting all pricing configs");
            throw;
        }
    }

    public async Task UpsertAsync(PricingConfig config, CancellationToken cancellationToken = default)
    {
        if (!_isConfigured || _container == null)
        {
            _logger.LogDebug("CosmosDB not configured - skipping upsert");
            return;
        }

        try
        {
            config.UpdatedAt = DateTime.UtcNow;
            await _container.UpsertItemAsync(
                config,
                new PartitionKey(config.ModelName),
                cancellationToken: cancellationToken);

            _logger.LogInformation("Upserted pricing config for model: {ModelName}", config.ModelName);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error upserting pricing config for model: {ModelName}", config.ModelName);
            throw;
        }
    }

    public async Task DeleteAsync(string modelName, CancellationToken cancellationToken = default)
    {
        if (!_isConfigured || _container == null)
        {
            _logger.LogDebug("CosmosDB not configured - skipping delete");
            return;
        }

        try
        {
            await _container.DeleteItemAsync<PricingConfig>(
                modelName,
                new PartitionKey(modelName),
                cancellationToken: cancellationToken);

            _logger.LogInformation("Deleted pricing config for model: {ModelName}", modelName);
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            _logger.LogDebug("Pricing config not found for deletion: {ModelName}", modelName);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deleting pricing config for model: {ModelName}", modelName);
            throw;
        }
    }
}
