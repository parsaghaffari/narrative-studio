import * as go from 'gojs';
import { ReactDiagram } from 'gojs-react';
import * as React from 'react';

interface EntitiesDiagramProps {
  nodeDataArray: Array<go.ObjectData>;
  linkDataArray: Array<go.ObjectData>;
  modelData: go.ObjectData;
  skipsDiagramUpdate: boolean;
  onDiagramEvent: (e: go.DiagramEvent) => void;
  onModelChange: (e: go.IncrementalData) => void;
}

export class EntitiesDiagramWrapper extends React.Component<EntitiesDiagramProps, {}> {
  private diagramRef: React.RefObject<ReactDiagram>;

  constructor(props: EntitiesDiagramProps) {
    super(props);
    this.diagramRef = React.createRef();
    this.initDiagram = this.initDiagram.bind(this);
  }

  public componentDidMount() {
    if (!this.diagramRef.current) return;
    const diagram = this.diagramRef.current.getDiagram();
    if (diagram instanceof go.Diagram) {
      diagram.addDiagramListener('ChangedSelection', this.props.onDiagramEvent);
    }
  }

  public componentWillUnmount() {
    if (!this.diagramRef.current) return;
    const diagram = this.diagramRef.current.getDiagram();
    if (diagram instanceof go.Diagram) {
      diagram.removeDiagramListener('ChangedSelection', this.props.onDiagramEvent);
    }
  }

  private initDiagram(): go.Diagram {
    const diagram = new go.Diagram({
      'undoManager.isEnabled': true,
      'clickCreatingTool.archetypeNodeData': { text: 'new node', color: 'lightblue' },
      model: new go.GraphLinksModel({
        linkKeyProperty: 'key',
        makeUniqueKeyFunction: (m: go.Model, data: any) => {
          let k = data.key || 1;
          while (m.findNodeDataForKey(k)) k++;
          data.key = k;
          return k;
        },
        makeUniqueLinkKeyFunction: (m: go.GraphLinksModel, data: any) => {
          let k = data.key || -1;
          while (m.findLinkDataForKey(k)) k--;
          data.key = k;
          return k;
        }
      })
    });

    diagram.layout = new go.ForceDirectedLayout({
      defaultSpringLength: 300,
      defaultElectricalCharge: 100,
    });

    diagram.toolManager.linkingTool.linkValidation = (
      fromnode, fromport, tonode, toport, link
    ) => {
      return true;
    };

    diagram.toolManager.linkingTool.archetypeLinkData = { text: 'relationship' };

    diagram.nodeTemplate =
      new go.Node('Auto')
        .bindTwoWay('location', 'loc', go.Point.parse, go.Point.stringify)
        .add(
          new go.Shape('RoundedRectangle', {
              name: 'SHAPE',
              fill: 'white',
              strokeWidth: 0,
              portId: '',
              fromLinkable: true,
              toLinkable: true,
              fromLinkableDuplicates: true,
              toLinkableDuplicates: true,
              cursor: 'pointer'
            })
            .bind('fill', 'color'),

          new go.TextBlock({
              margin: 8,
              editable: true,
              font: '400 .875rem Roboto, sans-serif'
            })
            .bindTwoWay('text')
        );

    diagram.linkTemplate = new go.Link({
        doubleClick: (e, link) => e.diagram.commandHandler.editTextBlock()
      })
      .bindModel('relinkableFrom', 'canRelink')
      .bindModel('relinkableTo', 'canRelink')
      .add(
        new go.Shape().bind('opacity', 'probability'),
        new go.Shape({ toArrow: 'Standard', fill: 'gray', stroke: 'gray' }),
        new go.TextBlock({ font: '10px sans-serif', editable: true })
          .bindTwoWay('text', 'text')
      );

    return diagram;
  }

  public render() {
    return (
      <ReactDiagram
        ref={this.diagramRef}
        divClassName='entity-diagram-component'
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
