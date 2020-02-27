# multipart-stream-js

Javascript library to parse an HTTP multipart stream.

## What's a multipart stream for?

A multipart stream is a sequence of parts in one HTTP response, each part
having its own headers and body. A stream might last forever, serving parts
that didn't exist at the start of the request. This is a type of "hanging GET"
or [Comet](https://en.wikipedia.org/wiki/Comet_(programming)) request.

It's a simple HTTP/1.1 way of accomplishing what otherwise might require
fancier server- and client-side technologies, such as:

   * [WebSockets](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)
   * [HTTP/2 Server Push](https://en.wikipedia.org/wiki/HTTP/2_Server_Push)

Never-ending multipart streams seem popular in the IP camera space:

   * Dahua IP cameras provide a `multipart/x-mixed-replace` stream of events
     such as motion detection changes.
     ([spec](http://www.telecamera.ru/bitrix/components/bitrix/forum.interface/show_file.php?fid=1022477&action=download))
   * Hikvision IP cameras provide a `multipart/mixed` stream of events,
     as described
     [here](https://github.com/scottlamb/moonfire-playground/blob/4e6a786286272ee36f449d761740191c6e6a54fc/camera-motion/src/hikvision.rs#L33).
   * wikipedia [mentions](https://en.wikipedia.org/wiki/MIME#Mixed-Replace)
     that IP cameras use this format for MJPEG streams.

There's a big limitation, however, which is that browsers have fairly low
limits on the number of concurrent connections. In Chrome's case, six per
host.

I wrote this library as part of my own [Moonfire
NVR](https://github.com/scottlamb/moonfire-nvr) to implement live streams (a
multipart stream of `.mp4` media segments) and event streams. Due to the
limitation above, I'm likely going to use WebSockets instead.

## What is a multipart stream exactly?

A multipart response might look like this:

```
Content-Type: multipart/x-mixed-replace: boundary=B

--B
Content-Type: text/plain
Content-Length: 3

foo

--B
Content-Type: text/plain
Content-Length: 3

bar
```

and is typically paired with `Transfer-Encoding: chunked` or `Connection:
close` to allow sending a response whose size is infinite or not known until
the end.

I can't find a good specification. [This WHATWG
document](https://html.spec.whatwg.org/multipage/iana.html#multipart/x-mixed-replace)
describes `multipart/x-mixed-replace` loosely. It refers to [RFC
2046](https://tools.ietf.org/html/rfc2046) which defines multipart encodings
originally used for rich emails. I don't think these HTTP multipart streams
quite follow that RFC. My library currently requires:

   * Content type `multipart/...; boundary=...`. In MIME media type
     terminology, the `type` is multipart; the `subtype` may be anything.
     There should be exactly one parameter, `boundary`.
   * No preamble. That is, no arbitrary bytes to discard before the first
     part's boundary.
   * Zero or more newlines (to be precise: `\r\n` sequences) between each part
     and the next part's boundary.
   * A `Content-Length` line for each part. This is a much cleaner approach
     than producers attempting to choose a boundary that doesn't appear in any
     part and consumers having to search through the part body.
   * No extra `--` suffix on the final part's boundary. In practice, all the
     streams I've seen only end due to error, so this point has never come up.

Please open a github issue if you encounter a multipart stream which doesn't
match these requirements.

## What does this library do?

It reads from from a ReadableStream as defined in the
WHATWG Streams API ([spec](https://streams.spec.whatwg.org/),
[MDN](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream)) and
turns it into another ReadableStream of parts. Each part has a header and
body.

It works well with the WHATWG Fetch API
([spec](https://fetch.spec.whatwg.org/),
[MDN](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)).

Example:

```js
import multipartStream from `.../multipart-stream.js`;

async function processStream() {
  const response = await fetch(`http://example.com/stream`);
  const reader = multipartStream(
      response.headers.get('Content-Type'),
      response.body);
  while (true) {
    const {done, value} = reader.read();
    if (done) {
      break;
    }
    const {headers, body} = value;
    ...
  }
}
```

## Where does it work?

Modern web browsers. It's tested on recent
[Chrome](https://www.google.com/chrome/) and
[Firefox](https://www.mozilla.org/en-US/firefox/) via
[Karma](https://karma-runner.github.io/) and
[Jasmine](https://jasmine.github.io/).

It doesn't work on [node.js](https://nodejs.org/en/), which lacks support for
WHATWG Streams. I found a [github
project](https://github.com/nodejs/whatwg-stream) for support but it's just a
skeleton.

It uses the [npm](https://www.npmjs.com/) ecosystem for package management.

## Development notes

Contributions welcome. There's no CI setup (yet) but each commit should be
tested via:

```
$ npm install
$ npm test
$ npm run lint
```

Please follow the [Google Javascript style
guide](https://google.github.io/styleguide/jsguide.html).

## Author

Scott Lamb &lt;slamb@slamb.org>

## License

Your choice of MIT or Apache; see [LICENSE-MIT.txt](LICENSE-MIT.txt) or
[LICENSE-APACHE](LICENSE-APACHE.txt), respectively.
