# Video Labeling Tool

A desktop application for labeling video events, built with [Tauri](https://tauri.app/), [SolidJS](https://www.solidjs.com/), and [TypeScript](https://www.typescriptlang.org/).

## Features

-   **Event Marking**: Press `w` to mark the start and end of an event during playback.
-   **Automatic Context**: Automatically records a `before_start_frame` (5 seconds prior to the event) for context.
-   **Visual Feedback**:
    -   **Timeline Bar**: Colored segments below the video (Orange for pre-event, Red for active event).
    -   **Highlighting**: Event list rows highlight during playback.
    -   **Event Count**: Badges in the file list show the number of recorded events.
-   **Persistence**: Labels are saved as JSON files alongside the videos.
-   **Event Management**: Delete events directly from the UI.

## Prerequisites

Before running or building the application, ensure you have the following installed:

-   **Node.js** (v16 or later)
-   **Rust** (latest stable)
-   **FFmpeg** (specifically `ffprobe`) must be installed and available in your system PATH.

## Development

To run the application locally in development mode:

1.  Install dependencies:
    ```bash
    npm install
    ```

2.  Start the development server:
    ```bash
    npm run tauri dev
    ```

## Build Instructions

To build the application for production, follow the instructions for your operating system. The build command will generate an executable installer for the OS you are running on.

### Linux

1.  Ensure you have the necessary system dependencies installed (see [Tauri Linux Setup](https://v2.tauri.app/start/prerequisites/#linux)).
2.  Run the build command:
    ```bash
    npm run tauri build
    ```
3.  **Output**: The built artifacts (e.g., `.deb`, `.AppImage`) will be located in:
    `src-tauri/target/release/bundle/`

### Windows

1.  Ensure you have the "C++ build tools" installed via Visual Studio Build Tools.
2.  Run the build command in PowerShell or Command Prompt:
    ```powershell
    npm run tauri build
    ```
3.  **Output**: The installer (e.g., `.msi`, `.exe`) will be located in:
    `src-tauri/target/release/bundle/msi/` or `src-tauri/target/release/bundle/nsis/`

### macOS

1.  Ensure you have Xcode Command Line Tools installed (`xcode-select --install`).
2.  Run the build command:
    ```bash
    npm run tauri build
    ```
3.  **Output**: The application bundle (e.g., `.app`, `.dmg`) will be located in:
    `src-tauri/target/release/bundle/dmg/` or `src-tauri/target/release/bundle/macos/`

## Project Structure

-   `src/`: Frontend source code (SolidJS).
-   `src-tauri/`: Backend source code (Rust).
-   `src-tauri/capabilities/`: Tauri permission configurations.

## Troubleshooting

### Linux: Missing GStreamer Plugins

If you encounter errors related to missing GStreamer plugins (e.g., `The GStreamer FDK AAC plugin is missing` or `WebKit wasn't able to find a WebVTT encoder`), you need to install the `gst-plugins-bad` and other related packages.

On Ubuntu/Debian:

```bash
sudo apt-get install gstreamer1.0-plugins-bad gstreamer1.0-plugins-ugly gstreamer1.0-libav
```
