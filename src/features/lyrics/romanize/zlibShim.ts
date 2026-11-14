/**
 * Stand-in for `zlibjs/bin/gunzip.min.js`, which kuromoji uses to unpack its
 * dictionary. The original is a closure-compiled script that writes to the
 * global `this` and breaks inside an ES module bundle; fflate does the same
 * synchronous gunzip. Wired in through `resolve.alias` in vite.config.ts.
 *
 * Some servers send `.gz` files with `Content-Encoding: gzip`, so the browser
 * has already unpacked them; data without the gzip magic bytes is returned
 * as it is.
 */
import { gunzipSync } from "fflate";

export const Zlib = {
  Gunzip: class {
    constructor(private readonly data: Uint8Array) {}
    decompress(): Uint8Array {
      const gzipped = this.data[0] === 0x1f && this.data[1] === 0x8b;
      return gzipped ? gunzipSync(this.data) : this.data;
    }
  },
};
