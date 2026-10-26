// Text -> vector embeddings for check-in notes.
// Model: all-MiniLM-L6-v2 (sentence-transformers), 384 dimensions,
// runs locally in Node via @huggingface/transformers (no paid API).
// Vectors are mean-pooled and normalized, so cosine distance works well.
import { pipeline } from '@huggingface/transformers';

let extractor = null;

export async function embed(text) {
  if (!extractor) {
    extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

// pgvector accepts vectors written as '[0.1,0.2,...]'
export function toSql(vector) {
  return `[${vector.join(',')}]`;
}
