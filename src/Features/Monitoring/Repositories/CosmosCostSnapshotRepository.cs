using Microsoft.Azure.Cosmos;

namespace VoiceAgentCSharp.Features.Monitoring.Repositories;

/// <summary>
/// CosmosDB implementation of cost snapshot repository.
/// </summary>
public class CosmosCostSnapshotRepository : ICostSnapshotRepository
{
    private readonly Container? _container;
    private readonly ILogger<CosmosCostSnapshotRepository> _logger;

    public CosmosCostSnapshotRepository(
        CosmosClient? cosmosClient,
        IConfiguration configuration,
        ILogger<CosmosCostSnapshotRepository> logger)
    {
        _logger = logger;

        if (cosmosClient == null)
        {
            _logger.LogWarning("CosmosDB client not configured - CosmosCostSnapshotRepository will be unavailable");
            return;
        }

        try
        {
            var databaseName = configuration["CosmosDb:DatabaseName"] ?? "VoiceAgentMonitoring";
            var containerName = configuration["CosmosDb:CostSnapshotContainer"] ?? "costSnapshots";
            var database = cosmosClient.GetDatabase(databaseName);
            _container = database.GetContainer(containerName);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "CosmosDB cost snapshot container not available");
        }
    }

    public async Task<CostSnapshot?> GetAsync(CancellationToken cancellationToken = default)
    {
        if (_container == null)
        {
            _logger.LogDebug("CosmosDB not configured - returning null");
            return null;
        }

        try
        {
            var response = await _container.ReadItemAsync<CostSnapshot>(
                id: "cost-snapshot",
                partitionKey: new PartitionKey("CostSnapshot"),
                cancellationToken: cancellationToken);

            return response.Resource;
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            // Document doesn't exist yet
            return null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error reading cost snapshot from CosmosDB");
            return null;
        }
    }

    public async Task<CostSnapshot> UpsertAsync(CostSnapshot snapshot, CancellationToken cancellationToken = default)
    {
        if (_container == null)
        {
            _logger.LogDebug("CosmosDB not configured - returning snapshot in-memory only");
            return snapshot;
        }

        try
        {
            snapshot.LastUpdated = DateTime.UtcNow;
            
            var response = await _container.UpsertItemAsync(
                snapshot,
                partitionKey: new PartitionKey(snapshot.Type),
                cancellationToken: cancellationToken);

            _logger.LogDebug("Cost snapshot upserted to CosmosDB. Total cost: ${Cost:F4}", snapshot.TotalCost);
            return response.Resource;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error upserting cost snapshot to CosmosDB");
            return snapshot;
        }
    }

    public async Task<bool> IsAvailableAsync(CancellationToken cancellationToken = default)
    {
        if (_container == null)
            return false;

        try
        {
            await _container.ReadContainerAsync(cancellationToken: cancellationToken);
            return true;
        }
        catch
        {
            return false;
        }
    }
}
