'use server';

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

export const GetImageAsBase64InputSchema = z.object({
  imageUrl: z.string().url(),
});
export type GetImageAsBase64Input = z.infer<typeof GetImageAsBase64InputSchema>;

export const GetImageAsBase64OutputSchema = z.object({
  base64: z.string().nullable(),
});
export type GetImageAsBase64Output = z.infer<typeof GetImageAsBase64OutputSchema>;

export async function getImageAsBase64(
  input: GetImageAsBase64Input
): Promise<GetImageAsBase64Output> {
  return getImageAsBase64Flow(input);
}

export const getImageAsBase64Flow = ai.defineFlow(
  {
    name: 'getImageAsBase64Flow',
    inputSchema: GetImageAsBase64InputSchema,
    outputSchema: GetImageAsBase64OutputSchema,
  },
  async ({ imageUrl }) => {
    try {
      console.log('Fetching image from URL: ' + imageUrl);
      const response = await fetch(imageUrl, {
        method: 'GET',
      });

      if (response.ok) {
        const buffer = await response.arrayBuffer();
        const base64Data = Buffer.from(buffer).toString('base64');
        console.log('Successfully converted image to base64');
        return { base64: base64Data };
      } else {
        console.log(`Failed to fetch image: ${response.status}`);
        return { base64: null };
      }
    } catch (error: any) {
      console.log(`Error fetching image: ${error.message}`);
      return { base64: null };
    }
  }
);
