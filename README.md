# Finn Wegbier - Discord Voice AI Bot

This is a Discord Voice Bot named "Finn Wegbier" that uses entirely local AI models for speech-to-text, text generation, and text-to-speech.

## 🧠 Tech Stack (Local AI)
*   **Listening (STT):** [OpenAI Whisper](https://github.com/openai/whisper) (via Python `whisper` module).
*   **Thinking (LLM):** [Ollama](https://ollama.com/) (running Llama 3 or similar).
*   **Speaking (TTS):** [Coqui TTS](https://github.com/coqui-ai/TTS) (via Python `TTS` module).
*   **Core:** Node.js + Discord.js.

## 📂 Project Structure
The project was refactored (Jan 2026) into a modular structure:

```
C:\Users\Marlon\Desktop\Discord Bot\
├── index.js           # Main entry point (Discord client & event handling)
├── .env               # Secrets (Token, Config)
├── memory.json        # Persistent user memory (JSON database)
└── src\
    ├── config.js      # Central configuration & Constants
    ├── ai.js          # AI Wrapper (Whisper, Ollama, Coqui)
    ├── audio.js       # Audio processing (WAV headers, file cleanup)
    └── memory.js      # Memory logic (Load/Save/Update user info)
```

## 🚀 Setup & Run

1.  **Prerequisites:**
    *   Node.js installed.
    *   Python installed (with `whisper` and `TTS` libraries).
    *   Ollama running locally (`ollama serve`).
    *   FFmpeg installed and in system PATH.

2.  **Install Dependencies:**
    ```bash
    npm install
    ```

3.  **Configuration (.env):**
    Create a `.env` file in the root directory:
    ```env
    DISCORD_TOKEN=your_bot_token_here
    STATUS_CHANNEL_ID=your_channel_id_here
    # Optional overrides:
    # OLLAMA_URL=http://localhost:11434/api/generate
    # OLLAMA_MODEL=llama3
    # COQUI_MODEL=tts_models/de/thorsten/vits
    ```

4.  **Start the Bot:**
    ```bash
    node index.js
    ```

## 🎮 Usage
*   **Join Voice:** Type `!finn join` in a text channel while you are in a voice channel.
*   **Talk:** Speak naturally. Finn listens for his name or direct questions.
    *   *Triggers:* "Finn", "Hey Finn", or direct questions like "Wie geht's?".
*   **Memory:** Finn remembers names ("Ich heiße...") and favorite games ("Ich spiele gerne...") via `src/memory.js`.

## 🛠 Features
*   **Voice Activity Detection:** Listens to Discord audio streams.
*   **Queue System:** Handles multiple speakers one by one to prevent talking over users.
*   **Auto-Cleanup:** Deletes temporary `.wav` files in `whisper/` and `tts/` automatically.
*   **Personality:** defined in `src/config.js` (Funny, casual, "Wegbier" style).

## 📝 Roadmap
*   [x] Phase 1: Refactoring into `src/` modules.
*   [ ] Phase 2: Smart Memory (Use LLM to extract facts instead of Regex).
*   [ ] Phase 3: Better Logging & Error Handling.
*   [ ] **Phase 4: Advanced Audio & STT:** 
    *   Fix "getting stuck" issues when multiple people speak.
    *   Improve Voice Activity Detection (VAD) and queue handling.
    *   Better transcription quality for overlapping speech.
*   [ ] **Phase 5: Custom LLM Integration:** 
    *   Easier switching between different local models (Llama 3, Mistral, etc.).
    *   Support for other backends if needed (e.g., LM Studio).
