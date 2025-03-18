import { render, fireEvent } from '@testing-library/react';
import { LoadSaveControls } from './LoadSaveControls';
import { AppState } from '../../App';

describe('LoadSaveControls', () => {
  let mockUpdateState: jest.Mock;
  let mockRefreshNodeIndex: jest.Mock;
  let mockRefreshLinkIndex: jest.Mock;
  let fileReaderMock: Partial<FileReader>;
  
  beforeEach(() => {
    mockUpdateState = jest.fn();
    mockRefreshNodeIndex = jest.fn();
    mockRefreshLinkIndex = jest.fn();
  
    // Create a partial FileReader mock
    fileReaderMock = {
      readAsText: jest.fn(),
      onload: null,
    };
  
    jest.spyOn(global, 'FileReader').mockImplementation(() => fileReaderMock as FileReader);
  });
  
  afterEach(() => {
    jest.restoreAllMocks();
  });
  
  it('should correctly process and update state when loading a valid JSON file', () => {
    // 1. Render the component
    const { container } = render(
      <LoadSaveControls
        appState={{} as AppState}
        updateState={mockUpdateState}
        refreshNodeIndex={mockRefreshNodeIndex}
        refreshLinkIndex={mockRefreshLinkIndex}
      />
    );
  
    // 2. Grab the hidden file input
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).toBeTruthy();
  
    // 3. Prepare a mock File and trigger the change event
    const mockFile = new File(
      [JSON.stringify({
        eventsNodeDataArray: [{ key: 1, text: 'Event 1' }],
        eventsLinkDataArray: [{ from: 1, to: 2 }],
        entitiesNodeDataArray: [{ key: 3, text: 'Entity 1' }],
        entitiesLinkDataArray: [{ from: 3, to: 4 }],
      })],
      'test.json',
      { type: 'application/json' }
    );
  
    fireEvent.change(fileInput, {
      target: {
        files: [mockFile],
      },
    });
  
    // 4. Now manually invoke onload on the mocked FileReader
    (fileReaderMock.onload as Function)?.({
      target: {
        result: JSON.stringify({
          eventsNodeDataArray: [{ key: 1, text: 'Event 1' }],
          eventsLinkDataArray: [{ from: 1, to: 2 }],
          entitiesNodeDataArray: [{ key: 3, text: 'Entity 1' }],
          entitiesLinkDataArray: [{ from: 3, to: 4 }],
        }),
      },
    });
  
    // Expect the calls
    expect(mockUpdateState).toHaveBeenCalledTimes(1);
    expect(mockUpdateState).toHaveBeenCalledWith(expect.any(Function));
  
    expect(mockRefreshNodeIndex).toHaveBeenCalledTimes(1);
    expect(mockRefreshNodeIndex).toHaveBeenCalledWith([{ key: 1, text: 'Event 1' }]);
  
    expect(mockRefreshLinkIndex).toHaveBeenCalledTimes(1);
    expect(mockRefreshLinkIndex).toHaveBeenCalledWith([{ from: 1, to: 2 }]);
  });
    
  it('should handle an invalid JSON file gracefully', () => {
      render(
          <LoadSaveControls 
              appState={{} as AppState} 
              updateState={mockUpdateState} 
              refreshNodeIndex={mockRefreshNodeIndex} 
              refreshLinkIndex={mockRefreshLinkIndex} 
          />
      );

      (fileReaderMock.onload as Function)?.({
          target: { result: '{invalidJson}' },
      });

      expect(mockUpdateState).not.toHaveBeenCalled();
      expect(mockRefreshNodeIndex).not.toHaveBeenCalled();
      expect(mockRefreshLinkIndex).not.toHaveBeenCalled();
  });

  it('should handle empty file selection gracefully', () => {
      render(
          <LoadSaveControls 
              appState={{} as AppState} 
              updateState={mockUpdateState} 
              refreshNodeIndex={mockRefreshNodeIndex} 
              refreshLinkIndex={mockRefreshLinkIndex} 
          />
      );

      (fileReaderMock.onload as Function)?.({
          target: { result: '' },
      });

      expect(mockUpdateState).not.toHaveBeenCalled();
      expect(mockRefreshNodeIndex).not.toHaveBeenCalled();
      expect(mockRefreshLinkIndex).not.toHaveBeenCalled();
  });
});
