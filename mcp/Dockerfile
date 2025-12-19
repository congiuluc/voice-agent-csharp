# Build stage
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS builder
WORKDIR /source

# Copy the aspire ServiceDefaults project (referenced by mcp project)
COPY aspire/voice-agent-csharp.ServiceDefaults/voice-agent-csharp.ServiceDefaults.csproj ./aspire/voice-agent-csharp.ServiceDefaults/

# Copy mcp project file
COPY mcp/mcp-server.csproj ./mcp/

# Restore packages from mcp folder
WORKDIR /source/mcp
RUN dotnet restore

# Copy aspire ServiceDefaults source files
WORKDIR /source
COPY aspire/voice-agent-csharp.ServiceDefaults/ ./aspire/voice-agent-csharp.ServiceDefaults/

# Copy mcp source files
COPY mcp/ ./mcp/

# Build and publish from mcp folder
WORKDIR /source/mcp
RUN dotnet publish -c Release -o /app/publish

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine
WORKDIR /app

# Install ICU libraries for globalization support
RUN apk add --no-cache icu-libs
ENV DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=false

# Copy published files from builder
COPY --from=builder /app/publish .

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:5001/health || exit 1

# Expose port
EXPOSE 5001

# Run the application
ENTRYPOINT ["dotnet", "mcp-server.dll"]
