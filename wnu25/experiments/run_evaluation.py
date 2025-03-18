import os
import csv
import time
import random
from concurrent.futures import ThreadPoolExecutor, as_completed
from eventgraph import EventGraph
from judge import judge_narrative

def get_top_n_paths(eg, root_id, n):
    """
    Returns a list of the top-n paths from root->leaf, 
    sorted by MCTS path score in descending order.
    Each item is (path, path_text, path_score).
    """
    all_paths = eg.get_all_root_to_leaf_paths(root_id)
    if not all_paths:
        # No children => only one path (the root itself).
        single_path = [root_id]
        path_score = eg.compute_path_score(single_path)
        text = "\n".join("- " + eg.G.nodes[nid]["text"] for nid in single_path)
        return [(single_path, text, path_score)]

    scored_paths = []
    for path in all_paths:
        path_score = eg.compute_path_score(path)
        path_text = "\n".join("- " + eg.G.nodes[nid]["text"] for nid in path)
        scored_paths.append((path, path_text, path_score))

    scored_paths.sort(key=lambda x: x[2], reverse=True)
    return scored_paths[:n]  # top n

def generate_multibranch_chain(
    eg: EventGraph,
    stub_node_id: int,
    narrative_length: int,
    branching_factor: int = 1
):
    """
    "Multi-branch baseline" approach:
      - Start at 'stub_node_id'
      - For each step until we reach 'narrative_length' total nodes in the chain:
        1) Generate 'branching_factor' new children from the current node
        2) Randomly pick ONE of these children as the new current node
      - Return the final linear chain from root to the final node

    If branching_factor=1, this is effectively the old baseline (always one child).
    """
    current_node = stub_node_id

    # We'll do expansions until we have narrative_length nodes in the chain
    # i.e. we need narrative_length - 1 expansions
    while True:
        chain = eg.gather_chain_in_chronological_order(current_node)
        if len(chain) >= narrative_length:
            break

        # Expand the current node 'branching_factor' times
        new_children_ids = []
        for _ in range(branching_factor):
            ev = eg.generate_next_event(from_node=current_node)
            child_id = eg.add_event_node(ev["text"])
            eg.G.add_edge(current_node, child_id)
            new_children_ids.append(child_id)

        # Randomly pick one child to continue from
        next_node = random.choice(new_children_ids)
        current_node = next_node

    return eg.gather_chain_in_chronological_order(current_node)

def process_single_stub_length(
    stub_idx: int,
    stub_text: str,
    length: int,
    temperature_generate_next: float,
    multibranch_factors: list,
    mcts_configs: list,
    min_num_chains: int
):
    """
    Runs the entire evaluation for a single stub & narrative length:
      1) For each 'branching_factor' in multibranch_factors, run the multi-branch baseline strategy
      2) For each MCTS config, run MCTS
    Returns a list of row_results dicts, one row per (strategy).
    """
    row_results = []
    print(f"\n[INFO] (Thread) Stub {stub_idx} - length {length} - truncated text: {stub_text[:60]}...")

    #########################
    # 1) Multi-branch Baseline(s)
    #########################
    for bf in multibranch_factors:
        # Build an event graph for this approach
        eg_mb = EventGraph(
            model_generate_next="gpt-4o",
            temperature_generate_next=temperature_generate_next,
            model_scoring="gpt-4o",
            temperature_scoring=0.3,
            logging_level=None
        )
        root_id = eg_mb.add_event_node(text=stub_text)

        # Generate a chain with the multi-branch approach
        chain_ids = generate_multibranch_chain(
            eg=eg_mb,
            stub_node_id=root_id,
            narrative_length=length,
            branching_factor=bf
        )
        # Build the narrative text
        narrative_text = "\n".join("- " + eg_mb.G.nodes[nid]["text"] for nid in chain_ids)

        # Judge it
        judge_result = judge_narrative(narrative_text=narrative_text, model="o1")
        scores = judge_result["judgement"]
        avg_score = sum(scores.values()) / len(scores)

        strategy_label = f"baseline-multibranch (N={bf})"
        row_results.append({
            "strategy": strategy_label,
            "story_stub": stub_text,
            "narrative": narrative_text,
            "overall_quality": scores["overall_quality"],
            "identifying_major_flaws": scores["identifying_major_flaws"],
            "character_behavior": scores["character_behavior"],
            "common_sense_adherence": scores["common_sense_adherence"],
            "consistency": scores["consistency"],
            "relatedness": scores["relatedness"],
            "causal_temporal_relationship": scores["causal_temporal_relationship"],
            "avg_score": avg_score,
            "judge_comments": judge_result["narrative_comments"]
        })
        print(f"[INFO] (Thread) baseline-multibranch (N={bf}) done. Avg score: {avg_score:.2f}")

    #########################
    # 2) MCTS
    #########################
    for cfg_idx, cfg in enumerate(mcts_configs, start=1):
        iters = cfg["iterations"]
        max_children = cfg["max_children"]
        scoring_depth = cfg["scoring_depth"]
        strategy_label = f"mcts (max_children={max_children}, iterations={iters}, scoring_depth={scoring_depth})"

        print(f"[INFO] (Thread) Running MCTS config {cfg_idx}/{len(mcts_configs)}: {cfg}")
        eg_mcts = EventGraph(
            model_generate_next="gpt-4o",
            temperature_generate_next=temperature_generate_next,
            model_scoring="gpt-4o",
            temperature_scoring=0.3,
            logging_level=None
        )
        mcts_root_id = eg_mcts.add_event_node(text=stub_text)

        eg_mcts.run_mcts(
            root_id=mcts_root_id,
            max_children=max_children,
            scoring_prompt="",
            iterations=iters,
            scoring_depth=scoring_depth,
            desired_chain_length=length,
            min_num_chains=min_num_chains
        )
        print("[INFO] (Thread) MCTS run complete. Gathering top paths...")

        top_paths = get_top_n_paths(eg_mcts, mcts_root_id, min_num_chains)
        judge_scores_list = []
        judge_comments_list = []

        print("[INFO] (Thread) Scoring each of the top paths with judge...")
        for (path, path_text, path_score) in top_paths:
            path_judge = judge_narrative(narrative_text=path_text, model="o1")
            judge_scores_list.append(path_judge["judgement"])
            judge_comments_list.append(path_judge["narrative_comments"])

        if len(judge_scores_list) > 0:
            sum_scores = {
                "overall_quality": 0,
                "identifying_major_flaws": 0,
                "character_behavior": 0,
                "common_sense_adherence": 0,
                "consistency": 0,
                "relatedness": 0,
                "causal_temporal_relationship": 0
            }
            for scores_dict in judge_scores_list:
                for k in sum_scores:
                    sum_scores[k] += scores_dict[k]
            for k in sum_scores:
                sum_scores[k] /= len(judge_scores_list)

            final_comments = judge_comments_list[0]
            mcts_avg_score = sum(sum_scores.values()) / len(sum_scores)

            row_results.append({
                "strategy": strategy_label,
                "story_stub": stub_text,
                "narrative": top_paths[0][1],
                "overall_quality": sum_scores["overall_quality"],
                "identifying_major_flaws": sum_scores["identifying_major_flaws"],
                "character_behavior": sum_scores["character_behavior"],
                "common_sense_adherence": sum_scores["common_sense_adherence"],
                "consistency": sum_scores["consistency"],
                "relatedness": sum_scores["relatedness"],
                "causal_temporal_relationship": sum_scores["causal_temporal_relationship"],
                "avg_score": mcts_avg_score,
                "judge_comments": final_comments
            })
            print(f"[INFO] (Thread) MCTS done. Avg of top {min_num_chains} paths: {mcts_avg_score:.2f}")

    return row_results

def run_evaluation_parallel(
    stubs_file: str,
    narrative_lengths: list,
    temperature_generate_next: float,
    multibranch_factors: list,
    mcts_configs: list,
    min_num_chains: int,
    output_dir: str = "results",
    max_workers: int = 4
):
    """
    Parallel version of the experiment. 
    We create tasks for each (stub, narrative_length) pair, run them in threads, 
    gather the row-level results, and write CSVs. Logs total time at the end.

    For each stub & length:
      1) Run the multi-branch baseline approach for each factor in `multibranch_factors`.
         (N=1 corresponds to the old single-branch baseline)
      2) Run each MCTS configuration
      3) Combine all results, write CSV
    """

    start_time = time.time()  # start timer

    print(f"[INFO] Reading story stubs from file: {stubs_file}")
    with open(stubs_file, "r", encoding="utf-8") as f:
        stubs = [line.strip() for line in f if line.strip()]

    print(f"[INFO] Loaded {len(stubs)} stubs.")
    print(f"[INFO] Narrative lengths to process: {narrative_lengths}")
    print(f"[INFO] Multi-branch factors: {multibranch_factors}")
    print(f"[INFO] MCTS configurations: {mcts_configs}")
    print(f"[INFO] min_num_chains = {min_num_chains}")
    print(f"[INFO] Results will be saved to: {output_dir}")
    print(f"[INFO] max_workers = {max_workers}")

    for length in narrative_lengths:
        print(f"\n[INFO] === Processing narrative length: {length} (parallel) ===")
        length_folder = os.path.join(output_dir, str(length))
        os.makedirs(length_folder, exist_ok=True)

        row_results_for_length = []

        from concurrent.futures import ThreadPoolExecutor, as_completed
        futures = []
        # 1) Submit parallel tasks for each stub
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            for stub_idx, stub_text in enumerate(stubs, start=1):
                fut = executor.submit(
                    process_single_stub_length,
                    stub_idx,
                    stub_text,
                    length,
                    temperature_generate_next,
                    multibranch_factors,
                    mcts_configs,
                    min_num_chains
                )
                futures.append(fut)

            # 2) Collect results from each future
            for fut in as_completed(futures):
                try:
                    stub_rows = fut.result()
                    row_results_for_length.extend(stub_rows)
                except Exception as e:
                    print(f"[ERROR] A thread crashed: {repr(e)}")
                    # Optionally record partial/failure row:
                    row_results_for_length.append({
                        "strategy": "baseline-multibranch (N=??)",
                        "story_stub": "<Error occurred>",
                        "narrative": "<No narrative>",
                        # fill other fields as needed
                        "avg_score": 0,
                        "judge_comments": f"Error: {e}"
                    })
                    continue

        # Now we have row_results_for_length for all stubs at this length
        # Write them to CSV
        print("[INFO] Writing all_results.csv for length =", length)
        all_results_path = os.path.join(length_folder, "all_results.csv")
        with open(all_results_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            header = [
                "strategy",
                "story_stub",
                "narrative",
                "overall_quality",
                "identifying_major_flaws",
                "character_behavior",
                "common_sense_adherence",
                "consistency",
                "relatedness",
                "causal_temporal_relationship",
                "avg_score",
                "judge_comments",
            ]
            writer.writerow(header)
            for row in row_results_for_length:
                writer.writerow([
                    row["strategy"],
                    row["story_stub"],
                    row["narrative"],
                    row["overall_quality"],
                    row["identifying_major_flaws"],
                    row["character_behavior"],
                    row["common_sense_adherence"],
                    row["consistency"],
                    row["relatedness"],
                    row["causal_temporal_relationship"],
                    row["avg_score"],
                    row["judge_comments"]
                ])
        print(f"[INFO] Finished writing {all_results_path}")

        # ----- Write aggregate_scores.csv -----
        from collections import defaultdict
        strategy_groups = defaultdict(list)
        for row in row_results_for_length:
            strategy_groups[row["strategy"]].append(row)

        aggregate_rows = []
        for strategy, rows in strategy_groups.items():
            n = len(rows)
            if n == 0:
                continue
            sum_overall_quality = sum(r["overall_quality"] for r in rows)
            sum_identifying_major_flaws = sum(r["identifying_major_flaws"] for r in rows)
            sum_character_behavior = sum(r["character_behavior"] for r in rows)
            sum_common_sense_adherence = sum(r["common_sense_adherence"] for r in rows)
            sum_consistency = sum(r["consistency"] for r in rows)
            sum_relatedness = sum(r["relatedness"] for r in rows)
            sum_causal = sum(r["causal_temporal_relationship"] for r in rows)

            avg_overall_quality = sum_overall_quality / n
            avg_identifying_major_flaws = sum_identifying_major_flaws / n
            avg_character_behavior = sum_character_behavior / n
            avg_common_sense_adherence = sum_common_sense_adherence / n
            avg_consistency = sum_consistency / n
            avg_relatedness = sum_relatedness / n
            avg_causal = sum_causal / n

            # average of these 7
            overall_avg = (
                avg_overall_quality
                + avg_identifying_major_flaws
                + avg_character_behavior
                + avg_common_sense_adherence
                + avg_consistency
                + avg_relatedness
                + avg_causal
            ) / 7.0

            aggregate_rows.append({
                "strategy": strategy,
                "overall_quality": avg_overall_quality,
                "identifying_major_flaws": avg_identifying_major_flaws,
                "character_behavior": avg_character_behavior,
                "common_sense_adherence": avg_common_sense_adherence,
                "consistency": avg_consistency,
                "relatedness": avg_relatedness,
                "causal_temporal_relationship": avg_causal,
                "avg_score": overall_avg
            })

        agg_results_path = os.path.join(length_folder, "aggregate_scores.csv")
        with open(agg_results_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            header = [
                "strategy",
                "overall_quality",
                "identifying_major_flaws",
                "character_behavior",
                "common_sense_adherence",
                "consistency",
                "relatedness",
                "causal_temporal_relationship",
                "avg_score"
            ]
            writer.writerow(header)
            for row in aggregate_rows:
                writer.writerow([
                    row["strategy"],
                    row["overall_quality"],
                    row["identifying_major_flaws"],
                    row["character_behavior"],
                    row["common_sense_adherence"],
                    row["consistency"],
                    row["relatedness"],
                    row["causal_temporal_relationship"],
                    row["avg_score"],
                ])
        print(f"[INFO] Finished writing {agg_results_path}")

    elapsed = time.time() - start_time
    print(f"[INFO] All evaluations are complete. Total time elapsed: {elapsed:.2f} seconds.")


if __name__ == "__main__":
    # Choose which type of evaluation to run
    import sys
    
    # Default evaluation type
    evaluation_type = "standard"
    
    # Check for command line args
    if len(sys.argv) > 1:
        evaluation_type = sys.argv[1]
    
    if evaluation_type == "lexical_diversity":
        # Import necessary functions
        from download_nltk_resources import download_nltk_resources
        from lexical_diversity_evaluation import run_lexical_diversity_evaluation
        
        # Make sure NLTK resources are available before running the evaluation
        print("[INFO] Checking NLTK resources...")
        if not download_nltk_resources():
            print("[ERROR] Failed to verify all required NLTK resources. The evaluation may fail.")
            print("[INFO] Attempting to continue anyway...")
        
        # Example usage for lexical diversity evaluation
        run_lexical_diversity_evaluation(
            stub_file="stubs.txt",
            stub_index=0,  # Use the first stub
            runs=10,        # Run each strategy 5 times
            target_length=6,
            mcts_config={"max_children": 3, "iterations": 200},
            baseline_config={"branching_factor": 3},
            output_dir="results_lexical_diversity",
            model="gpt-4o",
            temperature=1.3,
            max_workers=10  # Use maximum parallelism
        )
        
        print("\n[INFO] To run with different parameters, use the run_lexical_diversity.py script.")
        
    else:  # standard evaluation
        # Example usage:
        # We'll compare multi-branch with N=1 (the old baseline) and N=3 (a random expansion),
        # plus a couple of MCTS configs.
        mcts_configs = []
        # [
        #     {"iterations": 60, "max_children": 3, "scoring_depth": 1},
        #     {"iterations": 100, "max_children": 6, "scoring_depth": 3},
        # ]

        run_evaluation_parallel(
            stubs_file="stubs.txt",
            narrative_lengths=[10],
            temperature_generate_next=1.3,
            multibranch_factors=[3, 6],
            mcts_configs=mcts_configs,
            min_num_chains=2,
            output_dir="results_multibranch",
            max_workers=10
        )
