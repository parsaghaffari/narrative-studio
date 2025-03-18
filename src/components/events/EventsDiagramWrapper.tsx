import * as go from 'gojs';
import { ReactDiagram } from 'gojs-react';
import * as React from 'react';

import { generateNextEvent, generatePreviousEvent, generateAqlFromOpenAI } from '../../utils';

interface DiagramProps {
  nodeDataArray: Array<go.ObjectData>;
  linkDataArray: Array<go.ObjectData>;
  modelData: go.ObjectData;
  skipsDiagramUpdate: boolean;
  onDiagramEvent: (e: go.DiagramEvent) => void;
  onModelChange: (e: go.IncrementalData) => void;
  onNodeRemoved?: (nodeKey: any, nodeText: string) => void;
}

export class EventsDiagramWrapper extends React.Component<DiagramProps, {}> {
  private diagramRef: React.RefObject<ReactDiagram>;
  private diagramStyle = { backgroundColor: '#eee' };

  constructor(props: DiagramProps) {
    super(props);
    this.diagramRef = React.createRef();
  }

  public componentDidMount() {
    if (!this.diagramRef.current) return;
    const diagram = this.diagramRef.current.getDiagram();
    if (diagram instanceof go.Diagram) {
      diagram.addDiagramListener('ChangedSelection', this.props.onDiagramEvent);
      diagram.addDiagramListener('SelectionDeleted', e => {
        e.subject.each(part => {
          if (part instanceof go.Node && this.props.onNodeRemoved) {
            this.props.onNodeRemoved(part.key, part.data.text);
          }
        });
      });
    }
  }

  public componentWillUnmount() {
    if (!this.diagramRef.current) return;
    const diagram = this.diagramRef.current.getDiagram();
    if (diagram instanceof go.Diagram) {
      diagram.removeDiagramListener('ChangedSelection', this.props.onDiagramEvent);
    }
  }

  public getDiagram(): go.Diagram | null {
    return this.diagramRef.current?.getDiagram() ?? null;
  }

  private initDiagram(): go.Diagram {
    class DragLinkingTool extends go.DraggingTool {
      constructor(init: any) {
        super();
        this.isGridSnapEnabled = true;
        this.isGridSnapRealtime = false;
        this.gridSnapCellSize = new go.Size(182, 1);
        this.gridSnapOrigin = new go.Point(5.5, 0);
        if (init) Object.assign(this, init);
      }

      doActivate() {
        const diagram = this.diagram;
        if (!diagram) return;
        this.standardMouseSelect();
        const main = this.currentPart;
        if (main instanceof go.Link) {
          const relinkingtool = diagram.toolManager.relinkingTool;
          relinkingtool.originalLink = main;
          diagram.currentTool = relinkingtool;
          relinkingtool.doActivate();
          relinkingtool.doMouseMove();
        } else {
          super.doActivate();
        }
      }
    }

    const $ = go.GraphObject.make;

    const myDiagram = $(go.Diagram, {
      allowCopy: false,
      layout: new go.LayeredDigraphLayout({
        setsPortSpots: false,
        columnSpacing: 5,
        isInitial: false,
        isOngoing: false
      }),
      validCycle: go.CycleMode.NotDirected,
      'undoManager.isEnabled': true,
      model: new go.GraphLinksModel({
        linkKeyProperty: 'key',
        makeUniqueKeyFunction: (m: go.Model, data: any) => {
          let k = data.key || 1000;
          while (m.findNodeDataForKey(k)) k++;
          data.key = k;
          return k;
        },
        makeUniqueLinkKeyFunction: (m: go.GraphLinksModel, data: any) => {
          let k = data.key || -1000;
          while (m.findLinkDataForKey(k)) k--;
          data.key = k;
          return k;
        }
      })
    });

    myDiagram.nodeTemplate = $(
      go.Node,
      'Spot',
      {
        locationObjectName: 'MAINSPOT',
        selectionAdorned: false,
        textEditable: true
      },
      new go.Binding('location', 'loc', go.Point.parse).makeTwoWay(go.Point.stringify),

      $(
        go.Panel,
        'Spot',
        { name: 'MAINSPOT' },
        $(
          go.Panel,
          'Auto',
          { name: 'MAINSHAPE' },
          $(
            go.Shape,
            'RoundedRectangle',
            {
              stroke: 'gray',
              minSize: new go.Size(120, 21)
            }
          )
            .bindObject('fill', 'isSelected', s => (s ? 'dodgerblue' : 'whitesmoke'))
            .bind('opacity', 'eventSeverity', sev => sev / 5),
          $(
            go.TextBlock,
            {
              stroke: 'black',
              font: '12px sans-serif',
              editable: true,
              margin: new go.Margin(3, 14, 3, 10),
              alignment: go.Spot.Left,
              wrap: go.TextBlock.WrapFit,
              maxSize: new go.Size(200, Infinity)
            },
            new go.Binding('text').makeTwoWay()
          )
        ),

        $(
          go.Panel,
          'Auto',
          {
            alignment: go.Spot.Right,
            alignmentFocus: go.Spot.Center,
            portId: 'from',
            fromLinkable: true,
            cursor: 'pointer',
            click: addNodeAndLink
          },
          $(go.Shape, 'Circle', {
            width: 22,
            height: 22,
            fill: 'white',
            stroke: 'dodgerblue',
            strokeWidth: 2
          }),
          $(go.Shape, 'TriangleRight', {
            width: 11,
            height: 11,
            fill: null,
            stroke: 'dodgerblue',
            strokeWidth: 2
          })
        ),

        $(
          go.Panel,
          'Auto',
          {
            alignment: go.Spot.Left,
            alignmentFocus: go.Spot.Center,
            portId: 'previousBtn',
            cursor: 'pointer',
            click: addNodeAndLinkBackwards
          },
          $(go.Shape, 'Circle', {
            width: 22,
            height: 22,
            fill: 'white',
            stroke: 'dodgerblue',
            strokeWidth: 2
          }),
          $(go.Shape, 'TriangleLeft', {
            width: 11,
            height: 11,
            fill: null,
            stroke: 'dodgerblue',
            strokeWidth: 2
          })
        ),

        $(
          go.Panel,
          'Auto',
          {
            alignment: new go.Spot(0, 0.5, -12, 0),
            alignmentFocus: go.Spot.Center,
            portId: 'to',
            toLinkable: true
          },
          $(go.Shape, 'Circle', { width: 8, height: 8, fill: 'white', stroke: 'gray' }),
          $(go.Shape, 'Circle', { width: 4, height: 4, fill: 'dodgerblue', stroke: null })
        )
      ),

      $(
        go.Panel,
        'Auto',
        {
          alignment: go.Spot.Bottom,
          alignmentFocus: go.Spot.Top,
          visible: false,
          maxSize: new go.Size(200, Infinity)
        },
        new go.Binding('visible', 'description', d => !!d && d.trim() !== ''),
        $(go.Shape, 'RoundedRectangle', { fill: '#F8F8F8', stroke: 'gray' }),
        $(
          go.TextBlock,
          {
            margin: 3,
            font: '10px sans-serif',
            wrap: go.TextBlock.WrapFit,
            overflow: go.TextBlock.OverflowEllipsis
          },
          new go.Binding('text', 'description')
        )
      ),

      $(
        go.Panel,
        'Auto',
        {
          alignment: new go.Spot(0.5, 1, 0, 1),
          alignmentFocus: go.Spot.Top,
          margin: 0
        }
      )
    );

    myDiagram.nodeTemplate.contextMenu = go.GraphObject.make('ContextMenu').add(
      go.GraphObject.make('ContextMenuButton', {
        click: (e, obj) => e.diagram.commandHandler.editTextBlock()
      })
        .bindObject('visible', '', o => o.diagram && o.diagram.commandHandler.canEditTextBlock())
        .add(new go.TextBlock('Rename')),

      go.GraphObject.make('ContextMenuButton', {
        click: (e, obj) => e.diagram.commandHandler.deleteSelection()
      })
        .bindObject('visible', '', o => o.diagram && o.diagram.commandHandler.canDeleteSelection())
        .add(new go.TextBlock('Delete'))
    );

    myDiagram.linkTemplate = $(
      go.Link,
      {
        selectionAdorned: false,
        fromPortId: 'from',
        toPortId: 'to',
        relinkableTo: true
      },
      $(
        go.Shape,
        {
          stroke: 'gray',
          strokeWidth: 2,
          mouseEnter: (e, obj) => {
            obj.strokeWidth = 5;
            obj.stroke = 'dodgerblue';
          },
          mouseLeave: (e, obj) => {
            obj.strokeWidth = 2;
            obj.stroke = 'gray';
          }
        },
        new go.Binding('opacity', 'probability')
      ),
      $(go.Shape, { toArrow: 'Standard', fill: 'gray', stroke: 'gray' }),
      $(go.TextBlock, { font: '10px sans-serif' }, new go.Binding('text'))
    );

    function commonLinkingToolInit(tool: go.LinkingTool | go.RelinkingTool) {
      tool.temporaryLink = $(
        go.Link,
        { layerName: 'Tool' },
        $(go.Shape, { stroke: 'dodgerblue', strokeWidth: 5 })
      );
      tool.temporaryFromPort.figure = 'Circle';
      tool.temporaryFromPort.stroke = null;
      tool.temporaryFromPort.strokeWidth = 0;
      tool.temporaryToPort.figure = 'Circle';
      tool.temporaryToPort.stroke = null;
      tool.temporaryToPort.strokeWidth = 0;

      let OldTarget: go.GraphObject | null = null;
      function highlight(port: any) {
        if (OldTarget !== port) {
          lowlight();
          OldTarget = port;
          port.scale = 1.3;
        }
      }
      function lowlight() {
        if (OldTarget) {
          OldTarget.scale = 1.0;
          OldTarget = null;
        }
      }
      tool.portTargeted = (realnode, realport, tempnode, tempport, toend) => {
        if (realport === null) {
          lowlight();
        } else if (toend) {
          highlight(realport);
        }
      };
    }

    const ltool = myDiagram.toolManager.linkingTool;
    commonLinkingToolInit(ltool);
    ltool.direction = go.LinkingDirection.ForwardsOnly;

    const rtool = myDiagram.toolManager.relinkingTool;
    commonLinkingToolInit(rtool);
    rtool.toHandleArchetype = $(
      go.Shape,
      {
        isPanelMain: true,
        fill: null,
        stroke: 'dodgerblue',
        strokeWidth: 5
      }
    );

    myDiagram.toolManager.draggingTool = new DragLinkingTool(null);

    async function addNodeAndLink(e: go.InputEvent, obj: go.GraphObject) {
      const fromNode = obj.part;
      const fromData = fromNode.data;
      const diagram = fromNode.diagram;
      const model = diagram.model;
      if (!diagram) return;

      const parents: string[] = [];
      let parent = fromNode;
      while (parent) {
        parents.push(parent.data.text);
        parent = parent.findTreeParentNode();
      }
      parents.reverse();

      try {
        const nextEvent = await generateNextEvent(fromData, parents, model.modelData);
        diagram.startTransaction('Add State');
        const p = fromNode.location.copy();
        p.x += diagram.toolManager.draggingTool.gridSnapCellSize.width;

        diagram.model.setDataProperty(
          fromData,
          'prevGuessesForward',
          [...(fromData.prevGuessesForward || []), nextEvent.text]
        );

        const toData = {
          text: nextEvent.text,
          eventSeverity: nextEvent.eventSeverity,
          parent: fromData.key,
          prevGuessesForward: [],
          prevGuessesBackward: [],
          loc: go.Point.stringify(p)
        };
        model.addNodeData(toData);

        model.addLinkData({
          from: model.getKeyForNodeData(fromData),
          to: model.getKeyForNodeData(toData),
          text: 'leads to',
          probability: nextEvent.eventLikelihood / 5
        });

        const newnode = diagram.findNodeForData(toData);
        diagram.select(newnode);
        newnode.location = diagram.toolManager.draggingTool.computeMove(newnode, p);

        diagram.layoutDiagram(true);
        diagram.commitTransaction('Add State');
      } catch (error) {
        console.error('Error generating the next event:', error);
      }
    }

    async function addNodeAndLinkBackwards(e: go.InputEvent, obj: go.GraphObject) {
      const fromNode = obj.part;
      const fromData = fromNode.data;
      const diagram = fromNode.diagram;
      const model = diagram.model;
      if (!diagram) return;

      try {
        const prevEvent = await generatePreviousEvent(fromData, model.modelData);
        diagram.startTransaction('Add State');
        const p = fromNode.location.copy();
        p.x -= diagram.toolManager.draggingTool.gridSnapCellSize.width;

        diagram.model.setDataProperty(
          fromData,
          'prevGuessesBackward',
          [...(fromData.prevGuessesBackward || []), prevEvent.text]
        );

        const newData = {
          text: prevEvent.text,
          eventSeverity: prevEvent.eventSeverity,
          child: fromData.key,
          prevGuessesForward: [],
          prevGuessesBackward: [],
          loc: go.Point.stringify(p)
        };
        model.addNodeData(newData);

        model.addLinkData({
          from: model.getKeyForNodeData(newData),
          to: model.getKeyForNodeData(fromData),
          text: 'leads to',
          probability: prevEvent.eventLikelihood / 5
        });

        const newnode = diagram.findNodeForData(newData);
        diagram.select(newnode);
        newnode.location = diagram.toolManager.draggingTool.computeMove(newnode, p);

        diagram.layoutDiagram(true);
        diagram.commitTransaction('Add State');
      } catch (error) {
        console.error('Error generating the previous event:', error);
      }
    }

    myDiagram.addDiagramListener('SelectionMoved', shiftNodesToEmptySpaces);
    function shiftNodesToEmptySpaces() {
      myDiagram.selection.each((node: go.Part) => {
        if (!(node instanceof go.Node)) return;
        while (true) {
          const overlap = myDiagram
            .findObjectsIn(
              node.actualBounds,
              obj => obj.part,
              part => part instanceof go.Node && part !== node,
              true
            )
            .first();
          if (!overlap) break;
          node.moveTo(node.actualBounds.x, overlap.actualBounds.bottom + 10);
        }
      });
    }

    myDiagram.addDiagramListener('LayoutCompleted', () => {
      myDiagram.nodes.each((node: go.Node) => {
        if (node.category === 'Recycle') return;
        node.minLocation = new go.Point(node.location.x, -Infinity);
      });
    });

    myDiagram.addDiagramListener('TextEdited', e => {
      const tb = e.subject;
      if (tb instanceof go.TextBlock) {
        const node = tb.part;
        if (node instanceof go.Node) {
          node.diagram.model.setDataProperty(node.data, 'description', '');
        }
      }
    });

    return myDiagram;
  }

  public render() {
    return (
      <ReactDiagram
        ref={this.diagramRef}
        divClassName='event-diagram-component'
        style={this.diagramStyle}
        initDiagram={this.initDiagram}
        nodeDataArray={this.props.nodeDataArray}
        linkDataArray={this.props.linkDataArray}
        modelData={this.props.modelData}
        onModelChange={this.props.onModelChange}
        skipsDiagramUpdate={this.props.skipsDiagramUpdate}
      />
    );
  }
}
