import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMatchStream } from './useMatchStream';
import * as api from './api';

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  public onopen: ((event: Event) => void) | null = null;
  public onmessage: ((event: MessageEvent) => void) | null = null;
  public onerror: ((event: Event) => void) | null = null;
  public onclose: ((event: CloseEvent) => void) | null = null;
  public readyState = 0;
  public readonly url: string;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  close() {
    this.readyState = 3;
  }

  triggerOpen() {
    this.onopen?.(new Event('open'));
  }

  triggerMessage(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent);
  }

  triggerError() {
    this.onerror?.(new Event('error'));
  }

  triggerClose() {
    this.onclose?.(new Event('close') as unknown as CloseEvent);
  }

  static clear() {
    this.instances.length = 0;
  }
}

const globalAny = globalThis as { WebSocket?: typeof WebSocket };
const originalWebSocket = globalAny.WebSocket;

describe('useMatchStream', () => {
  beforeEach(() => {
    MockWebSocket.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    if (originalWebSocket) {
      globalAny.WebSocket = originalWebSocket;
    } else {
      delete globalAny.WebSocket;
    }
  });

  it('polls when WebSocket is unavailable', async () => {
    vi.useFakeTimers();
    const responseData = { id: 'match-1', status: 'final' };
    const fetchMock = vi
      .spyOn(api, 'apiFetch')
      .mockResolvedValue(
        new Response(JSON.stringify(responseData), {
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    delete globalAny.WebSocket;

    const { result, unmount } = renderHook(() => useMatchStream('match-1'));

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.fallback).toBe(true);
    expect(result.current.connected).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/v0/matches/match-1');

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.event).toEqual(responseData);
    expect(result.current.fallback).toBe(true);

    unmount();
  });

  it('uses WebSocket messages when available', async () => {
    globalAny.WebSocket = MockWebSocket as unknown as typeof WebSocket;

    const { result, unmount } = renderHook(() => useMatchStream('match-2'));

    const socket = MockWebSocket.instances.at(-1);
    expect(socket).toBeDefined();
    expect(socket?.url).toContain('/v0/matches/match-2/stream');

    await act(async () => {
      socket?.triggerOpen();
    });

    expect(result.current.connected).toBe(true);
    expect(result.current.fallback).toBe(false);

    const frame = { score: [1, 0] };
    await act(async () => {
      socket?.triggerMessage(frame);
      await Promise.resolve();
    });

    expect(result.current.event).toEqual(frame);
    expect(result.current.fallback).toBe(false);

    unmount();
  });

  it('falls back to polling when WebSocket errors', async () => {
    vi.useFakeTimers();
    globalAny.WebSocket = MockWebSocket as unknown as typeof WebSocket;

    const responseData = { id: 'match-3', status: 'live' };
    const fetchMock = vi
      .spyOn(api, 'apiFetch')
      .mockResolvedValue(
        new Response(JSON.stringify(responseData), {
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    const { result, unmount } = renderHook(() => useMatchStream('match-3'));
    const socket = MockWebSocket.instances.at(-1);
    expect(socket).toBeDefined();

    await act(async () => {
      socket?.triggerOpen();
    });
    expect(result.current.connected).toBe(true);

    await act(async () => {
      socket?.triggerError();
      await Promise.resolve();
    });

    expect(result.current.connected).toBe(false);
    expect(result.current.fallback).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('/v0/matches/match-3');

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.event).toEqual(responseData);

    unmount();
  });
});
