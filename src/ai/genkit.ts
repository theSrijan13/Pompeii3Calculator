import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';
import {GEMINI_MODEL} from '@/config';

export const ai = genkit({
  plugins: [googleAI()],
  model: `googleai/${GEMINI_MODEL}`,
});
