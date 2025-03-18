import os
import csv
import time
import numpy as np
import nltk
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from eventgraph import EventGraph

def ensure_nltk_resources():
    required_resources = [
        'punkt',           # Basic tokenizer
        'punkt_tab',       # Tokenizer sub-resources
        'averaged_perceptron_tagger',  # For POS tagging if needed
        'stopwords'        # Common stopwords if needed for filtering
    ]
    
    missing_resources = []
    for resource in required_resources:
        try:
            # Check if the resource is already available
            if resource == 'punkt_tab':
                try:
                    nltk.data.find(f'tokenizers/punkt_tab/english/')
                except LookupError:
                    missing_resources.append(resource)
            else:
                nltk.data.find(f'tokenizers/{resource}' if resource == 'punkt' else resource)
        except LookupError:
            missing_resources.append(resource)
    
    if not missing_resources:
        print("[INFO] All required NLTK resources are already available.")
        return
    
    # Download missing resources
    print(f"[INFO] Downloading missing NLTK resources: {', '.join(missing_resources)}")
    for resource in missing_resources:
        print(f"[INFO] Downloading {resource}...")
        if resource == 'punkt_tab':
            # Special case for punkt_tab - we need to download punkt
            nltk.download('punkt', quiet=False)
        else:
            nltk.download(resource, quiet=False)
    
    # After downloading, try to manually download punkt models to avoid punkt_tab issues
    try:
        # Force loading to ensure all sub-resources are available
        tokenizer = nltk.data.load('tokenizers/punkt/english.pickle')
        print("[INFO] Successfully loaded punkt models.")
    except Exception as e:
        print(f"[WARNING] Error loading punkt models: {e}")
        print("[INFO] Attempting alternative download method...")
        try:
            # Alternative approach to ensure punkt_tab availability
            nltk.download('all', quiet=False)
            print("[INFO] Downloaded all NLTK resources to ensure availability.")
        except Exception as e2:
            print(f"[ERROR] Failed to download all resources: {e2}")
            print("[INFO] Please manually run: python -m nltk.downloader all")
            
    print("[INFO] NLTK resources setup completed.")

# Call this function at module initialization time
ensure_nltk_resources()

def compute_ngram_diversity(text, n):
    # Ensure text is ASCII only
    text = ''.join(char for char in text if ord(char) < 128)
    
    # Tokenize the text
    tokens = nltk.word_tokenize(text.lower())
    
    # Filter out any tokens that might still contain non-ASCII characters
    tokens = [token for token in tokens if all(ord(char) < 128 for char in token)]
    
    # If we have fewer tokens than n, return 0 diversity
    if len(tokens) < n:
        return 0.0
    
    # Generate n-grams
    ngrams = list(nltk.ngrams(tokens, n))
    
    # Count unique n-grams
    unique_ngrams = set(ngrams)
    
    # Calculate diversity ratio
    diversity = len(unique_ngrams) / len(ngrams) if ngrams else 0
    
    return diversity

def extract_raw_text(narrative):
    # Split by lines and remove the bullet points/dashes
    lines = narrative.split('\n')
    cleaned_lines = [line[2:].strip() if line.startswith('- ') else line.strip() 
                    for line in lines if line.strip()]
    
    # Join back into a single text
    raw_text = ' '.join(cleaned_lines)
    
    # Filter out non-ASCII characters
    ascii_text = ''.join(char for char in raw_text if ord(char) < 128)
    
    return ascii_text

def generate_mcts_path(eg, stub_text, target_length, max_children, iterations, min_num_chains=1):
    root_id = eg.add_event_node(text=stub_text)
    
    # Run MCTS with the specified parameters
    eg.run_mcts(
        root_id=root_id,
        max_children=max_children,
        scoring_prompt="",
        iterations=iterations,
        scoring_depth=1,
        desired_chain_length=target_length,
        min_num_chains=min_num_chains
    )
    
    # Get the top path from MCTS
    _, top_path_text = eg.get_top_path(root_id)
    return top_path_text

def generate_baseline_path(eg, stub_text, target_length, branching_factor=1):
    root_id = eg.add_event_node(text=stub_text)
    
    # Start at root node
    current_node = root_id
    
    # Expand until we reach target length
    while True:
        chain = eg.gather_chain_in_chronological_order(current_node)
        if len(chain) >= target_length:
            break
            
        # Generate multiple children (branching_factor determines how many)
        new_children_ids = []
        for _ in range(branching_factor):
            ev = eg.generate_next_event(from_node=current_node)
            child_id = eg.add_event_node(ev["text"])
            eg.G.add_edge(current_node, child_id)
            new_children_ids.append(child_id)
            
        # Pick one child to continue from
        current_node = new_children_ids[0]  # Always pick the first one for baseline
    
    # Get the final chain
    chain_ids = eg.gather_chain_in_chronological_order(current_node)
    narrative_text = "\n".join("- " + eg.G.nodes[nid]["text"] for nid in chain_ids)
    
    return narrative_text

def process_single_run(
    run_idx,
    stub_text,
    target_length,
    mcts_config,
    baseline_config,
    model,
    temperature
):
    print(f"\n[INFO] Run {run_idx+1}")
    
    # Create event graphs for this run
    eg_mcts = EventGraph(
        model_generate_next=model,
        temperature_generate_next=temperature,
        model_scoring=model,
        temperature_scoring=0.3,
        logging_level=None
    )
    
    eg_baseline = EventGraph(
        model_generate_next=model,
        temperature_generate_next=temperature,
        model_scoring=model,
        temperature_scoring=0.3,
        logging_level=None
    )
    
    # Run MCTS strategy
    print(f"[INFO] (Thread {run_idx+1}) Running MCTS strategy...")
    mcts_narrative = generate_mcts_path(
        eg=eg_mcts,
        stub_text=stub_text,
        target_length=target_length,
        max_children=mcts_config["max_children"],
        iterations=mcts_config["iterations"],
        min_num_chains=3
    )
    
    # Run baseline strategy
    print(f"[INFO] (Thread {run_idx+1}) Running baseline strategy...")
    baseline_narrative = generate_baseline_path(
        eg=eg_baseline,
        stub_text=stub_text,
        target_length=target_length,
        branching_factor=baseline_config["branching_factor"]
    )
    
    return {
        "mcts_narrative": mcts_narrative,
        "baseline_narrative": baseline_narrative,
        "run_idx": run_idx
    }

def run_lexical_diversity_evaluation(
    stub_file,
    stub_index=0,
    runs=5,
    target_length=10,
    mcts_config={"max_children": 3, "iterations": 30},
    baseline_config={"branching_factor": 1},
    output_dir="results_lexical_diversity",
    model="gpt-4o",
    temperature=1.0,
    max_workers=4
):
    print(f"[INFO] Starting lexical diversity evaluation")
    print(f"[INFO] Stub index: {stub_index}, Runs: {runs}, Target length: {target_length}")
    print(f"[INFO] MCTS config: {mcts_config}")
    print(f"[INFO] Baseline config: {baseline_config}")
    
    start_time = time.time()
    
    # Create output directory
    os.makedirs(output_dir, exist_ok=True)
    
    # Load stubs
    print(f"[INFO] Reading story stubs from file: {stub_file}")
    with open(stub_file, "r", encoding="utf-8") as f:
        stubs = [line.strip() for line in f if line.strip()]
    
    if stub_index >= len(stubs):
        print(f"[ERROR] Stub index {stub_index} out of range (0-{len(stubs)-1}).")
        return
    
    # Get the selected stub
    stub_text = stubs[stub_index]
    print(f"[INFO] Selected stub: {stub_text[:60]}...")
    
    # Store narratives for each strategy
    mcts_narratives = []
    baseline_narratives = []
    
    # Run strategies N times in parallel
    print(f"[INFO] Running {runs} iterations in parallel with {max_workers} workers...")
    
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Submit all runs to the executor
        futures = []
        for run_idx in range(runs):
            future = executor.submit(
                process_single_run,
                run_idx,
                stub_text,
                target_length,
                mcts_config,
                baseline_config,
                model,
                temperature
            )
            futures.append(future)
        
        # Collect results as they complete
        for future in as_completed(futures):
            try:
                result = future.result()
                run_idx = result["run_idx"]
                mcts_narrative = result["mcts_narrative"]
                baseline_narrative = result["baseline_narrative"]
                
                # Store results in order by run_idx
                while len(mcts_narratives) <= run_idx:
                    mcts_narratives.append(None)
                    baseline_narratives.append(None)
                
                mcts_narratives[run_idx] = mcts_narrative
                baseline_narratives[run_idx] = baseline_narrative
                
                print(f"[INFO] Completed run {run_idx+1}/{runs}")
            except Exception as e:
                print(f"[ERROR] A thread crashed: {repr(e)}")
    
    # Remove any None entries (in case a thread failed)
    mcts_narratives = [n for n in mcts_narratives if n is not None]
    baseline_narratives = [n for n in baseline_narratives if n is not None]
    
    if not mcts_narratives or not baseline_narratives:
        print("[ERROR] All threads failed. No results to analyze.")
        return None
    
    # Calculate lexical diversity metrics
    print("\n[INFO] Calculating lexical diversity metrics...")
    
    # Extract raw text without bullet points
    mcts_raw_texts = [extract_raw_text(narrative) for narrative in mcts_narratives]
    baseline_raw_texts = [extract_raw_text(narrative) for narrative in baseline_narratives]
    
    # All narratives combined for each strategy (for overall diversity)
    mcts_combined = " ".join(mcts_raw_texts)
    baseline_combined = " ".join(baseline_raw_texts)
    
    # Calculate diversity metrics for each n-gram size (1-4)
    diversity_results = []
    
    # Individual narratives diversity
    mcts_diversity_by_run = {n: [] for n in range(1, 5)}
    baseline_diversity_by_run = {n: [] for n in range(1, 5)}
    
    # Get the actual number of successful runs (some might have failed)
    actual_runs = min(len(mcts_raw_texts), len(baseline_raw_texts))
    if actual_runs < runs:
        print(f"[WARNING] Only {actual_runs} out of {runs} runs completed successfully.")
    
    for n in range(1, 5):  # Unigrams, bigrams, trigrams, 4-grams
        # Calculate for each individual run (only those that succeeded)
        for i in range(actual_runs):
            mcts_diversity = compute_ngram_diversity(mcts_raw_texts[i], n)
            baseline_diversity = compute_ngram_diversity(baseline_raw_texts[i], n)
            
            mcts_diversity_by_run[n].append(mcts_diversity)
            baseline_diversity_by_run[n].append(baseline_diversity)
        
        # Calculate for all runs combined
        mcts_combined_diversity = compute_ngram_diversity(mcts_combined, n)
        baseline_combined_diversity = compute_ngram_diversity(baseline_combined, n)
        
        # Calculate average diversity across runs
        mcts_avg_diversity = np.mean(mcts_diversity_by_run[n])
        baseline_avg_diversity = np.mean(baseline_diversity_by_run[n])
        
        # Calculate standard deviation
        mcts_std_diversity = np.std(mcts_diversity_by_run[n])
        baseline_std_diversity = np.std(baseline_diversity_by_run[n])
        
        diversity_results.append({
            "n": n,
            "mcts_avg_diversity": mcts_avg_diversity,
            "mcts_std_diversity": mcts_std_diversity,
            "baseline_avg_diversity": baseline_avg_diversity,
            "baseline_std_diversity": baseline_std_diversity,
            "mcts_combined_diversity": mcts_combined_diversity,
            "baseline_combined_diversity": baseline_combined_diversity,
            "difference_avg": mcts_avg_diversity - baseline_avg_diversity,
            "difference_combined": mcts_combined_diversity - baseline_combined_diversity
        })
    
    # Write results to CSV
    results_file = os.path.join(output_dir, f"lexical_diversity_results.csv")
    with open(results_file, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow([
            "n",
            "MCTS Avg Diversity",
            "MCTS Std Diversity",
            "Baseline Avg Diversity",
            "Baseline Std Diversity",
            "MCTS Combined Diversity",
            "Baseline Combined Diversity",
            "Difference (Avg)",
            "Difference (Combined)"
        ])
        for result in diversity_results:
            writer.writerow([
                result["n"],
                f"{result['mcts_avg_diversity']:.4f}",
                f"{result['mcts_std_diversity']:.4f}",
                f"{result['baseline_avg_diversity']:.4f}",
                f"{result['baseline_std_diversity']:.4f}",
                f"{result['mcts_combined_diversity']:.4f}",
                f"{result['baseline_combined_diversity']:.4f}",
                f"{result['difference_avg']:.4f}",
                f"{result['difference_combined']:.4f}"
            ])
    
    # Also save the raw narratives
    mcts_file = os.path.join(output_dir, "mcts_narratives.txt")
    with open(mcts_file, "w", encoding="utf-8") as f:
        for i, narrative in enumerate(mcts_narratives):
            f.write(f"=== Run {i+1} ===\n")
            f.write(narrative)
            f.write("\n\n")
    
    baseline_file = os.path.join(output_dir, "baseline_narratives.txt")
    with open(baseline_file, "w", encoding="utf-8") as f:
        for i, narrative in enumerate(baseline_narratives):
            f.write(f"=== Run {i+1} ===\n")
            f.write(narrative)
            f.write("\n\n")
    
    # Print summary
    print("\n[INFO] Lexical diversity results:")
    for result in diversity_results:
        print(f"  {result['n']}-grams:")
        print(f"    MCTS avg: {result['mcts_avg_diversity']:.4f} (±{result['mcts_std_diversity']:.4f})")
        print(f"    Baseline avg: {result['baseline_avg_diversity']:.4f} (±{result['baseline_std_diversity']:.4f})")
        print(f"    Difference: {result['difference_avg']:.4f}")
    
    elapsed = time.time() - start_time
    print(f"\n[INFO] Evaluation complete. Total time elapsed: {elapsed:.2f} seconds.")
    print(f"[INFO] Results saved to {output_dir}")

    return diversity_results

if __name__ == "__main__":
    # Example usage
    run_lexical_diversity_evaluation(
        stub_file="stubs.txt",
        stub_index=0,
        runs=5,
        target_length=10,
        mcts_config={"max_children": 3, "iterations": 30},
        baseline_config={"branching_factor": 1},
        output_dir="results_lexical_diversity",
        model="gpt-4o",
        temperature=1.0
    )
