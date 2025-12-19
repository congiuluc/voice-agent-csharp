# Build stage
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /source

# Copy NuGet config first
COPY src/NuGet.Config ./

# Copy the aspire ServiceDefaults project (referenced by main project)
COPY aspire/voice-agent-csharp.ServiceDefaults/voice-agent-csharp.ServiceDefaults.csproj ./aspire/voice-agent-csharp.ServiceDefaults/

# Copy main project csproj
COPY src/VoiceAgentCSharp.csproj ./src/

# Ensure NuGet uses Linux-friendly packages folder inside the container
ENV NUGET_PACKAGES=/root/.nuget/packages

# Restore from src folder
WORKDIR /source/src
RUN dotnet restore

# Copy aspire ServiceDefaults source files
WORKDIR /source
COPY aspire/voice-agent-csharp.ServiceDefaults/ ./aspire/voice-agent-csharp.ServiceDefaults/

# Copy main project source files
COPY src/ ./src/

# Build from src folder
WORKDIR /source/src
RUN dotnet publish -c Release -o /app

# Runtime stage - use Alpine for smaller image
FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine
WORKDIR /app

# Install ICU libraries for globalization support
RUN apk add --no-cache icu-libs
ENV DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=false

# Copy published app
COPY --from=build /app ./

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Expose port
EXPOSE 8080

# Set environment variables
ENV ASPNETCORE_URLS=http://+:8080
ENV ASPNETCORE_ENVIRONMENT=Production

# Run the application
ENTRYPOINT ["dotnet", "VoiceAgentCSharp.dll"]
