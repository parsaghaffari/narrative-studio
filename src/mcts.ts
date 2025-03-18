import * as go from 'gojs';
import { generateNextEvent, scoreEventWithOpenAI } from './utils';

interface MctsMetadata {
  visits: number;
  totalScore: number;
}

interface EventNodeData extends go.ObjectData {
  key: number;
  text: string;
  loc?: string;
  mcts?: MctsMetadata;
}

const EXPLORATION_CONSTANT = 0.7;

export async function runMcts(
  diagram: go.Diagram,
  rootKey: number,
  maxChildren: number,
  prompt: string,
  iterations: number,
  onNodeAdded?: (diagram: go.Diagram) => void,
  scoringDepth?: number
): Promise<void> {
  for (let i = 0; i < iterations; i++) {
    console.group(`MCTS iteration ${i + 1} / ${iterations}`);

    const path = select(diagram, rootKey, maxChildren);
    const leafKey = path[path.length - 1];

    const pathOfTexts = path.map(k => getNodeData(diagram, k)?.text ?? '(missing)');
    console.log('Selected path (root -> leaf):', pathOfTexts);

    const expandedNodeKey = await maybeExpand(
      diagram,
      leafKey,
      maxChildren,
      path,
      onNodeAdded
    );

    const score = await simulate(
      diagram,
      expandedNodeKey,
      prompt,
      scoringDepth,
      /* rolloutDepth */ 2
    );
    console.log(`Simulated node key ${expandedNodeKey}; received score: ${score}`);

    backpropagate(diagram, path, score);

    console.groupEnd(); 
  }
}

function select(diagram: go.Diagram, startKey: number, maxChildren: number): number[] {
  const path = [startKey];
  let currentKey = startKey;

  while (true) {
    const nodeData = getNodeData(diagram, currentKey);
    if (!nodeData) break;

    const children = getChildren(diagram, currentKey);

    // If node is not "fully expanded", we consider it a leaf -> stop
    if (children.length < maxChildren) {
      break;
    }
    
    // If it has children and is fully expanded, pick the best child
    let bestChildKey = -1;
    let bestValue = -Infinity;
    const parentVisits = nodeData.mcts?.visits || 1;

    for (const cKey of children) {
      const cData = getNodeData(diagram, cKey);
      if (!cData) continue;

      const childVisits = cData.mcts?.visits || 0;
      const childTotal = cData.mcts?.totalScore || 0;
      const average = (childVisits === 0) ? 0 : childTotal / childVisits;

      // UCB1
      const exploration = Math.sqrt(Math.log(parentVisits + 1) / (childVisits + 1e-6));
      const ucb1 = average + EXPLORATION_CONSTANT * exploration;

      if (ucb1 > bestValue) {
        bestValue = ucb1;
        bestChildKey = cKey;
      }
    }

    if (bestChildKey < 0) break;

    path.push(bestChildKey);
    currentKey = bestChildKey;
  }

  return path;
}

async function maybeExpand(
  diagram: go.Diagram,
  leafKey: number,
  maxChildren: number,
  path: number[],
  onNodeAdded?: (diagram: go.Diagram) => void
): Promise<number> {
  const nodeData = getNodeData(diagram, leafKey);
  if (!nodeData) return leafKey;

  // Already fully expanded?
  const children = getChildren(diagram, leafKey);
  if (children.length >= maxChildren) {
    return leafKey; // no expansion
  }

  // We can add one child
  console.log(`Expanding leaf node (key=${leafKey}). So far it has ${children.length} children; max=${maxChildren}.`);
  const chainOfTexts = path.map(k => getNodeData(diagram, k)?.text ?? '(missing)');

  // -- Call the single-event generation function
  const newEvent = await generateNextEvent(nodeData, chainOfTexts, diagram.model.modelData);

  diagram.model.startTransaction('MCTS-expansion');
  // Create the new node
  const newNodeData = {
    key: getNextUniqueKey(diagram),
    text: newEvent.text,
    eventSeverity: newEvent.eventSeverity,
    parent: leafKey,
    loc: nodeData.loc,
    mcts: { visits: 0, totalScore: 0 }
  };
  diagram.model.addNodeData(newNodeData);
  // Add a link
  diagram.model.addLinkData({
    from: leafKey,
    to: newNodeData.key,
    text: 'leads to',
    probability: (newEvent.eventLikelihood?.[0] ?? 3) / 5
  });
  diagram.model.commitTransaction('MCTS-expansion');

  if (onNodeAdded) onNodeAdded(diagram);

  console.log(`Created new child node (key=${newNodeData.key}): "${newEvent.text}"`);
  return newNodeData.key;
}

export async function simulate(
  diagram: go.Diagram,
  nodeKey: number,
  prompt: string,
  scoringDepth: number = 1,
  rolloutDepth: number = 2
): Promise<number> {
  const nd = getNodeData(diagram, nodeKey);
  if (!nd) return 0;

  // Gather recent chain to provide context
  const chainSoFar = getRecentChain(diagram, nodeKey, scoringDepth);

  // We'll store the chain of newly-generated events in memory
  const rolloutEvents: string[] = [];

  let virtualChain = [...chainSoFar];

  for (let step = 0; step < rolloutDepth; step++) {
    // Generate exactly ONE future event in memory
    const newEvent = await generateNextEvent(
      { text: virtualChain[virtualChain.length - 1] || "" }, 
      virtualChain,
      diagram.model.modelData
    );

    if (newEvent.text) {
      rolloutEvents.push(newEvent.text);
      virtualChain.push(newEvent.text);
    } else {
      break; // no new text => stop rollout
    }
  }

  // Combine for scoring
  const combinedText = [
    ...chainSoFar.map(x => `- ${x}`),
    ...rolloutEvents.map(x => `- ${x}`)
  ].join("\n");

  try {
    const score = await scoreEventWithOpenAI(combinedText, prompt);
    return score;
  } catch (err) {
    console.error('Error in LLM scoring (deeper rollout):', err);
    return 5; // fallback
  }
}

function backpropagate(diagram: go.Diagram, path: number[], score: number): void {
  diagram.model.startTransaction('MCTS-backprop');
  for (const key of path) {
    const nd = getNodeData(diagram, key);
    if (!nd) continue;

    const oldVisits = nd.mcts?.visits ?? 0;
    const oldScore = nd.mcts?.totalScore ?? 0;

    diagram.model.setDataProperty(nd, 'mcts', {
      visits: oldVisits + 1,
      totalScore: oldScore + score
    });
  }
  diagram.model.commitTransaction('MCTS-backprop');
}

function getNodeData(diagram: go.Diagram, nodeKey: number): EventNodeData | undefined {
  const data = diagram.model.findNodeDataForKey(nodeKey);
  return data as EventNodeData | undefined;
}

function getChildren(diagram: go.Diagram, parentKey: number): number[] {
  const linkDataArray = diagram.model.linkDataArray as any[];
  return linkDataArray
    .filter(link => link.from === parentKey)
    .map(link => link.to);
}

function getNextUniqueKey(diagram: go.Diagram): number {
  const model = diagram.model as go.GraphLinksModel;
  const temp: any = {};
  model.makeUniqueKeyFunction(model, temp);
  return temp.key;
}

function getRecentChain(diagram: go.Diagram, nodeKey: number, steps: number): string[] {
  const chain: string[] = [];
  let current = diagram.findNodeForKey(nodeKey);
  while (current && steps > 0) {
    chain.unshift(current.data.text);
    current = current.findTreeParentNode();
    steps--;
  }
  return chain;
}

function getAllPaths(diagram: go.Diagram, currentKey: number): number[][] {
  const children = getChildren(diagram, currentKey);
  if (children.length === 0) {
    return [[currentKey]];
  }
  let allPaths: number[][] = [];
  for (const childKey of children) {
    const subPaths = getAllPaths(diagram, childKey);
    for (const subPath of subPaths) {
      allPaths.push([currentKey, ...subPath]);
    }
  }
  return allPaths;
}

function computePathScore(diagram: go.Diagram, path: number[]): number {
  const scores = path.map(key => {
    const node = getNodeData(diagram, key);
    if (node && node.mcts && node.mcts.visits > 0) {
      return node.mcts.totalScore / node.mcts.visits;
    }
    return 0;
  });
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

export function printMctsPaths(diagram: go.Diagram, rootKey: number): void {
  const allPaths = getAllPaths(diagram, rootKey);
  const scoredPaths = allPaths.map(path => ({
    path,
    score: computePathScore(diagram, path)
  }));
  scoredPaths.sort((a, b) => b.score - a.score);

  console.log("MCTS paths from root to leaf ranked by score (highest to lowest):");
  scoredPaths.forEach((entry, index) => {
    const pathNodeIds = entry.path.join(" -> ");
    const pathTexts = entry.path
      .map(key => getNodeData(diagram, key)?.text ?? "(missing)")
      .join(" -> ");
    console.log(
      `Rank ${index + 1}: Score ${entry.score.toFixed(3)} | Node IDs: ${pathNodeIds} | Text: ${pathTexts}`
    );
  });
}
