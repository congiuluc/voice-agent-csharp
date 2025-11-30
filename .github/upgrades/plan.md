# .NET 10 Upgrade Plan

## Execution Steps

Execute steps below sequentially one by one in the order they are listed.

1. Validate that an .NET 10.0 SDK required for this upgrade is installed on the machine and if not, help to get it installed.
2. Ensure that the SDK version specified in global.json files is compatible with the .NET 10.0 upgrade.
3. Upgrade `src/VoiceAgentCSharp.csproj`
4. Run unit tests to validate upgrade in the projects listed below:

   (No test projects detected in initial analysis)

## Settings

### Excluded projects

| Project name                                   | Description                 |
|:-----------------------------------------------|:---------------------------:|

### Aggregate NuGet packages modifications across all projects

| Package Name                        | Current Version | New Version | Description                                   |
|:------------------------------------|:---------------:|:-----------:|:----------------------------------------------|
| Azure.AI.Projects                   |   1.0.0         |             | Leave as-is unless compatibility issues found |
| Azure.AI.VoiceLive                  |   1.0.0         |             | Leave as-is unless compatibility issues found |
| Azure.Communication.CallAutomation  |   1.4.0         |             | Leave as-is unless compatibility issues found |
| Azure.Identity                      |  1.17.0         |             | Leave as-is unless compatibility issues found |
| Azure.Messaging.EventGrid           |  4.28.0         |             | Leave as-is unless compatibility issues found |
| Microsoft.ApplicationInsights.AspNetCore | 2.23.0    |             | Leave as-is unless compatibility issues found |
| Microsoft.Extensions.Azure          |  1.7.6          |             | Leave as-is unless compatibility issues found |
| Serilog.AspNetCore                  |  7.0.0          |             | Leave as-is unless compatibility issues found |
| Serilog.Sinks.ApplicationInsights   |  3.1.0          |             | Leave as-is unless compatibility issues found |
| Serilog.Sinks.Console               |  5.0.1          |             | Leave as-is unless compatibility issues found |
| Serilog.Sinks.File                  |  5.0.0          |             | Leave as-is unless compatibility issues found |

### Project upgrade details

#### src/VoiceAgentCSharp.csproj modifications

Project properties changes:
  - Target framework should be changed from `net9.0` to `net10.0`

NuGet packages changes:
  - No package upgrades are required by default; perform compatibility testing and update specific packages if runtime or build issues appear.

Feature upgrades:
  - None discovered automatically. After the target framework change, build and run the app to detect API or runtime issues and address them per error messages.

Other changes:
  - Add or update `global.json` only if you want to pin SDK to `10.0.100` for CI consistency. Otherwise leave it unset to allow newer SDKs.
