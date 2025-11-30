# Build stage
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS builder
WORKDIR /build

# Copy project file
COPY mcp-server.csproj .

# Restore packages
RUN dotnet restore

# Copy source files
COPY *.cs ./
COPY Tools/ ./Tools/

# Build release
RUN dotnet build -c Release --no-restore

# Publish
RUN dotnet publish -c Release --no-restore -o /app/publish

# Runtime stage
FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine
WORKDIR /app

# Copy published files from builder
COPY --from=builder /app/publish .

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:5001/health || exit 1

# Expose port
EXPOSE 5001

# Run the application
ENTRYPOINT ["dotnet", "mcp-server.dll"]
