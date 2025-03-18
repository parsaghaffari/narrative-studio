import * as React from 'react';
import * as go from 'gojs';
import { useImmer } from 'use-immer';

import { Client as Styletron } from 'styletron-engine-monolithic';
import { Provider as StyletronProvider } from 'styletron-react';
import { LightTheme, BaseProvider } from 'baseui';
import {
  HeaderNavigation,
  ALIGN,
  StyledNavigationList,
  StyledNavigationItem
} from 'baseui/header-navigation';

import './App.css';
import { EventsPane } from './components/events/EventsPane';
import { EntitiesPane } from './components/entities/EntitiesPane';
import { LoadSaveControls } from './components/ui/LoadSaveControls';

export interface EventsAppState {
  eventsNodeDataArray: go.ObjectData[];
  eventsLinkDataArray: go.ObjectData[];
  eventsModelData: go.ObjectData;
  eventsSelectedData: go.ObjectData | null;
  eventsSkipsDiagramUpdate: boolean;
}

export interface EntitiesAppState {
  entitiesNodeDataArray: go.ObjectData[];
  entitiesLinkDataArray: go.ObjectData[];
  entitiesModelData: go.ObjectData;
  entitiesSelectedData: go.ObjectData | null;
  entitiesSkipsDiagramUpdate: boolean;
}

export interface AppState extends EventsAppState, EntitiesAppState {
  activeKey: string;
  isLoading: boolean;
}

const initialState: AppState = {
  eventsNodeDataArray: [
    {
      key: 9999,
      text: 'Start - double click me to edit',
      loc: '0 0',
      prevGuessesForward: [],
      prevGuessesBackward: []
    }
  ],
  eventsLinkDataArray: [],
  eventsModelData: {
    canRelink: false,
    eventPrompt: '',
    eventLikelihood: [3],
    eventSeverity: [3],
    eventTemperature: [0.8],
    entitiesDescription: '',
    useGpt4: true,
    includeEntityGraph: true
  },
  eventsSelectedData: null,
  eventsSkipsDiagramUpdate: false,

  entitiesNodeDataArray: [],
  entitiesLinkDataArray: [],
  entitiesModelData: {
    canRelink: false,
    forceLayout: false,
    entitiesPrompt: '',
    entityTypes: [],
    relationshipTypes: [],
    includeExistingGraph: false
  },
  entitiesSelectedData: null,
  entitiesSkipsDiagramUpdate: false,

  activeKey: '0',
  isLoading: false
};

const engine = new Styletron();

const App: React.FC = () => {
  const [state, updateState] = useImmer<AppState>(initialState);

  const [leftWidth, setLeftWidth] = React.useState<number>(
    typeof window !== 'undefined' ? window.innerWidth * 0.5 : 400
  );
  const [isResizing, setIsResizing] = React.useState<boolean>(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [relayoutEventsDiagram, setRelayoutEventsDiagram] = React.useState<(() => void) | null>(null);

  function handleMouseDown(e: React.MouseEvent) {
    setIsResizing(true);
  }

  function handleMouseMove(e: React.MouseEvent) {
    if (!isResizing) return;
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    let newWidth = e.clientX - rect.left;
    if (newWidth < 200) newWidth = 200;
    if (newWidth > rect.width - 200) newWidth = rect.width - 200;
    setLeftWidth(newWidth);
  }

  function handleMouseUp(e: React.MouseEvent) {
    setIsResizing(false);
  }

  const mapNodeKeyIdx = React.useRef<Map<go.Key, number>>(new Map());
  const mapLinkKeyIdx = React.useRef<Map<go.Key, number>>(new Map());

  const refreshNodeIndex = React.useCallback((nodeArr: go.ObjectData[]) => {
    mapNodeKeyIdx.current.clear();
    nodeArr.forEach((n, idx) => mapNodeKeyIdx.current.set(n.key, idx));
  }, []);

  const refreshLinkIndex = React.useCallback((linkArr: go.ObjectData[]) => {
    mapLinkKeyIdx.current.clear();
    linkArr.forEach((l, idx) => mapLinkKeyIdx.current.set(l.key, idx));
  }, []);

  React.useEffect(() => {
    refreshNodeIndex(state.eventsNodeDataArray);
    refreshLinkIndex(state.eventsLinkDataArray);
  }, []);

  const updateEventsModelData = (field: string, value: any) => {
    updateState((draft) => {
      (draft.eventsModelData as any)[field] = value;
      draft.eventsSkipsDiagramUpdate = false;
    });
  };

  const updateEntitiesModelData = (field: string, value: any) => {
    updateState((draft) => {
      (draft.entitiesModelData as any)[field] = value;
      draft.entitiesSkipsDiagramUpdate = false;
    });
  };

  const setAppLoading = (val: boolean) => {
    updateState((draft) => {
      draft.isLoading = val;
    });
  };

  const handleDiagramEventBase = (
    e: go.DiagramEvent,
    stateKey: 'events' | 'entities'
  ) => {
    if (e.name === 'ChangedSelection') {
      const sel = e.subject.first();
      updateState((draft) => {
        const nodeArrKey = stateKey + 'NodeDataArray' as keyof AppState;
        const linkArrKey = stateKey + 'LinkDataArray' as keyof AppState;
        const selectedKey = stateKey + 'SelectedData' as keyof AppState;

        if (sel) {
          if (sel instanceof go.Node) {
            const idx = mapNodeKeyIdx.current.get(sel.key);
            if (idx !== undefined && idx >= 0) {
              draft[selectedKey] = (draft[nodeArrKey] as go.ObjectData[])[idx];
            }
          } else if (sel instanceof go.Link) {
            const idx = mapLinkKeyIdx.current.get(sel.key);
            if (idx !== undefined && idx >= 0) {
              draft[selectedKey] = (draft[linkArrKey] as go.ObjectData[])[idx];
            }
          }
        } else {
          draft[selectedKey] = null;
        }
      });
    }
  };

  const handleEventsDiagramEvent = (e: go.DiagramEvent) =>
    handleDiagramEventBase(e, 'events');

  const handleEntitiesDiagramEvent = (e: go.DiagramEvent) =>
    handleDiagramEventBase(e, 'entities');

  const handleModelChangeBase = (
    obj: go.IncrementalData,
    stateKey: 'events' | 'entities'
  ) => {
    if (state.isLoading) return;

    const insertedNodeKeys = obj.insertedNodeKeys;
    const modifiedNodeData = obj.modifiedNodeData;
    const removedNodeKeys = obj.removedNodeKeys;

    const insertedLinkKeys = obj.insertedLinkKeys;
    const modifiedLinkData = obj.modifiedLinkData;
    const removedLinkKeys = obj.removedLinkKeys;
    const modifiedModelData = obj.modelData;

    const nodeArrKey = stateKey + 'NodeDataArray' as keyof AppState;
    const linkArrKey = stateKey + 'LinkDataArray' as keyof AppState;
    const selectedKey = stateKey + 'SelectedData' as keyof AppState;
    const modelDataKey = stateKey + 'ModelData' as keyof AppState;
    const skipKey = stateKey + 'SkipsDiagramUpdate' as keyof AppState;

    const modifiedNodeMap = new Map<go.Key, go.ObjectData>();
    const modifiedLinkMap = new Map<go.Key, go.ObjectData>();

    updateState((draft) => {
      let narr = draft[nodeArrKey] as go.ObjectData[];
      let larr = draft[linkArrKey] as go.ObjectData[];

      if (modifiedNodeData) {
        modifiedNodeData.forEach((nd) => {
          modifiedNodeMap.set(nd.key, nd);
          const idx = mapNodeKeyIdx.current.get(nd.key);
          if (idx !== undefined && idx >= 0) {
            narr[idx] = nd;
            if (
              draft[selectedKey] &&
              (draft[selectedKey] as go.ObjectData).key === nd.key
            ) {
              draft[selectedKey] = nd;
            }
          }
        });
      }

      if (insertedNodeKeys) {
        insertedNodeKeys.forEach((key) => {
          const nd = modifiedNodeMap.get(key);
          const idx = mapNodeKeyIdx.current.get(key);
          if (nd && idx === undefined) {
            mapNodeKeyIdx.current.set(nd.key, narr.length);
            narr.push(nd);
          }
        });
      }

      if (removedNodeKeys) {
        narr = narr.filter((nd) => !removedNodeKeys.includes(nd.key));
        draft[nodeArrKey] = narr;
        refreshNodeIndex(narr);
      }

      if (modifiedLinkData) {
        modifiedLinkData.forEach((ld) => {
          modifiedLinkMap.set(ld.key, ld);
          const idx = mapLinkKeyIdx.current.get(ld.key);
          if (idx !== undefined && idx >= 0) {
            larr[idx] = ld;
            if (
              draft[selectedKey] &&
              (draft[selectedKey] as go.ObjectData).key === ld.key
            ) {
              draft[selectedKey] = ld;
            }
          }
        });
      }

      if (insertedLinkKeys) {
        insertedLinkKeys.forEach((key) => {
          const ld = modifiedLinkMap.get(key);
          const idx = mapLinkKeyIdx.current.get(key);
          if (ld && idx === undefined) {
            mapLinkKeyIdx.current.set(ld.key, larr.length);
            larr.push(ld);
          }
        });
      }

      if (removedLinkKeys) {
        larr = larr.filter((ld) => !removedLinkKeys.includes(ld.key));
        draft[linkArrKey] = larr;
        refreshLinkIndex(larr);
      }

      if (modifiedModelData) {
        draft[modelDataKey] = modifiedModelData;
      }

      draft[skipKey] = true;

      if (stateKey === 'entities') {
        draft.eventsModelData.entitiesDescription = getTextualGraphRepresentation(
          draft.entitiesNodeDataArray,
          draft.entitiesLinkDataArray
        ).join('\n');
        draft.eventsSkipsDiagramUpdate = false;
      }
    });
  };

  const handleEventsModelChange = (obj: go.IncrementalData) =>
    handleModelChangeBase(obj, 'events');
  const handleEntitiesModelChange = (obj: go.IncrementalData) =>
    handleModelChangeBase(obj, 'entities');

  const handleEventNodeRemoved = (nodeKey: any, nodeText: string) => {
    updateState((draft) => {
      draft.eventsNodeDataArray.forEach((n: any) => {
        if (n.prevGuessesForward) {
          n.prevGuessesForward = n.prevGuessesForward.filter(
            (txt: string) => txt !== nodeText
          );
        }
        if (n.prevGuessesBackward) {
          n.prevGuessesBackward = n.prevGuessesBackward.filter(
            (txt: string) => txt !== nodeText
          );
        }
      });
    });
  };

  const getTextualGraphRepresentation = (
    nodeDataArray: go.ObjectData[],
    linkDataArray: go.ObjectData[]
  ): string[] => {
    const keyToTextMap: Record<number, string> = {};
    nodeDataArray.forEach((node) => {
      keyToTextMap[node.key] = node.text;
    });
    return linkDataArray.map((link) => {
      const fromText = keyToTextMap[link.from];
      const toText = keyToTextMap[link.to];
      return `- <${fromText}> <${link.text}> <${toText}>`;
    });
  };

  return (
    <StyletronProvider value={engine}>
      <BaseProvider theme={LightTheme}>
        <div className="navbar">
          <HeaderNavigation>
            <StyledNavigationList $align={ALIGN.left}>
              <StyledNavigationItem>
                💫 <b>Narrative Studio</b>
              </StyledNavigationItem>
            </StyledNavigationList>
            <StyledNavigationList $align={ALIGN.center} />
            <StyledNavigationList $align={ALIGN.right}>
              <LoadSaveControls
                appState={state}
                updateState={updateState}
                refreshNodeIndex={refreshNodeIndex}
                refreshLinkIndex={refreshLinkIndex}
                relayoutEventsDiagram={relayoutEventsDiagram || undefined}
              />
            </StyledNavigationList>
          </HeaderNavigation>
        </div>

        <div
          className="container"
          ref={containerRef}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        >
          <div
            className="pane left-pane"
            style={{ width: leftWidth }}
          >
            <EventsPane
              eventsModelData={state.eventsModelData}
              eventsNodeDataArray={state.eventsNodeDataArray}
              eventsLinkDataArray={state.eventsLinkDataArray}
              eventsSelectedData={state.eventsSelectedData}
              eventsSkipsDiagramUpdate={state.eventsSkipsDiagramUpdate}
              updateEventsModelData={updateEventsModelData}
              handleEventsDiagramEvent={handleEventsDiagramEvent}
              handleEventsModelChange={handleEventsModelChange}
              handleEventNodeRemoved={handleEventNodeRemoved}
              setRelayoutDiagramFunction={setRelayoutEventsDiagram}
            />
          </div>

          <div
            className="resizer"
            onMouseDown={handleMouseDown}
          />

          <div className="pane right-pane">
            <EntitiesPane
              entitiesModelData={state.entitiesModelData}
              entitiesNodeDataArray={state.entitiesNodeDataArray}
              entitiesLinkDataArray={state.entitiesLinkDataArray}
              entitiesSelectedData={state.entitiesSelectedData}
              entitiesSkipsDiagramUpdate={state.entitiesSkipsDiagramUpdate}
              isLoading={state.isLoading}
              updateEntitiesModelData={updateEntitiesModelData}
              handleEntitiesDiagramEvent={handleEntitiesDiagramEvent}
              handleEntitiesModelChange={handleEntitiesModelChange}
              setAppLoading={setAppLoading}
            />
          </div>
        </div>
      </BaseProvider>
    </StyletronProvider>
  );
};

export default App;
