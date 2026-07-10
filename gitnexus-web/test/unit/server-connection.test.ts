import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchGraph, normalizeServerUrl, setBackendUrl } from '../../src/services/backend-client';

describe('normalizeServerUrl', () => {
  it('adds http:// to localhost', () => {
    expect(normalizeServerUrl('localhost:4747')).toBe('http://localhost:4747');
  });

  it('adds http:// to 127.0.0.1', () => {
    expect(normalizeServerUrl('127.0.0.1:4747')).toBe('http://127.0.0.1:4747');
  });

  it('adds https:// to non-local hosts', () => {
    expect(normalizeServerUrl('example.com')).toBe('https://example.com');
  });

  it('strips trailing slashes', () => {
    expect(normalizeServerUrl('http://localhost:4747/')).toBe('http://localhost:4747');
    expect(normalizeServerUrl('http://localhost:4747///')).toBe('http://localhost:4747');
  });

  it('strips /api suffix (base URL only)', () => {
    expect(normalizeServerUrl('http://localhost:4747/api')).toBe('http://localhost:4747');
  });

  it('trims whitespace', () => {
    expect(normalizeServerUrl('  localhost:4747  ')).toBe('http://localhost:4747');
  });

  it('preserves existing https://', () => {
    expect(normalizeServerUrl('https://gitnexus.example.com')).toBe('https://gitnexus.example.com');
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('fetchGraph', () => {
  it('requests streamed graph responses from the backend', async () => {
    setBackendUrl('http://localhost:4747');

    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"nodes":[],"relationships":[]}', {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await fetchGraph('big-repo');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/graph?repo=big-repo&stream=true'),
      expect.any(Object),
    );
  });

  it('parses NDJSON graph streams incrementally', async () => {
    setBackendUrl('http://localhost:4747');

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            [
              '{"type":"node","data":{"id":"File:src/app.ts","label":"File","properties":{"name":"app.ts","filePath":"src/app.ts"}}}\n',
              '{"type":"relationship","data":{"id":"File:src/app.ts_CONTAINS_Function:src/app.ts:main","type":"CONTAINS","sourceId":"File:src/app.ts","targetId":"Function:src/app.ts:main"}}\n',
            ].join(''),
          ),
        );
        controller.close();
      },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(stream, {
          status: 200,
          headers: {
            'Content-Type': 'application/x-ndjson',
          },
        }),
      ),
    );

    const progress = vi.fn();
    const result = await fetchGraph('big-repo', { onProgress: progress });

    expect(result.nodes).toHaveLength(1);
    expect(result.relationships).toHaveLength(1);
    expect(result.nodes[0].id).toBe('File:src/app.ts');
    expect(result.relationships[0].type).toBe('CONTAINS');
    expect(progress).toHaveBeenCalled();
  });

  it('parses NDJSON graph lines split across chunks', async () => {
    setBackendUrl('http://localhost:4747');

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            '{"type":"node","data":{"id":"File:src/app.ts","label":"File","properties":{"name":"app.ts"',
          ),
        );
        controller.enqueue(
          encoder.encode(
            ',"filePath":"src/app.ts"}}}\n{"type":"relationship","data":{"id":"File:src/app.ts_CONTAINS_Function:src/app.ts:main","type":"CONTAINS","sourceId":"File:src/app.ts","targetId":"Function:src/app.ts:main"}}\n',
          ),
        );
        controller.close();
      },
    });

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(stream, {
          status: 200,
          headers: {
            'Content-Type': 'application/x-ndjson',
          },
        }),
      ),
    );

    const result = await fetchGraph('big-repo');

    expect(result.nodes).toHaveLength(1);
    expect(result.relationships).toHaveLength(1);
    expect(result.nodes[0].properties.filePath).toBe('src/app.ts');
  });

  it('throws backend errors when streamed and non-stream graph downloads both fail', async () => {
    setBackendUrl('http://localhost:4747');

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"type":"error","error":"stream failed"}\n'));
        controller.close();
      },
    });

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(stream, {
            status: 200,
            headers: {
              'Content-Type': 'application/x-ndjson',
            },
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: 'fallback failed' }), {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
            },
          }),
        ),
    );

    await expect(fetchGraph('big-repo')).rejects.toMatchObject({
      message: 'fallback failed',
    });
  });

  it('falls back to non-stream graph responses when streamed downloads fail', async () => {
    setBackendUrl('http://localhost:4747');

    const encoder = new TextEncoder();
    const failedStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"type":"error","error":"stream failed"}\n'));
        controller.close();
      },
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(failedStream, {
          status: 200,
          headers: {
            'Content-Type': 'application/x-ndjson',
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            nodes: [
              {
                id: 'File:src/app.ts',
                label: 'File',
                properties: { name: 'app.ts', filePath: 'src/app.ts' },
              },
            ],
            relationships: [],
          }),
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
            },
          },
        ),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await fetchGraph('big-repo');

    expect(result.nodes).toHaveLength(1);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/api/graph?repo=big-repo&stream=true'),
      expect.any(Object),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/api/graph?repo=big-repo'),
      expect.any(Object),
    );
    expect(fetchMock.mock.calls[1][0]).not.toContain('stream=true');
  });

  it('falls back when a streamed graph response stalls after headers', async () => {
    vi.useFakeTimers();
    setBackendUrl('http://localhost:4747');

    const stalledStream = new ReadableStream<Uint8Array>({
      start() {
        // Headers are available, but the body never yields a graph chunk.
      },
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(stalledStream, {
          status: 200,
          headers: {
            'Content-Type': 'application/x-ndjson',
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ nodes: [], relationships: [] }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const resultPromise = fetchGraph('big-repo');
    await vi.advanceTimersByTimeAsync(15_000);
    const result = await resultPromise;

    expect(result.nodes).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).not.toContain('stream=true');
  });
});
