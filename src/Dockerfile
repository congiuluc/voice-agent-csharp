# Build stage
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /source

# Copy csproj and restore dependencies
# Copy csproj and NuGet config then restore dependencies
COPY NuGet.Config ./
COPY *.csproj ./
# Ensure NuGet uses Linux-friendly packages folder inside the container
ENV NUGET_PACKAGES=/root/.nuget/packages
RUN dotnet restore

# Copy everything else and build
COPY . ./
RUN dotnet publish -c Release -o /app

# Runtime stage - use Alpine for smaller image
FROM mcr.microsoft.com/dotnet/aspnet:10.0-alpine
WORKDIR /app

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
