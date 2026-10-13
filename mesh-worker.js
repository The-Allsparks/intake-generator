import { init, generate } from './geometry.js';

const engine = init((name) => new URL(name, import.meta.url).href);

self.onmessage = async (event) => {
  try {
    const result = generate(await engine, event.data.config);
    const transfer = [
      result.plate.vertices.buffer,
      result.plate.indices.buffer,
      result.plug.vertices.buffer,
      result.plug.indices.buffer
    ];
    self.postMessage({ id: event.data.id, result }, transfer);
  } catch (error) {
    self.postMessage({ id: event.data.id, error: error.message || String(error) });
  }
};
