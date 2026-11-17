# Cargo Loading Optimization Engine

An enterprise-grade, multi-threaded benchmarking tool that applies the 0/1 Knapsack Problem to logistics and supply chain cargo loading. 

This platform evaluates algorithmic paradigms (Divide & Conquer, Greedy, Dynamic Programming) in real-time, measuring execution speed, memory footprint, and solution optimality.

## Features
- **Algorithmic Benchmarking:** Compares D&C, standard Greedy, Fractional Greedy, DP (1D Row), and DP (2D Table).
- **Multi-Threaded Architecture:** Mathematical processing is offloaded to HTML5 Web Workers to prevent UI blocking during $O(2^n)$ operations.
- **Custom CSV Parsing:** Drag-and-drop ingestion of custom cargo datasets.
- **Live Telemetry:** Tracks execution time (ms) via `performance.now()` and peak memory allocation.
- **Progressive Web App (PWA):** Fully functional offline with Service Worker caching.

## Tech Stack
- **Frontend:** Vanilla JavaScript, HTML5, CSS3
- **Styling:** Tailwind CSS
- **Visualization:** Chart.js
- **Icons:** Lucide Icons

## Usage
1. Clone the repository.
2. Serve the directory using a local web server (e.g., VS Code Live Server).
3. Adjust the Dataset Size (N) and Capacity constraints, or drop a custom `.csv` payload.
4. Click **Execute** to run the benchmark matrix.
