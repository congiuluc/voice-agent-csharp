var builder = DistributedApplication.CreateBuilder(args);

// The generated ProjectMetadata classes use project-based names (see obj/Debug/net10.0/Aspire/references)
// Reference the actual generated types here. Use the mcp_server project as a dependency for the web frontend.
var mcp = builder.AddProject<Projects.mcp_server>("mcp");

var web = builder.AddProject<Projects.VoiceAgentCSharp>("web")
    .WithExternalHttpEndpoints()
    .WithReference(mcp)
    .WaitFor(mcp)
    .WithEnvironment("McpServer__Url", mcp.GetEndpoint("http"));

builder.Build().Run();
