// Copyright (C) 2020 Scott Lamb <slamb@slamb.org>
// SPDX-License-Identifier: MIT OR Apache-2.0

'use strict';

import multipartStream from './multipart-stream.js';

const decoder = new TextDecoder('utf-8');
const encoder = new TextEncoder('utf-8');

const PART1 = 'foo\r\nbar';
const PART2 = 'baz\r\n';

const STREAM_1_PART = `--boundary\r
Part1-Header: h1\r
Content-Length: ${PART1.length}\r
\r
${PART1}`;

const STREAM_2_PARTS = `--boundary\r
Part1-Header: h1\r
Content-Length: ${PART1.length}\r
\r
${PART1}\r
--boundary\r
Part2-Header: h2\r
Content-Length: ${PART2.length}\r
\r
${PART2}`;

/**
 * @param {Array<Uint8Array>} chunks
 * @return {ReadableStream} a stream which yields chunks.
 */
function fakeSuccessfulStream(chunks) {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

describe('multipartStream', function() {
  it('handles an empty stream', async function() {
    const inStream = fakeSuccessfulStream([]);
    const r = multipartStream('multipart/mixed; boundary=boundary', inStream)
        .getReader();
    expect(await r.read()).toEqual({done: true, value: undefined});
  });
  it('bad content type', async function() {
    for (const t of ['multipart/mixed; boundary', 'text/plain; boundary=foo']) {
      const inStream = fakeSuccessfulStream([]);
      const r = multipartStream(t, inStream).getReader();
      await expectAsync(r.read())
          .withContext(t)
          .toBeRejectedWithError(Error, /Invalid content type.*/);
    }
  });
  it('handles an empty stream', async function() {
    const inStream = fakeSuccessfulStream([]);
    const r = multipartStream('multipart/mixed; boundary=boundary', inStream)
        .getReader();
    expect(await r.read()).toEqual({done: true, value: undefined});
  });
  for (const contentType of [
    'multipart/mixed; boundary=boundary',
    'multipart/x-mixed-replace; boundary=boundary']) {
    it(`reads parts from a ${contentType} stream chunk`, async function() {
      const inStream = fakeSuccessfulStream([encoder.encode(STREAM_2_PARTS)]);
      const r = multipartStream(contentType, inStream).getReader();
      {
        const {done, value} = await r.read();
        expect(done).toBe(false);
        expect(value.headers.get('Part1-Header')).toEqual('h1');
        expect(decoder.decode(value.body)).toEqual(PART1);
      }
      {
        const {done, value} = await r.read();
        expect(done).toBe(false);
        expect(value.headers.get('Part2-Header')).toEqual('h2');
        expect(decoder.decode(value.body)).toEqual(PART2);
      }
      expect(await r.read()).toEqual({done: true, value: undefined});
    });
  }
  it('reads parts from many chunks', async function() {
    const chunks = [];
    for (const c of STREAM_2_PARTS) {
      chunks.push(encoder.encode(c));
    }
    const inStream = fakeSuccessfulStream(chunks);
    const r = multipartStream('multipart/mixed; boundary=boundary', inStream)
        .getReader();
    {
      const {done, value} = await r.read();
      expect(done).toBe(false);
      expect(value.headers.get('Part1-Header')).toEqual('h1');
      expect(decoder.decode(value.body)).toEqual(PART1);
    }
    {
      const {done, value} = await r.read();
      expect(done).toBe(false);
      expect(value.headers.get('Part2-Header')).toEqual('h2');
      expect(decoder.decode(value.body)).toEqual(PART2);
    }
    expect(await r.read()).toEqual({done: true, value: undefined});
  });
  it('complains about unfinished part', async function() {
    for (let i = 1; i < STREAM_1_PART.length - 1; i++) {
      const partial = STREAM_1_PART.substring(0, i);
      const inStream = fakeSuccessfulStream([encoder.encode(partial)]);
      const r = multipartStream('multipart/mixed; boundary=boundary', inStream)
          .getReader();
      await expectAsync(r.read())
          .withContext(`${i}/${STREAM_1_PART.length} bytes, try 1`)
          .toBeRejectedWithError(Error, 'multipart stream ended mid-part');
      await expectAsync(r.read())
          .withContext(`${i}/${STREAM_1_PART.length} bytes, try 2`)
          .toBeRejectedWithError(Error, 'multipart stream ended mid-part');
    }
  });
  it('complains about bad part boundary', async function() {
    const stream =
        `--bOundary\r\nContent-Length: ${PART1.length}\r\n\r\n${PART1}`;
    const inStream = fakeSuccessfulStream([encoder.encode(stream)]);
    const r = multipartStream('multipart/mixed; boundary=boundary', inStream)
        .getReader();
    await expectAsync(r.read())
        .toBeRejectedWithError(Error, 'bad part boundary');
    await expectAsync(r.read())
        .toBeRejectedWithError(Error, 'bad part boundary');
  });
  it('complains about bad part header line (CR without NL)', async function() {
    const stream =
        `--b\r\nFoo: bar\rContent-Length: ${PART1.length}\r\n\r\n${PART1}`;
    const inStream = fakeSuccessfulStream([encoder.encode(stream)]);
    const r = multipartStream('multipart/mixed; boundary=b', inStream)
        .getReader();
    await expectAsync(r.read())
        .toBeRejectedWithError(Error, 'bad part header line (CR without NL)');
  });
  it('complains about bad part header line (no ": ")', async function() {
    const stream =
        `--boundary\r\nFoo\r\nContent-Length: ${PART1.length}\r\n\r\n${PART1}`;
    const inStream = fakeSuccessfulStream([encoder.encode(stream)]);
    const r = multipartStream('multipart/mixed; boundary=boundary', inStream)
        .getReader();
    await expectAsync(r.read())
        .toBeRejectedWithError(Error, 'bad part header line (no ": ")');
  });
  it('complains about missing/invalid Content-Length', async function() {
    const stream = `--boundary\r\nFoo: Bar\r\n\r\n${PART1}`;
    const inStream = fakeSuccessfulStream([encoder.encode(stream)]);
    const r = multipartStream('multipart/mixed; boundary=boundary', inStream)
        .getReader();
    await expectAsync(r.read())
        .toBeRejectedWithError(Error, 'missing/invalid part Content-Length');
  });
  it('propagates error from underlying stream', async function() {
    const e = Error('error from underlying stream');
    const inStream = new ReadableStream({
      start(controller) {
        controller.error(e);
      },
    });
    const r = multipartStream('multipart/mixed; boundary=boundary', inStream)
        .getReader();
    await expectAsync(r.read()).toBeRejectedWith(e);
  });
  it('propagates cancel back to underlying stream', async function() {
    const inStream = new ReadableStream({});
    spyOn(inStream, 'cancel');
    const r = multipartStream('multipart/mixed; boundary=boundary', inStream)
        .getReader();
    r.cancel();
    expect(inStream.cancel).toHaveBeenCalled();
  });
});
