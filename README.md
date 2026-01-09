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
*   **Parallel Listening & Queue:** Records multiple users simultaneously and processes them in a queue to prevent freezing.
*   **Text Chat Support:** Reply to mentions and status channel messages.
*   **Conversation History:** Finn remembers the last 10 messages, allowing for natural follow-up questions.
*   **Dual Mode Persona:** 
    *   *Voice:* Short, clear, no emojis (optimized for TTS).
    *   *Text:* More expressive, uses emojis and formatting.
*   **Auto-Cleanup:** Deletes temporary `.wav` files in `whisper/` and `tts/` automatically.


## 📝 Roadmap
*   [x] Phase 1: Refactoring into `src/` modules.
*   [x] Phase 2: Short-Term Memory (Conversation History).
*   [x] Phase 3: Text Chat & Dual Persona.
*   [x] Phase 4: Parallel Listening (Fix "Stuck" Bug).
*   [x] Phase 5: Custom LLM Support (Dolphin-Llama3).
*   [ ] **Phase 6: Better Voice Quality:** 
    *   Tweak Coqui TTS settings for more emotion.
    *   Test alternative local TTS engines.
*   [ ] **Phase 7: Long-Term Smart Memory:** 
    *   Use LLM to extract permanent facts (not just Regex).

