import * as React from 'react';

import { InspectorRow } from './InspectorRow';

import './Inspector.css';

interface SelectionInspectorProps {
  selectedData: any;
  onInputChange: (id: string, value: string, isBlur: boolean) => void;
}

export class SelectionInspector extends React.PureComponent<SelectionInspectorProps, {}> {
  private renderObjectDetails() {
    const selObj = this.props.selectedData;
    const dets = [];
    const allowedProps = ['key', 'text', 'eventSeverity', 'probability', 'description', 'mcts'];
  
    for (const prop of allowedProps) {
      if (selObj.hasOwnProperty(prop)) {
        const val = selObj[prop];
        const row = (
          <InspectorRow
            key={prop}
            id={prop}
            value={typeof val === 'object' ? JSON.stringify(val) : val}
            // onInputChange={this.props.onInputChange} 
            />
        );
        if (prop === 'key') {
          dets.unshift(row);
        } else {
          dets.push(row);
        }
      }
    }
    return dets;
  }

  public render() {
    return (
      <div id='myInspectorDiv' className='inspector'>
        Inspector
        <table>
          <tbody>
            {this.renderObjectDetails()}
          </tbody>
        </table>
      </div>
    );
  }
}
