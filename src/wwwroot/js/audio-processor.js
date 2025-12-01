class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input.length) return true;
    
    const inputChannel = input[0];
    
    // Accumulate data
    for (let i = 0; i < inputChannel.length; i++) {
      this.buffer[this.bufferIndex++] = inputChannel[i];
      
      if (this.bufferIndex >= this.bufferSize) {
        this.flush();
      }
    }

    return true;
  }

  flush() {
    // Create a copy of the buffer to process
    const data = this.buffer.slice(0, this.bufferIndex);
    
    // Calculate RMS
    const rms = this.calculateRMS(data);
    
    // Convert to PCM16
    const pcm16 = this.float32ToInt16(data);
    
    // Send to main thread
    this.port.postMessage({
      type: 'audio-data',
      rms: rms,
      buffer: pcm16.buffer
    }, [pcm16.buffer]);
    
    this.bufferIndex = 0;
  }

  calculateRMS(samples) {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / samples.length);
  }

  float32ToInt16(float32Array) {
    const int16 = new Int16Array(float32Array.length);
    for (let i = 0; i < float32Array.length; i++) {
      // Clamp to [-1, 1] range
      const sample = Math.max(-1, Math.min(1, float32Array[i]));
      // Convert to 16-bit signed integer
      int16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    }
    return int16;
  }
}

registerProcessor('audio-processor', AudioProcessor);
