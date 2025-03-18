# Narrative Studio Experiments

This repository contains experiments for evaluating and comparing different narrative generation strategies, including MCTS (Monte Carlo Tree Search) and baseline approaches.

## Basic Setup

Before running any evaluations:

1. Set your OpenAI API key as an environment variable:
   ```bash
   export OPENAI_API_KEY=XXX
   ```

2. Install the required dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. For lexical diversity evaluations, download NLTK resources:
   ```bash
   python download_nltk_resources.py
   ```

## Standard Evaluation

The standard evaluation compares MCTS and baseline approaches using quality metrics like coherence, consistency, and engagement.

### Running Standard Evaluations

1. Modify `run_evaluation.py` to configure the experiments at the end of the file
2. Run the evaluation:
   ```bash
   python run_evaluation.py
   ```
3. Results will be saved to the `output_dir` folder and grouped by specified story lengths

You can modify parameters like:
- `narrative_lengths`: Target lengths for generated stories
- `multibranch_factors`: Branching factors for baseline approaches
- `mcts_configs`: Configuration for MCTS experiments
- `min_num_chains`: Minimum number of complete chains required
- `output_dir`: Where to save results
- `max_workers`: For parallel execution

## Lexical Diversity Evaluation

This evaluation specifically compares lexical diversity between MCTS and baseline narrative generation approaches. It measures how varied the vocabulary and linguistic patterns are in the generated stories.

### Lexical Diversity Process

1. Selects a story stub from `stubs.txt`
2. Runs both MCTS and baseline strategies N times
3. Generates stories of target length M
4. Compares lexical diversity using distinct-n metrics for n=1,2,3,4

### Running Lexical Diversity Evaluation

There are two ways to run the lexical diversity evaluation:

#### 1. Using run_evaluation.py with lexical_diversity flag

```bash
python run_evaluation.py lexical_diversity
```

This runs with default parameters (5 runs, first story stub, target length of 5, etc.).

#### 2. Using the dedicated runner script

```bash
python run_lexical_diversity.py [OPTIONS]
```

Available options:

- `--stub-file`: Path to story stubs file (default: "stubs.txt")
- `--stub-index`: Index of the stub to use (default: 0)
- `--runs`: Number of times to run each strategy (default: 5)
- `--target-length`: Target narrative length (default: 10)
- `--mcts-children`: Max children parameter for MCTS (default: 3)
- `--mcts-iterations`: Number of iterations for MCTS (default: 30)
- `--baseline-branching`: Branching factor for baseline (default: 1)
- `--model`: Model to use for generation (default: "gpt-4o")
- `--temperature`: Temperature for generation (default: 1.0)
- `--output-dir`: Directory to save results (default: "results_lexical_diversity")
- `--max-workers`: Maximum number of parallel workers (default: 4)

Example with custom parameters:

```bash
python run_lexical_diversity.py --runs 10 --target-length 8 --mcts-iterations 50 --max-workers 8
```

### Lexical Diversity Output Files

The evaluation produces several output files in the specified output directory:

1. `lexical_diversity_results.csv`: Contains metrics for all n-gram sizes (1-4)
   - Average diversity for both MCTS and baseline
   - Standard deviation
   - Combined diversity (across all runs)
   - Difference between approaches

2. `mcts_narratives.txt` and `baseline_narratives.txt`: 
   - Raw generated stories from each run