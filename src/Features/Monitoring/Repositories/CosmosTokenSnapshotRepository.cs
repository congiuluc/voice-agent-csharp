using Microsoft.Azure.Cosmos;

namespace VoiceAgentCSharp.Features.Monitoring.Repositories;

/// <summary>
/// CosmosDB implementation of token snapshot persistence.
/// </summary>
public class CosmosTokenSnapshotRepository : ITokenSnapshotRepository
{
    private readonly Container? _container;
    private readonly ILogger<CosmosTokenSnapshotRepository> _logger;
    private bool _isConfigured;

    public CosmosTokenSnapshotRepository(
        CosmosClient? cosmosClient,
        IConfiguration configuration,
        ILogger<CosmosTokenSnapshotRepository> logger)
    {
        _logger = logger;
        _isConfigured = cosmosClient != null;

        if (cosmosClient == null)
        {
            _logger.LogWarning("CosmosDB client not configured - CosmosTokenSnapshotRepository will be unavailable");
            _container = null;
            return;
        }

        try
        {
            var databaseName = configuration["CosmosDb:DatabaseName"] ?? "VoiceAgentMonitoring";
            var containerName = configuration["CosmosDb:TokenSnapshotContainer"] ?? "tokenSnapshots";
            var database = cosmosClient.GetDatabase(databaseName);
            _container = database.GetContainer(containerName);
            _logger.LogInformation("CosmosTokenSnapshotRepository initialized with container: {ContainerName}", containerName);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to initialize CosmosTokenSnapshotRepository");
            _isConfigured = false;
            _container = null;
        }
    }

    public async Task<TokenSnapshot?> GetAsync(CancellationToken cancellationToken = default)
    {
        if (!_isConfigured || _container == null)
        {
            _logger.LogWarning("CosmosTokenSnapshotRepository not configured - cannot retrieve token snapshot");
            return null;
        }

        try
        {
            var response = await _container.ReadItemAsync<TokenSnapshot>(
                id: "token-snapshot",
                partitionKey: new PartitionKey("TokenSnapshot"),
                cancellationToken: cancellationToken);

            return response.Resource;
        }
        catch (CosmosException ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
        {
            _logger.LogInformation("Token snapshot not found in CosmosDB - will create new one");
            return null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error retrieving token snapshot from CosmosDB");
            throw;
        }
    }

    public async Task UpsertAsync(TokenSnapshot snapshot, CancellationToken cancellationToken = default)
    {
        if (!_isConfigured || _container == null)
        {
            _logger.LogWarning("CosmosTokenSnapshotRepository not configured - cannot persist token snapshot");
            return;
        }

        try
        {
            snapshot.LastUpdated = DateTime.UtcNow;
            await _container.UpsertItemAsync(snapshot, new PartitionKey("TokenSnapshot"), cancellationToken: cancellationToken);
            _logger.LogDebug("Token snapshot persisted to CosmosDB");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error upserting token snapshot to CosmosDB");
            throw;
        }
    }

    public Task<bool> IsAvailableAsync(CancellationToken cancellationToken = default)
    {
        return Task.FromResult(_isConfigured && _container != null);
    }
}
