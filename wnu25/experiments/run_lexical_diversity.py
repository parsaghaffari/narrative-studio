#!/usr/bin/env python3

import argparse
import sys
import os
from download_nltk_resources import download_nltk_resources
from lexical_diversity_evaluation import run_lexical_diversity_evaluation

# Make sure NLTK resources are available before running the evaluation
print("[INFO] Checking NLTK resources...")
if not download_nltk_resources():
    print("[ERROR] Failed to verify all required NLTK resources. The evaluation may fail.")
    print("[INFO] Attempting to continue anyway...")

def parse_arguments():
    parser = argparse.ArgumentParser(description="Run lexical diversity evaluation")
    
    parser.add_argument("--stub-file", default="stubs.txt",
                        help="Path to the file containing story stubs")
    
    parser.add_argument("--stub-index", type=int, default=0,
                        help="Index of the stub to use from the file (0-indexed)")
    
    parser.add_argument("--runs", type=int, default=5,
                        help="Number of times to run each strategy (N)")
    
    parser.add_argument("--target-length", type=int, default=10,
                        help="Target narrative length (M)")
    
    parser.add_argument("--mcts-children", type=int, default=3,
                        help="Max children parameter for MCTS")
    
    parser.add_argument("--mcts-iterations", type=int, default=30,
                        help="Number of iterations for MCTS")
    
    parser.add_argument("--baseline-branching", type=int, default=1,
                        help="Branching factor for baseline approach")
    
    parser.add_argument("--model", default="gpt-4o",
                        help="Model to use for generation")
    
    parser.add_argument("--temperature", type=float, default=1.0,
                        help="Temperature for generation")
    
    parser.add_argument("--output-dir", default="results_lexical_diversity",
                        help="Directory to save results")
    
    parser.add_argument("--max-workers", type=int, default=4,
                        help="Maximum number of parallel workers to use")
    
    return parser.parse_args()

def main():
    args = parse_arguments()
    
    mcts_config = {
        "max_children": args.mcts_children,
        "iterations": args.mcts_iterations
    }
    
    baseline_config = {
        "branching_factor": args.baseline_branching
    }
    
    run_lexical_diversity_evaluation(
        stub_file=args.stub_file,
        stub_index=args.stub_index,
        runs=args.runs,
        target_length=args.target_length,
        mcts_config=mcts_config,
        baseline_config=baseline_config,
        output_dir=args.output_dir,
        model=args.model,
        temperature=args.temperature,
        max_workers=args.max_workers
    )

if __name__ == "__main__":
    main()
