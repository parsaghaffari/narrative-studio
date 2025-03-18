import * as React from 'react';
import { Input, SIZE } from "baseui/input";
import { Slider } from "baseui/slider";
import {
    ParagraphSmall,
} from "baseui/typography";
import {
    Checkbox,
    LABEL_PLACEMENT
} from "baseui/checkbox";

interface EventGeneratorSettingsProps {
    modelData: go.ObjectData;
    setEventPrompt: (prompt: string) => void;
    setEventLikelihood: (likelihood: number[]) => void;
    setEventSeverity: (severity: number[]) => void;
    setEventTemperature: (temperature: number[]) => void;
    setUseGpt4: (useGpt4: boolean) => void;
    setIncludeEntityGraph: (includeEntityGraph: boolean) => void;
}  

export const EventGeneratorSettings: React.FC<EventGeneratorSettingsProps> = ({ modelData, setEventPrompt, setEventLikelihood, setEventSeverity, setEventTemperature, setUseGpt4, setIncludeEntityGraph }) => {

  return (
    <div>
        <ParagraphSmall>guide prompt (optional):</ParagraphSmall>
        <Input
            value={modelData['eventPrompt']}
            onChange={e => setEventPrompt((e.target as HTMLInputElement).value)}
            size={SIZE.mini}
            placeholder="Example: focus on geopolitical consequences..."
            clearOnEscape
        />
        <ParagraphSmall>event likelihood (1 very low, 5 very high):</ParagraphSmall>
        <Slider
            value={modelData['eventLikelihood']}
            onChange={({ value }) => value && setEventLikelihood(value)}
            min={1}
            max={5}
        />
        <ParagraphSmall>event severity (1 very low, 5 very high):</ParagraphSmall>
        <Slider
            value={modelData['eventSeverity']}
            onChange={({ value }) => value && setEventSeverity(value)}
            min={1}
            max={5}
        />
        <ParagraphSmall>model temperature (0 is ~deterministic, 1 is somewhat random, 2 is dangerously random):</ParagraphSmall>
        <Slider
            value={modelData['eventTemperature']}
            onChange={({ value }) => value && setEventTemperature(value)}
            min={0}
            max={1.6}
            step={0.2}
        />
        <Checkbox
            checked={modelData['useGpt4']}
            onChange={e => setUseGpt4(e.target.checked)}
            labelPlacement={LABEL_PLACEMENT.right}
            >
            Use GPT-4
        </Checkbox>
        <Checkbox
            checked={modelData['includeEntityGraph']}
            onChange={e => setIncludeEntityGraph(e.target.checked)}
            labelPlacement={LABEL_PLACEMENT.right}
            >
            Include entity graph
        </Checkbox>
    </div>
  );
};
