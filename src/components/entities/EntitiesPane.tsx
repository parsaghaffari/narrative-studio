import * as React from 'react';
import * as go from 'gojs';
import { Accordion, Panel } from 'baseui/accordion';
import { ParagraphXSmall } from 'baseui/typography';

import { EntitiesDiagramWrapper } from './EntitiesDiagramWrapper';
import { SelectionInspector } from '../inspector/SelectionInspector';
import { EntitiesGeneratorSettings } from './EntitiesGeneratorSettings';

import { generateEntityGraph } from '../../utils';

interface EntitiesPaneProps {
  entitiesModelData: go.ObjectData;
  entitiesNodeDataArray: go.ObjectData[];
  entitiesLinkDataArray: go.ObjectData[];
  entitiesSelectedData: go.ObjectData | null;
  entitiesSkipsDiagramUpdate: boolean;
  isLoading: boolean;

  updateEntitiesModelData: (field: string, value: any) => void;
  handleEntitiesDiagramEvent: (e: go.DiagramEvent) => void;
  handleEntitiesModelChange: (obj: go.IncrementalData) => void;

  setAppLoading: (val: boolean) => void;
}

export const EntitiesPane: React.FC<EntitiesPaneProps> = ({
  entitiesModelData,
  entitiesNodeDataArray,
  entitiesLinkDataArray,
  entitiesSelectedData,
  entitiesSkipsDiagramUpdate,
  isLoading,
  updateEntitiesModelData,
  handleEntitiesDiagramEvent,
  handleEntitiesModelChange,
  setAppLoading
}) => {

  const handleGenerateEntityGraph = async () => {
    setAppLoading(true);
  
    const {
      entitiesPrompt,
      entityTypes,
      relationshipTypes,
      includeExistingGraph
    } = entitiesModelData;
  
    try {
      let existingGraph = '';
      if (includeExistingGraph) {
        existingGraph = `${JSON.stringify(
          {
            entitiesNodeDataArray,
            entitiesLinkDataArray
          },
          null,
          2
        )}`;
      }
  
      const {
        entitiesNodeDataArray: newNodes,
        entitiesLinkDataArray: newLinks
      } = await generateEntityGraph(
        entitiesPrompt,
        entityTypes || [],
        relationshipTypes || [],
        existingGraph
      );
  
      let mergedNodes, mergedLinks;
      if (includeExistingGraph) {
        mergedNodes = [...entitiesNodeDataArray, ...newNodes];
        mergedLinks = [...entitiesLinkDataArray, ...newLinks];
      } else {
        mergedNodes = newNodes;
        mergedLinks = newLinks;
      }
  
      handleEntitiesModelChange({
        modifiedNodeData: mergedNodes,
        insertedNodeKeys: newNodes.map(n => n.key),
        modifiedLinkData: mergedLinks,
        insertedLinkKeys: newLinks.map(l => l.key),
      });
  
      updateEntitiesModelData('entitiesSkipsDiagramUpdate', false);
    } catch (error) {
      console.error('Failed to generate entity graph:', error);
    } finally {
      setAppLoading(false);
    }
  };

  return (
    <div className="entities-pane-wrapper">
      <div className="pane-label">
        Entity graph
        <ParagraphXSmall>
          Introduce entities and their relationships as context.
          <ul>
            <li>Double click on blank space to create a new node</li>
            <li>Drag from a node to another to link them</li>
            <li>Double click on nodes or links to rename them</li>
          </ul>
        </ParagraphXSmall>
      </div>

      <div className="controls">
        <Accordion>
          <Panel title="Graph generator">
            <EntitiesGeneratorSettings
              modelData={entitiesModelData}
              setEntitiesPrompt={(val) =>
                updateEntitiesModelData('entitiesPrompt', val)
              }
              setEntityTypes={(val) =>
                updateEntitiesModelData('entityTypes', val)
              }
              setRelationshipTypes={(val) =>
                updateEntitiesModelData('relationshipTypes', val)
              }
              handleGenerate={handleGenerateEntityGraph}
              isLoading={isLoading}
              setIncludeExistingGraph={(checked) =>
                updateEntitiesModelData('includeExistingGraph', checked)
              }
            />
          </Panel>
        </Accordion>
      </div>

      <div className="inspector-container">
        {entitiesSelectedData && (
          <SelectionInspector selectedData={entitiesSelectedData} />
        )}
      </div>

      <EntitiesDiagramWrapper
        nodeDataArray={entitiesNodeDataArray}
        linkDataArray={entitiesLinkDataArray}
        modelData={entitiesModelData}
        skipsDiagramUpdate={entitiesSkipsDiagramUpdate}
        onDiagramEvent={handleEntitiesDiagramEvent}
        onModelChange={handleEntitiesModelChange}
      />
    </div>
  );
};
