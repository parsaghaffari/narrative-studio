import * as React from 'react';
import * as go from 'gojs';

import { Accordion, Panel } from 'baseui/accordion';
import { ParagraphXSmall } from 'baseui/typography';
import { Input, SIZE } from 'baseui/input';
import { Button } from 'baseui/button';
import { Slider } from 'baseui/slider';

import { EventsDiagramWrapper } from './EventsDiagramWrapper';
import { SelectionInspector } from '../inspector/SelectionInspector';
import { EventGeneratorSettings } from './EventGeneratorSettings';

import { runMcts, simulate, printMctsPaths } from '../../mcts';
import { judgeNarrative } from '../../utils';

interface EventsPaneProps {
  // State pieces relevant to events
  eventsModelData: go.ObjectData;
  eventsNodeDataArray: go.ObjectData[];
  eventsLinkDataArray: go.ObjectData[];
  eventsSelectedData: go.ObjectData | null;
  eventsSkipsDiagramUpdate: boolean;

  // Handlers
  updateEventsModelData: (field: string, value: any) => void;
  handleEventsDiagramEvent: (e: go.DiagramEvent) => void;
  handleEventsModelChange: (obj: go.IncrementalData) => void;
  handleEventNodeRemoved: (nodeKey: any, nodeText: string) => void;
  
  // Optional function to expose diagram relayout capability
  setRelayoutDiagramFunction?: (relayoutFn: () => void) => void;
}

export const EventsPane: React.FC<EventsPaneProps> = (props) => {
  const {
    eventsModelData,
    eventsNodeDataArray,
    eventsLinkDataArray,
    eventsSelectedData,
    eventsSkipsDiagramUpdate,
    updateEventsModelData,
    handleEventsDiagramEvent,
    handleEventsModelChange,
    handleEventNodeRemoved,
    setRelayoutDiagramFunction
  } = props;
  const [mctsPrompt, setMctsPrompt] = React.useState<string>(
    ''
  );
  const [mctsMaxChildren, setMctsMaxChildren] = React.useState<number>(3);
  const [mctsIterations, setMctsIterations] = React.useState<number>(10);

  // The selected node’s key (root for MCTS)
  const [selectedRootKey, setSelectedRootKey] = React.useState<number | null>(null);

  // A loading state for the MCTS run
  const [isMctsRunning, setIsMctsRunning] = React.useState<boolean>(false);

  const [mctsScoringDepth, setMctsScoringDepth] = React.useState<number>(1);

  const handleDiagramEventWrapper = (e: go.DiagramEvent) => {
    handleEventsDiagramEvent(e);

    const diagram = e.diagram;
    if (!diagram) return;
    const sel = diagram.selection.first();
    if (sel instanceof go.Node) {
      setSelectedRootKey(sel.key as number);
    } else {
      setSelectedRootKey(null);
    }
  };

  const diagramRef = React.useRef<EventsDiagramWrapper>(null);
  
  // Expose the relayout function to parent components if needed
  React.useEffect(() => {
    if (setRelayoutDiagramFunction) {
      setRelayoutDiagramFunction(() => {
        const diagram = diagramRef.current?.getDiagram();
        if (diagram) {
          diagram.layoutDiagram(true);
        }
      });
    }
  }, [setRelayoutDiagramFunction]);

  async function runMctsSearch() {
    if (selectedRootKey === null) {
      alert('Please select a node to use as the MCTS root');
      return;
    }
    const diagram = diagramRef.current?.getDiagram();
    if (!diagram) {
      alert('Diagram not available');
      return;
    }

    setIsMctsRunning(true);
    try {
      await runMcts(
        diagram,
        selectedRootKey,
        mctsMaxChildren,
        mctsPrompt,
        mctsIterations,
        (d) => d.layoutDiagram(true),
        mctsScoringDepth
      );
      diagram.layoutDiagram(true);
    } catch (err) {
      console.error('MCTS error:', err);
    } finally {
      setIsMctsRunning(false);
    }
  }

  async function scoreSelectedNode() {
    if (selectedRootKey === null) {
      alert('Please select a node to score');
      return;
    }
    const diagram = diagramRef.current?.getDiagram();
    if (!diagram) {
      alert('Diagram not available');
      return;
    }
    try {
      const score = await simulate(diagram, selectedRootKey, mctsPrompt, mctsScoringDepth);
      console.log(`Scored selected node (key=${selectedRootKey}): score = ${score}`);
    } catch (err) {
      console.error('Error scoring node:', err);
    }
  }

  function printPaths() {
    if (selectedRootKey === null) {
      alert('Please select a node to use as the MCTS root');
      return;
    }
    const diagram = diagramRef.current?.getDiagram();
    if (!diagram) {
      alert('Diagram not available');
      return;
    }
    try {
      printMctsPaths(diagram, selectedRootKey);
    } catch (err) {
      console.error('Error printing MCTS paths:', err);
    }
  }

  async function judgeNarrativeForSelectedPath() {
    if (selectedRootKey === null) {
      alert('Please select a node to use as the narrative leaf');
      return;
    }
    const diagram = diagramRef.current?.getDiagram();
    if (!diagram) {
      alert('Diagram not available');
      return;
    }
    // Gather the full narrative from the root ancestor to the selected node.
    const narrativeParts: string[] = [];
    let current = diagram.findNodeForKey(selectedRootKey);
    while (current) {
      // Prepend to build the narrative from root to leaf.
      narrativeParts.unshift(current.data.text);
      current = current.findTreeParentNode();
    }
    const narrative = narrativeParts.join("\n");

    try {
      const judgeResult = await judgeNarrative(narrative, "o1");
      console.log(`Judge Narrative result for narrative:\n${narrative}\nResult:`, judgeResult);
    } catch (err) {
      console.error('Error judging narrative:', err);
    }
  }

  return (
    <div className="events-pane-wrapper">
      <div className="pane-label">
        Scenario builder
        <ParagraphXSmall>
          Explore cause and effect relationships between events.
          <ul>
            <li>Rename the "Start" node by double clicking on it to start</li>
            <li>Edit the Start node and type a short description of your starting event</li>
            <li>Click the arrow buttons to generate new events, or run MCTS below</li>
          </ul>
        </ParagraphXSmall>
      </div>

      <div className="controls">
        <Accordion accordion>
          <Panel title="Generator Settings">
            <EventGeneratorSettings
              modelData={eventsModelData}
              setEventPrompt={(val) => updateEventsModelData('eventPrompt', val)}
              setEventLikelihood={(val) => updateEventsModelData('eventLikelihood', val)}
              setEventSeverity={(val) => updateEventsModelData('eventSeverity', val)}
              setEventTemperature={(val) => updateEventsModelData('eventTemperature', val)}
              setUseGpt4={(val) => updateEventsModelData('useGpt4', val)}
              setIncludeEntityGraph={(val) => updateEventsModelData('includeEntityGraph', val)}
            />
          </Panel>

          <Panel title="Monte Carlo Tree Search">
            <ParagraphXSmall>Prompt (scoring instructions):</ParagraphXSmall>
            <Input
              value={mctsPrompt}
              onChange={(e) => setMctsPrompt(e.currentTarget.value)}
              size={SIZE.mini}
              placeholder="Rate events from 1..10"
              clearOnEscape
            />
            <br />

            <ParagraphXSmall>Max Children per node (N):</ParagraphXSmall>
            <Input
              value={mctsMaxChildren}
              onChange={(e) => setMctsMaxChildren(Number(e.currentTarget.value))}
              size={SIZE.mini}
              type="number"
              clearOnEscape
            />
            <br />

            <ParagraphXSmall>MCTS Iterations:</ParagraphXSmall>
            <Input
              value={mctsIterations}
              onChange={(e) => setMctsIterations(Number(e.currentTarget.value))}
              size={SIZE.mini}
              type="number"
              clearOnEscape
            />
            <br />

            <ParagraphXSmall>Scoring Depth (Steps Back):</ParagraphXSmall>
            <Slider
              min={1}
              max={10}
              value={[mctsScoringDepth]}
              onChange={({ value }) => value && setMctsScoringDepth(value[0])}
            />
            <br />

            <Button
              onClick={runMctsSearch}
              isLoading={isMctsRunning}
              disabled={isMctsRunning || selectedRootKey === null}
            >
              Run MCTS
            </Button>
            <br style={{ margin: '10px 0' }} />
            <Button
              onClick={scoreSelectedNode}
              disabled={isMctsRunning || selectedRootKey === null}
            >
              Score Selected Node
            </Button>
            <br style={{ margin: '10px 0' }} />
            <Button
              onClick={printPaths}
              disabled={isMctsRunning || selectedRootKey === null}
            >
              Print MCTS Paths
            </Button>
            <br style={{ margin: '10px 0' }} />
            <Button
              onClick={judgeNarrativeForSelectedPath}
              disabled={isMctsRunning || selectedRootKey === null}
            >
              Judge Narrative
            </Button>
          </Panel>
        </Accordion>
      </div>

      <div className="inspector-container">
        {eventsSelectedData && (
          <SelectionInspector selectedData={eventsSelectedData} />
        )}
      </div>

      <EventsDiagramWrapper
        ref={diagramRef}
        nodeDataArray={eventsNodeDataArray}
        linkDataArray={eventsLinkDataArray}
        modelData={eventsModelData}
        skipsDiagramUpdate={eventsSkipsDiagramUpdate}
        onDiagramEvent={handleDiagramEventWrapper}
        onModelChange={handleEventsModelChange}
        onNodeRemoved={handleEventNodeRemoved}
      />
    </div>
  );
};
