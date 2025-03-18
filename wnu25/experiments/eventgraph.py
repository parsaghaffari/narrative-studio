import logging
import networkx as nx
import matplotlib.pyplot as plt
import math
import re
import csv
from llm_util import call_openai

class EventGraph:

    def __init__(
        self,
        # Model/temperature for generating "next" events (consequences)
        model_generate_next: str = "gpt-4",
        temperature_generate_next: float = 0.8,

        # Model/temperature for scoring
        model_scoring: str = "gpt-3.5-turbo",
        temperature_scoring: float = 0.0,

        # Optional logging level (e.g. logging.INFO or None to disable)
        logging_level=logging.INFO
    ):
        # Set up logger
        self.logger = logging.getLogger(__name__)
        if logging_level is None:
            # Disable all logging from this logger
            self.logger.addHandler(logging.NullHandler())
            self.logger.propagate = False
        else:
            self.logger.setLevel(logging_level)
            # Optionally add a default StreamHandler if no handlers exist
            if not self.logger.handlers:
                handler = logging.StreamHandler()
                formatter = logging.Formatter(
                    '%(asctime)s [%(levelname)s] %(name)s - %(message)s'
                )
                handler.setFormatter(formatter)
                self.logger.addHandler(handler)

        self.G = nx.DiGraph()
        # Internal counter for node IDs
        self._next_key = 1

        # Store the chosen model/temperature combos
        self.model_generate_next = model_generate_next
        self.temperature_generate_next = temperature_generate_next

        self.model_scoring = model_scoring
        self.temperature_scoring = temperature_scoring

    def add_event_node(self,
                       text: str,
                       prevGuessesForward=None,
                       prevGuessesBackward=None):
        """
        Create a new node in the graph with an auto-incremented integer key.
        """
        if prevGuessesForward is None:
            prevGuessesForward = []
        if prevGuessesBackward is None:
            prevGuessesBackward = []

        node_id = self._next_key
        self._next_key += 1

        self.G.add_node(
            node_id,
            text=text,
            prevGuessesForward=prevGuessesForward,
            prevGuessesBackward=prevGuessesBackward,
            mcts_visits=0,
            mcts_total_score=0.0
        )
        return node_id

    def get_children(self, node_id):
        return list(self.G.successors(node_id))

    def get_parents(self, node_id):
        return list(self.G.predecessors(node_id))

    def gather_chain_in_chronological_order(self, node_id):
        """
        Walks up the parents until none is found, reversing the list so earliest->latest.
        If multiple parents exist, picks the first one found.
        """
        chain = []
        current = node_id
        while True:
            chain.append(current)
            p = self.get_parents(current)
            if not p:
                break
            current = p[0]
        chain.reverse()
        return chain

    def generate_next_event(
        self,
        from_node: int,
        include_entity_graph: bool = False,
        entities_description: str = "",
        user_prompt: str = "",
        event_temperature: float = None,
    ):
        """
        Generates a "next" event from the given node, with the **exact** prompt text 
        that matches the TypeScript version.
        """
        if event_temperature is None:
            event_temperature = self.temperature_generate_next

        node_data = self.G.nodes[from_node]
        prev_guesses_forward = node_data["prevGuessesForward"]

        # Gather all events (chain) so far
        chain_ids = self.gather_chain_in_chronological_order(from_node)
        chain_texts = [self.G.nodes[n]["text"] for n in chain_ids]

        if chain_texts:
            parents_text = "\n".join(f"- {t}" for t in chain_texts)
        else:
            parents_text = "(No prior events)"

        # Build the main prompt (identical to TS code)
        prompt = f"""
You are a creative storyteller. Below is the current story context (events so far), followed by instructions to generate the next event.

[STORY CONTEXT]
{parents_text}

--- INSTRUCTIONS ---
• Write a single story event (2–3 sentences) that moves the plot forward.
• Escalate tension, reveal new details, or deepen character relationships.
• Be logically consistent with existing events but also add an element of surprise or conflict.
• Avoid contradicting established facts or merely repeating prior events.
• Like a good storywriter, try to use "but" or "therefore" to piece together ideas—without overusing or over-mentioning them.
• Do NOT include extra punctuation. Keep it concise and compelling.

"""

        # If entity graph is included
        if include_entity_graph and entities_description.strip():
            prompt += f"\nConsider this entity graph (characters, locations, relationships):\n{entities_description}\n"

        # If user added extra prompt
        if user_prompt.strip():
            prompt += f"\nAdditional user context:\n{user_prompt}\n"

        # If we have previous guesses, mention them
        if prev_guesses_forward:
            prompt += "\nPreviously generated events:\n"
            for pg in prev_guesses_forward:
                prompt += f"- {pg}\n"
            prompt += "Try to diverge significantly from these, to create an alternative path in the story.\n"

        # Final line
        prompt += "\nNow, write the next event:\n"

        self.logger.info("Prompt for Next Event:\n%s", prompt.strip())

        response = call_openai(
            prompt,
            model=self.model_generate_next,
            temperature=event_temperature,
            max_completion_tokens=300
        )

        return {
            "text": response
        }

    def score_event_with_openai(self, event_text: str, user_prompt: str = "") -> float:
        """
        Scores an event chain (or single event) from 1..10 using the same prompt 
        that appears in the TypeScript version.
        Defaults to 5 if invalid or out of range.
        """
        if user_prompt.strip():
            domain_constraints_line = f"Below are domain-specific or user-specified constraints:\n- {user_prompt}\n"
        else:
            domain_constraints_line = ""

        rating_prompt = f"""
You are an expert story critic. Rate this narrative event for coherence, creativity, and engagement, paying special attention to how it connects with prior context.

Use the **full 1–10 range** if warranted:
  - 1 → extremely incoherent, contradictory, or uninteresting
  - 2–4 → event has big flaws or is mostly unengaging
  - 5–6 → somewhat coherent or passable, but not particularly strong
  - 7–8 → a good event that is coherent, interesting, and mostly consistent
  - 9 → an excellent event, fresh or surprising yet still logical
  - 10 → near-perfect event with no apparent flaws

{domain_constraints_line}
Penalize heavily if any of the following occur:
  - The event violates the above domain constraints (if any) 
  - The event repeats prior text with no meaningful change
  - The event contradicts established facts or is obviously illogical
  - The event is dull or adds nothing new
  - The event includes gibberish or weird, nonsensical characters

Reward if:
  - The event is novel and contributes something interesting to the story
  - It remains logically consistent with prior context and timeline
  - It is creative, engaging, and adheres to any user-specified constraints

### Example Ratings
1. **Poor Event (score 2)**
   "There's an obvious timeline contradiction or unexplained character appearing out of nowhere."
2. **So-So Event (score 5)**
   "The event is coherent but bland, adds no real tension or new information."
3. **Excellent Event (score 9)**
   "The event heightens conflict in a fresh way, stays consistent with prior facts, and feels natural."

Only output **one integer** from 1 to 10.

NARRATIVE EVENT:
{event_text}
"""

        # Call the LLM
        llm_text = call_openai(
            prompt=rating_prompt,
            model=self.model_scoring,
            temperature=self.temperature_scoring
        )

        # Parse integer 1..10 from the LLM response
        try:
            score = int(re.findall(r'\d+', llm_text)[0])
            if score < 1 or score > 10:
                score = 5
        except:
            score = 5

        self.logger.info(
            "LLM scoring -> Event text:\n%s\nRaw response: %s\nFinal score: %s\n",
            event_text,
            llm_text,
            score
        )
        return float(score)

    EXPLORATION_CONSTANT = 0.7

    def run_mcts(self, 
                 root_id: int, 
                 max_children: int, 
                 scoring_prompt: str,
                 iterations: int = 10, 
                 scoring_depth: int = 1,
                 rollout_depth: int = 2,
                 desired_chain_length: int = None,
                 min_num_chains: int = None):
        """
        Orchestrates MCTS steps (selection, expansion, simulation, backprop).
        - We treat a node as “expandable” until it has 'max_children' children.
        - If a node’s children < max_children, we stop selection and expand.
        - Once a node is fully expanded, we can follow children with UCB1.
        - 'rollout_depth' expansions for deeper simulation, using the same 
          generate_next_event logic (but ephemeral).

        If 'desired_chain_length' and 'min_num_chains' are both provided,
        the MCTS loop will stop early once at least 'min_num_chains'
        distinct root->leaf paths reach exactly 'desired_chain_length' nodes,
        unless 'iterations' is reached first.
        """
        for i in range(iterations):
            self.logger.info("=== MCTS Iteration %d/%d ===", i+1, iterations)
            
            # 1) Selection
            path = self._select_path(root_id, max_children)
            leaf = path[-1]
            path_texts = [self.G.nodes[n]["text"] for n in path]
            self.logger.info(
                "Selected path (root -> leaf): %s",
                " -> ".join(path_texts)
            )

            # 2) Expansion
            expanded_node = self._maybe_expand(leaf, max_children)

            # 3) Simulation (with rollouts)
            score = self._simulate(expanded_node, scoring_prompt, scoring_depth, rollout_depth)
            self.logger.info("Simulation score for node %d: %s", expanded_node, score)

            # 4) Backpropagation
            self._backpropagate(path, score)

            # 5) (Optional) Early stopping if enough chains of desired length
            if desired_chain_length is not None and min_num_chains is not None:
                # Count how many root->leaf paths match the desired length
                matching_chains_count = self._count_paths_of_length(root_id, desired_chain_length)
                if matching_chains_count >= min_num_chains:
                    self.logger.info(
                        "Early stopping: found %d path(s) of length %d, meets/exceeds min_num_chains=%d.",
                        matching_chains_count,
                        desired_chain_length,
                        min_num_chains
                    )
                    break

    def _select_path(self, start_id: int, max_children: int):
        """
        Repeatedly descend using UCB1 while the node is fully expanded.
        If we encounter a node whose children < max_children, stop selection there.
        """
        path = [start_id]
        current_id = start_id
        while True:
            children = self.get_children(current_id)
            # If not fully expanded, treat it as leaf and stop
            if len(children) < max_children:
                break

            best_child = None
            best_value = -float('inf')
            parent_visits = self.G.nodes[current_id].get("mcts_visits", 1)
            if parent_visits < 1:
                parent_visits = 1

            for c in children:
                c_visits = self.G.nodes[c].get("mcts_visits", 0)
                c_total = self.G.nodes[c].get("mcts_total_score", 0.0)
                avg = (c_total / c_visits) if c_visits > 0 else 0.0

                # UCB1
                exploration = math.sqrt(math.log(parent_visits + 1) / (c_visits + 1e-6))
                ucb = avg + self.EXPLORATION_CONSTANT * exploration
                if ucb > best_value:
                    best_value = ucb
                    best_child = c

            if best_child is None:
                break

            path.append(best_child)
            current_id = best_child

        return path

    def _maybe_expand(self, leaf_id: int, max_children: int):
        """
        If leaf has fewer than max_children, add exactly ONE new child.
        Otherwise return the leaf as-is.
        """
        children = self.get_children(leaf_id)
        if len(children) >= max_children:
            return leaf_id  # already fully expanded

        leaf_data = self.G.nodes[leaf_id]
        new_event = self.generate_next_event(
            from_node=leaf_id,
            include_entity_graph=False,
            entities_description="",
            user_prompt="",  # or any custom prompt
            event_temperature=None
        )
        # Update prevGuessesForward to avoid repeats
        leaf_data["prevGuessesForward"].append(new_event["text"])

        # Create the new child node + edge
        child_id = self.add_event_node(
            text=new_event["text"]
        )
        self.G.add_edge(leaf_id, child_id, label="leads to")
        return child_id

    def _simulate(self, node_id: int, scoring_prompt: str, scoring_depth: int, rollout_depth: int):
        """
        1) Gather up to 'scoring_depth' events from this node's chain (backwards) 
           as initial context.
        2) Perform 'rollout_depth' ephemeral expansions using the same 
           'generate_next_event' logic but on a temporary node—so we don't 
           modify the real graph.
        3) Combine for final scoring.
        """
        # Gather chainSoFar up to 'scoring_depth'
        chain_so_far = []
        current = node_id
        depth_count = 0
        while depth_count < scoring_depth and current is not None:
            chain_so_far.append(self.G.nodes[current]["text"])
            parents = self.get_parents(current)
            if not parents:
                break
            current = parents[0]
            depth_count += 1
        chain_so_far.reverse()

        # We'll store ephemeral expansions in 'virtual_chain'
        virtual_chain = chain_so_far[:]

        # For each rollout step, create a temporary node so we can call generate_next_event
        for _ in range(rollout_depth):
            if not virtual_chain:
                break
            last_text = virtual_chain[-1]
            # Create a temporary node with minimal data
            temp_node_id = self.add_event_node(
                text=last_text,
                prevGuessesForward=[]
            )

            # Generate next event
            new_ev = self.generate_next_event(
                from_node=temp_node_id,
                include_entity_graph=False,
                entities_description="",
                user_prompt="",  # no special user prompt for ephemeral
                event_temperature=None
            )

            # Remove the temporary node from the graph
            self.G.remove_node(temp_node_id)

            # If we got a valid new text, append
            if new_ev["text"].strip():
                virtual_chain.append(new_ev["text"].strip())
            else:
                break

        # Combine into a single string for scoring
        combined_text = "\n".join(f"- {txt}" for txt in virtual_chain)
        score = self.score_event_with_openai(combined_text, scoring_prompt)
        return score

    def _backpropagate(self, path: list, score: float):
        """
        Add the final simulation score to all nodes in the path.
        """
        for node_id in path:
            old_visits = self.G.nodes[node_id].get("mcts_visits", 0)
            old_score = self.G.nodes[node_id].get("mcts_total_score", 0.0)
            self.G.nodes[node_id]["mcts_visits"] = old_visits + 1
            self.G.nodes[node_id]["mcts_total_score"] = old_score + score

    def _count_paths_of_length(self, root_id: int, desired_length: int) -> int:
        """
        Counts how many unique root->leaf paths have exactly 'desired_length' nodes.
        """
        all_paths = self.get_all_root_to_leaf_paths(root_id)
        count = 0
        for path in all_paths:
            if len(path) == desired_length:
                count += 1
        return count

    def plot_graph(self, title="Event Graph"):
        """
        Draws the directed graph using Graphviz's left-to-right layout.
        """
        try:
            from networkx.drawing.nx_agraph import graphviz_layout
        except ImportError:
            self.logger.error(
                "PyGraphviz is required for left-to-right layout. Install with: pip install pygraphviz"
            )
            return

        plt.figure(figsize=(12, 6))

        root_node_candidates = [n for n in self.G.nodes() if len(self.get_parents(n)) == 0]
        root_node = min(root_node_candidates) if root_node_candidates else None

        pos = graphviz_layout(self.G, prog="dot", args='-Grankdir=LR')

        nx.draw(
            self.G,
            pos,
            with_labels=False,
            node_color="lightblue",
            node_size=1500,
            font_size=8,
            arrows=True
        )

        node_labels = {n: self.G.nodes[n]["text"] for n in self.G.nodes()}
        nx.draw_networkx_labels(self.G, pos, labels=node_labels, font_size=8)

        edge_labels = nx.get_edge_attributes(self.G, "label")
        nx.draw_networkx_edge_labels(self.G, pos, edge_labels=edge_labels, font_color="red")

        plt.title(title)
        plt.axis("off")
        plt.show()

    def get_leaf_nodes(self):
        return [n for n in self.G.nodes if len(list(self.G.successors(n))) == 0]

    def get_all_root_to_leaf_paths(self, root_id):
        leaf_nodes = self.get_leaf_nodes()
        all_paths = []
        for leaf in leaf_nodes:
            for path in nx.all_simple_paths(self.G, source=root_id, target=leaf):
                all_paths.append(path)
        return all_paths

    def compute_path_score(self, path):
        scores = []
        for node_id in path:
            visits = self.G.nodes[node_id].get("mcts_visits", 0)
            total = self.G.nodes[node_id].get("mcts_total_score", 0.0)
            if visits > 0:
                scores.append(total / visits)
            else:
                scores.append(0.0)
        return sum(scores) / len(scores) if scores else 0.0

    def export_mcts_paths_as_csv(self, root_id, csv_filename="mcts_paths.csv"):
        all_paths = self.get_all_root_to_leaf_paths(root_id)
        paths_with_scores = []

        for path in all_paths:
            path_score = self.compute_path_score(path)
            path_text = " -> ".join(self.G.nodes[n]["text"] for n in path)
            paths_with_scores.append((path, path_score, path_text))

        paths_with_scores.sort(key=lambda x: x[1], reverse=True)

        with open(csv_filename, mode="w", newline="", encoding="utf-8") as f:
            writer = csv.writer(f)
            writer.writerow(["Rank", "Path Score", "Path (Node IDs)", "Path (Event Text)"])
            rank = 1
            for path, score, text in paths_with_scores:
                writer.writerow([
                    rank,
                    f"{score:.3f}",
                    " -> ".join(str(pid) for pid in path),
                    text
                ])
                rank += 1

        self.logger.info(
            "Wrote %d paths to %s",
            len(paths_with_scores),
            csv_filename
        )
    
    def get_top_path(self, root_id: int):
        all_paths = self.get_all_root_to_leaf_paths(root_id)
        if not all_paths:
            # No children => top path is just the root
            return [root_id], f"- {self.G.nodes[root_id]['text']}"

        scored_paths = []
        for path in all_paths:
            path_score = self.compute_path_score(path)
            scored_paths.append((path, path_score))

        scored_paths.sort(key=lambda x: x[1], reverse=True)
        top_path, top_score = scored_paths[0]

        bullet_str = "\n".join(f"- {self.G.nodes[n]['text']}" for n in top_path)
        return top_path, bullet_str
