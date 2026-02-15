export type RelatedWordNeighbor = {
  word: string;
  score: number;
};

type RelatedWordsResponse = {
  word: string;
  k: number;
  neighbors: RelatedWordNeighbor[];
};

export class WordServiceClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly topK: number;

  constructor(params?: { baseUrl?: string; timeoutMs?: number; topK?: number }) {
    this.baseUrl = (params?.baseUrl ?? process.env.WORD_SERVICE_URL ?? "http://127.0.0.1:4201").replace(/\/+$/, "");
    this.timeoutMs = params?.timeoutMs ?? Number(process.env.WORD_SERVICE_TIMEOUT_MS ?? 1_500);
    this.topK = params?.topK ?? 10;
  }

  async getRelatedWords(word: string, k = this.topK): Promise<RelatedWordNeighbor[]> {
    const signal = AbortSignal.timeout(this.timeoutMs);
    const response = await fetch(`${this.baseUrl}/api/v1/related-words`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ word, k }),
      signal
    });

    if (!response.ok) {
      throw new Error(`word-service request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as RelatedWordsResponse;
    if (!Array.isArray(payload.neighbors)) {
      throw new Error("word-service response malformed: neighbors must be array");
    }

    return payload.neighbors;
  }
}
