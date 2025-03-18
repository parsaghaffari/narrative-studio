import * as React from 'react';
import { Button } from 'baseui/button';
import { StyledNavigationItem } from 'baseui/header-navigation';
import { AppState } from '../../App';

interface LoadSaveControlsProps {
  appState: AppState;
  updateState: React.Dispatch<React.SetStateAction<AppState>>;
  refreshNodeIndex: (nodeArr: go.ObjectData[]) => void;
  refreshLinkIndex: (linkArr: go.ObjectData[]) => void;
  relayoutEventsDiagram?: () => void;
}

export const LoadSaveControls: React.FC<LoadSaveControlsProps> = ({
  appState,
  updateState,
  refreshNodeIndex,
  refreshLinkIndex,
  relayoutEventsDiagram
}) => {

  const handleLoadExample = async (exampleName: string) => {
    console.log(`Attempting to load example: ${exampleName}`);
    
    try {
      // cache buster
      const response = await fetch(`/examples/${exampleName}?t=${Date.now()}`, {
        cache: "no-store",
      });
      
      if (!response.ok) {
        console.error(`Fetch failed: ${response.status} ${response.statusText}`);
        throw new Error(`Failed to load ${exampleName}`);
      }
  
      const data = await response.json();
      console.log("Successfully loaded example:", data);
  
      updateState((prevState) => ({
        ...prevState, // Preserve existing state
        ...data,      // Apply new data
        eventsSkipsDiagramUpdate: false,
        entitiesSkipsDiagramUpdate: false,
      }));
  
      refreshNodeIndex(data.eventsNodeDataArray);
      refreshLinkIndex(data.eventsLinkDataArray);
      
      // Trigger relayout of events diagram
      if (relayoutEventsDiagram) {
        setTimeout(relayoutEventsDiagram, 100); // Small delay to ensure state is updated
      }
    } catch (error) {
      console.error('Error loading example:', error);
    }
  };

  const handleLoadLocalFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const jsonStr = evt?.target?.result;
        if (typeof jsonStr === 'string') {
          const loadedState = JSON.parse(jsonStr);
          loadedState.eventsSkipsDiagramUpdate = false;
          loadedState.entitiesSkipsDiagramUpdate = false;

          updateState(() => loadedState);
          refreshNodeIndex(loadedState.eventsNodeDataArray);
          refreshLinkIndex(loadedState.eventsLinkDataArray);
          
          // Trigger relayout of events diagram
          if (relayoutEventsDiagram) {
            setTimeout(relayoutEventsDiagram, 100); // Small delay to ensure state is updated
          }
        }
      } catch (err) {
        console.error('Error loading file:', err);
      }
    };
    reader.readAsText(file);

    e.target.value = ''; // Allow re-selecting the same file
  };

  const handleSave = () => {
    const jsonStr = JSON.stringify(appState, null, 2);
    const file = new Blob([jsonStr], { type: 'application/json' });
    const fileURL = URL.createObjectURL(file);

    const tempLink = document.createElement('a');
    tempLink.href = fileURL;
    tempLink.download = 'narrative-export.json';

    document.body.appendChild(tempLink);
    tempLink.click();
    document.body.removeChild(tempLink);
    URL.revokeObjectURL(fileURL);
  };

  return (
    <>
      <StyledNavigationItem>
        <input
          type="file"
          id="fileInput"
          style={{ display: 'none' }}
          accept=".json"
          onChange={handleLoadLocalFile}
        />
        <Button onClick={() => document.getElementById('fileInput')?.click()}>Load</Button>
        &nbsp;
        <Button onClick={handleSave}>Save</Button>
      </StyledNavigationItem>
    </>
  );
};
