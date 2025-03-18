import * as React from 'react';
import { Textarea } from 'baseui/textarea';
import { Select, SIZE } from 'baseui/select';
import { Button } from 'baseui/button';
import { Checkbox, LABEL_PLACEMENT } from 'baseui/checkbox';

interface EntitiesGeneratorSettingsProps {
  modelData: any;
  setEntitiesPrompt: (prompt: string) => void;
  setEntityTypes: (types: any[]) => void;
  setRelationshipTypes: (types: any[]) => void;
  handleGenerate: () => void;
  isLoading: boolean;
  setIncludeExistingGraph: (useExisting: boolean) => void;
}

export const EntitiesGeneratorSettings: React.FC<EntitiesGeneratorSettingsProps> = ({
  modelData,
  setEntitiesPrompt,
  setEntityTypes,
  setRelationshipTypes,
  handleGenerate,
  isLoading,
  setIncludeExistingGraph
}) => {
  return (
    <div>
      <Textarea
        value={modelData['entitiesPrompt'] || ''}
        onChange={e => setEntitiesPrompt(e.target.value)}
        size={SIZE.mini}
        placeholder="Entity graph prompt"
        clearOnEscape
      />
      <br/>

      <Select
        creatable
        size={SIZE.mini}
        options={[]} // Populate as needed
        value={modelData['entityTypes'] || []}
        multi
        placeholder="Entity types"
        onChange={params => setEntityTypes(params.value)}
      />
      <br/>

      <Select
        creatable
        size={SIZE.mini}
        options={[]} // Populate as needed
        value={modelData['relationshipTypes'] || []}
        multi
        placeholder="Relationship types"
        onChange={params => setRelationshipTypes(params.value)}
      />
      <br/>

      <Checkbox
        checked={!!modelData['includeExistingGraph']}
        onChange={e =>
          setIncludeExistingGraph((e.target as HTMLInputElement).checked)
        }
        labelPlacement={LABEL_PLACEMENT.right}
      >
        Merge with existing graph
      </Checkbox>
      <br/>

      <Button
        onClick={handleGenerate}
        size="compact"
        isLoading={isLoading}
        disabled={isLoading || !modelData.entitiesPrompt?.trim()}
      >
        Generate
      </Button>
    </div>
  );
};
