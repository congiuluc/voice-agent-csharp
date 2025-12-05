using Microsoft.Azure.Cosmos;

namespace VoiceAgentCSharp.Features.Monitoring.Repositories;

/// <summary>
/// CosmosDB implementation of call session repository.
/// </summary>
public class CosmosCallSessionRepository : ICallSessionRepository
{
    private readonly Container? _container;
    private readonly ILogger<CosmosCallSessionRepository> _logger;
    private readonly bool _isConfigured;

    public CosmosCallSessionRepository(
        IServiceProvider serviceProvider,
        IConfiguration configuration,
        ILogger<CosmosCallSessionRepository> logger)
    {
        _logger = logger;

        var cosmosClient = serviceProvider.GetService<CosmosClient>();
        _isConfigured = cosmosClient != null;

        if (cosmosClient == null)
        {
            _container = null;
            _logger.LogWarning("CosmosDB client not configured - CosmosCallSessionRepository will be unavailable");
            return;
        }

        var databaseName = configuration["CosmosDb:DatabaseName"] ?? "VoiceAgentMonitoring";
        var containerName = configuration["CosmosDb:CallSessionsContainer"] ?? "callSessions";

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
            _logger.LogWarning(ex, "CosmosDB call sessions container not available");
            return false;
        }
    }

    public async Task WriteBatchAsync(IEnumerable<CallSession> sessions, CancellationToken cancellationToken = default)
    {
        if (!_isConfigured || _container == null)
        {
            _logger.LogDebug("CosmosDB not configured - skipping batch write");
            return;
        }

        try
        {
            var tasks = sessions.Select(session =>
                _container.UpsertItemAsync(
                    session,
                    new PartitionKey(session.UserId),
                    cancellationToken: cancellationToken));

            await Task.WhenAll(tasks);
            _logger.LogInformation("Written {Count} call sessions to CosmosDB", sessions.Count());
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error writing batch of call sessions");
            throw;
        }
    }

    public async Task<CallSession?> GetByIdAsync(string sessionId, string userId, CancellationToken cancellationToken = default)
    {
        if (!_isConfigured || _container == null)
        {
            _logger.LogDebug("CosmosDB not configured - returning null");
            return null;
        }

        try
        {
            var query = _container.GetItemQueryIterator<CallSession>(
                new QueryDefinition("SELECT * FROM c WHERE c.sessionId = @sessionId")
                    .WithParameter("@sessionId", sessionId),
                requestOptions: new QueryRequestOptions { PartitionKey = new PartitionKey(userId) });

            if (query.HasMoreResults)
            {
                var response = await query.ReadNextAsync(cancellationToken);
                return response.FirstOrDefault();
            }

            return null;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting call session: {SessionId}", sessionId);
            throw;
        }
    }

    public async Task<List<CallSession>> GetByUserIdAsync(string userId, int limit = 100, CancellationToken cancellationToken = default)
    {
        if (!_isConfigured || _container == null)
        {
            _logger.LogDebug("CosmosDB not configured - returning empty list");
            return new List<CallSession>();
        }

        try
        {
            var query = _container.GetItemQueryIterator<CallSession>(
                new QueryDefinition("SELECT TOP @limit * FROM c ORDER BY c.createdAt DESC")
                    .WithParameter("@limit", limit),
                requestOptions: new QueryRequestOptions { PartitionKey = new PartitionKey(userId) });

            var results = new List<CallSession>();
            while (query.HasMoreResults)
            {
                var response = await query.ReadNextAsync(cancellationToken);
                results.AddRange(response);
            }

            return results;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting call sessions for user: {UserId}", userId);
            throw;
        }
    }

    public async Task<List<CallSession>> GetRecentAsync(int limit = 100, CancellationToken cancellationToken = default)
    {
        if (!_isConfigured || _container == null)
        {
            _logger.LogDebug("CosmosDB not configured - returning empty list");
            return new List<CallSession>();
        }

        try
        {
            var query = _container.GetItemQueryIterator<CallSession>(
                new QueryDefinition("SELECT TOP @limit * FROM c ORDER BY c.createdAt DESC")
                    .WithParameter("@limit", limit));

            var results = new List<CallSession>();
            while (query.HasMoreResults)
            {
                var response = await query.ReadNextAsync(cancellationToken);
                results.AddRange(response);
            }

            return results;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error getting recent call sessions");
            throw;
        }
    }
}
