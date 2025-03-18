# Narrative Studio

A visual environment for creating, managing, and simulating narrative structures through entity relationships and event sequences.

## Overview

Narrative Studio provides an interactive platform for:
- Creating and visualizing entity relationships
- Designing event sequences and narrative flows
- Generating narrative content using simulation techniques
- Analyzing narrative structures for diversity and complexity

## Features

- **Entity Management**: Create and manage entities with custom attributes and relationships
- **Event Sequencing**: Design event flows with cause-effect relationships
- **Interactive Diagrams**: Visual tools for manipulating both entity and event networks
- **Simulation Capabilities**: MCTS (Monte Carlo Tree Search) based narrative simulation
- **Import/Export**: Save and load your narrative projects

## Getting Started (UI)

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Clone the repository
2. Configure your credentials:
   ```
   cp src/config.example.ts src/config.ts
   ```
   Then edit `src/config.ts` with your API credentials

3. Install dependencies and start the development server:
   ```
   npm install
   npm run dev
   ```

## Examples

The `examples/` directory contains sample narrative structures you can load to explore the capabilities of Narrative Studio.

## WNU 25 Experiments

Please see `wnu25/experiments` for the NAACL WNU 2025 experiments. `run_evaluation.py` contains all the experiments outlined in the paper.

## Project Structure

- `/src`: Frontend application code
  - `/components`: React components for the UI
  - `/prompts`: Templates for narrative generation
- `/wnu25`: Research experiments and evaluations
  - `/experiments`: Scripts for evaluating narrative quality and diversity
  - `/paper`: Research documentation and figures