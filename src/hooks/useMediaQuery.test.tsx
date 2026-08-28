// @vitest-environment jsdom
import '@/test-support/component-testing';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMediaQuery } from './useMediaQuery';

// First test of a React hook in this codebase — jsdom has no real media-query
// engine, so `matchMedia` is stubbed with a controllable fake.
//
// KWM-022 replaced the deprecated `MediaQueryList.addListener` with
// `addEventListener`. Nothing pinned that down, so the fake below implements
// ONLY the modern API: a regression back to `addListener` fails these tests
// rather than silently working in browsers that still support both.

interface FakeMediaQueryList {
  matches: boolean;
  media: string;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  /** Fires a change event at every registered listener. */
  emit(matches: boolean): void;
}

function fakeMatchMedia() {
  const created: FakeMediaQueryList[] = [];

  const factory = vi.fn((query: string): FakeMediaQueryList => {
    const listeners = new Set<(event: MediaQueryListEvent) => void>();
    const list: FakeMediaQueryList = {
      matches: false,
      media: query,
      addEventListener: vi.fn((_type: string, listener: (e: MediaQueryListEvent) => void) => {
        listeners.add(listener);
      }),
      removeEventListener: vi.fn((_type: string, listener: (e: MediaQueryListEvent) => void) => {
        listeners.delete(listener);
      }),
      emit(matches: boolean) {
        list.matches = matches;
        for (const listener of listeners) {
          listener({ matches } as MediaQueryListEvent);
        }
      },
    };
    created.push(list);
    return list;
  });

  return { factory, created, latest: () => created[created.length - 1] };
}

let media: ReturnType<typeof fakeMatchMedia>;

beforeEach(() => {
  media = fakeMatchMedia();
  vi.stubGlobal('matchMedia', media.factory);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useMediaQuery', () => {
  it('reports the query state at mount rather than waiting for a change', () => {
    // Regression guard: the hook initialises state to `false`, so without the
    // explicit sync in its effect a query that already matches would report
    // false until the viewport next changed — on a phone, possibly never.
    media.factory.mockImplementationOnce((query: string) => {
      const list = fakeMatchMedia().factory(query);
      list.matches = true;
      return list;
    });

    const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'));

    expect(result.current).toBe(true);
  });

  it('reports false when the query does not match at mount', () => {
    const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'));

    expect(result.current).toBe(false);
  });

  it('updates when the media query starts matching', () => {
    const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'));

    act(() => media.latest().emit(true));

    expect(result.current).toBe(true);
  });

  it('updates when the media query stops matching', () => {
    const { result } = renderHook(() => useMediaQuery('(max-width: 768px)'));
    act(() => media.latest().emit(true));

    act(() => media.latest().emit(false));

    expect(result.current).toBe(false);
  });

  it('passes the query string through to matchMedia', () => {
    renderHook(() => useMediaQuery('(min-width: 1024px)'));

    expect(media.factory).toHaveBeenCalledWith('(min-width: 1024px)');
  });

  it('subscribes with addEventListener, not the deprecated addListener (KWM-022)', () => {
    renderHook(() => useMediaQuery('(max-width: 768px)'));

    expect(media.latest().addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('removes its listener on unmount', () => {
    const { unmount } = renderHook(() => useMediaQuery('(max-width: 768px)'));
    const list = media.latest();

    unmount();

    expect(list.removeEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('resubscribes when the query changes', () => {
    const { rerender } = renderHook(({ query }) => useMediaQuery(query), {
      initialProps: { query: '(max-width: 768px)' },
    });
    const first = media.latest();

    rerender({ query: '(min-width: 1024px)' });

    // The old subscription is torn down and a new list is created, so a stale
    // listener cannot keep driving state after the query has moved on.
    expect(first.removeEventListener).toHaveBeenCalled();
    expect(media.factory).toHaveBeenLastCalledWith('(min-width: 1024px)');
  });
});
