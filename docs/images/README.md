# Architecture Overview

This directory contains images for the README documentation.

## Required Images

Please add the following images:

1. **architecture-overview.png** - Main architecture diagram showing:
   - Client layer (Web Browser, PSTN Phone, WebRTC Avatar)
   - Voice Agent C# Application components
   - Azure services (Voice Live API, AI Foundry, ACS)
   - MCP Server integration

## Creating the Architecture Diagram

You can create the diagram using:
- [draw.io](https://draw.io)
- [Mermaid](https://mermaid.js.org/)
- [Excalidraw](https://excalidraw.com/)
- PowerPoint/Visio

### Suggested Components to Include

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Client Layer                                     │
├─────────────────┬─────────────────┬─────────────────┬───────────────────────┤
│   Web Browser   │  PSTN Phone     │   WebRTC        │                       │
│   (Microphone)  │  (ACS)          │   (Avatar)      │                       │
└────────┬────────┴────────┬────────┴────────┬────────┴───────────────────────┘
         │                 │                 │
         │ WebSocket       │ Media Stream    │ WebRTC
         │                 │                 │
┌────────▼─────────────────▼─────────────────▼────────────────────────────────┐
│                        Voice Agent C# Application                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐ │
│  │   Voice      │  │   Voice      │  │   Voice      │  │   Incoming Call  │ │
│  │   Assistant  │  │   Agent      │  │   Avatar     │  │   Handler (ACS)  │ │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────────┘ │
└────────────────────────────────────┬────────────────────────────────────────┘
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         │                           │                           │
         ▼                           ▼                           ▼
┌─────────────────┐    ┌─────────────────────────┐    ┌─────────────────────┐
│  MCP Server     │    │   Azure Voice Live API  │    │  Azure AI Foundry   │
│  (Tools)        │    │   (ASR + LLM + TTS)     │    │  (Agents)           │
└─────────────────┘    └─────────────────────────┘    └─────────────────────┘
```
