# Voice Assistant - Diagramma di Flusso

## 1. Diagramma Generale del Flusso

```mermaid
graph TD
    A["Client"] -->|WebSocket| B["VoiceMediaHandler"]
    B -->|Handle Connection| C{Session Type?}
    
    C -->|Voice WebSocket| D["Voice Session"]
    C -->|Web WebSocket| E["Web Session"]
    C -->|Avatar WebSocket| F["Avatar Session"]
    
    D --> G["WaitForInitialConfig<br/>3s timeout"]
    E --> G
    F --> G
    
    G -->|Config Received| H["Use Client Settings"]
    G -->|Timeout| I["Use Server Settings"]
    
    H --> J["InitializeVoiceLiveConnection"]
    I --> J
    
    J --> K["VoiceSessionFactory<br/>CreateSessionAsync"]
    K --> L{Routing Decision}
    
    L -->|FoundryAgentId| M["VoiceAgentSession"]
    L -->|Default| N["VoiceAssistantSession"]
    L -->|Avatar| O["VoiceAvatarSession"]
    
    M --> P["StartAsync"]
    N --> P
    O --> P
    
    P --> Q["Initialize MCP"]
    Q --> R["StartSession<br/>with Model/Agent"]
    R --> S["ProcessEventsAsync"]
    S --> T["Ready & Listening"]
    
    T --> U["Media Streaming<br/>Audio/Text Flow"]
```

## 2. Flusso Dettagliato della Sessione Voice Assistant

```mermaid
graph TD
    A["StartAsync"] --> B["InitializeMcpAsync"]
    B --> C["_client.StartSessionAsync<br/>Model: gpt-4o,gpt-4-turbo,etc"]
    C --> D["UpdateSessionAsync"]
    
    D --> E["Create AzureStandardVoice<br/>Temperature: 0.7<br/>Locale: en-US"]
    E --> F["Create ServerVadTurnDetection<br/>Threshold: 0.3<br/>SilenceDuration: 300ms"]
    
    F --> G["Build Session Instructions"]
    G --> H["Add Welcome Message<br/>if provided"]
    
    H --> I["ConfigureSessionAsync"]
    I --> J{Welcome Message?}
    J -->|Yes| K["StartResponseAsync<br/>Greet User"]
    J -->|No| L["Wait for User Input"]
    
    K --> M["ProcessEventsAsync<br/>Background Task"]
    L --> M
    
    M --> N["ReceiveMessagesAsync"]
    N --> O{Message Type?}
    
    O -->|Audio| P["SendAudioAsync<br/>BinaryData"]
    O -->|Text| Q["SendTextAsync<br/>AddItemAsync"]
    O -->|Tool Call| R["Execute Tool<br/>via MCP/Built-in"]
    
    P --> S["Send to Voice Live"]
    Q --> S
    R --> S
    
    S --> T["Receive Response<br/>Audio/Text/Tool"]
    T --> U["Send to Client<br/>via WebSocket"]
    U --> N
```

## 3. Flusso delle Connessioni WebSocket

```mermaid
graph TD
    A["Client WebSocket Connect"] --> B["HandleWebWebSocketAsync"]
    B --> C["WaitForInitialConfigAsync<br/>3 second timeout"]
    
    C --> D{Config Message?}
    D -->|Received| E["Parse ConfigMessage"]
    D -->|Timeout| F["Skip - Use Server Config"]
    
    E --> G["Extract Client Settings<br/>- VoiceModel<br/>- Voice<br/>- WelcomeMessage<br/>- ModelInstructions<br/>- Locale<br/>- FoundryAgentId"]
    
    G --> H["InitializeVoiceLiveConnectionAsync"]
    F --> H
    
    H --> I["Get Config Values<br/>from Client or Server"]
    I --> J["Create VoiceSessionConfig"]
    J --> K["_sessionFactory.CreateSessionAsync"]
    
    K --> L{"Has FoundryAgentId?"}
    L -->|Yes| M["CreateVoiceAgentSession"]
    L -->|No| N["CreateVoiceAssistantSession"]
    
    M --> O["await session.StartAsync"]
    N --> O
    
    O --> P["ProcessEventsAsync<br/>Background Processing"]
    P --> Q["ReceiveMessagesAsync<br/>Listen for Messages"]
    
    Q --> R{Message Type?}
    R -->|Text| S["ProcessWebMessageAsync"]
    R -->|Close| T["Clean Up Session"]
    
    S --> U["Parse JSON Message<br/>Kind: Message/Config/etc"]
    U --> V{Kind Type?}
    
    V -->|Config| W["ReinitializeVoiceLiveConnection"]
    V -->|Message/Text| X["Forward to Voice Live"]
    V -->|Other| Y["Handle Special Messages"]
    
    W --> Z["Stop Current Session"]
    Z --> AA["Create New Session<br/>with New Config"]
    AA --> AB["ProcessEventsAsync"]
    
    X --> AC["Send Audio/Text<br/>to Voice Live"]
    Y --> AC
    
    AC --> AD["Receive Response"]
    AD --> AE["Send via WebSocket<br/>to Client"]
    AE --> Q
```

## 4. Flusso di Elaborazione Audio

```mermaid
graph TD
    A["Audio Data from Client"] --> B["ProcessWebMessageAsync"]
    B --> C["Parse Binary Audio<br/>PCM16 Format"]
    C --> D{Message Type?}
    
    D -->|Audio Data| E["Extract Audio Bytes"]
    E --> F["SendAudioAsync"]
    F --> G["BinaryData.FromBytes"]
    G --> H["_session.SendInputAudioAsync"]
    H --> I["Voice Live API"]
    
    I --> J["Voice Live<br/>Processing"]
    J --> K["Generate Response"]
    K --> L{Response Type?}
    
    L -->|Audio| M["OutputAudio Event"]
    L -->|Text| N["TranscriptItem Event"]
    L -->|Tool Call| O["ToolCall Event"]
    
    M --> P["Send Audio to Client<br/>via WebSocket"]
    N --> Q["Send Transcript<br/>to Client"]
    O --> R["Execute Tool<br/>Get Result<br/>Send to Voice Live"]
    
    P --> S["Client Output"]
    Q --> S
    R --> T["ProcessEventsAsync<br/>Continue"]
    T --> K
```

## 5. Flusso dei Messaggi da Client a Voice Live

```mermaid
sequenceDiagram
    participant Client
    participant WebSocket as VoiceMediaHandler
    participant Factory as VoiceSessionFactory
    participant Session as VoiceAssistantSession
    participant API as Voice Live API

    Client->>WebSocket: WebSocket Connect
    WebSocket->>WebSocket: WaitForInitialConfig<br/>3s timeout
    
    alt Config Message Received
        Client->>WebSocket: ConfigMessage<br/>(Model, Voice, etc)
        WebSocket->>WebSocket: Store Client Settings
    else Timeout
        WebSocket->>WebSocket: Use Server Config
    end
    
    WebSocket->>Factory: CreateSessionAsync
    Factory->>Session: new VoiceAssistantSession
    WebSocket->>Session: StartAsync
    Session->>API: StartSessionAsync<br/>with Model
    API-->>Session: Session Handle
    
    Session->>API: ConfigureSessionAsync<br/>Voice + Instructions
    Session->>Session: ProcessEventsAsync<br/>Background
    Session->>WebSocket: Ready
    
    Client->>WebSocket: Audio/Text Message
    WebSocket->>Session: SendAudioAsync/SendTextAsync
    Session->>API: SendInputAudioAsync
    
    API-->>Session: Response Events
    Session->>WebSocket: OutputAudio/Transcript
    WebSocket->>Client: WebSocket Message
```

## 6. Flusso di Ricezione Messaggi Voice Live

```mermaid
graph TD
    A["ProcessEventsAsync<br/>Background Task"] --> B["Connect to Voice Live<br/>WebSocket"]
    B --> C["Receive Messages<br/>Loop"]
    
    C --> D{Message Type?}
    
    D -->|response.audio_delta| E["Audio Output"]
    D -->|response.text_delta| F["Text Output"]
    D -->|response.tool_calls| G["Tool Call"]
    D -->|response.done| H["Response Complete"]
    
    E --> I["Add to Buffer"]
    I --> J["Send Audio Frame<br/>to Client WebSocket"]
    
    F --> K["Add to Transcript"]
    K --> L["Send Text Message<br/>to Client WebSocket"]
    
    G --> M["Parse Tool Definition"]
    M --> N["Execute Tool<br/>via MCP/Built-in"]
    N --> O["Get Tool Result"]
    O --> P["_session.SubmitToolResultAsync"]
    
    H --> Q["Reset Buffers"]
    Q --> R["Log Summary"]
    R --> C
    
    J --> C
    L --> C
    P --> C
```

## 7. Flusso Chiamate in Entrata (Incoming Call - ACS)

```mermaid
graph TD
    A["Phone Call Incoming"] --> B["EventGrid Event<br/>ACS"]
    B --> C["IncomingCallHandler<br/>ProcessIncomingCallAsync"]
    
    C --> D["Extract Caller ID<br/>from Event"]
    D --> E["Build Callback URI<br/>for Events"]
    E --> F["Build WebSocket URI<br/>wss://host/acs/ws"]
    
    F --> G["Create MediaStreamingOptions<br/>Audio Channel: Mixed<br/>Format: PCM24KMono<br/>Bidirectional: true"]
    
    G --> H["AnswerCallOptions<br/>with Streaming Config"]
    H --> I["_acsClient.AnswerCallAsync"]
    
    I --> J["Call Answered<br/>Media Streaming Started"]
    
    J --> K["EventGrid Callback<br/>CallConnected Event"]
    K --> L["ProcessCallbackEventsAsync"]
    
    L --> M["HandleCallConnectedAsync<br/>Log Connection Details"]
    M --> N["MediaStreamingStarted<br/>Event"]
    
    N --> O["VoiceMediaHandler<br/>HandleWebWebSocketAsync<br/>Raw Audio Mode"]
    
    O --> P["WaitForInitialConfig<br/>Timeout expected<br/>Use Server Config"]
    P --> Q["Create Voice Session<br/>with Phone Settings"]
    
    Q --> R["Exchange Audio<br/>Phone ↔ Voice Live"]
    R --> S["End Call"]
    S --> T["MediaStreamingStopped<br/>Event"]
```

## 8. Flusso Avatar (con WebRTC)

```mermaid
graph TD
    A["Avatar WebSocket Connect"] --> B["HandleAvatarWebSocketAsync"]
    B --> C["WaitForInitialConfig"]
    
    C --> D["InitializeAvatarConnectionAsync"]
    D --> E["Create VoiceAvatarSession<br/>with WebRTC Support"]
    
    E --> F["Register in<br/>_activeAvatarSessions"]
    F --> G["Send AvatarConnectionId<br/>to Client"]
    
    G --> H["Client Stores ConnectionId"]
    H --> I["Audio + WebRTC<br/>Concurrent Streams"]
    
    I --> J["Client Sends<br/>WebRTC SDP Offer"]
    J --> K["REST Endpoint<br/>/avatar/offer"]
    
    K --> L["ProcessAvatarOfferAsync"]
    L --> M["_avatarSession<br/>ConnectAvatarAsync"]
    
    M --> N["Send SDP Offer<br/>to Avatar API"]
    N --> O["Avatar API<br/>Processes Offer"]
    O --> P["Generate SDP Answer"]
    
    P --> Q["Return Answer<br/>to REST Endpoint"]
    Q --> R["Send to Client<br/>via REST Response"]
    
    R --> S["Client Establishes<br/>WebRTC Connection"]
    S --> T["Avatar Video Starts"]
    
    T --> U["Audio WebSocket<br/>+ Video WebRTC<br/>Concurrent"]
```

## 9. Stato e Transizioni delle Sessioni

```mermaid
stateDiagram-v2
    [*] --> Initialized: Create Session Config
    
    Initialized --> InitMCP: InitializeMcpAsync
    InitMCP --> StartSession: _client.StartSessionAsync
    
    StartSession --> ConfigSession: UpdateSessionAsync
    ConfigSession --> ProcessEvents: Start ProcessEventsAsync
    
    ProcessEvents --> Ready: Session Ready
    Ready --> Streaming: Audio/Text Streaming
    
    Streaming --> ToolExecution: Tool Call Received
    ToolExecution --> Streaming: Tool Result Submitted
    
    Streaming --> ConfigChanged: New Config Received
    ConfigChanged --> Reinitialize: Dispose & Recreate
    Reinitialize --> Ready
    
    Ready --> Closing: Close Signal
    Streaming --> Closing: Error or Disconnect
    Reinitialize --> Closing: Error during Reinit
    
    Closing --> Cleanup: Dispose Session
    Cleanup --> [*]
```

## 10. Struttura dei Messaggi WebSocket

### Client → Server (Config Message)
```json
{
  "kind": "Config",
  "voiceModel": "gpt-4o",
  "voice": "en-US-AvaNeural",
  "welcomeMessage": "Hello, how can I help?",
  "voiceModelInstructions": "You are a helpful assistant...",
  "locale": "en-US",
  "foundryAgentId": "optional-agent-id",
  "foundryProjectName": "optional-project-name",
  "voiceLiveEndpoint": "optional-endpoint",
  "voiceLiveApiKey": "optional-api-key"
}
```

### Server → Client (Message Response)
```json
{
  "kind": "Message",
  "type": "output_audio",
  "data": "base64-encoded-audio"
}
```

```json
{
  "kind": "Message",
  "type": "transcript",
  "data": "Transcribed text from user"
}
```

### Server → Client (Session Event)
```json
{
  "kind": "SessionEvent",
  "event": "AvatarConnectionId",
  "payload": {
    "connectionId": "uuid-string"
  }
}
```

## Componenti Chiave

| Componente | Ruolo | Responsabilità |
|-----------|-------|-----------------|
| **VoiceMediaHandler** | Media Hub | Gestisce WebSocket client, routing messaggi, streaming audio |
| **VoiceSessionFactory** | Factory Pattern | Crea sessioni appropriate (Assistant/Agent/Avatar) |
| **VoiceAssistantSession** | Model-based | Parla con GPT-4 direttamente |
| **VoiceAgentSession** | Foundry Agent | Integrazione con Azure Agent Service |
| **VoiceAvatarSession** | Avatar + WebRTC | Avatar visivo con streaming audio/video |
| **IncomingCallHandler** | ACS Integration | Gestisce chiamate telefoniche in entrata |
| **VoiceSessionBase** | Base Class | Logica comune: MCP, event processing, tool execution |

## Modalità di Operazione

### 1. **Web Client Mode**
- Client JavaScript → Raw Audio PCM16
- Optional: Config message con parametri custom
- Supporta: Voice Assistant, Voice Agent, Avatar

### 2. **Incoming Call Mode (ACS)**
- Chiamata telefonica → ACS → WebSocket audio
- Usa configurazione server (no Config message)
- Supporta: Voice Assistant, Voice Agent
- Audio: 24kHz mono PCM

### 3. **Avatar Mode**
- WebRTC per video avatar
- WebSocket per audio
- Connessioni concorrenti
- SDP exchange via REST endpoint

## Sequenza Tipica di Sessione

1. **Connessione**: Client stabilisce WebSocket
2. **Config (opzionale)**: Client invia parametri
3. **Inizializzazione**: VoiceMediaHandler crea sessione
4. **Avvio**: Session.StartAsync() prepara Voice Live
5. **Benvenuto**: Welcome message se configurato
6. **Streaming**: Scambio audio/testo continuo
7. **Tool Execution**: Esecuzione tool se richiesta
8. **Chiusura**: Cleanup e disconnect

## Flusso di Errore e Recovery

```mermaid
graph TD
    A["Error Occurs"] --> B{Error Type?}
    
    B -->|Network Error| C["Log Error"]
    B -->|Voice Live Error| C
    B -->|Session Error| C
    
    C --> D{Recoverable?}
    
    D -->|Yes| E["Log Retry Attempt"]
    E --> F["Wait Brief Delay"]
    F --> G["ReinitializeVoiceLiveConnection"]
    
    D -->|No| H["Log Fatal Error"]
    H --> I["DisposeAsync"]
    I --> J["Close WebSocket"]
    
    G --> K["Recreate Session"]
    J --> L["End Connection"]
```

```mermaid
sequenceDiagram
    participant Client
    participant Server

    Note over Client,Server: Apertura connessione WebSocket
    Server-->>Client: session.created (sessione inizializzata)

    Note over Client,Server: Configurazione opzionale
    Client->>Server: session.update (aggiorna modello/voce)

    Note over Client,Server: Invio audio
    Client->>Server: input_audio_buffer.append (chunk PCM16)
    Client->>Server: input_audio_buffer.commit (fine audio)

    Note over Client,Server: Richiesta risposta
    Client->>Server: response.create (genera risposta)

    Note over Client,Server: Streaming risposta
    Server-->>Client: response.audio.delta (chunk audio)
    Server-->>Client: response.output_text.delta (chunk testo)
    Server-->>Client: response.completed (risposta completata)
```