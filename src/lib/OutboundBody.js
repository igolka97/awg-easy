'use strict';

const ServerError = require('./ServerError');

// Bound JSON transport overhead as well as the destination-list payload.
module.exports = function readOutboundBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0;
    request.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > 2 * 1024 * 1024) {
        chunks.length = 0;
        reject(new ServerError('The request exceeds 2 MiB. Nothing was applied.', 413));
        return;
      }
      chunks.push(chunk);
    });
    request.on('error', reject);
    request.on('aborted', () => reject(new ServerError('Request aborted.', 400)));
    request.on('end', () => {
      if (bytes > 2 * 1024 * 1024) return;
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new ServerError('Expected a JSON request.', 400));
      }
    });
  });
};
