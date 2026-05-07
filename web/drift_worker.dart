// Worker entry point for drift on the web. Compiled to `drift_worker.js`
// via `dart compile js -O4 web/drift_worker.dart -o web/drift_worker.js`.
// drift_flutter's `driftDatabase(web: …)` fetches this script from the
// origin so the main isolate can offload SQL to a SharedWorker/Worker.
import 'package:drift/wasm.dart';

void main() {
  WasmDatabase.workerMainForOpen();
}
